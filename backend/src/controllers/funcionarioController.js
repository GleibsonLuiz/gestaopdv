import bcrypt from "bcryptjs";
import prisma from "../lib/prisma.js";
import { sanitizarPermissoes, permissoesPadrao, IDS_MODULOS } from "../lib/permissoes.js";

const ROLES_VALIDAS = new Set(["ADMIN", "GERENTE", "VENDEDOR"]);

const SELECT_PUBLICO = {
  id: true,
  nome: true,
  email: true,
  role: true,
  ativo: true,
  permissoes: true,
  createdAt: true,
  updatedAt: true,
};

export async function listar(req, res, next) {
  try {
    const { search, ativo, role } = req.query;
    const where = {};
    if (ativo === "true") where.ativo = true;
    if (ativo === "false") where.ativo = false;
    if (role && ROLES_VALIDAS.has(role)) where.role = role;
    if (search) {
      where.OR = [
        { nome: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    const funcionarios = await prisma.user.findMany({
      where,
      select: SELECT_PUBLICO,
      orderBy: { nome: "asc" },
    });
    res.json(funcionarios);
  } catch (err) {
    next(err);
  }
}

export async function obter(req, res, next) {
  try {
    const funcionario = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: SELECT_PUBLICO,
    });
    if (!funcionario) return res.status(404).json({ erro: "Funcionario nao encontrado" });
    res.json(funcionario);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const nome = req.body?.nome ? String(req.body.nome).trim() : "";
    const email = req.body?.email ? String(req.body.email).trim().toLowerCase() : "";
    const senha = req.body?.senha ? String(req.body.senha) : "";
    const role = req.body?.role ? String(req.body.role).trim().toUpperCase() : "VENDEDOR";

    if (!nome) return res.status(400).json({ erro: "Nome e obrigatorio" });
    if (!email) return res.status(400).json({ erro: "Email e obrigatorio" });
    if (!senha) return res.status(400).json({ erro: "Senha e obrigatoria" });
    if (senha.length < 6) return res.status(400).json({ erro: "Senha deve ter ao menos 6 caracteres" });
    if (!ROLES_VALIDAS.has(role)) {
      return res.status(400).json({ erro: "Role invalida (use ADMIN, GERENTE ou VENDEDOR)" });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    // ADMIN sempre recebe todos os modulos. Para outros, usa o que veio no body
    // ou cai no padrao por role.
    let permissoes;
    if (role === "ADMIN") {
      permissoes = [...IDS_MODULOS];
    } else if (Array.isArray(req.body.permissoes)) {
      permissoes = sanitizarPermissoes(req.body.permissoes);
    } else {
      permissoes = permissoesPadrao(role);
    }

    const funcionario = await prisma.user.create({
      data: {
        nome,
        email,
        senha: senhaHash,
        role,
        ativo: req.body.ativo === undefined ? true : !!req.body.ativo,
        permissoes,
      },
      select: SELECT_PUBLICO,
    });
    res.status(201).json(funcionario);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ erro: "Ja existe um funcionario com este email" });
    }
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const id = req.params.id;
    const data = {};

    if (req.body.nome !== undefined) {
      const n = String(req.body.nome).trim();
      if (!n) return res.status(400).json({ erro: "Nome nao pode ser vazio" });
      data.nome = n;
    }
    if (req.body.email !== undefined) {
      const e = String(req.body.email).trim().toLowerCase();
      if (!e) return res.status(400).json({ erro: "Email nao pode ser vazio" });
      data.email = e;
    }
    if (req.body.role !== undefined) {
      const r = String(req.body.role).trim().toUpperCase();
      if (!ROLES_VALIDAS.has(r)) {
        return res.status(400).json({ erro: "Role invalida" });
      }
      // Impede o usuario logado de rebaixar a si mesmo de ADMIN
      if (id === req.user.sub && req.user.role === "ADMIN" && r !== "ADMIN") {
        return res.status(400).json({ erro: "Voce nao pode rebaixar seu proprio acesso de ADMIN" });
      }
      data.role = r;
    }
    if (req.body.ativo !== undefined) {
      // Impede desativar a si mesmo
      if (id === req.user.sub && !req.body.ativo) {
        return res.status(400).json({ erro: "Voce nao pode desativar a si mesmo" });
      }
      data.ativo = !!req.body.ativo;
    }
    if (req.body.senha !== undefined && req.body.senha !== "") {
      const senha = String(req.body.senha);
      if (senha.length < 6) return res.status(400).json({ erro: "Senha deve ter ao menos 6 caracteres" });
      data.senha = await bcrypt.hash(senha, 10);
    }
    if (req.body.permissoes !== undefined) {
      data.permissoes = sanitizarPermissoes(req.body.permissoes);
    }
    // Se virou ADMIN, recebe todas as permissoes (defesa contra "trancar fora").
    if (data.role === "ADMIN") {
      data.permissoes = [...IDS_MODULOS];
    }

    // Se mudou role para nao-ADMIN ou desativou, garantir que ainda existe outro ADMIN ativo
    if ((data.role && data.role !== "ADMIN") || data.ativo === false) {
      const alvo = await prisma.user.findUnique({ where: { id }, select: { role: true, ativo: true } });
      if (!alvo) return res.status(404).json({ erro: "Funcionario nao encontrado" });
      const eraAdminAtivo = alvo.role === "ADMIN" && alvo.ativo;
      if (eraAdminAtivo) {
        const outrosAdmins = await prisma.user.count({
          where: { role: "ADMIN", ativo: true, id: { not: id } },
        });
        if (outrosAdmins === 0) {
          return res.status(400).json({ erro: "Nao e permitido remover o ultimo ADMIN ativo" });
        }
      }
    }

    const funcionario = await prisma.user.update({
      where: { id },
      data,
      select: SELECT_PUBLICO,
    });
    res.json(funcionario);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Funcionario nao encontrado" });
    if (err.code === "P2002") return res.status(409).json({ erro: "Ja existe um funcionario com este email" });
    next(err);
  }
}

export async function excluir(req, res, next) {
  try {
    const id = req.params.id;

    if (id === req.user.sub) {
      return res.status(400).json({ erro: "Voce nao pode excluir a si mesmo" });
    }

    const alvo = await prisma.user.findUnique({ where: { id }, select: { role: true, ativo: true } });
    if (!alvo) return res.status(404).json({ erro: "Funcionario nao encontrado" });

    if (alvo.role === "ADMIN" && alvo.ativo) {
      const outrosAdmins = await prisma.user.count({
        where: { role: "ADMIN", ativo: true, id: { not: id } },
      });
      if (outrosAdmins === 0) {
        return res.status(400).json({ erro: "Nao e permitido remover o ultimo ADMIN ativo" });
      }
    }

    await prisma.user.update({
      where: { id },
      data: { ativo: false },
    });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Funcionario nao encontrado" });
    next(err);
  }
}
