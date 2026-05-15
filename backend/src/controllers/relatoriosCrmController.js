import prisma from "../lib/prisma.js";

// ============ RELATORIOS CRM ============
//
// Conjunto de relatorios analiticos focados em relacionamento (CRM puro),
// complementares aos relatorios operacionais em relatoriosController.js.
//
// Diferenca chave: aqui o foco e o funil de oportunidades, performance
// comercial, motivos de perda e cadencia de atividades. Operacional
// (faturamento, fluxo de caixa, estoque) vive no outro controller.

const ETAPAS = ["LEAD", "QUALIFICADO", "PROPOSTA", "NEGOCIACAO", "GANHO", "PERDIDO"];

// Sequencia "esperada" do funil para calcular conversao etapa-a-etapa.
// PERDIDO e terminal lateral — nao entra no calculo de avanco.
const FLUXO = ["LEAD", "QUALIFICADO", "PROPOSTA", "NEGOCIACAO", "GANHO"];

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

function diasEntre(inicio, fim) {
  if (!inicio || !fim) return null;
  return Math.max(0, Math.floor((fim.getTime() - inicio.getTime()) / 86400000));
}

// ============ RELATORIO DE FUNIL DE VENDAS ============
//
// Visao analitica do pipeline de oportunidades.
//
// Filtros:
//   dataInicio, dataFim  -> filtram a criacao da oportunidade (createdAt)
//   responsavelId        -> vendedor responsavel
//   origem               -> origem do lead (INDICACAO, INSTAGRAM, etc)
//
// Retorno:
//   resumo                -> KPIs do periodo
//   porEtapa              -> distribuicao das oportunidades nas 6 etapas
//   conversaoEtapaEtapa   -> taxa de avanco entre etapas adjacentes (LEAD->QUAL, ...)
//                            calculada com base em HistoricoOportunidade
//   porOrigem             -> performance por origem
//   porResponsavel        -> ranking de vendedores no funil
//   motivosPerda          -> agrupamento por motivoPerda
//   oportunidades         -> detalhamento (limitado para nao estourar payload)
export async function relatorioFunilCrm(req, res, next) {
  try {
    const { dataInicio, dataFim, responsavelId, origem } = req.query;
    const di = parseDataInicio(dataInicio);
    const df = parseDataFim(dataFim);

    const where = {};
    if (di || df) where.createdAt = {};
    if (di) where.createdAt.gte = di;
    if (df) where.createdAt.lte = df;
    if (responsavelId) where.responsavelId = responsavelId;
    if (origem) where.origem = origem;

    const oportunidades = await prisma.oportunidade.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        cliente: { select: { id: true, nome: true } },
        responsavel: { select: { id: true, nome: true } },
        historico: {
          select: { etapaAnterior: true, etapaNova: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // ===== RESUMO =====
    let valorEstimadoAberto = 0;
    let valorPonderadoAberto = 0;
    let valorGanho = 0;
    let totalGanho = 0;
    let totalPerdido = 0;
    let totalAbertas = 0;
    let somaCicloGanho = 0;
    let countCicloGanho = 0;

    for (const o of oportunidades) {
      const valor = toNum(o.valorEstimado);
      const prob = toNum(o.probabilidade) / 100;
      if (o.etapa === "GANHO") {
        totalGanho += 1;
        valorGanho += valor;
        if (o.dataGanho) {
          const ciclo = diasEntre(o.createdAt, o.dataGanho);
          if (ciclo !== null) { somaCicloGanho += ciclo; countCicloGanho += 1; }
        }
      } else if (o.etapa === "PERDIDO") {
        totalPerdido += 1;
      } else {
        totalAbertas += 1;
        valorEstimadoAberto += valor;
        valorPonderadoAberto += valor * prob;
      }
    }

    const totalFechadas = totalGanho + totalPerdido;
    const taxaConversao = totalFechadas > 0 ? (totalGanho / totalFechadas) * 100 : 0;
    const ticketMedioGanho = totalGanho > 0 ? valorGanho / totalGanho : 0;
    const cicloMedioGanhoDias = countCicloGanho > 0 ? somaCicloGanho / countCicloGanho : 0;

    // ===== POR ETAPA =====
    const mapaEtapa = {};
    for (const e of ETAPAS) {
      mapaEtapa[e] = { etapa: e, quantidade: 0, valorEstimado: 0, valorPonderado: 0 };
    }
    for (const o of oportunidades) {
      const valor = toNum(o.valorEstimado);
      const prob = toNum(o.probabilidade) / 100;
      mapaEtapa[o.etapa].quantidade += 1;
      mapaEtapa[o.etapa].valorEstimado += valor;
      mapaEtapa[o.etapa].valorPonderado += valor * prob;
    }
    const porEtapa = ETAPAS.map(e => mapaEtapa[e]);

    // ===== CONVERSAO ETAPA-A-ETAPA =====
    // Para cada oportunidade, calculamos o conjunto de etapas que ela visitou
    // (etapa atual + todas as etapas anteriores no historico). A taxa de
    // conversao entre A e B e: oportunidades_que_visitaram_B / oportunidades_que_visitaram_A.
    //
    // Isso responde "de cada 100 leads que entraram, quantos chegaram em qualificado?".
    const visitouEtapa = {};
    for (const e of FLUXO) visitouEtapa[e] = 0;

    for (const o of oportunidades) {
      const visitadas = new Set();
      // historico ordenado asc; etapaAnterior na primeira entrada e a etapa inicial.
      // Mas se nao houver historico, a oportunidade entrou direto na etapa atual.
      for (const h of o.historico) {
        if (h.etapaAnterior) visitadas.add(h.etapaAnterior);
        visitadas.add(h.etapaNova);
      }
      visitadas.add(o.etapa);
      for (const e of visitadas) {
        if (visitouEtapa[e] !== undefined) visitouEtapa[e] += 1;
      }
    }

    const conversaoEtapaEtapa = [];
    for (let i = 0; i < FLUXO.length - 1; i++) {
      const de = FLUXO[i];
      const para = FLUXO[i + 1];
      const qtdDe = visitouEtapa[de];
      const qtdPara = visitouEtapa[para];
      const taxa = qtdDe > 0 ? (qtdPara / qtdDe) * 100 : 0;
      conversaoEtapaEtapa.push({ de, para, qtdDe, qtdPara, taxa });
    }

    // ===== POR ORIGEM =====
    const mapaOrigem = new Map();
    for (const o of oportunidades) {
      const key = o.origem || "(sem origem)";
      const a = mapaOrigem.get(key) || { origem: key, quantidade: 0, ganhas: 0, perdidas: 0, valorGanho: 0 };
      a.quantidade += 1;
      if (o.etapa === "GANHO") { a.ganhas += 1; a.valorGanho += toNum(o.valorEstimado); }
      else if (o.etapa === "PERDIDO") a.perdidas += 1;
      mapaOrigem.set(key, a);
    }
    const porOrigem = Array.from(mapaOrigem.values())
      .map(a => ({
        ...a,
        taxaConversao: (a.ganhas + a.perdidas) > 0 ? (a.ganhas / (a.ganhas + a.perdidas)) * 100 : 0,
      }))
      .sort((a, b) => b.quantidade - a.quantidade);

    // ===== POR RESPONSAVEL =====
    const mapaResp = new Map();
    for (const o of oportunidades) {
      const id = o.responsavelId || "_sem_";
      const nome = o.responsavel?.nome || "(sem responsavel)";
      const a = mapaResp.get(id) || {
        id, nome, quantidade: 0, abertas: 0, ganhas: 0, perdidas: 0,
        valorAberto: 0, valorGanho: 0,
      };
      a.quantidade += 1;
      const valor = toNum(o.valorEstimado);
      if (o.etapa === "GANHO") { a.ganhas += 1; a.valorGanho += valor; }
      else if (o.etapa === "PERDIDO") a.perdidas += 1;
      else { a.abertas += 1; a.valorAberto += valor; }
      mapaResp.set(id, a);
    }
    const porResponsavel = Array.from(mapaResp.values())
      .map(a => ({
        ...a,
        taxaConversao: (a.ganhas + a.perdidas) > 0 ? (a.ganhas / (a.ganhas + a.perdidas)) * 100 : 0,
      }))
      .sort((a, b) => b.valorGanho - a.valorGanho || b.ganhas - a.ganhas);

    // ===== MOTIVOS DE PERDA =====
    const mapaPerda = new Map();
    for (const o of oportunidades) {
      if (o.etapa !== "PERDIDO") continue;
      const key = (o.motivoPerda && o.motivoPerda.trim()) || "(sem motivo)";
      const a = mapaPerda.get(key) || { motivo: key, quantidade: 0, valorPerdido: 0 };
      a.quantidade += 1;
      a.valorPerdido += toNum(o.valorEstimado);
      mapaPerda.set(key, a);
    }
    const motivosPerda = Array.from(mapaPerda.values())
      .sort((a, b) => b.valorPerdido - a.valorPerdido || b.quantidade - a.quantidade);

    // ===== DETALHAMENTO =====
    // Para cada oportunidade, calculamos "dias na etapa atual" usando o
    // ultimo historico (entrada na etapa atual) ou createdAt como fallback.
    const agora = new Date();
    const detalhe = oportunidades.map(o => {
      const ultimaTransicao = [...o.historico]
        .reverse()
        .find(h => h.etapaNova === o.etapa);
      const entradaEtapa = ultimaTransicao?.createdAt || o.createdAt;
      const diasNaEtapa = diasEntre(entradaEtapa, agora) || 0;
      return {
        id: o.id,
        numero: o.numero,
        titulo: o.titulo,
        cliente: o.cliente?.nome || null,
        responsavel: o.responsavel?.nome || null,
        etapa: o.etapa,
        probabilidade: o.probabilidade,
        valorEstimado: toNum(o.valorEstimado),
        origem: o.origem,
        dataFechamentoPrevista: o.dataFechamentoPrevista,
        createdAt: o.createdAt,
        dataGanho: o.dataGanho,
        dataPerdida: o.dataPerdida,
        motivoPerda: o.motivoPerda,
        diasNaEtapa,
      };
    });

    res.json({
      filtros: {
        dataInicio: di ? di.toISOString() : null,
        dataFim: df ? df.toISOString() : null,
        responsavelId: responsavelId || null,
        origem: origem || null,
      },
      geradoEm: new Date().toISOString(),
      resumo: {
        totalOportunidades: oportunidades.length,
        abertas: totalAbertas,
        ganhas: totalGanho,
        perdidas: totalPerdido,
        taxaConversao,
        valorEstimadoAberto,
        valorPonderadoAberto,
        valorGanho,
        ticketMedioGanho,
        cicloMedioGanhoDias,
      },
      porEtapa,
      conversaoEtapaEtapa,
      porOrigem,
      porResponsavel,
      motivosPerda,
      oportunidades: detalhe,
    });
  } catch (err) {
    next(err);
  }
}
