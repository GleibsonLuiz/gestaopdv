-- ETAPA 11: motivo + data de suspensao em Empresa.
-- Quando super-admin desativa um tenant, registra motivo (mostrado pro
-- user na tela de login bloqueado) e data da acao.

ALTER TABLE "empresas"
  ADD COLUMN "motivoSuspensao" TEXT,
  ADD COLUMN "suspensaEm" TIMESTAMP(3);
