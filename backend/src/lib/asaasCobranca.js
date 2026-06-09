// ============ ADAPTER: ASAAS — COBRANCA DO LOJISTA AO CLIENTE FINAL ============
//
// Boleto hibrido (boleto + PIX) emitido pelo LOJISTA para cobrar o CLIENTE
// FINAL. O dinheiro cai na conta Asaas DO LOJISTA — por isso a credencial e
// POR-TENANT (apiKey + ambiente vem como ARGUMENTO, decifrada de
// ConfiguracaoEmpresa.asaasApiKeyEnc no controller). NUNCA usa env vars de
// credencial: lib/billing/asaas.js e que cobra a PLATAFORMA com a NOSSA conta.
//
// Mesmo principio do lib/mercadoPago.js (gateway das vendas do lojista):
// modulo puro, sem Prisma, sem env de credencial — so fala HTTP com o Asaas.
//
// Node 18+ tem fetch global — sem dependencia externa.

export class AsaasError extends Error {
  constructor(message, { status = null, code = null, campo = null, detalhe = null } = {}) {
    super(message);
    this.name = "AsaasError";
    this.httpStatus = status; // status HTTP do Asaas (p/ diagnostico)
    this.code = code;         // codigo do erro Asaas (ex: "invalid_cpfCnpj")
    this.campo = campo;       // campo culpado, quando o Asaas informa
    this.detalhe = detalhe;   // corpo cru do erro (logs) — nunca exposto ao cliente
  }
}

