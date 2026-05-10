import { useEffect, useRef, useState } from "react";
import { C } from "../lib/theme";

// Dropdown de acoes reutilizado nas listas (Financeiro, Clientes, Produtos,
// etc). Recebe um array de itens; cada item: { label, onClick, color?, icon?,
// disabled?, hidden? }. Itens com hidden=true sao filtrados; se sobrar nenhum,
// o componente nao renderiza.
export default function ActionsMenu({ items = [], align = "right", title = "Ações" }) {
  const [aberto, setAberto] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    function onClickFora(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setAberto(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", onClickFora);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickFora);
      document.removeEventListener("keydown", onKey);
    };
  }, [aberto]);

  const validos = items.filter(it => it && !it.hidden);
  if (validos.length === 0) return null;

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        title={title}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={(e) => { e.stopPropagation(); setAberto(v => !v); }}
        style={{
          width: 30, height: 28,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          borderRadius: 7,
          background: aberto ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.02)",
          color: C.text,
          border: `1px solid ${C.border}`,
          cursor: "pointer",
          transition: "background .15s, color .15s",
        }}
        onMouseEnter={(e) => {
          if (!aberto) e.currentTarget.style.background = "rgba(255,255,255,.06)";
        }}
        onMouseLeave={(e) => {
          if (!aberto) e.currentTarget.style.background = "rgba(255,255,255,.02)";
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {aberto && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            [align === "right" ? "right" : "left"]: 0,
            minWidth: 180,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: 4,
            boxShadow: "0 14px 36px rgba(0,0,0,.5)",
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {validos.map((it, i) => {
            const desabilitado = !!it.disabled;
            return (
              <button
                key={i}
                role="menuitem"
                type="button"
                disabled={desabilitado}
                onClick={() => {
                  if (desabilitado) return;
                  setAberto(false);
                  it.onClick?.();
                }}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(-1)}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  background: hoverIdx === i && !desabilitado ? "rgba(255,255,255,.06)" : "transparent",
                  border: "none",
                  color: it.color || C.text,
                  fontSize: 12.5,
                  fontWeight: 500,
                  borderRadius: 6,
                  cursor: desabilitado ? "not-allowed" : "pointer",
                  opacity: desabilitado ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  whiteSpace: "nowrap",
                }}
              >
                {it.icon && <span style={{ fontSize: 14, lineHeight: 1 }}>{it.icon}</span>}
                <span>{it.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
