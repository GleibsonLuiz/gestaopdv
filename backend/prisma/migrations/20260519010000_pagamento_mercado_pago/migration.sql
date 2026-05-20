-- ============ MERCADO PAGO POINT (MAQUININHA FISICA) ============
-- Adiciona credenciais MP em configuracao_empresa + cria tabela
-- intencoes_pagamento_mp que rastreia o ciclo de vida de cada cobranca
-- enviada para a maquininha.
--
-- Decisao: NAO criamos status novo em StatusVenda. A Venda real so e gerada
-- quando o webhook do MP confirma APPROVED (executando vendaController.criar
-- com o payload guardado em vendaPayloadJson). Isso preserva o significado
-- de "vendas.status = CONCLUIDA" em todos os relatorios existentes.

-- ============ ENUMS ============

CREATE TYPE "StatusIntencaoMP" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED', 'ERROR');
CREATE TYPE "TipoPagamentoMP" AS ENUM ('CREDIT', 'DEBIT', 'PIX');

-- ============ CONFIGURACAO_EMPRESA: CAMPOS MP ============

ALTER TABLE "configuracao_empresa"
  ADD COLUMN "mpAccessTokenEnc" TEXT,
  ADD COLUMN "mpDeviceId"       TEXT,
  ADD COLUMN "mpUserIdMp"       TEXT,
  ADD COLUMN "mpWebhookSecret"  TEXT,
  ADD COLUMN "mpAtivo"          BOOLEAN NOT NULL DEFAULT false;

-- ============ INTENCOES_PAGAMENTO_MP ============

CREATE TABLE "intencoes_pagamento_mp" (
  "id"               TEXT NOT NULL,
  "status"           "StatusIntencaoMP" NOT NULL DEFAULT 'PENDING',
  "tipo"             "TipoPagamentoMP" NOT NULL,
  "valor"            INTEGER NOT NULL,
  "intentId"         TEXT,
  "deviceId"         TEXT NOT NULL,
  "vendaPayloadJson" JSONB NOT NULL,
  "vendaId"          TEXT,
  "detalhe"          TEXT,
  "rawWebhook"       JSONB,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"     TIMESTAMP(3) NOT NULL,
  "userId"           TEXT NOT NULL,
  "caixaId"          TEXT,
  "tenantId"         TEXT NOT NULL,
  CONSTRAINT "intencoes_pagamento_mp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "intencoes_pagamento_mp_intentId_key" ON "intencoes_pagamento_mp"("intentId");
CREATE UNIQUE INDEX "intencoes_pagamento_mp_vendaId_key"  ON "intencoes_pagamento_mp"("vendaId");
CREATE INDEX "intencoes_pagamento_mp_tenantId_status_idx"    ON "intencoes_pagamento_mp"("tenantId", "status");
CREATE INDEX "intencoes_pagamento_mp_tenantId_createdAt_idx" ON "intencoes_pagamento_mp"("tenantId", "createdAt");

ALTER TABLE "intencoes_pagamento_mp"
  ADD CONSTRAINT "intencoes_pagamento_mp_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "intencoes_pagamento_mp"
  ADD CONSTRAINT "intencoes_pagamento_mp_caixaId_fkey"
  FOREIGN KEY ("caixaId") REFERENCES "caixas"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "intencoes_pagamento_mp"
  ADD CONSTRAINT "intencoes_pagamento_mp_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "empresas"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
