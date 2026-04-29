import prisma from "../lib/prisma.js";

const FORMAS_VALIDAS = new Set([
  "DINHEIRO", "CARTAO_CREDITO", "CARTAO_DEBITO", "PIX", "BOLETO", "CREDIARIO",
]);

const INCLUDE_LISTA = {
  cliente: { select: { id: true, nome: true, cpfCnpj: true } },
  user: { select: { id: true, nome: true } },
  _count: { select: { itens: true } },
};

const INCLUDE_DETALHE = {
  cliente: { select: { id: true, nome: true, cpfCnpj: true, telefone: true, email: true } },
  user: { select: { id: true, nome: true, role: true } },
  itens: {
    include: {
      produto: { select: { id: true, codigo: true, nome: true, unidade: true } },
    },
  },
};

function toNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export async function listar(req, res, next) {
  try {
    const { clienteId, userId, formaPagamento, status, dataInicio, dataFim, limite } = req.query;
    const where = {};
    if (clienteId) where.clienteId = clienteId;
    if (userId) where.userId = userId;
    if (formaPagamento && FORMAS_VALIDAS.has(formaPagamento)) where.formaPagamento = formaPagamento;
    if (status) where.status = status;
    if (dataInicio || dataFim) {
      where.createdAt = {};
      if (dataInicio) where.createdAt.gte = new Date(dataInicio);
      if (dataFim) where.createdAt.lte = new Date(dataFim + "T23:59:59.999Z");
    }
    const take = Math.min(parseInt(limite, 10) || 100, 500);
    const vendas = await prisma.venda.findMany({
      where,
      include: INCLUDE_LISTA,
      orderBy: { createdAt: "desc" },
      take,
    });
    res.json(vendas);
  } catch (err) {
    next(err);
  }
}

export async function obter(req, res, next) {
  try {
    const venda = await prisma.venda.findUnique({
      where: { id: req.params.id },
      include: INCLUDE_DETALHE,
    });
    if (!venda) return res.status(404).json({ erro: "Venda nao encontrada" });
    res.json(venda);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const { clienteId, formaPagamento, observacoes, itens } = req.body;
    const desconto = req.body.desconto !== undefined ? toNumber(req.body.desconto) : 0;

    if (!formaPagamento || !FORMAS_VALIDAS.has(formaPagamento)) {
      return res.status(400).json({ erro: "Forma de pagamento invalida" });
    }
    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: "Informe ao menos um item" });
    }
    if (desconto === null || Number.isNaN(desconto) || desconto < 0) {
      return res.status(400).json({ erro: "Desconto invalido" });
    }

    const itensNorm = [];
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      const idx = i + 1;
      if (!it?.produtoId) return res.status(400).json({ erro: `Item ${idx}: produtoId obrigatorio` });
      const qtd = parseInt(it.quantidade, 10);
      if (!Number.isFinite(qtd) || qtd <= 0) {
        return res.status(400).json({ erro: `Item ${idx}: quantidade deve ser > 0` });
      }
      const preco = toNumber(it.precoUnitario);
      if (preco === null || Number.isNaN(preco) || preco < 0) {
        return res.status(400).json({ erro: `Item ${idx}: precoUnitario invalido` });
      }
      itensNorm.push({ produtoId: it.produtoId, quantidade: qtd, precoUnitario: preco });
    }

    const subtotal = itensNorm.reduce((acc, it) => acc + it.quantidade * it.precoUnitario, 0);
    const total = Math.max(0, subtotal - desconto);

    try {
      const venda = await prisma.$transaction(async (tx) => {
        if (clienteId) {
          const c = await tx.cliente.findUnique({ where: { id: clienteId } });
          if (!c) {
            const e = new Error("Cliente nao encontrado"); e.status = 404; throw e;
          }
        }

        const produtos = await tx.produto.findMany({
          where: { id: { in: itensNorm.map(i => i.produtoId) } },
        });
        const mapaProdutos = new Map(produtos.map(p => [p.id, p]));

        for (const it of itensNorm) {
          const p = mapaProdutos.get(it.produtoId);
          if (!p) {
            const e = new Error(`Produto ${it.produtoId} nao encontrado`); e.status = 404; throw e;
          }
          if (!p.ativo) {
            const e = new Error(`Produto "${p.nome}" esta inativo`); e.status = 400; throw e;
          }
          if (p.estoque < it.quantidade) {
            const e = new Error(`Estoque insuficiente de "${p.nome}". Disponivel: ${p.estoque}, solicitado: ${it.quantidade}`);
            e.status = 400; throw e;
          }
        }

        const vendaCriada = await tx.venda.create({
          data: {
            clienteId: clienteId || null,
            userId: req.user.sub,
            formaPagamento,
            status: "CONCLUIDA",
            desconto,
            total,
            observacoes: observacoes ? String(observacoes).trim() : null,
            itens: {
              create: itensNorm.map(it => ({
                produtoId: it.produtoId,
                quantidade: it.quantidade,
                precoUnitario: it.precoUnitario,
                subtotal: it.quantidade * it.precoUnitario,
              })),
            },
          },
          include: INCLUDE_DETALHE,
        });

        for (const it of itensNorm) {
          const p = mapaProdutos.get(it.produtoId);
          const antes = p.estoque;
          const depois = antes - it.quantidade;
          await tx.produto.update({
            where: { id: it.produtoId },
            data: { estoque: depois },
          });
          await tx.movimentacaoEstoque.create({
            data: {
              tipo: "SAIDA",
              quantidade: it.quantidade,
              estoqueAntes: antes,
              estoqueDepois: depois,
              motivo: `VENDA #${vendaCriada.numero}`,
              produtoId: it.produtoId,
              userId: req.user.sub,
            },
          });
        }

        return vendaCriada;
      });

      res.status(201).json(venda);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

export async function cancelar(req, res, next) {
  try {
    const id = req.params.id;
    try {
      const venda = await prisma.$transaction(async (tx) => {
        const atual = await tx.venda.findUnique({
          where: { id },
          include: { itens: true },
        });
        if (!atual) {
          const e = new Error("Venda nao encontrada"); e.status = 404; throw e;
        }
        if (atual.status === "CANCELADA") {
          const e = new Error("Venda ja esta cancelada"); e.status = 400; throw e;
        }

        const cancelada = await tx.venda.update({
          where: { id },
          data: { status: "CANCELADA" },
          include: INCLUDE_DETALHE,
        });

        // Estorno: cria ENTRADA para cada item e devolve ao estoque
        for (const it of atual.itens) {
          const prod = await tx.produto.findUnique({ where: { id: it.produtoId } });
          const antes = prod.estoque;
          const depois = antes + it.quantidade;
          await tx.produto.update({
            where: { id: it.produtoId },
            data: { estoque: depois },
          });
          await tx.movimentacaoEstoque.create({
            data: {
              tipo: "ENTRADA",
              quantidade: it.quantidade,
              estoqueAntes: antes,
              estoqueDepois: depois,
              motivo: `CANCELAMENTO VENDA #${atual.numero}`,
              produtoId: it.produtoId,
              userId: req.user.sub,
            },
          });
        }

        return cancelada;
      });

      res.json(venda);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      throw err;
    }
  } catch (err) {
    next(err);
  }
}
