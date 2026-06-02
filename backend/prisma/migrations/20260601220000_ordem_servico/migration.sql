-- CreateEnum
CREATE TYPE "StatusOS" AS ENUM ('ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_PECA', 'PRONTA', 'ENTREGUE', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoItemOS" AS ENUM ('PECA', 'SERVICO');

-- CreateTable
CREATE TABLE "ordens_servico" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "status" "StatusOS" NOT NULL DEFAULT 'ABERTA',
    "clienteId" TEXT,
    "descricaoCliente" TEXT,
    "telefone" TEXT,
    "equipamento" TEXT,
    "defeitoRelatado" TEXT,
    "diagnostico" TEXT,
    "observacoes" TEXT,
    "responsavelId" TEXT,
    "valorPecas" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "valorServicos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "previsaoEntrega" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "entregueEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ordens_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_ordem_servico" (
    "id" TEXT NOT NULL,
    "tipo" "TipoItemOS" NOT NULL DEFAULT 'PECA',
    "produtoId" TEXT,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "valorUnitario" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ordemServicoId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "itens_ordem_servico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ordens_servico_tenantId_numero_key" ON "ordens_servico"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "ordens_servico_tenantId_status_idx" ON "ordens_servico"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ordens_servico_tenantId_createdAt_idx" ON "ordens_servico"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "itens_ordem_servico_ordemServicoId_ordem_idx" ON "itens_ordem_servico"("ordemServicoId", "ordem");

-- CreateIndex
CREATE INDEX "itens_ordem_servico_tenantId_idx" ON "itens_ordem_servico"("tenantId");

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_ordem_servico" ADD CONSTRAINT "itens_ordem_servico_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_ordem_servico" ADD CONSTRAINT "itens_ordem_servico_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_ordem_servico" ADD CONSTRAINT "itens_ordem_servico_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
