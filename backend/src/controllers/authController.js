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

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.ativo) {
      registrarEvento({
        acao: "LOGIN_FALHO", modulo: "AUTH", sucesso: false,
        usuarioEmail: email, mensagem: user ? "Usuario inativo" : "Email nao encontrado", req,
      });
      return res.status(401).json({ erro: "Credenciais invalidas" });
    }

    const ok = await bcrypt.compare(senha, user.senha);
    if (!ok) {
      registrarEvento({
        acao: "LOGIN_FALHO", modulo: "AUTH", sucesso: false,
        usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email,
        mensagem: "Senha incorreta", req,
      });
      return res.status(401).json({ erro: "Credenciais invalidas" });
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role, nome: user.nome },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    registrarEvento({
      acao: "LOGIN", modulo: "AUTH", sucesso: true,
      usuarioId: user.id, usuarioNome: user.nome, usuarioEmail: user.email, req,
    });

    res.json({
      token,
      user: {
        id: user.id, nome: user.nome, email: user.email,
        role: user.role, permissoes: user.permissoes,
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
      select: { id: true, nome: true, email: true, role: true, ativo: true, permissoes: true },
    });
    if (!user) return res.status(404).json({ erro: "Usuario nao encontrado" });
    res.json(user);
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
