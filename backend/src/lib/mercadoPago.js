// ============ CLIENTE MERCADO PAGO POINT (API INTEGRATION) ============
//
// Endpoints utilizados:
//
//   POST /point/integration-api/devices/{deviceId}/payment-intents
//        -> envia uma cobranca para a maquininha. Retorna { id, ... }
//
//   GET  /point/integration-api/payment-intents/{intentId}
//        -> consulta o estado da intencao (OPEN, ON_TERMINAL, PROCESSING,
//           FINISHED, CANCELED). Usado como FALLBACK do webhook.
//
//   DELETE /point/integration-api/devices/{deviceId}/payment-intents/{intentId}
//        -> cancela a intencao pendente no device.
//
//   GET  /v1/payments/{paymentId}
//        -> dados do payment criado a partir da intent. Webhook do MP
//           manda topic=payment&id=<paymentId>; resolvemos para descobrir
//           external_reference e status (approved/rejected/cancelled).
//
// Todos retornam JSON. Lancamos MercadoPagoError com status e body em
// qualquer 4xx/5xx. Node 18+ tem fetch global — sem dependencia externa.

const BASE = "https://api.mercadopago.com";

export class MercadoPagoError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "MercadoPagoError";
    this.status = status;
    this.body = body;
  }
}

async function http(metodo, path, accessToken, body, headersExtra) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...(headersExtra || {}),
  };
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: metodo,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new MercadoPagoError(
      `Falha de rede ao chamar Mercado Pago: ${err.message}`,
      0, null,
    );
  }
  const texto = await res.text();
  let data = null;
  if (texto) {
    try { data = JSON.parse(texto); } catch { data = { raw: texto }; }
  }
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `MP ${res.status}`;
    throw new MercadoPagoError(msg, res.status, data);
  }
  return data;
}

// Envia a intencao de pagamento para a maquininha. amount em CENTAVOS.
// tipo: "CREDIT" | "DEBIT" | "PIX".
//
// X-Idempotency-Key recomendado pelo MP — usamos o id da nossa intencao
// (UUID gerado antes da chamada). Evita duplicidade em retries.
export async function criarPaymentIntent({
  accessToken,
  deviceId,
  amountCents,
  description,
  externalReference,
  tipo,
  idempotencyKey,
}) {
  let payment;
  if (tipo === "CREDIT") {
    // installments_cost: "seller" — o lojista absorve eventual custo de
    // parcelamento. Como nesta v1 todas as cobrancas sao "1x a vista",
    // nao ha juros de fato; precisa do campo so para satisfazer o schema
    // do MP. O valor "buyer" e recusado pela API com erro 400.
    payment = { installments: 1, type: "credit_card", installments_cost: "seller" };
  } else if (tipo === "DEBIT") {
    // Debito NAO tem parcelamento. Enviar `installments`/`installments_cost`
    // (campos exclusivos de credito) faz o MP inferir contexto credit_card e
    // recusar com 400 "payment.type does not match: credit_card" — mesmo com
    // a conta tendo debito habilitado. Por isso o payload de debito leva
    // apenas o type.
    payment = { type: "debit_card" };
  } else if (tipo === "PIX") {
    // PIX via Point Integration NAO e suportado por todos os devices.
    // Quando o device aceita, type "pix" exibe um QR Code dinamico no
    // display. Se nao aceitar, a API responde indicando os tipos validos.
    payment = { type: "pix" };
  } else {
    throw new MercadoPagoError(`Tipo de pagamento MP invalido: ${tipo}`, 400, null);
  }

  const body = {
    amount: Math.round(Number(amountCents)),
    description: String(description || "Venda").slice(0, 256),
    additional_info: { external_reference: String(externalReference) },
    payment,
  };

  return http(
    "POST",
    `/point/integration-api/devices/${encodeURIComponent(deviceId)}/payment-intents`,
    accessToken,
    body,
    idempotencyKey ? { "X-Idempotency-Key": String(idempotencyKey) } : {},
  );
}

// Lista os dispositivos Point vinculados a conta MP. Util para a UI de
// configuracao descobrir o DEVICE_ID exato (formato MODELO__SERIAL com
// dois underscores) — esse e o unico jeito 100% confiavel de obter o id,
// ja que o painel web do MP nao expoe ele montado dessa forma.
//
// Resposta tipica:
//   { devices: [{ id, operating_mode, store_id, ... }], paging: { ... } }
export async function listarDevices({ accessToken }) {
  return http(
    "GET",
    "/point/integration-api/devices",
    accessToken,
  );
}

export async function obterPaymentIntent({ accessToken, intentId }) {
  return http(
    "GET",
    `/point/integration-api/payment-intents/${encodeURIComponent(intentId)}`,
    accessToken,
  );
}

export async function cancelarPaymentIntent({ accessToken, deviceId, intentId }) {
  return http(
    "DELETE",
    `/point/integration-api/devices/${encodeURIComponent(deviceId)}/payment-intents/${encodeURIComponent(intentId)}`,
    accessToken,
  );
}

export async function obterPayment({ accessToken, paymentId }) {
  return http(
    "GET",
    `/v1/payments/${encodeURIComponent(paymentId)}`,
    accessToken,
  );
}

// Cria um pagamento PIX via /v1/payments. Diferente do Point Integration,
// o PIX nao vai para a maquininha — o MP retorna um QR Code dinamico que o
// PDV exibe na tela do operador. O cliente paga pelo app do banco; o webhook
// chega exatamente no mesmo endpoint dos cartoes.
//
// Campos retornados que importam para o PDV (em point_of_interaction):
//   - qr_code        — codigo EMV (copia e cola)
//   - qr_code_base64 — imagem PNG do QR Code em base64
//   - ticket_url     — URL alternativa do MP para abrir em outra tela
//
// payerEmail e obrigatorio no schema do MP. Quando o cliente da venda nao
// tem email, usamos um placeholder (o MP aceita endereco generico ja que
// PIX nao envia confirmacao para o pagador via email).
export async function criarPagamentoPix({
  accessToken,
  amountCents,
  description,
  externalReference,
  payerEmail,
  idempotencyKey,
}) {
  const body = {
    transaction_amount: Math.round(Number(amountCents)) / 100,
    description: String(description || "Venda").slice(0, 256),
    payment_method_id: "pix",
    external_reference: String(externalReference),
    payer: {
      // MP recusa TLDs nao-publicos (.local). Quando o cliente da venda nao
      // tem email cadastrado, usamos um placeholder com TLD .com.br valido.
      email: payerEmail || "cliente-pdv@gestaopro.com.br",
    },
  };
  return http(
    "POST",
    "/v1/payments",
    accessToken,
    body,
    idempotencyKey ? { "X-Idempotency-Key": String(idempotencyKey) } : {},
  );
}

// Cancela um pagamento PIX (status: cancelled). Usado quando o operador
// desiste antes do cliente pagar. Se ja aprovou no banco, a API responde
// 400 — tratamos como "ja finalizou" e deixamos o webhook fechar o ciclo.
export async function cancelarPagamento({ accessToken, paymentId }) {
  return http(
    "PUT",
    `/v1/payments/${encodeURIComponent(paymentId)}`,
    accessToken,
    { status: "cancelled" },
  );
}
