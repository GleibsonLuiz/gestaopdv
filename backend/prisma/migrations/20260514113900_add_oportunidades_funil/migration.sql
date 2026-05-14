-- CreateEnum
CREATE TYPE "EtapaFunil" AS ENUM ('LEAD', 'QUALIFICADO', 'PROPOSTA', 'NEGOCIACAO', 'GANHO', 'PERDIDO');

-- AlterTable
ALTER TABLE "configuracao_fidelidade" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pontos_cliente" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tarefas" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "oportunidades" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "etapa" "EtapaFunil" NOT NULL DEFAULT 'LEAD',
    "probabilidade" INTEGER NOT NULL DEFAULT 0,
    "valorEstimado" DECIMAL(10,2),
    "dataFechamentoPrevista" TIMESTAMP(3),
    "origem" TEXT,
    "dataGanho" TIMESTAMP(3),
    "dataPerdida" TIMESTAMP(3),
    "motivoPerda" TEXT,
    "clienteId" TEXT,
    "responsavelId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "vendaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oportunidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_oportunidades" (
    "id" TEXT NOT NULL,
    "etapaAnterior" "EtapaFunil",
    "etapaNova" "EtapaFunil" NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "oportunidadeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "historico_oportunidades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oportunidades_numero_key" ON "oportunidades"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "oportunidades_vendaId_key" ON "oportunidades"("vendaId");

-- CreateIndex
CREATE INDEX "oportunidades_etapa_idx" ON "oportunidades"("etapa");

-- CreateIndex
CREATE INDEX "oportunidades_responsavelId_etapa_idx" ON "oportunidades"("responsavelId", "etapa");

-- CreateIndex
CREATE INDEX "oportunidades_clienteId_idx" ON "oportunidades"("clienteId");

-- CreateIndex
CREATE INDEX "historico_oportunidades_oportunidadeId_createdAt_idx" ON "historico_oportunidades"("oportunidadeId", "createdAt");

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_oportunidades" ADD CONSTRAINT "historico_oportunidades_oportunidadeId_fkey" FOREIGN KEY ("oportunidadeId") REFERENCES "oportunidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_oportunidades" ADD CONSTRAINT "historico_oportunidades_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
