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

// ============ RELATORIO DE ATIVIDADES & CADENCIA ============
//
// Visao da "respiracao comercial" — quem esta acionando clientes,
// com que frequencia, e onde estao os gaps de relacionamento.
//
// Distinto do Performance Comercial (foco em resultados): aqui o foco
// e em acoes (interacoes registradas, tarefas executadas, alcance da
// base) e em identificar clientes sem contato recente.
//
// Filtros:
//   dataInicio, dataFim   -> periodo de analise (interacoes + tarefas concluidas)
//   userId                -> 1 vendedor (ou todos)
//   diasInativo           -> dias sem interacao para entrar na lista
//                            "clientes sem contato" (default 60)
//
// Retorno:
//   resumo                -> KPIs gerais
//   porTipo               -> volume por tipo de interacao
//   porVendedor           -> linha por User com volume + SLA tarefas + alcance
//   clientesSemContato    -> top 30 clientes ativos sem interacao ha N dias
//   distribuicaoSemanal   -> volume de interacoes por dia da semana

const TIPOS_INTERACAO = ["LIGACAO", "WHATSAPP", "EMAIL", "VISITA", "REUNIAO", "ANOTACAO"];

export async function relatorioAtividadesCrm(req, res, next) {
  try {
    const { dataInicio, dataFim, userId, diasInativo } = req.query;
    const di = parseDataInicio(dataInicio);
    const df = parseDataFim(dataFim);
    const diasInativoNum = parseInt(diasInativo || "60", 10);

    const filtroPeriodoInteracoes = {};
    if (di || df) filtroPeriodoInteracoes.data = {};
    if (di) filtroPeriodoInteracoes.data.gte = di;
    if (df) filtroPeriodoInteracoes.data.lte = df;
    if (userId) filtroPeriodoInteracoes.userId = userId;

    const filtroTarefasConcluidas = {
      status: "CONCLUIDA",
    };
    if (di || df) filtroTarefasConcluidas.concluidaEm = {};
    if (di) filtroTarefasConcluidas.concluidaEm.gte = di;
    if (df) filtroTarefasConcluidas.concluidaEm.lte = df;
    if (userId) filtroTarefasConcluidas.responsavelId = userId;

    const filtroTarefasAbertas = {
      status: { in: ["ABERTA", "EM_ANDAMENTO"] },
      ...(userId ? { responsavelId: userId } : {}),
    };

    const [usuarios, interacoes, tarefasConcluidas, tarefasAbertas, clientesAtivos] = await Promise.all([
      prisma.user.findMany({
        where: { ativo: true, role: { in: ["GERENTE", "VENDEDOR"] }, ...(userId ? { id: userId } : {}) },
        select: { id: true, nome: true, role: true },
      }),
      prisma.interacao.findMany({
        where: filtroPeriodoInteracoes,
        select: { id: true, tipo: true, data: true, userId: true, clienteId: true },
      }),
      prisma.tarefa.findMany({
        where: filtroTarefasConcluidas,
        select: { responsavelId: true, prazo: true, concluidaEm: true },
      }),
      prisma.tarefa.findMany({
        where: filtroTarefasAbertas,
        select: { responsavelId: true, prazo: true },
      }),
      prisma.cliente.findMany({
        where: { ativo: true },
        select: { id: true, nome: true, telefone: true, email: true, cidade: true, createdAt: true },
      }),
    ]);

    const agora = new Date();

    // ===== POR TIPO =====
    const mapaTipo = {};
    for (const t of TIPOS_INTERACAO) mapaTipo[t] = { tipo: t, quantidade: 0 };
    for (const i of interacoes) {
      if (mapaTipo[i.tipo]) mapaTipo[i.tipo].quantidade += 1;
    }
    const porTipo = TIPOS_INTERACAO.map(t => mapaTipo[t]);

    // ===== POR VENDEDOR =====
    const mapaUser = new Map();
    for (const u of usuarios) {
      mapaUser.set(u.id, {
        id: u.id, nome: u.nome, role: u.role,
        interacoes: 0,
        interacoesLigacao: 0,
        interacoesWhatsapp: 0,
        interacoesEmail: 0,
        interacoesVisita: 0,
        interacoesReuniao: 0,
        interacoesAnotacao: 0,
        clientesContactados: new Set(),
        tarefasConcluidas: 0,
        tarefasConcluidasNoPrazo: 0,
        tarefasAbertasTotal: 0,
        tarefasAbertasAtrasadas: 0,
      });
    }

    for (const i of interacoes) {
      const a = mapaUser.get(i.userId);
      if (!a) continue;
      a.interacoes += 1;
      if (i.clienteId) a.clientesContactados.add(i.clienteId);
      switch (i.tipo) {
        case "LIGACAO": a.interacoesLigacao += 1; break;
        case "WHATSAPP": a.interacoesWhatsapp += 1; break;
        case "EMAIL": a.interacoesEmail += 1; break;
        case "VISITA": a.interacoesVisita += 1; break;
        case "REUNIAO": a.interacoesReuniao += 1; break;
        case "ANOTACAO": a.interacoesAnotacao += 1; break;
      }
    }

    for (const t of tarefasConcluidas) {
      if (!t.responsavelId) continue;
      const a = mapaUser.get(t.responsavelId);
      if (!a) continue;
      a.tarefasConcluidas += 1;
      if (!t.prazo || (t.concluidaEm && t.concluidaEm <= t.prazo)) {
        a.tarefasConcluidasNoPrazo += 1;
      }
    }

    for (const t of tarefasAbertas) {
      if (!t.responsavelId) continue;
      const a = mapaUser.get(t.responsavelId);
      if (!a) continue;
      a.tarefasAbertasTotal += 1;
      if (t.prazo && new Date(t.prazo) < agora) a.tarefasAbertasAtrasadas += 1;
    }

    const porVendedor = Array.from(mapaUser.values()).map(a => {
      const slaTarefas = a.tarefasConcluidas > 0
        ? (a.tarefasConcluidasNoPrazo / a.tarefasConcluidas) * 100
        : 0;
      const clientesContactados = a.clientesContactados.size;
      delete a.clientesContactados;
      return { ...a, clientesContactados, slaTarefas };
    }).sort((a, b) => b.interacoes - a.interacoes);

    // ===== CLIENTES SEM CONTATO HA N DIAS =====
    // Para cada cliente ativo, achar a interacao mais recente (em qualquer
    // periodo, nao limitada a janela de filtro) e calcular dias desde.
    // Considera apenas clientes cadastrados ha mais que `diasInativoNum` dias.
    const todasInteracoes = await prisma.interacao.findMany({
      select: { clienteId: true, data: true },
      orderBy: { data: "desc" },
    });
    const ultimaInteracaoPorCliente = new Map();
    for (const i of todasInteracoes) {
      if (!i.clienteId) continue;
      if (!ultimaInteracaoPorCliente.has(i.clienteId)) {
        ultimaInteracaoPorCliente.set(i.clienteId, i.data);
      }
    }

    const corteSemContato = new Date(Date.now() - diasInativoNum * 86400000);
    const clientesSemContato = clientesAtivos
      .filter(c => {
        const cadastradoHa = (agora.getTime() - c.createdAt.getTime()) / 86400000;
        if (cadastradoHa < diasInativoNum) return false;
        const ultima = ultimaInteracaoPorCliente.get(c.id);
        return !ultima || ultima < corteSemContato;
      })
      .map(c => {
        const ultima = ultimaInteracaoPorCliente.get(c.id);
        return {
          id: c.id, nome: c.nome,
          telefone: c.telefone, email: c.email, cidade: c.cidade,
          ultimaInteracao: ultima || null,
          diasSemContato: ultima
            ? Math.floor((agora.getTime() - ultima.getTime()) / 86400000)
            : Math.floor((agora.getTime() - c.createdAt.getTime()) / 86400000),
        };
      })
      .sort((a, b) => b.diasSemContato - a.diasSemContato)
      .slice(0, 30);

    // ===== DISTRIBUICAO POR DIA DA SEMANA =====
    const diasSemanaNomes = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const distribuicaoSemanal = diasSemanaNomes.map((nome, idx) => ({
      dia: nome,
      indice: idx,
      quantidade: 0,
    }));
    for (const i of interacoes) {
      const idx = new Date(i.data).getDay();
      distribuicaoSemanal[idx].quantidade += 1;
    }

    // ===== RESUMO =====
    const clientesContactadosTotal = new Set();
    for (const i of interacoes) {
      if (i.clienteId) clientesContactadosTotal.add(i.clienteId);
    }
    const baseAtiva = clientesAtivos.length;
    const cobertura = baseAtiva > 0 ? (clientesContactadosTotal.size / baseAtiva) * 100 : 0;

    // Calcular media por dia util no periodo (segunda a sexta)
    let diasUteis = 0;
    if (di && df) {
      const cursor = new Date(di);
      while (cursor <= df) {
        const dow = cursor.getDay();
        if (dow !== 0 && dow !== 6) diasUteis += 1;
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    const totalTarefasConcluidas = porVendedor.reduce((s, v) => s + v.tarefasConcluidas, 0);
    const totalTarefasNoPrazo = porVendedor.reduce((s, v) => s + v.tarefasConcluidasNoPrazo, 0);
    const slaGeral = totalTarefasConcluidas > 0
      ? (totalTarefasNoPrazo / totalTarefasConcluidas) * 100
      : 0;
    const totalAtrasadas = porVendedor.reduce((s, v) => s + v.tarefasAbertasAtrasadas, 0);

    res.json({
      filtros: {
        dataInicio: di ? di.toISOString() : null,
        dataFim: df ? df.toISOString() : null,
        userId: userId || null,
        diasInativo: diasInativoNum,
      },
      geradoEm: new Date().toISOString(),
      resumo: {
        totalInteracoes: interacoes.length,
        clientesContactados: clientesContactadosTotal.size,
        baseAtiva,
        cobertura,
        mediaPorDiaUtil: diasUteis > 0 ? interacoes.length / diasUteis : 0,
        diasUteis,
        totalTarefasConcluidas,
        slaGeral,
        totalAtrasadas,
        clientesSemContato: clientesSemContato.length,
      },
      porTipo,
      porVendedor,
      clientesSemContato,
      distribuicaoSemanal,
    });
  } catch (err) {
    next(err);
  }
}

// ============ RELATORIO NPS CONSOLIDADO ============
//
// Net Promoter Score (NPS) calculado sobre PesquisaNps criadas a partir
// de Vendas CONCLUIDAS no periodo.
//
// Faixas (padrao NPS):
//   0-6  = Detrator
//   7-8  = Neutro
//   9-10 = Promotor
//
// NPS Score = %promotores - %detratores
//
// Filtros:
//   dataInicio, dataFim   -> periodo de criacao da pesquisa (createdAt)
//   userId                -> vendedor da Venda associada
//   somenteRespondidas    -> "true" exclui as nao respondidas
//
// Retorno:
//   resumo                -> NPS score, taxa de resposta, contagens
//   distribuicao          -> detratores/neutros/promotores (qtd, %)
//   porVendedor           -> NPS por vendedor da venda
//   evolucaoMensal        -> NPS por mes (ano-mes) com qtd
//   detratoresRecentes    -> nota 0-6 dos ultimos 30 dias
//   pesquisas             -> detalhamento

function faixaNps(nota) {
  if (nota === null || nota === undefined) return null;
  if (nota <= 6) return "DETRATOR";
  if (nota <= 8) return "NEUTRO";
  return "PROMOTOR";
}

function ymKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function relatorioNpsCrm(req, res, next) {
  try {
    const { dataInicio, dataFim, userId, somenteRespondidas } = req.query;
    const di = parseDataInicio(dataInicio);
    const df = parseDataFim(dataFim);

    const where = {};
    if (di || df) where.createdAt = {};
    if (di) where.createdAt.gte = di;
    if (df) where.createdAt.lte = df;
    if (somenteRespondidas === "true") where.respondidaEm = { not: null };
    if (userId) where.venda = { userId };

    const pesquisas = await prisma.pesquisaNps.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        cliente: { select: { id: true, nome: true } },
        venda: {
          select: {
            id: true, numero: true, total: true, createdAt: true,
            user: { select: { id: true, nome: true } },
          },
        },
      },
    });

    // ===== CONTAGENS =====
    const totalEnviadas = pesquisas.length;
    let respondidas = 0;
    let detratores = 0, neutros = 0, promotores = 0;
    let somaNotas = 0;

    for (const p of pesquisas) {
      if (p.nota === null || p.nota === undefined) continue;
      respondidas += 1;
      somaNotas += p.nota;
      const f = faixaNps(p.nota);
      if (f === "DETRATOR") detratores += 1;
      else if (f === "NEUTRO") neutros += 1;
      else if (f === "PROMOTOR") promotores += 1;
    }

    const npsScore = respondidas > 0
      ? ((promotores / respondidas) * 100) - ((detratores / respondidas) * 100)
      : 0;
    const notaMedia = respondidas > 0 ? somaNotas / respondidas : 0;
    const taxaResposta = totalEnviadas > 0 ? (respondidas / totalEnviadas) * 100 : 0;

    const distribuicao = [
      { faixa: "DETRATOR", label: "Detratores (0-6)", quantidade: detratores, percentual: respondidas > 0 ? (detratores / respondidas) * 100 : 0 },
      { faixa: "NEUTRO", label: "Neutros (7-8)", quantidade: neutros, percentual: respondidas > 0 ? (neutros / respondidas) * 100 : 0 },
      { faixa: "PROMOTOR", label: "Promotores (9-10)", quantidade: promotores, percentual: respondidas > 0 ? (promotores / respondidas) * 100 : 0 },
    ];

    // ===== POR VENDEDOR =====
    const mapaVend = new Map();
    for (const p of pesquisas) {
      const u = p.venda?.user;
      if (!u) continue;
      const a = mapaVend.get(u.id) || {
        id: u.id, nome: u.nome,
        enviadas: 0, respondidas: 0,
        detratores: 0, neutros: 0, promotores: 0,
        somaNotas: 0,
      };
      a.enviadas += 1;
      if (p.nota !== null && p.nota !== undefined) {
        a.respondidas += 1;
        a.somaNotas += p.nota;
        const f = faixaNps(p.nota);
        if (f === "DETRATOR") a.detratores += 1;
        else if (f === "NEUTRO") a.neutros += 1;
        else if (f === "PROMOTOR") a.promotores += 1;
      }
      mapaVend.set(u.id, a);
    }
    const porVendedor = Array.from(mapaVend.values()).map(a => {
      const npsVend = a.respondidas > 0
        ? ((a.promotores / a.respondidas) * 100) - ((a.detratores / a.respondidas) * 100)
        : 0;
      const notaMediaVend = a.respondidas > 0 ? a.somaNotas / a.respondidas : 0;
      const taxaRespVend = a.enviadas > 0 ? (a.respondidas / a.enviadas) * 100 : 0;
      delete a.somaNotas;
      return { ...a, nps: npsVend, notaMedia: notaMediaVend, taxaResposta: taxaRespVend };
    }).sort((a, b) => b.nps - a.nps || b.respondidas - a.respondidas);

    // ===== EVOLUCAO MENSAL =====
    const mapaMes = new Map();
    for (const p of pesquisas) {
      if (p.nota === null || p.nota === undefined) continue;
      const key = ymKey(p.createdAt);
      const a = mapaMes.get(key) || { ym: key, respondidas: 0, detratores: 0, promotores: 0, somaNotas: 0 };
      a.respondidas += 1;
      a.somaNotas += p.nota;
      const f = faixaNps(p.nota);
      if (f === "DETRATOR") a.detratores += 1;
      else if (f === "PROMOTOR") a.promotores += 1;
      mapaMes.set(key, a);
    }
    const evolucaoMensal = Array.from(mapaMes.values())
      .map(a => ({
        mes: a.ym,
        respondidas: a.respondidas,
        nps: a.respondidas > 0
          ? ((a.promotores / a.respondidas) * 100) - ((a.detratores / a.respondidas) * 100)
          : 0,
        notaMedia: a.respondidas > 0 ? a.somaNotas / a.respondidas : 0,
      }))
      .sort((a, b) => a.mes.localeCompare(b.mes));

    // ===== DETRATORES RECENTES (ultimos 30d) =====
    const ha30dias = new Date(Date.now() - 30 * 86400000);
    const detratoresRecentes = pesquisas
      .filter(p => p.nota !== null && p.nota <= 6 && p.respondidaEm && p.respondidaEm >= ha30dias)
      .map(p => ({
        id: p.id,
        nota: p.nota,
        comentario: p.comentario,
        respondidaEm: p.respondidaEm,
        cliente: p.cliente?.nome || null,
        venda: p.venda ? { numero: p.venda.numero, total: toNum(p.venda.total) } : null,
        vendedor: p.venda?.user?.nome || null,
      }))
      .sort((a, b) => (b.respondidaEm?.getTime() || 0) - (a.respondidaEm?.getTime() || 0));

    // ===== DETALHAMENTO =====
    const detalhe = pesquisas.map(p => ({
      id: p.id,
      nota: p.nota,
      faixa: faixaNps(p.nota),
      comentario: p.comentario,
      createdAt: p.createdAt,
      respondidaEm: p.respondidaEm,
      cliente: p.cliente?.nome || null,
      venda: p.venda ? { numero: p.venda.numero, total: toNum(p.venda.total) } : null,
      vendedor: p.venda?.user?.nome || null,
    }));

    res.json({
      filtros: {
        dataInicio: di ? di.toISOString() : null,
        dataFim: df ? df.toISOString() : null,
        userId: userId || null,
        somenteRespondidas: somenteRespondidas === "true",
      },
      geradoEm: new Date().toISOString(),
      resumo: {
        totalEnviadas,
        respondidas,
        taxaResposta,
        npsScore,
        notaMedia,
        detratores,
        neutros,
        promotores,
      },
      distribuicao,
      porVendedor,
      evolucaoMensal,
      detratoresRecentes,
      pesquisas: detalhe,
    });
  } catch (err) {
    next(err);
  }
}

