-- Coluna nullable, sem default — clientes existentes ficam com NULL.
ALTER TABLE "clientes" ADD COLUMN "bairro" TEXT;
