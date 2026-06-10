-- Ajustes pos-seed exclusivos do banco E2E (demo_e2e).
-- maxDispositivos 0 = ilimitado: a suite cria browsers efemeros e chamadas
-- de API; sem isso o limite do plano default (2 maquinas) bloqueia o login
-- a partir da terceira execucao.
UPDATE "empresas" SET "maxDispositivos" = 0;
