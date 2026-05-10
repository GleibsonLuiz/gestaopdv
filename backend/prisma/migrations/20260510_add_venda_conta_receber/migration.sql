-- ContaReceber: vinculo opcional com a venda que originou a conta
ALTER TABLE "contas_receber" ADD COLUMN "vendaId" TEXT;
ALTER TABLE "contas_receber"
  ADD CONSTRAINT "contas_receber_vendaId_fkey"
  FOREIGN KEY ("vendaId") REFERENCES "vendas"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "contas_receber_vendaId_idx" ON "contas_receber"("vendaId");
