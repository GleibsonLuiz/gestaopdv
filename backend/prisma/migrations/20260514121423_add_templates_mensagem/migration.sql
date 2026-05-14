-- CreateEnum
CREATE TYPE "TipoTemplate" AS ENUM ('WHATSAPP', 'EMAIL', 'SMS');

-- CreateTable
CREATE TABLE "templates_mensagem" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoTemplate" NOT NULL,
    "assunto" TEXT,
    "corpo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "templates_mensagem_nome_key" ON "templates_mensagem"("nome");

-- CreateIndex
CREATE INDEX "templates_mensagem_tipo_ativo_idx" ON "templates_mensagem"("tipo", "ativo");
