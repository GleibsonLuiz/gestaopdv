-- Programa de Fidelidade / Pontos
CREATE TYPE "TipoMovimentacaoPontos" AS ENUM ('GANHO', 'RESGATE', 'AJUSTE');

-- Configuracao singleton do programa
CREATE TABLE "configuracao_fidelidade" (
  "id"               TEXT NOT NULL,
  "ativo"            BOOLEAN NOT NULL DEFAULT true,
  "reaisPorPonto"    DECIMAL(10,2) NOT NULL DEFAULT 1,
  "pontosParaUmReal" INTEGER NOT NULL DEFAULT 100,
  "minimoResgate"    INTEGER NOT NULL DEFAULT 100,
  "maximoDescPct"    DECIMAL(5,2) NOT NULL DEFAULT 50,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "configuracao_fidelidade_pkey" PRIMARY KEY ("id")
);

-- Saldo de pontos por cliente (1:1)
CREATE TABLE "pontos_cliente" (
  "id"             TEXT NOT NULL,
  "saldo"          INTEGER NOT NULL DEFAULT 0,
  "totalGanho"     INTEGER NOT NULL DEFAULT 0,
  "totalResgatado" INTEGER NOT NULL DEFAULT 0,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clienteId"      TEXT NOT NULL,
  CONSTRAINT "pontos_cliente_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pontos_cliente_clienteId_key" UNIQUE ("clienteId")
);

ALTER TABLE "pontos_cliente"
  ADD CONSTRAINT "pontos_cliente_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "clientes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Historico de movimentacoes de pontos
CREATE TABLE "movimentacoes_pontos" (
  "id"        TEXT NOT NULL,
  "tipo"      "TipoMovimentacaoPontos" NOT NULL,
  "pontos"    INTEGER NOT NULL,
  "descricao" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clienteId" TEXT NOT NULL,
  "vendaId"   TEXT,
  "userId"    TEXT NOT NULL,
  CONSTRAINT "movimentacoes_pontos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "movimentacoes_pontos"
  ADD CONSTRAINT "movimentacoes_pontos_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "clientes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "movimentacoes_pontos"
  ADD CONSTRAINT "movimentacoes_pontos_vendaId_fkey"
  FOREIGN KEY ("vendaId") REFERENCES "vendas"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "movimentacoes_pontos"
  ADD CONSTRAINT "movimentacoes_pontos_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "movimentacoes_pontos_clienteId_createdAt_idx" ON "movimentacoes_pontos"("clienteId", "createdAt" DESC);
CREATE INDEX "movimentacoes_pontos_vendaId_idx"              ON "movimentacoes_pontos"("vendaId");
