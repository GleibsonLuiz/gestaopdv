import prisma from "../lib/prisma.js";
import { aplicarLimite } from "../lib/planoLimites.js";

const norm = (v) => (v === undefined || v === null || v === "" ? null : v);

const STATUS_FUNIL = ["LEAD", "CLIENTE_ATIVO", "CLIENTE_INATIVO", "PERDIDO"];

// ============ HELPERS DE SEGMENTACAO RFM ============
//
// Classifica clientes em segmentos com base em Recencia/Frequencia/Monetario.
// Janela padrao de analise: 365 dias.
//
//   VIP        - alta frequencia + alto monetario + recencia baixa
//   RECORRENTE - frequencia >= 3 e recencia < 90d
//   NOVO       - 1 unica compra, ate 30 dias
//   EM_RISCO   - frequencia >= 2 e recencia >= 90d e < 180d
//   INATIVO    - recencia >= 180d (ou nunca comprou e cadastro > 60d)
//   PROSPECT   - nunca comprou (recente)

function classificarSegmento({ qtdCompras, totalGasto, recenciaDias, mediaTotal, mediaQtd }) {
  if (qtdCompras === 0) {
    return recenciaDias === null ? "PROSPECT" : "INATIVO";
  }
  if (recenciaDias >= 180) return "INATIVO";
  if (qtdCompras >= 3 && totalGasto >= mediaTotal * 1.5 && recenciaDias < 60) return "VIP";
  if (qtdCompras >= 3 && recenciaDias < 90) return "RECORRENTE";
  if (qtdCompras === 1 && recenciaDias <= 30) return "NOVO";
  if (recenciaDias >= 90 && recenciaDias < 180) return "EM_RISCO";
  return qtdCompras > 0 ? "RECORRENTE" : "PROSPECT";
}

// ============ LEAD SCORING ============
//
// Score 0-100 derivado de Recencia (35) + Frequencia (25) + Monetario (25)
// + Bonus (15). Classifica em FRIO/MORNO/QUENTE/VIP.
//
// O calculo e proposital e bem documentado para o usuario entender o que
// motiva o score — futuras alteracoes devem manter as faixas previsiveis.

function calcularScore({ qtdCompras, totalGasto, recenciaDias, mediaTotal, npsNota, ehVip }) {
  let recencia = 0;
  if (recenciaDias != null) {
    if (recenciaDias <= 7) recencia = 35;
    else if (recenciaDias <= 30) recencia = 30;
    else if (recenciaDias <= 60) recencia = 22;
    else if (recenciaDias <= 90) recencia = 14;
    else if (recenciaDias <= 180) recencia = 6;
    else recencia = 0;
  }

  let frequencia = 0;
  if (qtdCompras >= 11) frequencia = 25;
  else if (qtdCompras >= 7) frequencia = 22;
  else if (qtdCompras >= 4) frequencia = 18;
  else if (qtdCompras >= 2) frequencia = 12;
  else if (qtdCompras === 1) frequencia = 5;

  let monetario = 0;
  if (mediaTotal > 0) {
    const razao = totalGasto / mediaTotal;
    if (razao >= 2) monetario = 25;
    else if (razao >= 1) monetario = 20;
    else if (razao >= 0.5) monetario = 12;
    else if (totalGasto > 0) monetario = 5;
  } else if (totalGasto > 0) {
    // Sem outros clientes para comparar — entrega o maximo do componente.
    monetario = 25;
  }

  let bonus = 0;
  // Bonus NPS: promotor (9-10) = +10, neutro (7-8) = +5
  if (npsNota != null) {
    if (npsNota >= 9) bonus += 10;
    else if (npsNota >= 7) bonus += 5;
  }
  // Bonus tag VIP manual: +5 (caps em 15 total)
  if (ehVip) bonus += 5;
  bonus = Math.min(bonus, 15);

  const total = Math.min(100, recencia + frequencia + monetario + bonus);
  return {
    score: total,
    classificacao: classificarScore(total),
    breakdown: { recencia, frequencia, monetario, bonus },
  };
}

function classificarScore(score) {
  if (score >= 76) return "VIP";
  if (score >= 51) return "QUENTE";
  if (score >= 26) return "MORNO";
  return "FRIO";
}

