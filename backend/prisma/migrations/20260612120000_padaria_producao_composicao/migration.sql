-- ============ PADARIA / PRODUCAO PROPRIA (FICHA TECNICA) ============
-- Kit alimentacao: segmentos PADARIA/DELICATESSEN/LANCHONETE, flag de venda
-- sem controle de estoque e ficha tecnica (composicao) p/ Registrar Producao.
-- Aplicada manualmente no Neon (ver memoria deploy_topology): migracoes NAO
-- rodam no deploy.

-- 1) Novos segmentos de negocio (enum). IF NOT EXISTS exige PG 12+ (Neon ok).
ALTER TYPE "Segmento" ADD VALUE IF NOT EXISTS 'PADARIA';
ALTER TYPE "Segmento" ADD VALUE IF NOT EXISTS 'DELICATESSEN';
ALTER TYPE "Segmento" ADD VALUE IF NOT EXISTS 'LANCHONETE';

-- 2) Flag de controle de estoque por produto. Default true preserva o
--    comportamento atual de TODOS os produtos existentes (venda bloqueia
--    sem saldo); false = producao propria, venda nunca bloqueia e o saldo
--    pode ficar negativo.
ALTER TABLE "produtos"
  ADD COLUMN IF NOT EXISTS "controlarEstoque" BOOLEAN NOT NULL DEFAULT true;

-- 3) Ficha tecnica: insumos consumidos por 1 unidade do produto final.
CREATE TABLE IF NOT EXISTS "composicoes_produto" (
  "id"         TEXT NOT NULL,
  "produtoId"  TEXT NOT NULL,
  "insumoId"   TEXT NOT NULL,
  "quantidade" DECIMAL(12,4) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenantId"   TEXT NOT NULL,
  CONSTRAINT "composicoes_produto_pkey" PRIMARY KEY ("id")
);

-- 4) Um insumo entra no maximo 1x por receita + indices de consulta.
CREATE UNIQUE INDEX IF NOT EXISTS "composicoes_produto_produtoId_insumoId_key"
  ON "composicoes_produto" ("produtoId", "insumoId");
CREATE INDEX IF NOT EXISTS "composicoes_produto_tenantId_idx"
  ON "composicoes_produto" ("tenantId");
CREATE INDEX IF NOT EXISTS "composicoes_produto_insumoId_idx"
  ON "composicoes_produto" ("insumoId");

-- 5) Foreign keys. produtoId -> CASCADE (apagar o produto final leva a
--    receita junto); insumoId -> RESTRICT (insumo em uso nao pode sumir;
--    na pratica produto e soft-delete, isto e so cinto de seguranca);
--    tenantId -> CASCADE (some com a empresa).
DO $$ BEGIN
  ALTER TABLE "composicoes_produto"
    ADD CONSTRAINT "composicoes_produto_produtoId_fkey"
    FOREIGN KEY ("produtoId") REFERENCES "produtos"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "composicoes_produto"
    ADD CONSTRAINT "composicoes_produto_insumoId_fkey"
    FOREIGN KEY ("insumoId") REFERENCES "produtos"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "composicoes_produto"
    ADD CONSTRAINT "composicoes_produto_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "empresas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
