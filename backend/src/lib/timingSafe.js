import crypto from "node:crypto";

// Comparacao de strings resistente a timing-attack. Retorna false em
// qualquer entrada nao-string ou de tamanho diferente, sem vazar pelo
// tempo de comparacao. Usar para validar segredos (CRON_SECRET, secrets
// de webhook, etc) em vez de `===`.
export function compararSegredo(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
