-- ============ PIX VIA /v1/payments NA INTENCAO MP ============
-- O fluxo PIX nao usa a Point Integration API (o device PAX_Q92 nao
-- suporta). Em vez disso, criamos um Payment do tipo PIX em /v1/payments
-- e exibimos o QR Code no PDV. Para guardar o codigo entre o create e o
-- polling/webhook, adicionamos duas colunas na intencao:
--
--   qrCode       — string EMV do PIX (copia e cola)
--   qrCodeBase64 — imagem PNG do QR Code em base64
--
-- Ambas nullable: cobrancas CREDIT/DEBIT nunca preenchem.

ALTER TABLE "intencoes_pagamento_mp"
  ADD COLUMN "qrCode"       TEXT,
  ADD COLUMN "qrCodeBase64" TEXT;

-- intentId guarda o ID retornado pelo MP. Para CREDIT/DEBIT e a Point
-- payment-intent; para PIX e o payment.id de /v1/payments. Nada muda no
-- schema — o codigo distingue pelo campo "tipo".
