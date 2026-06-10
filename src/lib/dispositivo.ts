// ============ FINGERPRINT DO DISPOSITIVO (LICENCA POR MAQUINA) ============
//
// Gera e persiste um identificador estavel para este navegador/computador. O
// backend usa esse id para contar quantas maquinas distintas acessam a conta e
// barrar acima do limite contratado (ver backend/src/lib/dispositivos.js).
//
// Estrategia de PERSISTENCIA REDUNDANTE (decisao de UX): guardamos o mesmo UUID
// em DOIS lugares — localStorage e um cookie de 10 anos. Uma "limpeza de
// historico" comum costuma zerar um sem o outro; ao ler, se um existe e o
// outro nao, regravamos os dois. So quando AMBOS somem e que um novo id e
// gerado (e o usuario pode precisar reautorizar a maquina). Isso evita o
// transtorno de o cliente "perder a vaga" a cada limpeza de cache.
//
// Privacidade: NAO fazemos fingerprinting por hardware/canvas. E apenas um UUID
// aleatorio anonimo — identifica a instalacao do navegador, nao a pessoa.

const STORAGE_KEY = "gestao_device_id";
const COOKIE_KEY = "gdid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 10; // 10 anos em segundos

function lerCookie(nome: string): string | null {
  try {
    const alvo = `${nome}=`;
    for (const parte of document.cookie.split(";")) {
      const p = parte.trim();
      if (p.startsWith(alvo)) return decodeURIComponent(p.slice(alvo.length));
    }
  } catch { /* document indisponivel (SSR) */ }
  return null;
}

function gravarCookie(nome: string, valor: string): void {
  try {
    // SameSite=Lax: enviado em navegacao normal; Secure quando em HTTPS (prod).
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${nome}=${encodeURIComponent(valor)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  } catch { /* ignore */ }
}

// Aceita apenas o formato que nos mesmos geramos (UUID), descartando lixo que
// possa ter sido injetado no storage/cookie por terceiros.
function valido(v: string | null): v is string {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function novoUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback p/ navegadores antigos sem crypto.randomUUID.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Memoiza para nao reprocessar storage/cookie em toda request.
let cache: string | null = null;

// Retorna o id estavel deste dispositivo, criando e persistindo se necessario.
export function getDeviceId(): string {
  if (cache) return cache;

  const doStorage = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
  const doCookie = lerCookie(COOKIE_KEY);

  let id = valido(doStorage) ? doStorage : valido(doCookie) ? doCookie : null;
  if (!id) id = novoUuid();

  // Reescreve em ambos os meios (auto-cura: se um foi limpo, o outro repopula).
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* modo privado/cota */ }
  gravarCookie(COOKIE_KEY, id);

  cache = id;
  return id;
}

// Nome amigavel da maquina, derivado do User-Agent ("Chrome · Windows"). E so
// um rotulo para o cliente/admin reconhecer o aparelho no painel.
export function getDeviceName(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

  let so = "Sistema";
  if (/Windows/i.test(ua)) so = "Windows";
  else if (/Android/i.test(ua)) so = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) so = "iOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) so = "macOS";
  else if (/Linux/i.test(ua)) so = "Linux";

  let navegador = "Navegador";
  if (/Edg\//i.test(ua)) navegador = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) navegador = "Opera";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) navegador = "Chrome";
  else if (/Firefox\//i.test(ua)) navegador = "Firefox";
  else if (/Safari\//i.test(ua)) navegador = "Safari";

  return `${navegador} · ${so}`;
}

// Header value: nome pode ter caracteres nao-ASCII (·) que quebram fetch — o
// header deve ser ISO-8859-1. Encodamos no front e decodamos no backend.
export function getDeviceNameHeader(): string {
  try { return encodeURIComponent(getDeviceName()); } catch { return ""; }
}
