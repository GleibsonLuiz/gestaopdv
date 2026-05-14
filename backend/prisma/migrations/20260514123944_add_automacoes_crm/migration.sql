-- CreateEnum
CREATE TYPE "TipoRegraAutomacao" AS ENUM ('CLIENTE_INATIVO', 'ORCAMENTO_PARADO', 'POS_VENDA_FOLLOWUP');

-- CreateTable
CREATE TABLE "regras_automacao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoRegraAutomacao" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "diasGatilho" INTEGER,
    "valorMinimo" DECIMAL(10,2),
    "tituloTarefa" TEXT NOT NULL,
    "descricaoTarefa" TEXT,
    "prioridadeTarefa" "PrioridadeTarefa" NOT NULL DEFAULT 'MEDIA',
    "prazoEmDias" INTEGER NOT NULL DEFAULT 7,
    "responsavelId" TEXT,
    "ultimaExecucao" TIMESTAMP(3),
    "totalDisparos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regras_automacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_automacao" (
    "id" TEXT NOT NULL,
    "regraId" TEXT NOT NULL,
    "clienteId" TEXT,
    "orcamentoId" TEXT,
    "vendaId" TEXT,
    "tarefaId" TEXT,
    "resultado" TEXT NOT NULL DEFAULT 'CRIADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_automacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "regras_automacao_tipo_ativo_idx" ON "regras_automacao"("tipo", "ativo");

-- CreateIndex
CREATE INDEX "logs_automacao_regraId_createdAt_idx" ON "logs_automacao"("regraId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "logs_automacao_clienteId_regraId_idx" ON "logs_automacao"("clienteId", "regraId");

-- CreateIndex
CREATE INDEX "logs_automacao_orcamentoId_regraId_idx" ON "logs_automacao"("orcamentoId", "regraId");

-- CreateIndex
CREATE INDEX "logs_automacao_vendaId_regraId_idx" ON "logs_automacao"("vendaId", "regraId");

-- AddForeignKey
ALTER TABLE "regras_automacao" ADD CONSTRAINT "regras_automacao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_automacao" ADD CONSTRAINT "logs_automacao_regraId_fkey" FOREIGN KEY ("regraId") REFERENCES "regras_automacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
