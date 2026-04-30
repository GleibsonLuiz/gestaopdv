import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";

export function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ erro: "Token nao fornecido" });
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ erro: "Token invalido ou expirado" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ erro: "Acesso negado" });
    }
    next();
  };
}

// Busca permissoes frescas do banco (mudancas refletem sem relogin) e bloqueia
// se o usuario nao possui o modulo. ADMIN passa sempre. FUNCIONARIOS so ADMIN.
export function requirePermissao(modulo) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ erro: "Nao autenticado" });
      if (req.user.role === "ADMIN") return next();
      if (modulo === "FUNCIONARIOS") {
        return res.status(403).json({ erro: "Apenas administradores" });
      }
      const u = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: { ativo: true, permissoes: true },
      });
      if (!u || !u.ativo) return res.status(403).json({ erro: "Usuario inativo" });
      if (!Array.isArray(u.permissoes) || !u.permissoes.includes(modulo)) {
        return res.status(403).json({ erro: `Sem permissao para o modulo ${modulo}` });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
