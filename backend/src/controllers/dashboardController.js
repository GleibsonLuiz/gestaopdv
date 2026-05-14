import prisma from "../lib/prisma.js";
import { calcularTotaisCaixa } from "./caixaController.js";

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

function fimDoMes(d = new Date()) {
  const x = inicioDoMes(d);
  x.setMonth(x.getMonth() + 1);
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
    const mesFim = fimDoMes(agora);
    const mesAnteriorInicio = inicioDoMes(new Date(agora.getFullYear(), agora.getMonth() - 1, 1));
    const mesAnteriorFim = mesInicio;
    const tresMesesAtras = inicioDoMes(new Date(agora.getFullYear(), agora.getMonth() - 3, 1));
    const seteDiasAtras = diasAtras(6, agora);
    const seteDiasFuturos = new Date(hoje);
    seteDiasFuturos.setDate(hoje.getDate() + 7);
    const sessentaDiasAtras = diasAtras(60, agora);

    // Métricas do mês (totais de dias / decorridos / restantes — usados para
    // projetar a meta mensal: quanto falta vender por dia até o fim do mês)
    const diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
    const diaAtualNoMes = agora.getDate();
    const diasRestantesMes = Math.max(1, diasNoMes - diaAtualNoMes + 1);

    const userId = req.user?.id || null;

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
      novosCLientesMesCount,
      proximasContasPagarRaw,
      proximasContasReceberRaw,
      margemMesRaw,
      valorEstoqueRaw,
      mediaUltimos3MesesRaw,
      topCategoriasRaw,
      vendasPorHoraRaw,
      clientesInativosCount,
      caixaAtualRecord,
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
        WHERE ativo = true
          AND "tipoItem" = 'PRODUTO'
          AND estoque <= "estoqueMinimo"
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

      prisma.cliente.count({ where: { createdAt: { gte: mesInicio } } }),

      prisma.contaPagar.findMany({
        where: {
          status: { in: ["PENDENTE", "ATRASADA"] },
          vencimento: { gte: hoje, lte: seteDiasFuturos },
        },
        orderBy: { vencimento: "asc" },
        take: 6,
        select: { id: true, descricao: true, valor: true, vencimento: true, status: true },
      }),

      prisma.contaReceber.findMany({
        where: {
          status: { in: ["PENDENTE", "ATRASADA"] },
          vencimento: { gte: hoje, lte: seteDiasFuturos },
        },
        orderBy: { vencimento: "asc" },
        take: 6,
        select: { id: true, descricao: true, valor: true, vencimento: true, status: true },
      }),

      // Margem bruta do mês: soma de (quantidade * (precoUnitario - precoCusto))
      // por item vendido em vendas concluídas. Produtos sem precoCusto contam
      // como margem = preco de venda (margem 100%, comum em serviços).
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(iv.quantidade * (iv."precoUnitario" - COALESCE(p."precoCusto", 0))), 0)::float AS margem,
          COALESCE(SUM(iv.subtotal), 0)::float AS faturamento
        FROM itens_venda iv
        JOIN vendas v ON v.id = iv."vendaId"
        JOIN produtos p ON p.id = iv."produtoId"
        WHERE v.status = 'CONCLUIDA' AND v."createdAt" >= ${mesInicio}
      `,

      // Valor imobilizado em estoque: SUM(estoque * precoCusto) de produtos
      // ativos do tipo PRODUTO (serviços não contam — não têm estoque físico)
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(estoque * COALESCE("precoCusto", 0)), 0)::float AS valor,
          COALESCE(SUM(estoque), 0)::int AS quantidade
        FROM produtos
        WHERE ativo = true AND "tipoItem" = 'PRODUTO'
      `,

      // Meta mensal estimada: média do faturamento dos últimos 3 meses
      // completos (exclui o atual, que está em andamento)
      prisma.$queryRaw`
        SELECT COALESCE(AVG(total_mes), 0)::float AS media
        FROM (
          SELECT
            DATE_TRUNC('month', "createdAt") AS mes,
            SUM(total) AS total_mes
          FROM vendas
          WHERE status = 'CONCLUIDA'
            AND "createdAt" >= ${tresMesesAtras}
            AND "createdAt" < ${mesInicio}
          GROUP BY mes
        ) AS t
      `,

      // Top categorias do mês (joins via raw para somar subtotal por categoria)
      prisma.$queryRaw`
        SELECT
          COALESCE(c.id, '__sem_categoria__') AS id,
          COALESCE(c.nome, 'Sem categoria') AS nome,
          COALESCE(SUM(iv.subtotal), 0)::float AS total,
          COALESCE(SUM(iv.quantidade), 0)::int AS quantidade
        FROM itens_venda iv
        JOIN vendas v ON v.id = iv."vendaId"
        JOIN produtos p ON p.id = iv."produtoId"
        LEFT JOIN categorias c ON c.id = p."categoriaId"
        WHERE v.status = 'CONCLUIDA' AND v."createdAt" >= ${mesInicio}
        GROUP BY c.id, c.nome
        ORDER BY total DESC
        LIMIT 5
      `,

      // Distribuição de vendas por hora do dia (0-23) no mês — útil pra
      // identificar pico de movimento e planejar escala
      prisma.$queryRaw`
        SELECT
          EXTRACT(HOUR FROM "createdAt")::int AS hora,
          COUNT(*)::int AS qtd,
          COALESCE(SUM(total), 0)::float AS total
        FROM vendas
        WHERE status = 'CONCLUIDA' AND "createdAt" >= ${mesInicio}
        GROUP BY hora
        ORDER BY hora ASC
      `,

      // Clientes inativos: cadastrados há mais de 60 dias e SEM vendas
      // nos últimos 60 dias. Oportunidade de reativação/CRM.
      prisma.$queryRaw`
        SELECT COUNT(*)::int AS qtd
        FROM clientes c
        WHERE c.ativo = true
          AND c."createdAt" < ${sessentaDiasAtras}
          AND NOT EXISTS (
            SELECT 1 FROM vendas v
            WHERE v."clienteId" = c.id
              AND v.status = 'CONCLUIDA'
              AND v."createdAt" >= ${sessentaDiasAtras}
          )
      `,

      // Caixa aberto do usuário logado (se houver). Pega só o registro;
      // os totais são calculados depois com calcularTotaisCaixa()
      userId
        ? prisma.caixa.findFirst({
            where: { userId, status: "ABERTO" },
            select: { id: true, numero: true, saldoInicial: true, abertoEm: true },
          })
        : Promise.resolve(null),
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

    // Margem bruta
    const margemRow = (margemMesRaw && margemMesRaw[0]) || {};
    const margemMes = toNum(margemRow.margem);
    const faturamentoComCustos = toNum(margemRow.faturamento);
    const margemPercentual = faturamentoComCustos > 0
      ? (margemMes / faturamentoComCustos) * 100
      : null;

    // Valor do estoque
    const estoqueRow = (valorEstoqueRaw && valorEstoqueRaw[0]) || {};
    const valorEstoque = toNum(estoqueRow.valor);
    const itensEmEstoque = Number(estoqueRow.quantidade) || 0;

    // Meta mensal: usa média dos 3 meses anteriores; se < 1k define piso
    // conservador (evita meta absurda na primeira execução do sistema).
    const mediaRow = (mediaUltimos3MesesRaw && mediaUltimos3MesesRaw[0]) || {};
    const metaEstimada = Math.max(1000, toNum(mediaRow.media) || vendasMesAnterior);
    const metaPercentual = metaEstimada > 0 ? (vendasMes / metaEstimada) * 100 : 0;
    const metaFaltando = Math.max(0, metaEstimada - vendasMes);
    const metaPorDia = diasRestantesMes > 0 ? metaFaltando / diasRestantesMes : 0;
    const noRitmo = metaPercentual >= (diaAtualNoMes / diasNoMes) * 100;

    // Top categorias
    const topCategorias = (topCategoriasRaw || []).map(c => ({
      id: c.id,
      nome: c.nome || "Sem categoria",
      total: toNum(c.total),
      quantidade: Number(c.quantidade) || 0,
    }));

    // Vendas por hora — preenche horas vazias (0..23) para o gráfico ficar uniforme
    const mapaHora = new Map((vendasPorHoraRaw || []).map(r => [Number(r.hora), r]));
    const vendasPorHora = [];
    for (let h = 0; h < 24; h++) {
      const r = mapaHora.get(h);
      vendasPorHora.push({
        hora: h,
        qtd: r ? Number(r.qtd) : 0,
        total: r ? toNum(r.total) : 0,
      });
    }

    // Caixa atual: calcula totais em runtime se houver caixa aberto
    let caixaAtual = null;
    if (caixaAtualRecord) {
      const totais = await calcularTotaisCaixa(
        caixaAtualRecord.id,
        Number(caixaAtualRecord.saldoInicial)
      );
      caixaAtual = {
        id: caixaAtualRecord.id,
        numero: caixaAtualRecord.numero,
        abertoEm: caixaAtualRecord.abertoEm,
        saldoInicial: Number(caixaAtualRecord.saldoInicial),
        entradas: totais.totalEntradas,
        saidas: totais.totalSaidas,
        saldoEsperado: totais.saldoEsperadoDinheiro,
      };
    }

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
        margemBrutaMes: {
          total: margemMes,
          percentual: margemPercentual,
        },
        valorEstoque: {
          total: valorEstoque,
          itens: itensEmEstoque,
        },
        metaMes: {
          estimada: metaEstimada,
          faturado: vendasMes,
          percentual: metaPercentual,
          faltando: metaFaltando,
          porDia: metaPorDia,
          diasRestantes: diasRestantesMes,
          noRitmo,
        },
        clientesAtivos: totalClientesAtivos,
        clientesInativos: Number(clientesInativosCount?.[0]?.qtd) || 0,
        produtosAtivos: totalProdutosAtivos,
        fornecedoresAtivos: totalFornecedoresAtivos,
        funcionariosAtivos: totalFuncionariosAtivos,
        produtosEstoqueBaixo: produtosEstoqueBaixo.length,
        novosCLientesMes: novosCLientesMesCount,
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
      proximasContas: {
        pagar: proximasContasPagarRaw.map(c => ({
          id: c.id,
          descricao: c.descricao,
          valor: toNum(c.valor),
          vencimento: c.vencimento,
          status: c.status,
        })),
        receber: proximasContasReceberRaw.map(c => ({
          id: c.id,
          descricao: c.descricao,
          valor: toNum(c.valor),
          vencimento: c.vencimento,
          status: c.status,
        })),
      },
      topCategorias,
      vendasPorHora,
      caixaAtual,
    });
  } catch (err) {
    next(err);
  }
}
