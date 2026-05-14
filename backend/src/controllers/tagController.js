import prisma from "../lib/prisma.js";

// Cores sugeridas para tags (paleta do tema)
const COR_PADRAO = "#4f8ef7";

function normalizarNome(nome) {
  return String(nome || "").trim().toUpperCase();
}

// ============ CRUD DE TAGS ============

export async function listar(req, res, next) {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { nome: "asc" },
      include: { _count: { select: { clientes: true } } },
    });
    res.json(
      tags.map((t) => ({
        id: t.id,
        nome: t.nome,
        cor: t.cor,
        createdAt: t.createdAt,
        totalClientes: t._count.clientes,
      })),
    );
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const nome = normalizarNome(req.body.nome);
    if (!nome) return res.status(400).json({ erro: "Nome da tag e obrigatorio" });
    if (nome.length > 30) return res.status(400).json({ erro: "Nome muito longo (max 30)" });

    const tag = await prisma.tag.create({
      data: { nome, cor: req.body.cor || COR_PADRAO },
    });
    res.status(201).json(tag);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ erro: "Tag ja existe" });
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const data = {};
    if (req.body.nome !== undefined) {
      const n = normalizarNome(req.body.nome);
      if (!n) return res.status(400).json({ erro: "Nome nao pode ser vazio" });
      data.nome = n;
    }
    if (req.body.cor !== undefined) data.cor = req.body.cor || COR_PADRAO;

    const tag = await prisma.tag.update({
      where: { id: req.params.id },
      data,
    });
    res.json(tag);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Tag nao encontrada" });
    if (err.code === "P2002") return res.status(409).json({ erro: "Tag ja existe" });
    next(err);
  }
}

export async function excluir(req, res, next) {
  try {
    await prisma.tag.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Tag nao encontrada" });
    next(err);
  }
}

// ============ ATRIBUIR / REMOVER TAG DE CLIENTE ============

export async function atribuirAoCliente(req, res, next) {
  try {
    const { clienteId, tagId } = req.params;
    await prisma.clienteTag.upsert({
      where: { clienteId_tagId: { clienteId, tagId } },
      create: { clienteId, tagId },
      update: {},
    });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2003") return res.status(404).json({ erro: "Cliente ou tag nao encontrado" });
    next(err);
  }
}

export async function removerDoCliente(req, res, next) {
  try {
    const { clienteId, tagId } = req.params;
    await prisma.clienteTag.delete({
      where: { clienteId_tagId: { clienteId, tagId } },
    });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(204).end();
    next(err);
  }
}
