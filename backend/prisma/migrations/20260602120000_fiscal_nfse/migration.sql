-- AlterEnum: novo modelo de documento fiscal (NFS-e)
ALTER TYPE "ModeloDocFiscal" ADD VALUE 'NFSE';

-- AlterTable: campos NFS-e (ISS / municipal) e origem por Ordem de Servico
ALTER TABLE "notas_fiscais"
  ADD COLUMN "numeroNfse" TEXT,
  ADD COLUMN "codigoVerificacao" TEXT,
  ADD COLUMN "valorServicos" DECIMAL(10,2),
  ADD COLUMN "valorDeducoes" DECIMAL(10,2),
  ADD COLUMN "baseCalculoIss" DECIMAL(10,2),
  ADD COLUMN "aliquotaIss" DECIMAL(5,2),
  ADD COLUMN "valorIss" DECIMAL(10,2),
  ADD COLUMN "issRetido" BOOLEAN,
  ADD COLUMN "itemListaServico" TEXT,
  ADD COLUMN "codTributacaoMunicipio" TEXT,
  ADD COLUMN "codMunicipioPrestacao" TEXT,
  ADD COLUMN "discriminacao" TEXT,
  ADD COLUMN "ordemServicoId" TEXT;

-- CreateIndex
CREATE INDEX "notas_fiscais_ordemServicoId_idx" ON "notas_fiscais"("ordemServicoId");

-- AddForeignKey
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "ordens_servico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: defaults de NFS-e na configuracao do emitente
ALTER TABLE "configuracao_empresa"
  ADD COLUMN "nfseAtivo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "serieNfse" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "proximoNumeroNfse" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "itemListaServicoPadrao" TEXT,
  ADD COLUMN "codTributacaoMunicipioPadrao" TEXT,
  ADD COLUMN "aliquotaIssPadrao" DECIMAL(5,2);
