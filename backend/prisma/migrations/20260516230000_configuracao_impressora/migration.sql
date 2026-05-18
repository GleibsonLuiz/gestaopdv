-- ConfiguracaoImpressora: singleton por tenant. Controla layout do cupom
-- termico e quais documentos imprimem (venda, orcamento, sangria, etc).
-- Lido pelo helper src/lib/impressora.js antes de cada window.print().

CREATE TYPE "LarguraImpressao" AS ENUM ('MM_58', 'MM_80', 'A4');

CREATE TABLE "configuracao_impressora" (
    "id" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "largura" "LarguraImpressao" NOT NULL DEFAULT 'MM_80',
    "fonteBase" INTEGER NOT NULL DEFAULT 12,
    "margemMm" INTEGER NOT NULL DEFAULT 4,
    "cabecalhoExtra" TEXT,
    "rodapeExtra" TEXT,
    "mostrarLogo" BOOLEAN NOT NULL DEFAULT true,
    "mostrarCnpj" BOOLEAN NOT NULL DEFAULT true,
    "mostrarVendedor" BOOLEAN NOT NULL DEFAULT true,
    "mostrarCliente" BOOLEAN NOT NULL DEFAULT true,
    "viasVenda" INTEGER NOT NULL DEFAULT 1,
    "cortarLinhasFinal" INTEGER NOT NULL DEFAULT 4,
    "abrirGavetaDinheiro" BOOLEAN NOT NULL DEFAULT false,
    "imprimirAutomatico" BOOLEAN NOT NULL DEFAULT true,
    "imprimirVenda" BOOLEAN NOT NULL DEFAULT true,
    "imprimirOrcamento" BOOLEAN NOT NULL DEFAULT true,
    "imprimirSangria" BOOLEAN NOT NULL DEFAULT true,
    "imprimirSuprimento" BOOLEAN NOT NULL DEFAULT true,
    "imprimirFechamento" BOOLEAN NOT NULL DEFAULT true,
    "imprimirReciboFin" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "configuracao_impressora_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "configuracao_impressora_tenantId_key" ON "configuracao_impressora"("tenantId");

ALTER TABLE "configuracao_impressora" ADD CONSTRAINT "configuracao_impressora_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "empresas"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
