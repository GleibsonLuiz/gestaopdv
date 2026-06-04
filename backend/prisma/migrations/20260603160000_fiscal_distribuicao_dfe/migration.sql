-- CreateEnum
CREATE TYPE "StatusDocDFe" AS ENUM ('PENDENTE', 'XML_BAIXADO', 'IGNORADO');

-- AlterTable: cursor NSU da distribuicao DF-e
ALTER TABLE "configuracao_empresa"
  ADD COLUMN "dfeUltimoNSU" TEXT,
  ADD COLUMN "dfeUltimaConsulta" TIMESTAMP(3);

-- CreateTable: caixa de entrada da SEFAZ (documentos recebidos via DF-e)
CREATE TABLE "documentos_recebidos_dfe" (
    "id" TEXT NOT NULL,
    "nsu" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "chaveAcesso" VARCHAR(44),
    "status" "StatusDocDFe" NOT NULL DEFAULT 'PENDENTE',
    "emitenteCnpj" TEXT,
    "emitenteNome" TEXT,
    "valorTotal" DECIMAL(10,2),
    "dataEmissao" TIMESTAMP(3),
    "resumoJson" JSONB,
    "notaEntradaId" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentos_recebidos_dfe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documentos_recebidos_dfe_notaEntradaId_key" ON "documentos_recebidos_dfe"("notaEntradaId");
CREATE INDEX "documentos_recebidos_dfe_tenantId_status_idx" ON "documentos_recebidos_dfe"("tenantId", "status");
CREATE UNIQUE INDEX "documentos_recebidos_dfe_tenantId_nsu_key" ON "documentos_recebidos_dfe"("tenantId", "nsu");

-- AddForeignKey
ALTER TABLE "documentos_recebidos_dfe" ADD CONSTRAINT "documentos_recebidos_dfe_notaEntradaId_fkey" FOREIGN KEY ("notaEntradaId") REFERENCES "notas_fiscais_entrada"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documentos_recebidos_dfe" ADD CONSTRAINT "documentos_recebidos_dfe_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
