import prisma from "../lib/prisma.js";

const FORMAS_BASE_VALIDAS = new Set([
  "DINHEIRO",
  "CARTAO_CREDITO",
  "CARTAO_DEBITO",
  "PIX",
  "BOLETO",
  "CREDIARIO",
]);

function normalizarPayload(req) {
  const nome = req.body?.nome ? String(req.body.nome).trim().toUpperCase() : "";
  const icone = req.body?.icone ? String(req.body.icone).trim().slice(0, 8) : null;
  const baseFormaPagamento = req.body?.baseFormaPagamento
    ? String(req.body.baseFormaPagamento).trim().toUpperCase()
    : "";
  const ativo = req.body?.ativo === undefined ? true : !!req.body.ativo;
  const ordem = Number.isFinite(parseInt(req.body?.ordem, 10))
    ? parseInt(req.body.ordem, 10)
    : 0;
  return { nome, icone, baseFormaPagamento, ativo, ordem };
}

export async function listar(req, res, next) {
  try {
    const where = {};
    if (req.query?.ativo === "true") where.ativo = true;
    if (req.query?.ativo === "false") where.ativo = false;
    const formas = await prisma.formaPagamentoCustom.findMany({
      where,
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    });
    res.json(formas);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const { nome, icone, baseFormaPagamento, ativo, ordem } = normalizarPayload(req);
    if (!nome) return res.status(400).json({ erro: "Nome e obrigatorio" });
    if (!FORMAS_BASE_VALIDAS.has(baseFormaPagamento)) {
      return res.status(400).json({ erro: "Forma base invalida" });
    }
    const forma = await prisma.formaPagamentoCustom.create({
      data: { nome, icone, baseFormaPagamento, ativo, ordem },
    });
    res.status(201).json(forma);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ erro: "Ja existe uma forma de pagamento com este nome" });
    }
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const { nome, icone, baseFormaPagamento, ativo, ordem } = normalizarPayload(req);
    if (!nome) return res.status(400).json({ erro: "Nome nao pode ser vazio" });
    if (!FORMAS_BASE_VALIDAS.has(baseFormaPagamento)) {
      return res.status(400).json({ erro: "Forma base invalida" });
    }
    const forma = await prisma.formaPagamentoCustom.update({
      where: { id: req.params.id },
      data: { nome, icone, baseFormaPagamento, ativo, ordem },
    });
    res.json(forma);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Forma de pagamento nao encontrada" });
    if (err.code === "P2002") return res.status(409).json({ erro: "Ja existe uma forma de pagamento com este nome" });
    next(err);
  }
}

export async function excluir(req, res, next) {
  try {
    await prisma.formaPagamentoCustom.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Forma de pagamento nao encontrada" });
    next(err);
  }
}
