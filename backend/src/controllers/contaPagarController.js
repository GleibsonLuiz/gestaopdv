import prisma from "../lib/prisma.js";
import {
  toNumber, parseDate, calcularValores, gerarSerieRecorrencia, TIPOS_RECORRENCIA,
} from "../lib/contas.js";

const INCLUDE = {
  fornecedor: { select: { id: true, nome: true, cnpj: true } },
  anexos: { orderBy: { createdAt: "asc" } },
};

export async function listar(req, res, next) {
  try {
    const { search, status, fornecedorId, dataInicio, dataFim, vencidas } = req.query;
    const where = {};
    if (status) where.status = status;
    if (fornecedorId) where.fornecedorId = fornecedorId;
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

    const contas = await prisma.contaPagar.findMany({
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
    const conta = await prisma.contaPagar.findUnique({
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
    const { descricao, vencimento, fornecedorId, observacoes,
            tipoRecorrencia = "NENHUMA", parcelaTotal } = req.body;

    if (!descricao || !String(descricao).trim()) {
      return res.status(400).json({ erro: "Descricao e obrigatoria" });
    }
    if (!TIPOS_RECORRENCIA.has(tipoRecorrencia)) {
      return res.status(400).json({ erro: "Tipo de recorrencia invalido" });
    }

    // Compatibilidade: se cliente mandar so `valor` (sem valorBruto), tratamos
    // como bruto. Reflete clientes antigos antes do refinamento.
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
      fornecedorId: fornecedorId || null,
      observacoes: observacoes ? String(observacoes).trim() : null,
    };

    const serie = gerarSerieRecorrencia({
      tipoRecorrencia, parcelaTotal,
      valores: calc.valores, vencimento: venc, dadosBase,
    });
    if (!serie.ok) return res.status(400).json({ erro: serie.erro });

    if (tipoRecorrencia === "NENHUMA") {
      const conta = await prisma.contaPagar.create({
        data: serie.registros[0],
        include: INCLUDE,
      });
      return res.status(201).json(conta);
    }

    // Cria toda a serie em transaction e retorna a primeira (mae).
    const result = await prisma.$transaction(async tx => {
      await tx.contaPagar.createMany({ data: serie.registros });
      return tx.contaPagar.findFirst({
        where: { grupoRecorrenciaId: serie.grupoId, parcelaAtual: 1 },
        include: INCLUDE,
      });
    });
    res.status(201).json({ ...result, parcelasGeradas: serie.registros.length });
  } catch (err) {
    if (err.code === "P2003") return res.status(400).json({ erro: "Fornecedor inexistente" });
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const existente = await prisma.contaPagar.findUnique({ where: { id: req.params.id } });
    if (!existente) return res.status(404).json({ erro: "Conta nao encontrada" });
    if (existente.status === "PAGA" || existente.status === "CANCELADA") {
      return res.status(409).json({ erro: "Conta paga ou cancelada nao pode ser editada" });
    }

    const data = {};
    if (req.body.descricao !== undefined) {
      const d = String(req.body.descricao).trim();
      if (!d) return res.status(400).json({ erro: "Descricao nao pode ser vazia" });
      data.descricao = d;
    }

    // Recalcula valores se qualquer componente vier no body.
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
    if (req.body.fornecedorId !== undefined) {
      data.fornecedorId = req.body.fornecedorId || null;
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

    const conta = await prisma.contaPagar.update({
      where: { id: req.params.id },
      data,
      include: INCLUDE,
    });
    res.json(conta);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Conta nao encontrada" });
    if (err.code === "P2003") return res.status(400).json({ erro: "Fornecedor inexistente" });
    next(err);
  }
}

export async function pagar(req, res, next) {
  try {
    const existente = await prisma.contaPagar.findUnique({ where: { id: req.params.id } });
    if (!existente) return res.status(404).json({ erro: "Conta nao encontrada" });
    if (existente.status === "PAGA") {
      return res.status(409).json({ erro: "Conta ja esta paga" });
    }
    if (existente.status === "CANCELADA") {
      return res.status(409).json({ erro: "Conta cancelada nao pode ser paga" });
    }

    const dataPagamento = req.body?.pagamento ? parseDate(req.body.pagamento) : new Date();
    if (!dataPagamento) return res.status(400).json({ erro: "Data de pagamento invalida" });

    // Permite ajustar juros/multa/desconto no ato do pagamento (cobrancas
    // tardias). Se vier algo, recalcula. Caso contrario mantem o que estava.
    const ajustePagamento = ["juros", "multa", "desconto"]
      .some(k => req.body?.[k] !== undefined);
    let extras = {};
    if (ajustePagamento) {
      const calc = calcularValores({
        valorBruto: Number(existente.valorBruto || existente.valor),
        juros: req.body.juros ?? Number(existente.juros),
        multa: req.body.multa ?? Number(existente.multa),
        desconto: req.body.desconto ?? Number(existente.desconto),
      });
      if (!calc.ok) return res.status(400).json({ erro: calc.erro });
      extras = calc.valores;
    }

    const conta = await prisma.contaPagar.update({
      where: { id: req.params.id },
      data: { status: "PAGA", pagamento: dataPagamento, ...extras },
      include: INCLUDE,
    });
    res.json(conta);
  } catch (err) {
    next(err);
  }
}

export async function reabrir(req, res, next) {
  try {
    const existente = await prisma.contaPagar.findUnique({ where: { id: req.params.id } });
    if (!existente) return res.status(404).json({ erro: "Conta nao encontrada" });
    if (existente.status !== "PAGA") {
      return res.status(409).json({ erro: "Apenas contas pagas podem ser reabertas" });
    }
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const novoStatus = existente.vencimento < hoje ? "ATRASADA" : "PENDENTE";
    const conta = await prisma.contaPagar.update({
      where: { id: req.params.id },
      data: { status: novoStatus, pagamento: null },
      include: INCLUDE,
    });
    res.json(conta);
  } catch (err) {
    next(err);
  }
}

export async function cancelar(req, res, next) {
  try {
    const existente = await prisma.contaPagar.findUnique({ where: { id: req.params.id } });
    if (!existente) return res.status(404).json({ erro: "Conta nao encontrada" });
    if (existente.status === "PAGA") {
      return res.status(409).json({ erro: "Conta paga nao pode ser cancelada" });
    }
    if (existente.status === "CANCELADA") {
      return res.status(409).json({ erro: "Conta ja esta cancelada" });
    }
    const conta = await prisma.contaPagar.update({
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
    await prisma.contaPagar.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Conta nao encontrada" });
    next(err);
  }
}
