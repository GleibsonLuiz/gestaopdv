import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { registrarEvento } from "../middlewares/auditoria.js";

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

    const ok = await bcrypt.compare(senha, user.senha);
    if (!ok) {
      registrarEvento({
        acao: "LOGIN_FALHO", modulo: "AUTH", sucesso: false,
        usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email,
        mensagem: "Senha incorreta", req,
        tenantId: user.tenantId,
      });
      return res.status(401).json({ erro: "Credenciais invalidas" });
    }

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
      },
      empresa: {
        id: user.tenant.id,
        nome: user.tenant.nome,
        cnpj: user.tenant.cnpj,
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
        tenantId: true,
        tenant: { select: { id: true, nome: true, cnpj: true, ativo: true } },
      },
    });
    if (!user) return res.status(404).json({ erro: "Usuario nao encontrado" });
    const { tenant, ...rest } = user;
    res.json({
      ...rest,
      empresa: tenant ? { id: tenant.id, nome: tenant.nome, cnpj: tenant.cnpj } : null,
    });
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

    const hash = await bcrypt.hash(senhaNova, 10);
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