function baseUrl(ambiente) {
  return String(ambiente || "sandbox").toLowerCase() === "producao"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

// Chamada HTTP autenticada com a apiKey DO TENANT (header access_token).
async function http({ apiKey, ambiente, metodo, path, body }) {
  if (!apiKey) {
    throw new AsaasError("Credencial Asaas nao configurada para esta empresa.", { status: 412 });
  }
  let res;
  try {
    res = await fetch(`${baseUrl(ambiente)}${path}`, {
      method: metodo,
      headers: {
        access_token: apiKey,
        "Content-Type": "application/json",
        "User-Agent": "GestaoPDV/1.0",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new AsaasError(`Falha de rede ao chamar o Asaas: ${err.message}`, { status: 0 });
  }

  const texto = await res.text();
  let data = null;
  if (texto) {
    try { data = JSON.parse(texto); } catch { data = { raw: texto }; }
  }

  if (!res.ok) {
    // Asaas retorna { errors: [{ code, description }] }. Propagamos o 1o erro
    // com o campo deduzido do code (ex: invalid_cpfCnpj -> campo cpfCnpj),
    // para o controller devolver mensagem acionavel ao operador.
    const err0 = data?.errors?.[0] || {};
    const msg = err0.description || `Asaas respondeu ${res.status}`;
    throw new AsaasError(msg, {
      status: res.status,
      code: err0.code || null,
      campo: deduzirCampo(err0.code),
      detalhe: data,
    });
  }
  return data;
}

// Mapeia codes comuns do Asaas para o nome do campo no nosso cadastro de
// cliente, para a UI destacar onde corrigir.
function deduzirCampo(code) {
  switch (String(code || "")) {
    case "invalid_cpfCnpj": return "cpfCnpj";
    case "invalid_postalCode": return "cep";
    case "invalid_email": return "email";
    case "invalid_name": return "nome";
    default: return null;
  }
}

// Status do payment do Asaas -> nosso enum StatusBoleto.
export function mapStatusBoleto(asaasStatus) {
  switch (String(asaasStatus || "").toUpperCase()) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return "PAGO";
    case "OVERDUE":
      return "VENCIDO";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "DELETED":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
      return "CANCELADO";
    default:
      return "PENDENTE"; // PENDING, AWAITING_RISK_ANALYSIS, etc.
  }
}

function isoDia(d) {
  return new Date(d).toISOString().slice(0, 10); // Asaas espera YYYY-MM-DD
}

// ---- Customer ----------------------------------------------------------

// Cria (ou reusa) o customer no Asaas. Reuso: o controller passa
// asaasCustomerId quando ja temos um para este cliente. externalReference =
// id do nosso Cliente, p/ rastrear e dedupe futuro.
export async function garantirCliente({ apiKey, ambiente, cliente, asaasCustomerId }) {
  if (asaasCustomerId) return asaasCustomerId;

  const doc = String(cliente?.cpfCnpj || "").replace(/\D/g, "");
  const body = {
    name: cliente?.nome || "Cliente",
    cpfCnpj: doc || undefined,
    email: cliente?.email || undefined,
    phone: cliente?.telefone ? String(cliente.telefone).replace(/\D/g, "") : undefined,
    postalCode: cliente?.cep ? String(cliente.cep).replace(/\D/g, "") : undefined,
    address: cliente?.endereco || undefined,
    province: cliente?.bairro || undefined,
    city: cliente?.cidade || undefined,
    state: cliente?.estado || undefined,
    externalReference: cliente?.id || undefined,
  };
  const criado = await http({ apiKey, ambiente, metodo: "POST", path: "/customers", body });
  return criado.id;
}

// ---- Cobranca (boleto hibrido) -----------------------------------------

// Cria a cobranca billingType BOLETO (no Asaas o boleto ja aceita pagamento
// via PIX — boleto hibrido). Depois enriquece com a linha digitavel e o PIX
// copia-e-cola. Retorna o objeto normalizado que o controller persiste.
//
// fine/interest: multa e juros por atraso (% — opcional). NAO confundir com a
// taxa de emissao repassada ao consumidor, que ja vem embutida em `valor`.
export async function criarBoleto({
  apiKey, ambiente, customerId, valor, vencimento,
  descricao, externalReference, multaPercent, jurosPercent,
}) {
  const body = {
    customer: customerId,
    billingType: "BOLETO",
    value: Number(valor),
    dueDate: isoDia(vencimento),
    description: descricao || undefined,
    externalReference: externalReference || undefined,
  };
  if (multaPercent > 0) body.fine = { value: Number(multaPercent) };
  if (jurosPercent > 0) body.interest = { value: Number(jurosPercent) };

  const pagamento = await http({ apiKey, ambiente, metodo: "POST", path: "/payments", body });

  // Linha digitavel + codigo de barras (endpoint dedicado do boleto).
  let linhaDigitavel = null;
  let codigoBarras = null;
  try {
    const ident = await http({
      apiKey, ambiente, metodo: "GET",
      path: `/payments/${pagamento.id}/identificationField`,
    });
    linhaDigitavel = ident?.identificationField || null;
    codigoBarras = ident?.barCode || null;
  } catch {
    // Boleto recem-criado as vezes ainda nao tem a linha pronta; o status/
    // consulta posterior preenche. Nao e fatal para a emissao.
  }

  // PIX copia-e-cola + QR (o boleto hibrido aceita PIX).
  let pixCopiaECola = null;
  let pixQrCodeBase64 = null;
  try {
    const pix = await http({
      apiKey, ambiente, metodo: "GET",
      path: `/payments/${pagamento.id}/pixQrCode`,
    });
    pixCopiaECola = pix?.payload || null;
    pixQrCodeBase64 = pix?.encodedImage || null;
  } catch {
    // Conta sem chave PIX cadastrada no Asaas: segue so com boleto.
  }

  return {
    asaasPaymentId: pagamento.id,
    status: mapStatusBoleto(pagamento.status),
    urlBoleto: pagamento.bankSlipUrl || pagamento.invoiceUrl || null,
    linhaDigitavel,
    codigoBarras,
    pixCopiaECola,
    pixQrCodeBase64,
    raw: pagamento,
  };
}

// Consulta o estado atual de um payment (usado pelo fallback de polling e pela
// reconfirmacao do webhook — defesa em profundidade: nunca confiamos so no body).
export async function obterBoleto({ apiKey, ambiente, asaasPaymentId }) {
  const pg = await http({
    apiKey, ambiente, metodo: "GET", path: `/payments/${asaasPaymentId}`,
  });
  return {
    asaasPaymentId: pg.id,
    status: mapStatusBoleto(pg.status),
    statusAsaas: pg.status,
    pagoEm: pg.paymentDate || pg.clientPaymentDate || null,
    valor: pg.value != null ? Number(pg.value) : null,
    urlBoleto: pg.bankSlipUrl || pg.invoiceUrl || null,
    raw: pg,
  };
}

// Cancela (deleta) a cobranca no Asaas. So funciona se ainda nao foi paga.
export async function cancelarBoleto({ apiKey, ambiente, asaasPaymentId }) {
  await http({ apiKey, ambiente, metodo: "DELETE", path: `/payments/${asaasPaymentId}` });
  return { ok: true };
}

// Traduz o body do webhook do Asaas para o contrato que o controller processa.
// Retorna null para eventos que nao alteram o estado do boleto.
export function interpretarWebhook({ body }) {
  const evento = body?.event;
  const pg = body?.payment;
  if (!evento || !pg) return null;

  const relevantes = new Set([
    "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_RECEIVED_IN_CASH",
    "PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_REFUNDED",
    "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_RESTORED",
  ]);
  if (!relevantes.has(evento)) return null;

  return {
    evento,
    asaasPaymentId: pg.id || null,
    status: mapStatusBoleto(pg.status),
    pagoEm: pg.paymentDate || pg.clientPaymentDate || null,
    valor: pg.value != null ? Number(pg.value) : null,
  };
}
