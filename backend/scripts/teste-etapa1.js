// Script de validacao da ETAPA 1 do multi-tenant.
//
// Verifica a estrutura do banco e reporta:
//   - Tabela "empresas" existe e tem as colunas certas?
//   - Cada uma das 35 tabelas de negocio tem coluna tenantId?
//   - Os uniques compostos (tenantId, campo) foram criados?
//   - Os singletons (configuracao_empresa, configuracao_fidelidade)
//     tem unique simples em tenantId?
//   - As 35 FKs apontam para empresas?
//
// Rodar com: cd backend && node scripts/teste-etapa1.js
//
// Sai com codigo 0 se tudo bate, 1 se falta algo. Pode ser rodado antes
// e depois da migration — antes vai falhar tudo, depois deve passar tudo.

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

// Uniques compostos esperados: [tabela, [colunas, em ordem]]
const UNIQUES_COMPOSTOS = [
  ["formas_pagamento_custom", ["tenantId", "nome"]],
  ["users", ["tenantId", "email"]],
  ["clientes", ["tenantId", "cpfCnpj"]],
  ["fornecedores", ["tenantId", "cnpj"]],
  ["categorias", ["tenantId", "nome"]],
  ["produtos", ["tenantId", "codigo"]],
  ["produtos", ["tenantId", "codigoBarras"]],
  ["tags", ["tenantId", "nome"]],
  ["templates_mensagem", ["tenantId", "nome"]],
];

// Singletons: unique simples em tenantId
const UNIQUES_SINGLETON = ["configuracao_empresa", "configuracao_fidelidade"];

// Uniques globais antigos que devem ter sido REMOVIDOS pela migration
const UNIQUES_REMOVIDOS = [
  ["formas_pagamento_custom", "formas_pagamento_custom_nome_key"],
  ["users", "users_email_key"],
  ["clientes", "clientes_cpfCnpj_key"],
  ["fornecedores", "fornecedores_cnpj_key"],
  ["categorias", "categorias_nome_key"],
  ["produtos", "produtos_codigo_key"],
  ["produtos", "produtos_codigoBarras_key"],
  ["tags", "tags_nome_key"],
  ["templates_mensagem", "templates_mensagem_nome_key"],
];

let ok = 0;
let fail = 0;
const falhas = [];

function check(condicao, mensagem) {
  if (condicao) {
    console.log(`  ✅ ${mensagem}`);
    ok += 1;
  } else {
    console.log(`  ❌ ${mensagem}`);
    fail += 1;
    falhas.push(mensagem);
  }
}

function secao(titulo) {
  console.log(`\n=== ${titulo} ===`);
}

