-- CreateTable
CREATE TABLE "logs_auditoria" (
    "id" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "entidadeId" TEXT,
    "metodo" TEXT,
    "rota" TEXT,
    "statusCode" INTEGER,
    "sucesso" BOOLEAN NOT NULL DEFAULT true,
    "ip" TEXT,
    "userAgent" TEXT,
    "dadosAntes" JSONB,
    "dadosDepois" JSONB,
    "diff" JSONB,
    "duracaoMs" INTEGER,
    "mensagem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT,
    "usuarioNome" TEXT,
    "usuarioEmail" TEXT,

    CONSTRAINT "logs_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "logs_auditoria_usuarioId_createdAt_idx" ON "logs_auditoria"("usuarioId", "createdAt");

-- CreateIndex
CREATE INDEX "logs_auditoria_modulo_createdAt_idx" ON "logs_auditoria"("modulo", "createdAt");

-- CreateIndex
CREATE INDEX "logs_auditoria_acao_createdAt_idx" ON "logs_auditoria"("acao", "createdAt");

-- CreateIndex
CREATE INDEX "logs_auditoria_createdAt_idx" ON "logs_auditoria"("createdAt");

-- AddForeignKey
ALTER TABLE "logs_auditoria" ADD CONSTRAINT "logs_auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
