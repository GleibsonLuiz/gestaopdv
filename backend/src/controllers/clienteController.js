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
        { cpfCnpj: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: { nome: "asc" },
    });
    res.json(clientes);
  } catch (err) {
    next(err);
  }
}

export async function obter(req, res, next) {
  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id: req.params.id },
    });
    if (!cliente) return res.status(404).json({ erro: "Cliente nao encontrado" });
    res.json(cliente);
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
    const cliente = await prisma.cliente.create({
      data: {
        nome: String(nome).trim(),
        cpfCnpj: norm(req.body.cpfCnpj),
        email: norm(req.body.email),
        telefone: norm(req.body.telefone),
        endereco: norm(req.body.endereco),
        cidade: norm(req.body.cidade),
        estado: norm(req.body.estado),
        cep: norm(req.body.cep),
        observacoes: norm(req.body.observacoes),
      },
    });
    res.status(201).json(cliente);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ erro: "Ja existe um cliente com este CPF/CNPJ" });
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
    for (const campo of ["cpfCnpj", "email", "telefone", "endereco", "cidade", "estado", "cep", "observacoes"]) {
      if (req.body[campo] !== undefined) data[campo] = norm(req.body[campo]);
    }
    if (req.body.ativo !== undefined) data.ativo = !!req.body.ativo;

    const cliente = await prisma.cliente.update({
      where: { id: req.params.id },
      data,
    });
    res.json(cliente);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Cliente nao encontrado" });
    if (err.code === "P2002") return res.status(409).json({ erro: "Ja existe um cliente com este CPF/CNPJ" });
    next(err);
  }
}

export async function excluir(req, res, next) {
  try {
    await prisma.cliente.update({
      where: { id: req.params.id },
      data: { ativo: false },
    });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Cliente nao encontrado" });
    next(err);
  }
}
