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
import { criarVenda } from "./vendaController.js";
import { registrar as sseRegistrar, broadcast as sseBroadcast } from "../lib/sseHub.js";
import jwt from "jsonwebtoken";

const STATUS_VALIDOS = new Set([
  "NOVO", "EM_PREPARACAO", "PRONTO", "SERVINDO", "EM_ENTREGA", "CONCLUIDA", "CANCELADA",
]);
const TIPOS_VALIDOS = new Set(["MESA", "VIAGEM", "DELIVERY"]);
// Status considerados "abertos" — comanda ainda no Kanban (nao concluida/cancelada).
const STATUS_ABERTOS = ["NOVO", "EM_PREPARACAO", "PRONTO", "SERVINDO", "EM_ENTREGA"];

const INCLUDE_LISTA = {
  cliente: { select: { id: true, nome: true } },
  user: { select: { id: true, nome: true } },
  _count: { select: { itens: true } },
  // Inclui itens pra Central de Comandas mostrar preview no card sem
  // precisar de uma segunda chamada por comanda. So o nome — campos
  // detalhados (camposSegmento, etc) ficam pro INCLUDE_DETALHE.
  itens: {
    select: {
      id: true,
      quantidade: true,
      observacoes: true,
      produto: { select: { id: true, nome: true, unidade: true } },
    },
  },
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
// Modo especial: ?concluidasHoje=true  -> apenas CONCLUIDA com concluidoEm
// >= inicio do dia atual, limite 20, ordenado por concluidoEm desc. Usado
// pela 3a coluna "Concluidas hoje" do Kanban.
export async function listar(req, res, next) {
  try {
    if (req.query.concluidasHoje === "true") {
      const inicioDia = new Date();
      inicioDia.setHours(0, 0, 0, 0);
      const comandas = await prisma.comanda.findMany({
        where: { status: "CONCLUIDA", concluidoEm: { gte: inicioDia } },
        include: INCLUDE_LISTA,
        orderBy: { concluidoEm: "desc" },
        take: 20,
      });
      return res.json(comandas);
    }
    const status = req.query.status
      ? String(req.query.status).split(",").filter(s => STATUS_VALIDOS.has(s))
      : STATUS_ABERTOS;
    const tipoQuery = req.query.tipo
      ? String(req.query.tipo).split(",").filter(t => TIPOS_VALIDOS.has(t))
      : null;
    const where = {
      ...(status.length ? { status: { in: status } } : {}),
      ...(tipoQuery && tipoQuery.length ? { tipo: { in: tipoQuery } } : {}),
    };
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
// body: { tipo?, mesa?, observacoes?, clienteId?, enderecoEntrega?,
//   entregadorNome?, telefoneContato?, itens: [{ produtoId, quantidade, precoUnitario }] }
export async function criar(req, res, next) {
  try {
    const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
    if (itens.length === 0) {
      return res.status(400).json({ erro: "Comanda precisa ter ao menos 1 item" });
    }
    const tipo = req.body?.tipo && TIPOS_VALIDOS.has(req.body.tipo)
      ? req.body.tipo
      : "MESA";
    // Regras minimas por tipo: DELIVERY exige endereco, VIAGEM e DELIVERY
    // recomendam telefone (mas nao bloqueia — usuario pode preencher depois).
    if (tipo === "DELIVERY" && !req.body?.enderecoEntrega) {
      return res.status(400).json({ erro: "Pedido DELIVERY exige endereco de entrega" });
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
    const subtotal = Number(total.toFixed(2));

    // Desconto opcional vindo do PDV Volante (R$). Nunca passa do subtotal,
    // nunca fica negativo. Quando informado, o total final ja vem com o
    // desconto aplicado pra a Central exibir o valor cobrado direto.
    let desconto = null;
    if (req.body.desconto != null) {
      const d = toNumber(req.body.desconto);
      if (Number.isFinite(d) && d > 0) {
        desconto = Number(Math.min(d, subtotal).toFixed(2));
      }
    }
    total = desconto != null ? Number((subtotal - desconto).toFixed(2)) : subtotal;

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
        tipo,
        status: "NOVO",
        // MESA usa o campo `mesa`; VIAGEM/DELIVERY ignoram (no MAX 80 char).
        mesa: tipo === "MESA" && req.body.mesa ? String(req.body.mesa).slice(0, 80) : null,
        enderecoEntrega: tipo === "DELIVERY" && req.body.enderecoEntrega
          ? String(req.body.enderecoEntrega).slice(0, 300) : null,
        entregadorNome: tipo === "DELIVERY" && req.body.entregadorNome
          ? String(req.body.entregadorNome).slice(0, 120) : null,
        telefoneContato: (tipo === "VIAGEM" || tipo === "DELIVERY") && req.body.telefoneContato
          ? String(req.body.telefoneContato).slice(0, 30) : null,
        observacoes: req.body.observacoes ? String(req.body.observacoes).slice(0, 500) : null,
        total,
        desconto,
        clienteId: req.body.clienteId || null,
        userId,
        itens: { create: itensPreparados },
      },
      include: INCLUDE_DETALHE,
    });
    sseBroadcast(tenantId, "nova", { id: comanda.id, numero: comanda.numero, mesa: comanda.mesa });
    res.status(201).json(comanda);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ erro: "Numero de comanda em uso, tente novamente" });
    next(err);
  }
}

