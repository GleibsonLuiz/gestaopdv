// Sanity check ANTES da migration ETAPA 6 (tenantId NOT NULL).
//
// Para cada uma das 35 tabelas com tenantId, conta quantos registros
// estao com tenantId NULL hoje. Se algum > 0, a migration ALTER COLUMN
// SET NOT NULL vai falhar com erro 23502.
//
// Rodar com: cd backend && node scripts/teste-etapa6-presanity.js

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const TABELAS_COM_TENANT = [
  "formas_pagamento_custom", "users", "configuracoes_comissao",
  "clientes", "fornecedores", "categorias", "produtos",
  "vendas", "itens_venda", "compras", "itens_compra",
  "movimentacoes_estoque", "contas_pagar", "contas_receber",
  "anexos", "caixas", "configuracao_empresa", "movimentacoes_caixa",
  "orcamentos", "itens_orcamento", "configuracao_fidelidade",
  "pontos_cliente", "movimentacoes_pontos", "tarefas",
  "interacoes", "oportunidades", "tags", "cliente_tags",
  "contatos", "pesquisas_nps", "templates_mensagem",
  "regras_automacao", "logs_automacao", "historico_oportunidades",
  "logs_auditoria",
];

let ok = 0, fail = 0;
const tabelasComOrfaos = [];

async function main() {
  console.log("🧪 Pre-sanity ETAPA 6 — tenantId NOT NULL\n");
  console.log(`Verificando ${TABELAS_COM_TENANT.length} tabelas...\n`);

  for (const tabela of TABELAS_COM_TENANT) {
    try {
      const r = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS c FROM "${tabela}" WHERE "tenantId" IS NULL`
      );
      const c = r[0]?.c ?? 0;
      if (c === 0) {
        console.log(`  ✅ ${tabela}: 0 NULL`);
        ok++;
      } else {
        console.log(`  ❌ ${tabela}: ${c} registros com tenantId NULL`);
        fail++;
        tabelasComOrfaos.push({ tabela, count: c });
      }
    } catch (e) {
      console.log(`  ⚠️  ${tabela}: erro - ${e.message}`);
      fail++;
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`PRE-SANITY: ${ok} ✅  /  ${fail} ❌`);
  console.log("=".repeat(50));

  if (fail > 0) {
    console.log("\n⚠️  ATENCAO: ha registros orfaos. Rode o backfill antes da migration:");
    console.log("   node scripts/backfill-tenant-default.js");
    console.log("\nTabelas afetadas:");
    for (const t of tabelasComOrfaos) {
      console.log(`   - ${t.tabela}: ${t.count} registros`);
    }
    process.exit(1);
  }

  console.log("\n🟢 Seguro para aplicar migration ALTER COLUMN tenantId SET NOT NULL.");
  process.exit(0);
}

main()
  .catch(e => { console.error(e); process.exit(2); })
  .finally(() => prisma.$disconnect());
