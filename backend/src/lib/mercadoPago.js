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
    // Debito via Point API exige habilitacao da conta MP (alguns sellers tem
    // so credit habilitado por default — precisa pedir ativacao no suporte
    // MP). Se a conta nao tiver, a API responde 400 com mensagem confusa
    // tipo "payment.type does not match credit_card".
    payment = { installments: 1, type: "debit_card", installments_cost: "seller" };
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
