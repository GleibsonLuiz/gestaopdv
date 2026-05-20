-- ============ MULTIPLAS FORMAS DE PAGAMENTO POR VENDA ============
-- Cria tabela venda_pagamentos: split de pagamento (DINHEIRO + PIX + CARTAO).
--
-- Regras:
--   - Soma dos valores em venda_pagamentos == venda.total
--     (excedente em DINHEIRO vira troco e NAO entra como pagamento)
--   - vendas.formaPagamento continua existindo e passa a refletir a forma
--     de MAIOR valor do split — mantem filtros/relatorios existentes
--     funcionando sem reescrita
--
-- Backfill:
--   - Para cada venda historica, cria um VendaPagamento com forma=formaPagamento
--     e valor=total. Garante que toda venda passada tenha pelo menos 1 linha
--     em venda_pagamentos (front pode ler sempre por essa tabela).
--   - id derivado de vendaId ("<vendaId>-p0") para nao depender de pgcrypto.

CREATE TABLE "venda_pagamentos" (
  "id"              TEXT NOT NULL,
  "forma"           "FormaPagamento" NOT NULL,
  "valor"           DECIMAL(10,2) NOT NULL,
  "formaCustomNome" TEXT,
  "ordem"           INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "vendaId"         TEXT NOT NULL,
  "tenantId"        TEXT NOT NULL,
  CONSTRAINT "venda_pagamentos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "venda_pagamentos_vendaId_idx"  ON "venda_pagamentos"("vendaId");
CREATE INDEX "venda_pagamentos_tenantId_idx" ON "venda_pagamentos"("tenantId");

ALTER TABLE "venda_pagamentos"
  ADD CONSTRAINT "venda_pagamentos_vendaId_fkey"
  FOREIGN KEY ("vendaId") REFERENCES "vendas"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "venda_pagamentos"
  ADD CONSTRAINT "venda_pagamentos_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "empresas"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: 1 pagamento por venda existente.
INSERT INTO "venda_pagamentos" ("id", "forma", "valor", "ordem", "vendaId", "tenantId")
SELECT
  v."id" || '-p0',
  v."formaPagamento",
  v."total",
  0,
  v."id",
  v."tenantId"
FROM "vendas" v;
