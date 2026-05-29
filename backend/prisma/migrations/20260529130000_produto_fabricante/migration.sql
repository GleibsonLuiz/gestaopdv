-- Fabricante / marca do produto (ex: BIC, Bosch). Campo geral de
-- identificacao, opcional. Produtos antigos ficam com NULL.

ALTER TABLE "produtos" ADD COLUMN "fabricante" TEXT;
