-- AlterTable: modulos liberados por empresa (entitlements). NULL = pacote
-- padrao do plano; array de ids = lista explicita (modelo hibrido).
ALTER TABLE "empresas" ADD COLUMN "modulosHabilitados" JSONB;
