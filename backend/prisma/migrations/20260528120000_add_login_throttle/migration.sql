-- Controle de forca-bruta de login (GLOBAL, fora do multi-tenant).
-- Conta tentativas falhas de login por chave ("ip:<addr>" e "email:<addr>")
-- e bloqueia temporariamente ao exceder o limite. Persistente para
-- funcionar em ambiente serverless (contador em memoria nao e compartilhado
-- entre instancias da funcao).
--
-- Tabela nova e independente: nao altera dados existentes.
-- Aplicar com o backend dev fechado: `npx prisma migrate deploy` (Windows EPERM).

-- CreateTable
CREATE TABLE "login_throttle" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "janelaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bloqueadoAte" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_throttle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "login_throttle_chave_key" ON "login_throttle"("chave");

-- CreateIndex
CREATE INDEX "login_throttle_bloqueadoAte_idx" ON "login_throttle"("bloqueadoAte");
