-- Painel financeiro (Contabilidade > Painel): indices para as agregacoes
-- por periodo (data/pagamento/recebimento) e a projecao por vencimento.
-- Sem CONCURRENTLY pois o Prisma migrate roda em transacao; nas tabelas
-- atuais (Neon) o lock e instantaneo. Aplicar manualmente em producao
-- (mesmo fluxo das demais migrations deste projeto).

-- Faturamento por periodo (vendas concluidas em janela de createdAt)
CREATE INDEX IF NOT EXISTS "vendas_tenantId_status_createdAt_idx"
  ON "vendas" ("tenantId", "status", "createdAt");

-- Contas a pagar: quitadas no periodo + projecao por vencimento
CREATE INDEX IF NOT EXISTS "contas_pagar_tenantId_status_pagamento_idx"
  ON "contas_pagar" ("tenantId", "status", "pagamento");
CREATE INDEX IF NOT EXISTS "contas_pagar_tenantId_status_vencimento_idx"
  ON "contas_pagar" ("tenantId", "status", "vencimento");

-- Contas a receber: recebidas no periodo + projecao por vencimento
CREATE INDEX IF NOT EXISTS "contas_receber_tenantId_status_recebimento_idx"
  ON "contas_receber" ("tenantId", "status", "recebimento");
CREATE INDEX IF NOT EXISTS "contas_receber_tenantId_status_vencimento_idx"
  ON "contas_receber" ("tenantId", "status", "vencimento");
