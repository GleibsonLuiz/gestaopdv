import crypto from "node:crypto";
import prisma, { prismaRaw } from "../lib/prisma.js";
import { criarComNumeroRetry } from "../lib/proximoNumero.js";
import { empresaTemModulo } from "../lib/modulosPlano.js";
import { registrarEvento } from "../middlewares/auditoria.js";

// ============ CARDAPIO DIGITAL (PEDIDO ONLINE) ============
//
// Pagina PUBLICA por empresa (chave = cardapioToken) onde o cliente final
// monta o pedido sem login. Ao enviar, cria uma Comanda (DELIVERY/VIAGEM,
// status NOVO) que cai na Central de Comandas. Sem tenantStorage aqui —
// resolvemos a empresa pelo token e usamos prismaRaw (cross-tenant) com
// tenantId explicito.

const TIPOS_PUBLICOS = new Set(["DELIVERY", "VIAGEM"]);

function gerarToken() {
  return crypto.randomBytes(9).toString("base64url"); // ~12 chars URL-safe
}

// Resolve a empresa pelo token e valida que o cardapio esta disponivel.
// Retorna a empresa ou null (com o motivo ja respondido no res).
async function resolverCardapio(token, res) {
  if (!token) { res.status(404).json({ erro: "Cardapio nao encontrado" }); return null; }
  const empresa = await prismaRaw.empresa.findUnique({
    where: { cardapioToken: token },
    select: { id: true, nome: true, ativo: true, cardapioAtivo: true, plano: true, modulosHabilitados: true },
  });
  if (!empresa || !empresa.ativo || !empresa.cardapioAtivo) {
    res.status(404).json({ erro: "Cardapio indisponivel" });
    return null;
  }
  if (!empresaTemModulo(empresa, "CARDAPIO")) {
    res.status(404).json({ erro: "Cardapio indisponivel" });
    return null;
  }
  return empresa;
}

// GET /cardapio/:token — [PUBLICO] menu da loja: produtos ativos agrupados por
// categoria. So id/nome/preco — nada sensivel.
export async function obterCardapioPublico(req, res, next) {
  try {
    const empresa = await resolverCardapio(req.params.token, res);
    if (!empresa) return;

    const [produtos, categorias] = await Promise.all([
      prismaRaw.produto.findMany({
        where: { tenantId: empresa.id, ativo: true },
        select: { id: true, nome: true, precoVenda: true, categoriaId: true },
        orderBy: { nome: "asc" },
      }),
      prismaRaw.categoria.findMany({
        where: { tenantId: empresa.id },
        select: { id: true, nome: true },
      }),
    ]);

    const nomeCat = new Map(categorias.map(c => [c.id, c.nome]));
    const grupos = new Map();
    for (const p of produtos) {
      const cat = p.categoriaId ? (nomeCat.get(p.categoriaId) || "Outros") : "Outros";
      if (!grupos.has(cat)) grupos.set(cat, []);
      grupos.get(cat).push({ id: p.id, nome: p.nome, preco: Number(p.precoVenda) });
    }
    const categoriasOut = [...grupos.entries()]
      .map(([nome, itens]) => ({ nome, itens }))
      .sort((a, b) => a.nome.localeCompare(b.nome));

    res.json({
      empresa: { nome: empresa.nome },
      categorias: categoriasOut,
    });
  } catch (err) {
    next(err);
  }
}