export async function listar(req, res, next) {
  try {
    const { search, ativo, segmento, tagId, statusFunil, origem } = req.query;
    const where = {};
    if (ativo === "true") where.ativo = true;
    if (ativo === "false") where.ativo = false;
    if (statusFunil && STATUS_FUNIL.includes(statusFunil)) where.statusFunil = statusFunil;
    if (origem) where.origem = origem;
    if (search) {
      where.OR = [
        { nome: { contains: search, mode: "insensitive" } },
        { cpfCnpj: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    if (tagId) {
      where.tags = { some: { tagId } };
    }
    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: { nome: "asc" },
      include: { tags: { include: { tag: true } } },
    });

    // Achata as tags
    const lista = clientes.map((c) => ({
      ...c,
      tags: c.tags.map((ct) => ({ id: ct.tag.id, nome: ct.tag.nome, cor: ct.tag.cor })),
    }));

    // Se nao filtrou por segmento, retorna direto (mais leve)
    if (!segmento) return res.json(lista);

    // Calcula RFM apenas para filtrar
    const ids = lista.map((c) => c.id);
    const vendas = await prisma.venda.findMany({
      where: { clienteId: { in: ids }, status: "CONCLUIDA" },
      select: { clienteId: true, total: true, createdAt: true },
    });

    const agg = new Map();
    for (const v of vendas) {
      const a = agg.get(v.clienteId) || { qtd: 0, total: 0, ultima: null };
      a.qtd += 1;
      a.total += Number(v.total);
      if (!a.ultima || v.createdAt > a.ultima) a.ultima = v.createdAt;
      agg.set(v.clienteId, a);
    }

    // Para o segmento VIP precisamos da media de todos os clientes
    const arr = Array.from(agg.values());
    const mediaTotal = arr.length ? arr.reduce((s, x) => s + x.total, 0) / arr.length : 0;
    const mediaQtd = arr.length ? arr.reduce((s, x) => s + x.qtd, 0) / arr.length : 0;
    const hoje = Date.now();

    const filtrada = lista.filter((c) => {
      const a = agg.get(c.id);
      const qtdCompras = a?.qtd || 0;
      const totalGasto = a?.total || 0;
      const recenciaDias = a?.ultima ? Math.floor((hoje - a.ultima.getTime()) / 86400000) : null;
      const seg = classificarSegmento({ qtdCompras, totalGasto, recenciaDias, mediaTotal, mediaQtd });
      return seg === segmento;
    });

    res.json(filtrada);
  } catch (err) {
    next(err);
  }
}

// ============ SEGMENTOS RFM ============
//
// Retorna lista de clientes com KPIs RFM calculados + segmento classificado.
// Janela: ultimos 365 dias por default.

export async function segmentos(req, res, next) {
  try {
    const dias = parseInt(req.query.dias || "365", 10);
    const desde = new Date(Date.now() - dias * 86400000);

    const [clientes, vendas, npsRespostas] = await Promise.all([
      prisma.cliente.findMany({
        where: { ativo: true },
        select: {
          id: true, nome: true, telefone: true, email: true, cidade: true, estado: true,
          createdAt: true,
          tags: { include: { tag: true } },
        },
      }),
      prisma.venda.findMany({
        where: { status: "CONCLUIDA", createdAt: { gte: desde }, clienteId: { not: null } },
        select: { clienteId: true, total: true, createdAt: true },
      }),
      // Para o bonus de score: pega a ultima resposta NPS de cada cliente.
      prisma.pesquisaNps.findMany({
        where: { respondidaEm: { not: null }, clienteId: { not: null } },
        orderBy: { respondidaEm: "desc" },
        select: { clienteId: true, nota: true, respondidaEm: true },
      }),
    ]);

    // Mapeia cada clienteId para sua nota NPS mais recente.
    const npsPorCliente = new Map();
    for (const r of npsRespostas) {
      if (!npsPorCliente.has(r.clienteId)) npsPorCliente.set(r.clienteId, r.nota);
    }

    const agg = new Map();
    for (const v of vendas) {
      if (!v.clienteId) continue;
      const a = agg.get(v.clienteId) || { qtd: 0, total: 0, ultima: null };
      a.qtd += 1;
      a.total += Number(v.total);
      if (!a.ultima || v.createdAt > a.ultima) a.ultima = v.createdAt;
      agg.set(v.clienteId, a);
    }

    const arr = Array.from(agg.values());
    const mediaTotal = arr.length ? arr.reduce((s, x) => s + x.total, 0) / arr.length : 0;
    const mediaQtd = arr.length ? arr.reduce((s, x) => s + x.qtd, 0) / arr.length : 0;
    const hoje = Date.now();

    const enriquecidos = clientes.map((c) => {
      const a = agg.get(c.id);
      const qtdCompras = a?.qtd || 0;
      const totalGasto = a?.total || 0;
      const recenciaDias = a?.ultima ? Math.floor((hoje - a.ultima.getTime()) / 86400000) : null;
      const ticketMedio = qtdCompras > 0 ? totalGasto / qtdCompras : 0;
      const segmento = classificarSegmento({ qtdCompras, totalGasto, recenciaDias, mediaTotal, mediaQtd });
      const tags = c.tags.map((ct) => ({ id: ct.tag.id, nome: ct.tag.nome, cor: ct.tag.cor }));
      const ehVip = tags.some((t) => t.nome === "VIP");
      const scoreInfo = calcularScore({
        qtdCompras, totalGasto, recenciaDias, mediaTotal,
        npsNota: npsPorCliente.get(c.id) ?? null,
        ehVip,
      });
      return {
        id: c.id,
        nome: c.nome,
        telefone: c.telefone,
        email: c.email,
        cidade: c.cidade,
        estado: c.estado,
        tags,
        rfm: {
          recenciaDias,
          frequencia: qtdCompras,
          monetario: totalGasto,
          ticketMedio,
          ultimaCompra: a?.ultima || null,
        },
        segmento,
        score: scoreInfo.score,
        classificacaoScore: scoreInfo.classificacao,
        scoreBreakdown: scoreInfo.breakdown,
      };
    });

    // Contagem por segmento (para os KPIs)
    const SEGS = ["VIP", "RECORRENTE", "NOVO", "EM_RISCO", "INATIVO", "PROSPECT"];
    const resumo = {};
    for (const s of SEGS) resumo[s] = { quantidade: 0, monetario: 0 };
    for (const c of enriquecidos) {
      resumo[c.segmento].quantidade += 1;
      resumo[c.segmento].monetario += c.rfm.monetario;
    }

    res.json({ janelaDias: dias, resumo, clientes: enriquecidos });
  } catch (err) {
    next(err);
  }
}

// ============ ANIVERSARIANTES ============
//
// Retorna clientes aniversariantes do mes (ou periodo) com idade calculada.
// Query params:
//   mes  - 1-12 (default: mes atual)
//   dia  - opcional: filtra apenas esse dia
//
// Compatibilidade com Postgres: usamos extract() via raw query porque o
// Prisma nao tem helper nativo para "mes da data".

export async function aniversariantes(req, res, next) {
  try {
    const hoje = new Date();
    const mes = parseInt(req.query.mes || (hoje.getMonth() + 1), 10);
    const dia = req.query.dia ? parseInt(req.query.dia, 10) : null;

    if (mes < 1 || mes > 12) {
      return res.status(400).json({ erro: "Mes invalido (1-12)" });
    }

    // Multi-tenant: $queryRaw bypassa o Prisma Extension, adicionamos
    // filtro tenantId manualmente. mes e dia ja foram sanitizados via
    // parseInt; usamos template tag $queryRaw que faz binding seguro.
    const tenantId = req.tenantId;

    const linhas = dia
      ? await prisma.$queryRaw`
          SELECT id, nome, telefone, email, cidade, estado, "dataNascimento",
                 "statusFunil", origem
          FROM clientes
          WHERE ativo = true
            AND "dataNascimento" IS NOT NULL
            AND EXTRACT(MONTH FROM "dataNascimento") = ${mes}
            AND EXTRACT(DAY FROM "dataNascimento") = ${dia}
            AND "tenantId" = ${tenantId}
          ORDER BY EXTRACT(DAY FROM "dataNascimento") ASC, nome ASC
        `
      : await prisma.$queryRaw`
          SELECT id, nome, telefone, email, cidade, estado, "dataNascimento",
                 "statusFunil", origem
          FROM clientes
          WHERE ativo = true
            AND "dataNascimento" IS NOT NULL
            AND EXTRACT(MONTH FROM "dataNascimento") = ${mes}
            AND "tenantId" = ${tenantId}
          ORDER BY EXTRACT(DAY FROM "dataNascimento") ASC, nome ASC
        `;

    // Carrega tags em uma segunda query
    const ids = linhas.map((l) => l.id);
    const tagsRows = ids.length === 0 ? [] : await prisma.clienteTag.findMany({
      where: { clienteId: { in: ids } },
      include: { tag: true },
    });
    const tagsPorCliente = new Map();
    for (const ct of tagsRows) {
      const lista = tagsPorCliente.get(ct.clienteId) || [];
      lista.push({ id: ct.tag.id, nome: ct.tag.nome, cor: ct.tag.cor });
      tagsPorCliente.set(ct.clienteId, lista);
    }

    const enriquecidos = linhas.map((c) => {
      const d = new Date(c.dataNascimento);
      const diaNasc = d.getUTCDate();
      const mesNasc = d.getUTCMonth() + 1;
      const anoNasc = d.getUTCFullYear();
      // Idade no ano atual (assumindo aniversario ja passou no caso de mes < atual)
      const idade = hoje.getFullYear() - anoNasc;
      return {
        ...c,
        tags: tagsPorCliente.get(c.id) || [],
        diaNascimento: diaNasc,
        mesNascimento: mesNasc,
        anoNascimento: anoNasc,
        idade,
      };
    });

    res.json({ mes, dia, total: enriquecidos.length, clientes: enriquecidos });
  } catch (err) {
    next(err);
  }
}

// ============ REATIVACAO ============
//
// Retorna clientes ativos sem compra ha X dias (default 90), ordenados
// por LTV decrescente para priorizar.

export async function reativacao(req, res, next) {
  try {
    const diasMin = parseInt(req.query.diasMin || "90", 10);
    const limite = new Date(Date.now() - diasMin * 86400000);

    // Clientes ativos que tem ao menos uma venda CONCLUIDA, e cuja ultima
    // venda foi antes de `limite`. (Quem nunca comprou nao entra — sao leads.)
    const clientes = await prisma.cliente.findMany({
      where: {
        ativo: true,
        vendas: {
          some: { status: "CONCLUIDA" },
          none: { status: "CONCLUIDA", createdAt: { gte: limite } },
        },
      },
      include: {
        tags: { include: { tag: true } },
        vendas: {
          where: { status: "CONCLUIDA" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, total: true, userId: true },
        },
      },
    });

    // Calcula LTV (soma) numa segunda query agregada
    const ids = clientes.map((c) => c.id);
    const agregados = ids.length === 0 ? [] : await prisma.venda.groupBy({
      by: ["clienteId"],
      where: { status: "CONCLUIDA", clienteId: { in: ids } },
      _sum: { total: true },
      _count: { id: true },
    });
    const ltvPorCliente = new Map();
    for (const a of agregados) {
      ltvPorCliente.set(a.clienteId, {
        ltv: Number(a._sum.total || 0),
        qtd: a._count.id,
      });
    }

    const hoje = Date.now();
    const enriquecidos = clientes.map((c) => {
      const ult = c.vendas[0];
      const recenciaDias = ult ? Math.floor((hoje - new Date(ult.createdAt).getTime()) / 86400000) : null;
      const stats = ltvPorCliente.get(c.id) || { ltv: 0, qtd: 0 };
      return {
        id: c.id,
        nome: c.nome,
        telefone: c.telefone,
        email: c.email,
        cidade: c.cidade,
        estado: c.estado,
        statusFunil: c.statusFunil,
        origem: c.origem,
        ultimaCompra: ult?.createdAt || null,
        recenciaDias,
        ltv: stats.ltv,
        qtdCompras: stats.qtd,
        ultimoVendedorId: ult?.userId || null,
        tags: c.tags.map((ct) => ({ id: ct.tag.id, nome: ct.tag.nome, cor: ct.tag.cor })),
      };
    }).sort((a, b) => b.ltv - a.ltv);

    res.json({
      diasMin,
      total: enriquecidos.length,
      totalLtv: enriquecidos.reduce((s, c) => s + c.ltv, 0),
      clientes: enriquecidos,
    });
  } catch (err) {
    next(err);
  }
}

export async function obter(req, res, next) {
  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id: req.params.id },
      include: { tags: { include: { tag: true } } },
    });
    if (!cliente) return res.status(404).json({ erro: "Cliente nao encontrado" });
    res.json({
      ...cliente,
      tags: cliente.tags.map((ct) => ({ id: ct.tag.id, nome: ct.tag.nome, cor: ct.tag.cor })),
    });
  } catch (err) {
    next(err);
  }
}

