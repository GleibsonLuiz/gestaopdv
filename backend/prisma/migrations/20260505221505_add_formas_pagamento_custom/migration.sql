-- CreateTable
CREATE TABLE "formas_pagamento_custom" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "icone" TEXT,
    "baseFormaPagamento" "FormaPagamento" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "formas_pagamento_custom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "formas_pagamento_custom_nome_key" ON "formas_pagamento_custom"("nome");