async function main() {
  console.log("🧪 Teste de estrutura — ETAPA 1 multi-tenant\n");

  // ---------- 0. Conexao ----------
  secao("0. Conexao com o banco");
  try {
    await prisma.$queryRaw`SELECT 1`;
    check(true, "Conexao Postgres ativa");
  } catch (e) {
    check(false, `Falha ao conectar: ${e.message}`);
    process.exit(1);
  }

  // ---------- 1. Tabela empresas ----------
  secao("1. Tabela `empresas`");
  const empresasCols = await prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'empresas'
    ORDER BY ordinal_position
  `;
  check(empresasCols.length > 0, `Tabela "empresas" existe`);
  const nomes = empresasCols.map(c => c.column_name);
  check(nomes.includes("id"), "empresas.id");
  check(nomes.includes("nome"), "empresas.nome");
  check(nomes.includes("cnpj"), "empresas.cnpj");
  check(nomes.includes("ativo"), "empresas.ativo");
  check(nomes.includes("createdAt"), "empresas.createdAt");
  check(nomes.includes("updatedAt"), "empresas.updatedAt");

  // ---------- 2. Coluna tenantId em cada tabela ----------
  secao(`2. Coluna "tenantId" em ${TABELAS_COM_TENANT.length} tabelas`);
  for (const tabela of TABELAS_COM_TENANT) {
    const col = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tabela}
        AND column_name = 'tenantId'
    `;
    check(col.length > 0, `${tabela}.tenantId`);
  }

  // ---------- 3. Indices por tenantId ----------
  // Singletons usam tenantId @unique (cria *_tenantId_key) que ja serve
  // como indice. As demais tabelas tem @@index([tenantId]) (cria
  // *_tenantId_idx). Aceitamos qualquer um dos dois.
  secao(`3. Indice em tenantId (idx OU key) em ${TABELAS_COM_TENANT.length} tabelas`);
  for (const tabela of TABELAS_COM_TENANT) {
    const ehSingleton = UNIQUES_SINGLETON.includes(tabela);
    const nomeIdxEsperado = ehSingleton
      ? `${tabela}_tenantId_key`
      : `${tabela}_tenantId_idx`;
    const idx = await prisma.$queryRaw`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = ${tabela}
        AND indexname = ${nomeIdxEsperado}
    `;
    check(idx.length > 0, `${nomeIdxEsperado}`);
  }

  // ---------- 4. Uniques compostos ----------
  secao(`4. Uniques compostos (tenantId, campo) — ${UNIQUES_COMPOSTOS.length}`);
  for (const [tabela, colunas] of UNIQUES_COMPOSTOS) {
    const nomeIdx = `${tabela}_${colunas.join("_")}_key`;
    const idx = await prisma.$queryRaw`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = ${tabela}
        AND indexname = ${nomeIdx}
    `;
    check(idx.length > 0, `${nomeIdx}`);
  }

  // ---------- 5. Uniques simples em singletons ----------
  secao(`5. Uniques tenantId @unique em singletons`);
  for (const tabela of UNIQUES_SINGLETON) {
    const idx = await prisma.$queryRaw`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = ${tabela}
        AND indexname = ${tabela + "_tenantId_key"}
    `;
    check(idx.length > 0, `${tabela}_tenantId_key`);
  }

  // ---------- 6. Uniques globais antigos foram REMOVIDOS ----------
  secao(`6. Uniques globais antigos removidos (${UNIQUES_REMOVIDOS.length})`);
  for (const [tabela, nomeIdx] of UNIQUES_REMOVIDOS) {
    const idx = await prisma.$queryRaw`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = ${tabela}
        AND indexname = ${nomeIdx}
    `;
    check(idx.length === 0, `${nomeIdx} foi removido`);
  }

  // ---------- 7. FKs apontando para empresas ----------
  secao(`7. FKs tenantId → empresas(id) — esperado ${TABELAS_COM_TENANT.length}`);
  const fks = await prisma.$queryRaw`
    SELECT
      tc.table_name,
      tc.constraint_name,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'empresas'
      AND ccu.column_name = 'id'
    ORDER BY tc.table_name
  `;
  check(fks.length === TABELAS_COM_TENANT.length,
    `${fks.length}/${TABELAS_COM_TENANT.length} FKs criadas`);
  const fksTabelas = new Set(fks.map(f => f.table_name));
  for (const t of TABELAS_COM_TENANT) {
    check(fksTabelas.has(t), `FK ${t}.tenantId → empresas.id`);
  }
  const cascade = fks.filter(f => f.delete_rule === "CASCADE");
  check(cascade.length === fks.length,
    `Todas as FKs tem ON DELETE CASCADE (${cascade.length}/${fks.length})`);

  // ---------- 8. Dados — quantos registros existem em cada tabela ----------
  secao("8. Sanidade — contagem de registros existentes");
  const tabelasComDados = ["users", "clientes", "produtos", "vendas", "caixas"];
  for (const t of tabelasComDados) {
    try {
      const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM "${t}"`);
      const c = r[0]?.c ?? 0;
      console.log(`  ℹ️  ${t}: ${c} registros`);
    } catch (e) {
      console.log(`  ⚠️  ${t}: erro ao contar (${e.message})`);
    }
  }

  // ---------- Resumo ----------
  console.log(`\n${"=".repeat(50)}`);
  console.log(`RESULTADO: ${ok} ✅  /  ${fail} ❌`);
  console.log("=".repeat(50));
  if (fail > 0) {
    console.log("\nFalhas:");
    for (const f of falhas) console.log(`  - ${f}`);
    console.log("\n💡 Se o teste rodou ANTES da migration, e esperado que tudo falhe.");
    console.log("   Se rodou DEPOIS da migration, investigar cada item.");
  } else {
    console.log("\n🎉 Tudo verde — estrutura multi-tenant ETAPA 1 confirmada!");
  }
  process.exit(fail > 0 ? 1 : 0);
}

main()
  .catch(e => {
    console.error("\n❌ Erro inesperado:", e);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
