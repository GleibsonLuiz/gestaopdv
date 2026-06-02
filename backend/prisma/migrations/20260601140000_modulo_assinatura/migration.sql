-- CreateEnum
CREATE TYPE "StatusAssinatura" AS ENUM ('TRIAL', 'ATIVA', 'INADIMPLENTE', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusCobranca" AS ENUM ('PENDENTE', 'PAGA', 'VENCIDA', 'CANCELADA');

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "statusAssinatura" "StatusAssinatura" NOT NULL DEFAULT 'TRIAL',
ADD COLUMN     "gatewayProvedor" TEXT,
ADD COLUMN     "gatewayClienteId" TEXT,
ADD COLUMN     "gatewayAssinaturaId" TEXT,
ADD COLUMN     "valorMensal" DECIMAL(10,2),
ADD COLUMN     "ultimoPagamentoEm" TIMESTAMP(3),
ADD COLUMN     "proximaCobrancaEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "cobrancas_assinatura" (
    "id" TEXT NOT NULL,
    "gatewayCobrancaId" TEXT,
    "valor" DECIMAL(10,2) NOT NULL,
    "status" "StatusCobranca" NOT NULL DEFAULT 'PENDENTE',
    "vencimento" TIMESTAMP(3),
    "pagoEm" TIMESTAMP(3),
    "metodo" TEXT,
    "linkPagamento" TEXT,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "cobrancas_assinatura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cobrancas_assinatura_gatewayCobrancaId_key" ON "cobrancas_assinatura"("gatewayCobrancaId");

-- CreateIndex
CREATE INDEX "cobrancas_assinatura_tenantId_createdAt_idx" ON "cobrancas_assinatura"("tenantId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "cobrancas_assinatura" ADD CONSTRAINT "cobrancas_assinatura_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
