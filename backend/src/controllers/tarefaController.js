import prisma from "../lib/prisma.js";

const PRIORIDADES = ["BAIXA", "MEDIA", "ALTA", "URGENTE"];
const STATUS = ["ABERTA", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"];

const INCLUDE_DETALHE = {
  cliente: { select: { id: true, nome: true } },
  responsavel: { select: { id: true, nome: true, role: true } },
  criadoPor: { select: { id: true, nome: true, role: true } },
};

function norm(v) {
  return v === undefined || v === null || v === "" ? null : v;
}

export async function listar(req, res, next) {
  try {
    const { status, prioridade, responsavelId, clienteId, minhas, atrasadas } = req.query;

    const where = {};
    if (status) where.status = status;
    else if (atrasadas === "true") {
      where.status = { in: ["ABERTA", "EM_ANDAMENTO"] };
      where.prazo = { lt: new Date() };
    } else {
      // Por padrão, não retorna CONCLUIDA/CANCELADA a menos que filtro explícito
    }
    if (prioridade) where.prioridade = prioridade;
    if (responsavelId) where.responsavelId = responsavelId;
    if (clienteId) where.clienteId = clienteId;
    if (minhas === "true") where.responsavelId = req.user.id;

    const tarefas = await prisma.tarefa.findMany({
      where,
      include: INCLUDE_DETALHE,
      orderBy: [
        { status: "asc" },
        { prazo: "asc" },
        { prioridade: "desc" },
      ],
    });

    res.json(tarefas);
  } catch (err) {
    next(err);
  }
}

export async function obter(req, res, next) {
  try {
    const tarefa = await prisma.tarefa.findUnique({
      where: { id: req.params.id },
      include: INCLUDE_DETALHE,
    });
    if (!tarefa) return res.status(404).json({ erro: "Tarefa nao encontrada" });
    res.json(tarefa);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const { titulo, descricao, prazo, prioridade, responsavelId, clienteId } = req.body;

    if (!titulo || !String(titulo).trim()) {
      return res.status(400).json({ erro: "Titulo e obrigatorio" });
    }
    if (prioridade && !PRIORIDADES.includes(prioridade)) {
      return res.status(400).json({ erro: "Prioridade invalida" });
    }

    const tarefa = await prisma.tarefa.create({
      data: {
        titulo: String(titulo).trim(),
        descricao: norm(descricao),
        prazo: prazo ? new Date(prazo) : null,
        prioridade: prioridade || "MEDIA",
        responsavelId: norm(responsavelId),
        clienteId: norm(clienteId),
        criadoPorId: req.user.id,
      },
      include: INCLUDE_DETALHE,
    });

    res.status(201).json(tarefa);
  } catch (err) {
    if (err.code === "P2003") return res.status(400).json({ erro: "Cliente ou responsavel nao encontrado" });
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const { titulo, descricao, prazo, prioridade, status, responsavelId, clienteId } = req.body;

    const tarefa = await prisma.tarefa.findUnique({ where: { id: req.params.id } });
    if (!tarefa) return res.status(404).json({ erro: "Tarefa nao encontrada" });
    if (tarefa.status === "CONCLUIDA" || tarefa.status === "CANCELADA") {
      return res.status(400).json({ erro: "Nao e possivel editar uma tarefa ja concluida ou cancelada" });
    }

    if (prioridade && !PRIORIDADES.includes(prioridade)) {
      return res.status(400).json({ erro: "Prioridade invalida" });
    }
    if (status && !STATUS.includes(status)) {
      return res.status(400).json({ erro: "Status invalido" });
    }

    const data = {};
    if (titulo !== undefined) {
      const t = String(titulo).trim();
      if (!t) return res.status(400).json({ erro: "Titulo nao pode ser vazio" });
      data.titulo = t;
    }
    if (descricao !== undefined) data.descricao = norm(descricao);
    if (prazo !== undefined) data.prazo = prazo ? new Date(prazo) : null;
    if (prioridade !== undefined) data.prioridade = prioridade;
    if (responsavelId !== undefined) data.responsavelId = norm(responsavelId);
    if (clienteId !== undefined) data.clienteId = norm(clienteId);
    if (status !== undefined) {
      data.status = status;
      if (status === "CONCLUIDA") data.concluidaEm = new Date();
      if (status === "CANCELADA") data.concluidaEm = null;
    }

    const atualizada = await prisma.tarefa.update({
      where: { id: req.params.id },
      data,
      include: INCLUDE_DETALHE,
    });

    res.json(atualizada);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Tarefa nao encontrada" });
    next(err);
  }
}

export async function concluir(req, res, next) {
  try {
    const tarefa = await prisma.tarefa.findUnique({ where: { id: req.params.id } });
    if (!tarefa) return res.status(404).json({ erro: "Tarefa nao encontrada" });
    if (tarefa.status === "CONCLUIDA") {
      return res.status(400).json({ erro: "Tarefa ja concluida" });
    }

    const atualizada = await prisma.tarefa.update({
      where: { id: req.params.id },
      data: { status: "CONCLUIDA", concluidaEm: new Date() },
      include: INCLUDE_DETALHE,
    });
    res.json(atualizada);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Tarefa nao encontrada" });
    next(err);
  }
}

export async function reabrir(req, res, next) {
  try {
    const tarefa = await prisma.tarefa.findUnique({ where: { id: req.params.id } });
    if (!tarefa) return res.status(404).json({ erro: "Tarefa nao encontrada" });
    if (tarefa.status !== "CONCLUIDA" && tarefa.status !== "CANCELADA") {
      return res.status(400).json({ erro: "So e possivel reabrir tarefas concluidas ou canceladas" });
    }

    const atualizada = await prisma.tarefa.update({
      where: { id: req.params.id },
      data: { status: "ABERTA", concluidaEm: null },
      include: INCLUDE_DETALHE,
    });
    res.json(atualizada);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Tarefa nao encontrada" });
    next(err);
  }
}

export async function excluir(req, res, next) {
  try {
    await prisma.tarefa.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Tarefa nao encontrada" });
    next(err);
  }
}
