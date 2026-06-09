-- ============ BOLETO HIBRIDO (BOLETO + PIX) VIA ASAAS ============
-- Lojista cobra o cliente final via a conta Asaas DELE (credencial por-tenant).
-- Independente do billing da plataforma. Aplicada manualmente no Neon (ver
-- DEPLOY.md / memoria deploy_topology): migracoes NAO rodam no deploy.

-- 1) Enum de status do boleto.
DO $$ BEGIN
  CREATE TYPE "StatusBoleto" AS ENUM ('PENDENTE', 'PAGO', 'VENCIDO', 'CANCELADO', 'ERRO');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2) Credencial Asaas do lojista + config de repasse de taxa, em ConfiguracaoEmpresa.
ALTER TABLE "configuracao_empresa"
  ADD COLUMN IF NOT EXISTS "asaasApiKeyEnc"     TEXT,
  ADD COLUMN IF NOT EXISTS "asaasWebhookSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "asaasAmbiente"      TEXT NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS "asaasAtivo"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "repassarTaxaBoleto" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "valorTaxaBoleto"    DECIMAL(10,2);

-- 3) Tabela de boletos.
CREATE TABLE IF NOT EXISTS "boletos_asaas" (
  "id"              TEXT NOT NULL,
  "asaasPaymentId"  TEXT,
  "asaasCustomerId" TEXT,
  "status"          "StatusBoleto" NOT NULL DEFAULT 'PENDENTE',
  "valorOriginal"   DECIMAL(10,2) NOT NULL,
  "valorCobrado"    DECIMAL(10,2) NOT NULL,
  "taxa"            DECIMAL(10,2) NOT NULL DEFAULT 0,
  "vencimento"      TIMESTAMP(3) NOT NULL,
  "pagoEm"          TIMESTAMP(3),
  "linhaDigitavel"  TEXT,
  "codigoBarras"    TEXT,
  "urlBoleto"       TEXT,
  "pixCopiaECola"   TEXT,
  "pixQrCodeBase64" TEXT,
  "detalhe"         TEXT,
  "rawAsaas"        JSONB,
  "clienteId"       TEXT NOT NULL,
  "contaReceberId"  TEXT,
  "vendaId"         TEXT,
  "userId"          TEXT,
  "tenantId"        TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "boletos_asaas_pkey" PRIMARY KEY ("id")
);

-- 4) Indices.
CREATE UNIQUE INDEX IF NOT EXISTS "boletos_asaas_asaasPaymentId_key" ON "boletos_asaas" ("asaasPaymentId");
CREATE INDEX IF NOT EXISTS "boletos_asaas_tenantId_status_idx"   ON "boletos_asaas" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "boletos_asaas_tenantId_createdAt_idx" ON "boletos_asaas" ("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "boletos_asaas_clienteId_idx"         ON "boletos_asaas" ("clienteId");
CREATE INDEX IF NOT EXISTS "boletos_asaas_contaReceberId_idx"    ON "boletos_asaas" ("contaReceberId");

-- 5) Foreign keys (espelham onDelete do schema).
ALTER TABLE "boletos_asaas"
  ADD CONSTRAINT "boletos_asaas_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "boletos_asaas"
  ADD CONSTRAINT "boletos_asaas_contaReceberId_fkey"
  FOREIGN KEY ("contaReceberId") REFERENCES "contas_receber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "boletos_asaas"
  ADD CONSTRAINT "boletos_asaas_vendaId_fkey"
  FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "boletos_asaas"
  ADD CONSTRAINT "boletos_asaas_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "boletos_asaas"
  ADD CONSTRAINT "boletos_asaas_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
