import prisma from "../lib/prisma.js";

// ============ DASHBOARD CRM ============
//
// Agrega metricas de relacionamento (CRM puro):
//   - Funil de oportunidades por etapa
//   - Distribuicao de clientes em segmentos RFM
//   - Top 10 clientes por LTV (lifetime value)
//   - Clientes em risco (sem compra ha 90+ dias com historico)
//   - Tarefas: total em aberto, atrasadas, concluidas no periodo
//   - Performance comercial por vendedor (vendas + ganhos no funil)
//
// Janela default: 365 dias.

const ETAPAS_FUNIL = ["LEAD", "QUALIFICADO", "PROPOSTA", "NEGOCIACAO", "GANHO", "PERDIDO"];
const SEGMENTOS = ["VIP", "RECORRENTE", "NOVO", "EM_RISCO", "INATIVO", "PROSPECT"];

function classificarSegmento({ qtdCompras, totalGasto, recenciaDias, mediaTotal }) {
  if (qtdCompras === 0) return recenciaDias === null ? "PROSPECT" : "INATIVO";
  if (recenciaDias >= 180) return "INATIVO";
  if (qtdCompras >= 3 && totalGasto >= mediaTotal * 1.5 && recenciaDias < 60) return "VIP";
  if (qtdCompras >= 3 && recenciaDias < 90) return "RECORRENTE";
  if (qtdCompras === 1 && recenciaDias <= 30) return "NOVO";
  if (recenciaDias >= 90 && recenciaDias < 180) return "EM_RISCO";
  return qtdCompras > 0 ? "RECORRENTE" : "PROSPECT";
}

