-- CreateEnum
CREATE TYPE "StatusCaixa" AS ENUM ('ABERTO', 'FECHADO');

-- CreateEnum
CREATE TYPE "TipoMovimentacaoCaixa" AS ENUM ('ABERTURA', 'VENDA', 'SANGRIA', 'SUPRIMENTO', 'PAGAR_CONTA', 'RECEBER_CONTA', 'FECHAMENTO');

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "caixaId" TEXT;

-- CreateTable
CREATE TABLE "caixas" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "status" "StatusCaixa" NOT NULL DEFAULT 'ABERTO',
    "saldoInicial" DECIMAL(10,2) NOT NULL,
    "saldoFinalContado" DECIMAL(10,2),
    "saldoFinalEsperado" DECIMAL(10,2),
    "trocoProximoDia" DECIMAL(10,2),
    "diferenca" DECIMAL(10,2),
    "observacoesAbertura" TEXT,
    "observacoesFechamento" TEXT,
    "abertoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadoEm" TIMESTAMP(3),
    "userId" TEXT NOT NULL,

    CONSTRAINT "caixas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentacoes_caixa" (
    "id" TEXT NOT NULL,
    "tipo" "TipoMovimentacaoCaixa" NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "formaPagamento" "FormaPagamento" NOT NULL DEFAULT 'DINHEIRO',
    "descricao" TEXT NOT NULL,
    "saldoAntes" DECIMAL(10,2) NOT NULL,
    "saldoDepois" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caixaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vendaId" TEXT,
    "contaPagarId" TEXT,
    "contaReceberId" TEXT,

    CONSTRAINT "movimentacoes_caixa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "caixas_numero_key" ON "caixas"("numero");

-- CreateIndex
CREATE INDEX "caixas_userId_status_idx" ON "caixas"("userId", "status");

-- CreateIndex
CREATE INDEX "caixas_abertoEm_idx" ON "caixas"("abertoEm");

-- CreateIndex
CREATE INDEX "movimentacoes_caixa_caixaId_createdAt_idx" ON "movimentacoes_caixa"("caixaId", "createdAt");

-- CreateIndex
CREATE INDEX "vendas_caixaId_idx" ON "vendas"("caixaId");

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "caixas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixas" ADD CONSTRAINT "caixas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_caixa" ADD CONSTRAINT "movimentacoes_caixa_caixaId_fkey" FOREIGN KEY ("caixaId") REFERENCES "caixas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_caixa" ADD CONSTRAINT "movimentacoes_caixa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_caixa" ADD CONSTRAINT "movimentacoes_caixa_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_caixa" ADD CONSTRAINT "movimentacoes_caixa_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "contas_pagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_caixa" ADD CONSTRAINT "movimentacoes_caixa_contaReceberId_fkey" FOREIGN KEY ("contaReceberId") REFERENCES "contas_receber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
