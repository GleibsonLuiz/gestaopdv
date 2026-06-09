// =====================================================================
// ETAPA#8a — Comandos ESC/POS para impressoras termicas.
//
// ESC/POS e o protocolo de comandos da Epson, adotado por ~95% das
// impressoras termicas (Bematech, Elgin, Daruma, Tanca, etc). Este
// helper monta o stream binario que vai para a impressora via:
//   - Web Bluetooth (impressora portatil/balcao com BT)
//   - Web USB (futuro)
//   - Backend (relay TCP para impressora de rede, futuro)
//
// Para impressao "visual" (cupom renderizado em HTML), continuamos
// usando window.print() + CupomEnvelope/CupomVenda — esse arquivo e
// usado SO no caminho ESC/POS direto.
// =====================================================================

const enc = new TextEncoder();

function bytes(...arr: number[]): Uint8Array {
  return new Uint8Array(arr);
}

// Concatena multiplos Uint8Array em um so.
export function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// As POS80 genericas (ESC/POS) usam CP1252 (Windows-1252) como tabela
// padrao apos ESC @ — confirmado em campo na SMX-FJ80H (byte 0x80 saiu
// como "€" e 0xC7 como "Ç", assinatura inequivoca do CP1252).
//
// No CP1252 a faixa 0xA0-0xFF e IDENTICA ao Latin-1/Unicode, entao todo
// caractere com codePoint <= 0xFF (incluindo os acentos PT-BR) sai como
// o proprio byte. So precisamos tratar:
//   - a faixa especial 0x80-0x9F do CP1252 (€, aspas curvas, travessao…)
//   - os varios "espacos" Unicode — em especial o NBSP (U+00A0) e o
//     narrow no-break space (U+202F) que o Intl.NumberFormat insere
//     entre "R$" e o valor — que viravam "?" e quebravam o "R$ 25,00".
const ESPACOS_UNICODE = new Set<number>([
  0x00A0, 0x2002, 0x2003, 0x2007, 0x2009, 0x200A, 0x202F,
]);

const CP1252_ESPECIAIS: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85,
  "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8A,
  "‹": 0x8B, "Œ": 0x8C, "Ž": 0x8E, "‘": 0x91, "’": 0x92,
  "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9A, "›": 0x9B, "œ": 0x9C,
  "ž": 0x9E, "Ÿ": 0x9F,
};

export function codificarTexto(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) { out.push(cp); continue; }                 // ASCII puro
    if (ESPACOS_UNICODE.has(cp)) { out.push(0x20); continue; } // espacos -> ' '
    const esp = CP1252_ESPECIAIS[ch];
    if (esp !== undefined) { out.push(esp); continue; }        // 0x80-0x9F do CP1252
    if (cp <= 0xFF) { out.push(cp); continue; }                // Latin-1 == CP1252 (acentos)
    out.push(0x3F);                                            // desconhecido -> "?"
  }
  return new Uint8Array(out);
}

// ============ COMANDOS ============

export const ESC = 0x1B;
export const GS = 0x1D;
export const LF = 0x0A;

/** Reset da impressora (limpa formatacao, modo, alinhamento). */
export const init = (): Uint8Array => bytes(ESC, 0x40);

/** Quebra de linha. */
export const newLine = (n = 1): Uint8Array => bytes(...Array(n).fill(LF));

/** Negrito on/off. */
export const bold = (on: boolean): Uint8Array => bytes(ESC, 0x45, on ? 1 : 0);

/** Alinhamento: 0 esq, 1 centro, 2 dir. */
export const align = (a: 0 | 1 | 2): Uint8Array => bytes(ESC, 0x61, a);

/** Tamanho da fonte: width 1-8, height 1-8 (default 1,1). */
export function fontSize(w = 1, h = 1): Uint8Array {
  const ww = Math.max(1, Math.min(8, w)) - 1;
  const hh = Math.max(1, Math.min(8, h)) - 1;
  return bytes(GS, 0x21, (ww << 4) | hh);
}

/** Sublinhado on/off. */
export const underline = (on: boolean): Uint8Array => bytes(ESC, 0x2D, on ? 1 : 0);

/** Corte total do papel (impressora com guilhotina). */
export const cut = (): Uint8Array => bytes(GS, 0x56, 0x00);

/** Abre gaveta de dinheiro (pulso pin 2, 50ms/250ms). */
export const abrirGaveta = (): Uint8Array => bytes(ESC, 0x70, 0, 50, 250);

/** Linha de texto + quebra. Aceita acentos via MAPA_LATINO. */
export function texto(s: string): Uint8Array {
  return codificarTexto(s);
}
export function linha(s: string): Uint8Array {
  return concat([codificarTexto(s), newLine()]);
}

/** Linha divisoria de tamanho fixo (= ou - ou .). */
export function divisor(largura = 32, char = "-"): Uint8Array {
  return linha(char.repeat(largura));
}

/** QR Code (Model 2). modulo 1-16 (default 6); nivel L/M/Q/H (default M). */
export function qrCode(data: string, modulo = 6, nivel: "L" | "M" | "Q" | "H" = "M"): Uint8Array {
  const niveis: Record<string, number> = { L: 48, M: 49, Q: 50, H: 51 };
  const dados = enc.encode(data);
  const len = dados.length + 3;
  const pL = len & 0xFF;
  const pH = (len >> 8) & 0xFF;
  return concat([
    // GS ( k <Function 165> select QR model 2
    bytes(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00),
    // GS ( k <Function 167> set module size
    bytes(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, modulo),
    // GS ( k <Function 169> set error correction
    bytes(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, niveis[nivel]),
    // GS ( k <Function 080> store QR data
    bytes(GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30),
    dados,
    // GS ( k <Function 081> print QR
    bytes(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30),
  ]);
}

/**
 * Helper para formatar uma "linha cupom" com texto a esquerda e
 * valor a direita, com pontilhado no meio (estilo nota fiscal).
 * Largura em caracteres conforme a impressora (58mm ≈ 32, 80mm ≈ 48).
 */
export function linhaDireita(esq: string, dir: string, largura = 32): Uint8Array {
  const total = esq.length + dir.length;
  if (total >= largura) return linha(esq + " " + dir);
  const espacos = largura - total;
  return linha(esq + " ".repeat(espacos) + dir);
}
