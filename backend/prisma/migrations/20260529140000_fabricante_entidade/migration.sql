-- Fabricante deixa de ser texto livre no produto e passa a ser uma entidade
-- propria (cadastro reutilizavel, igual Categoria). O produto referencia o
-- fabricante por FK opcional.
--
-- DROP IF EXISTS cobre o caso da migracao anterior (que adicionou a coluna
-- de texto "fabricante") ja ter sido aplicada ou nao — em ambos os casos o
-- estado final fica correto.

-- Tabela de fabricantes (por tenant)
CREATE TABLE "fabricantes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "fabricantes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fabricantes_tenantId_idx" ON "fabricantes"("tenantId");
CREATE UNIQUE INDEX "fabricantes_tenantId_nome_key" ON "fabricantes"("tenantId", "nome");

ALTER TABLE "fabricantes" ADD CONSTRAINT "fabricantes_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Remove o campo de texto livre antigo e adiciona a FK
ALTER TABLE "produtos" DROP COLUMN IF EXISTS "fabricante";
ALTER TABLE "produtos" ADD COLUMN "fabricanteId" TEXT;

ALTER TABLE "produtos" ADD CONSTRAINT "produtos_fabricanteId_fkey"
    FOREIGN KEY ("fabricanteId") REFERENCES "fabricantes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
