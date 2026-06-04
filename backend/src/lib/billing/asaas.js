// ============ ADAPTER: ASAAS (gateway de cobranca recorrente) ============
//
// Cobranca recorrente da assinatura do SaaS via Asaas (PIX/boleto/cartao).
// Escolhido para o publico SMB brasileiro: recorrencia nativa, taxa baixa,
// "fatura unica" (billingType UNDEFINED) deixa o cliente escolher como pagar.
//
// Credenciais da PLATAFORMA (uma conta cobra todos os tenants):
//   ASAAS_API_KEY        - chave de API (header access_token)
//   ASAAS_AMBIENTE       - "producao" | "sandbox" (default sandbox)
//   ASAAS_WEBHOOK_TOKEN  - token que validamos no header asaas-access-token
//                          dos webhooks (configurado no painel do Asaas)
//
// Node 18+ tem fetch global — sem dependencia externa (igual lib/mercadoPago).

import { ErroCobranca } from "./provedor.js";
import { compararSegredo } from "../timingSafe.js";

function baseUrl() {
  const amb = String(process.env.ASAAS_AMBIENTE || "sandbox").toLowerCase();
  return amb === "producao"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

async function http(metodo, path, body) {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) {
    throw new ErroCobranca("ASAAS_API_KEY nao configurada no servidor.");
  }
  let res;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method: metodo,
      headers: {
        access_token: apiKey,
        "Content-Type": "application/json",
        // Asaas exige User-Agent identificavel em producao.
        "User-Agent": "GestaoPDV/1.0",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ErroCobranca(`Falha de rede ao chamar Asaas: ${err.message}`, { status: 0 });
  }
  const texto = await res.text();
  let data = null;
  if (texto) {
    try { data = JSON.parse(texto); } catch { data = { raw: texto }; }
  }
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || `Asaas ${res.status}`;
    throw new ErroCobranca(msg, { status: res.status, detalhe: data });
  }
  return data;
}

// Mapeia o status de payment do Asaas para o nosso enum StatusCobranca.
function mapStatusCobranca(asaasStatus) {
  switch (String(asaasStatus || "").toUpperCase()) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return "PAGA";
    case "OVERDUE":
      return "VENCIDA";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "DELETED":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
      return "CANCELADA";
    default:
      return "PENDENTE"; // PENDING, AWAITING_RISK_ANALYSIS, etc.
  }
}

function mapMetodo(billingType) {
  switch (String(billingType || "").toUpperCase()) {
    case "PIX": return "PIX";
    case "BOLETO": return "BOLETO";
    case "CREDIT_CARD": return "CARTAO";
    default: return null;
  }
}

function isoDia(d) {
  // Asaas espera datas YYYY-MM-DD.
  return new Date(d).toISOString().slice(0, 10);
}

// Cria (ou reusa) customer + subscription mensal. Retorna o contrato
// normalizado de provedor.js. A primeira cobranca volta PENDENTE com o
// invoiceUrl para o cliente pagar — a ativacao ocorre no webhook.
export async function criarAssinatura({ empresa, plano, valorMensal, emailCobranca }) {
  // 1. Customer — reusa se a empresa ja tiver um id salvo.
  let clienteId = empresa?.gatewayClienteId || null;
  if (!clienteId) {
    const cliente = await http("POST", "/customers", {
      name: empresa?.nome || "Cliente",
      cpfCnpj: empresa?.cnpj || undefined,
      email: emailCobranca || undefined,
      externalReference: empresa?.id,
    });
    clienteId = cliente.id;
  }

  // 2. Subscription mensal. billingType UNDEFINED => cliente escolhe PIX/boleto/cartao.
  const nextDueDate = isoDia(Date.now() + 3 * 86400000); // 3 dias p/ pagar a 1a
  const assinatura = await http("POST", "/subscriptions", {
    customer: clienteId,
    billingType: "UNDEFINED",
    value: Number(valorMensal),
    nextDueDate,
    cycle: "MONTHLY",
    description: `Assinatura ${plano} — Gestao PDV`,
    externalReference: empresa?.id,
  });

  // 3. Busca a primeira cobranca gerada (para devolver o link de pagamento).
  let primeira = null;
  try {
    const pagamentos = await http("GET", `/subscriptions/${assinatura.id}/payments`);
    primeira = pagamentos?.data?.[0] || null;
  } catch {
    // Se a listagem falhar, seguimos sem o link — o webhook ainda resolve.
  }

  return {
    provedor: "asaas",
    clienteId,
    assinaturaId: assinatura.id,
    proximaCobrancaEm: assinatura.nextDueDate ? new Date(assinatura.nextDueDate) : new Date(nextDueDate),
    primeiraCobranca: primeira ? {
      gatewayCobrancaId: primeira.id,
      status: mapStatusCobranca(primeira.status),
      valor: Number(primeira.value),
      vencimento: primeira.dueDate ? new Date(primeira.dueDate) : null,
      pagoEm: primeira.paymentDate ? new Date(primeira.paymentDate) : null,
      metodo: mapMetodo(primeira.billingType),
      linkPagamento: primeira.invoiceUrl || null,
      descricao: `Assinatura ${plano}`,
    } : null,
  };
}

export async function cancelarAssinatura({ assinaturaId }) {
  if (!assinaturaId) return { ok: false };
  await http("DELETE", `/subscriptions/${assinaturaId}`);
  return { ok: true };
}

// Valida o webhook ANTES de processar. Asaas envia o token configurado no
// painel no header `asaas-access-token`. Comparacao timing-safe.
export function verificarAssinaturaWebhook({ headers }) {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado) return false; // sem token configurado, recusa por seguranca
  // O Node sempre entrega os nomes de header em minusculo.
  const recebido = headers?.["asaas-access-token"] || "";
  return compararSegredo(String(recebido), String(esperado));
}

// Traduz o body do webhook para o contrato normalizado. Retorna null para
// eventos que nao alteram o estado da assinatura.
export function interpretarWebhook({ body }) {
  const evento = body?.event;
  const pg = body?.payment;
  if (!evento || !pg) return null;

  // So nos interessam eventos de pagamento de uma subscription.
  const eventosRelevantes = new Set([
    "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_RECEIVED_IN_CASH",
    "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED",
    "PAYMENT_CHARGEBACK_REQUESTED",
  ]);
  if (!eventosRelevantes.has(evento)) return null;

  return {
    evento,
    assinaturaId: pg.subscription || null,
    cobrancaId: pg.id || null,
    valor: pg.value != null ? Number(pg.value) : null,
    status: mapStatusCobranca(pg.status),
    pagoEm: pg.paymentDate ? new Date(pg.paymentDate) : null,
    vencimento: pg.dueDate ? new Date(pg.dueDate) : null,
    metodo: mapMetodo(pg.billingType),
    linkPagamento: pg.invoiceUrl || null,
  };
}
