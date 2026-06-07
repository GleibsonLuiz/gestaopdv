-- AddColumn: chave de idempotencia do checkout do PDV (gerada no cliente).
-- Nullable para nao quebrar vendas existentes nem clientes legados/API que
-- nao enviam a chave.
ALTER TABLE "vendas" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex: unique por tenant. Em Postgres, NULLs sao distintos, entao
-- multiplas vendas sem chave (legado/API) continuam permitidas; duas
-- requisicoes com a MESMA chave colidem e a 2a falha com unique violation —
-- o controller traduz isso devolvendo a venda ja criada (idempotente).
CREATE UNIQUE INDEX "vendas_tenantId_idempotencyKey_key" ON "vendas"("tenantId", "idempotencyKey");
