import prisma, { prismaRaw } from "../lib/prisma.js";
import { registrarEvento } from "../middlewares/auditoria.js";

// ============ NOTIFICACOES BROADCAST ============
//
// Notificacoes sao globais (cross-tenant). Super-admin cria; todos os
// users do sistema veem o banner ate marcarem como lida. NotificacaoLida
// e por user (cada um marca o seu).

const TIPOS = new Set(["INFO", "AVISO", "MANUTENCAO", "NOVIDADE"]);

// ============ ROTAS DE USER NORMAL ============

// GET /notificacoes — retorna notificacoes ativas que o user atual ainda
// nao marcou como lida e que nao expiraram. Inclui:
//   - broadcasts (destinoTenantId IS NULL)
//   - mensagens direcionadas ao tenant do user (destinoTenantId = req.tenantId)
export async function minhas(req, res, next) {
  try {
    const userId = req.user.sub;
    const tenantId = req.tenantId;
    const agora = new Date();
    const linhas = await prismaRaw.notificacao.findMany({
      where: {
        ativa: true,
        OR: [{ expiraEm: null }, { expiraEm: { gt: agora } }],
        AND: [
          { OR: [{ destinoTenantId: null }, { destinoTenantId: tenantId }] },
          { NOT: { lidas: { some: { userId } } } },
        ],
      },
      select: {
        id: true, titulo: true, mensagem: true, tipo: true,
        createdAt: true, expiraEm: true, destinoTenantId: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ total: linhas.length, notificacoes: linhas });
  } catch (err) {
    next(err);
  }
}

// POST /notificacoes/:id/marcar-lida — registra leitura pelo user atual.
export async function marcarLida(req, res, next) {
  try {
    const userId = req.user.sub;
    const { id } = req.params;
    // upsert evita 409 se ja marcou antes
    await prismaRaw.notificacaoLida.upsert({
      where: { notificacaoId_userId: { notificacaoId: id, userId } },
      update: { lidaEm: new Date() },
      create: { notificacaoId: id, userId },
    });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "P2003") {
      return res.status(404).json({ erro: "Notificacao nao encontrada" });
    }
    next(err);
  }
}

// ============ ROTAS DE SUPER-ADMIN ============

// POST /admin-master/notificacoes — cria notificacao broadcast OU direcionada
// a um tenant especifico (campo destinoTenantId no body).
export async function criar(req, res, next) {
  try {
    const { titulo, mensagem, tipo, expiraEm, destinoTenantId } = req.body || {};
    if (!titulo || String(titulo).trim().length < 3) {
      return res.status(400).json({ erro: "Titulo obrigatorio (min 3 caracteres)" });
    }
    if (!mensagem || String(mensagem).trim().length < 3) {
      return res.status(400).json({ erro: "Mensagem obrigatoria (min 3 caracteres)" });
    }
    const tipoFinal = tipo && TIPOS.has(String(tipo).toUpperCase())
      ? String(tipo).toUpperCase() : "INFO";
    let expira = null;
    if (expiraEm) {
      const d = new Date(expiraEm);
      if (!isNaN(d.getTime())) expira = d;
    }

    // Valida tenant de destino se setado. Sem isso o usuario poderia mandar
    // notificacao pra qualquer string UUID e ela ficaria orfa.
    let destinoFinal = null;
    let destinoNome = null;
    if (destinoTenantId) {
      const empresa = await prismaRaw.empresa.findUnique({
        where: { id: String(destinoTenantId) },
        select: { id: true, nome: true },
      });
      if (!empresa) {
        return res.status(404).json({ erro: "Empresa de destino nao encontrada" });
      }
      destinoFinal = empresa.id;
      destinoNome = empresa.nome;
    }

    const n = await prismaRaw.notificacao.create({
      data: {
        titulo: String(titulo).trim().slice(0, 200),
        mensagem: String(mensagem).trim(),
        tipo: tipoFinal,
        expiraEm: expira,
        ativa: true,
        criadoPorId: req.user.sub,
        destinoTenantId: destinoFinal,
      },
    });

    registrarEvento({
      acao: destinoFinal ? "NOTIFICACAO_DIRECIONADA" : "NOTIFICACAO_CRIADA",
      modulo: "ADMIN_MASTER", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome,
      tenantId: destinoFinal,
      mensagem: destinoFinal
        ? `Mensagem "${n.titulo}" enviada para ${destinoNome}`
        : `Notificacao "${n.titulo}" enviada para todos os tenants`,
      req,
    });

    res.status(201).json(n);
  } catch (err) {
    next(err);
  }
}

// GET /admin-master/notificacoes — lista todas (super-admin), com contagem
// de leituras e info de destino (broadcast ou empresa especifica).
export async function listarTodas(req, res, next) {
  try {
    const linhas = await prismaRaw.notificacao.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        criadoPor:     { select: { id: true, nome: true } },
        destinoTenant: { select: { id: true, nome: true } },
        _count:        { select: { lidas: true } },
      },
    });
    // totalUsers e o universo possivel de leituras pra notificacao broadcast.
    // Pra notificacao direcionada, o universo e o numero de users do tenant.
    const totalUsersGlobal = await prismaRaw.user.count();
    const usersPorTenant = new Map();
    res.json({
      total: linhas.length,
      totalUsers: totalUsersGlobal,
      notificacoes: await Promise.all(linhas.map(async n => {
        let universo = totalUsersGlobal;
        if (n.destinoTenantId) {
          if (!usersPorTenant.has(n.destinoTenantId)) {
            const c = await prismaRaw.user.count({ where: { tenantId: n.destinoTenantId } });
            usersPorTenant.set(n.destinoTenantId, c);
          }
          universo = usersPorTenant.get(n.destinoTenantId);
        }
        return {
          id: n.id, titulo: n.titulo, mensagem: n.mensagem, tipo: n.tipo,
          ativa: n.ativa, expiraEm: n.expiraEm, createdAt: n.createdAt,
          criadoPor: n.criadoPor?.nome || "—",
          destinoTenantId: n.destinoTenantId,
          destinoNome: n.destinoTenant?.nome || null,
          universo,
          leituras: n._count?.lidas || 0,
        };
      })),
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /admin-master/notificacoes/:id — ativa/desativa.
export async function alterarAtiva(req, res, next) {
  try {
    const { id } = req.params;
    const { ativa } = req.body || {};
    if (typeof ativa !== "boolean") {
      return res.status(400).json({ erro: "Campo 'ativa' (boolean) obrigatorio" });
    }
    const n = await prismaRaw.notificacao.update({
      where: { id }, data: { ativa },
    }).catch(err => {
      if (err.code === "P2025") return null;
      throw err;
    });
    if (!n) return res.status(404).json({ erro: "Notificacao nao encontrada" });
    res.json({ ok: true, ativa });
  } catch (err) {
    next(err);
  }
}

// DELETE /admin-master/notificacoes/:id — apaga permanentemente.
export async function deletar(req, res, next) {
  try {
    const { id } = req.params;
    await prismaRaw.notificacao.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Notificacao nao encontrada" });
    next(err);
  }
}
