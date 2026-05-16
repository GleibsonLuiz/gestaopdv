import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";
import { registrarEvento } from "../middlewares/auditoria.js";
import { permissoesPadrao } from "../lib/permissoes.js";

// ============ ADMIN MASTER ============
//
// Endpoints exclusivos do desenvolvedor do sistema (super-admin).
// Permite enxergar e gerenciar todas as empresas (tenants) do sistema.
//
// IMPORTANTE (multi-tenant):
// O Prisma Extension da ETAPA 3 FILTRA queries por tenantId. Aqui queremos
// o oposto: queries devem cobrir TODOS os tenants. Solucao: usamos
// $queryRaw (que ja bypassa o extension) para queries cross-tenant, ou
// passamos um tenantId arbitrario quando precisamos isolar. Estes
// endpoints rodam APENAS sob requireSuperAdmin — usuarios normais nem
// chegam aqui.

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_CNPJ = /^\d{14}$/;

function lim(s, n) {
  return String(s).trim().slice(0, n);
}

// GET /admin-master/empresas — lista todas as empresas com estatisticas.
export async function listarEmpresas(req, res, next) {
  try {
    // $queryRaw bypassa o extension. Cross-tenant intencional.
    const linhas = await prisma.$queryRaw`
      SELECT
        e.id,
        e.nome,
        e.cnpj,
        e.ativo,
        e."createdAt" AS criada_em,
        e."updatedAt" AS atualizada_em,
        COALESCE(u.qtd, 0)::int AS qtd_users,
        COALESCE(c.qtd, 0)::int AS qtd_clientes,
        COALESCE(p.qtd, 0)::int AS qtd_produtos,
        COALESCE(v.qtd, 0)::int AS qtd_vendas,
        COALESCE(v.total, 0)::float AS faturamento_total
      FROM empresas e
      LEFT JOIN (SELECT "tenantId", COUNT(*) AS qtd FROM users GROUP BY "tenantId") u ON u."tenantId" = e.id
      LEFT JOIN (SELECT "tenantId", COUNT(*) AS qtd FROM clientes GROUP BY "tenantId") c ON c."tenantId" = e.id
      LEFT JOIN (SELECT "tenantId", COUNT(*) AS qtd FROM produtos GROUP BY "tenantId") p ON p."tenantId" = e.id
      LEFT JOIN (
        SELECT "tenantId", COUNT(*) AS qtd, COALESCE(SUM(total), 0) AS total
        FROM vendas WHERE status = 'CONCLUIDA'
        GROUP BY "tenantId"
      ) v ON v."tenantId" = e.id
      ORDER BY e."createdAt" DESC
    `;

    const empresas = linhas.map(l => ({
      id: l.id,
      nome: l.nome,
      cnpj: l.cnpj,
      ativo: l.ativo,
      criadaEm: l.criada_em,
      atualizadaEm: l.atualizada_em,
      estatisticas: {
        usuarios: l.qtd_users,
        clientes: l.qtd_clientes,
        produtos: l.qtd_produtos,
        vendas: l.qtd_vendas,
        faturamentoTotal: l.faturamento_total,
      },
    }));

    res.json({ total: empresas.length, empresas });
  } catch (err) {
    next(err);
  }
}

// GET /admin-master/estatisticas — totais agregados do sistema inteiro.
export async function estatisticasGlobais(req, res, next) {
  try {
    const [agg] = await prisma.$queryRaw`
      SELECT
        (SELECT COUNT(*)::int FROM empresas) AS total_empresas,
        (SELECT COUNT(*)::int FROM empresas WHERE ativo = true) AS empresas_ativas,
        (SELECT COUNT(*)::int FROM users) AS total_users,
        (SELECT COUNT(*)::int FROM users WHERE "superAdmin" = true) AS super_admins,
        (SELECT COUNT(*)::int FROM clientes) AS total_clientes,
        (SELECT COUNT(*)::int FROM produtos) AS total_produtos,
        (SELECT COUNT(*)::int FROM vendas WHERE status = 'CONCLUIDA') AS total_vendas,
        (SELECT COALESCE(SUM(total), 0)::float FROM vendas WHERE status = 'CONCLUIDA') AS faturamento_geral
    `;

    res.json({
      totalEmpresas: agg.total_empresas,
      empresasAtivas: agg.empresas_ativas,
      totalUsers: agg.total_users,
      superAdmins: agg.super_admins,
      totalClientes: agg.total_clientes,
      totalProdutos: agg.total_produtos,
      totalVendas: agg.total_vendas,
      faturamentoGeral: agg.faturamento_geral,
    });
  } catch (err) {
    next(err);
  }
}

