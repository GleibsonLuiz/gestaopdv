-- ============ QUANTIDADE / ESTOQUE FRACIONARIO ============
-- Permite vender e movimentar estoque por metro / quilo / litro.
-- Converte Int -> Decimal(12,3) em todas as colunas acopladas:
--   produtos.estoque / estoqueMinimo
--   itens_venda.quantidade
--   itens_compra.quantidade
--   movimentacoes_estoque.quantidade / estoqueAntes / estoqueDepois
--   inventario_itens.estoqueLogico / quantidadeContada / diferenca
--
-- O cast INTEGER -> DECIMAL e implicito no Postgres (preserva o valor),
-- entao nao ha perda de dados. Os indices/PKs nao tocam essas colunas.

ALTER TABLE "produtos"
  ALTER COLUMN "estoque" SET DATA TYPE DECIMAL(12,3) USING "estoque"::decimal,
  ALTER COLUMN "estoque" SET DEFAULT 0,
  ALTER COLUMN "estoqueMinimo" SET DATA TYPE DECIMAL(12,3) USING "estoqueMinimo"::decimal,
  ALTER COLUMN "estoqueMinimo" SET DEFAULT 0;

ALTER TABLE "itens_venda"
  ALTER COLUMN "quantidade" SET DATA TYPE DECIMAL(12,3) USING "quantidade"::decimal;

ALTER TABLE "itens_compra"
  ALTER COLUMN "quantidade" SET DATA TYPE DECIMAL(12,3) USING "quantidade"::decimal;

ALTER TABLE "movimentacoes_estoque"
  ALTER COLUMN "quantidade" SET DATA TYPE DECIMAL(12,3) USING "quantidade"::decimal,
  ALTER COLUMN "estoqueAntes" SET DATA TYPE DECIMAL(12,3) USING "estoqueAntes"::decimal,
  ALTER COLUMN "estoqueDepois" SET DATA TYPE DECIMAL(12,3) USING "estoqueDepois"::decimal;

ALTER TABLE "inventario_itens"
  ALTER COLUMN "estoqueLogico" SET DATA TYPE DECIMAL(12,3) USING "estoqueLogico"::decimal,
  ALTER COLUMN "quantidadeContada" SET DATA TYPE DECIMAL(12,3) USING "quantidadeContada"::decimal,
  ALTER COLUMN "diferenca" SET DATA TYPE DECIMAL(12,3) USING "diferenca"::decimal,
  ALTER COLUMN "diferenca" SET DEFAULT 0;
