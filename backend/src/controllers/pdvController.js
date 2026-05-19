import prisma from "../lib/prisma.js";
import { buscarCaixaAberto } from "./caixaController.js";

// Painel inicial do PDV: top produtos vendidos (30d) para acesso rapido +
// ultimas vendas do caixa aberto do user logado. Usado para enriquecer o
// estado vazio da cestinha — single roundtrip ao montar a tela.
export async function inicio(req, res, next) {
  try {
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    const noventaDiasAtras = new Date();
    noventaDiasAtras.setDate(noventaDiasAtras.getDate() - 90);

    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);

    const caixa = await buscarCaixaAberto(req.user.sub);

    // VENDEDOR ve apenas as proprias vendas do dia (isola no modo
    // COMPARTILHADO, onde o caixa e coletivo). ADMIN e GERENTE veem tudo
    // do caixa aberto.
    const isVendedor = req.user.role === "VENDEDOR";
    const whereUltimasVendas = caixa
      ? {
          caixaId: caixa.id,
          status: "CONCLUIDA",
          ...(isVendedor && {
            userId: req.user.sub,
            createdAt: { gte: inicioDia },
          }),
        }
      : null;

    const [topGroups, ultimasVendas, vendasHojeAgg, formasHoje, formasFrequenciaRaw] = await Promise.all([
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
      whereUltimasVendas
        ? prisma.venda.findMany({
            where: whereUltimasVendas,
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true, numero: true, total: true, formaPagamento: true,
              createdAt: true,
              cliente: { select: { nome: true } },
              user: { select: { nome: true } },
              _count: { select: { itens: true } },
            },
          })
        : Promise.resolve([]),
      prisma.venda.aggregate({
        where: { status: "CONCLUIDA", createdAt: { gte: inicioDia } },
        _count: true,
        _sum: { total: true },
      }),
      prisma.venda.groupBy({
        by: ["formaPagamento"],
        where: { status: "CONCLUIDA", createdAt: { gte: inicioDia } },
        _count: true,
        _sum: { total: true },
        orderBy: { _sum: { total: "desc" } },
      }),
      // Ranking de formas de pagamento por uso real nos ultimos 90 dias.
      // Usado para reordenar dinamicamente os botoes F1-F6 do PDV: tecla
      // mais acessivel (F1) vai pra forma mais usada. Sem reescrever a
      // identidade do metodo — so a posicao na grade.
      prisma.venda.groupBy({
        by: ["formaPagamento"],
        where: { status: "CONCLUIDA", createdAt: { gte: noventaDiasAtras } },
        _count: true,
        orderBy: { _count: { formaPagamento: "desc" } },
      }),
    ]);

    const vendasCount = vendasHojeAgg._count || 0;
    const vendasTotal = Number(vendasHojeAgg._sum?.total || 0);
    const resumoDia = {
      quantidade: vendasCount,
      total: vendasTotal,
      ticketMedio: vendasCount > 0 ? vendasTotal / vendasCount : 0,
      porForma: formasHoje.map(f => ({
        formaPagamento: f.formaPagamento,
        quantidade: f._count,
        total: Number(f._sum?.total || 0),
      })),
    };

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
          // _sum.quantidade agora vem como Decimal (ItemVenda.quantidade
          // virou Decimal(12,3)). Coerce para number antes de serializar.
          return p ? { ...p, vendidos: Number(g._sum.quantidade) || 0 } : null;
        })
        .filter(Boolean);
    }

    // Frontend usa este array para reordenar a grade F1-F6. Vem do
    // backend ja ordenado (mais usado -> menos usado). Se vazio (tenant
    // novo sem historico), o frontend cai no fallback estatico.
    const formasFrequencia = formasFrequenciaRaw.map(f => ({
      formaPagamento: f.formaPagamento,
      vendas: f._count,
    }));

    res.json({ topProdutos, ultimasVendas, resumoDia, formasFrequencia });
  } catch (err) {
    next(err);
  }
}
