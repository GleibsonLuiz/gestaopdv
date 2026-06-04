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
