-- CreateEnum
CREATE TYPE "TipoItem" AS ENUM ('PRODUTO', 'SERVICO');

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "tipoItem" "TipoItem" NOT NULL DEFAULT 'PRODUTO';
