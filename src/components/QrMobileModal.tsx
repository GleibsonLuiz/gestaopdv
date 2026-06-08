import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { C } from "../lib/theme";

// =====================================================================
// Modal exibido a partir da pagina de Inventario desktop. Mostra um
// QR Code apontando para a URL de inventario mobile (?mobile=inventario).
// O operador escaneia com a camera do celular e cai direto na tela
// mobile sem precisar digitar URL. Tambem oferece copiar URL e abrir
// em nova aba como fallback.
// =====================================================================

interface QrMobileModalProps {
  aberto: boolean;
  onFechar: () => void;
  inventarioId?: string;
  inventarioNumero?: number;
}

export default function QrMobileModal({ aberto, onFechar, inventarioId, inventarioNumero }: QrMobileModalProps) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const [copiado, setCopiado] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // URL absoluta: o QR precisa apontar pra dominio acessivel do celular.
  // window.location.origin pega o host atual (funciona em LAN e producao).
  // Se um inventario especifico for passado, embute o UUID — assim a tela
  // mobile pula o passo de digitar ID e carrega direto a folha certa.
  const url = typeof window !== "undefined"
    ? `${window.location.origin}/?mobile=inventario${inventarioId ? `&inv=${encodeURIComponent(inventarioId)}` : ""}`
    : "";

  useEffect(() => {
    if (!aberto || !url) return;
    QRCode.toDataURL(url, {
      width: 320,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).then(setDataUrl).catch(() => setDataUrl(""));
  }, [aberto, url]);

  // ESC fecha; clique no fundo fecha.
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto, onFechar]);

  async function copiarUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      // Fallback antigo: seleciona o texto pra usuario copiar manualmente.
      const t = document.createElement("textarea");
      t.value = url;
      document.body.appendChild(t);
      t.select();
      try { document.execCommand("copy"); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch {}
      document.body.removeChild(t);
    }
  }

  if (!aberto) return null;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onFechar(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text }}
      >
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-widest" style={{ color: C.muted }}>
              Inventário mobile
            </div>
            <h2 className="text-lg font-bold mt-1">
              Aponte a câmera do celular
            </h2>
            {inventarioNumero ? (
              <div className="text-[12px] mt-1" style={{ color: C.muted }}>
                Use o ID <b style={{ color: C.text }}>{inventarioNumero}</b> ao abrir no celular.
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="text-2xl leading-none px-2"
            style={{ color: C.muted }}
          >×</button>
        </div>

        <div
          className="flex items-center justify-center p-4 rounded-xl mb-4"
          style={{ background: "#ffffff", border: `1px solid ${C.border}` }}
        >
          {dataUrl ? (
            <img src={dataUrl} alt="QR Code para abrir o inventário mobile" width={280} height={280} />
          ) : (
            <div className="text-[12px]" style={{ color: "#64748b", padding: 60 }}>
              Gerando QR Code…
            </div>
          )}
        </div>

        <div className="text-[11px] mb-2" style={{ color: C.muted }}>URL</div>
        <div className="flex gap-2 mb-3">
          <input
            readOnly
            value={url}
            aria-label="URL do inventário mobile"
            placeholder="URL do inventário mobile"
            className="flex-1 px-3 py-2 rounded-lg text-[12px] font-mono"
            style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={copiarUrl}
            className="px-3 py-2 rounded-lg text-[12px] font-bold"
            style={{
              background: copiado ? C.green : C.accent,
              color: "#ffffff",
            }}
          >
            {copiado ? "✓ Copiado" : "Copiar"}
          </button>
        </div>

        <div className="flex gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center py-2.5 rounded-lg text-[13px] font-bold no-underline"
            style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
          >
            Abrir em nova aba
          </a>
          <button
            type="button"
            onClick={onFechar}
            className="flex-1 py-2.5 rounded-lg text-[13px] font-bold"
            style={{ background: C.accent, color: "var(--accent-ink)" }}
          >
            Fechar
          </button>
        </div>

        <div className="mt-4 text-[11px] leading-relaxed" style={{ color: C.muted }}>
          💡 <b>Dica:</b> instale a página como PWA no celular (menu do navegador → "Adicionar à tela inicial") para abrir como app, com leitor de código de barras e modo offline.
        </div>
      </div>
    </div>
  );
}
