-- CRM: tarefas e follow-ups
CREATE TYPE "PrioridadeTarefa" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');
CREATE TYPE "StatusTarefa" AS ENUM ('ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

CREATE TABLE "tarefas" (
  "id"           TEXT NOT NULL,
  "titulo"       TEXT NOT NULL,
  "descricao"    TEXT,
  "prazo"        TIMESTAMP(3),
  "prioridade"   "PrioridadeTarefa" NOT NULL DEFAULT 'MEDIA',
  "status"       "StatusTarefa" NOT NULL DEFAULT 'ABERTA',
  "concluidaEm"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clienteId"    TEXT,
  "responsavelId" TEXT,
  "criadoPorId"  TEXT NOT NULL,
  CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tarefas"
  ADD CONSTRAINT "tarefas_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "clientes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tarefas"
  ADD CONSTRAINT "tarefas_responsavelId_fkey"
  FOREIGN KEY ("responsavelId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tarefas"
  ADD CONSTRAINT "tarefas_criadoPorId_fkey"
  FOREIGN KEY ("criadoPorId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "tarefas_status_prazo_idx"        ON "tarefas"("status", "prazo");
CREATE INDEX "tarefas_responsavelId_status_idx" ON "tarefas"("responsavelId", "status");
CREATE INDEX "tarefas_clienteId_idx"            ON "tarefas"("clienteId");
