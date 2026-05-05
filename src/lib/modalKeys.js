import { useEffect } from "react";

// Hook universal de atalhos para modais.
//   Esc                fecha o modal (chama onClose)
//   Enter              confirma quando permitirEnter=true e o foco NAO esta
//                      em <textarea>/<button> (botoes ja tem seu onClick)
//   Ctrl+Enter / Cmd+Enter  confirma mesmo dentro de <textarea> quando
//                           permitirCtrlEnter=true
//
// Use capture=true no listener para preceder atalhos globais (ex: F10 do
// PDV) e evitar conflitos quando o modal estiver aberto.
export function useModalKeys(aberto, { onClose, onConfirm, permitirEnter = false, permitirCtrlEnter = false } = {}) {
  useEffect(() => {
    if (!aberto) return;
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key === "Enter") {
        const alvo = e.target;
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
