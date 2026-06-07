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
      // _sum.quantidade agora vem como Decimal (ItemVenda.quantidade virou
      // Decimal(12,3)). Coerce para number antes de serializar.
      quantidade: Number(t._sum.quantidade) || 0,
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
    const { dataInicio, dataFim, tipo, clienteId, fornecedorId, status } = req.query;
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
    if (fornecedorId) wherePagar.fornecedorId = fornecedorId;
    if (clienteId) whereReceber.clienteId = clienteId;

    // O filtro de status afeta apenas as listas detalhadas (contas a pagar/
    // receber). O "Resumo por status" continua usando wherePagar/whereReceber
    // sem status, para manter a visao geral completa de todos os status.
    const STATUS_VALIDOS = ["PENDENTE", "PAGA", "ATRASADA", "CANCELADA"];
    const statusFiltro = STATUS_VALIDOS.includes(status) ? status : null;
    const wherePagarDetalhe = statusFiltro ? { ...wherePagar, status: statusFiltro } : wherePagar;
    const whereReceberDetalhe = statusFiltro ? { ...whereReceber, status: statusFiltro } : whereReceber;

    const incluirPagar = !tipo || tipo === "pagar";
    const incluirReceber = !tipo || tipo === "receber";

    const [
      contasPagar,
      contasReceber,
      pagarPorStatusRaw,
      receberPorStatusRaw,
    ] = await Promise.all([
      incluirPagar ? prisma.contaPagar.findMany({
        where: wherePagarDetalhe,
        orderBy: { vencimento: "asc" },
        include: { fornecedor: { select: { nome: true } } },
      }) : Promise.resolve([]),
      incluirReceber ? prisma.contaReceber.findMany({
        where: whereReceberDetalhe,
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
        clienteId: clienteId || null,
        fornecedorId: fornecedorId || null,
        status: statusFiltro || "todos",
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

// ============ RELATORIO DE PRODUTOS POR FABRICANTE / MARCA ============
//
// Lista produtos filtrando por fabricante/marca (e opcionalmente categoria),
// agrupando-os por fabricante com subtotais (qtd de produtos, unidades em
// estoque, valor de estoque a custo e a venda).
//
// Filtros: fabricanteId, categoriaId, incluirInativos. fabricanteId="__sem__"
// traz apenas produtos SEM fabricante cadastrado.

export async function relatorioProdutosPorFabricante(req, res, next) {
  try {
    const { fabricanteId, categoriaId, incluirInativos } = req.query;

    const where = { tipoItem: "PRODUTO" };
    if (incluirInativos !== "true") where.ativo = true;
    if (categoriaId) where.categoriaId = categoriaId;
    if (fabricanteId === "__sem__") where.fabricanteId = null;
    else if (fabricanteId) where.fabricanteId = fabricanteId;

    const produtos = await prisma.produto.findMany({
      where,
      orderBy: [{ fabricante: { nome: "asc" } }, { nome: "asc" }],
      include: {
        fabricante: { select: { nome: true } },
        categoria: { select: { nome: true } },
      },
    });

    const porFabricante = new Map();
    let unidadesEmEstoque = 0;
    let valorEstoqueCusto = 0;
    let valorEstoqueVenda = 0;

    const linhasProdutos = produtos.map(p => {
      const estoque = Number(p.estoque);
      const pcusto = p.precoCusto != null ? Number(p.precoCusto) : 0;
      const pvenda = Number(p.precoVenda);
      const valCusto = estoque * pcusto;
      const valVenda = estoque * pvenda;

      unidadesEmEstoque += estoque;
      valorEstoqueCusto += valCusto;
      valorEstoqueVenda += valVenda;

      const fab = p.fabricante?.nome || "Sem fabricante";
      if (!porFabricante.has(fab)) {
        porFabricante.set(fab, {
          fabricante: fab, qtdProdutos: 0,
          unidades: 0, valorCusto: 0, valorVenda: 0,
        });
      }
      const g = porFabricante.get(fab);
      g.qtdProdutos++;
      g.unidades += estoque;
      g.valorCusto += valCusto;
      g.valorVenda += valVenda;

      return {
        id: p.id,
        codigo: p.codigo,
        nome: p.nome,
        unidade: p.unidade,
        fabricante: p.fabricante?.nome || null,
        categoria: p.categoria?.nome || null,
        ativo: p.ativo,
        estoque,
        precoCusto: p.precoCusto != null ? Number(p.precoCusto) : null,
        precoVenda: pvenda,
        valorEmEstoqueVenda: valVenda,
      };
    });

    res.json({
      geradoEm: new Date().toISOString(),
      filtros: {
        fabricanteId: fabricanteId || null,
        categoriaId: categoriaId || null,
        incluirInativos: incluirInativos === "true",
      },
      resumo: {
        totalProdutos: produtos.length,
        totalFabricantes: porFabricante.size,
        unidadesEmEstoque,
        valorEstoqueCusto,
        valorEstoqueVenda,
      },
      porFabricante: Array.from(porFabricante.values())
        .sort((a, b) => b.valorVenda - a.valorVenda),
      produtos: linhasProdutos,
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

// ============ RELATORIO DE LUCRATIVIDADE / MARGEM ============
//
// Apura lucro bruto (receita - custo) por produto e por categoria a partir
// dos itens de vendas CONCLUIDAS no periodo.
//
// Custo: usa o precoCusto ATUAL do produto (o sistema nao snapshota custo no
// momento da venda). Produtos sem precoCusto entram com custo 0 e sao
// sinalizados via custoIndefinido / resumo.itensSemCusto — nesses casos a
// margem fica superestimada.
//
// Receita por produto = soma de ItemVenda.subtotal (bruto, antes do desconto
// de nivel de venda). O desconto da venda entra so no resumo (lucro liquido) e
// apenas quando NAO ha filtro de categoria — atribuir o desconto de uma venda
// a uma unica categoria distorceria o numero, ja que a venda pode ter itens de
// varias categorias.

export async function relatorioLucratividade(req, res, next) {
  try {
    const { dataInicio, dataFim, categoriaId, userId } = req.query;
    const di = parseDataInicio(dataInicio);
    const df = parseDataFim(dataFim);

    const vendaWhere = { status: "CONCLUIDA" };
    if (di || df) vendaWhere.createdAt = {};
    if (di) vendaWhere.createdAt.gte = di;
    if (df) vendaWhere.createdAt.lte = df;
    if (req.user.role === "VENDEDOR") vendaWhere.userId = req.user.sub;
    else if (userId) vendaWhere.userId = userId;

    const itemWhere = { venda: vendaWhere };
    if (categoriaId) itemWhere.produto = { categoriaId };

    const itens = await prisma.itemVenda.findMany({
      where: itemWhere,
      select: {
        vendaId: true,
        quantidade: true,
        subtotal: true,
        produto: {
          select: {
            id: true, codigo: true, nome: true, unidade: true,
            precoCusto: true,
            categoria: { select: { nome: true } },
          },
        },
      },
    });

    const porProduto = new Map();
    const porCategoria = new Map();
    const vendaIds = new Set();
    let receitaBruta = 0;
    let custoTotal = 0;

    for (const it of itens) {
      vendaIds.add(it.vendaId);
      const p = it.produto;
      const receita = toNum(it.subtotal);
      const qtd = Number(it.quantidade) || 0;
      const temCusto = p?.precoCusto != null;
      const custo = temCusto ? qtd * Number(p.precoCusto) : 0;

      receitaBruta += receita;
      custoTotal += custo;

      const pid = p?.id || "removido";
      if (!porProduto.has(pid)) {
        porProduto.set(pid, {
          produtoId: pid,
          codigo: p?.codigo || "—",
          nome: p?.nome || "Produto removido",
          unidade: p?.unidade || "",
          categoria: p?.categoria?.nome || null,
          quantidade: 0, receita: 0, custo: 0,
          custoIndefinido: false,
        });
      }
      const rp = porProduto.get(pid);
      rp.quantidade += qtd;
      rp.receita += receita;
      rp.custo += custo;
      if (!temCusto) rp.custoIndefinido = true;

      const cat = p?.categoria?.nome || "Sem categoria";
      if (!porCategoria.has(cat)) {
        porCategoria.set(cat, { categoria: cat, receita: 0, custo: 0 });
      }
      const rc = porCategoria.get(cat);
      rc.receita += receita;
      rc.custo += custo;
    }

    const lucroBruto = receitaBruta - custoTotal;
    const margemBruta = receitaBruta > 0 ? (lucroBruto / receitaBruta) * 100 : 0;

    let totalVendas;
    let descontos = null;
    let lucroLiquido = lucroBruto;
    let margemLiquida = margemBruta;
    if (categoriaId) {
      totalVendas = vendaIds.size;
    } else {
      const agg = await prisma.venda.aggregate({
        where: vendaWhere,
        _sum: { desconto: true },
        _count: { _all: true },
      });
      totalVendas = agg._count._all;
      descontos = toNum(agg._sum.desconto);
      lucroLiquido = lucroBruto - descontos;
      const receitaLiquida = receitaBruta - descontos;
      margemLiquida = receitaLiquida > 0 ? (lucroLiquido / receitaLiquida) * 100 : 0;
    }

    const finalizar = (o) => {
      const lucro = o.receita - o.custo;
      return { ...o, lucro, margem: o.receita > 0 ? (lucro / o.receita) * 100 : 0 };
    };

    const produtos = Array.from(porProduto.values()).map(finalizar);
    const itensSemCusto = produtos.filter(p => p.custoIndefinido).length;

    res.json({
      geradoEm: new Date().toISOString(),
      filtros: {
        dataInicio: di ? di.toISOString() : null,
        dataFim: df ? df.toISOString() : null,
        categoriaId: categoriaId || null,
        userId: req.user.role === "VENDEDOR" ? req.user.sub : (userId || null),
      },
      resumo: {
        totalVendas,
        qtdProdutos: porProduto.size,
        receitaBruta,
        custoTotal,
        lucroBruto,
        margemBruta,
        descontos,
        lucroLiquido,
        margemLiquida,
        itensSemCusto,
      },
      porCategoria: Array.from(porCategoria.values())
        .map(finalizar)
        .sort((a, b) => b.lucro - a.lucro),
      porProduto: produtos.sort((a, b) => b.lucro - a.lucro),
    });
  } catch (err) {
    next(err);
  }
}

// ============ CURVA ABC (Pareto 80/15/5) ============
//
// Classifica os produtos pela contribuicao acumulada num criterio (receita,
// lucro ou quantidade vendida) no periodo. Convencao classica:
//   Classe A — ate 80% acumulado (poucos itens, maior parte do resultado)
//   Classe B — de 80% a 95%
//   Classe C — de 95% a 100% (cauda longa)
//
// Multi-tenant: prisma.itemVenda ja e filtrado por tenant pelo extension.
export async function relatorioCurvaAbc(req, res, next) {
  try {
    const { dataInicio, dataFim, categoriaId } = req.query;
    const criterio = ["receita", "lucro", "quantidade"].includes(req.query.criterio)
      ? req.query.criterio
      : "receita";
    const di = parseDataInicio(dataInicio);
    const df = parseDataFim(dataFim);

    const vendaWhere = { status: "CONCLUIDA" };
    if (di || df) vendaWhere.createdAt = {};
    if (di) vendaWhere.createdAt.gte = di;
    if (df) vendaWhere.createdAt.lte = df;
    if (req.user.role === "VENDEDOR") vendaWhere.userId = req.user.sub;

    const itemWhere = { venda: vendaWhere };
    if (categoriaId) itemWhere.produto = { categoriaId };

    const itens = await prisma.itemVenda.findMany({
      where: itemWhere,
      select: {
        quantidade: true,
        subtotal: true,
        produto: {
          select: {
            id: true, codigo: true, nome: true, unidade: true,
            precoCusto: true,
            categoria: { select: { nome: true } },
          },
        },
      },
    });

    const porProduto = new Map();
    for (const it of itens) {
      const p = it.produto;
      const receita = toNum(it.subtotal);
      const qtd = Number(it.quantidade) || 0;
      const temCusto = p?.precoCusto != null;
      const custo = temCusto ? qtd * Number(p.precoCusto) : 0;

      const pid = p?.id || "removido";
      if (!porProduto.has(pid)) {
        porProduto.set(pid, {
          produtoId: pid,
          codigo: p?.codigo || "—",
          nome: p?.nome || "Produto removido",
          unidade: p?.unidade || "",
          categoria: p?.categoria?.nome || null,
          quantidade: 0, receita: 0, custo: 0,
          custoIndefinido: false,
        });
      }
      const rp = porProduto.get(pid);
      rp.quantidade += qtd;
      rp.receita += receita;
      rp.custo += custo;
      if (!temCusto) rp.custoIndefinido = true;
    }

    const valorCriterio = (o) => {
      if (criterio === "lucro") return o.receita - o.custo;
      if (criterio === "quantidade") return o.quantidade;
      return o.receita;
    };

    // Ordena desc pelo criterio e calcula contribuicao acumulada.
    const lista = Array.from(porProduto.values()).map((o) => ({
      ...o,
      lucro: o.receita - o.custo,
      margem: o.receita > 0 ? ((o.receita - o.custo) / o.receita) * 100 : 0,
      valor: valorCriterio(o),
    }));
    lista.sort((a, b) => b.valor - a.valor);

    const totalCriterio = lista.reduce((s, o) => s + o.valor, 0);

    const classes = { A: 0, B: 0, C: 0 };
    const valorClasse = { A: 0, B: 0, C: 0 };
    let acumulado = 0;
    const produtos = lista.map((o, i) => {
      const pctIndividual = totalCriterio > 0 ? (o.valor / totalCriterio) * 100 : 0;
      acumulado += o.valor;
      const pctAcumulado = totalCriterio > 0 ? (acumulado / totalCriterio) * 100 : 0;
      const classe = pctAcumulado <= 80 ? "A" : pctAcumulado <= 95 ? "B" : "C";
      classes[classe] += 1;
      valorClasse[classe] += o.valor;
      return {
        posicao: i + 1,
        produtoId: o.produtoId,
        codigo: o.codigo,
        nome: o.nome,
        unidade: o.unidade,
        categoria: o.categoria,
        quantidade: o.quantidade,
        receita: o.receita,
        custo: o.custo,
        lucro: o.lucro,
        margem: o.margem,
        valor: o.valor,
        pctIndividual,
        pctAcumulado,
        classe,
      };
    });

    const totalProdutos = produtos.length;
    const resumoClasses = ["A", "B", "C"].map((c) => ({
      classe: c,
      qtdProdutos: classes[c],
      pctProdutos: totalProdutos > 0 ? (classes[c] / totalProdutos) * 100 : 0,
      valor: valorClasse[c],
      pctValor: totalCriterio > 0 ? (valorClasse[c] / totalCriterio) * 100 : 0,
    }));

    res.json({
      geradoEm: new Date().toISOString(),
      filtros: {
        dataInicio: di ? di.toISOString() : null,
        dataFim: df ? df.toISOString() : null,
        categoriaId: categoriaId || null,
        criterio,
      },
      resumo: {
        criterio,
        totalProdutos,
        totalCriterio,
        classes: resumoClasses,
        itensSemCusto: lista.filter((o) => o.custoIndefinido).length,
      },
      produtos,
    });
  } catch (err) {
    next(err);
  }
}

// ============ GIRO DE ESTOQUE & CAPITAL PARADO ============
//
// Cruza o estoque atual de cada produto com o que ele vendeu no periodo para
// medir velocidade de giro e quanto dinheiro esta "dormindo" na prateleira.
//
//   giro       = unidades vendidas no periodo / estoque atual (quantas vezes girou)
//   cobertura  = dias que o estoque atual dura na venda media diaria do periodo
//   capitalParado = estoque atual x preco de custo (dinheiro empatado)
//
// Classificacao:
//   PARADO     — tem estoque mas nao vendeu nada no periodo (capital empatado)
//   BAIXO_GIRO — cobertura > 90 dias
//   ALTO_GIRO  — cobertura <= 30 dias (girando rapido; vigiar ruptura)
//   SAUDAVEL   — entre 30 e 90 dias
//
// Sem periodo informado, usa os ultimos 90 dias. Multi-tenant automatico.
export async function relatorioGiroEstoque(req, res, next) {
  try {
    const { categoriaId, fornecedorId } = req.query;
    let di = parseDataInicio(req.query.dataInicio);
    let df = parseDataFim(req.query.dataFim);
    if (!di && !df) {
      df = fimDoDia(new Date());
      di = inicioDoDia(new Date(Date.now() - 90 * 86400000));
    } else if (!df) {
      df = fimDoDia(new Date());
    } else if (!di) {
      di = inicioDoDia(new Date(df.getTime() - 90 * 86400000));
    }
    const diasPeriodo = Math.max(1, Math.round((df.getTime() - di.getTime()) / 86400000) + 1);

    const where = { ativo: true, tipoItem: "PRODUTO" };
    if (categoriaId) where.categoriaId = categoriaId;
    if (fornecedorId) where.fornecedorId = fornecedorId;

    const produtos = await prisma.produto.findMany({
      where,
      include: {
        categoria: { select: { nome: true } },
        fornecedor: { select: { nome: true } },
      },
    });

    // Unidades e receita vendidas no periodo, por produto.
    const itens = await prisma.itemVenda.findMany({
      where: { venda: { status: "CONCLUIDA", createdAt: { gte: di, lte: df } } },
      select: { produtoId: true, quantidade: true, subtotal: true },
    });
    const vendaPorProduto = new Map();
    for (const it of itens) {
      if (!it.produtoId) continue;
      const cur = vendaPorProduto.get(it.produtoId) || { qtd: 0, receita: 0 };
      cur.qtd += Number(it.quantidade) || 0;
      cur.receita += toNum(it.subtotal);
      vendaPorProduto.set(it.produtoId, cur);
    }

    const classificar = (estoque, vendido, cobertura) => {
      if (estoque > 0 && vendido === 0) return "PARADO";
      if (cobertura != null && cobertura <= 30) return "ALTO_GIRO";
      if (cobertura == null || cobertura > 90) return "BAIXO_GIRO";
      return "SAUDAVEL";
    };

    let capitalParadoTotal = 0; // capital de itens PARADO
    let capitalEstoqueTotal = 0; // capital de todo o estoque a custo
    const contagem = { PARADO: 0, BAIXO_GIRO: 0, SAUDAVEL: 0, ALTO_GIRO: 0 };

    const lista = produtos.map((p) => {
      const estoque = Number(p.estoque) || 0;
      const custo = p.precoCusto != null ? Number(p.precoCusto) : null;
      const v = vendaPorProduto.get(p.id) || { qtd: 0, receita: 0 };
      const vendido = v.qtd;
      const vendaDiaria = vendido / diasPeriodo;
      const cobertura = vendaDiaria > 0 ? estoque / vendaDiaria : null; // null = nao vende
      const giro = estoque > 0 ? vendido / estoque : null;
      const capitalParado = custo != null ? estoque * custo : null;
      const classe = classificar(estoque, vendido, cobertura);

      capitalEstoqueTotal += capitalParado || 0;
      if (classe === "PARADO") capitalParadoTotal += capitalParado || 0;
      contagem[classe] += 1;

      return {
        id: p.id,
        codigo: p.codigo,
        nome: p.nome,
        unidade: p.unidade,
        categoria: p.categoria?.nome || null,
        fornecedor: p.fornecedor?.nome || null,
        estoque,
        precoCusto: custo,
        vendidoPeriodo: vendido,
        receitaPeriodo: v.receita,
        giro,
        coberturaDias: cobertura,
        capitalParado,
        classe,
      };
    });

    // Ordena por capital parado desc (o que mais empata dinheiro primeiro).
    lista.sort((a, b) => (b.capitalParado || 0) - (a.capitalParado || 0));

    res.json({
      geradoEm: new Date().toISOString(),
      filtros: {
        dataInicio: di.toISOString(),
        dataFim: df.toISOString(),
        diasPeriodo,
        categoriaId: categoriaId || null,
        fornecedorId: fornecedorId || null,
      },
      resumo: {
        totalProdutos: lista.length,
        diasPeriodo,
        capitalEstoqueTotal,
        capitalParadoTotal,
        pctCapitalParado: capitalEstoqueTotal > 0 ? (capitalParadoTotal / capitalEstoqueTotal) * 100 : 0,
        qtdParados: contagem.PARADO,
        qtdBaixoGiro: contagem.BAIXO_GIRO,
        qtdSaudavel: contagem.SAUDAVEL,
        qtdAltoGiro: contagem.ALTO_GIRO,
      },
      produtos: lista,
    });
  } catch (err) {
    next(err);
  }
}

// ============ SAZONALIDADE (heatmap dia x hora) ============
//
// Mapa de calor de dia-da-semana x hora com volume de vendas e faturamento.
// Revela picos e vales para dimensionar escala de funcionarios e promocoes.
//
// IMPORTANTE: createdAt e UTC. O negocio opera no Brasil; sem converter para
// America/Sao_Paulo o pico de horario sairia deslocado ~3h. Usamos Intl com
// timeZone para extrair dia/hora locais de cada venda.
//
// Sem periodo informado, usa os ultimos 90 dias. Multi-tenant automatico.
const DTF_BR = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  hour: "2-digit",
  hour12: false,
});
const DOW_IDX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function diaHoraBR(date) {
  const partes = DTF_BR.formatToParts(date);
  let wd = "Sun";
  let h = "0";
  for (const p of partes) {
    if (p.type === "weekday") wd = p.value;
    else if (p.type === "hour") h = p.value;
  }
  return { dow: DOW_IDX[wd] ?? 0, hour: parseInt(h, 10) % 24 };
}

export async function relatorioSazonalidade(req, res, next) {
  try {
    let di = parseDataInicio(req.query.dataInicio);
    let df = parseDataFim(req.query.dataFim);
    if (!di && !df) {
      df = fimDoDia(new Date());
      di = inicioDoDia(new Date(Date.now() - 90 * 86400000));
    } else if (!df) {
      df = fimDoDia(new Date());
    } else if (!di) {
      di = inicioDoDia(new Date(df.getTime() - 90 * 86400000));
    }
    const diasPeriodo = Math.max(1, Math.round((df.getTime() - di.getTime()) / 86400000) + 1);

    const vendaWhere = { status: "CONCLUIDA", createdAt: { gte: di, lte: df } };
    if (req.user.role === "VENDEDOR") vendaWhere.userId = req.user.sub;

    const vendas = await prisma.venda.findMany({
      where: vendaWhere,
      select: { createdAt: true, total: true },
    });

    // Matriz 7 (dom..sab) x 24 horas.
    const matriz = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ vendas: 0, faturamento: 0 }))
    );
    const porDia = Array.from({ length: 7 }, () => ({ vendas: 0, faturamento: 0 }));
    const porHora = Array.from({ length: 24 }, () => ({ vendas: 0, faturamento: 0 }));
    let totalVendas = 0;
    let totalFaturamento = 0;
    let pico = { dow: 0, hour: 0, vendas: 0, faturamento: 0 };

    for (const v of vendas) {
      const { dow, hour } = diaHoraBR(v.createdAt);
      const total = toNum(v.total);
      const cel = matriz[dow][hour];
      cel.vendas += 1;
      cel.faturamento += total;
      porDia[dow].vendas += 1;
      porDia[dow].faturamento += total;
      porHora[hour].vendas += 1;
      porHora[hour].faturamento += total;
      totalVendas += 1;
      totalFaturamento += total;
      if (cel.faturamento > pico.faturamento) {
        pico = { dow, hour, vendas: cel.vendas, faturamento: cel.faturamento };
      }
    }

    const melhorDia = porDia.reduce(
      (best, d, i) => (d.faturamento > best.faturamento ? { dow: i, ...d } : best),
      { dow: 0, vendas: 0, faturamento: 0 }
    );
    const melhorHora = porHora.reduce(
      (best, h, i) => (h.faturamento > best.faturamento ? { hour: i, ...h } : best),
      { hour: 0, vendas: 0, faturamento: 0 }
    );

    res.json({
      geradoEm: new Date().toISOString(),
      filtros: {
        dataInicio: di.toISOString(),
        dataFim: df.toISOString(),
        diasPeriodo,
      },
      resumo: {
        totalVendas,
        totalFaturamento,
        ticketMedio: totalVendas > 0 ? totalFaturamento / totalVendas : 0,
        diasPeriodo,
        pico,
        melhorDia,
        melhorHora,
      },
      matriz,
      porDia,
      porHora,
    });
  } catch (err) {
    next(err);
  }
}

// ============ AGING DE RECEBIVEIS (idade da divida) ============
//
// Distribui as contas a receber EM ABERTO (PENDENTE/ATRASADA) por faixas de
// atraso, calculando a idade pela data de vencimento vs hoje — nao confia
// apenas no status armazenado. Mostra o total inadimplente e um ranking de
// clientes devedores.
//
//   AVENCER   — ainda nao venceu
//   D1_30     — 1 a 30 dias de atraso
//   D31_60    — 31 a 60
//   D61_90    — 61 a 90
//   D90MAIS   — mais de 90 dias
//
// Multi-tenant automatico (ContaReceber e filtrada pelo extension).
const AGING_FAIXAS = ["AVENCER", "D1_30", "D31_60", "D61_90", "D90MAIS"];

function faixaAging(diasAtraso) {
  if (diasAtraso <= 0) return "AVENCER";
  if (diasAtraso <= 30) return "D1_30";
  if (diasAtraso <= 60) return "D31_60";
  if (diasAtraso <= 90) return "D61_90";
  return "D90MAIS";
}

export async function relatorioAgingReceber(req, res, next) {
  try {
    const { clienteId } = req.query;

    const where = { status: { in: ["PENDENTE", "ATRASADA"] } };
    if (clienteId) where.clienteId = clienteId;

    const contas = await prisma.contaReceber.findMany({
      where,
      include: { cliente: { select: { id: true, nome: true } } },
    });

    const hoje = inicioDoDia(new Date());

    const faixas = {};
    for (const f of AGING_FAIXAS) faixas[f] = { qtd: 0, total: 0 };

    const porCliente = new Map();
    let totalAberto = 0;
    let totalVencido = 0;
    let totalAVencer = 0;

    const detalhe = contas.map((c) => {
      const valor = toNum(c.valor);
      const venc = c.vencimento ? inicioDoDia(new Date(c.vencimento)) : hoje;
      const diasAtraso = Math.round((hoje.getTime() - venc.getTime()) / 86400000);
      const faixa = faixaAging(diasAtraso);

      faixas[faixa].qtd += 1;
      faixas[faixa].total += valor;
      totalAberto += valor;
      if (diasAtraso > 0) totalVencido += valor;
      else totalAVencer += valor;

      const nomeCli = c.cliente?.nome || "Sem cliente";
      const idCli = c.cliente?.id || "__sem__";
      if (!porCliente.has(idCli)) {
        porCliente.set(idCli, { clienteId: idCli, cliente: nomeCli, total: 0, vencido: 0, qtd: 0, maiorAtraso: 0 });
      }
      const rc = porCliente.get(idCli);
      rc.total += valor;
      rc.qtd += 1;
      if (diasAtraso > 0) rc.vencido += valor;
      if (diasAtraso > rc.maiorAtraso) rc.maiorAtraso = diasAtraso;

      return {
        id: c.id,
        descricao: c.descricao,
        cliente: nomeCli,
        valor,
        vencimento: c.vencimento,
        diasAtraso,
        faixa,
        status: c.status,
      };
    });

    // Faixas com participacao percentual sobre o total em aberto.
    const faixasArr = AGING_FAIXAS.map((f) => ({
      faixa: f,
      qtd: faixas[f].qtd,
      total: faixas[f].total,
      pct: totalAberto > 0 ? (faixas[f].total / totalAberto) * 100 : 0,
    }));

    const clientes = Array.from(porCliente.values()).sort((a, b) => b.total - a.total);
    detalhe.sort((a, b) => b.diasAtraso - a.diasAtraso);

    res.json({
      geradoEm: new Date().toISOString(),
      filtros: { clienteId: clienteId || null },
      resumo: {
        totalAberto,
        totalVencido,
        totalAVencer,
        qtdContas: contas.length,
        qtdClientes: porCliente.size,
        pctVencido: totalAberto > 0 ? (totalVencido / totalAberto) * 100 : 0,
        faixas: faixasArr,
      },
      clientes,
      contas: detalhe,
    });
  } catch (err) {
    next(err);
  }
}
