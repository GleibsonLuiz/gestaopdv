import crypto from "node:crypto";

// ============ CRIPTOGRAFIA DE CREDENCIAIS SENSIVEIS ============
//
// AES-256-GCM com IV unico por valor cifrado + tag de autenticacao.
// Usado para guardar ACCESS_TOKEN do Mercado Pago no banco — qualquer
// segredo de integracao externa que precise sair do servidor deve passar
// por aqui.
//
// CRIPTO_SECRET: chave de 32 bytes em hex (64 caracteres) no .env.
//   Geracao: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// Formato armazenado: "<iv_hex>:<tag_hex>:<ciphertext_hex>" — 3 hex strings
// separadas por dois pontos. Auto-contido, sem dependencia de delimitador
// proprietario.

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey() {
  const raw = process.env.CRIPTO_SECRET;
  if (!raw) {
    throw new Error(
      "CRIPTO_SECRET nao definido. Defina no .env como 32 bytes em hex (64 chars). " +
      "Gerar com: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) {
    throw new Error(`CRIPTO_SECRET deve ter 32 bytes (64 hex chars). Recebido: ${buf.length} bytes.`);
  }
  return buf;
}

export function cifrar(textoClaro) {
  if (textoClaro === null || textoClaro === undefined || textoClaro === "") return null;
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(textoClaro), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decifrar(blob) {
  if (!blob) return null;
  const partes = String(blob).split(":");
  if (partes.length !== 3) {
    throw new Error("Formato cifrado invalido");
  }
  const [ivHex, tagHex, encHex] = partes;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Formato cifrado invalido");
  }
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// Mascara para retornar em GETs de configuracao: "APP_USR-***1234".
// Preserva o prefixo (uteis pra usuario reconhecer ambiente) e os ultimos 4.
export function mascarar(valor) {
  if (!valor) return null;
  const s = String(valor);
  if (s.length <= 8) return "•".repeat(s.length);
  const prefixo = s.slice(0, 8);
  const sufixo = s.slice(-4);
  return `${prefixo}…${sufixo}`;
}
