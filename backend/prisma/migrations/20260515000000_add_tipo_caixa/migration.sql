-- CreateEnum
CREATE TYPE "TipoCaixa" AS ENUM ('INDEPENDENTE', 'COMPARTILHADO');

-- AlterTable
ALTER TABLE "configuracao_empresa" ADD COLUMN "tipoCaixa" "TipoCaixa" NOT NULL DEFAULT 'INDEPENDENTE';