// Lead score de um unico cliente. Reusa calcularScore com a mesma mediaTotal
// global de /clientes/segmentos (vendas concluidas dos ultimos 365 dias)
// para garantir consistencia entre Segmentos e PerfilCliente — se mostrar
// score 72 numa tela, mostra 72 na outra.
export async function obterScore(req, res, next) {
  try {
    const { id } = req.params;
    const dias = parseInt(req.query.dias || "365", 10);
    const desde = new Date(Date.now() - dias * 86400000);

    const cliente = await prisma.cliente.findUnique({
      where: { id },
      select: {
        id: true, nome: true,
        tags: { include: { tag: true } },
      },
    });
    if (!cliente) return res.status(404).json({ erro: "Cliente nao encontrado" });

    const [vendasTodas, ultimaNps] = await Promise.all([
      prisma.venda.findMany({
        where: { status: "CONCLUIDA", createdAt: { gte: desde }, clienteId: { not: null } },
        select: { clienteId: true, total: true, createdAt: true },
      }),
      prisma.pesquisaNps.findFirst({
        where: { clienteId: id, respondidaEm: { not: null } },
        orderBy: { respondidaEm: "desc" },
        select: { nota: true, respondidaEm: true },
      }),
    ]);

    // Agrega por cliente para calcular mediaTotal global (mesma logica de
    // /clientes/segmentos). Em paralelo, ja extrai os dados do alvo.
    const agg = new Map();
    for (const v of vendasTodas) {
      const a = agg.get(v.clienteId) || { qtd: 0, total: 0, ultima: null };
      a.qtd += 1;
      a.total += Number(v.total);
      if (!a.ultima || v.createdAt > a.ultima) a.ultima = v.createdAt;
      agg.set(v.clienteId, a);
    }
    const arr = Array.from(agg.values());
    const mediaTotal = arr.length ? arr.reduce((s, x) => s + x.total, 0) / arr.length : 0;

    const meu = agg.get(id);
    const qtdCompras = meu?.qtd || 0;
    const totalGasto = meu?.total || 0;
    const recenciaDias = meu?.ultima
      ? Math.floor((Date.now() - meu.ultima.getTime()) / 86400000)
      : null;
    const ticketMedio = qtdCompras > 0 ? totalGasto / qtdCompras : 0;
    const ehVip = cliente.tags.some((ct) => ct.tag.nome === "VIP");

    const info = calcularScore({
      qtdCompras, totalGasto, recenciaDias, mediaTotal,
      npsNota: ultimaNps?.nota ?? null,
      ehVip,
    });

    res.json({
      score: info.score,
      classificacao: info.classificacao,
      breakdown: info.breakdown,
      janelaDias: dias,
      kpis: {
        qtdCompras,
        totalGasto,
        recenciaDias,
        ticketMedio,
        ultimaCompra: meu?.ultima || null,
        npsNota: ultimaNps?.nota ?? null,
        ehVip,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const { nome } = req.body;
    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ erro: "Nome e obrigatorio" });
    }
    if (req.body.statusFunil && !STATUS_FUNIL.includes(req.body.statusFunil)) {
      return res.status(400).json({ erro: "Status do funil invalido" });
    }
    // ETAPA 13: limite por plano
    if (!await aplicarLimite(req, res, "clientes")) return;
    const cliente = await prisma.cliente.create({
      data: {
        nome: String(nome).trim(),
        cpfCnpj: norm(req.body.cpfCnpj),
        email: norm(req.body.email),
        telefone: norm(req.body.telefone),
        endereco: norm(req.body.endereco),
        bairro: norm(req.body.bairro),
        cidade: norm(req.body.cidade),
        estado: norm(req.body.estado),
        cep: norm(req.body.cep),
        observacoes: norm(req.body.observacoes),
        origem: norm(req.body.origem),
        statusFunil: req.body.statusFunil || "LEAD",
        dataNascimento: req.body.dataNascimento ? new Date(req.body.dataNascimento) : null,
      },
    });
    res.status(201).json(cliente);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ erro: "Ja existe um cliente com este CPF/CNPJ" });
    }
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const data = {};
    if (req.body.nome !== undefined) {
      const n = String(req.body.nome).trim();
      if (!n) return res.status(400).json({ erro: "Nome nao pode ser vazio" });
      data.nome = n;
    }
    for (const campo of ["cpfCnpj", "email", "telefone", "endereco", "bairro", "cidade", "estado", "cep", "observacoes", "origem"]) {
      if (req.body[campo] !== undefined) data[campo] = norm(req.body[campo]);
    }
    if (req.body.ativo !== undefined) data.ativo = !!req.body.ativo;
    if (req.body.statusFunil !== undefined) {
      if (!STATUS_FUNIL.includes(req.body.statusFunil)) {
        return res.status(400).json({ erro: "Status do funil invalido" });
      }
      data.statusFunil = req.body.statusFunil;
    }
    if (req.body.dataNascimento !== undefined) {
      data.dataNascimento = req.body.dataNascimento ? new Date(req.body.dataNascimento) : null;
    }

    const cliente = await prisma.cliente.update({
      where: { id: req.params.id },
      data,
    });
    res.json(cliente);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Cliente nao encontrado" });
    if (err.code === "P2002") return res.status(409).json({ erro: "Ja existe um cliente com este CPF/CNPJ" });
    next(err);
  }
}