// POST /comandas/:id/itens — adiciona itens a uma comanda ja aberta.
// Caso de uso: cliente pediu mais durante a permanencia. Permitido apenas
// quando status e NOVO ou EM_PREPARACAO. Recalcula `total` mantendo o
// desconto absoluto ja registrado (se houver). Retorna a comanda completa
// + os ids dos itens adicionados nessa chamada (front imprime adendo).
export async function adicionarItens(req, res, next) {
  try {
    const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
    if (itens.length === 0) {
      return res.status(400).json({ erro: "Informe ao menos 1 item para adicionar" });
    }
    const tenantId = req.tenantId;
    const comandaAtual = await prisma.comanda.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, tipo: true, total: true, desconto: true, numero: true },
    });
    if (!comandaAtual) return res.status(404).json({ erro: "Comanda nao encontrada" });
    if (comandaAtual.status === "CONCLUIDA") {
      return res.status(400).json({ erro: "Comanda ja concluida — abra uma nova" });
    }
    if (comandaAtual.status === "CANCELADA") {
      return res.status(400).json({ erro: "Comanda cancelada — abra uma nova" });
    }
    // DELIVERY: entregador ja saiu com o pedido. Adicionar agora nao chega.
    if (comandaAtual.status === "EM_ENTREGA") {
      return res.status(400).json({ erro: "Pedido ja saiu para entrega — nao da pra adicionar" });
    }

    // Valida produtos e prepara itens (mesma logica de criar()).
    const ids = [...new Set(itens.map(i => i.produtoId).filter(Boolean))];
    const produtos = await prisma.produto.findMany({
      where: { id: { in: ids }, ativo: true },
      select: { id: true, precoVenda: true },
    });
    const mapaProd = new Map(produtos.map(p => [p.id, p]));
    const itensPreparados = [];
    let subtotalNovos = 0;
    for (const it of itens) {
      const p = mapaProd.get(it.produtoId);
      if (!p) return res.status(400).json({ erro: `Produto ${it.produtoId} nao encontrado ou inativo` });
      const qtd = toQtd(it.quantidade);
      if (qtd <= 0) return res.status(400).json({ erro: "Quantidade invalida" });
      const preco = it.precoUnitario != null ? toNumber(it.precoUnitario) : Number(p.precoVenda);
      const subtotal = Number((qtd * preco).toFixed(2));
      subtotalNovos += subtotal;
      itensPreparados.push({
        comandaId: comandaAtual.id,
        produtoId: p.id,
        quantidade: qtd,
        precoUnitario: preco,
        subtotal,
        observacoes: it.observacoes ? String(it.observacoes).slice(0, 300) : null,
        tenantId,
      });
    }

    // Total novo = total atual (que ja considera desconto) + subtotal dos novos.
    // Desconto absoluto registrado na comanda permanece igual (nao se aplica
    // aos itens adicionados depois; UX mais previsivel pro caixa).
    const novoTotal = Number((Number(comandaAtual.total) + subtotalNovos).toFixed(2));

    // Regra: se a comanda ja estava PRONTO/SERVINDO e o cliente pediu mais,
    // a cozinha precisa preparar o adendo — volta pra EM_PREPARACAO. Os
    // timestamps `prontoEm`/`servindoEm` sao limpos pra zerar o cronometro
    // no proximo ciclo de producao. NOVO/EM_PREPARACAO continuam onde estao.
    const reverter = comandaAtual.status === "PRONTO" || comandaAtual.status === "SERVINDO";
    const dadosUpdate = reverter
      ? { total: novoTotal, status: "EM_PREPARACAO", prontoEm: null, servindoEm: null }
      : { total: novoTotal };

    // Cria itens + atualiza total em transacao. Retorna a comanda completa.
    const [_criados, comanda] = await prisma.$transaction([
      prisma.itemComanda.createMany({ data: itensPreparados }),
      prisma.comanda.update({
        where: { id: comandaAtual.id },
        data: dadosUpdate,
        include: INCLUDE_DETALHE,
      }),
    ]);

    // Pega os itens recem-criados (ordenados pelo timestamp) pra o front
    // saber quais imprimir no adendo. createMany nao retorna ids no Postgres,
    // entao busca pelos N mais recentes da comanda.
    const itensAdicionados = await prisma.itemComanda.findMany({
      where: { comandaId: comanda.id },
      orderBy: { criadoEm: "desc" },
      take: itensPreparados.length,
      include: { produto: { select: { id: true, codigo: true, nome: true, unidade: true, camposSegmento: true } } },
    });

    sseBroadcast(tenantId, "atualizada", {
      id: comanda.id, numero: comanda.numero, itensAdicionados: itensAdicionados.length,
    });
    res.status(201).json({ comanda, itensAdicionados });
  } catch (err) { next(err); }
}

