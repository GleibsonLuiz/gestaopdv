import { useEffect, useState } from "react";

// Monitora estado de conexao do navegador + saude da API. A api.ts dispara
// "api:falha" / "api:ok" em window quando uma request retorna NETWORK/TIMEOUT
// ou volta a responder com sucesso. Esse hook escuta ambos os sinais para
// inferir "apiSaudavel" (ultimo heartbeat OK ha menos de 30s).
//
// Use em componentes que precisam bloquear acoes criticas (ex: finalizar
// venda) quando offline ou backend caido.

export interface NetworkStatus {
  online: boolean;
  apiSaudavel: boolean;
  // Convenience: true se algo esta fora (browser offline OU api fora).
  degradado: boolean;
}

const JANELA_API_OK_MS = 30_000;

let ultimoApiOk = Date.now();
let apiSaudavelGlobal = true;

window.addEventListener("api:ok", () => {
  ultimoApiOk = Date.now();
  if (!apiSaudavelGlobal) {
    apiSaudavelGlobal = true;
    window.dispatchEvent(new CustomEvent("api:saude", { detail: { saudavel: true } }));
  }
});

window.addEventListener("api:falha", () => {
  apiSaudavelGlobal = false;
  window.dispatchEvent(new CustomEvent("api:saude", { detail: { saudavel: false } }));
});

export function useNetworkStatus(): NetworkStatus {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [apiSaudavel, setApiSaudavel] = useState<boolean>(() => {
    if (!apiSaudavelGlobal) return false;
    return Date.now() - ultimoApiOk < JANELA_API_OK_MS;
  });

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
    return () => {
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
      window.removeEventListener("api:saude", onSaude);
    };
  }, []);

  return {
    online,
    apiSaudavel,
    degradado: !online || !apiSaudavel,
  };
}
