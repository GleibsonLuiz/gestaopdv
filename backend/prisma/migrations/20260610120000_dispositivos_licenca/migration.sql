-- ============ DISPOSITIVOS (CONTROLE DE LICENCA POR MAQUINA) ============
-- Limita o numero de navegadores/computadores com sessao ativa por empresa
-- (licenca por "seat"/maquina). Aplicada manualmente no Neon (ver DEPLOY.md /
-- memoria deploy_topology): migracoes NAO rodam no deploy.

-- 1) Limite de dispositivos por empresa. NULL = ilimitado (default seguro:
--    nao trava tenants existentes; o super-admin define um numero por cliente).
ALTER TABLE "empresas"
  ADD COLUMN IF NOT EXISTS "maxDispositivos" INTEGER;

-- 2) Tabela de dispositivos registrados.
CREATE TABLE IF NOT EXISTS "dispositivos" (
  "id"               TEXT NOT NULL,
  "fingerprint"      TEXT NOT NULL,
  "nome"             TEXT,
  "userAgent"        TEXT,
  "ultimoIp"         TEXT,
  "ativo"            BOOLEAN NOT NULL DEFAULT true,
  "revogadoPor"      TEXT,
  "revogadoEm"       TIMESTAMP(3),
  "primeiroAcessoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ultimoAcessoEm"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "userId"           TEXT,
  CONSTRAINT "dispositivos_pkey" PRIMARY KEY ("id")
);

-- 3) Unicidade do fingerprint dentro da empresa + indice quente (ativos por tenant).
CREATE UNIQUE INDEX IF NOT EXISTS "dispositivos_tenantId_fingerprint_key"
  ON "dispositivos" ("tenantId", "fingerprint");
CREATE INDEX IF NOT EXISTS "dispositivos_tenantId_ativo_idx"
  ON "dispositivos" ("tenantId", "ativo");

-- 4) Foreign keys. Empresa -> CASCADE (some com o tenant); User -> SET NULL
--    (nao bloqueia exclusao de funcionario que tenha usado a maquina).
DO $$ BEGIN
  ALTER TABLE "dispositivos"
    ADD CONSTRAINT "dispositivos_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "empresas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "dispositivos"
    ADD CONSTRAINT "dispositivos_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
