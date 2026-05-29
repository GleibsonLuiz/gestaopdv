// =====================================================================
// Vendas em espera (park/hold do PDV).
//
// O operador esta atendendo um cliente que precisa sair (foi buscar mais
// um produto, esqueceu a carteira no carro, etc). Em vez de cancelar ou
// segurar o caixa, ele "salva o atendimento": congela o carrinho atual,
// libera a tela para o proximo cliente e retoma quando quiser.
//
// NAO e uma Venda — nao consome numero de venda, nao baixa estoque e nao
// toca no caixa. E so um snapshot do carrinho (Json). A venda real so
// nasce quando o operador retoma a espera e finaliza normalmente.
//
// Visivel para todo o tenant: qualquer operador pode retomar (caixa
// compartilhado / troca de turno). Tenant-scope e aplicado automaticamente
// pela extension multi-tenant do Prisma (ver lib/prisma.js).
// =====================================================================
import prisma from "../lib/prisma.js";
import { criarComNumeroRetry } from "../lib/proximoNumero.js";

const INCLUDE = {
  cliente: { select: { id: true, nome: true } },
  user: { select: { id: true, nome: true } },
};

function toNum(v) {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Sanitiza um item do carrinho para o snapshot persistido. Guardamos apenas o
// necessario para restaurar a cestinha. `estoque` NAO e salvo de proposito:
// o valor seria volatil (muda com outras vendas) e o Infinity dos servicos
// nem sobrevive ao JSON — ao retomar, o estoque e relido do produto vivo.
function sanitizarItem(it) {
  return {
    produtoId: it?.produtoId ?? null,
    codigo: it?.codigo ?? null,
    nome: (it?.nome ?? "").toString(),
    unidade: it?.unidade ?? null,
    tipoItem: it?.tipoItem === "SERVICO" ? "SERVICO" : "PRODUTO",
    imagem: it?.imagem ?? null,
    precoUnitario: toNum(it?.precoUnitario),
    quantidade: toNum(it?.quantidade),
  };
}

// GET /pdv/vendas-espera — lista todas as esperas do tenant (recentes primeiro).
export async function listar(req, res, next) {
  try {
    const esperas = await prisma.vendaEspera.findMany({
      include: INCLUDE,
      orderBy: { criadoEm: "desc" },
    });
    res.json(esperas);
  } catch (err) {
    next(err);
  }
}

// POST /pdv/vendas-espera — congela o carrinho atual como espera.
// body: { clienteId?, desconto?, observacoes?, itens: [{ produtoId, quantidade, precoUnitario, ... }] }
export async function criar(req, res, next) {
  try {
    const itensRaw = Array.isArray(req.body?.itens) ? req.body.itens : [];
    const itens = itensRaw
      .map(sanitizarItem)
      .filter((it) => it.produtoId && it.quantidade > 0);
    if (itens.length === 0) {
      return res.status(400).json({ erro: "Nao ha itens para colocar em espera" });
    }

    const subtotal = itens.reduce((acc, it) => acc + it.quantidade * it.precoUnitario, 0);
    const desconto = Math.max(0, Math.min(toNum(req.body?.desconto), subtotal));
    const total = Math.max(0, Math.round((subtotal - desconto) * 100) / 100);
    const observacoes = req.body?.observacoes
      ? String(req.body.observacoes).slice(0, 300)
      : null;
    const clienteId = req.body?.clienteId || null;
    const userId = req.user?.sub || null;

    const espera = await criarComNumeroRetry(prisma.vendaEspera, req.tenantId, (numero) =>
      prisma.vendaEspera.create({
        data: {
          numero,
          itens,
          desconto: Math.round(desconto * 100) / 100,
          total,
          observacoes,
          clienteId,
          userId,
        },
        include: INCLUDE,
      }),
    );
    res.status(201).json(espera);
  } catch (err) {
    next(err);
  }
}

// DELETE /pdv/vendas-espera/:id — remove a espera (apos retomar ou descartar).
export async function excluir(req, res, next) {
  try {
    await prisma.vendaEspera.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    // P2025 = registro nao existe / nao pertence ao tenant. Idempotente: para
    // o cliente "ja nao existe" e sucesso (a espera ja foi retomada/excluida).
    if (err.code === "P2025") return res.status(204).end();
    next(err);
  }
}
