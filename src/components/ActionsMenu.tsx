import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { C } from "../lib/theme";

// Dropdown de acoes reutilizado nas listas (Financeiro, Clientes, Produtos,
// etc). Recebe um array de itens; cada item: { label, onClick, color?, icon?,
// disabled?, hidden? }. Itens com hidden=true sao filtrados; se sobrar nenhum,
// o componente nao renderiza.

export interface ActionItem {
  label: string;
  onClick?: () => void;
  color?: string;
  icon?: string;
  disabled?: boolean;
  hidden?: boolean;
}

interface ActionsMenuProps {
  items?: ActionItem[];
  align?: "left" | "right";
  title?: string;
}

interface Coords {
  top: number;
  left: number;
  ready: boolean;
}

export default function ActionsMenu({ items = [], align = "right", title = "Ações" }: ActionsMenuProps) {
  const [aberto, setAberto] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const [coords, setCoords] = useState<Coords>({ top: 0, left: 0, ready: false });
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!aberto) return;
    function onClickFora(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    function onScroll() {
      setAberto(false);
    }
    document.addEventListener("mousedown", onClickFora);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onClickFora);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [aberto]);

  // Posiciona o menu com position:fixed para escapar de overflow:hidden em
  // ancestrais (ex.: borda da tabela). Faz flip vertical se nao houver espaco
  // abaixo do botao.
  useLayoutEffect(() => {
    if (!aberto || !btnRef.current || !menuRef.current) return;
    const br = btnRef.current.getBoundingClientRect();
    const menuH = menuRef.current.offsetHeight;
    const menuW = menuRef.current.offsetWidth;
    const margem = 8;
    const espacoAbaixo = window.innerHeight - br.bottom;
    const abrirParaCima = espacoAbaixo < menuH + margem && br.top > menuH + margem;
    const top = abrirParaCima ? br.top - menuH - 4 : br.bottom + 4;
    let left = align === "right" ? br.right - menuW : br.left;
    // Garante que nao sai pela lateral da tela.
    if (left < 8) left = 8;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
    setCoords({ top, left, ready: true });
  }, [aberto, align]);

  const validos = items.filter((it): it is ActionItem => !!it && !it.hidden);
  if (validos.length === 0) return null;

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        title={title}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={(e) => {
          e.stopPropagation();
          setAberto((v) => {
            const novo = !v;
            if (novo) setCoords((c) => ({ ...c, ready: false }));
            return novo;
          });
        }}
        className="w-[30px] h-7 inline-flex items-center justify-center rounded-[7px] text-gp-text cursor-pointer transition-colors"
        style={{
          background: aberto ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.02)",
          border: `1px solid ${C.border}`,
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
          ref={menuRef}
          role="menu"
          className="fixed flex flex-col bg-gp-card rounded-[10px] p-1"
          style={{
            top: coords.top,
            left: coords.left,
            minWidth: 180,
            border: `1px solid ${C.border}`,
            boxShadow: "0 14px 36px rgba(0,0,0,.5)",
            zIndex: 1000,
            visibility: coords.ready ? "visible" : "hidden",
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
                className="text-left px-[10px] py-2 border-none text-[12.5px] font-medium rounded-md flex items-center gap-2 whitespace-nowrap"
                style={{
                  background: hoverIdx === i && !desabilitado ? "rgba(255,255,255,.06)" : "transparent",
                  color: it.color || C.text,
                  cursor: desabilitado ? "not-allowed" : "pointer",
                  opacity: desabilitado ? 0.5 : 1,
                }}
              >
                {it.icon && <span className="text-sm leading-none">{it.icon}</span>}
                <span>{it.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
