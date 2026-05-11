import prisma from "../lib/prisma.js";

const TIPOS_VALIDOS = new Set(["PORCENTAGEM", "VALOR_FIXO"]);
const BASES_VALIDAS = new Set(["VALOR_BRUTO", "LUCRO_LIQUIDO"]);

const SELECT_COMISSAO = {
  id: true,
  tipo: true,
  base: true,
  valor: true,
  metaMensal: true,
  bonusPorMeta: true,
  ativo: true,
  observacoes: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: { id: true, nome: true, email: true, role: true, ativo: true },
  },
};

// GET /comissoes
// Lista todas as configuracoes de comissao com dados do vendedor.
export async function listar(req, res, next) {
  try {
    const { ativo } = req.query;
    const where = {};
    if (ativo === "true") where.ativo = true;
    if (ativo === "false") where.ativo = false;

    const configuracoes = await prisma.configuracaoComissao.findMany({
      where,
      select: SELECT_COMISSAO,
      orderBy: { user: { nome: "asc" } },
    });
    res.json(configuracoes);
  } catch (err) {
    next(err);
  }
}

// GET /comissoes/vendedores
// Retorna a lista de vendedores ativos (role VENDEDOR ou GERENTE) com a
// configuracao atual (se existir). Util para a tela de gestao escolher
// quem configurar.
export async function listarVendedores(_req, res, next) {
  try {
    const vendedores = await prisma.user.findMany({
      where: {
        ativo: true,
        role: { in: ["VENDEDOR", "GERENTE"] },
      },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        configuracaoComissao: { select: SELECT_COMISSAO },
      },
      orderBy: { nome: "asc" },
    });
    res.json(vendedores);
  } catch (err) {
    next(err);
  }
}

// GET /comissoes/:userId
// Retorna a config de um vendedor especifico (404 se nao existe ainda).
export async function obter(req, res, next) {
  try {
    const config = await prisma.configuracaoComissao.findUnique({
      where: { userId: req.params.userId },
      select: SELECT_COMISSAO,
    });
    if (!config) return res.status(404).json({ erro: "Configuracao de comissao nao encontrada" });
    res.json(config);
  } catch (err) {
    next(err);
  }
}

// PUT /comissoes/:userId
// Upsert da configuracao de comissao do vendedor. Sempre cria ou atualiza
// — nao ha endpoint POST/DELETE separado por simplicidade.
export async function salvar(req, res, next) {
  try {
    const userId = req.params.userId;

    const tipo = String(req.body?.tipo || "PORCENTAGEM").toUpperCase();
    if (!TIPOS_VALIDOS.has(tipo)) {
      return res.status(400).json({ erro: "Tipo invalido (use PORCENTAGEM ou VALOR_FIXO)" });
    }

    const base = String(req.body?.base || "VALOR_BRUTO").toUpperCase();
    if (!BASES_VALIDAS.has(base)) {
      return res.status(400).json({ erro: "Base invalida (use VALOR_BRUTO ou LUCRO_LIQUIDO)" });
    }

    const valor = Number(req.body?.valor);
    if (!Number.isFinite(valor) || valor < 0) {
      return res.status(400).json({ erro: "Valor da comissao invalido" });
    }
    if (tipo === "PORCENTAGEM" && valor > 100) {
      return res.status(400).json({ erro: "Aliquota em porcentagem nao pode passar de 100" });
    }

    const metaMensal = Number(req.body?.metaMensal ?? 0);
    if (!Number.isFinite(metaMensal) || metaMensal < 0) {
      return res.status(400).json({ erro: "Meta mensal invalida" });
    }

    const bonusPorMeta = Number(req.body?.bonusPorMeta ?? 0);
    if (!Number.isFinite(bonusPorMeta) || bonusPorMeta < 0 || bonusPorMeta > 100) {
      return res.status(400).json({ erro: "Bonus por meta deve estar entre 0 e 100" });
    }

    const ativo = req.body?.ativo === undefined ? true : !!req.body.ativo;
    const observacoes = req.body?.observacoes ? String(req.body.observacoes).trim() : null;

    // Confere que o usuario existe antes do upsert.
    const vendedor = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, ativo: true },
    });
    if (!vendedor) return res.status(404).json({ erro: "Vendedor nao encontrado" });

    const config = await prisma.configuracaoComissao.upsert({
      where: { userId },
      update: { tipo, base, valor, metaMensal, bonusPorMeta, ativo, observacoes },
      create: { userId, tipo, base, valor, metaMensal, bonusPorMeta, ativo, observacoes },
      select: SELECT_COMISSAO,
    });
    res.json(config);
  } catch (err) {
    if (err.code === "P2003") {
      return res.status(400).json({ erro: "Vendedor invalido" });
    }
    next(err);
  }
}

