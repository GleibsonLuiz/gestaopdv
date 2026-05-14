import prisma from "../lib/prisma.js";

const TIPOS_VALIDOS = ["LIGACAO", "WHATSAPP", "VISITA", "EMAIL", "REUNIAO", "ANOTACAO"];

export async function listar(req, res, next) {
  try {
    const { clienteId } = req.params;
    const interacoes = await prisma.interacao.findMany({
      where: { clienteId },
      orderBy: { data: "desc" },
      include: {
        user: { select: { id: true, nome: true, role: true } },
      },
    });
    res.json(interacoes);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const { clienteId } = req.params;
    const { tipo, descricao, data } = req.body;

    if (!descricao || !String(descricao).trim()) {
      return res.status(400).json({ erro: "Descricao e obrigatoria" });
    }
    if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ erro: "Tipo de interacao invalido" });
    }

    const clienteExiste = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { id: true } });
    if (!clienteExiste) return res.status(404).json({ erro: "Cliente nao encontrado" });

    const interacao = await prisma.interacao.create({
      data: {
        clienteId,
        userId: req.user.id,
        tipo: tipo || "ANOTACAO",
        descricao: String(descricao).trim(),
        data: data ? new Date(data) : new Date(),
      },
      include: {
        user: { select: { id: true, nome: true, role: true } },
      },
    });

    res.status(201).json(interacao);
  } catch (err) {
    if (err.code === "P2003") return res.status(404).json({ erro: "Cliente ou usuario nao encontrado" });
    next(err);
  }
}

export async function excluir(req, res, next) {
  try {
    const { clienteId, id } = req.params;
    const interacao = await prisma.interacao.findFirst({
      where: { id, clienteId },
    });
    if (!interacao) return res.status(404).json({ erro: "Interacao nao encontrada" });

    await prisma.interacao.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Interacao nao encontrada" });
    next(err);
  }
}
