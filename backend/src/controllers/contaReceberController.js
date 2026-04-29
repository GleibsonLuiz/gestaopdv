import prisma from "../lib/prisma.js";

const INCLUDE = {
  cliente: { select: { id: true, nome: true, cpfCnpj: true } },
};

function toNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function listar(req, res, next) {
  try {
    const { search, status, clienteId, dataInicio, dataFim, vencidas } = req.query;
    const where = {};
    if (status) where.status = status;
    if (clienteId) where.clienteId = clienteId;
    if (search) {
      where.OR = [
        { descricao: { contains: search, mode: "insensitive" } },
        { observacoes: { contains: search, mode: "insensitive" } },
      ];
    }
    if (dataInicio || dataFim) {
      where.vencimento = {};
      if (dataInicio) where.vencimento.gte = new Date(dataInicio);
      if (dataFim) where.vencimento.lte = new Date(dataFim + "T23:59:59.999Z");
    }
    if (vencidas === "true") {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      where.AND = [
        { status: { in: ["PENDENTE", "ATRASADA"] } },
        { vencimento: { lt: hoje } },
      ];
    }

    const contas = await prisma.contaReceber.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ status: "asc" }, { vencimento: "asc" }],
    });
    res.json(contas);
  } catch (err) {
    next(err);
  }
}

export async function obter(req, res, next) {
  try {
    const conta = await prisma.contaReceber.findUnique({
      where: { id: req.params.id },
      include: INCLUDE,
    });
    if (!conta) return res.status(404).json({ erro: "Conta nao encontrada" });
    res.json(conta);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const { descricao, valor, vencimento, clienteId, observacoes } = req.body;
    if (!descricao || !String(descricao).trim()) {
      return res.status(400).json({ erro: "Descricao e obrigatoria" });
    }
    const v = toNumber(valor);
    if (v === null || Number.isNaN(v) || v <= 0) {
      return res.status(400).json({ erro: "Valor deve ser maior que zero" });
    }
    const venc = parseDate(vencimento);
    if (!venc) return res.status(400).json({ erro: "Vencimento invalido" });

    const conta = await prisma.contaReceber.create({
      data: {
        descricao: String(descricao).trim(),
        valor: v,
        vencimento: venc,
        clienteId: clienteId || null,
        observacoes: observacoes ? String(observacoes).trim() : null,
      },
      include: INCLUDE,
    });
    res.status(201).json(conta);
  } catch (err) {
    if (err.code === "P2003") return res.status(400).json({ erro: "Cliente inexistente" });
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const existente = await prisma.contaReceber.findUnique({ where: { id: req.params.id } });
    if (!existente) return res.status(404).json({ erro: "Conta nao encontrada" });
    if (existente.status === "PAGA" || existente.status === "CANCELADA") {
      return res.status(409).json({ erro: "Conta recebida ou cancelada nao pode ser editada" });
    }

    const data = {};
    if (req.body.descricao !== undefined) {
      const d = String(req.body.descricao).trim();
      if (!d) return res.status(400).json({ erro: "Descricao nao pode ser vazia" });
      data.descricao = d;
    }
    if (req.body.valor !== undefined) {
      const v = toNumber(req.body.valor);
      if (v === null || Number.isNaN(v) || v <= 0) {
        return res.status(400).json({ erro: "Valor deve ser maior que zero" });
      }
      data.valor = v;
    }
    if (req.body.vencimento !== undefined) {
      const venc = parseDate(req.body.vencimento);
      if (!venc) return res.status(400).json({ erro: "Vencimento invalido" });
      data.vencimento = venc;
    }
    if (req.body.clienteId !== undefined) {
      data.clienteId = req.body.clienteId || null;
    }
    if (req.body.observacoes !== undefined) {
      data.observacoes = req.body.observacoes ? String(req.body.observacoes).trim() : null;
    }
    if (req.body.status !== undefined) {
      if (!["PENDENTE", "ATRASADA"].includes(req.body.status)) {
        return res.status(400).json({ erro: "Status invalido para edicao" });
      }
      data.status = req.body.status;
    }

    const conta = await prisma.contaReceber.update({
      where: { id: req.params.id },
      data,
      include: INCLUDE,
    });
    res.json(conta);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Conta nao encontrada" });
    if (err.code === "P2003") return res.status(400).json({ erro: "Cliente inexistente" });
    next(err);
  }
}

export async function receber(req, res, next) {
  try {
    const existente = await prisma.contaReceber.findUnique({ where: { id: req.params.id } });
    if (!existente) return res.status(404).json({ erro: "Conta nao encontrada" });
    if (existente.status === "PAGA") {
      return res.status(409).json({ erro: "Conta ja foi recebida" });
    }
    if (existente.status === "CANCELADA") {
      return res.status(409).json({ erro: "Conta cancelada nao pode ser recebida" });
    }

    const dataRecebimento = req.body?.recebimento ? parseDate(req.body.recebimento) : new Date();
    if (!dataRecebimento) return res.status(400).json({ erro: "Data de recebimento invalida" });

    const conta = await prisma.contaReceber.update({
      where: { id: req.params.id },
      data: { status: "PAGA", recebimento: dataRecebimento },
      include: INCLUDE,
    });
    res.json(conta);
  } catch (err) {
    next(err);
  }
}

export async function reabrir(req, res, next) {
  try {
    const existente = await prisma.contaReceber.findUnique({ where: { id: req.params.id } });
    if (!existente) return res.status(404).json({ erro: "Conta nao encontrada" });
    if (existente.status !== "PAGA") {
      return res.status(409).json({ erro: "Apenas contas recebidas podem ser reabertas" });
    }
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const novoStatus = existente.vencimento < hoje ? "ATRASADA" : "PENDENTE";
    const conta = await prisma.contaReceber.update({
      where: { id: req.params.id },
      data: { status: novoStatus, recebimento: null },
      include: INCLUDE,
    });
    res.json(conta);
  } catch (err) {
    next(err);
  }
}

export async function cancelar(req, res, next) {
  try {
    const existente = await prisma.contaReceber.findUnique({ where: { id: req.params.id } });
    if (!existente) return res.status(404).json({ erro: "Conta nao encontrada" });
    if (existente.status === "PAGA") {
      return res.status(409).json({ erro: "Conta recebida nao pode ser cancelada" });
    }
    if (existente.status === "CANCELADA") {
      return res.status(409).json({ erro: "Conta ja esta cancelada" });
    }
    const conta = await prisma.contaReceber.update({
      where: { id: req.params.id },
      data: { status: "CANCELADA" },
      include: INCLUDE,
    });
    res.json(conta);
  } catch (err) {
    next(err);
  }
}

export async function excluir(req, res, next) {
  try {
    await prisma.contaReceber.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Conta nao encontrada" });
    next(err);
  }
}
