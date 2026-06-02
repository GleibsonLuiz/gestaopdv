import prisma from "../lib/prisma.js";
import { criarComNumeroRetry } from "../lib/proximoNumero.js";
import { registrarEvento } from "../middlewares/auditoria.js";

// ============ ORDEM DE SERVICO ============
// Oficina/assistencia: abre OS com equipamento+defeito, adiciona pecas e
// servicos, acompanha o status ate a entrega. Multi-tenant via extension.

const STATUS_VALIDOS = new Set(["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_PECA", "PRONTA", "ENTREGUE", "CANCELADA"]);
const TIPOS_ITEM = new Set(["PECA", "SERVICO"]);

const INCLUDE = {
  itens: { orderBy: { ordem: "asc" } },
  cliente: { select: { id: true, nome: true, telefone: true } },
  responsavel: { select: { id: true, nome: true } },
};

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Normaliza itens e calcula totais. Lanca {status,message} se invalido.
function prepararItens(itensRaw, descontoRaw) {
  const itens = Array.isArray(itensRaw) ? itensRaw : [];
  const prep = [];
  let valorPecas = 0, valorServicos = 0;
  itens.forEach((it, i) => {
    const tipo = TIPOS_ITEM.has(it?.tipo) ? it.tipo : "PECA";
    const descricao = String(it?.descricao || "").trim().slice(0, 200);
    if (!descricao) { const e = new Error(`Item ${i + 1}: descricao obrigatoria`); e.status = 400; throw e; }
    const quantidade = Math.max(0.001, toNum(it?.quantidade) || 1);
    const valorUnitario = Math.max(0, toNum(it?.valorUnitario));
    const subtotal = Math.round(quantidade * valorUnitario * 100) / 100;
    if (tipo === "PECA") valorPecas += subtotal; else valorServicos += subtotal;
    prep.push({
      tipo,
      produtoId: tipo === "PECA" && it?.produtoId ? it.produtoId : null,
      descricao, quantidade, valorUnitario, subtotal,
      ordem: i,
    });
  });
  valorPecas = Math.round(valorPecas * 100) / 100;
  valorServicos = Math.round(valorServicos * 100) / 100;
  const desconto = Math.max(0, toNum(descontoRaw));
  const total = Math.max(0, Math.round((valorPecas + valorServicos - desconto) * 100) / 100);
  return { prep, valorPecas, valorServicos, desconto, total };
}

function serializar(os) {
  return {
    ...os,
    valorPecas: Number(os.valorPecas), valorServicos: Number(os.valorServicos),
    desconto: Number(os.desconto), total: Number(os.total),
    itens: (os.itens || []).map(i => ({
      ...i, quantidade: Number(i.quantidade), valorUnitario: Number(i.valorUnitario), subtotal: Number(i.subtotal),
    })),
  };
}

// GET /ordens-servico?status=&busca=
export async function listar(req, res, next) {
  try {
    const where = {};
    if (req.query.status && STATUS_VALIDOS.has(req.query.status)) where.status = req.query.status;
    const busca = String(req.query.busca || "").trim();
    if (busca) {
      where.OR = [
        { equipamento: { contains: busca, mode: "insensitive" } },
        { descricaoCliente: { contains: busca, mode: "insensitive" } },
        { cliente: { is: { nome: { contains: busca, mode: "insensitive" } } } },
      ];
      const n = parseInt(busca, 10);
      if (Number.isFinite(n)) where.OR.push({ numero: n });
    }
    const lista = await prisma.ordemServico.findMany({
      where, include: INCLUDE, orderBy: { createdAt: "desc" }, take: 200,
    });
    res.json({ total: lista.length, ordens: lista.map(serializar) });
  } catch (err) { next(err); }
}

export async function obter(req, res, next) {
  try {
    const os = await prisma.ordemServico.findUnique({ where: { id: req.params.id }, include: INCLUDE });
    if (!os) return res.status(404).json({ erro: "Ordem de servico nao encontrada" });
    res.json(serializar(os));
  } catch (err) { next(err); }
}

