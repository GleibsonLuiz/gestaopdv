import { useEffect } from "react";

export interface UseModalKeysOptions {
  onClose?: () => void;
  onConfirm?: () => void;
  permitirEnter?: boolean;
  permitirCtrlEnter?: boolean;
}

// Hook universal de atalhos para modais.
//   Esc                fecha o modal (chama onClose)
//   Enter              confirma quando permitirEnter=true e o foco NAO esta
//                      em <textarea>/<button> (botoes ja tem seu onClick)
//   Ctrl+Enter / Cmd+Enter  confirma mesmo dentro de <textarea> quando
//                           permitirCtrlEnter=true
//
// Use capture=true no listener para preceder atalhos globais (ex: F10 do
// PDV) e evitar conflitos quando o modal estiver aberto.
export function useModalKeys(
  aberto: boolean,
  { onClose, onConfirm, permitirEnter = false, permitirCtrlEnter = false }: UseModalKeysOptions = {},
): void {
  useEffect(() => {
    if (!aberto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key === "Enter") {
        const alvo = e.target as HTMLElement | null;
        const tag = alvo?.tagName;
        if (tag === "BUTTON") return;
        if (tag === "TEXTAREA") {
          if (permitirCtrlEnter && (e.ctrlKey || e.metaKey)) {
            e.preventDefault(); onConfirm?.();
          }
          return;
        }
        if (permitirEnter && onConfirm) {
          e.preventDefault(); onConfirm();
        }
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [aberto, onClose, onConfirm, permitirEnter, permitirCtrlEnter]);
}
