import prisma from "../lib/prisma.js";

const norm = (v) => (v === undefined || v === null || v === "" ? null : v);

export async function listar(req, res, next) {
  try {
    const { search, ativo } = req.query;
    const where = {};
    if (ativo === "true") where.ativo = true;
    if (ativo === "false") where.ativo = false;
    if (search) {
      where.OR = [
        { nome: { contains: search, mode: "insensitive" } },
        { cnpj: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    const fornecedores = await prisma.fornecedor.findMany({
      where,
      orderBy: { nome: "asc" },
    });
    res.json(fornecedores);
  } catch (err) {
    next(err);
  }
}

export async function obter(req, res, next) {
  try {
    const fornecedor = await prisma.fornecedor.findUnique({
      where: { id: req.params.id },
    });
    if (!fornecedor) return res.status(404).json({ erro: "Fornecedor nao encontrado" });
    res.json(fornecedor);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const { nome } = req.body;
    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ erro: "Nome e obrigatorio" });
    }
    const fornecedor = await prisma.fornecedor.create({
      data: {
        nome: String(nome).trim(),
        cnpj: norm(req.body.cnpj),
        email: norm(req.body.email),
        telefone: norm(req.body.telefone),
        endereco: norm(req.body.endereco),
        cidade: norm(req.body.cidade),
        estado: norm(req.body.estado),
        cep: norm(req.body.cep),
      },
    });
    res.status(201).json(fornecedor);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ erro: "Ja existe um fornecedor com este CNPJ" });
    }
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const data = {};
    if (req.body.nome !== undefined) {
      const n = String(req.body.nome).trim();
      if (!n) return res.status(400).json({ erro: "Nome nao pode ser vazio" });
      data.nome = n;
    }
    for (const campo of ["cnpj", "email", "telefone", "endereco", "cidade", "estado", "cep"]) {
      if (req.body[campo] !== undefined) data[campo] = norm(req.body[campo]);
    }
    if (req.body.ativo !== undefined) data.ativo = !!req.body.ativo;

    const fornecedor = await prisma.fornecedor.update({
      where: { id: req.params.id },
      data,
    });
    res.json(fornecedor);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Fornecedor nao encontrado" });
    if (err.code === "P2002") return res.status(409).json({ erro: "Ja existe um fornecedor com este CNPJ" });
    next(err);
  }
}

export async function excluir(req, res, next) {
  try {
    await prisma.fornecedor.update({
      where: { id: req.params.id },
      data: { ativo: false },
    });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Fornecedor nao encontrado" });
    next(err);
  }
}
