import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { registrarEvento } from "../middlewares/auditoria.js";
import { registrarFalhaLogin, limparThrottleLogin } from "../middlewares/rateLimitLogin.js";

export async function login(req, res, next) {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ erro: "Email e senha sao obrigatorios" });
    }

    // Multi-tenant: include = tenant para emitir o JWT com o tenantId
    // do usuario. findFirst e necessario porque User.email virou
    // @@unique([tenantId, email]) na ETAPA 1.
    const user = await prisma.user.findFirst({
      where: { email },
      include: {
        tenant: {
          select: {
            id: true, nome: true, cnpj: true, ativo: true,
            motivoSuspensao: true, suspensaEm: true,
            plano: true, expiraEm: true,
            segmento: true,
          },
        },
      },
    });
    if (!user || !user.ativo) {
      registrarEvento({
        acao: "LOGIN_FALHO", modulo: "AUTH", sucesso: false,
        usuarioEmail: email, mensagem: user ? "Usuario inativo" : "Email nao encontrado", req,
        // tenantId: null para email inexistente (nao da pra adivinhar antes
        // de validar). Para usuario inativo, sabemos o tenant.
        tenantId: user?.tenantId || null,
      });
      await registrarFalhaLogin(req);
      return res.status(401).json({ erro: "Credenciais invalidas" });
    }

    // Bloqueio: tenant precisa existir e estar ativo. Se tenantId esta
    // null (deve so acontecer em legado pre-ETAPA-1), recusamos o login
    // ao inves de emitir um JWT sem tid. Mensagem generica para nao
    // vazar info da arquitetura.
    if (!user.tenantId || !user.tenant || !user.tenant.ativo) {
      registrarEvento({
        acao: "LOGIN_FALHO", modulo: "AUTH", sucesso: false,
        usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email,
        mensagem: !user.tenantId
          ? "Usuario sem tenantId atribuido"
          : !user.tenant
            ? "Tenant nao encontrado"
            : "Tenant inativo",
        req,
        tenantId: user.tenantId || null,
      });
      // ETAPA 11: se houve motivo de suspensao, retorna pro front exibir.
      const motivo = user.tenant?.motivoSuspensao || null;
      return res.status(403).json({
        erro: motivo
          ? `Conta suspensa: ${motivo}`
          : "Conta indisponivel. Contate o suporte.",
        motivoSuspensao: motivo,
        suspensaEm: user.tenant?.suspensaEm || null,
      });
    }

    // ETAPA 12: bloqueio por plano expirado. Super-admin pode renovar via
    // /admin-master. Mensagem clara pra cliente saber o que precisa.
    if (user.tenant.expiraEm && new Date(user.tenant.expiraEm) < new Date()) {
      const data = new Date(user.tenant.expiraEm).toLocaleDateString("pt-BR");
      registrarEvento({
        acao: "LOGIN_FALHO", modulo: "AUTH", sucesso: false,
        usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email,
        mensagem: `Plano ${user.tenant.plano} expirado em ${data}`,
        req, tenantId: user.tenantId,
      });
      return res.status(403).json({
        erro: `Plano ${user.tenant.plano} expirado em ${data}. Contate o suporte para renovar.`,
        planoExpirado: true,
        plano: user.tenant.plano,
        expiraEm: user.tenant.expiraEm,
      });
    }

    const ok = await bcrypt.compare(senha, user.senha);
    if (!ok) {
      registrarEvento({
        acao: "LOGIN_FALHO", modulo: "AUTH", sucesso: false,
        usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email,
        mensagem: "Senha incorreta", req,
        tenantId: user.tenantId,
      });
      await registrarFalhaLogin(req);
      return res.status(401).json({ erro: "Credenciais invalidas" });
    }

    // Login valido — zera o contador de tentativas (IP + email).
    await limparThrottleLogin(req);

    // JWT inclui `tid` (tenant id) que sera usado pelo middleware da
    // ETAPA 3 para injetar req.tenantId em toda request. `sa` (super
    // admin) e adicionado na ETAPA 10 para destravar o acesso a
    // /admin-master.
    const token = jwt.sign(
      {
        sub: user.id, role: user.role, nome: user.nome,
        tid: user.tenantId,
        sa: user.superAdmin === true,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    registrarEvento({
      acao: "LOGIN", modulo: "AUTH", sucesso: true,
      usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email, req,
      tenantId: user.tenantId,
    });

    res.json({
      token,
      user: {
        id: user.id, nome: user.nome, email: user.email,
        role: user.role, permissoes: user.permissoes,
        tenantId: user.tenantId,
        superAdmin: user.superAdmin === true,
        preferencias: user.preferencias || null,
      },
      empresa: {
        id: user.tenant.id,
        nome: user.tenant.nome,
        cnpj: user.tenant.cnpj,
        segmento: user.tenant.segmento,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: {
        id: true, nome: true, email: true, role: true, ativo: true, permissoes: true,
        superAdmin: true,
        preferencias: true,
        tenantId: true,
        tenant: { select: { id: true, nome: true, cnpj: true, ativo: true, segmento: true } },
      },
    });
    if (!user) return res.status(404).json({ erro: "Usuario nao encontrado" });
    const { tenant, ...rest } = user;
    res.json({
      ...rest,
      empresa: tenant ? { id: tenant.id, nome: tenant.nome, cnpj: tenant.cnpj, segmento: tenant.segmento } : null,
    });
  } catch (err) {
    next(err);
  }
}

// Sincroniza preferencias de UI (tema/aparencia, sidebar) entre dispositivos.
// O front faz merge otimista no localStorage e dispara PUT em paralelo —
// best-effort, falha de rede nao bloqueia a UI. Payload aceita qualquer JSON
// objeto; campos desconhecidos sao preservados (merge raso por chave de topo).
export async function salvarPreferencias(req, res, next) {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ erro: "Preferencias devem ser um objeto JSON" });
    }
    // Limite de tamanho para nao virar dump-zone. ~16KB cobre folgado
    // qualquer preferencia razoavel; alem disso, recusa.
    const tamanho = JSON.stringify(body).length;
    if (tamanho > 16384) {
      return res.status(413).json({ erro: "Preferencias excedem o limite de 16KB" });
    }

    const atual = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { preferencias: true },
    });
    if (!atual) return res.status(404).json({ erro: "Usuario nao encontrado" });

    const merged = { ...(atual.preferencias || {}), ...body };
    const updated = await prisma.user.update({
      where: { id: req.user.sub },
      data: { preferencias: merged },
      select: { preferencias: true },
    });
    res.json({ preferencias: updated.preferencias });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    registrarEvento({
      acao: "LOGOUT", modulo: "AUTH", sucesso: true,
      usuarioId: req.user?.sub || null,
      usuarioNome: req.user?.nome || null,
      req,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function trocarSenha(req, res, next) {
  try {
    const { senhaAtual, senhaNova } = req.body;
    if (!senhaAtual || !senhaNova) {
      return res.status(400).json({ erro: "Senha atual e nova sao obrigatorias" });
    }
    if (typeof senhaNova !== "string" || senhaNova.length < 6) {
      return res.status(400).json({ erro: "A nova senha deve ter pelo menos 6 caracteres" });
    }
    if (senhaAtual === senhaNova) {
      return res.status(400).json({ erro: "A nova senha deve ser diferente da atual" });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return res.status(404).json({ erro: "Usuario nao encontrado" });
    if (!user.ativo) return res.status(403).json({ erro: "Usuario inativo" });

    const ok = await bcrypt.compare(senhaAtual, user.senha);
    if (!ok) {
      registrarEvento({
        acao: "TROCA_SENHA", modulo: "AUTH", sucesso: false,
        usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email,
        mensagem: "Senha atual incorreta", req,
      });
      return res.status(401).json({ erro: "Senha atual incorreta" });
    }

    const hash = await bcrypt.hash(senhaNova, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { senha: hash },
    });

    registrarEvento({
      acao: "TROCA_SENHA", modulo: "AUTH", sucesso: true,
      usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email, req,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
