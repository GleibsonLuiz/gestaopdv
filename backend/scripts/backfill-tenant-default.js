// Backfill da ETAPA 1 do multi-tenant.
//
// 1. Cria (ou reaproveita) a empresa DEFAULT "GestaoPRO Default".
// 2. UPDATE todas as 35 tabelas: SET tenantId = empresa.id WHERE tenantId IS NULL.
// 3. Confirma que nenhuma linha ficou com tenantId NULL.
//
// Idempotente: pode rodar varias vezes sem efeito colateral. A empresa
// DEFAULT e identificada pelo CNPJ fixo "00000000000000" (sempre o mesmo
// nesta instalacao). UPDATEs so afetam linhas com tenantId NULL.
//
// Rodar com: cd backend && node scripts/backfill-tenant-default.js

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

const CNPJ_DEFAULT = "00000000000000";
const NOME_DEFAULT = "GestaoPRO Default";

async function main() {
  console.log("🌱 Backfill tenant DEFAULT — ETAPA 1\n");

  // ---------- 1. Criar/encontrar Empresa DEFAULT ----------
  console.log("=== 1. Empresa DEFAULT ===");
  let empresa = await prisma.empresa.findUnique({
    where: { cnpj: CNPJ_DEFAULT },
  });

  if (empresa) {
    console.log(`  ℹ️  Empresa DEFAULT ja existe: ${empresa.id} (${empresa.nome})`);
  } else {
    empresa = await prisma.empresa.create({
      data: { nome: NOME_DEFAULT, cnpj: CNPJ_DEFAULT, ativo: true },
    });
    console.log(`  ✅ Empresa DEFAULT criada: ${empresa.id} (${empresa.nome})`);
  }
  const tenantId = empresa.id;

  // ---------- 2. UPDATE em cada tabela ----------
  console.log(`\n=== 2. Atribuindo tenantId em ${TABELAS_COM_TENANT.length} tabelas ===`);
  let totalAtualizado = 0;
  for (const tabela of TABELAS_COM_TENANT) {
    // Quantos registros estao com tenantId NULL agora?
    const nullsAntes = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS c FROM "${tabela}" WHERE "tenantId" IS NULL`
    );
    const qtdNulls = nullsAntes[0]?.c ?? 0;

    if (qtdNulls === 0) {
      console.log(`  ⏭️  ${tabela}: ja esta atribuido (0 nulls)`);
      continue;
    }

    // UPDATE
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "${tabela}" SET "tenantId" = $1 WHERE "tenantId" IS NULL`,
      tenantId
    );
    totalAtualizado += result;
    console.log(`  ✅ ${tabela}: ${result} registros atribuidos ao tenant DEFAULT`);
  }
  console.log(`\nTotal atualizado: ${totalAtualizado} registros`);

  // ---------- 3. Verificar que ninguem ficou com NULL ----------
  console.log(`\n=== 3. Verificando que nenhum registro ficou orfao ===`);
  let orfaos = 0;
  for (const tabela of TABELAS_COM_TENANT) {
    const r = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS c FROM "${tabela}" WHERE "tenantId" IS NULL`
    );
    const c = r[0]?.c ?? 0;
    if (c > 0) {
      console.log(`  ❌ ${tabela}: ${c} registros AINDA com tenantId NULL`);
      orfaos += c;
    }
  }
  if (orfaos === 0) {
    console.log(`  ✅ Nenhum registro orfao — todos atribuidos ao tenant ${tenantId}`);
  } else {
    console.log(`  ❌ ${orfaos} registros orfaos — investigar`);
    process.exit(1);
  }

  // ---------- 4. Resumo ----------
  console.log(`\n${"=".repeat(50)}`);
  console.log(`BACKFILL OK`);
  console.log(`  Tenant DEFAULT: ${tenantId}`);
  console.log(`  Nome: ${empresa.nome}`);
  console.log(`  CNPJ: ${empresa.cnpj}`);
  console.log("=".repeat(50));
  console.log(`\n💡 Proximo passo: ETAPA 2 (incluir tenantId no JWT no login).`);
}

main()
  .catch(e => {
    console.error("\n❌ Erro:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
