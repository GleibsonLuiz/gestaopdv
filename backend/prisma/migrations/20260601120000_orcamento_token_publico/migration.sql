-- Aceite online de orcamento (Fase 1.3 - CRM).
-- Adiciona token publico opcional, unico globalmente (mesma estrategia do
-- token de pesquisas_nps). Quando preenchido, o cliente acessa /?orc=<token>
-- e aprova ou recusa o orcamento sem precisar autenticar.

ALTER TABLE "orcamentos" ADD COLUMN "tokenPublico" TEXT;

CREATE UNIQUE INDEX "orcamentos_tokenPublico_key" ON "orcamentos"("tokenPublico");
