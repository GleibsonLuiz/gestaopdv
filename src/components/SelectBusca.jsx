import { useState, useMemo } from "react";
import { C } from "../lib/theme.js";

const dropStyle = {
  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
  zIndex: 300, maxHeight: 200, overflowY: "auto",
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
};

export default function SelectBusca({
  opcoes = [],
  value,
  onChange,
  labelFn,
  subLabelFn,
  placeholder = "Buscar...",
  style,
  className,
  disabled,
  required,
  filtroOpcoes,
}) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);

  const getLabel = labelFn || (item => item.nome);
  const getSub = subLabelFn || null;

  const lista = useMemo(() => {
    const base = filtroOpcoes ? opcoes.filter(filtroOpcoes) : opcoes;
    const q = busca.toLowerCase().trim();
    if (!q) return base;
    return base.filter(item => {
      const label = getLabel(item) || "";
      const sub = getSub ? (getSub(item) || "") : "";
      return label.toLowerCase().includes(q) || sub.toLowerCase().includes(q);
    });
  }, [opcoes, busca, filtroOpcoes]);

  const selecionado = value ? opcoes.find(o => o.id === value) : null;
  const inputValue = aberto ? busca : (selecionado ? getLabel(selecionado) : "");

  function handleFocus() {
    setBusca("");
    setAberto(true);
  }

  function handleBlur() {
    setTimeout(() => { setAberto(false); setBusca(""); }, 150);
  }

  function handleChange(e) {
    setBusca(e.target.value);
    onChange("");
    setAberto(true);
  }

  function selecionar(item) {
    onChange(item.id);
    setBusca("");
    setAberto(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <input
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
        <span style={{
          position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)",
          color: C.green, fontSize: 13, pointerEvents: "none", lineHeight: 1,
        }}>✓</span>
      )}
      {aberto && lista.length > 0 && (
        <div style={dropStyle}>
          {lista.map(item => (
            <div
              key={item.id}
              onMouseDown={() => selecionar(item)}
              style={{ padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid var(--border)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{ color: "var(--white)", fontWeight: 600, fontSize: 13 }}>{getLabel(item)}</div>
              {getSub && getSub(item) && (
                <div style={{ color: "var(--muted)", fontSize: 11 }}>{getSub(item)}</div>
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
