import prisma from "../lib/prisma.js";

function inicioDoDia(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fimDoDia(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parseDataInicio(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : inicioDoDia(d);
}

function parseDataFim(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : fimDoDia(d);
}

function toNum(v) {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function relatorioVendas(req, res, next) {
  try {
    const { dataInicio, dataFim, formaPagamento, clienteId, userId } = req.query;
    const di = parseDataInicio(dataInicio);
    const df = parseDataFim(dataFim);

    const where = { status: "CONCLUIDA" };
    if (di || df) where.createdAt = {};
    if (di) where.createdAt.gte = di;
    if (df) where.createdAt.lte = df;
    if (formaPagamento) where.formaPagamento = formaPagamento;
    if (clienteId) where.clienteId = clienteId;
    if (userId) where.userId = userId;

    const [vendas, agregado, formasPagamento, topProdutosRaw] = await Promise.all([
      prisma.venda.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          cliente: { select: { nome: true } },
          user: { select: { nome: true } },
          itens: {
            include: { produto: { select: { codigo: true, nome: true } } },
          },
        },
      }),
      prisma.venda.aggregate({
        where,
        _sum: { total: true, desconto: true },
        _count: { _all: true },
        _avg: { total: true },
      }),
      prisma.venda.groupBy({
        by: ["formaPagamento"],
        where,
        _sum: { total: true },
        _count: { _all: true },
      }),
      prisma.itemVenda.groupBy({
        by: ["produtoId"],
        where: { venda: where },
        _sum: { quantidade: true, subtotal: true },
        orderBy: { _sum: { subtotal: "desc" } },
        take: 10,
      }),
    ]);

    const idsTop = topProdutosRaw.map(t => t.produtoId);
    const produtos = idsTop.length
      ? await prisma.produto.findMany({
          where: { id: { in: idsTop } },
          select: { id: true, codigo: true, nome: true, unidade: true },
        })
      : [];
    const mapaProd = new Map(produtos.map(p => [p.id, p]));
    const topProdutos = topProdutosRaw.map(t => ({
      produto: mapaProd.get(t.produtoId) || null,
      quantidade: t._sum.quantidade || 0,
      total: toNum(t._sum.subtotal),
    }));

    res.json({
      geradoEm: new Date().toISOString(),
      filtros: {
        dataInicio: di ? di.toISOString() : null,
        dataFim: df ? df.toISOString() : null,
        formaPagamento: formaPagamento || null,
        clienteId: clienteId || null,
        userId: userId || null,
      },
      resumo: {
        totalVendas: agregado._count._all,
        faturamento: toNum(agregado._sum.total),
        ticketMedio: toNum(agregado._avg.total),
        descontoTotal: toNum(agregado._sum.desconto),
      },
      formasPagamento: formasPagamento.map(f => ({
        formaPagamento: f.formaPagamento,
        quantidade: f._count._all,
        total: toNum(f._sum.total),
      })),
      topProdutos,
      vendas: vendas.map(v => ({
        id: v.id,
        numero: v.numero,
        createdAt: v.createdAt,
        formaPagamento: v.formaPagamento,
        total: toNum(v.total),
        desconto: toNum(v.desconto),
        cliente: v.cliente?.nome || null,
        vendedor: v.user?.nome || null,
        qtdItens: v.itens.length,
        itens: v.itens.map(i => ({
          codigo: i.produto?.codigo,
          nome: i.produto?.nome,
          quantidade: i.quantidade,
          precoUnitario: toNum(i.precoUnitario),
          subtotal: toNum(i.subtotal),
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function relatorioCompras(req, res, next) {
  try {
    const { dataInicio, dataFim, fornecedorId } = req.query;
    const di = parseDataInicio(dataInicio);
    const df = parseDataFim(dataFim);

    const where = {};
    if (di || df) where.createdAt = {};
    if (di) where.createdAt.gte = di;
    if (df) where.createdAt.lte = df;
    if (fornecedorId) where.fornecedorId = fornecedorId;

    const [compras, agregado, porFornecedorRaw] = await Promise.all([
      prisma.compra.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          fornecedor: { select: { nome: true, cnpj: true } },
          itens: {
            include: { produto: { select: { codigo: true, nome: true } } },
          },
        },
      }),
      prisma.compra.aggregate({
        where,
        _sum: { total: true },
        _count: { _all: true },
        _avg: { total: true },
      }),
      prisma.compra.groupBy({
        by: ["fornecedorId"],
        where,
        _sum: { total: true },
        _count: { _all: true },
        orderBy: { _sum: { total: "desc" } },
        take: 10,
      }),
    ]);

    const idsForn = porFornecedorRaw.map(t => t.fornecedorId);
    const fornecedores = idsForn.length
      ? await prisma.fornecedor.findMany({
          where: { id: { in: idsForn } },
          select: { id: true, nome: true, cnpj: true },
        })
      : [];
    const mapaForn = new Map(fornecedores.map(f => [f.id, f]));
    const topFornecedores = porFornecedorRaw.map(t => ({
      fornecedor: mapaForn.get(t.fornecedorId) || null,
      quantidade: t._count._all,
      total: toNum(t._sum.total),
    }));

    res.json({
      geradoEm: new Date().toISOString(),
      filtros: {
        dataInicio: di ? di.toISOString() : null,
        dataFim: df ? df.toISOString() : null,
        fornecedorId: fornecedorId || null,
      },
      resumo: {
        totalCompras: agregado._count._all,
        valorTotal: toNum(agregado._sum.total),
        ticketMedio: toNum(agregado._avg.total),
      },
      topFornecedores,
      compras: compras.map(c => ({
        id: c.id,
        numero: c.numero,
        createdAt: c.createdAt,
        total: toNum(c.total),
        fornecedor: c.fornecedor?.nome || null,
        fornecedorCnpj: c.fornecedor?.cnpj || null,
        qtdItens: c.itens.length,
        itens: c.itens.map(i => ({
          codigo: i.produto?.codigo,
          nome: i.produto?.nome,
          quantidade: i.quantidade,
          precoUnitario: toNum(i.precoUnitario),
          subtotal: toNum(i.subtotal),
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function relatorioFinanceiro(req, res, next) {
  try {
    const { dataInicio, dataFim, tipo } = req.query;
    const di = parseDataInicio(dataInicio);
    const df = parseDataFim(dataFim);

    const wherePagar = {};
    const whereReceber = {};
    if (di || df) {
      wherePagar.vencimento = {};
      whereReceber.vencimento = {};
      if (di) {
        wherePagar.vencimento.gte = di;
        whereReceber.vencimento.gte = di;
      }
      if (df) {
        wherePagar.vencimento.lte = df;
        whereReceber.vencimento.lte = df;
      }
    }

    const incluirPagar = !tipo || tipo === "pagar";
    const incluirReceber = !tipo || tipo === "receber";

    const [
      contasPagar,
      contasReceber,
      pagarPorStatusRaw,
      receberPorStatusRaw,
    ] = await Promise.all([
      incluirPagar ? prisma.contaPagar.findMany({
        where: wherePagar,
        orderBy: { vencimento: "asc" },
        include: { fornecedor: { select: { nome: true } } },
      }) : Promise.resolve([]),
      incluirReceber ? prisma.contaReceber.findMany({
        where: whereReceber,
        orderBy: { vencimento: "asc" },
        include: { cliente: { select: { nome: true } } },
      }) : Promise.resolve([]),
      incluirPagar ? prisma.contaPagar.groupBy({
        by: ["status"],
        where: wherePagar,
        _sum: { valor: true },
        _count: { _all: true },
      }) : Promise.resolve([]),
      incluirReceber ? prisma.contaReceber.groupBy({
        by: ["status"],
        where: whereReceber,
        _sum: { valor: true },
        _count: { _all: true },
      }) : Promise.resolve([]),
    ]);

    function mapStatus(arr) {
      const out = { PENDENTE: { qtd: 0, total: 0 }, PAGA: { qtd: 0, total: 0 }, ATRASADA: { qtd: 0, total: 0 }, CANCELADA: { qtd: 0, total: 0 } };
      for (const r of arr) {
        out[r.status] = { qtd: r._count._all, total: toNum(r._sum.valor) };
      }
      return out;
    }

    const resumoPagar = mapStatus(pagarPorStatusRaw);
    const resumoReceber = mapStatus(receberPorStatusRaw);

    res.json({
      geradoEm: new Date().toISOString(),
      filtros: {
        dataInicio: di ? di.toISOString() : null,
        dataFim: df ? df.toISOString() : null,
        tipo: tipo || "ambos",
      },
      resumo: {
        pagar: resumoPagar,
        receber: resumoReceber,
        saldoPrevisto: (resumoReceber.PENDENTE.total + resumoReceber.ATRASADA.total)
          - (resumoPagar.PENDENTE.total + resumoPagar.ATRASADA.total),
        fluxoCaixaRealizado: resumoReceber.PAGA.total - resumoPagar.PAGA.total,
      },
      contasPagar: contasPagar.map(c => ({
        id: c.id,
        descricao: c.descricao,
        valor: toNum(c.valor),
        vencimento: c.vencimento,
        pagamento: c.pagamento,
        status: c.status,
        fornecedor: c.fornecedor?.nome || null,
      })),
      contasReceber: contasReceber.map(c => ({
        id: c.id,
        descricao: c.descricao,
        valor: toNum(c.valor),
        vencimento: c.vencimento,
        recebimento: c.recebimento,
        status: c.status,
        cliente: c.cliente?.nome || null,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function relatorioEstoque(req, res, next) {
  try {
    const { categoriaId, fornecedorId, situacao } = req.query;

    // Relatorio de estoque ignora servicos — eles nao tem unidades em
    // estoque nem custo de aquisicao a apurar.
    const where = { ativo: true, tipoItem: "PRODUTO" };
    if (categoriaId) where.categoriaId = categoriaId;
    if (fornecedorId) where.fornecedorId = fornecedorId;

    const produtos = await prisma.produto.findMany({
      where,
      orderBy: [{ categoria: { nome: "asc" } }, { nome: "asc" }],
      include: {
        categoria: { select: { nome: true } },
        fornecedor: { select: { nome: true } },
      },
    });

    const filtrados = produtos.filter(p => {
      const e = Number(p.estoque);
      const m = Number(p.estoqueMinimo);
      if (situacao === "baixo") return e <= m;
      if (situacao === "zerado") return e === 0;
      if (situacao === "ok") return e > m;
      return true;
    });

    let totalProdutos = 0;
    let valorEstoqueCusto = 0;
    let valorEstoqueVenda = 0;
    let unidadesEmEstoque = 0;
    let qtdEstoqueBaixo = 0;
    let qtdZerado = 0;

    for (const p of filtrados) {
      totalProdutos++;
      const e = Number(p.estoque);
      unidadesEmEstoque += e;
      const pcusto = p.precoCusto != null ? Number(p.precoCusto) : 0;
      const pvenda = Number(p.precoVenda);
      valorEstoqueCusto += e * pcusto;
      valorEstoqueVenda += e * pvenda;
      if (e === 0) qtdZerado++;
      else if (e <= Number(p.estoqueMinimo)) qtdEstoqueBaixo++;
    }

    res.json({
      geradoEm: new Date().toISOString(),
      filtros: {
        categoriaId: categoriaId || null,
        fornecedorId: fornecedorId || null,
        situacao: situacao || "todos",
      },
      resumo: {
        totalProdutos,
        unidadesEmEstoque,
        qtdEstoqueBaixo,
        qtdZerado,
        valorEstoqueCusto,
        valorEstoqueVenda,
        margemEstimada: valorEstoqueVenda - valorEstoqueCusto,
      },
      produtos: filtrados.map(p => ({
        id: p.id,
        codigo: p.codigo,
        nome: p.nome,
        unidade: p.unidade,
        categoria: p.categoria?.nome || null,
        fornecedor: p.fornecedor?.nome || null,
        estoque: Number(p.estoque),
        estoqueMinimo: Number(p.estoqueMinimo),
        precoCusto: p.precoCusto != null ? Number(p.precoCusto) : null,
        precoVenda: Number(p.precoVenda),
        valorEmEstoqueCusto: p.precoCusto != null ? Number(p.estoque) * Number(p.precoCusto) : null,
        valorEmEstoqueVenda: Number(p.estoque) * Number(p.precoVenda),
      })),
    });
  } catch (err) {
    next(err);
  }
}

// ============ RELATORIO DE CAIXAS (DRE DIARIO) ============
//
// Lista caixas FECHADOS no periodo (default: tudo). Agrupa por dia para o
// DRE resumido (entradas, saidas, quebras, sobras, vendas) e devolve a
// tabela detalhada por caixa.
//
// Filtros: dataInicio, dataFim, userId. VENDEDOR sempre ve so o proprio.

export async function relatorioCaixas(req, res, next) {
  try {
    const { dataInicio, dataFim, userId } = req.query;

    const where = { status: "FECHADO" };
    if (req.user.role === "VENDEDOR") where.userId = req.user.sub;
    else if (userId) where.userId = userId;

    if (dataInicio || dataFim) {
      where.fechadoEm = {};
      if (dataInicio) where.fechadoEm.gte = new Date(dataInicio);
      if (dataFim) where.fechadoEm.lte = new Date(dataFim + "T23:59:59.999Z");
    }

    const caixas = await prisma.caixa.findMany({
      where,
      include: {
        user: { select: { id: true, nome: true } },
        _count: { select: { vendas: true, movimentacoes: true } },
      },
      orderBy: { fechadoEm: "asc" },
    });

    const ids = caixas.map(c => c.id);
    const movs = ids.length === 0 ? [] : await prisma.movimentacaoCaixa.findMany({
      where: { caixaId: { in: ids } },
      select: { caixaId: true, tipo: true, valor: true, formaPagamento: true },
    });

    const ehEntrada = (t) => t === "VENDA" || t === "SUPRIMENTO" || t === "RECEBER_CONTA";
    const ehSaida = (t) => t === "SANGRIA" || t === "PAGAR_CONTA" || t === "ESTORNO_VENDA";

    const totaisPorCaixa = new Map();
    for (const id of ids) {
      totaisPorCaixa.set(id, { entradasDinheiro: 0, entradasOutras: 0, saidasDinheiro: 0, saidasOutras: 0 });
    }
    for (const m of movs) {
      if (m.tipo === "ABERTURA" || m.tipo === "FECHAMENTO") continue;
      const t = totaisPorCaixa.get(m.caixaId);
      const v = Number(m.valor);
      const dinheiro = m.formaPagamento === "DINHEIRO";
      if (ehEntrada(m.tipo)) {
        if (dinheiro) t.entradasDinheiro += v; else t.entradasOutras += v;
      } else if (ehSaida(m.tipo)) {
        if (dinheiro) t.saidasDinheiro += v; else t.saidasOutras += v;
      }
    }

    const porDia = new Map();
    const totaisGerais = {
      caixas: caixas.length,
      entradas: 0, saidas: 0,
      quebras: 0, sobras: 0,
      diferencaLiquida: 0,
      vendas: 0,
    };

    for (const c of caixas) {
      const t = totaisPorCaixa.get(c.id);
      const ent = t.entradasDinheiro + t.entradasOutras;
      const sai = t.saidasDinheiro + t.saidasOutras;
      const dif = Number(c.diferenca || 0);

      const dataKey = c.fechadoEm
        ? new Date(c.fechadoEm).toISOString().slice(0, 10)
        : "sem-data";
      if (!porDia.has(dataKey)) {
        porDia.set(dataKey, {
          data: dataKey, caixas: 0,
          entradas: 0, saidas: 0,
          quebras: 0, sobras: 0, vendas: 0,
        });
      }
      const dia = porDia.get(dataKey);
      dia.caixas++;
      dia.entradas += ent;
      dia.saidas += sai;
      dia.vendas += c._count.vendas;
      if (dif < 0) dia.quebras += Math.abs(dif);
      else if (dif > 0) dia.sobras += dif;

      totaisGerais.entradas += ent;
      totaisGerais.saidas += sai;
      totaisGerais.vendas += c._count.vendas;
      if (dif < 0) totaisGerais.quebras += Math.abs(dif);
      else if (dif > 0) totaisGerais.sobras += dif;
      totaisGerais.diferencaLiquida += dif;
    }

    res.json({
      geradoEm: new Date().toISOString(),
      filtros: {
        dataInicio: dataInicio || null,
        dataFim: dataFim || null,
        userId: req.user.role === "VENDEDOR" ? req.user.sub : (userId || null),
      },
      resumo: totaisGerais,
      dre: Array.from(porDia.values()).sort((a, b) => a.data.localeCompare(b.data)),
      caixas: caixas.map(c => {
        const t = totaisPorCaixa.get(c.id);
        return {
          id: c.id,
          numero: c.numero,
          operador: c.user?.nome || null,
          abertoEm: c.abertoEm,
          fechadoEm: c.fechadoEm,
          saldoInicial: Number(c.saldoInicial),
          saldoFinalEsperado: c.saldoFinalEsperado != null ? Number(c.saldoFinalEsperado) : null,
          saldoFinalContado: c.saldoFinalContado != null ? Number(c.saldoFinalContado) : null,
          trocoProximoDia: c.trocoProximoDia != null ? Number(c.trocoProximoDia) : null,
          diferenca: Number(c.diferenca || 0),
          totalEntradas: t.entradasDinheiro + t.entradasOutras,
          totalSaidas: t.saidasDinheiro + t.saidasOutras,
          vendas: c._count.vendas,
          movimentacoes: c._count.movimentacoes,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
}
