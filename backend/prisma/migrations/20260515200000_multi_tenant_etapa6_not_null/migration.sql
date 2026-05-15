-- AlterTable
ALTER TABLE "formas_pagamento_custom" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "configuracoes_comissao" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "clientes" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "fornecedores" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "categorias" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "produtos" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "vendas" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "itens_venda" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "compras" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "itens_compra" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "movimentacoes_estoque" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "contas_pagar" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "contas_receber" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "anexos" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "caixas" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "configuracao_empresa" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "movimentacoes_caixa" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "orcamentos" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "itens_orcamento" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "configuracao_fidelidade" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "pontos_cliente" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "movimentacoes_pontos" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "tarefas" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "interacoes" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "oportunidades" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "tags" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "cliente_tags" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "contatos" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "pesquisas_nps" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "templates_mensagem" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "regras_automacao" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "logs_automacao" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "historico_oportunidades" ALTER COLUMN "tenantId" SET NOT NULL;

