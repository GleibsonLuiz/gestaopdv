-- Compra: marcacao de estorno (cancelamento)
ALTER TABLE "compras" ADD COLUMN "cancelada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "compras" ADD COLUMN "canceladaEm" TIMESTAMP(3);
ALTER TABLE "compras" ADD COLUMN "motivoCancelamento" TEXT;

-- ContaPagar: vinculo opcional com a compra que originou a conta
ALTER TABLE "contas_pagar" ADD COLUMN "compraId" TEXT;
ALTER TABLE "contas_pagar"
  ADD CONSTRAINT "contas_pagar_compraId_fkey"
  FOREIGN KEY ("compraId") REFERENCES "compras"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "contas_pagar_compraId_idx" ON "contas_pagar"("compraId");
