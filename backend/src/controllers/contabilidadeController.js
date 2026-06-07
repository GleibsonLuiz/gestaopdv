// ============ CONTABILIDADE: CONSOLIDACAO PARA O CONTADOR ============
//
// Consolida, num periodo, os lancamentos que interessam a contabilidade:
//   - DESPESA      (saida) — despesas operacionais classificadas no plano
//   - CONTA_PAGAR  (saida) — contas a pagar QUITADAS no periodo
//   - NOTA_FISCAL  (entrada) — NFC-e/NF-e/NFS-e AUTORIZADAS (receita)
//
// Tudo via Prisma (filtrado por tenant automaticamente). O CSV e o layout
// para o sistema do contador (Dominio/Alterdata) sao montados no frontend a
// partir deste JSON — mesmo padrao dos relatorios em PDF (export client-side).
//
// Gate: requirePermissao("CONTABILIDADE") na rota — leitura para o contador.

import prisma from "../lib/prisma.js";
import { parseDate } from "../lib/contas.js";

// Resolve o intervalo [inicio, fim] da query. Default: mes corrente.
function intervalo(req) {
  const hoje = new Date();
  const inicio = parseDate(req.query.inicio)
    || new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fim = req.query.fim
    ? new Date(req.query.fim + "T23:59:59.999Z")
    : hoje;
  return { inicio, fim };
}

export async function lancamentos(req, res, next) {
  try {
    const { inicio, fim } = intervalo(req);
    const linhas = [];

    // --- Despesas operacionais (saida) ---
    const despesas = await prisma.despesa.findMany({
      where: { data: { gte: inicio, lte: fim } },
      include: {
        planoConta: true,
        fornecedor: { select: { nome: true, cnpj: true } },
        anexos: { select: { url: true, nomeOriginal: true }, take: 1 },
      },
      orderBy: { data: "asc" },
    });
    for (const d of despesas) {
      linhas.push({
        tipo: "DESPESA",
        fluxo: "SAIDA",
        data: d.data,
        valor: Number(d.valor),
        historico: d.descricao,
        documento: `DESP ${d.numero}`,
        contaCodigo: d.planoConta?.codigo || null,
        contaNome: d.planoConta?.nome || null,
        contaExterna: d.planoConta?.codigoContabilExterno || null,
        contraparte: d.fornecedor?.nome || null,
        contraparteDoc: d.fornecedor?.cnpj || null,
        formaPagamento: d.formaPagamento,
        comprovanteUrl: d.anexos[0]?.url || null,
      });
    }

    // --- Contas a pagar quitadas no periodo (saida) ---
    const contas = await prisma.contaPagar.findMany({
      where: { status: "PAGA", pagamento: { gte: inicio, lte: fim } },
      include: {
        planoConta: true,
        fornecedor: { select: { nome: true, cnpj: true } },
      },
      orderBy: { pagamento: "asc" },
    });
    for (const c of contas) {
      linhas.push({
        tipo: "CONTA_PAGAR",
        fluxo: "SAIDA",
        data: c.pagamento,
        valor: Number(c.valor),
        historico: c.descricao,
        documento: c.parcelaTotal ? `CP ${c.parcelaAtual}/${c.parcelaTotal}` : "CP",
        contaCodigo: c.planoConta?.codigo || null,
        contaNome: c.planoConta?.nome || null,
        contaExterna: c.planoConta?.codigoContabilExterno || null,
        contraparte: c.fornecedor?.nome || null,
        contraparteDoc: c.fornecedor?.cnpj || null,
        formaPagamento: null,
        comprovanteUrl: null,
      });
    }

    // --- Notas fiscais autorizadas (receita / entrada) ---
    const notas = await prisma.notaFiscal.findMany({
      where: { status: "AUTORIZADA", dataAutorizacao: { gte: inicio, lte: fim } },
      select: {
        dataAutorizacao: true, valorTotal: true, modelo: true,
        serie: true, numeroFiscal: true, destNome: true, destCpfCnpj: true,
      },
      orderBy: { dataAutorizacao: "asc" },
    });
    for (const n of notas) {
      linhas.push({
        tipo: "NOTA_FISCAL",
        fluxo: "ENTRADA",
        data: n.dataAutorizacao,
        valor: Number(n.valorTotal),
        historico: `Receita ${n.modelo} ${n.serie}/${n.numeroFiscal}`,
        documento: `${n.serie}/${n.numeroFiscal}`,
        contaCodigo: "4.1",
        contaNome: "Receita de Vendas",
        contaExterna: null,
        contraparte: n.destNome || "Consumidor",
        contraparteDoc: n.destCpfCnpj || null,
        formaPagamento: null,
        comprovanteUrl: null,
      });
    }

    linhas.sort((a, b) => new Date(a.data) - new Date(b.data));

    // --- Resumo: totais + despesas agrupadas por categoria ---
    const totalSaidas = linhas.filter(l => l.fluxo === "SAIDA").reduce((s, l) => s + l.valor, 0);
    const totalEntradas = linhas.filter(l => l.fluxo === "ENTRADA").reduce((s, l) => s + l.valor, 0);

    const mapaCat = new Map();
    for (const l of linhas) {
      if (l.fluxo !== "SAIDA") continue;
      const nome = l.contaNome || "Sem categoria";
      mapaCat.set(nome, (mapaCat.get(nome) || 0) + l.valor);
    }
    const porCategoria = [...mapaCat.entries()]
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);

    res.json({
      inicio, fim,
      resumo: {
        totalSaidas,
        totalEntradas,
        saldo: totalEntradas - totalSaidas,
        qtd: linhas.length,
        porCategoria,
      },
      linhas,
    });
  } catch (err) {
    next(err);
  }
}

