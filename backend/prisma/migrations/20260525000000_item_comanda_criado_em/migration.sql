-- AlterTable: timestamp por item para suportar impressao de adendo
-- (so itens adicionados depois da abertura da comanda).
ALTER TABLE "itens_comanda"
  ADD COLUMN "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Index para ordenar itens por momento de adicao na hora de imprimir adendo.
CREATE INDEX "itens_comanda_comandaId_criadoEm_idx"
  ON "itens_comanda"("comandaId", "criadoEm");
