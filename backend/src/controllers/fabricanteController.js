import prisma from "../lib/prisma.js";

export async function listar(_req, res, next) {
  try {
    const fabricantes = await prisma.fabricante.findMany({
      orderBy: { nome: "asc" },
    });
    res.json(fabricantes);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const nome = req.body?.nome ? String(req.body.nome).trim() : "";
    if (!nome) return res.status(400).json({ erro: "Nome e obrigatorio" });
    const fabricante = await prisma.fabricante.create({ data: { nome } });
    res.status(201).json(fabricante);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ erro: "Ja existe um fabricante com este nome" });
    }
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const nome = req.body?.nome ? String(req.body.nome).trim() : "";
    if (!nome) return res.status(400).json({ erro: "Nome nao pode ser vazio" });
    const fabricante = await prisma.fabricante.update({
      where: { id: req.params.id },
      data: { nome },
    });
    res.json(fabricante);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Fabricante nao encontrado" });
    if (err.code === "P2002") return res.status(409).json({ erro: "Ja existe um fabricante com este nome" });
    next(err);
  }
}

export async function excluir(req, res, next) {
  try {
    await prisma.fabricante.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Fabricante nao encontrado" });
    if (err.code === "P2003") return res.status(409).json({ erro: "Fabricante possui produtos vinculados" });
    next(err);
  }
}