// GET /comandas/abertas?mesa=Mesa+5 — lista comandas abertas (qualquer status
// pre-CONCLUIDA) na mesa. Usado pelo PDV Volante pra oferecer "adicionar a
// existente". Filtra so MESA porque os outros tipos nao usam o campo mesa.
// EM_ENTREGA fica de fora — pedido ja saiu, nao da pra adicionar.
export async function listarAbertas(req, res, next) {
  try {
    const mesa = req.query.mesa ? String(req.query.mesa).trim() : null;
    if (!mesa) return res.json([]);
    const comandas = await prisma.comanda.findMany({
      where: {
        tipo: "MESA",
        mesa: { equals: mesa, mode: "insensitive" },
        status: { in: ["NOVO", "EM_PREPARACAO", "PRONTO", "SERVINDO"] },
      },
      include: INCLUDE_LISTA,
      orderBy: { criadoEm: "desc" },
      take: 10,
    });
    res.json(comandas);
  } catch (err) { next(err); }
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
    sseBroadcast(req.tenantId, "aceita", { id: c.id, numero: c.numero });
    res.json(c);
  } catch (err) { next(err); }
}

// PATCH /comandas/:id/pronto — EM_PREPARACAO -> PRONTO
// Cozinha terminou de preparar. Toca alerta na coluna PRONTO pra o garcom
// retirar (MESA) ou cliente buscar (VIAGEM) ou entregador pegar (DELIVERY).
export async function marcarPronto(req, res, next) {
  try {
    const atual = await prisma.comanda.findUnique({
      where: { id: req.params.id },
      select: { status: true, tipo: true },
    });
    if (!atual) return res.status(404).json({ erro: "Comanda nao encontrada" });
    if (atual.status !== "EM_PREPARACAO" && atual.status !== "NOVO") {
      return res.status(400).json({ erro: `Comanda esta em ${atual.status} — nao da pra marcar como PRONTO` });
    }
    const c = await prisma.comanda.update({
      where: { id: req.params.id },
      data: {
        status: "PRONTO",
        prontoEm: new Date(),
        // Caso pulou EM_PREPARACAO direto de NOVO (raro mas possivel pro
        // operador agil), registra aceitoEm tambem pra metricas baterem.
        aceitoEm: atual.status === "NOVO" ? new Date() : undefined,
      },
      include: INCLUDE_DETALHE,
    });
    sseBroadcast(req.tenantId, "pronto", { id: c.id, numero: c.numero, tipo: c.tipo });
    res.json(c);
  } catch (err) { next(err); }
}

// PATCH /comandas/:id/servindo — PRONTO -> SERVINDO (so MESA)
// Garcom retirou da cozinha e levou pra mesa. Cliente comecou a consumir.
// A partir daqui, "adicionar item" e' o caso comum (cliente pede mais).
export async function marcarServindo(req, res, next) {
  try {
    const atual = await prisma.comanda.findUnique({
      where: { id: req.params.id },
      select: { status: true, tipo: true },
    });
    if (!atual) return res.status(404).json({ erro: "Comanda nao encontrada" });
    if (atual.tipo !== "MESA") {
      return res.status(400).json({ erro: "So pedidos MESA passam por SERVINDO" });
    }
    if (atual.status !== "PRONTO") {
      return res.status(400).json({ erro: `Comanda esta em ${atual.status} — precisa estar PRONTO` });
    }
    const c = await prisma.comanda.update({
      where: { id: req.params.id },
      data: { status: "SERVINDO", servindoEm: new Date() },
      include: INCLUDE_DETALHE,
    });
    sseBroadcast(req.tenantId, "servindo", { id: c.id, numero: c.numero });
    res.json(c);
  } catch (err) { next(err); }
}

