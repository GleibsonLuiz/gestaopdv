import { useState, useMemo } from "react";
import { api } from "./lib/api.js";

const C = {
  surface: "#1a1d27", card: "#21253a", border: "#2e3354",
  accent: "#4f8ef7", text: "#e2e8f0", muted: "#64748b",
  white: "#ffffff", green: "#22c55e", red: "#ef4444",
  yellow: "#f59e0b", purple: "#7c3aed",
};

export default function MovimentarEstoqueModal({ produtos, produtoInicial, onCancelar, onSalvar }) {
  const [produtoId, setProdutoId] = useState(produtoInicial?.id || "");
  const [tipo, setTipo] = useState("ENTRADA");
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const produto = useMemo(
    () => produtos.find(p => p.id === produtoId) || produtoInicial || null,
    [produtoId, produtoInicial, produtos]
  );

  const previewDepois = useMemo(() => {
    if (!produto || quantidade === "") return null;
    const q = parseInt(quantidade, 10);
    if (!Number.isFinite(q)) return null;
    if (tipo === "ENTRADA") return produto.estoque + q;
    if (tipo === "SAIDA") return produto.estoque - q;
    if (tipo === "AJUSTE") return q;
    return null;
  }, [produto, tipo, quantidade]);

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (!produtoId) { setErro("Selecione um produto"); return; }
    const q = parseInt(quantidade, 10);
    if (!Number.isFinite(q)) { setErro("Quantidade inválida"); return; }
    if (tipo !== "AJUSTE" && q <= 0) { setErro("Quantidade deve ser maior que zero"); return; }
    if (tipo === "AJUSTE" && q < 0) { setErro("Para ajuste, informe um valor >= 0"); return; }
    if (tipo === "SAIDA" && produto && q > produto.estoque) {
      setErro(`Estoque insuficiente. Disponível: ${produto.estoque}`); return;
    }

    setSalvando(true);
    try {
      const mov = await api.criarMovimentacao({ produtoId, tipo, quantidade: q, motivo });
      onSalvar(mov);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  const tipoCor = tipo === "ENTRADA" ? C.green : tipo === "SAIDA" ? C.red : C.yellow;

  return (
    <div onClick={() => !salvando && onCancelar()} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 100,
    }}>
      <form onSubmit={salvar} onClick={e => e.stopPropagation()} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        width: "100%", maxWidth: 520, padding: 24,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ color: C.white, fontWeight: 700, fontSize: 18 }}>
            Movimentar Estoque
          </div>
          <button type="button" onClick={onCancelar} style={{
            background: "transparent", border: "none", color: C.muted, fontSize: 20, cursor: "pointer",
          }}>×</button>
        </div>

        <Campo label="Produto *">
          <select value={produtoId} onChange={e => setProdutoId(e.target.value)}
            disabled={!!produtoInicial} required style={inputStyle}>
            <option value="">— Selecione —</option>
            {produtos.map(p => (
              <option key={p.id} value={p.id}>
                {p.codigo} — {p.nome} (estoque: {p.estoque})
              </option>
            ))}
          </select>
        </Campo>

        <Campo label="Tipo de movimentação *">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { val: "ENTRADA", label: "↗ Entrada", cor: C.green },
              { val: "SAIDA",   label: "↙ Saída",   cor: C.red },
              { val: "AJUSTE",  label: "✎ Ajuste",  cor: C.yellow },
            ].map(opt => (
              <button key={opt.val} type="button" onClick={() => setTipo(opt.val)} style={{
                padding: "10px 8px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: tipo === opt.val ? opt.cor + "33" : C.surface,
                border: `1px solid ${tipo === opt.val ? opt.cor : C.border}`,
                color: tipo === opt.val ? opt.cor : C.text,
              }}>{opt.label}</button>
            ))}
          </div>
        </Campo>

        <Campo label={tipo === "AJUSTE" ? "Estoque deve ficar com *" : "Quantidade *"}>
          <input type="number" min="0" value={quantidade}
            onChange={e => setQuantidade(e.target.value)}
            required style={inputStyle} autoFocus />
          {tipo === "AJUSTE" && (
            <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
              Para ajuste, informe o valor absoluto que o estoque deve ficar (não soma/subtrai).
            </div>
          )}
        </Campo>

        <Campo label="Motivo / Observação">
          <input value={motivo} onChange={e => setMotivo(e.target.value)} style={inputStyle}
            placeholder="Ex: nota fiscal 1234, perda, contagem, etc." />
        </Campo>

        {produto && previewDepois !== null && (
          <div style={{
            marginTop: 12, padding: "12px 14px", borderRadius: 10,
            background: C.surface, border: `1px solid ${tipoCor}55`,
          }}>
            <div style={{ color: C.muted, fontSize: 11, marginBottom: 4, fontWeight: 600 }}>PRÉVIA</div>
            <div style={{ color: C.text, fontSize: 14 }}>
              Estoque <span style={{ fontFamily: "monospace" }}>{produto.estoque}</span>
              {" → "}
              <span style={{
                fontFamily: "monospace", fontWeight: 700,
                color: previewDepois < 0 ? C.red : tipoCor,
              }}>
                {previewDepois}
              </span>
              {previewDepois < 0 && <span style={{ color: C.red, marginLeft: 8, fontSize: 12 }}>⚠ Negativo</span>}
            </div>
          </div>
        )}

        {erro && (
          <div style={{
            marginTop: 14, padding: "10px 12px", borderRadius: 8,
            background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
          }}>{erro}</div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button type="button" onClick={onCancelar} disabled={salvando} style={{
            background: C.surface, border: `1px solid ${C.border}`, color: C.text,
            borderRadius: 8, padding: "10px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer",
          }}>Cancelar</button>
          <button type="submit" disabled={salvando} style={{
            background: salvando ? C.muted : `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, border: "none", borderRadius: 8,
            padding: "10px 22px", fontWeight: 700, fontSize: 13,
            cursor: salvando ? "default" : "pointer",
          }}>
            {salvando ? "Salvando..." : "Confirmar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", color: "#64748b", fontSize: 12, marginBottom: 6, fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", background: "#1a1d27", border: "1px solid #2e3354",
  borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 13,
  outline: "none", boxSizing: "border-box",
};