// ============ RELATORIO DE CARTEIRA DE CLIENTES (RFM) ============
//
// Visao da base instalada de clientes, segmentada via RFM
// (Recencia/Frequencia/Monetario) na janela escolhida. Reusa a logica
// usada em clienteController e dashboardCrmController.
//
// Filtros:
//   janelaDias    -> janela RFM (default 365)
//   segmento      -> filtra detalhamento por VIP/RECORRENTE/...
//   tagId         -> filtra clientes que tem essa tag
//   statusFunil   -> LEAD/CLIENTE_ATIVO/CLIENTE_INATIVO/PERDIDO
//   cidade        -> filtra por cidade
//
// Retorno:
//   resumo                -> KPIs gerais (LTV, retencao, churn, ticket medio)
//   porSegmento           -> distribuicao 6 segmentos (qtd, monetario, %)
//   porCidade             -> top 10 cidades por monetario
//   porTag                -> cobertura por tag (qtd + monetario)
//   topLtv                -> top 20 clientes por gasto total
//   clientes              -> detalhamento completo (com filtros aplicados)

const SEGMENTOS_RFM = ["VIP", "RECORRENTE", "NOVO", "EM_RISCO", "INATIVO", "PROSPECT"];

function classificarSegmento({ qtdCompras, totalGasto, recenciaDias, mediaTotal }) {
  if (qtdCompras === 0) return recenciaDias === null ? "PROSPECT" : "INATIVO";
  if (recenciaDias >= 180) return "INATIVO";
  if (qtdCompras >= 3 && totalGasto >= mediaTotal * 1.5 && recenciaDias < 60) return "VIP";
  if (qtdCompras >= 3 && recenciaDias < 90) return "RECORRENTE";
  if (qtdCompras === 1 && recenciaDias <= 30) return "NOVO";
  if (recenciaDias >= 90 && recenciaDias < 180) return "EM_RISCO";
  return qtdCompras > 0 ? "RECORRENTE" : "PROSPECT";
}

