-- CreateEnum: como uma linha da lista de reposicao entrou
CREATE TYPE "OrigemSugestaoCompra" AS ENUM ('SISTEMA', 'MANUAL');

-- CreateEnum: estado de uma linha persistida da lista de compras
CREATE TYPE "StatusSugestaoCompra" AS ENUM ('PENDENTE', 'DESCARTADO', 'COMPRADO');

-- CreateTable: lista de reposicao (apenas a intencao do usuario; a sugestao
-- automatica por estoque baixo e calculada ao vivo, nao gravada aqui)
CREATE TABLE "sugestoes_compra" (
    "id" TEXT NOT NULL,
    "origem" "OrigemSugestaoCompra" NOT NULL DEFAULT 'MANUAL',
    "status" "StatusSugestaoCompra" NOT NULL DEFAULT 'PENDENTE',
    "quantidadeSugerida" DECIMAL(12,3),
    "observacao" TEXT,
    "produtoId" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "userId" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sugestoes_compra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sugestoes_compra_tenantId_produtoId_key" ON "sugestoes_compra"("tenantId", "produtoId");
CREATE INDEX "sugestoes_compra_tenantId_status_idx" ON "sugestoes_compra"("tenantId", "status");
CREATE INDEX "sugestoes_compra_produtoId_idx" ON "sugestoes_compra"("produtoId");
CREATE INDEX "sugestoes_compra_fornecedorId_idx" ON "sugestoes_compra"("fornecedorId");

-- AddForeignKey
ALTER TABLE "sugestoes_compra" ADD CONSTRAINT "sugestoes_compra_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sugestoes_compra" ADD CONSTRAINT "sugestoes_compra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sugestoes_compra" ADD CONSTRAINT "sugestoes_compra_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sugestoes_compra" ADD CONSTRAINT "sugestoes_compra_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
