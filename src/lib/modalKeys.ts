import { useEffect } from "react";

export interface UseModalKeysOptions {
  onClose?: () => void;
  onConfirm?: () => void;
  permitirEnter?: boolean;
  permitirCtrlEnter?: boolean;
}

// Elementos focaveis para o focus-trap (Fase 7 — a11y).
const FOCO_SELETOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

// Container do modal ATIVO (o de cima, em modais empilhados): ultimo elemento
// visivel que pareca um dialogo. Cobre a familia .pdv-modal e qualquer shell
// com role="dialog" (ModalShell do Caixa etc.) sem exigir refs nos chamadores.
function containerModalAtivo(): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>('.pdv-modal, [role="dialog"]');
  for (let i = els.length - 1; i >= 0; i--) {
    if (els[i].getClientRects().length > 0) return els[i];
  }
  return null;
}

// Hook universal de atalhos para modais.
//   Esc                fecha o modal (chama onClose)
//   Enter              confirma quando permitirEnter=true e o foco NAO esta
//                      em <textarea>/<button> (botoes ja tem seu onClick)
//   Ctrl+Enter / Cmd+Enter  confirma mesmo dentro de <textarea> quando
//                           permitirCtrlEnter=true
//   Tab / Shift+Tab    focus-trap: o foco circula DENTRO do modal ativo —
//                      teclado nunca escapa para a tela bloqueada atras
//                      (a11y, Fase 7). Ao fechar, o foco volta para onde
//                      estava antes do modal abrir (a menos que o chamador
//                      foque algo explicitamente, ex.: focarBusca do PDV).
//
// Use capture=true no listener para preceder atalhos globais (ex: F10 do
// PDV) e evitar conflitos quando o modal estiver aberto.
export function useModalKeys(
  aberto: boolean,
  { onClose, onConfirm, permitirEnter = false, permitirCtrlEnter = false }: UseModalKeysOptions = {},
): void {
  // Restaura o foco de quem abriu o modal. Roda no cleanup (fechamento ou
  // desmontagem); focos explicitos do chamador (setTimeout) vencem depois.
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    return () => {
      if (anterior && document.contains(anterior) && typeof anterior.focus === "function") {
        anterior.focus();
      }
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key === "Tab") {
        const cont = containerModalAtivo();
        if (!cont) return;
        const focaveis = Array.from(cont.querySelectorAll<HTMLElement>(FOCO_SELETOR))
          .filter(el => el.getClientRects().length > 0);
        if (focaveis.length === 0) { e.preventDefault(); return; }
        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];
        const ativo = document.activeElement as HTMLElement | null;
        if (!ativo || !cont.contains(ativo)) {
          // Foco esta fora do modal (ex.: body) — puxa para dentro.
          e.preventDefault();
          (e.shiftKey ? ultimo : primeiro).focus();
          return;
        }
        if (!e.shiftKey && ativo === ultimo) {
          e.preventDefault(); primeiro.focus();
        } else if (e.shiftKey && ativo === primeiro) {
          e.preventDefault(); ultimo.focus();
        }
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
