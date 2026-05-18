-- ============ ETAPA INVENTARIO (CONTAGEM CEGA) ============
-- Adiciona modulo de auditoria fisica de estoque com snapshot
-- congelado do estoque logico no momento da abertura.

-- CreateEnum
CREATE TYPE "StatusInventario" AS ENUM ('ABERTO', 'CONCLUIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "inventarios" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "descricao" TEXT,
    "observacoes" TEXT,
    "filtroCategoria" TEXT,
    "status" "StatusInventario" NOT NULL DEFAULT 'ABERTO',
    "dataInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFim" TIMESTAMP(3),
    "responsavelId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "inventarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_itens" (
    "id" TEXT NOT NULL,
    "estoqueLogico" INTEGER NOT NULL,
    "precoCustoMomento" DECIMAL(10,2),
    "quantidadeContada" INTEGER,
    "diferenca" INTEGER DEFAULT 0,
    "observacao" TEXT,
    "contadoEm" TIMESTAMP(3),
    "inventarioId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "inventario_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventarios_tenantId_numero_key" ON "inventarios"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "inventarios_tenantId_status_idx" ON "inventarios"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inventario_itens_inventarioId_produtoId_key" ON "inventario_itens"("inventarioId", "produtoId");

-- CreateIndex
CREATE INDEX "inventario_itens_tenantId_idx" ON "inventario_itens"("tenantId");

-- CreateIndex
CREATE INDEX "inventario_itens_inventarioId_idx" ON "inventario_itens"("inventarioId");

-- AddForeignKey
ALTER TABLE "inventarios"
    ADD CONSTRAINT "inventarios_responsavelId_fkey"
    FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios"
    ADD CONSTRAINT "inventarios_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_itens"
    ADD CONSTRAINT "inventario_itens_inventarioId_fkey"
    FOREIGN KEY ("inventarioId") REFERENCES "inventarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_itens"
    ADD CONSTRAINT "inventario_itens_produtoId_fkey"
    FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_itens"
    ADD CONSTRAINT "inventario_itens_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
