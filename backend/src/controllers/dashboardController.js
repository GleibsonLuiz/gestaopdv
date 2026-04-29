import prisma from "../lib/prisma.js";

function inicioDoDia(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function inicioDoMes(d = new Date()) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function diasAtras(n, base = new Date()) {
  const x = inicioDoDia(base);
  x.setDate(x.getDate() - n);
  return x;
}

function toNum(v) {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function resumo(req, res, next) {
  try {
    const agora = new Date();
    const hoje = inicioDoDia(agora);
    const mesInicio = inicioDoMes(agora);
    const mesAnteriorInicio = inicioDoMes(new Date(agora.getFullYear(), agora.getMonth() - 1, 1));
    const mesAnteriorFim = mesInicio;
    const seteDiasAtras = diasAtras(6, agora);

    const [
      totalClientesAtivos,
      totalProdutosAtivos,
      totalFornecedoresAtivos,
      totalFuncionariosAtivos,
      vendasHojeAgg,
      vendasMesAgg,
      vendasMesAnteriorAgg,
      ticketMesAgg,
      comprasMesAgg,
      vendasUltimos7Raw,
      topProdutosRaw,
      topVendedoresRaw,
      formasPagamentoRaw,
      produtosEstoqueBaixo,
      contasPagarPendentesAgg,
      contasReceberPendentesAgg,
      contasPagarAtrasadasCount,
      contasReceberAtrasadasCount,
      ultimasVendas,
      ultimasCompras,
    ] = await Promise.all([
      prisma.cliente.count({ where: { ativo: true } }),
      prisma.produto.count({ where: { ativo: true } }),
      prisma.fornecedor.count({ where: { ativo: true } }),
      prisma.user.count({ where: { ativo: true } }),

      prisma.venda.aggregate({
        where: { status: "CONCLUIDA", createdAt: { gte: hoje } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      prisma.venda.aggregate({
        where: { status: "CONCLUIDA", createdAt: { gte: mesInicio } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      prisma.venda.aggregate({
        where: {
          status: "CONCLUIDA",
          createdAt: { gte: mesAnteriorInicio, lt: mesAnteriorFim },
        },
        _sum: { total: true },
        _count: { _all: true },
      }),
      prisma.venda.aggregate({
        where: { status: "CONCLUIDA", createdAt: { gte: mesInicio } },
        _avg: { total: true },
      }),
      prisma.compra.aggregate({
        where: { createdAt: { gte: mesInicio } },
        _sum: { total: true },
        _count: { _all: true },
      }),

      prisma.$queryRaw`
        SELECT
          DATE("createdAt")::text AS dia,
          COUNT(*)::int AS qtd,
          COALESCE(SUM(total), 0)::float AS total
        FROM vendas
        WHERE status = 'CONCLUIDA' AND "createdAt" >= ${seteDiasAtras}
        GROUP BY DATE("createdAt")
        ORDER BY dia ASC
      `,

      prisma.itemVenda.groupBy({
        by: ["produtoId"],
        where: {
          venda: { status: "CONCLUIDA", createdAt: { gte: mesInicio } },
        },
        _sum: { quantidade: true, subtotal: true },
        orderBy: { _sum: { quantidade: "desc" } },
        take: 5,
      }),

      prisma.venda.groupBy({
        by: ["userId"],
        where: { status: "CONCLUIDA", createdAt: { gte: mesInicio } },
        _sum: { total: true },
        _count: { _all: true },
        orderBy: { _sum: { total: "desc" } },
        take: 5,
      }),

      prisma.venda.groupBy({
        by: ["formaPagamento"],
        where: { status: "CONCLUIDA", createdAt: { gte: mesInicio } },
        _sum: { total: true },
        _count: { _all: true },
      }),

      prisma.$queryRaw`
        SELECT id, codigo, nome, estoque, "estoqueMinimo", unidade
        FROM produtos
        WHERE ativo = true AND estoque <= "estoqueMinimo"
        ORDER BY (estoque - "estoqueMinimo") ASC, nome ASC
        LIMIT 10
      `,

      prisma.contaPagar.aggregate({
        where: { status: { in: ["PENDENTE", "ATRASADA"] } },
        _sum: { valor: true },
        _count: { _all: true },
      }),
      prisma.contaReceber.aggregate({
        where: { status: { in: ["PENDENTE", "ATRASADA"] } },
        _sum: { valor: true },
        _count: { _all: true },
      }),
      prisma.contaPagar.count({
        where: {
          OR: [
            { status: "ATRASADA" },
            { status: "PENDENTE", vencimento: { lt: hoje } },
          ],
        },
      }),
      prisma.contaReceber.count({
        where: {
          OR: [
            { status: "ATRASADA" },
            { status: "PENDENTE", vencimento: { lt: hoje } },
          ],
        },
      }),

      prisma.venda.findMany({
        where: { status: "CONCLUIDA" },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          numero: true,
          total: true,
          formaPagamento: true,
          createdAt: true,
          cliente: { select: { nome: true } },
          user: { select: { nome: true } },
        },
      }),
      prisma.compra.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          numero: true,
          total: true,
          createdAt: true,
          fornecedor: { select: { nome: true } },
        },
      }),
    ]);

    // Hidrata top produtos
    const idsTopProdutos = topProdutosRaw.map(t => t.produtoId);
    const produtosTop = idsTopProdutos.length
      ? await prisma.produto.findMany({
          where: { id: { in: idsTopProdutos } },
          select: { id: true, codigo: true, nome: true, unidade: true },
        })
      : [];
    const mapaProdutos = new Map(produtosTop.map(p => [p.id, p]));
    const topProdutos = topProdutosRaw.map(t => ({
      produto: mapaProdutos.get(t.produtoId) || null,
      quantidade: t._sum.quantidade || 0,
      total: toNum(t._sum.subtotal),
    }));

    // Hidrata top vendedores
    const idsTopVendedores = topVendedoresRaw.map(t => t.userId);
    const vendedores = idsTopVendedores.length
      ? await prisma.user.findMany({
          where: { id: { in: idsTopVendedores } },
          select: { id: true, nome: true, role: true },
        })
      : [];
    const mapaUsers = new Map(vendedores.map(u => [u.id, u]));
    const topVendedores = topVendedoresRaw.map(t => ({
      user: mapaUsers.get(t.userId) || null,
      vendas: t._count._all,
      total: toNum(t._sum.total),
    }));

    // Normaliza vendas dos últimos 7 dias preenchendo dias vazios
    const mapaPorDia = new Map(
      (vendasUltimos7Raw || []).map(r => [String(r.dia).slice(0, 10), r])
    );
    const vendasPorDia = [];
    for (let i = 6; i >= 0; i--) {
      const d = diasAtras(i, agora);
      const chave = d.toISOString().slice(0, 10);
      const r = mapaPorDia.get(chave);
      vendasPorDia.push({
        dia: chave,
        qtd: r ? Number(r.qtd) : 0,
        total: r ? toNum(r.total) : 0,
      });
    }

    const vendasMes = toNum(vendasMesAgg._sum.total);
    const vendasMesAnterior = toNum(vendasMesAnteriorAgg._sum.total);
    const variacaoMes =
      vendasMesAnterior > 0
        ? ((vendasMes - vendasMesAnterior) / vendasMesAnterior) * 100
        : null;

    res.json({
      geradoEm: agora.toISOString(),
      kpis: {
        vendasHoje: {
          quantidade: vendasHojeAgg._count._all,
          total: toNum(vendasHojeAgg._sum.total),
        },
        vendasMes: {
          quantidade: vendasMesAgg._count._all,
          total: vendasMes,
          variacaoPercentual: variacaoMes,
        },
        ticketMedioMes: toNum(ticketMesAgg._avg.total),
        comprasMes: {
          quantidade: comprasMesAgg._count._all,
          total: toNum(comprasMesAgg._sum.total),
        },
        clientesAtivos: totalClientesAtivos,
        produtosAtivos: totalProdutosAtivos,
        fornecedoresAtivos: totalFornecedoresAtivos,
        funcionariosAtivos: totalFuncionariosAtivos,
        produtosEstoqueBaixo: produtosEstoqueBaixo.length,
        contasPagarPendentes: {
          quantidade: contasPagarPendentesAgg._count._all,
          total: toNum(contasPagarPendentesAgg._sum.valor),
          atrasadas: contasPagarAtrasadasCount,
        },
        contasReceberPendentes: {
          quantidade: contasReceberPendentesAgg._count._all,
          total: toNum(contasReceberPendentesAgg._sum.valor),
          atrasadas: contasReceberAtrasadasCount,
        },
      },
      vendasPorDia,
      topProdutos,
      topVendedores,
      formasPagamento: formasPagamentoRaw.map(f => ({
        formaPagamento: f.formaPagamento,
        quantidade: f._count._all,
        total: toNum(f._sum.total),
      })),
      estoqueBaixo: produtosEstoqueBaixo,
      ultimasVendas: ultimasVendas.map(v => ({
        id: v.id,
        numero: v.numero,
        total: toNum(v.total),
        formaPagamento: v.formaPagamento,
        createdAt: v.createdAt,
        cliente: v.cliente?.nome || null,
        vendedor: v.user?.nome || null,
      })),
      ultimasCompras: ultimasCompras.map(c => ({
        id: c.id,
        numero: c.numero,
        total: toNum(c.total),
        createdAt: c.createdAt,
        fornecedor: c.fornecedor?.nome || null,
      })),
    });
  } catch (err) {
    next(err);
  }
}
