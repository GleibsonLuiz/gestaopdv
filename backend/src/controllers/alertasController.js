import prisma from "../lib/prisma.js";

const DIAS_PROXIMOS = 7;

function inicioDoDia(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function diasAteVencer(vencimento) {
  if (!vencimento) return null;
  const venc = inicioDoDia(new Date(vencimento));
  const hoje = inicioDoDia();
  return Math.round((venc - hoje) / 86400000);
}

function toNum(v) {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function listar(req, res, next) {
  try {
    const hoje = inicioDoDia();
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() + DIAS_PROXIMOS);

    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);

    // Multi-tenant: $queryRaw bypassa o Prisma Extension, entao adicionamos
    // filtro tenantId manualmente para nao vazar dados entre empresas.
    const tenantId = req.tenantId;

    const [estoqueBaixo, contasPagar, contasReceber, tarefas] = await Promise.all([
      prisma.$queryRaw`
        SELECT id, codigo, nome, estoque, "estoqueMinimo", unidade
        FROM produtos
        WHERE ativo = true
          AND "tipoItem" = 'PRODUTO'
          AND estoque <= "estoqueMinimo"
          AND "tenantId" = ${tenantId}
        ORDER BY (estoque - "estoqueMinimo") ASC, nome ASC
      `,
      prisma.contaPagar.findMany({
        where: {
          status: { in: ["PENDENTE", "ATRASADA"] },
          vencimento: { lte: limite },
        },
        include: { fornecedor: { select: { id: true, nome: true } } },
        orderBy: { vencimento: "asc" },
      }),
      prisma.contaReceber.findMany({
        where: {
          status: { in: ["PENDENTE", "ATRASADA"] },
          vencimento: { lte: limite },
        },
        include: { cliente: { select: { id: true, nome: true } } },
        orderBy: { vencimento: "asc" },
      }),
      prisma.tarefa.findMany({
        where: {
          status: { in: ["ABERTA", "EM_ANDAMENTO"] },
          prazo: { lte: limite },
        },
        include: {
          cliente: { select: { id: true, nome: true } },
          responsavel: { select: { id: true, nome: true } },
        },
        orderBy: { prazo: "asc" },
      }),
    ]);

    const alertas = [];

    for (const p of estoqueBaixo) {
      const estoque = Number(p.estoque);
      const minimo = Number(p.estoqueMinimo);
      const severidade = estoque === 0 ? "ALTA" : (estoque < minimo ? "ALTA" : "MEDIA");
      alertas.push({
        id: `estoque-${p.id}`,
        tipo: "ESTOQUE_BAIXO",
        severidade,
        titulo: estoque === 0 ? "Sem estoque" : "Estoque baixo",
        descricao: `${p.nome} (${p.codigo})`,
        complemento: `${estoque} ${p.unidade || "UN"} · mínimo ${minimo}`,
        link: "estoque",
        produtoId: p.id,
      });
    }

    for (const c of contasPagar) {
      const dias = diasAteVencer(c.vencimento);
      const atrasada = dias < 0;
      alertas.push({
        id: `pagar-${c.id}`,
        tipo: atrasada ? "CONTA_PAGAR_ATRASADA" : "CONTA_PAGAR_PROXIMA",
        severidade: atrasada ? "ALTA" : "MEDIA",
        titulo: atrasada
          ? `Conta atrasada há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}`
          : dias === 0 ? "Conta vence hoje" : `Conta vence em ${dias} dia${dias === 1 ? "" : "s"}`,
        descricao: c.descricao,
        complemento: c.fornecedor?.nome || null,
        valor: toNum(c.valor),
        data: c.vencimento,
        link: "financeiro-pagar",
        contaId: c.id,
      });
    }

    for (const c of contasReceber) {
      const dias = diasAteVencer(c.vencimento);
      const atrasada = dias < 0;
      alertas.push({
        id: `receber-${c.id}`,
        tipo: atrasada ? "CONTA_RECEBER_ATRASADA" : "CONTA_RECEBER_PROXIMA",
        severidade: atrasada ? "ALTA" : "BAIXA",
        titulo: atrasada
          ? `Recebimento atrasado há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}`
          : dias === 0 ? "Recebimento vence hoje" : `Recebimento em ${dias} dia${dias === 1 ? "" : "s"}`,
        descricao: c.descricao,
        complemento: c.cliente?.nome || null,
        valor: toNum(c.valor),
        data: c.vencimento,
        link: "financeiro-receber",
        contaId: c.id,
      });
    }

    for (const t of tarefas) {
      const dias = t.prazo ? diasAteVencer(t.prazo) : null;
      const atrasada = dias !== null && dias < 0;
      const severidadeBase = t.prioridade === "URGENTE" || t.prioridade === "ALTA" ? "ALTA"
        : t.prioridade === "MEDIA" ? "MEDIA" : "BAIXA";
      alertas.push({
        id: `tarefa-${t.id}`,
        tipo: atrasada ? "TAREFA_ATRASADA" : "TAREFA_VENCENDO",
        severidade: atrasada ? "ALTA" : severidadeBase,
        titulo: atrasada
          ? `Tarefa atrasada há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}`
          : dias === 0 ? "Tarefa vence hoje" : `Tarefa vence em ${dias} dia${dias === 1 ? "" : "s"}`,
        descricao: t.titulo,
        complemento: t.cliente?.nome || t.responsavel?.nome || null,
        data: t.prazo,
        link: "tarefas",
        tarefaId: t.id,
      });
    }

    const ordemSeveridade = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
    alertas.sort((a, b) => {
      const sa = ordemSeveridade[a.severidade] ?? 9;
      const sb = ordemSeveridade[b.severidade] ?? 9;
      if (sa !== sb) return sa - sb;
      if (a.data && b.data) return new Date(a.data) - new Date(b.data);
      return 0;
    });

    res.json({
      geradoEm: new Date().toISOString(),
      total: alertas.length,
      contagem: {
        alta: alertas.filter(a => a.severidade === "ALTA").length,
        media: alertas.filter(a => a.severidade === "MEDIA").length,
        baixa: alertas.filter(a => a.severidade === "BAIXA").length,
        estoqueBaixo: alertas.filter(a => a.tipo === "ESTOQUE_BAIXO").length,
        contasPagarAtrasadas: alertas.filter(a => a.tipo === "CONTA_PAGAR_ATRASADA").length,
        contasPagarProximas: alertas.filter(a => a.tipo === "CONTA_PAGAR_PROXIMA").length,
        contasReceberAtrasadas: alertas.filter(a => a.tipo === "CONTA_RECEBER_ATRASADA").length,
        contasReceberProximas: alertas.filter(a => a.tipo === "CONTA_RECEBER_PROXIMA").length,
        tarefasAtrasadas: alertas.filter(a => a.tipo === "TAREFA_ATRASADA").length,
        tarefasVencendo: alertas.filter(a => a.tipo === "TAREFA_VENCENDO").length,
      },
      alertas,
    });
  } catch (err) {
    next(err);
  }
}
