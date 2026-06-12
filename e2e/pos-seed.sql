-- Ajustes pos-seed exclusivos do banco E2E (demo_e2e).
-- maxDispositivos 0 = ilimitado: a suite cria browsers efemeros e chamadas
-- de API; sem isso o limite do plano default (2 maquinas) bloqueia o login
-- a partir da terceira execucao.
UPDATE "empresas" SET "maxDispositivos" = 0;

-- Plano ENTERPRISE (tudo ilimitado): o default TRIAL limita 200 vendas/MES
-- e o banco de teste acumula vendas entre execucoes — ao cruzar 200, o
-- backend passou a recusar TODA venda nova (billing funcionando certo, mas
-- derrubando a suite inteira de uma vez).
UPDATE "empresas" SET "plano" = 'ENTERPRISE';

-- Repoe o estoque dos produtos usados pelos testes: o seed so cria compras
-- na PRIMEIRA execucao (count>=20 pula) e cada run da suite vende unidades —
-- PAP-0001 nasceu com 10 e esgotou apos ~10 execucoes (o PDV recusa bipar
-- item zerado, corretamente). Top-up garante suite sustentavel para sempre.
UPDATE "produtos" SET "estoque" = 1000
 WHERE "codigo" IN ('PAP-0001','PAP-0002','PAP-0006','PAP-0007')
   AND "estoque" < 100;
