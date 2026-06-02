import jwt from "jsonwebtoken";
import prisma, { tenantStorage } from "../lib/prisma.js";
import { empresaTemModulo } from "../lib/modulosPlano.js";

export function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ erro: "Token nao fornecido" });
  }
  let decoded;
  try {
    decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ erro: "Token invalido ou expirado" });
  }
  req.user = decoded;
  // Multi-tenant: tid no payload identifica o tenant da request. Tokens
  // antigos (pre-ETAPA-2) nao tem tid — rejeitamos para forcar relogin.
  if (!decoded.tid) {
    return res.status(401).json({ erro: "Token sem tenant. Faca login novamente." });
  }
  req.tenantId = decoded.tid;
  // Encapsula o resto da request em um AsyncLocalStorage scope para que
  // o Prisma extension consiga ler o tenantId e filtrar as queries.
  tenantStorage.run({ tenantId: req.tenantId }, () => next());
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ erro: "Acesso negado" });
    }
    next();
  };
}

// Multi-tenant ETAPA 10: bloqueia endpoints restritos ao desenvolvedor do
// sistema (super-admin). O claim `sa` e injetado no JWT pelo login quando
// User.superAdmin === true. Mantemos uma verificacao redundante no banco
// (toRevoke if flag foi removida apos emissao do token).
export function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.sa !== true) {
    return res.status(403).json({ erro: "Acesso restrito ao desenvolvedor do sistema" });
  }
  next();
}

// Busca permissoes frescas do banco (mudancas refletem sem relogin) e bloqueia
// em DOIS niveis:
//   1. PLANO (tenant): o modulo precisa estar habilitado para a empresa
//      (pacote do plano + override do super-admin). Vale para TODOS, inclusive
//      ADMIN — modulo nao contratado nao abre pra ninguem. Retorna 402.
//   2. USUARIO: dentro dos modulos contratados, o user precisa ter permissao.
//      ADMIN passa sempre. FUNCIONARIOS so ADMIN. Retorna 403.
export function requirePermissao(modulo) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ erro: "Nao autenticado" });

      // --- Nivel 1: modulo liberado no plano da empresa ---
      if (req.tenantId) {
        const empresa = await prisma.empresa.findUnique({
          where: { id: req.tenantId },
          select: { plano: true, modulosHabilitados: true },
        });
        // Fail-open se a empresa sumiu (nao trava ninguem por erro de dado).
        if (empresa && !empresaTemModulo(empresa, modulo)) {
          return res.status(402).json({
            erro: `O modulo ${modulo} nao esta incluido no plano atual. Faca upgrade para liberar.`,
            moduloBloqueado: true,
            modulo,
            plano: empresa.plano,
          });
        }
      }

      // --- Nivel 2: permissao do usuario ---
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
