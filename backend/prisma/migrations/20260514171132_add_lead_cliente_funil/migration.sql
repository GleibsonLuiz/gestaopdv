-- CreateEnum
CREATE TYPE "StatusClienteFunil" AS ENUM ('LEAD', 'CLIENTE_ATIVO', 'CLIENTE_INATIVO', 'PERDIDO');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "origem" TEXT,
ADD COLUMN     "statusFunil" "StatusClienteFunil" NOT NULL DEFAULT 'LEAD';

-- Data migration: promove clientes que ja tem ao menos 1 venda CONCLUIDA
-- para CLIENTE_ATIVO. Quem nunca comprou fica como LEAD (default).
UPDATE "clientes" SET "statusFunil" = 'CLIENTE_ATIVO'
WHERE "id" IN (
  SELECT DISTINCT "clienteId" FROM "vendas"
  WHERE "clienteId" IS NOT NULL AND "status" = 'CONCLUIDA'
);