// POST /cardapio/:token/pedido — [PUBLICO] cria a comanda do pedido online.
// Body: { nome, telefone, endereco?, tipo, itens:[{produtoId, quantidade}], observacoes? }
export async function criarPedidoPublico(req, res, next) {
  try {
    const empresa = await resolverCardapio(req.params.token, res);
    if (!empresa) return;

    const nome = String(req.body?.nome || "").trim().slice(0, 120);
    const telefone = String(req.body?.telefone || "").trim().slice(0, 40);
    const endereco = String(req.body?.endereco || "").trim().slice(0, 300);
    const tipo = TIPOS_PUBLICOS.has(req.body?.tipo) ? req.body.tipo : "DELIVERY";
    const obsCliente = String(req.body?.observacoes || "").trim().slice(0, 400);
    const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];

    if (!nome) return res.status(400).json({ erro: "Informe seu nome" });
    if (!telefone) return res.status(400).json({ erro: "Informe um telefone de contato" });
    if (tipo === "DELIVERY" && !endereco) {
      return res.status(400).json({ erro: "Informe o endereco de entrega" });
    }
    if (itens.length === 0) return res.status(400).json({ erro: "Adicione ao menos 1 item ao pedido" });

    // Preco e calculado no servidor (nunca confia no cliente).
    const ids = [...new Set(itens.map(i => i.produtoId).filter(Boolean))];
    const produtos = await prismaRaw.produto.findMany({
      where: { id: { in: ids }, tenantId: empresa.id, ativo: true },
      select: { id: true, nome: true, precoVenda: true },
    });
    const mapa = new Map(produtos.map(p => [p.id, p]));

    const itensPrep = [];
    let total = 0;
    for (const it of itens) {
      const p = mapa.get(it.produtoId);
      if (!p) return res.status(400).json({ erro: "Um dos produtos nao esta mais disponivel" });
      const qtd = Math.max(1, Math.min(999, Math.floor(Number(it.quantidade) || 0)));
      if (qtd <= 0) continue;
      const preco = Number(p.precoVenda);
      const subtotal = Math.round(preco * qtd * 100) / 100;
      total += subtotal;
      itensPrep.push({
        produtoId: p.id, quantidade: qtd, precoUnitario: preco, subtotal,
        tenantId: empresa.id,
      });
    }
    if (itensPrep.length === 0) return res.status(400).json({ erro: "Pedido sem itens validos" });
    total = Math.round(total * 100) / 100;

    const observacoes = `PEDIDO ONLINE — ${nome}${obsCliente ? ` · ${obsCliente}` : ""}`.slice(0, 500);

    const comanda = await criarComNumeroRetry(prismaRaw.comanda, empresa.id, (numero) =>
      prismaRaw.comanda.create({
        data: {
          numero,
          tipo,
          status: "NOVO",
          total,
          telefoneContato: telefone,
          enderecoEntrega: tipo === "DELIVERY" ? endereco : null,
          observacoes,
          tenantId: empresa.id,
          itens: { create: itensPrep },
        },
        select: { id: true, numero: true },
      })
    );

    registrarEvento({
      acao: "PEDIDO_ONLINE", modulo: "CARDAPIO", sucesso: true,
      tenantId: empresa.id,
      mensagem: `Pedido online #${comanda.numero} (${tipo}) de ${nome} — ${total.toFixed(2)}`,
      req,
    });

    res.status(201).json({ ok: true, numero: comanda.numero, total });
  } catch (err) {
    next(err);
  }
}

// ============ ADMIN (autenticado) ============

// GET /empresa/cardapio — status do cardapio + link publico.
export async function statusCardapio(req, res, next) {
  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: req.tenantId },
      select: { cardapioToken: true, cardapioAtivo: true },
    });
    if (!empresa) return res.status(404).json({ erro: "Empresa nao encontrada" });
    res.json({
      ativo: empresa.cardapioAtivo,
      token: empresa.cardapioToken,
      // O frontend monta a URL final com a propria origin.
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /empresa/cardapio — liga/desliga o cardapio (gera token na 1a ativacao)
// ou rotaciona o token. Body: { ativo?: boolean, rotacionarToken?: boolean }.
export async function configurarCardapio(req, res, next) {
  try {
    const atual = await prisma.empresa.findUnique({
      where: { id: req.tenantId },
      select: { cardapioToken: true, cardapioAtivo: true },
    });
    if (!atual) return res.status(404).json({ erro: "Empresa nao encontrada" });

    const data = {};
    if (typeof req.body?.ativo === "boolean") data.cardapioAtivo = req.body.ativo;
    // Gera token na primeira ativacao, ou se pedirem rotacao.
    if ((data.cardapioAtivo && !atual.cardapioToken) || req.body?.rotacionarToken) {
      data.cardapioToken = gerarToken();
    }

    const atualizada = await prisma.empresa.update({
      where: { id: req.tenantId },
      data,
      select: { cardapioToken: true, cardapioAtivo: true },
    });

    registrarEvento({
      acao: "CARDAPIO_CONFIG", modulo: "CARDAPIO", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome, tenantId: req.tenantId,
      mensagem: `Cardapio ${atualizada.cardapioAtivo ? "ativado" : "desativado"}${data.cardapioToken ? " (novo token)" : ""}`,
      req,
    });

    res.json({ ativo: atualizada.cardapioAtivo, token: atualizada.cardapioToken });
  } catch (err) {
    next(err);
  }
}
