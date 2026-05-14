-- CRM: tabela de interacoes com clientes
CREATE TYPE "TipoInteracao" AS ENUM ('LIGACAO', 'WHATSAPP', 'VISITA', 'EMAIL', 'REUNIAO', 'ANOTACAO');

CREATE TABLE "interacoes" (
  "id"        TEXT NOT NULL,
  "tipo"      "TipoInteracao" NOT NULL DEFAULT 'ANOTACAO',
  "descricao" TEXT NOT NULL,
  "data"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clienteId" TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  CONSTRAINT "interacoes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "interacoes"
  ADD CONSTRAINT "interacoes_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "clientes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "interacoes"
  ADD CONSTRAINT "interacoes_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "interacoes_clienteId_data_idx" ON "interacoes"("clienteId", "data" DESC);
