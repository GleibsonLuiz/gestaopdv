import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import { registrarEvento } from "../middlewares/auditoria.js";
import { permissoesPadrao } from "../lib/permissoes.js";

// ============ SIGNUP DE NOVO TENANT ============
//
// Endpoint publico (sem authRequired). Cria uma nova Empresa + admin User
// em transacao atomica. Retorna { token, user, empresa } no mesmo formato
// do /auth/login — frontend pode logar imediatamente apos signup.
//
// Validacoes:
//   - nomeEmpresa obrigatorio (3-120 chars)
//   - cnpj 14 digitos (so numero), opcional mas se preenchido valida formato
//   - nomeAdmin obrigatorio (3-120 chars)
//   - email valido + UNICO GLOBALMENTE (cross-tenant, decisao de produto)
//   - senha >= 6 chars
//
// Email unico globalmente: usamos findFirst({ email }) SEM tenant ja
// que estamos fora do tenantStorage neste endpoint publico. O extension
// nao filtra (store vazio).

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_CNPJ = /^\d{14}$/;

function lim(s, n) {
  return String(s).trim().slice(0, n);
}

export async function signup(req, res, next) {
  try {
    const { nomeEmpresa, cnpj, nomeAdmin, email, senha } = req.body || {};

    // ---------- Validacoes ----------
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

    // ---------- Checagem de duplicidade ----------
    // Email global unico (atravessa tenants). findFirst sem tenant ja que
    // este endpoint roda fora do tenantStorage.
    const emailExistente = await prisma.user.findFirst({ where: { email: emailLimpo } });
    if (emailExistente) {
      return res.status(409).json({ erro: "Email ja cadastrado" });
    }
    // CNPJ unico (se informado) — empresas.cnpj e @unique
    if (cnpjLimpo) {
      const cnpjExistente = await prisma.empresa.findUnique({ where: { cnpj: cnpjLimpo } });
      if (cnpjExistente) {
        return res.status(409).json({ erro: "CNPJ ja cadastrado" });
      }
    }

    // ---------- Transacao: Empresa + admin User ----------
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

    // ---------- Emite JWT (auto-login) ----------
    const token = jwt.sign(
      {
        sub: resultado.user.id,
        role: resultado.user.role,
        nome: resultado.user.nome,
        tid: resultado.empresa.id,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    registrarEvento({
      acao: "SIGNUP", modulo: "AUTH", sucesso: true,
      usuarioId: resultado.user.id,
      usuarioNome: resultado.user.nome,
      usuarioEmail: resultado.user.email,
      tenantId: resultado.empresa.id,
      mensagem: `Empresa "${resultado.empresa.nome}" criada via signup`,
      req,
    });

    res.status(201).json({
      token,
      user: {
        id: resultado.user.id,
        nome: resultado.user.nome,
        email: resultado.user.email,
        role: resultado.user.role,
        permissoes: resultado.user.permissoes,
        tenantId: resultado.user.tenantId,
      },
      empresa: {
        id: resultado.empresa.id,
        nome: resultado.empresa.nome,
        cnpj: resultado.empresa.cnpj,
      },
    });
  } catch (err) {
    // P2002 = unique constraint (race condition entre check e create)
    if (err.code === "P2002") {
      const campo = err.meta?.target?.includes("cnpj") ? "CNPJ" : "Email";
      return res.status(409).json({ erro: `${campo} ja cadastrado` });
    }
    next(err);
  }
}
