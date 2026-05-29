-- Vendas em espera (park/hold do PDV): snapshot do carrinho para retomar
-- depois. Nao e Venda — nao consome numero de venda, nao baixa estoque, nao
-- toca caixa. Visivel para todo o tenant.

CREATE TABLE "vendas_espera" (
  "id"           TEXT PRIMARY KEY,
  "numero"       INTEGER NOT NULL,
  "itens"        JSONB NOT NULL,
  "desconto"     DECIMAL(10,2) NOT NULL DEFAULT 0,
  "total"        DECIMAL(10,2) NOT NULL,
  "observacoes"  TEXT,
  "clienteId"    TEXT,
  "userId"       TEXT,
  "tenantId"     TEXT NOT NULL,
  "criadoEm"     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "vendas_espera_tenantId_numero_key" ON "vendas_espera" ("tenantId", "numero");
CREATE INDEX "vendas_espera_tenantId_criadoEm_idx" ON "vendas_espera" ("tenantId", "criadoEm");

ALTER TABLE "vendas_espera" ADD CONSTRAINT "vendas_espera_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "clientes" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vendas_espera" ADD CONSTRAINT "vendas_espera_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vendas_espera" ADD CONSTRAINT "vendas_espera_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "empresas" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
