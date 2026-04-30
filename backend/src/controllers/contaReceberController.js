import prisma from "../lib/prisma.js";
import {
  toNumber, parseDate, calcularValores, gerarSerieRecorrencia, TIPOS_RECORRENCIA,
} from "../lib/contas.js";

const INCLUDE = {
  cliente: { select: { id: true, nome: true, cpfCnpj: true } },
  anexos: { orderBy: { createdAt: "asc" } },
};

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
    const { descricao, vencimento, clienteId, observacoes,
            tipoRecorrencia = "NENHUMA", parcelaTotal } = req.body;

    if (!descricao || !String(descricao).trim()) {
      return res.status(400).json({ erro: "Descricao e obrigatoria" });
    }
    if (!TIPOS_RECORRENCIA.has(tipoRecorrencia)) {
      return res.status(400).json({ erro: "Tipo de recorrencia invalido" });
    }

    const valoresInput = {
      valorBruto: req.body.valorBruto ?? req.body.valor,
      juros: req.body.juros, multa: req.body.multa, desconto: req.body.desconto,
    };
    const calc = calcularValores(valoresInput);
    if (!calc.ok) return res.status(400).json({ erro: calc.erro });

    const venc = parseDate(vencimento);
    if (!venc) return res.status(400).json({ erro: "Vencimento invalido" });

    const dadosBase = {
      descricao: String(descricao).trim(),
      clienteId: clienteId || null,
      observacoes: observacoes ? String(observacoes).trim() : null,
    };

    const serie = gerarSerieRecorrencia({
      tipoRecorrencia, parcelaTotal,
      valores: calc.valores, vencimento: venc, dadosBase,
    });
    if (!serie.ok) return res.status(400).json({ erro: serie.erro });

    if (tipoRecorrencia === "NENHUMA") {
      const conta = await prisma.contaReceber.create({
        data: serie.registros[0],
        include: INCLUDE,
      });
      return res.status(201).json(conta);
    }

    const result = await prisma.$transaction(async tx => {
      await tx.contaReceber.createMany({ data: serie.registros });
      return tx.contaReceber.findFirst({
        where: { grupoRecorrenciaId: serie.grupoId, parcelaAtual: 1 },
        include: INCLUDE,
      });
    });
    res.status(201).json({ ...result, parcelasGeradas: serie.registros.length });
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

    const tocouValor = ["valorBruto","juros","multa","desconto","valor"]
      .some(k => req.body[k] !== undefined);
    if (tocouValor) {
      const calc = calcularValores({
        valorBruto: req.body.valorBruto ?? req.body.valor ?? Number(existente.valorBruto || existente.valor),
        juros: req.body.juros ?? Number(existente.juros),
        multa: req.body.multa ?? Number(existente.multa),
        desconto: req.body.desconto ?? Number(existente.desconto),
      });
      if (!calc.ok) return res.status(400).json({ erro: calc.erro });
      Object.assign(data, calc.valores);
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

    const ajusteRecebimento = ["juros", "multa", "desconto"]
      .some(k => req.body?.[k] !== undefined);
    let extras = {};
    if (ajusteRecebimento) {
      const calc = calcularValores({
        valorBruto: Number(existente.valorBruto || existente.valor),
        juros: req.body.juros ?? Number(existente.juros),
        multa: req.body.multa ?? Number(existente.multa),
        desconto: req.body.desconto ?? Number(existente.desconto),
      });
      if (!calc.ok) return res.status(400).json({ erro: calc.erro });
      extras = calc.valores;
    }

    const conta = await prisma.contaReceber.update({
      where: { id: req.params.id },
      data: { status: "PAGA", recebimento: dataRecebimento, ...extras },
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
