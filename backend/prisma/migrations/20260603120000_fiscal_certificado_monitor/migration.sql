-- AlterTable: cache de validade do certificado A1 (monitoramento — Onda 5)
ALTER TABLE "configuracao_empresa"
  ADD COLUMN "certificadoValidade" TIMESTAMP(3),
  ADD COLUMN "certificadoUltimaChecagem" TIMESTAMP(3),
  ADD COLUMN "certificadoAlertaNivel" INTEGER;
