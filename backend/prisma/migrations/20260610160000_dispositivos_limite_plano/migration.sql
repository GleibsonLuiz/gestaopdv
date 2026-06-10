-- ============ LICENCA POR MAQUINA: limite por plano (backfill) ============
-- A partir daqui, Empresa.maxDispositivos passa a significar:
--   NULL -> HERDA o limite do plano (lib/planoLimites.js)
--   0    -> ILIMITADO explicito
--   N>0  -> exatamente N
--
-- As empresas que JA existem hoje tem maxDispositivos NULL com o sentido antigo
-- de "ilimitado". Para nao capa-las de surpresa quando o NULL passa a herdar do
-- plano, convertemos esse NULL legado em 0 (ilimitado explicito). Novos cadastros
-- nascem com NULL e, portanto, herdam o limite do plano automaticamente.
-- Aplicada manualmente no Neon (ver DEPLOY.md / memoria deploy_topology).

UPDATE "empresas" SET "maxDispositivos" = 0 WHERE "maxDispositivos" IS NULL;
