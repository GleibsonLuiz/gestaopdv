-- ============ PIX COM FLAG INDEPENDENTE DA MAQUININHA ============
-- Adiciona mpPixAtivo em configuracao_empresa. Permite ligar/desligar PIX
-- (cobrado via /v1/payments) separadamente da cobranca via maquininha
-- (Point Integration). Util quando o operador quer aceitar PIX mas a
-- maquininha esta em manutencao, ou vice-versa.
--
-- Default false para novos tenants. Para tenants existentes que ja tinham
-- mpAtivo = true, replicamos o valor — ninguem perde funcionalidade.

ALTER TABLE "configuracao_empresa"
  ADD COLUMN "mpPixAtivo" BOOLEAN NOT NULL DEFAULT false;

UPDATE "configuracao_empresa" SET "mpPixAtivo" = "mpAtivo" WHERE "mpAtivo" = true;