export async function perfil(req, res, next) {
  try {
    const { id } = req.params;

    const [cliente, vendas, contasReceber, orcamentos] = await Promise.all([
      prisma.cliente.findUnique({
        where: { id },
        include: { tags: { include: { tag: true } } },
      }),
      prisma.venda.findMany({
        where: { clienteId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          numero: true,
          total: true,
          desconto: true,
          formaPagamento: true,
          status: true,
          createdAt: true,
          user: { select: { nome: true } },
          itens: {
            select: {
              quantidade: true,
              subtotal: true,
              produto: { select: { nome: true } },
            },
          },
        },
      }),
      prisma.contaReceber.findMany({
        where: { clienteId: id },
        orderBy: { vencimento: "desc" },
        take: 50,
        select: {
          id: true,
          descricao: true,
          valor: true,
          vencimento: true,
          recebimento: true,
          status: true,
          parcelaAtual: true,
          parcelaTotal: true,
          tipoRecorrencia: true,
          createdAt: true,
        },
      }),
      prisma.orcamento.findMany({
        where: { clienteId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          numero: true,
          tipo: true,
          status: true,
          total: true,
          tabelaPreco: true,
          formaCondicaoPagamento: true,
          createdAt: true,
          responsavel: { select: { nome: true } },
          user: { select: { nome: true } },
        },
      }),
    ]);

    if (!cliente) return res.status(404).json({ erro: "Cliente nao encontrado" });

    const vendasConcluidas = vendas.filter((v) => v.status === "CONCLUIDA");
    const totalGasto = vendasConcluidas.reduce((s, v) => s + Number(v.total), 0);
    const qtdCompras = vendasConcluidas.length;
    const ticketMedio = qtdCompras > 0 ? totalGasto / qtdCompras : 0;
    const ultimaCompra = vendasConcluidas.length > 0 ? vendasConcluidas[0].createdAt : null;
    const recenciaDias = ultimaCompra
      ? Math.floor((Date.now() - new Date(ultimaCompra).getTime()) / 86400000)
      : null;

    const valorInadimplente = contasReceber
      .filter((c) => c.status === "ATRASADA" || c.status === "PENDENTE")
      .reduce((s, c) => s + Number(c.valor), 0);

    res.json({
      cliente: {
        ...cliente,
        tags: cliente.tags.map((ct) => ({ id: ct.tag.id, nome: ct.tag.nome, cor: ct.tag.cor })),
      },
      kpis: { totalGasto, qtdCompras, ticketMedio, ultimaCompra, recenciaDias, valorInadimplente },
      vendas,
      contasReceber,
      orcamentos,
    });
  } catch (err) {
    next(err);
  }
}

