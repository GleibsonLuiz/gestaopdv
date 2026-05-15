-- ETAPA 8 multi-tenant: numero sequencial POR TENANT em Venda, Compra,
-- Caixa, Orcamento, Oportunidade.
--
-- 1. Remove o unique index global (numero @unique)
-- 2. Remove o DEFAULT autoincrement (a coluna vira Int simples)
-- 3. Dropa a sequence orfa (era usada pelo autoincrement antigo)
-- 4. Cria unique composite (tenantId, numero) — cada tenant tem sua
--    propria sequencia. App calcula via MAX+1 com retry.

-- DropIndex
DROP INDEX "vendas_numero_key";
DROP INDEX "compras_numero_key";
DROP INDEX "caixas_numero_key";
DROP INDEX "orcamentos_numero_key";
DROP INDEX "oportunidades_numero_key";

-- AlterTable: remove DEFAULT autoincrement
ALTER TABLE "vendas" ALTER COLUMN "numero" DROP DEFAULT;
ALTER TABLE "compras" ALTER COLUMN "numero" DROP DEFAULT;
ALTER TABLE "caixas" ALTER COLUMN "numero" DROP DEFAULT;
ALTER TABLE "orcamentos" ALTER COLUMN "numero" DROP DEFAULT;
ALTER TABLE "oportunidades" ALTER COLUMN "numero" DROP DEFAULT;

-- DropSequence orfas (nomes padrao Postgres: <tabela>_<coluna>_seq)
DROP SEQUENCE IF EXISTS "vendas_numero_seq";
DROP SEQUENCE IF EXISTS "compras_numero_seq";
DROP SEQUENCE IF EXISTS "caixas_numero_seq";
DROP SEQUENCE IF EXISTS "orcamentos_numero_seq";
DROP SEQUENCE IF EXISTS "oportunidades_numero_seq";

-- CreateIndex: unique composito por tenant
CREATE UNIQUE INDEX "vendas_tenantId_numero_key" ON "vendas"("tenantId", "numero");
CREATE UNIQUE INDEX "compras_tenantId_numero_key" ON "compras"("tenantId", "numero");
CREATE UNIQUE INDEX "caixas_tenantId_numero_key" ON "caixas"("tenantId", "numero");
CREATE UNIQUE INDEX "orcamentos_tenantId_numero_key" ON "orcamentos"("tenantId", "numero");
CREATE UNIQUE INDEX "oportunidades_tenantId_numero_key" ON "oportunidades"("tenantId", "numero");
