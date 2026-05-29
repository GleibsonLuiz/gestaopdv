-- Desconto de ajuste na compra. total passa a ser subtotal dos itens menos
-- este desconto. Compras antigas ficam com desconto 0 (default).

ALTER TABLE "compras" ADD COLUMN "desconto" DECIMAL(10,2) NOT NULL DEFAULT 0;