// PATCH /comandas/:id/em-entrega — PRONTO -> EM_ENTREGA (so DELIVERY)
// Entregador pegou o pedido e saiu. Daqui em diante, finalizar (= entregue+pago).
export async function marcarEmEntrega(req, res, next) {
  try {
    const atual = await prisma.comanda.findUnique({
      where: { id: req.params.id },
      select: { status: true, tipo: true },
    });
    if (!atual) return res.status(404).json({ erro: "Comanda nao encontrada" });
    if (atual.tipo !== "DELIVERY") {
      return res.status(400).json({ erro: "So pedidos DELIVERY passam por EM_ENTREGA" });
    }
    if (atual.status !== "PRONTO") {
      return res.status(400).json({ erro: `Comanda esta em ${atual.status} — precisa estar PRONTO` });
    }
    const dados = { status: "EM_ENTREGA", emEntregaEm: new Date() };
    // Permite registrar o nome do entregador na hora da saida (opcional).
    if (req.body?.entregadorNome) {
      dados.entregadorNome = String(req.body.entregadorNome).slice(0, 120);
    }
    const c = await prisma.comanda.update({
      where: { id: req.params.id },
      data: dados,
      include: INCLUDE_DETALHE,
    });
    sseBroadcast(req.tenantId, "em-entrega", { id: c.id, numero: c.numero });
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
    sseBroadcast(req.tenantId, "cancelada", { id: c.id, numero: c.numero });
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

    // Cria a Venda real via servico puro criarVenda (baixa de estoque, pontos,
    // conta a receber, etc.). Em request autenticado o tenantStorage ja esta
    // ativo — o Prisma extension filtra/insere no tenant. Sem fakeReq/fakeRes.
    let vendaCriada;
    try {
      vendaCriada = await criarVenda({
        body: payloadVenda,
        userId: req.user.sub,
        tenantId: req.tenantId,
      });
    } catch (err) {
      if (err.status) return res.status(err.status).json(err.body || { erro: err.message });
      throw err;
    }
    const vendaId = vendaCriada?.id || null;

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
    sseBroadcast(req.tenantId, "concluida", { id: finalizada.id, numero: finalizada.numero });
    res.json({ comanda: finalizada, venda: vendaCriada });
  } catch (err) { next(err); }
}

// GET /comandas/stream — Server-Sent Events.
// Autenticacao via query ?token=...  porque EventSource nao permite
// headers customizados. Token e' o mesmo JWT do header Authorization
// (curto-vivido, expira junto). Aceita tambem header Bearer normal
// pra clientes que conseguem injetar (proxies, fetch+ReadableStream).
export async function stream(req, res, next) {
  try {
    let payload;
    const auth = req.headers.authorization;
    let raw = null;
    if (auth && auth.startsWith("Bearer ")) raw = auth.slice(7);
    else if (req.query.token) raw = String(req.query.token);
    if (!raw) return res.status(401).json({ erro: "Token nao fornecido" });
    try { payload = jwt.verify(raw, process.env.JWT_SECRET); }
    catch { return res.status(401).json({ erro: "Token invalido ou expirado" }); }
    if (!payload.tid) return res.status(401).json({ erro: "Token sem tenant" });

    // Headers SSE — flushHeaders garante que o cliente recebe o status
    // 200 imediatamente, em vez de esperar o primeiro write.
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // desabilita buffering do nginx
    });
    res.flushHeaders?.();

    sseRegistrar(payload.tid, res);
    // Nao chama res.end() — a conexao fica aberta ate o cliente fechar
    // ou cair (handler de "close" no hub faz cleanup).
  } catch (err) { next(err); }
}

// GET /comandas/resumo — KPIs para o dashboard da central
export async function resumo(req, res, next) {
  try {
    const inicioDia = new Date(new Date().setHours(0, 0, 0, 0));
    const [novos, emPrep, prontos, servindo, emEntrega, hoje, totalHoje] = await Promise.all([
      prisma.comanda.count({ where: { status: "NOVO" } }),
      prisma.comanda.count({ where: { status: "EM_PREPARACAO" } }),
      prisma.comanda.count({ where: { status: "PRONTO" } }),
      prisma.comanda.count({ where: { status: "SERVINDO" } }),
      prisma.comanda.count({ where: { status: "EM_ENTREGA" } }),
      prisma.comanda.count({
        where: { status: "CONCLUIDA", concluidoEm: { gte: inicioDia } },
      }),
      prisma.comanda.aggregate({
        where: { status: "CONCLUIDA", concluidoEm: { gte: inicioDia } },
        _sum: { total: true },
      }),
    ]);
    res.json({
      novos, emPreparacao: emPrep, prontos, servindo, emEntrega,
      concluidasHoje: hoje,
      faturamentoHoje: Number(totalHoje?._sum?.total || 0),
    });
  } catch (err) { next(err); }
}