// POST /admin-master/empresas — cria nova empresa + admin inicial.
// Mesma logica do antigo signup publico, agora exclusivo do super-admin.
export async function criarEmpresa(req, res, next) {
  try {
    const { nomeEmpresa, cnpj, nomeAdmin, email, senha } = req.body || {};

    if (!nomeEmpresa || String(nomeEmpresa).trim().length < 3) {
      return res.status(400).json({ erro: "Nome da empresa e obrigatorio (min 3 caracteres)" });
    }
    if (String(nomeEmpresa).trim().length > 120) {
      return res.status(400).json({ erro: "Nome da empresa muito longo (max 120)" });
    }
    let cnpjLimpo = null;
    if (cnpj) {
      cnpjLimpo = String(cnpj).replace(/\D/g, "");
      if (!REGEX_CNPJ.test(cnpjLimpo)) {
        return res.status(400).json({ erro: "CNPJ invalido (use 14 digitos)" });
      }
    }
    if (!nomeAdmin || String(nomeAdmin).trim().length < 3) {
      return res.status(400).json({ erro: "Nome do administrador e obrigatorio (min 3 caracteres)" });
    }
    if (!email || !REGEX_EMAIL.test(String(email).trim().toLowerCase())) {
      return res.status(400).json({ erro: "Email invalido" });
    }
    if (!senha || typeof senha !== "string" || senha.length < 6) {
      return res.status(400).json({ erro: "Senha deve ter pelo menos 6 caracteres" });
    }
    const emailLimpo = String(email).trim().toLowerCase();

    const emailExistente = await prisma.user.findFirst({ where: { email: emailLimpo } });
    if (emailExistente) {
      return res.status(409).json({ erro: "Email ja cadastrado" });
    }
    if (cnpjLimpo) {
      const cnpjExistente = await prisma.empresa.findUnique({ where: { cnpj: cnpjLimpo } });
      if (cnpjExistente) {
        return res.status(409).json({ erro: "CNPJ ja cadastrado" });
      }
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const resultado = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({
        data: {
          nome: lim(nomeEmpresa, 120),
          cnpj: cnpjLimpo,
          ativo: true,
        },
      });
      const user = await tx.user.create({
        data: {
          nome: lim(nomeAdmin, 120),
          email: emailLimpo,
          senha: senhaHash,
          role: "ADMIN",
          ativo: true,
          permissoes: permissoesPadrao("ADMIN"),
          tenantId: empresa.id,
        },
      });
      return { empresa, user };
    });

    registrarEvento({
      acao: "EMPRESA_CRIADA", modulo: "ADMIN_MASTER", sucesso: true,
      usuarioId: req.user.sub,
      usuarioNome: req.user.nome,
      tenantId: resultado.empresa.id,
      mensagem: `Empresa "${resultado.empresa.nome}" criada pelo super-admin (${req.user.nome})`,
      req,
    });

    res.status(201).json({
      empresa: {
        id: resultado.empresa.id,
        nome: resultado.empresa.nome,
        cnpj: resultado.empresa.cnpj,
        ativo: resultado.empresa.ativo,
        criadaEm: resultado.empresa.createdAt,
      },
      admin: {
        id: resultado.user.id,
        nome: resultado.user.nome,
        email: resultado.user.email,
      },
    });
  } catch (err) {
    if (err.code === "P2002") {
      const campo = err.meta?.target?.includes("cnpj") ? "CNPJ" : "Email";
      return res.status(409).json({ erro: `${campo} ja cadastrado` });
    }
    next(err);
  }
}

// PATCH /admin-master/empresas/:id/status — ativa/desativa empresa.
// Desativada nao consegue mais logar.
export async function alterarStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { ativo } = req.body || {};
    if (typeof ativo !== "boolean") {
      return res.status(400).json({ erro: "Campo 'ativo' (boolean) obrigatorio" });
    }
    // Evita atualizar via extension (que injetaria filtro de tenant
    // contra-producente). Usamos $executeRaw direto.
    const linhas = await prisma.$executeRaw`
      UPDATE empresas SET ativo = ${ativo}, "updatedAt" = NOW() WHERE id = ${id}
    `;
    if (linhas === 0) {
      return res.status(404).json({ erro: "Empresa nao encontrada" });
    }

    registrarEvento({
      acao: ativo ? "EMPRESA_ATIVADA" : "EMPRESA_DESATIVADA",
      modulo: "ADMIN_MASTER", sucesso: true,
      usuarioId: req.user.sub,
      usuarioNome: req.user.nome,
      tenantId: id,
      mensagem: `Empresa ${ativo ? "ATIVADA" : "DESATIVADA"} pelo super-admin`,
      req,
    });

    res.json({ ok: true, ativo });
  } catch (err) {
    next(err);
  }
}
