// otplib v12 (CJS): import default + destructure — a deteccao de named
// exports do Node falha nos re-exports internos do pacote.
import otplib from "otplib";
import QRCode from "qrcode";
import { cifrar, decifrar } from "./cripto.js";

const { authenticator } = otplib;

// ============ 2FA TOTP (RFC 6238) ============
//
// Verificacao em duas etapas com app autenticador (Google Authenticator,
// Authy, Microsoft Authenticator...). O segredo base32 e gerado no setup,
// guardado CIFRADO (AES-256-GCM via lib/cripto.js) em User.totpSecret e o
// gate do login so passa a valer quando o usuario PROVA um codigo valido
// (User.totpAtivo) — nunca ha lockout por QR exibido e nao escaneado.

// window:1 = aceita o codigo do step anterior/seguinte (30s cada) para
// tolerar relogio do celular fora de sincronia.
authenticator.options = { window: 1 };

export function gerarSegredoTotp() {
  return authenticator.generateSecret(); // base32, 16 chars
}

export function cifrarSegredo(secret) {
  return cifrar(secret);
}

export function verificarCodigoTotp(segredoCifrado, codigo) {
  if (!segredoCifrado || !/^\d{6}$/.test(String(codigo || "").trim())) return false;
  try {
    const secret = decifrar(segredoCifrado);
    return authenticator.check(String(codigo).trim(), secret);
  } catch {
    return false; // blob corrompido / CRIPTO_SECRET trocado — nega, nao crasha
  }
}

// otpauth:// que o app autenticador entende. Rotulo: "GestaoProMax (email)".
export function urlOtpauth(email, secret) {
  return authenticator.keyuri(email, "GestaoProMax", secret);
}

// SVG do QR gerado no servidor — o front so injeta a string, sem lib nova.
export async function qrCodeSvg(texto) {
  return QRCode.toString(texto, { type: "svg", margin: 1, width: 220 });
}
