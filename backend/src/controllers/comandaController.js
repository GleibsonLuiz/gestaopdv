// =====================================================================
// ETAPA#8b — Central de Comandas (Kanban /painel-comandas).
//
// Pedidos chegam do PDV Volante Mobile (POST /comandas), aparecem na
// coluna NOVO do Kanban, o vendedor aceita (-> EM_PREPARACAO), monta
// o pedido fisicamente e finaliza (CONCLUIDA) — neste ponto e gerada
// a Venda real com baixa de estoque (ver ETAPA#9a).
//
// Timer persistente: o frontend calcula tempo decorrido com base em
// `criadoEm` retornado em cada GET, garantindo que F5 nao reseta.
// =====================================================================
import prisma from "../lib/prisma.js";
import { aplicarLimite } from "../lib/planoLimites.js";
import { criar as criarVenda } from "./vendaController.js";

const STATUS_VALIDOS = new Set(["NOVO", "EM_PREPARACAO", "CONCLUIDA", "CANCELADA"]);

const INCLUDE_LISTA = {
  cliente: { select: { id: true, nome: true } },
  user: { select: { id: true, nome: true } },
  _count: { select: { itens: true } },
};

const INCLUDE_DETALHE = {
  cliente: { select: { id: true, nome: true, cpfCnpj: true, telefone: true } },
  user: { select: { id: true, nome: true, role: true } },
  itens: {
    include: {
      produto: { select: { id: true, codigo: true, nome: true, unidade: true, camposSegmento: true } },
    },
  },
};

function toNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function toQtd(v) {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// GET /comandas?status=NOVO,EM_PREPARACAO  (default: NOVO + EM_PREPARACAO)
export async function listar(req, res, next) {
  try {
    const status = req.query.status
      ? String(req.query.status).split(",").filter(s => STATUS_VALIDOS.has(s))
      : ["NOVO", "EM_PREPARACAO"];
    const where = status.length ? { status: { in: status } } : {};
    const comandas = await prisma.comanda.findMany({
      where,
      include: INCLUDE_LISTA,
      orderBy: { criadoEm: "asc" },
    });
    res.json(comandas);
  } catch (err) { next(err); }
}

// GET /comandas/:id
export async function obter(req, res, next) {
  try {
    const c = await prisma.comanda.findUnique({
      where: { id: req.params.id },
      include: INCLUDE_DETALHE,
    });
    if (!c) return res.status(404).json({ erro: "Comanda nao encontrada" });
    res.json(c);
  } catch (err) { next(err); }
}

// POST /comandas — chamado pelo PDV Volante Mobile.
// body: { mesa?, observacoes?, clienteId?, itens: [{ produtoId, quantidade, precoUnitario }] }
export async function criar(req, res, next) {
  try {
    const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
    if (itens.length === 0) {
      return res.status(400).json({ erro: "Comanda precisa ter ao menos 1 item" });
    }
    const userId = req.user?.sub || null;
    const tenantId = req.tenantId;

    // Calcula totais e valida produtos.
    const ids = [...new Set(itens.map(i => i.produtoId).filter(Boolean))];
    const produtos = await prisma.produto.findMany({
      where: { id: { in: ids }, ativo: true },
      select: { id: true, precoVenda: true },
    });
    const mapaProd = new Map(produtos.map(p => [p.id, p]));
    const itensPreparados = [];
    let total = 0;
    for (const it of itens) {
      const p = mapaProd.get(it.produtoId);
      if (!p) return res.status(400).json({ erro: `Produto ${it.produtoId} nao encontrado ou inativo` });
      const qtd = toQtd(it.quantidade);
      if (qtd <= 0) return res.status(400).json({ erro: "Quantidade invalida" });
      const preco = it.precoUnitario != null ? toNumber(it.precoUnitario) : Number(p.precoVenda);
      const subtotal = Number((qtd * preco).toFixed(2));
      total += subtotal;
      itensPreparados.push({
        produtoId: p.id,
        quantidade: qtd,
        precoUnitario: preco,
        subtotal,
        observacoes: it.observacoes ? String(it.observacoes).slice(0, 300) : null,
        tenantId,
      });
    }
    total = Number(total.toFixed(2));

    // Numero sequencial por tenant.
    const ultima = await prisma.comanda.findFirst({
      where: {},
      orderBy: { numero: "desc" },
      select: { numero: true },
    });
    const numero = (ultima?.numero || 0) + 1;

    const comanda = await prisma.comanda.create({
      data: {
        numero,
        status: "NOVO",
        mesa: req.body.mesa ? String(req.body.mesa).slice(0, 80) : null,
        observacoes: req.body.observacoes ? String(req.body.observacoes).slice(0, 500) : null,
        total,
        clienteId: req.body.clienteId || null,
        userId,
        itens: { create: itensPreparados },
      },
      include: INCLUDE_DETALHE,
    });
    res.status(201).json(comanda);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ erro: "Numero de comanda em uso, tente novamente" });
    next(err);
  }
}