export async function relatorioCarteiraCrm(req, res, next) {
  try {
    const { janelaDias, segmento, tagId, statusFunil, cidade } = req.query;
    const dias = parseInt(janelaDias || "365", 10);
    const desde = new Date(Date.now() - dias * 86400000);

    const whereCliente = { ativo: true };
    if (statusFunil) whereCliente.statusFunil = statusFunil;
    if (cidade) whereCliente.cidade = cidade;
    if (tagId) whereCliente.tags = { some: { tagId } };

    const [clientes, vendasJanela, tags] = await Promise.all([
      prisma.cliente.findMany({
        where: whereCliente,
        include: {
          tags: { include: { tag: { select: { id: true, nome: true, cor: true } } } },
        },
      }),
      prisma.venda.findMany({
        where: { status: "CONCLUIDA", createdAt: { gte: desde } },
        select: { clienteId: true, total: true, createdAt: true },
      }),
      prisma.tag.findMany({ select: { id: true, nome: true, cor: true } }),
    ]);

    // ===== RFM POR CLIENTE =====
    const aggPorCliente = new Map();
    for (const v of vendasJanela) {
      if (!v.clienteId) continue;
      const a = aggPorCliente.get(v.clienteId) || { qtd: 0, total: 0, ultima: null, primeira: null };
      a.qtd += 1;
      a.total += toNum(v.total);
      if (!a.ultima || v.createdAt > a.ultima) a.ultima = v.createdAt;
      if (!a.primeira || v.createdAt < a.primeira) a.primeira = v.createdAt;
      aggPorCliente.set(v.clienteId, a);
    }
    const valores = Array.from(aggPorCliente.values());
    const mediaTotal = valores.length ? valores.reduce((s, x) => s + x.total, 0) / valores.length : 0;
    const hoje = Date.now();

    const enriquecidos = clientes.map(c => {
      const a = aggPorCliente.get(c.id);
      const qtdCompras = a?.qtd || 0;
      const totalGasto = a?.total || 0;
      const recenciaDias = a?.ultima
        ? Math.floor((hoje - a.ultima.getTime()) / 86400000)
        : null;
      const seg = classificarSegmento({ qtdCompras, totalGasto, recenciaDias, mediaTotal });
      const ticketMedio = qtdCompras > 0 ? totalGasto / qtdCompras : 0;
      return {
        id: c.id,
        nome: c.nome,
        cpfCnpj: c.cpfCnpj,
        email: c.email,
        telefone: c.telefone,
        cidade: c.cidade,
        estado: c.estado,
        statusFunil: c.statusFunil,
        origem: c.origem,
        createdAt: c.createdAt,
        primeiraCompra: a?.primeira || null,
        ultimaCompra: a?.ultima || null,
        qtdCompras,
        totalGasto,
        ticketMedio,
        recenciaDias,
        segmento: seg,
        tags: c.tags.map(ct => ({
          id: ct.tag.id,
          nome: ct.tag.nome,
          cor: ct.tag.cor,
        })),
      };
    });

    // ===== POR SEGMENTO =====
    const mapaSeg = {};
    for (const s of SEGMENTOS_RFM) {
      mapaSeg[s] = { segmento: s, quantidade: 0, monetario: 0, ticketMedio: 0 };
    }
    for (const c of enriquecidos) {
      mapaSeg[c.segmento].quantidade += 1;
      mapaSeg[c.segmento].monetario += c.totalGasto;
    }
    const totalBase = enriquecidos.length;
    const totalMonetario = enriquecidos.reduce((s, c) => s + c.totalGasto, 0);
    const porSegmento = SEGMENTOS_RFM.map(s => {
      const m = mapaSeg[s];
      return {
        ...m,
        ticketMedio: m.quantidade > 0 ? m.monetario / m.quantidade : 0,
        percentualBase: totalBase > 0 ? (m.quantidade / totalBase) * 100 : 0,
        percentualFaturamento: totalMonetario > 0 ? (m.monetario / totalMonetario) * 100 : 0,
      };
    });

    // ===== POR CIDADE =====
    const mapaCidade = new Map();
    for (const c of enriquecidos) {
      const key = c.cidade || "(sem cidade)";
      const a = mapaCidade.get(key) || { cidade: key, estado: c.estado || "—", quantidade: 0, monetario: 0 };
      a.quantidade += 1;
      a.monetario += c.totalGasto;
      mapaCidade.set(key, a);
    }
    const porCidade = Array.from(mapaCidade.values())
      .sort((a, b) => b.monetario - a.monetario || b.quantidade - a.quantidade)
      .slice(0, 10);

    // ===== POR TAG =====
    const mapaTag = new Map();
    for (const t of tags) {
      mapaTag.set(t.id, {
        id: t.id, nome: t.nome, cor: t.cor,
        quantidade: 0, monetario: 0,
      });
    }
    for (const c of enriquecidos) {
      for (const t of c.tags) {
        const a = mapaTag.get(t.id);
        if (!a) continue;
        a.quantidade += 1;
        a.monetario += c.totalGasto;
      }
    }
    const porTag = Array.from(mapaTag.values())
      .filter(t => t.quantidade > 0)
      .sort((a, b) => b.monetario - a.monetario);

    // ===== TOP LTV =====
    const topLtv = [...enriquecidos]
      .filter(c => c.totalGasto > 0)
      .sort((a, b) => b.totalGasto - a.totalGasto)
      .slice(0, 20);

    // ===== DETALHAMENTO FILTRADO =====
    const detalhe = segmento
      ? enriquecidos.filter(c => c.segmento === segmento)
      : enriquecidos;
    detalhe.sort((a, b) => b.totalGasto - a.totalGasto);

    // ===== RESUMO =====
    const comCompra = enriquecidos.filter(c => c.qtdCompras > 0);
    const taxaRetencao = totalBase > 0 ? (comCompra.length / totalBase) * 100 : 0;
    const inativos = enriquecidos.filter(c => c.segmento === "INATIVO" && c.qtdCompras > 0).length;
    const churnRate = comCompra.length > 0 ? (inativos / comCompra.length) * 100 : 0;
    const ltvMedio = comCompra.length > 0
      ? comCompra.reduce((s, c) => s + c.totalGasto, 0) / comCompra.length
      : 0;
    const ticketMedioBase = comCompra.length > 0
      ? comCompra.reduce((s, c) => s + c.ticketMedio, 0) / comCompra.length
      : 0;
    const frequenciaMedia = comCompra.length > 0
      ? comCompra.reduce((s, c) => s + c.qtdCompras, 0) / comCompra.length
      : 0;
    const recenciaMedia = comCompra.length > 0
      ? comCompra.reduce((s, c) => s + (c.recenciaDias || 0), 0) / comCompra.length
      : 0;

    res.json({
      filtros: {
        janelaDias: dias,
        segmento: segmento || null,
        tagId: tagId || null,
        statusFunil: statusFunil || null,
        cidade: cidade || null,
      },
      geradoEm: new Date().toISOString(),
      resumo: {
        totalClientes: totalBase,
        clientesComCompra: comCompra.length,
        taxaRetencao,
        churnRate,
        ltvMedio,
        ticketMedio: ticketMedioBase,
        frequenciaMedia,
        recenciaMedia,
        faturamentoTotal: totalMonetario,
      },
      porSegmento,
      porCidade,
      porTag,
      topLtv,
      clientes: detalhe,
    });
  } catch (err) {
    next(err);
  }
}

