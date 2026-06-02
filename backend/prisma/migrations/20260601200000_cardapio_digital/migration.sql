-- AlterTable: cardapio digital (pedido online). Token unico = chave da pagina
-- publica; cardapioAtivo liga/desliga.
ALTER TABLE "empresas" ADD COLUMN "cardapioToken" TEXT,
ADD COLUMN "cardapioAtivo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "empresas_cardapioToken_key" ON "empresas"("cardapioToken");
