import { useState, useMemo, useRef, useEffect, type CSSProperties, type ChangeEvent } from "react";
import { C } from "../lib/theme";

const dropStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  zIndex: 300,
  maxHeight: 200,
  overflowY: "auto",
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
};

// Item minimo aceito: precisa ter id.
interface ItemBase {
  id: string;
  nome?: string;
  [extra: string]: unknown;
}

interface SelectBuscaProps<T extends ItemBase> {
  opcoes: T[];
  value: string | null | undefined;
  onChange: (id: string) => void;
  labelFn?: (item: T) => string;
  subLabelFn?: ((item: T) => string | undefined | null) | null;
  placeholder?: string;
  style?: CSSProperties;
  containerStyle?: CSSProperties;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  filtroOpcoes?: (item: T) => boolean;
  // Foca o campo automaticamente ao montar. Util para fluxos guiados por
  // teclado (ex: nova linha de item criada via Tab ja entra com foco aqui).
  autoFocus?: boolean;
}

export default function SelectBusca<T extends ItemBase>({
  opcoes = [],
  value,
  onChange,
  labelFn,
  subLabelFn,
  placeholder = "Buscar...",
  style,
  containerStyle,
  className,
  disabled,
  filtroOpcoes,
  autoFocus,
}: SelectBuscaProps<T>) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
    // so no mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getLabel = labelFn || ((item: T) => item.nome || "");
  const getSub = subLabelFn || null;

  const lista = useMemo(() => {
    const base = filtroOpcoes ? opcoes.filter(filtroOpcoes) : opcoes;
    const q = busca.toLowerCase().trim();
    if (!q) return base;
    return base.filter((item) => {
      const label = getLabel(item) || "";
      const sub = getSub ? (getSub(item) || "") : "";
      return label.toLowerCase().includes(q) || sub.toLowerCase().includes(q);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opcoes, busca, filtroOpcoes]);

  const selecionado = value ? opcoes.find((o) => o.id === value) || null : null;
  const inputValue = aberto ? busca : (selecionado ? getLabel(selecionado) : "");

  function handleFocus() {
    setBusca("");
    setAberto(true);
  }

  function handleBlur() {
    setTimeout(() => { setAberto(false); setBusca(""); }, 150);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    setBusca(e.target.value);
    onChange("");
    setAberto(true);
  }

  function selecionar(item: T) {
    onChange(item.id);
    setBusca("");
    setAberto(false);
  }

  return (
    <div style={{ position: "relative", ...containerStyle }}>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        style={{
          ...style,
          borderColor: value && !aberto ? "var(--green)" : undefined,
          paddingRight: value && !aberto ? 28 : undefined,
        }}
      />
      {value && !aberto && (
        <span
          className="absolute right-[9px] top-1/2 text-[13px] pointer-events-none leading-none"
          style={{ transform: "translateY(-50%)", color: C.green }}
        >
          ✓
        </span>
      )}
      {aberto && lista.length > 0 && (
        <div style={dropStyle}>
          {lista.map((item) => (
            <div
              key={item.id}
              onMouseDown={() => selecionar(item)}
              className="px-3 py-[9px] cursor-pointer"
              style={{ borderBottom: "1px solid var(--border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div className="text-gp-white font-semibold text-[13px]">{getLabel(item)}</div>
              {getSub && getSub(item) && (
                <div className="text-gp-muted text-[11px]">{getSub(item)}</div>
              )}
            </div>
          ))}
        </div>
      )}
      {aberto && busca && lista.length === 0 && (
        <div style={{ ...dropStyle, padding: "10px 12px", color: "var(--muted)", fontSize: 12 }}>
          Nenhum resultado encontrado
        </div>
      )}
    </div>
  );
}
