-- CreateTable: trilha de eventos da nota fiscal (auditoria + fila de retry)
CREATE TABLE "documentos_fiscais_eventos" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "cStat" TEXT,
    "xMotivo" TEXT,
    "mensagemAmigavel" TEXT,
    "tentativa" INTEGER NOT NULL DEFAULT 1,
    "proximaTentativaEm" TIMESTAMP(3),
    "payloadHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notaFiscalId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "documentos_fiscais_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documentos_fiscais_eventos_notaFiscalId_createdAt_idx" ON "documentos_fiscais_eventos"("notaFiscalId", "createdAt");

-- CreateIndex: o worker de reconsulta varre por aqui
CREATE INDEX "documentos_fiscais_eventos_resultado_proximaTentativaEm_idx" ON "documentos_fiscais_eventos"("resultado", "proximaTentativaEm");

-- AddForeignKey
ALTER TABLE "documentos_fiscais_eventos" ADD CONSTRAINT "documentos_fiscais_eventos_notaFiscalId_fkey" FOREIGN KEY ("notaFiscalId") REFERENCES "notas_fiscais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_fiscais_eventos" ADD CONSTRAINT "documentos_fiscais_eventos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
