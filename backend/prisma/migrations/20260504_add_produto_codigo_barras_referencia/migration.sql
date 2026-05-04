-- AlterTable
ALTER TABLE "produtos" ADD COLUMN "codigoBarras" TEXT;
ALTER TABLE "produtos" ADD COLUMN "referencia" TEXT;

-- CreateIndex (unique parcial — nulls nao colidem entre si no Postgres)
CREATE UNIQUE INDEX "produtos_codigoBarras_key" ON "produtos"("codigoBarras");