// ============ RELATORIO DE PERFORMANCE COMERCIAL ============
//
// Visao consolidada de atividade comercial por vendedor — diferente do
// relatorio de Comissoes (que foca em remuneracao), este foca em acao:
// prospectar, fechar, conversar, executar tarefas.
//
// Filtros:
//   dataInicio, dataFim   -> base para todos os agregados
//   responsavelId         -> 1 vendedor (ou todos, default)
//
// Retorno:
//   resumo                -> KPIs gerais do periodo
//   porVendedor           -> uma linha por User (VENDEDOR/GERENTE ativo)
//                            com prospeccao + fechamento + atividade
//   topFaturamento        -> top 3 por faturamento
//   topConversao          -> top 3 por taxa de conversao (min 3 opp fechadas)
//   topAtividade          -> top 3 por interacoes registradas
export async function relatorioPerformanceCrm(req, res, next) {
  try {
    const { dataInicio, dataFim, responsavelId } = req.query;
    const di = parseDataInicio(dataInicio);
    const df = parseDataFim(dataFim);

    const filtroPeriodo = {};
    if (di || df) filtroPeriodo.gte = di || undefined;
    if (df) filtroPeriodo.lte = df;
    const temFiltroPeriodo = di || df;

    const whereUsuarios = {
      ativo: true,
      role: { in: ["GERENTE", "VENDEDOR"] },
    };
    if (responsavelId) whereUsuarios.id = responsavelId;

    const whereOppPeriodo = temFiltroPeriodo ? { createdAt: filtroPeriodo } : {};
    const whereVendaPeriodo = {
      status: "CONCLUIDA",
      ...(temFiltroPeriodo ? { createdAt: filtroPeriodo } : {}),
    };
    const whereInteracaoPeriodo = temFiltroPeriodo ? { data: filtroPeriodo } : {};
    const whereTarefaConcluidaPeriodo = temFiltroPeriodo
      ? { status: "CONCLUIDA", concluidaEm: filtroPeriodo }
      : { status: "CONCLUIDA" };

    if (responsavelId) {
      whereOppPeriodo.responsavelId = responsavelId;
      whereVendaPeriodo.userId = responsavelId;
      whereInteracaoPeriodo.userId = responsavelId;
      whereTarefaConcluidaPeriodo.responsavelId = responsavelId;
    }

    const [usuarios, oportunidades, vendas, interacoes, tarefasConcluidas, tarefasAbertas] = await Promise.all([
      prisma.user.findMany({
        where: whereUsuarios,
        select: { id: true, nome: true, role: true },
      }),
      prisma.oportunidade.findMany({
        where: whereOppPeriodo,
        select: {
          responsavelId: true, criadoPorId: true, etapa: true,
          valorEstimado: true, createdAt: true, dataGanho: true,
        },
      }),
      prisma.venda.findMany({
        where: whereVendaPeriodo,
        select: { userId: true, total: true, createdAt: true },
      }),
      prisma.interacao.findMany({
        where: whereInteracaoPeriodo,
        select: { userId: true, tipo: true },
      }),
      prisma.tarefa.findMany({
        where: whereTarefaConcluidaPeriodo,
        select: { responsavelId: true, prazo: true, concluidaEm: true },
      }),
      prisma.tarefa.findMany({
        where: {
          status: { in: ["ABERTA", "EM_ANDAMENTO"] },
          ...(responsavelId ? { responsavelId } : {}),
        },
        select: { responsavelId: true, prazo: true },
      }),
    ]);

    const agora = new Date();

    // ===== POR VENDEDOR =====
    const mapa = new Map();
    for (const u of usuarios) {
      mapa.set(u.id, {
        id: u.id,
        nome: u.nome,
        role: u.role,
        // Prospeccao / Funil
        oppCriadas: 0,
        oppGanhas: 0,
        oppPerdidas: 0,
        oppAbertas: 0,
        valorPipelineAberto: 0,
        valorGanho: 0,
        cicloMedioDias: 0,
        _somaCiclo: 0,
        _countCiclo: 0,
        // Vendas concretas
        vendasQtd: 0,
        faturamento: 0,
        ticketMedio: 0,
        // Atividade
        interacoes: 0,
        interacoesLigacao: 0,
        interacoesWhatsapp: 0,
        interacoesEmail: 0,
        interacoesVisita: 0,
        interacoesReuniao: 0,
        interacoesAnotacao: 0,
        // Tarefas
        tarefasConcluidas: 0,
        tarefasConcluidasNoPrazo: 0,
        tarefasConcluidasAtrasadas: 0,
        tarefasAbertasAtrasadas: 0,
        tarefasAbertasTotal: 0,
      });
    }

    for (const o of oportunidades) {
      const id = o.responsavelId;
      if (!id) continue;
      const a = mapa.get(id);
      if (!a) continue;
      const valor = toNum(o.valorEstimado);
      a.oppCriadas += 1;
      if (o.etapa === "GANHO") {
        a.oppGanhas += 1;
        a.valorGanho += valor;
        if (o.dataGanho && o.createdAt) {
          const ciclo = diasEntre(o.createdAt, o.dataGanho);
          if (ciclo !== null) { a._somaCiclo += ciclo; a._countCiclo += 1; }
        }
      } else if (o.etapa === "PERDIDO") {
        a.oppPerdidas += 1;
      } else {
        a.oppAbertas += 1;
        a.valorPipelineAberto += valor;
      }
    }

    for (const v of vendas) {
      const a = mapa.get(v.userId);
      if (!a) continue;
      a.vendasQtd += 1;
      a.faturamento += toNum(v.total);
    }

    for (const i of interacoes) {
      const a = mapa.get(i.userId);
      if (!a) continue;
      a.interacoes += 1;
      switch (i.tipo) {
        case "LIGACAO": a.interacoesLigacao += 1; break;
        case "WHATSAPP": a.interacoesWhatsapp += 1; break;
        case "EMAIL": a.interacoesEmail += 1; break;
        case "VISITA": a.interacoesVisita += 1; break;
        case "REUNIAO": a.interacoesReuniao += 1; break;
        case "ANOTACAO": a.interacoesAnotacao += 1; break;
      }
    }

    for (const t of tarefasConcluidas) {
      if (!t.responsavelId) continue;
      const a = mapa.get(t.responsavelId);
      if (!a) continue;
      a.tarefasConcluidas += 1;
      if (t.prazo && t.concluidaEm) {
        if (t.concluidaEm <= t.prazo) a.tarefasConcluidasNoPrazo += 1;
        else a.tarefasConcluidasAtrasadas += 1;
      } else {
        a.tarefasConcluidasNoPrazo += 1;
      }
    }

    for (const t of tarefasAbertas) {
      if (!t.responsavelId) continue;
      const a = mapa.get(t.responsavelId);
      if (!a) continue;
      a.tarefasAbertasTotal += 1;
      if (t.prazo && new Date(t.prazo) < agora) a.tarefasAbertasAtrasadas += 1;
    }

    const porVendedor = Array.from(mapa.values()).map(a => {
      const oppFechadas = a.oppGanhas + a.oppPerdidas;
      const taxaConversao = oppFechadas > 0 ? (a.oppGanhas / oppFechadas) * 100 : 0;
      const ticketMedio = a.vendasQtd > 0 ? a.faturamento / a.vendasQtd : 0;
      const cicloMedioDias = a._countCiclo > 0 ? a._somaCiclo / a._countCiclo : 0;
      const slaTarefas = a.tarefasConcluidas > 0
        ? (a.tarefasConcluidasNoPrazo / a.tarefasConcluidas) * 100
        : 0;
      delete a._somaCiclo;
      delete a._countCiclo;
      return {
        ...a,
        taxaConversao,
        ticketMedio,
        cicloMedioDias,
        slaTarefas,
      };
    });

    // ===== TOP RANKINGS =====
    const ordenado = (key) => [...porVendedor].sort((a, b) => b[key] - a[key]);

    const topFaturamento = ordenado("faturamento").filter(v => v.faturamento > 0).slice(0, 3);
    const topConversao = porVendedor
      .filter(v => (v.oppGanhas + v.oppPerdidas) >= 3)
      .sort((a, b) => b.taxaConversao - a.taxaConversao)
      .slice(0, 3);
    const topAtividade = ordenado("interacoes").filter(v => v.interacoes > 0).slice(0, 3);

    // ===== RESUMO =====
    const totalFaturamento = porVendedor.reduce((s, v) => s + v.faturamento, 0);
    const totalVendas = porVendedor.reduce((s, v) => s + v.vendasQtd, 0);
    const totalValorGanho = porVendedor.reduce((s, v) => s + v.valorGanho, 0);
    const totalOppCriadas = porVendedor.reduce((s, v) => s + v.oppCriadas, 0);
    const totalOppGanhas = porVendedor.reduce((s, v) => s + v.oppGanhas, 0);
    const totalOppPerdidas = porVendedor.reduce((s, v) => s + v.oppPerdidas, 0);
    const totalInteracoes = porVendedor.reduce((s, v) => s + v.interacoes, 0);
    const totalTarefasConcluidas = porVendedor.reduce((s, v) => s + v.tarefasConcluidas, 0);

    const fechadas = totalOppGanhas + totalOppPerdidas;
    const conversaoGeral = fechadas > 0 ? (totalOppGanhas / fechadas) * 100 : 0;
    const cicloMedioGeral = (() => {
      const somas = porVendedor.reduce((acc, v) => {
        acc.s += v.cicloMedioDias * v.oppGanhas;
        acc.c += v.oppGanhas;
        return acc;
      }, { s: 0, c: 0 });
      return somas.c > 0 ? somas.s / somas.c : 0;
    })();

    porVendedor.sort((a, b) => b.faturamento - a.faturamento || b.valorGanho - a.valorGanho);

    res.json({
      filtros: {
        dataInicio: di ? di.toISOString() : null,
        dataFim: df ? df.toISOString() : null,
        responsavelId: responsavelId || null,
      },
      geradoEm: new Date().toISOString(),
      resumo: {
        totalVendedores: porVendedor.length,
        totalFaturamento,
        totalVendas,
        totalValorGanho,
        totalOppCriadas,
        totalOppGanhas,
        totalOppPerdidas,
        conversaoGeral,
        cicloMedioGeral,
        totalInteracoes,
        totalTarefasConcluidas,
      },
      porVendedor,
      topFaturamento,
      topConversao,
      topAtividade,
    });
  } catch (err) {
    next(err);
  }
}
