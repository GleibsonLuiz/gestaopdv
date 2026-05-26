// Preferencias de UI per-browser (localStorage). Diferente de aparencia
// (tema), essas flags nao sincronizam com o backend — sao escolhas do
// dispositivo, nao do usuario.
//
// Hoje:
//   - avisosRede: liga/desliga a tarja superior + toasts automaticos de
//     "sem conexao / servidor instavel" disparados pelo api.ts. Erros 4xx
//     continuam aparecendo por try/catch das telas.

const KEY_AVISOS_REDE = "gp:prefs:avisosRede";
const EVENTO_AVISOS_REDE = "gp:prefs:avisosRede:changed";

export function getAvisosRedeAtivos(): boolean {
  try {
    const v = localStorage.getItem(KEY_AVISOS_REDE);
    if (v === null) return true; // default ligado
    return v === "1";
  } catch {
    return true;
  }
}

export function setAvisosRedeAtivos(ativo: boolean): void {
  try { localStorage.setItem(KEY_AVISOS_REDE, ativo ? "1" : "0"); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(EVENTO_AVISOS_REDE, { detail: ativo })); } catch { /* ignore */ }
}

export function ouvirAvisosRede(handler: (ativo: boolean) => void): () => void {
  function fn(e: Event) { handler(!!(e as CustomEvent).detail); }
  window.addEventListener(EVENTO_AVISOS_REDE, fn);
  return () => window.removeEventListener(EVENTO_AVISOS_REDE, fn);
}
