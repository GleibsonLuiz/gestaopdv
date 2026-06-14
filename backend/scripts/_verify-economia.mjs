import { PrismaClient } from "@prisma/client";
import "dotenv/config";
const prisma = new PrismaClient();
const T = "a1e31227-e1cd-4fc1-aa18-d11ddef5e3de";

// 1) Estoque: produto.estoque deve bater com a ultima movimentacao (estoqueDepois)
const prods = await prisma.produto.findMany({ where: { tenantId: T }, select: { id: true, codigo: true, nome: true, estoque: true } });
let okEst = 0, badEst = 0;
for (const p of prods) {
  const ult = await prisma.movimentacaoEstoque.findFirst({ where: { tenantId: T, produtoId: p.id }, orderBy: { createdAt: "desc" }, select: { estoqueDepois: true } });
  if (!ult) continue;
  const diff = Math.abs(Number(p.estoque) - Number(ult.estoqueDepois));
  if (diff < 0.01) okEst++; else { badEst++; if (badEst <= 5) console.log(`  ESTOQUE DIVERGE ${p.codigo} ${p.nome}: produto=${p.estoque} ult.mov=${ult.estoqueDepois}`); }
}
console.log(`Estoque: ${okEst} OK, ${badEst} divergentes`);

// 2) Caixa: recomputa saldo esperado em dinheiro de 8 caixas aleatorios
const ehEntrada = (t) => ["VENDA","SUPRIMENTO","RECEBER_CONTA","ESTORNO_PAGAR_CONTA","ESTORNO_DESPESA"].includes(t);
const ehSaida = (t) => ["SANGRIA","PAGAR_CONTA","ESTORNO_VENDA","ESTORNO_RECEBER_CONTA","DESPESA"].includes(t);
const caixas = await prisma.caixa.findMany({ where: { tenantId: T, status: "FECHADO" }, take: 10, orderBy: { numero: "desc" }, select: { id: true, numero: true, saldoInicial: true, saldoFinalEsperado: true } });
let okCx = 0, badCx = 0;
for (const c of caixas) {
  const movs = await prisma.movimentacaoCaixa.findMany({ where: { caixaId: c.id }, select: { tipo: true, valor: true, formaPagamento: true } });
  let saldo = Number(c.saldoInicial);
  for (const m of movs) {
    if (m.tipo === "ABERTURA" || m.tipo === "FECHAMENTO") continue;
    if (m.formaPagamento !== "DINHEIRO") continue;
    if (ehEntrada(m.tipo)) saldo += Number(m.valor);
    else if (ehSaida(m.tipo)) saldo -= Number(m.valor);
  }
  const diff = Math.abs(saldo - Number(c.saldoFinalEsperado));
  if (diff < 0.02) okCx++; else { badCx++; console.log(`  CAIXA DIVERGE #${c.numero}: recomputado=${saldo.toFixed(2)} armazenado=${c.saldoFinalEsperado}`); }
}
console.log(`Caixa (amostra ${caixas.length}): ${okCx} OK, ${badCx} divergentes`);

// 3) Venda: soma dos pagamentos == total (amostra)
const vendasAmostra = await prisma.venda.findMany({ where: { tenantId: T, status: "CONCLUIDA" }, take: 200, orderBy: { numero: "desc" }, select: { id: true, numero: true, total: true } });
let okPg = 0, badPg = 0;
for (const v of vendasAmostra) {
  const pags = await prisma.vendaPagamento.aggregate({ where: { vendaId: v.id }, _sum: { valor: true } });
  const soma = Number(pags._sum.valor || 0);
  if (Math.abs(soma - Number(v.total)) < 0.02) okPg++; else { badPg++; if (badPg <= 5) console.log(`  PAGTO DIVERGE #${v.numero}: total=${v.total} pagtos=${soma}`); }
}
console.log(`Pagamentos (amostra ${vendasAmostra.length}): ${okPg} OK, ${badPg} divergentes`);

// 4) Itens de venda: soma subtotais - desconto == total (amostra)
let okIt = 0, badIt = 0;
for (const v of vendasAmostra.slice(0, 100)) {
  const full = await prisma.venda.findUnique({ where: { id: v.id }, select: { total: true, desconto: true, itens: { select: { subtotal: true } } } });
  const sub = full.itens.reduce((s, i) => s + Number(i.subtotal), 0);
  if (Math.abs(round2(sub - Number(full.desconto)) - Number(full.total)) < 0.02) okIt++; else { badIt++; if (badIt <= 5) console.log(`  ITENS DIVERGE #${v.numero}`); }
}
function round2(n){return Math.round(n*100)/100;}
console.log(`Itens vs total (amostra 100): ${okIt} OK, ${badIt} divergentes`);

// 5) Distribuicao por ano/forma e financeiro
const porAno = await prisma.$queryRawUnsafe(`
  SELECT date_part('year', "createdAt")::int AS ano, count(*)::int AS vendas, round(sum(total)::numeric,2) AS faturamento
  FROM vendas WHERE "tenantId"=$1 AND status='CONCLUIDA' GROUP BY 1 ORDER BY 1`, T);
console.log("Faturamento por ano:", JSON.stringify(porAno));
const crStatus = await prisma.contaReceber.groupBy({ by: ["status"], where: { tenantId: T }, _count: true, _sum: { valor: true } });
console.log("Contas a receber:", crStatus.map(s=>`${s.status}=${s._count} (R$${Number(s._sum.valor||0).toFixed(2)})`).join(" | "));
const cpStatus = await prisma.contaPagar.groupBy({ by: ["status"], where: { tenantId: T }, _count: true, _sum: { valor: true } });
console.log("Contas a pagar:", cpStatus.map(s=>`${s.status}=${s._count} (R$${Number(s._sum.valor||0).toFixed(2)})`).join(" | "));
const estoqueNeg = await prisma.produto.count({ where: { tenantId: T, estoque: { lt: 0 } } });
console.log("Produtos com estoque negativo:", estoqueNeg);

await prisma.$disconnect();
