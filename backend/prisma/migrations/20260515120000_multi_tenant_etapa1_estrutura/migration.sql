-- DropIndex
DROP INDEX "formas_pagamento_custom_nome_key";

-- DropIndex
DROP INDEX "users_email_key";

-- DropIndex
DROP INDEX "clientes_cpfCnpj_key";

-- DropIndex
DROP INDEX "fornecedores_cnpj_key";

-- DropIndex
DROP INDEX "categorias_nome_key";

-- DropIndex
DROP INDEX "produtos_codigo_key";

-- DropIndex
DROP INDEX "produtos_codigoBarras_key";

-- DropIndex
DROP INDEX "tags_nome_key";

-- DropIndex
DROP INDEX "templates_mensagem_nome_key";

-- AlterTable
ALTER TABLE "formas_pagamento_custom" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "configuracoes_comissao" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "fornecedores" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "categorias" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "itens_venda" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "compras" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "itens_compra" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "movimentacoes_estoque" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "contas_pagar" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "contas_receber" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "anexos" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "caixas" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "configuracao_empresa" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "movimentacoes_caixa" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "orcamentos" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "itens_orcamento" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "configuracao_fidelidade" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "pontos_cliente" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "movimentacoes_pontos" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "tarefas" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "interacoes" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "oportunidades" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "tags" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "cliente_tags" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "contatos" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "pesquisas_nps" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "templates_mensagem" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "regras_automacao" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "logs_automacao" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "historico_oportunidades" ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "logs_auditoria" ADD COLUMN     "tenantId" TEXT;

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_cnpj_key" ON "empresas"("cnpj");

-- CreateIndex
CREATE INDEX "formas_pagamento_custom_tenantId_idx" ON "formas_pagamento_custom"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "formas_pagamento_custom_tenantId_nome_key" ON "formas_pagamento_custom"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE INDEX "configuracoes_comissao_tenantId_idx" ON "configuracoes_comissao"("tenantId");

-- CreateIndex
CREATE INDEX "clientes_tenantId_idx" ON "clientes"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_tenantId_cpfCnpj_key" ON "clientes"("tenantId", "cpfCnpj");

-- CreateIndex
CREATE INDEX "fornecedores_tenantId_idx" ON "fornecedores"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_tenantId_cnpj_key" ON "fornecedores"("tenantId", "cnpj");

-- CreateIndex
CREATE INDEX "categorias_tenantId_idx" ON "categorias"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_tenantId_nome_key" ON "categorias"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "produtos_tenantId_idx" ON "produtos"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_tenantId_codigo_key" ON "produtos"("tenantId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_tenantId_codigoBarras_key" ON "produtos"("tenantId", "codigoBarras");

-- CreateIndex
CREATE INDEX "vendas_tenantId_idx" ON "vendas"("tenantId");

-- CreateIndex
CREATE INDEX "itens_venda_tenantId_idx" ON "itens_venda"("tenantId");

-- CreateIndex
CREATE INDEX "compras_tenantId_idx" ON "compras"("tenantId");

-- CreateIndex
CREATE INDEX "itens_compra_tenantId_idx" ON "itens_compra"("tenantId");

-- CreateIndex
CREATE INDEX "movimentacoes_estoque_tenantId_idx" ON "movimentacoes_estoque"("tenantId");

-- CreateIndex
CREATE INDEX "contas_pagar_tenantId_idx" ON "contas_pagar"("tenantId");

-- CreateIndex
CREATE INDEX "contas_receber_tenantId_idx" ON "contas_receber"("tenantId");

-- CreateIndex
CREATE INDEX "anexos_tenantId_idx" ON "anexos"("tenantId");

-- CreateIndex
CREATE INDEX "caixas_tenantId_idx" ON "caixas"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "configuracao_empresa_tenantId_key" ON "configuracao_empresa"("tenantId");

-- CreateIndex
CREATE INDEX "movimentacoes_caixa_tenantId_idx" ON "movimentacoes_caixa"("tenantId");

-- CreateIndex
CREATE INDEX "orcamentos_tenantId_idx" ON "orcamentos"("tenantId");

-- CreateIndex
CREATE INDEX "itens_orcamento_tenantId_idx" ON "itens_orcamento"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "configuracao_fidelidade_tenantId_key" ON "configuracao_fidelidade"("tenantId");

-- CreateIndex
CREATE INDEX "pontos_cliente_tenantId_idx" ON "pontos_cliente"("tenantId");

-- CreateIndex
CREATE INDEX "movimentacoes_pontos_tenantId_idx" ON "movimentacoes_pontos"("tenantId");

-- CreateIndex
CREATE INDEX "tarefas_tenantId_idx" ON "tarefas"("tenantId");

-- CreateIndex
CREATE INDEX "interacoes_tenantId_idx" ON "interacoes"("tenantId");

-- CreateIndex
CREATE INDEX "oportunidades_tenantId_idx" ON "oportunidades"("tenantId");

-- CreateIndex
CREATE INDEX "tags_tenantId_idx" ON "tags"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_tenantId_nome_key" ON "tags"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "cliente_tags_tenantId_idx" ON "cliente_tags"("tenantId");

-- CreateIndex
CREATE INDEX "contatos_tenantId_idx" ON "contatos"("tenantId");

-- CreateIndex
CREATE INDEX "pesquisas_nps_tenantId_idx" ON "pesquisas_nps"("tenantId");

-- CreateIndex
CREATE INDEX "templates_mensagem_tenantId_idx" ON "templates_mensagem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "templates_mensagem_tenantId_nome_key" ON "templates_mensagem"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "regras_automacao_tenantId_idx" ON "regras_automacao"("tenantId");

-- CreateIndex
CREATE INDEX "logs_automacao_tenantId_idx" ON "logs_automacao"("tenantId");

-- CreateIndex
CREATE INDEX "historico_oportunidades_tenantId_idx" ON "historico_oportunidades"("tenantId");

-- CreateIndex
CREATE INDEX "logs_auditoria_tenantId_idx" ON "logs_auditoria"("tenantId");

-- AddForeignKey
ALTER TABLE "formas_pagamento_custom" ADD CONSTRAINT "formas_pagamento_custom_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracoes_comissao" ADD CONSTRAINT "configuracoes_comissao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_venda" ADD CONSTRAINT "itens_venda_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_compra" ADD CONSTRAINT "itens_compra_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixas" ADD CONSTRAINT "caixas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracao_empresa" ADD CONSTRAINT "configuracao_empresa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_caixa" ADD CONSTRAINT "movimentacoes_caixa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_orcamento" ADD CONSTRAINT "itens_orcamento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracao_fidelidade" ADD CONSTRAINT "configuracao_fidelidade_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pontos_cliente" ADD CONSTRAINT "pontos_cliente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_pontos" ADD CONSTRAINT "movimentacoes_pontos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_tags" ADD CONSTRAINT "cliente_tags_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contatos" ADD CONSTRAINT "contatos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pesquisas_nps" ADD CONSTRAINT "pesquisas_nps_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates_mensagem" ADD CONSTRAINT "templates_mensagem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regras_automacao" ADD CONSTRAINT "regras_automacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_automacao" ADD CONSTRAINT "logs_automacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_oportunidades" ADD CONSTRAINT "historico_oportunidades_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_auditoria" ADD CONSTRAINT "logs_auditoria_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

