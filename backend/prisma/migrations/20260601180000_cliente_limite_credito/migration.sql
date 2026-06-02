-- AlterTable: limite de credito do cliente (crediario/fiado). NULL = sem limite
-- definido (fiado livre); numero = teto de credito.
ALTER TABLE "clientes" ADD COLUMN "limiteCredito" DECIMAL(10,2);
