-- CreateTable
CREATE TABLE "pesquisas_nps" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "nota" INTEGER,
    "comentario" TEXT,
    "respondidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendaId" TEXT NOT NULL,
    "clienteId" TEXT,

    CONSTRAINT "pesquisas_nps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pesquisas_nps_token_key" ON "pesquisas_nps"("token");

-- CreateIndex
CREATE UNIQUE INDEX "pesquisas_nps_vendaId_key" ON "pesquisas_nps"("vendaId");

-- CreateIndex
CREATE INDEX "pesquisas_nps_clienteId_respondidaEm_idx" ON "pesquisas_nps"("clienteId", "respondidaEm");

-- CreateIndex
CREATE INDEX "pesquisas_nps_createdAt_idx" ON "pesquisas_nps"("createdAt");

-- AddForeignKey
ALTER TABLE "pesquisas_nps" ADD CONSTRAINT "pesquisas_nps_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pesquisas_nps" ADD CONSTRAINT "pesquisas_nps_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
