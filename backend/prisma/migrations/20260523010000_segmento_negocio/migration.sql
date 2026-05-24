-- ETAPA#6: Segmento de negocio + campos extras de produto por segmento.

-- 1. Enum Segmento.
CREATE TYPE "Segmento" AS ENUM ('GERAL', 'AUTO_PECAS', 'FARMACIA', 'PAPELARIA');

-- 2. Empresa ganha coluna segmento (default GERAL para empresas existentes).
ALTER TABLE "empresas"
  ADD COLUMN "segmento" "Segmento" NOT NULL DEFAULT 'GERAL';

-- 3. Produto ganha JSON opcional para campos extras (OEM, Lote, etc).
ALTER TABLE "produtos" ADD COLUMN "camposSegmento" JSONB;
