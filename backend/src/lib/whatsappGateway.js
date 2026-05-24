// =====================================================================
// ETAPA#9b — Cliente HTTP para gateway externo de WhatsApp.
//
// Suporta Evolution API (padrao mais comum no Brasil) — outros gateways
// (Z-API, Wuzapi, Twilio) podem ser adicionados depois com adapters.
//
// Convencoes:
//   - URL base vem de env EVOLUTION_BASE_URL (ex: https://evo.minha.com)
//     ou de WhatsappSettings.instanceToken se carregar a URL no banco.
//   - Token: WhatsappSettings.instanceToken (header `apikey`).
//   - Numero: formato E.164 SEM +, ex: "5511999998888".
// =====================================================================

const BASE = process.env.EVOLUTION_BASE_URL || "https://evolution.api"; // override em produc

export class WhatsappGatewayError extends Error {
  constructor(msg, { status, body } = {}) {
    super(msg);
    this.name = "WhatsappGatewayError";
    this.status = status;
    this.body = body;
  }
}

async function chamarEvolution(path, { method = "POST", body, instanceName, token }) {
  const url = `${BASE.replace(/\/$/, "")}/${path}/${encodeURIComponent(instanceName)}`;
  const r = await fetch(url, {
    method,
    headers: {
      "apikey": token,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new WhatsappGatewayError(`Evolution ${r.status}: ${txt.slice(0, 200)}`, { status: r.status, body: txt });
  }
  return r.json().catch(() => ({}));
}

/** Envia mensagem de texto para um numero. */
export async function enviarTexto({ instanceName, token, numero, texto }) {
  if (!instanceName || !token) throw new WhatsappGatewayError("instanceName e token sao obrigatorios");
  return chamarEvolution("message/sendText", {
    instanceName, token,
    body: {
      number: numero,
      text: texto,
    },
  });
}

/** Gera/obtem QR Code da instancia (para conexao inicial). */
export async function obterQrCode({ instanceName, token }) {
  return chamarEvolution("instance/connect", {
    method: "GET", instanceName, token,
  });
}

/** Consulta status atual da instancia (CONNECTED, DISCONNECTED, etc). */
export async function obterStatus({ instanceName, token }) {
  return chamarEvolution("instance/connectionState", {
    method: "GET", instanceName, token,
  });
}
