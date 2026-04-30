-- CreateEnum
CREATE TYPE "TipoRecorrencia" AS ENUM ('NENHUMA', 'PARCELADA', 'RECORRENTE');

-- AlterTable
ALTER TABLE "contas_pagar" ADD COLUMN     "desconto" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "grupoRecorrenciaId" TEXT,
ADD COLUMN     "juros" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "multa" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "parcelaAtual" INTEGER,
ADD COLUMN     "parcelaTotal" INTEGER,
ADD COLUMN     "tipoRecorrencia" "TipoRecorrencia" NOT NULL DEFAULT 'NENHUMA',
ADD COLUMN     "valorBruto" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "contas_receber" ADD COLUMN     "desconto" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "grupoRecorrenciaId" TEXT,
ADD COLUMN     "juros" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "multa" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "parcelaAtual" INTEGER,
ADD COLUMN     "parcelaTotal" INTEGER,
ADD COLUMN     "tipoRecorrencia" "TipoRecorrencia" NOT NULL DEFAULT 'NENHUMA',
ADD COLUMN     "valorBruto" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "anexos" (
    "id" TEXT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "nomeArmazenado" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contaPagarId" TEXT,
    "contaReceberId" TEXT,

    CONSTRAINT "anexos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "anexos_contaPagarId_idx" ON "anexos"("contaPagarId");

-- CreateIndex
CREATE INDEX "anexos_contaReceberId_idx" ON "anexos"("contaReceberId");

-- CreateIndex
CREATE INDEX "contas_pagar_grupoRecorrenciaId_idx" ON "contas_pagar"("grupoRecorrenciaId");

-- CreateIndex
CREATE INDEX "contas_receber_grupoRecorrenciaId_idx" ON "contas_receber"("grupoRecorrenciaId");

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "contas_pagar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_contaReceberId_fkey" FOREIGN KEY ("contaReceberId") REFERENCES "contas_receber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
