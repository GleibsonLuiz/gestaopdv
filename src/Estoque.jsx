import { useEffect, useState, useCallback } from "react";
import { api } from "./lib/api.js";
import MovimentarEstoqueModal from "./MovimentarEstoqueModal.jsx";

const C = {
  bg: "#0f1117", surface: "#1a1d27", card: "#21253a",
  border: "#2e3354", accent: "#4f8ef7", text: "#e2e8f0",
  muted: "#64748b", white: "#ffffff", green: "#22c55e",
  yellow: "#f59e0b", red: "#ef4444", purple: "#7c3aed",
};

const TIPO_INFO = {
  ENTRADA: { label: "Entrada", icone: "↗", cor: C.green },
  SAIDA:   { label: "Saída",   icone: "↙", cor: C.red },
  AJUSTE:  { label: "Ajuste",  icone: "✎", cor: C.yellow },
};

const fmtData = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export default function Estoque({ user }) {
  const [movs, setMovs] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [filtroProduto, setFiltroProduto] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [mensagem, setMensagem] = useState("");

  const podeMovimentar = user.role === "ADMIN" || user.role === "GERENTE";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.listarMovimentacoes({
        produtoId: filtroProduto,
        tipo: filtroTipo,
        limite: "200",
      });
      setMovs(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [filtroProduto, filtroTipo]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    api.listarProdutos({ ativo: "true" }).then(setProdutos).catch(() => {});
  }, []);

  function flash(t) {
    setMensagem(t);
    setTimeout(() => setMensagem(""), 2500);
  }

  function abrirModal() {
    setProdutoSelecionado(null);
    setModalAberto(true);
  }

  function aposSalvar(mov) {
    setModalAberto(false);
    flash(`${TIPO_INFO[mov.tipo].label} registrada (estoque: ${mov.estoqueAntes} → ${mov.estoqueDepois})`);
    carregar();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filtroProduto} onChange={e => setFiltroProduto(e.target.value)} style={{
          flex: "1 1 240px", background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 13, cursor: "pointer",
        }}>
          <option value="">Todos os produtos</option>
          {produtos.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>)}
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: "10px 12px", color: C.text, fontSize: 13, cursor: "pointer",
        }}>
          <option value="">Todos os tipos</option>
          <option value="ENTRADA">Entrada</option>
          <option value="SAIDA">Saída</option>
          <option value="AJUSTE">Ajuste</option>
        </select>
        {podeMovimentar && (
          <button onClick={abrirModal} style={{
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, border: "none", borderRadius: 8,
            padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>
            + Nova movimentação
          </button>
        )}
      </div>

      {mensagem && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 8,
          background: C.green + "22", border: `1px solid ${C.green}55`, color: C.green, fontSize: 13,
        }}>{mensagem}</div>
      )}
      {erro && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 8,
          background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
        }}>{erro}</div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "150px 100px 1.5fr 100px 160px 1fr 130px",
          padding: "12px 16px", background: C.surface,
          borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700,
          color: C.muted, textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          <div>Quando</div>
          <div>Tipo</div>
          <div>Produto</div>
          <div style={{ textAlign: "right" }}>Quantidade</div>
          <div style={{ textAlign: "right" }}>Estoque (antes → depois)</div>
          <div>Motivo</div>
          <div>Usuário</div>
        </div>

        {carregando ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Carregando...</div>
        ) : movs.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Nenhuma movimentação encontrada.</div>
        ) : movs.map(m => {
          const t = TIPO_INFO[m.tipo];
          return (
            <div key={m.id} style={{
              display: "grid", gridTemplateColumns: "150px 100px 1.5fr 100px 160px 1fr 130px",
              padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
              alignItems: "center", fontSize: 13,
            }}>
              <div style={{ color: C.muted, fontSize: 12 }}>{fmtData(m.createdAt)}</div>
              <div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                  background: t.cor + "22", color: t.cor, border: `1px solid ${t.cor}55`,
                }}>{t.icone} {t.label}</span>
              </div>
              <div>
                <div style={{ color: C.white, fontWeight: 600, fontSize: 13 }}>{m.produto?.nome}</div>
                <div style={{ color: C.muted, fontFamily: "monospace", fontSize: 11 }}>{m.produto?.codigo}</div>
              </div>
              <div style={{ textAlign: "right", color: t.cor, fontWeight: 700 }}>
                {m.tipo === "SAIDA" ? "-" : m.tipo === "ENTRADA" ? "+" : ""}{m.quantidade}
              </div>
              <div style={{ textAlign: "right", color: C.text, fontFamily: "monospace", fontSize: 12 }}>
                {m.estoqueAntes} → <span style={{ color: C.white, fontWeight: 700 }}>{m.estoqueDepois}</span>
              </div>
              <div style={{ color: C.muted, fontSize: 12 }}>{m.motivo || "—"}</div>
              <div style={{ color: C.muted, fontSize: 12 }}>{m.user?.nome || "—"}</div>
            </div>
          );
        })}
      </div>

      {modalAberto && (
        <MovimentarEstoqueModal
          produtos={produtos}
          produtoInicial={produtoSelecionado}
          onCancelar={() => setModalAberto(false)}
          onSalvar={aposSalvar}
        />
      )}
    </div>
  );
}