// GET /comissoes/relatorio?dataInicio=&dataFim=&userId=
//
// Calcula comissoes historicas a partir das vendas concluidas no periodo
// cruzando com a ConfiguracaoComissao de cada vendedor. Retorna:
//   - vendedores: lista com totais (vendas, comissao, meses no periodo)
//   - mensal: serie temporal por mes (ate 24 meses) com a comissao de cada
//     vendedor — formatada para feed direto em line chart
//   - resumo: agregado geral do periodo
//
// Importante: vendedores sem ConfiguracaoComissao nao sao calculados (entram
// com totalComissao=0). Vendas sem userId (impossivel hoje, mas defensivo)
// sao ignoradas.
export async function relatorio(req, res, next) {
  try {
    const di = req.query.dataInicio ? new Date(req.query.dataInicio) : null;
    const df = req.query.dataFim ? new Date(req.query.dataFim) : null;
    if (di) di.setHours(0, 0, 0, 0);
    if (df) df.setHours(23, 59, 59, 999);
    const userIdFiltro = req.query.userId || null;

    const where = { status: "CONCLUIDA" };
    if (di || df) where.createdAt = {};
    if (di) where.createdAt.gte = di;
    if (df) where.createdAt.lte = df;
    if (userIdFiltro) where.userId = userIdFiltro;

    // Busca todas as vendas concluidas no periodo com itens + custo dos
    // produtos (para calculo de LUCRO_LIQUIDO).
    const vendas = await prisma.venda.findMany({
      where,
      select: {
        id: true,
        numero: true,
        total: true,
        desconto: true,
        formaPagamento: true,
        userId: true,
        createdAt: true,
        cliente: { select: { nome: true } },
        itens: {
          select: {
            quantidade: true,
            precoUnitario: true,
            subtotal: true,
            produto: { select: { precoCusto: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Vendedores envolvidos (so os que tiveram ao menos uma venda — os com
    // ConfiguracaoComissao mas sem vendas tambem entram, para meta vs zero).
    const userIdsComVenda = new Set(vendas.map(v => v.userId));
    const usuarios = await prisma.user.findMany({
      where: userIdFiltro ? { id: userIdFiltro } : {
        OR: [
          { id: { in: Array.from(userIdsComVenda) } },
          { configuracaoComissao: { ativo: true } },
        ],
      },
      select: {
        id: true, nome: true, email: true, role: true, ativo: true,
        configuracaoComissao: true,
      },
    });
    const usuarioPorId = new Map(usuarios.map(u => [u.id, u]));

    // Util: chave do mes (YYYY-MM) — usada para agregacao mensal.
    const chaveMes = (d) => {
      const mes = String(d.getMonth() + 1).padStart(2, "0");
      return `${d.getFullYear()}-${mes}`;
    };

    // Calculo de comissao de UMA venda dada a config do vendedor.
    function calcularComissaoVenda(venda, cfg) {
      if (!cfg || !cfg.ativo) return 0;
      const tipo = cfg.tipo;
      const base = cfg.base;
      const aliquota = toNum(cfg.valor);

      if (tipo === "VALOR_FIXO") return aliquota;

      // PORCENTAGEM
      let baseCalculo;
      if (base === "LUCRO_LIQUIDO") {
        let lucro = 0;
        for (const it of venda.itens) {
          const custo = toNum(it.produto?.precoCusto);
          const receita = toNum(it.subtotal);
          lucro += receita - (custo * Number(it.quantidade));
        }
        baseCalculo = Math.max(0, lucro);
      } else {
        baseCalculo = toNum(venda.total);
      }
      return baseCalculo * (aliquota / 100);
    }

    // Acumula por vendedor + por mes.
    const porVendedor = new Map(); // userId -> { totalVendas, totalComissao, vendasCount, mensalMap }
    function pegar(userId) {
      let s = porVendedor.get(userId);
      if (!s) {
        s = {
          totalVendas: 0, totalComissao: 0, vendasCount: 0,
          mensalMap: new Map(),
        };
        porVendedor.set(userId, s);
      }
      return s;
    }

    // Inicializa entradas para todos os usuarios encontrados (mesmo sem
    // venda no periodo).
    for (const u of usuarios) pegar(u.id);

    // Conjunto de meses presentes no periodo — usado para preencher a
    // serie temporal sem buracos.
    const mesesSet = new Set();
    if (di && df) {
      const cursor = new Date(di.getFullYear(), di.getMonth(), 1);
      const limite = new Date(df.getFullYear(), df.getMonth(), 1);
      while (cursor <= limite) {
        mesesSet.add(chaveMes(cursor));
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    // Detalhe por venda — populado em paralelo a agregacao para o relatorio
    // tabular do modulo Relatorios.
    const vendasDetalhe = [];

    for (const v of vendas) {
      const u = usuarioPorId.get(v.userId);
      const cfg = u?.configuracaoComissao;
      const valorComissao = calcularComissaoVenda(v, cfg);
      const slot = pegar(v.userId);
      slot.totalVendas += toNum(v.total);
      slot.totalComissao += valorComissao;
      slot.vendasCount += 1;
      const mes = chaveMes(v.createdAt);
      mesesSet.add(mes);
      slot.mensalMap.set(mes, (slot.mensalMap.get(mes) || 0) + valorComissao);

      vendasDetalhe.push({
        id: v.id,
        numero: v.numero,
        createdAt: v.createdAt,
        total: round2(toNum(v.total)),
        formaPagamento: v.formaPagamento,
        cliente: v.cliente?.nome || null,
        vendedorId: v.userId,
        vendedor: u?.nome || "—",
        comissao: round2(valorComissao),
        regra: cfg
          ? (cfg.tipo === "PORCENTAGEM"
              ? `${toNum(cfg.valor)}% sobre ${cfg.base === "LUCRO_LIQUIDO" ? "lucro" : "valor bruto"}`
              : `R$ ${toNum(cfg.valor).toFixed(2)} fixo`)
          : "Sem regra",
      });
    }

    // Monta arrays finais.
    const vendedoresOut = [];
    for (const [userId, s] of porVendedor.entries()) {
      const u = usuarioPorId.get(userId);
      if (!u) continue;
      const cfg = u.configuracaoComissao;
      const meta = toNum(cfg?.metaMensal);

      // Quantos meses do periodo o vendedor bateu a meta (apenas meses com
      // venda contam — mes sem venda nao bate meta).
      let mesesAcimaDaMeta = 0;
      // Vendas mensais para calcular meta x realizado por mes
      const vendasPorMes = new Map();
      for (const v of vendas) {
        if (v.userId !== userId) continue;
        const m = chaveMes(v.createdAt);
        vendasPorMes.set(m, (vendasPorMes.get(m) || 0) + toNum(v.total));
      }
      for (const [, vendasMes] of vendasPorMes) {
        if (meta > 0 && vendasMes >= meta) mesesAcimaDaMeta += 1;
      }

      vendedoresOut.push({
        id: userId,
        nome: u.nome,
        email: u.email,
        role: u.role,
        ativo: u.ativo,
        configuracao: cfg
          ? {
              tipo: cfg.tipo, base: cfg.base,
              valor: toNum(cfg.valor),
              metaMensal: meta,
              bonusPorMeta: toNum(cfg.bonusPorMeta),
              ativo: cfg.ativo,
            }
          : null,
        totalVendas: round2(s.totalVendas),
        totalComissao: round2(s.totalComissao),
        vendasCount: s.vendasCount,
        ticketMedio: s.vendasCount > 0 ? round2(s.totalVendas / s.vendasCount) : 0,
        mesesAcimaDaMeta,
        mesesNoPeriodo: vendasPorMes.size,
      });
    }

    // Ordena por comissao desc (ranking).
    vendedoresOut.sort((a, b) => b.totalComissao - a.totalComissao);

    // Serie temporal: array { mes: "YYYY-MM", "<userId>": <comissao>, ... }.
    const mesesOrdenados = Array.from(mesesSet).sort();
    const mensal = mesesOrdenados.map(mes => {
      const linha = { mes };
      for (const [userId, s] of porVendedor.entries()) {
        linha[userId] = round2(s.mensalMap.get(mes) || 0);
      }
      return linha;
    });

    const resumo = {
      totalVendas: round2(vendedoresOut.reduce((acc, v) => acc + v.totalVendas, 0)),
      totalComissao: round2(vendedoresOut.reduce((acc, v) => acc + v.totalComissao, 0)),
      totalVendasCount: vendedoresOut.reduce((acc, v) => acc + v.vendasCount, 0),
      melhorVendedor: vendedoresOut[0]?.nome || null,
      melhorComissao: vendedoresOut[0]?.totalComissao || 0,
      vendedoresCount: vendedoresOut.length,
    };

    res.json({
      periodo: {
        dataInicio: di ? di.toISOString() : null,
        dataFim: df ? df.toISOString() : null,
      },
      resumo,
      vendedores: vendedoresOut,
      mensal,
      vendas: vendasDetalhe,
    });
  } catch (err) {
    next(err);
  }
}

function toNum(v) {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// DELETE /comissoes/:userId
export async function excluir(req, res, next) {
  try {
    await prisma.configuracaoComissao.delete({
      where: { userId: req.params.userId },
    });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Configuracao nao encontrada" });
    next(err);
  }
}
