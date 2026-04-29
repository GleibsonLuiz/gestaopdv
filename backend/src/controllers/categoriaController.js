import prisma from "../lib/prisma.js";

export async function listar(_req, res, next) {
  try {
    const categorias = await prisma.categoria.findMany({
      orderBy: { nome: "asc" },
    });
    res.json(categorias);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const nome = req.body?.nome ? String(req.body.nome).trim() : "";
    if (!nome) return res.status(400).json({ erro: "Nome e obrigatorio" });
    const categoria = await prisma.categoria.create({ data: { nome } });
    res.status(201).json(categoria);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ erro: "Ja existe uma categoria com este nome" });
    }
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const nome = req.body?.nome ? String(req.body.nome).trim() : "";
    if (!nome) return res.status(400).json({ erro: "Nome nao pode ser vazio" });
    const categoria = await prisma.categoria.update({
      where: { id: req.params.id },
      data: { nome },
    });
    res.json(categoria);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Categoria nao encontrada" });
    if (err.code === "P2002") return res.status(409).json({ erro: "Ja existe uma categoria com este nome" });
    next(err);
  }
}

export async function excluir(req, res, next) {
  try {
    await prisma.categoria.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Categoria nao encontrada" });
    if (err.code === "P2003") return res.status(409).json({ erro: "Categoria possui produtos vinculados" });
    next(err);
  }
}
