-- CreateEnum: natureza da conta no Plano de Contas
CREATE TYPE "NaturezaConta" AS ENUM ('RECEITA', 'DESPESA');

-- AlterEnum: novos tipos de movimentacao de caixa para despesa operacional
ALTER TYPE "TipoMovimentacaoCaixa" ADD VALUE 'DESPESA';
ALTER TYPE "TipoMovimentacaoCaixa" ADD VALUE 'ESTORNO_DESPESA';

-- CreateTable: plano de contas hierarquico (auto-relacionavel)
CREATE TABLE "plano_contas" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "natureza" "NaturezaConta" NOT NULL DEFAULT 'DESPESA',
    "analitica" BOOLEAN NOT NULL DEFAULT true,
    "codigoContabilExterno" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "paiId" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plano_contas_pkey" PRIMARY KEY ("id")
);

-- CreateTable: despesas operacionais (nao ligadas a estoque)
CREATE TABLE "despesas" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "descricao" TEXT NOT NULL,
    "observacoes" TEXT,
    "formaPagamento" "FormaPagamento" NOT NULL DEFAULT 'DINHEIRO',
    "origem" TEXT NOT NULL DEFAULT 'MANUAL',
    "planoContaId" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "caixaId" TEXT,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "despesas_pkey" PRIMARY KEY ("id")
);

-- AlterTable: classificacao contabil opcional na conta a pagar
ALTER TABLE "contas_pagar" ADD COLUMN "planoContaId" TEXT;

-- AlterTable: vinculo de anexo (comprovante) com despesa
ALTER TABLE "anexos" ADD COLUMN "despesaId" TEXT;

-- AlterTable: vinculo de movimentacao de caixa com despesa
ALTER TABLE "movimentacoes_caixa" ADD COLUMN "despesaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "plano_contas_tenantId_codigo_key" ON "plano_contas"("tenantId", "codigo");
CREATE INDEX "plano_contas_tenantId_idx" ON "plano_contas"("tenantId");
CREATE INDEX "plano_contas_paiId_idx" ON "plano_contas"("paiId");

CREATE UNIQUE INDEX "despesas_tenantId_numero_key" ON "despesas"("tenantId", "numero");
CREATE INDEX "despesas_tenantId_data_idx" ON "despesas"("tenantId", "data");
CREATE INDEX "despesas_planoContaId_idx" ON "despesas"("planoContaId");
CREATE INDEX "despesas_tenantId_idx" ON "despesas"("tenantId");

CREATE INDEX "contas_pagar_planoContaId_idx" ON "contas_pagar"("planoContaId");
CREATE INDEX "anexos_despesaId_idx" ON "anexos"("despesaId");

-- AddForeignKey: plano_contas
ALTER TABLE "plano_contas" ADD CONSTRAINT "plano_contas_paiId_fkey" FOREIGN KEY ("paiId") REFERENCES "plano_contas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "plano_contas" ADD CONSTRAINT "plano_contas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: despesas
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_planoContaId_fkey" FOREIGN KEY ("planoContaId") REFERENCES "plano_contas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "caixas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: contas_pagar -> plano_contas
ALTER TABLE "contas_pagar" ADD CONSTRAINT "contas_pagar_planoContaId_fkey" FOREIGN KEY ("planoContaId") REFERENCES "plano_contas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: anexos -> despesas
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_despesaId_fkey" FOREIGN KEY ("despesaId") REFERENCES "despesas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: movimentacoes_caixa -> despesas
ALTER TABLE "movimentacoes_caixa" ADD CONSTRAINT "movimentacoes_caixa_despesaId_fkey" FOREIGN KEY ("despesaId") REFERENCES "despesas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