// ============ DASHBOARD FINANCEIRO (painel executivo) ============
//
// Visao gerencial (dono), nao o fechamento do contador. Tudo agregado no
// banco (SUM/COUNT/GROUP BY) para carregar rapido mesmo com muitos lancamentos.
//
// Cuidado com DUPLA CONTAGEM de receita: uma venda no crediario gera tambem
// uma ContaReceber. Se somassemos "vendas PDV" + "todas as contas recebidas",
// o crediario contaria duas vezes. Por isso so somamos contas a receber
// recebidas SEM vinculo de venda (vendaId null = recebimentos avulsos).
//
// Regime: caixa. Receita = dinheiro que entrou no periodo; despesa = dinheiro
// que saiu (despesa operacional + conta a pagar quitada) no periodo.
export async function dashboard(req, res, next) {
  try {
    const { inicio, fim } = intervalo(req);
    const tenantId = req.tenantId; // necessario nas $queryRaw (extension nao filtra raw)

    // Janela de projecao: hoje (00:00) ate +30 dias.
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const em30dias = new Date(hoje);
    em30dias.setDate(em30dias.getDate() + 30);

    const [
      vendasAgg,
      recebAvulsosAgg,
      despesasAgg,
      contasPagasAgg,
      despPorCatRaw,
      pagPorCatRaw,
      margemRaw,
      serieRaw,
      projReceberRaw,
      projPagarRaw,
      atrasadoReceberAgg,
      atrasadoPagarAgg,
      caixasAbertos,
    ] = await Promise.all([
      // Receita do PDV (regime de caixa): vendas concluidas no periodo.
      prisma.venda.aggregate({
        where: { status: "CONCLUIDA", createdAt: { gte: inicio, lte: fim } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      // Recebimentos avulsos (sem venda vinculada) para nao duplicar crediario.
      prisma.contaReceber.aggregate({
        where: { status: "PAGA", recebimento: { gte: inicio, lte: fim }, vendaId: null },
        _sum: { valor: true },
        _count: { _all: true },
      }),
      // Despesas operacionais no periodo (competencia = data do gasto).
      prisma.despesa.aggregate({
        where: { data: { gte: inicio, lte: fim } },
        _sum: { valor: true },
        _count: { _all: true },
      }),
      // Contas a pagar quitadas no periodo.
      prisma.contaPagar.aggregate({
        where: { status: "PAGA", pagamento: { gte: inicio, lte: fim } },
        _sum: { valor: true },
        _count: { _all: true },
      }),

      // Distribuicao de despesas por categoria do plano de contas.
      // Despesas + contas pagas, agrupadas pelo codigo/nome da conta.
      prisma.$queryRaw`
        SELECT pc.codigo, pc.nome, COALESCE(SUM(d.valor), 0)::float AS valor
        FROM despesas d
        JOIN plano_contas pc ON pc.id = d."planoContaId"
        WHERE d.data >= ${inicio} AND d.data <= ${fim}
          AND d."tenantId" = ${tenantId}
        GROUP BY pc.codigo, pc.nome
      `,
      prisma.$queryRaw`
        SELECT pc.codigo, pc.nome, COALESCE(SUM(c.valor), 0)::float AS valor
        FROM contas_pagar c
        JOIN plano_contas pc ON pc.id = c."planoContaId"
        WHERE c.status = 'PAGA' AND c.pagamento >= ${inicio} AND c.pagamento <= ${fim}
          AND c."tenantId" = ${tenantId}
        GROUP BY pc.codigo, pc.nome
      `,

      // CMV e faturamento p/ margem de contribuicao (Ponto de Equilibrio).
      // Produtos sem precoCusto contam custo 0 (margem 100%, comum em servicos).
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(iv.quantidade * COALESCE(p."precoCusto", 0)), 0)::float AS cmv,
          COALESCE(SUM(iv.subtotal), 0)::float AS faturamento
        FROM itens_venda iv
        JOIN vendas v ON v.id = iv."vendaId"
        JOIN produtos p ON p.id = iv."produtoId"
        WHERE v.status = 'CONCLUIDA'
          AND v."createdAt" >= ${inicio} AND v."createdAt" <= ${fim}
          AND v."tenantId" = ${tenantId}
      `,

      // Serie diaria entradas (vendas) x saidas (despesas + contas pagas).
      // Uma unica passada por tabela, unidas por dia no frontend.
      prisma.$queryRaw`
        SELECT dia, SUM(entrada)::float AS entrada, SUM(saida)::float AS saida FROM (
          SELECT DATE(v."createdAt")::text AS dia, v.total AS entrada, 0 AS saida
            FROM vendas v
            WHERE v.status = 'CONCLUIDA' AND v."createdAt" >= ${inicio} AND v."createdAt" <= ${fim}
              AND v."tenantId" = ${tenantId}
          UNION ALL
          SELECT DATE(d.data)::text AS dia, 0 AS entrada, d.valor AS saida
            FROM despesas d
            WHERE d.data >= ${inicio} AND d.data <= ${fim} AND d."tenantId" = ${tenantId}
          UNION ALL
          SELECT DATE(c.pagamento)::text AS dia, 0 AS entrada, c.valor AS saida
            FROM contas_pagar c
            WHERE c.status = 'PAGA' AND c.pagamento >= ${inicio} AND c.pagamento <= ${fim}
              AND c."tenantId" = ${tenantId}
        ) t
        GROUP BY dia ORDER BY dia ASC
      `,

      // Projecao 30 dias: contas a receber e a pagar por dia de vencimento.
      prisma.$queryRaw`
        SELECT DATE("vencimento")::text AS dia, COALESCE(SUM(valor), 0)::float AS total
        FROM contas_receber
        WHERE status IN ('PENDENTE', 'ATRASADA')
          AND "vencimento" >= ${hoje} AND "vencimento" < ${em30dias}
          AND "tenantId" = ${tenantId}
        GROUP BY DATE("vencimento") ORDER BY dia ASC
      `,
      prisma.$queryRaw`
        SELECT DATE("vencimento")::text AS dia, COALESCE(SUM(valor), 0)::float AS total
        FROM contas_pagar
        WHERE status IN ('PENDENTE', 'ATRASADA')
          AND "vencimento" >= ${hoje} AND "vencimento" < ${em30dias}
          AND "tenantId" = ${tenantId}
        GROUP BY DATE("vencimento") ORDER BY dia ASC
      `,

      // Vencidos (vencimento < hoje, ainda em aberto): entram no "dia 0" da
      // projecao como obrigacao/credito imediato.
      prisma.contaReceber.aggregate({
        where: { status: { in: ["PENDENTE", "ATRASADA"] }, vencimento: { lt: hoje } },
        _sum: { valor: true },
      }),
      prisma.contaPagar.aggregate({
        where: { status: { in: ["PENDENTE", "ATRASADA"] }, vencimento: { lt: hoje } },
        _sum: { valor: true },
      }),

      // Saldo inicial estimado da projecao: soma do saldo inicial dos caixas
      // abertos (melhor proxy disponivel de "dinheiro em caixa agora").
      prisma.caixa.aggregate({
        where: { status: "ABERTO" },
        _sum: { saldoInicial: true },
      }),
    ]);

    const num = (v) => Number(v || 0);

    // --- KPIs de receita/despesa ---
    const vendasPdv = num(vendasAgg._sum.total);
    const recebimentosAvulsos = num(recebAvulsosAgg._sum.valor);
    const receitas = vendasPdv + recebimentosAvulsos;

    const despesasOperacionais = num(despesasAgg._sum.valor);
    const contasPagas = num(contasPagasAgg._sum.valor);
    const despesasTotais = despesasOperacionais + contasPagas;

    const faturamentoLiquido = receitas - despesasTotais;

    // --- Distribuicao por categoria (despesas + contas pagas) ---
    const mapaCat = new Map();
    for (const r of [...despPorCatRaw, ...pagPorCatRaw]) {
      const chave = r.codigo || r.nome;
      const atual = mapaCat.get(chave) || { codigo: r.codigo, nome: r.nome, valor: 0 };
      atual.valor += num(r.valor);
      mapaCat.set(chave, atual);
    }
    const despesasPorCategoria = [...mapaCat.values()]
      .filter((c) => c.valor > 0)
      .sort((a, b) => b.valor - a.valor);

    // --- Margem de contribuicao + Ponto de Equilibrio ---
    const margemRow = (margemRaw && margemRaw[0]) || {};
    const cmv = num(margemRow.cmv);
    const fatItens = num(margemRow.faturamento);
    const margemContribuicaoPct = fatItens > 0 ? (fatItens - cmv) / fatItens : 0;
    // Custos fixos do periodo = despesas operacionais + contas pagas (overhead,
    // separado do CMV que ja e variavel). Equilibrio = custos fixos / margem%.
    const custosFixos = despesasTotais;
    const faturamentoEquilibrio =
      margemContribuicaoPct > 0 ? custosFixos / margemContribuicaoPct : null;
    const atingidoPct =
      faturamentoEquilibrio && faturamentoEquilibrio > 0
        ? (vendasPdv / faturamentoEquilibrio) * 100
        : null;

    // --- Serie diaria (entradas x saidas) ---
    const serie = serieRaw.map((r) => ({
      dia: r.dia,
      entrada: num(r.entrada),
      saida: num(r.saida),
    }));

    // --- Projecao de fluxo de caixa (30 dias) ---
    const mapaReceber = new Map(projReceberRaw.map((r) => [r.dia, num(r.total)]));
    const mapaPagar = new Map(projPagarRaw.map((r) => [r.dia, num(r.total)]));
    const saldoInicial = num(caixasAbertos._sum.saldoInicial);
    const atrasadoReceber = num(atrasadoReceberAgg._sum.valor);
    const atrasadoPagar = num(atrasadoPagarAgg._sum.valor);

    const projecao = [];
    let saldoAcum = saldoInicial;
    for (let i = 0; i < 30; i++) {
      const d = new Date(hoje);
      d.setDate(d.getDate() + i);
      const chave = d.toISOString().slice(0, 10);
      let aReceber = mapaReceber.get(chave) || 0;
      let aPagar = mapaPagar.get(chave) || 0;
      if (i === 0) { aReceber += atrasadoReceber; aPagar += atrasadoPagar; }
      saldoAcum += aReceber - aPagar;
      projecao.push({
        dia: chave,
        aReceber,
        aPagar,
        saldoAcumulado: saldoAcum,
        alerta: saldoAcum < 0,
      });
    }

    res.json({
      periodo: { inicio, fim },
      kpis: {
        receitas: { vendasPdv, recebimentosAvulsos, total: receitas, qtdVendas: vendasAgg._count._all },
        despesas: { operacionais: despesasOperacionais, contasPagas, total: despesasTotais },
        faturamentoLiquido,
        margemContribuicaoPct,
        cmv,
      },
      despesasPorCategoria,
      breakeven: {
        custosFixos,
        margemContribuicaoPct,
        faturamentoEquilibrio,
        faturamentoAtual: vendasPdv,
        atingidoPct,
      },
      serie,
      projecao: {
        saldoInicial,
        atrasadoReceber,
        atrasadoPagar,
        dias: projecao,
      },
    });
  } catch (err) {
    next(err);
  }
}
