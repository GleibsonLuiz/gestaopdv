-- CreateEnum
CREATE TYPE "StatusNotaEntrada" AS ENUM ('RECEBIDA', 'IMPORTADA', 'DESCARTADA');

-- CreateTable: staging da NF-e de entrada (importacao de compra)
CREATE TABLE "notas_fiscais_entrada" (
    "id" TEXT NOT NULL,
    "chaveAcesso" VARCHAR(44) NOT NULL,
    "status" "StatusNotaEntrada" NOT NULL DEFAULT 'RECEBIDA',
    "numero" TEXT,
    "serie" TEXT,
    "dataEmissao" TIMESTAMP(3),
    "emitenteCnpj" TEXT,
    "emitenteNome" TEXT,
    "valorTotal" DECIMAL(10,2),
    "xml" TEXT NOT NULL,
    "dadosJson" JSONB NOT NULL,
    "fornecedorId" TEXT,
    "compraId" TEXT,
    "userId" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notas_fiscais_entrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable: memoria do de-para (cProd do fornecedor -> produtoId)
CREATE TABLE "depara_produto_fornecedor" (
    "id" TEXT NOT NULL,
    "cProdFornecedor" TEXT NOT NULL,
    "cEAN" TEXT,
    "fornecedorId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "depara_produto_fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notas_fiscais_entrada_compraId_key" ON "notas_fiscais_entrada"("compraId");
CREATE INDEX "notas_fiscais_entrada_tenantId_status_idx" ON "notas_fiscais_entrada"("tenantId", "status");
CREATE UNIQUE INDEX "notas_fiscais_entrada_tenantId_chaveAcesso_key" ON "notas_fiscais_entrada"("tenantId", "chaveAcesso");

CREATE INDEX "depara_produto_fornecedor_tenantId_idx" ON "depara_produto_fornecedor"("tenantId");
CREATE UNIQUE INDEX "depara_produto_fornecedor_tenantId_fornecedorId_cProdForne_key" ON "depara_produto_fornecedor"("tenantId", "fornecedorId", "cProdFornecedor");

-- AddForeignKey
ALTER TABLE "notas_fiscais_entrada" ADD CONSTRAINT "notas_fiscais_entrada_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notas_fiscais_entrada" ADD CONSTRAINT "notas_fiscais_entrada_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "compras"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notas_fiscais_entrada" ADD CONSTRAINT "notas_fiscais_entrada_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notas_fiscais_entrada" ADD CONSTRAINT "notas_fiscais_entrada_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "depara_produto_fornecedor" ADD CONSTRAINT "depara_produto_fornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "depara_produto_fornecedor" ADD CONSTRAINT "depara_produto_fornecedor_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "depara_produto_fornecedor" ADD CONSTRAINT "depara_produto_fornecedor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