// ============ TIMELINE UNIFICADA (CUSTOMER 360) ============
//
// Agrega num unico feed cronologico todos os eventos relevantes do cliente:
// vendas, orcamentos, contas a receber, interacoes (CRM), oportunidades
// (criacao + mudancas de etapa), respostas de NPS, movimentacoes de pontos
// e tarefas. Cada evento tem um `tipo` que o front usa para escolher
// icone/cor. Ordenado do mais recente para o mais antigo.
//
// E read-only e tolerante: se um modulo nao tiver dados, simplesmente nao
// aparece. Cada fonte e limitada para manter o payload enxuto.
export async function timeline(req, res, next) {
  try {
    const { id } = req.params;

    const cliente = await prisma.cliente.findUnique({
      where: { id },
      select: { id: true, nome: true },
    });
    if (!cliente) return res.status(404).json({ erro: "Cliente nao encontrado" });

    const [vendas, orcamentos, contas, interacoes, oportunidades, historicos, nps, pontos, tarefas] =
      await Promise.all([
        prisma.venda.findMany({
          where: { clienteId: id },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true, numero: true, total: true, formaPagamento: true,
            status: true, createdAt: true,
            user: { select: { nome: true } },
            itens: { select: { quantidade: true } },
          },
        }),
        prisma.orcamento.findMany({
          where: { clienteId: id },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true, numero: true, tipo: true, total: true,
            status: true, createdAt: true,
            responsavel: { select: { nome: true } },
            user: { select: { nome: true } },
          },
        }),
        prisma.contaReceber.findMany({
          where: { clienteId: id },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true, descricao: true, valor: true, vencimento: true,
            recebimento: true, status: true, parcelaAtual: true,
            parcelaTotal: true, createdAt: true,
          },
        }),
        prisma.interacao.findMany({
          where: { clienteId: id },
          orderBy: { data: "desc" },
          take: 50,
          select: {
            id: true, tipo: true, descricao: true, data: true,
            user: { select: { nome: true } },
          },
        }),
        prisma.oportunidade.findMany({
          where: { clienteId: id },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true, numero: true, titulo: true, etapa: true,
            valorEstimado: true, motivoPerda: true, createdAt: true,
            responsavel: { select: { nome: true } },
          },
        }),
        prisma.historicoOportunidade.findMany({
          where: { oportunidade: { clienteId: id } },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true, etapaAnterior: true, etapaNova: true, observacao: true,
            createdAt: true,
            oportunidade: { select: { numero: true, titulo: true } },
            user: { select: { nome: true } },
          },
        }),
        prisma.pesquisaNps.findMany({
          where: { clienteId: id, respondidaEm: { not: null } },
          orderBy: { respondidaEm: "desc" },
          take: 30,
          select: {
            id: true, nota: true, comentario: true, respondidaEm: true,
            venda: { select: { numero: true } },
          },
        }),
        prisma.movimentacaoPontos.findMany({
          where: { clienteId: id },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true, tipo: true, pontos: true, descricao: true, createdAt: true,
          },
        }),
        prisma.tarefa.findMany({
          where: { clienteId: id },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: {
            id: true, titulo: true, prioridade: true, status: true,
            prazo: true, concluidaEm: true, createdAt: true,
            responsavel: { select: { nome: true } },
          },
        }),
      ]);

    const eventos = [];

    for (const v of vendas) {
      const qtdItens = v.itens.reduce((s, i) => s + Number(i.quantidade), 0);
      eventos.push({
        id: `venda-${v.id}`,
        tipo: "VENDA",
        data: v.createdAt,
        titulo: `Venda #${v.numero}`,
        descricao: `${qtdItens} item(ns) · ${v.formaPagamento}`,
        valor: Number(v.total),
        status: v.status,
        usuario: v.user?.nome || null,
      });
    }

    for (const o of orcamentos) {
      eventos.push({
        id: `orcamento-${o.id}`,
        tipo: "ORCAMENTO",
        data: o.createdAt,
        titulo: `${o.tipo === "ORDEM_SERVICO" ? "O.S." : "Orçamento"} #${o.numero}`,
        descricao: null,
        valor: Number(o.total),
        status: o.status,
        usuario: o.responsavel?.nome || o.user?.nome || null,
      });
    }

    for (const c of contas) {
      const parcela = c.parcelaAtual && c.parcelaTotal ? ` (${c.parcelaAtual}/${c.parcelaTotal})` : "";
      eventos.push({
        id: `conta-${c.id}`,
        tipo: "CONTA_RECEBER",
        data: c.createdAt,
        titulo: `Conta a receber${parcela}`,
        descricao: c.descricao || null,
        valor: Number(c.valor),
        status: c.status,
        usuario: null,
      });
    }

    for (const i of interacoes) {
      eventos.push({
        id: `interacao-${i.id}`,
        tipo: "INTERACAO",
        subtipo: i.tipo,
        data: i.data,
        titulo: null,
        descricao: i.descricao,
        valor: null,
        status: null,
        usuario: i.user?.nome || null,
      });
    }

    for (const o of oportunidades) {
      eventos.push({
        id: `oportunidade-${o.id}`,
        tipo: "OPORTUNIDADE",
        data: o.createdAt,
        titulo: `Oportunidade #${o.numero} — ${o.titulo}`,
        descricao: o.motivoPerda ? `Motivo da perda: ${o.motivoPerda}` : null,
        valor: o.valorEstimado != null ? Number(o.valorEstimado) : null,
        status: o.etapa,
        usuario: o.responsavel?.nome || null,
      });
    }

    for (const h of historicos) {
      eventos.push({
        id: `histop-${h.id}`,
        tipo: "OPORTUNIDADE_ETAPA",
        data: h.createdAt,
        titulo: `Oportunidade #${h.oportunidade?.numero}: ${h.etapaAnterior || "—"} → ${h.etapaNova}`,
        descricao: h.observacao || null,
        valor: null,
        status: h.etapaNova,
        usuario: h.user?.nome || null,
      });
    }

    for (const n of nps) {
      eventos.push({
        id: `nps-${n.id}`,
        tipo: "NPS",
        data: n.respondidaEm,
        titulo: `NPS: nota ${n.nota}`,
        descricao: n.comentario || (n.venda ? `Referente à venda #${n.venda.numero}` : null),
        valor: null,
        status: n.nota >= 9 ? "PROMOTOR" : n.nota >= 7 ? "NEUTRO" : "DETRATOR",
        usuario: null,
      });
    }

    const LABEL_PONTOS = { GANHO: "Acúmulo", RESGATE: "Resgate", AJUSTE: "Ajuste" };
    for (const p of pontos) {
      eventos.push({
        id: `pontos-${p.id}`,
        tipo: "PONTOS",
        data: p.createdAt,
        titulo: `${LABEL_PONTOS[p.tipo] || "Pontos"}: ${p.pontos > 0 ? "+" : ""}${p.pontos}`,
        descricao: p.descricao || null,
        valor: null,
        status: p.tipo,
        usuario: null,
      });
    }

    for (const t of tarefas) {
      const concluida = t.status === "CONCLUIDA";
      eventos.push({
        id: `tarefa-${t.id}`,
        tipo: "TAREFA",
        data: concluida && t.concluidaEm ? t.concluidaEm : t.createdAt,
        titulo: t.titulo,
        descricao: concluida ? "Tarefa concluída" : (t.prazo ? `Prazo: ${new Date(t.prazo).toLocaleDateString("pt-BR")}` : "Tarefa criada"),
        valor: null,
        status: t.status,
        usuario: t.responsavel?.nome || null,
      });
    }

    eventos.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

    res.json({ clienteId: id, total: eventos.length, eventos: eventos.slice(0, 120) });
  } catch (err) {
    next(err);
  }
}

// Soft-delete apenas: marca ativo=false. Hard-delete foi removido para
// preservar a integridade historica de vendas, contas e orcamentos que
// referenciam o cliente.
export async function excluir(req, res, next) {
  try {
    await prisma.cliente.update({
      where: { id: req.params.id },
      data: { ativo: false },
    });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Cliente nao encontrado" });
    if (err.code === "P2003") {
      return res.status(409).json({
        erro: "Cliente possui vendas ou contas vinculados. Inative em vez de excluir.",
      });
    }
    next(err);
  }
}
