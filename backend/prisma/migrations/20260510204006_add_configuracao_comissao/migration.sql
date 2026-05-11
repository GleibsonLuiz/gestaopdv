-- CreateEnum
CREATE TYPE "TipoComissao" AS ENUM ('PORCENTAGEM', 'VALOR_FIXO');

-- CreateEnum
CREATE TYPE "BaseComissao" AS ENUM ('VALOR_BRUTO', 'LUCRO_LIQUIDO');

-- CreateTable
CREATE TABLE "configuracoes_comissao" (
    "id" TEXT NOT NULL,
    "tipo" "TipoComissao" NOT NULL DEFAULT 'PORCENTAGEM',
    "base" "BaseComissao" NOT NULL DEFAULT 'VALOR_BRUTO',
    "valor" DECIMAL(10,2) NOT NULL,
    "metaMensal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bonusPorMeta" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "configuracoes_comissao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_comissao_userId_key" ON "configuracoes_comissao"("userId");

-- AddForeignKey
ALTER TABLE "configuracoes_comissao" ADD CONSTRAINT "configuracoes_comissao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
