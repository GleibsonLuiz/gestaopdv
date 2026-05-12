import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Datas ainda em UTC midnight (sobreviveram do bug ou do meu +24h anterior).
// Aplicar -9h move T00:00:00Z para T15:00:00Z = 12:00 BRT do MESMO dia local
// que estava sendo exibido. Idempotente: depois disso, hh != 0 e o filtro
// nao acha nada.
const APPLY = process.argv.includes('--apply');

function midnightUtc(d) { return d && new Date(d).getTime() % 86400000 === 0; }
function shift(d) { return new Date(new Date(d).getTime() - 9 * 3600 * 1000); }
const fmt = d => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

async function main() {
  const updates = [];
  const pagar = await prisma.contaPagar.findMany({ select: { id: true, descricao: true, vencimento: true, pagamento: true } });
  for (const c of pagar) {
    if (midnightUtc(c.vencimento)) updates.push({ tabela: 'contaPagar', id: c.id, campo: 'vencimento', atual: c.vencimento, ctx: c.descricao });
    if (midnightUtc(c.pagamento))  updates.push({ tabela: 'contaPagar', id: c.id, campo: 'pagamento',  atual: c.pagamento,  ctx: c.descricao });
  }
  const receber = await prisma.contaReceber.findMany({ select: { id: true, descricao: true, vencimento: true, recebimento: true } });
  for (const c of receber) {
    if (midnightUtc(c.vencimento))  updates.push({ tabela: 'contaReceber', id: c.id, campo: 'vencimento',  atual: c.vencimento,  ctx: c.descricao });
    if (midnightUtc(c.recebimento)) updates.push({ tabela: 'contaReceber', id: c.id, campo: 'recebimento', atual: c.recebimento, ctx: c.descricao });
  }

  console.log(`Datas em midnight UTC: ${updates.length}`);
  updates.slice(0, 15).forEach(u => {
    const novo = shift(u.atual);
    console.log(' ', u.tabela + '.' + u.campo,
      '|', u.ctx.slice(0, 35).padEnd(37),
      '|', fmt(u.atual), '->', fmt(novo));
  });

  if (!APPLY) { console.log('\n(dry run)'); return; }

  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      const model = u.tabela === 'contaPagar' ? tx.contaPagar : tx.contaReceber;
      await model.update({ where: { id: u.id }, data: { [u.campo]: shift(u.atual) } });
    }
  }, { timeout: 60000 });
  console.log(`\nAplicado em ${updates.length} datas.`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
