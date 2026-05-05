import prisma from "../lib/prisma.js";
import { buscarCaixaAberto } from "./caixaController.js";

// Painel inicial do PDV: top produtos vendidos (30d) para acesso rapido +
// ultimas vendas do caixa aberto do user logado. Usado para enriquecer o
// estado vazio da cestinha — single roundtrip ao montar a tela.
export async function inicio(req, res, next) {
  try {
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    const caixa = await buscarCaixaAberto(req.user.sub);

    const [topGroups, ultimasVendas] = await Promise.all([
      prisma.itemVenda.groupBy({
        by: ["produtoId"],
        where: {
          venda: {
            status: "CONCLUIDA",
            createdAt: { gte: trintaDiasAtras },
          },
        },
        _sum: { quantidade: true },
        orderBy: { _sum: { quantidade: "desc" } },
        take: 8,
      }),
      caixa
        ? prisma.venda.findMany({
            where: { caixaId: caixa.id, status: "CONCLUIDA" },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true, numero: true, total: true, formaPagamento: true,
              createdAt: true,
              cliente: { select: { nome: true } },
              _count: { select: { itens: true } },
            },
          })
        : Promise.resolve([]),
    ]);

    const ids = topGroups.map(g => g.produtoId);
    let topProdutos = [];
    if (ids.length > 0) {
      const produtos = await prisma.produto.findMany({
        where: { id: { in: ids }, ativo: true },
        select: {
          id: true, codigo: true, codigoBarras: true, nome: true,
          precoVenda: true, estoque: true, unidade: true,
          imagem: true, tipoItem: true, referencia: true,
        },
      });
      // Preserva a ordem do ranking (groupBy ja ordenou).
      const mapa = new Map(produtos.map(p => [p.id, p]));
      topProdutos = topGroups
        .map(g => {
          const p = mapa.get(g.produtoId);
          return p ? { ...p, vendidos: g._sum.quantidade ?? 0 } : null;
        })
        .filter(Boolean);
    }

    res.json({ topProdutos, ultimasVendas });
  } catch (err) {
    next(err);
  }
}