// PATCH /comandas/:id/aceitar — NOVO -> EM_PREPARACAO
export async function aceitar(req, res, next) {
  try {
    const atual = await prisma.comanda.findUnique({
      where: { id: req.params.id }, select: { status: true },
    });
    if (!atual) return res.status(404).json({ erro: "Comanda nao encontrada" });
    if (atual.status !== "NOVO") {
      return res.status(400).json({ erro: `Comanda ja esta ${atual.status}` });
    }
    const c = await prisma.comanda.update({
      where: { id: req.params.id },
      data: { status: "EM_PREPARACAO", aceitoEm: new Date() },
      include: INCLUDE_DETALHE,
    });
    res.json(c);
  } catch (err) { next(err); }
}

// PATCH /comandas/:id/cancelar
export async function cancelar(req, res, next) {
  try {
    const atual = await prisma.comanda.findUnique({
      where: { id: req.params.id }, select: { status: true },
    });
    if (!atual) return res.status(404).json({ erro: "Comanda nao encontrada" });
    if (atual.status === "CONCLUIDA") {
      return res.status(400).json({ erro: "Comanda ja concluida nao pode ser cancelada — estorne a venda no PDV" });
    }
    if (atual.status === "CANCELADA") return res.json({ ok: true });
    const c = await prisma.comanda.update({
      where: { id: req.params.id },
      data: {
        status: "CANCELADA",
        canceladaEm: new Date(),
        observacoes: req.body.motivo
          ? (atual.observacoes ? atual.observacoes + " | Cancelada: " + req.body.motivo : "Cancelada: " + req.body.motivo)
          : undefined,
      },
      include: INCLUDE_DETALHE,
    });
    res.json(c);
  } catch (err) { next(err); }
}

// POST /comandas/:id/finalizar — ETAPA#9a (checkout simplificado)
// body: { formaPagamento, idTransacao? }
// Gera Venda real (com baixa de estoque) e marca comanda como CONCLUIDA.
export async function finalizar(req, res, next) {
  try {
    const c = await prisma.comanda.findUnique({
      where: { id: req.params.id },
      include: { itens: true },
    });
    if (!c) return res.status(404).json({ erro: "Comanda nao encontrada" });
    if (c.status === "CONCLUIDA") return res.status(400).json({ erro: "Comanda ja concluida" });
    if (c.status === "CANCELADA") return res.status(400).json({ erro: "Comanda cancelada — abra uma nova" });

    const forma = String(req.body?.formaPagamento || "DINHEIRO").toUpperCase();
    const idTransacao = req.body?.idTransacao ? String(req.body.idTransacao).slice(0, 80) : null;

    // ETAPA 13: limite de vendas/mes
    if (!await aplicarLimite(req, res, "vendasMes")) return;

    // Monta payload pra vendaController.criar — reusa toda a logica de
    // baixa de estoque, pontos, conta a receber, etc.
    const payloadVenda = {
      formaPagamento: forma,
      pagamentos: [{ forma, valor: Number(c.total) }],
      observacoes: c.observacoes ? `Comanda #${c.numero} - ${c.observacoes}` : `Comanda #${c.numero}`,
      clienteId: c.clienteId || undefined,
      itens: c.itens.map(it => ({
        produtoId: it.produtoId,
        quantidade: Number(it.quantidade),
        precoUnitario: Number(it.precoUnitario),
      })),
    };

    let vendaId = null;
    const reqFake = { body: payloadVenda, user: req.user, tenantId: req.tenantId };
    const resFake = {
      _status: 201, _body: null,
      status(s) { this._status = s; return this; },
      json(j) { this._body = j; },
    };
    await criarVenda(reqFake, resFake, (e) => { throw e; });
    if (resFake._status !== 201) {
      return res.status(resFake._status).json(resFake._body);
    }
    vendaId = resFake._body?.id || null;

    const finalizada = await prisma.comanda.update({
      where: { id: c.id },
      data: {
        status: "CONCLUIDA",
        concluidoEm: new Date(),
        formaPagamento: forma,
        idTransacao,
        pago: true,
        vendaId,
      },
      include: INCLUDE_DETALHE,
    });
    res.json({ comanda: finalizada, venda: resFake._body });
  } catch (err) { next(err); }
}

// GET /comandas/resumo — KPIs para o dashboard da central
export async function resumo(req, res, next) {
  try {
    const [novos, emPrep, hoje, totalHoje] = await Promise.all([
      prisma.comanda.count({ where: { status: "NOVO" } }),
      prisma.comanda.count({ where: { status: "EM_PREPARACAO" } }),
      prisma.comanda.count({
        where: {
          status: "CONCLUIDA",
          concluidoEm: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      prisma.comanda.aggregate({
        where: {
          status: "CONCLUIDA",
          concluidoEm: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
        _sum: { total: true },
      }),
    ]);
    res.json({
      novos, emPreparacao: emPrep,
      concluidasHoje: hoje,
      faturamentoHoje: Number(totalHoje?._sum?.total || 0),
    });
  } catch (err) { next(err); }
}