// POST /ordens-servico
export async function criar(req, res, next) {
  try {
    const b = req.body || {};
    let calc;
    try { calc = prepararItens(b.itens, b.desconto); }
    catch (e) { if (e.status) return res.status(e.status).json({ erro: e.message }); throw e; }

    const dataBase = {
      status: "ABERTA",
      clienteId: b.clienteId || null,
      descricaoCliente: b.descricaoCliente ? String(b.descricaoCliente).trim().slice(0, 120) : null,
      telefone: b.telefone ? String(b.telefone).trim().slice(0, 40) : null,
      equipamento: b.equipamento ? String(b.equipamento).trim().slice(0, 200) : null,
      defeitoRelatado: b.defeitoRelatado ? String(b.defeitoRelatado).trim().slice(0, 1000) : null,
      diagnostico: b.diagnostico ? String(b.diagnostico).trim().slice(0, 1000) : null,
      observacoes: b.observacoes ? String(b.observacoes).trim().slice(0, 1000) : null,
      responsavelId: b.responsavelId || null,
      previsaoEntrega: b.previsaoEntrega ? new Date(b.previsaoEntrega) : null,
      valorPecas: calc.valorPecas, valorServicos: calc.valorServicos,
      desconto: calc.desconto, total: calc.total,
    };

    const os = await criarComNumeroRetry(prisma.ordemServico, req.tenantId, (numero) =>
      prisma.ordemServico.create({
        data: { ...dataBase, numero, itens: { create: calc.prep } },
        include: INCLUDE,
      })
    );

    registrarEvento({
      acao: "OS_CRIADA", modulo: "ORDEM_SERVICO", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome, tenantId: req.tenantId,
      mensagem: `OS #${os.numero} aberta${os.equipamento ? ` — ${os.equipamento}` : ""}`,
      req,
    });
    res.status(201).json(serializar(os));
  } catch (err) { next(err); }
}

// PUT /ordens-servico/:id — atualiza dados + substitui itens (recalcula totais).
export async function atualizar(req, res, next) {
  try {
    const existente = await prisma.ordemServico.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } });
    if (!existente) return res.status(404).json({ erro: "Ordem de servico nao encontrada" });
    if (existente.status === "ENTREGUE" || existente.status === "CANCELADA") {
      return res.status(409).json({ erro: "OS entregue/cancelada nao pode ser editada" });
    }
    const b = req.body || {};
    let calc;
    try { calc = prepararItens(b.itens, b.desconto); }
    catch (e) { if (e.status) return res.status(e.status).json({ erro: e.message }); throw e; }

    const data = {
      clienteId: b.clienteId || null,
      descricaoCliente: b.descricaoCliente ? String(b.descricaoCliente).trim().slice(0, 120) : null,
      telefone: b.telefone ? String(b.telefone).trim().slice(0, 40) : null,
      equipamento: b.equipamento ? String(b.equipamento).trim().slice(0, 200) : null,
      defeitoRelatado: b.defeitoRelatado ? String(b.defeitoRelatado).trim().slice(0, 1000) : null,
      diagnostico: b.diagnostico ? String(b.diagnostico).trim().slice(0, 1000) : null,
      observacoes: b.observacoes ? String(b.observacoes).trim().slice(0, 1000) : null,
      responsavelId: b.responsavelId || null,
      previsaoEntrega: b.previsaoEntrega ? new Date(b.previsaoEntrega) : null,
      valorPecas: calc.valorPecas, valorServicos: calc.valorServicos,
      desconto: calc.desconto, total: calc.total,
      itens: { deleteMany: {}, create: calc.prep },
    };
    const os = await prisma.ordemServico.update({ where: { id: req.params.id }, data, include: INCLUDE });
    res.json(serializar(os));
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Ordem de servico nao encontrada" });
    next(err);
  }
}

// PATCH /ordens-servico/:id/status — muda o status e grava o timestamp.
export async function mudarStatus(req, res, next) {
  try {
    const novo = String(req.body?.status || "").toUpperCase();
    if (!STATUS_VALIDOS.has(novo)) {
      return res.status(400).json({ erro: `Status invalido. Use: ${[...STATUS_VALIDOS].join(", ")}` });
    }
    const carimbo = {};
    const agora = new Date();
    if (novo === "PRONTA") carimbo.concluidaEm = agora;
    if (novo === "ENTREGUE") carimbo.entregueEm = agora;
    if (novo === "CANCELADA") carimbo.canceladaEm = agora;

    const os = await prisma.ordemServico.update({
      where: { id: req.params.id },
      data: { status: novo, ...carimbo },
      include: INCLUDE,
    }).catch(e => { if (e.code === "P2025") return null; throw e; });
    if (!os) return res.status(404).json({ erro: "Ordem de servico nao encontrada" });

    registrarEvento({
      acao: "OS_STATUS", modulo: "ORDEM_SERVICO", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome, tenantId: req.tenantId,
      mensagem: `OS #${os.numero} -> ${novo}`,
      req,
    });
    res.json(serializar(os));
  } catch (err) { next(err); }
}

// DELETE /ordens-servico/:id — exclui (apenas ABERTA/CANCELADA, por seguranca).
export async function excluir(req, res, next) {
  try {
    const os = await prisma.ordemServico.findUnique({ where: { id: req.params.id }, select: { id: true, status: true, numero: true } });
    if (!os) return res.status(404).json({ erro: "Ordem de servico nao encontrada" });
    if (!["ABERTA", "CANCELADA"].includes(os.status)) {
      return res.status(409).json({ erro: "Só é possível excluir OS aberta ou cancelada" });
    }
    await prisma.ordemServico.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Ordem de servico nao encontrada" });
    next(err);
  }
}
