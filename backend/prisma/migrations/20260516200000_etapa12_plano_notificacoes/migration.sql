-- CreateEnum
CREATE TYPE "Plano" AS ENUM ('TRIAL', 'FREE', 'STARTER', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "TipoNotificacao" AS ENUM ('INFO', 'AVISO', 'MANUTENCAO', 'NOVIDADE');

-- AlterTable
ALTER TABLE "empresas" ADD COLUMN     "expiraEm" TIMESTAMP(3),
ADD COLUMN     "observacoesPlano" TEXT,
ADD COLUMN     "plano" "Plano" NOT NULL DEFAULT 'TRIAL';

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "tipo" "TipoNotificacao" NOT NULL DEFAULT 'INFO',
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "expiraEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "criadoPorId" TEXT NOT NULL,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes_lidas" (
    "notificacaoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_lidas_pkey" PRIMARY KEY ("notificacaoId","userId")
);

-- CreateIndex
CREATE INDEX "notificacoes_ativa_createdAt_idx" ON "notificacoes"("ativa", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notificacoes_lidas_userId_idx" ON "notificacoes_lidas"("userId");

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes_lidas" ADD CONSTRAINT "notificacoes_lidas_notificacaoId_fkey" FOREIGN KEY ("notificacaoId") REFERENCES "notificacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes_lidas" ADD CONSTRAINT "notificacoes_lidas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

