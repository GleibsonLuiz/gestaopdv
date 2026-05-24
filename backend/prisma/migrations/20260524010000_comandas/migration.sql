-- ETAPA#8b: Central de Comandas (Kanban /painel-comandas).

CREATE TYPE "StatusComanda" AS ENUM ('NOVO', 'EM_PREPARACAO', 'CONCLUIDA', 'CANCELADA');

CREATE TABLE "comandas" (
  "id"             TEXT PRIMARY KEY,
  "numero"         INTEGER NOT NULL,
  "status"         "StatusComanda" NOT NULL DEFAULT 'NOVO',
  "mesa"           TEXT,
  "observacoes"    TEXT,
  "total"          DECIMAL(10,2) NOT NULL,
  "desconto"       DECIMAL(10,2),
  "criadoEm"       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aceitoEm"       TIMESTAMP,
  "concluidoEm"    TIMESTAMP,
  "canceladaEm"    TIMESTAMP,
  "formaPagamento" TEXT,
  "idTransacao"    TEXT,
  "pago"           BOOLEAN NOT NULL DEFAULT false,
  "vendaId"        TEXT,
  "clienteId"      TEXT,
  "userId"         TEXT,
  "tenantId"       TEXT NOT NULL
);

CREATE UNIQUE INDEX "comandas_tenantId_numero_key" ON "comandas" ("tenantId", "numero");
CREATE INDEX "comandas_tenantId_status_idx"   ON "comandas" ("tenantId", "status");
CREATE INDEX "comandas_tenantId_criadoEm_idx" ON "comandas" ("tenantId", "criadoEm");

ALTER TABLE "comandas" ADD CONSTRAINT "comandas_vendaId_fkey"
  FOREIGN KEY ("vendaId") REFERENCES "vendas" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "clientes" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "comandas" ADD CONSTRAINT "comandas_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "empresas" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "itens_comanda" (
  "id"            TEXT PRIMARY KEY,
  "quantidade"    DECIMAL(12,3) NOT NULL,
  "precoUnitario" DECIMAL(10,2) NOT NULL,
  "subtotal"      DECIMAL(10,2) NOT NULL,
  "observacoes"   TEXT,
  "comandaId"     TEXT NOT NULL,
  "produtoId"     TEXT,
  "tenantId"      TEXT NOT NULL
);

ALTER TABLE "itens_comanda" ADD CONSTRAINT "itens_comanda_comandaId_fkey"
  FOREIGN KEY ("comandaId") REFERENCES "comandas" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "itens_comanda" ADD CONSTRAINT "itens_comanda_produtoId_fkey"
  FOREIGN KEY ("produtoId") REFERENCES "produtos" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "itens_comanda" ADD CONSTRAINT "itens_comanda_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "empresas" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
