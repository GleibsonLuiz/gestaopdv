import { useEffect, useState } from "react";
import { BASE_URL } from "./api";

// Monitora estado de conexao do navegador + saude da API. A api.ts dispara
// "api:falha" / "api:ok" em window quando uma request retorna NETWORK/TIMEOUT
// ou volta a responder com sucesso.
//
// Debounce: no PDV varias requests disparam juntas ao montar; uma falha
// isolada (cold start, endpoint opcional) nao deve manter a tarja laranja
// para sempre — so degradamos se a ultima atividade for falha apos janela.

export interface NetworkStatus {
  online: boolean;
  apiSaudavel: boolean;
  degradado: boolean;
}

const DEBOUNCE_SAUDE_MS = 2_000;
const HEALTH_POLL_MS = 45_000;
const HEALTH_TIMEOUT_MS = 8_000;

let ultimoApiOk = Date.now();
let ultimoApiFalha = 0;
let apiSaudavelGlobal = true;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function emitirSaude(saudavel: boolean) {
  if (saudavel === apiSaudavelGlobal) return;
  apiSaudavelGlobal = saudavel;
  window.dispatchEvent(new CustomEvent("api:saude", { detail: { saudavel } }));
}

function recalcularSaudeApi() {
  // Ultimo evento vence: se houve sucesso depois da ultima falha, API ok.
  const saudavel = ultimoApiOk >= ultimoApiFalha;
  emitirSaude(saudavel);
}

function agendarRecalculo() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    recalcularSaudeApi();
  }, DEBOUNCE_SAUDE_MS);
}

window.addEventListener("api:ok", () => {
  ultimoApiOk = Date.now();
  agendarRecalculo();
});

window.addEventListener("api:falha", () => {
  ultimoApiFalha = Date.now();
  agendarRecalculo();
});

async function pingHealth(): Promise<void> {
  if (!navigator.onLine) return;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/health`, { method: "GET", signal: ac.signal });
    if (res.ok) {
      ultimoApiOk = Date.now();
      agendarRecalculo();
    }
  } catch {
    // Falha no /health nao dispara tarja sozinha — evita falso positivo se o
    // backend estiver aquecendo mas rotas autenticadas ja respondem.
  } finally {
    clearTimeout(timer);
  }
}

export function useNetworkStatus(): NetworkStatus {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [apiSaudavel, setApiSaudavel] = useState<boolean>(() => apiSaudavelGlobal);

  useEffect(() => {
    function onOn() { setOnline(true); }
    function onOff() { setOnline(false); }
    function onSaude(e: Event) {
      const detail = (e as CustomEvent).detail;
      setApiSaudavel(!!detail?.saudavel);
    }
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    window.addEventListener("api:saude", onSaude);

    recalcularSaudeApi();
    void pingHealth();
    const poll = setInterval(() => void pingHealth(), HEALTH_POLL_MS);

    return () => {
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
      window.removeEventListener("api:saude", onSaude);
      clearInterval(poll);
    };
  }, []);

  return {
    online,
    apiSaudavel,
    degradado: !online || !apiSaudavel,
  };
}
