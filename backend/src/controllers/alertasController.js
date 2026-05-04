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

    const [estoqueBaixo, contasPagar, contasReceber] = await Promise.all([
      prisma.$queryRaw`
        SELECT id, codigo, nome, estoque, "estoqueMinimo", unidade
        FROM produtos
        WHERE ativo = true
          AND "tipoItem" = 'PRODUTO'
          AND estoque <= "estoqueMinimo"
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
      },
      alertas,
    });
  } catch (err) {
    next(err);
  }
}