export async function resumoCrm(req, res, next) {
  try {
    const dias = parseInt(req.query.dias || "365", 10);
    const desde = new Date(Date.now() - dias * 86400000);

    const [oportunidades, clientesAtivos, vendasJanela, tarefas, vendedoresAtivos] = await Promise.all([
      prisma.oportunidade.findMany({
        select: { etapa: true, valorEstimado: true, probabilidade: true, responsavelId: true, dataGanho: true },
      }),
      prisma.cliente.findMany({
        where: { ativo: true },
        select: { id: true, nome: true, telefone: true, email: true, cidade: true, createdAt: true },
      }),
      prisma.venda.findMany({
        where: { status: "CONCLUIDA", createdAt: { gte: desde } },
        select: { clienteId: true, total: true, createdAt: true, userId: true },
      }),
      prisma.tarefa.findMany({
        where: {
          OR: [
            { status: { in: ["ABERTA", "EM_ANDAMENTO"] } },
            { status: "CONCLUIDA", concluidaEm: { gte: desde } },
          ],
        },
        select: { id: true, status: true, prazo: true, concluidaEm: true, responsavelId: true },
      }),
      prisma.user.findMany({
        where: { ativo: true, role: { in: ["GERENTE", "VENDEDOR"] } },
        select: { id: true, nome: true, role: true },
      }),
    ]);

    // ===== FUNIL =====
    const funil = {};
    for (const e of ETAPAS_FUNIL) {
      funil[e] = { quantidade: 0, valorEstimado: 0, valorPonderado: 0 };
    }
    let totalGanho = 0, totalPerdido = 0, valorGanho = 0;
    for (const o of oportunidades) {
      const v = Number(o.valorEstimado || 0);
      const p = Number(o.probabilidade || 0) / 100;
      funil[o.etapa].quantidade += 1;
      funil[o.etapa].valorEstimado += v;
      funil[o.etapa].valorPonderado += v * p;
      if (o.etapa === "GANHO") { totalGanho++; valorGanho += v; }
      else if (o.etapa === "PERDIDO") totalPerdido++;
    }
    const totalFechadas = totalGanho + totalPerdido;
    const taxaConversao = totalFechadas > 0 ? (totalGanho / totalFechadas) * 100 : 0;
    const valorPonderadoAberto = ETAPAS_FUNIL
      .filter((e) => e !== "GANHO" && e !== "PERDIDO")
      .reduce((s, e) => s + funil[e].valorPonderado, 0);

    // ===== RFM POR CLIENTE =====
    const aggCliente = new Map();
    for (const v of vendasJanela) {
      if (!v.clienteId) continue;
      const a = aggCliente.get(v.clienteId) || { qtd: 0, total: 0, ultima: null };
      a.qtd += 1;
      a.total += Number(v.total);
      if (!a.ultima || v.createdAt > a.ultima) a.ultima = v.createdAt;
      aggCliente.set(v.clienteId, a);
    }
    const arrAgg = Array.from(aggCliente.values());
    const mediaTotal = arrAgg.length ? arrAgg.reduce((s, x) => s + x.total, 0) / arrAgg.length : 0;
    const hoje = Date.now();

    // ===== SEGMENTOS =====
    const segmentos = {};
    for (const s of SEGMENTOS) segmentos[s] = { quantidade: 0, monetario: 0 };
    const clientesEnriquecidos = clientesAtivos.map((c) => {
      const a = aggCliente.get(c.id);
      const qtdCompras = a?.qtd || 0;
      const totalGasto = a?.total || 0;
      const recenciaDias = a?.ultima
        ? Math.floor((hoje - a.ultima.getTime()) / 86400000)
        : null;
      const segmento = classificarSegmento({ qtdCompras, totalGasto, recenciaDias, mediaTotal });
      segmentos[segmento].quantidade += 1;
      segmentos[segmento].monetario += totalGasto;
      return {
        id: c.id, nome: c.nome, telefone: c.telefone, email: c.email, cidade: c.cidade,
        qtdCompras, totalGasto, recenciaDias, ultimaCompra: a?.ultima || null, segmento,
      };
    });

    const totalClientes = clientesEnriquecidos.length;
    const clientesComCompra = clientesEnriquecidos.filter((c) => c.qtdCompras > 0).length;
    const taxaRetencao = totalClientes > 0 ? (clientesComCompra / totalClientes) * 100 : 0;

    // ===== TOP 10 LTV =====
    const topLtv = [...clientesEnriquecidos]
      .filter((c) => c.totalGasto > 0)
      .sort((a, b) => b.totalGasto - a.totalGasto)
      .slice(0, 10);

    // ===== CLIENTES EM RISCO =====
    const emRisco = clientesEnriquecidos
      .filter((c) => c.segmento === "EM_RISCO" || (c.segmento === "INATIVO" && c.qtdCompras > 0))
      .sort((a, b) => b.totalGasto - a.totalGasto)
      .slice(0, 10);

    // ===== TAREFAS =====
    const agora = new Date();
    const tarefasAbertas = tarefas.filter((t) => t.status === "ABERTA" || t.status === "EM_ANDAMENTO");
    const tarefasAtrasadas = tarefasAbertas.filter((t) => t.prazo && new Date(t.prazo) < agora);
    const tarefasConcluidasPeriodo = tarefas.filter((t) => t.status === "CONCLUIDA");

    // ===== PERFORMANCE POR VENDEDOR =====
    const ganhoPorVendedor = new Map();
    for (const o of oportunidades) {
      if (o.etapa === "GANHO" && o.responsavelId) {
        const a = ganhoPorVendedor.get(o.responsavelId) || { qtd: 0, valor: 0 };
        a.qtd += 1;
        a.valor += Number(o.valorEstimado || 0);
        ganhoPorVendedor.set(o.responsavelId, a);
      }
    }
    const vendasPorVendedor = new Map();
    for (const v of vendasJanela) {
      const a = vendasPorVendedor.get(v.userId) || { qtd: 0, total: 0 };
      a.qtd += 1;
      a.total += Number(v.total);
      vendasPorVendedor.set(v.userId, a);
    }
    const tarefasAbertasPorVendedor = new Map();
    for (const t of tarefasAbertas) {
      if (!t.responsavelId) continue;
      tarefasAbertasPorVendedor.set(t.responsavelId, (tarefasAbertasPorVendedor.get(t.responsavelId) || 0) + 1);
    }
    const performance = vendedoresAtivos
      .map((u) => {
        const g = ganhoPorVendedor.get(u.id) || { qtd: 0, valor: 0 };
        const v = vendasPorVendedor.get(u.id) || { qtd: 0, total: 0 };
        return {
          id: u.id, nome: u.nome, role: u.role,
          vendasQuantidade: v.qtd, vendasTotal: v.total,
          oportunidadesGanhas: g.qtd, valorGanho: g.valor,
          tarefasAbertas: tarefasAbertasPorVendedor.get(u.id) || 0,
        };
      })
      .sort((a, b) => b.vendasTotal - a.vendasTotal);

    res.json({
      janelaDias: dias,
      funil: { porEtapa: funil, totalGanho, totalPerdido, valorGanho, valorPonderadoAberto, taxaConversao },
      clientes: {
        total: totalClientes,
        comCompra: clientesComCompra,
        taxaRetencao,
        segmentos,
      },
      topLtv,
      emRisco,
      tarefas: {
        abertas: tarefasAbertas.length,
        atrasadas: tarefasAtrasadas.length,
        concluidasPeriodo: tarefasConcluidasPeriodo.length,
      },
      performance,
    });
  } catch (err) {
    next(err);
  }
}
