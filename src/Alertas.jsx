import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./lib/api.js";

const C = {
  bg: "#0f1117", surface: "#1a1d27", card: "#21253a",
  border: "#2e3354", accent: "#4f8ef7", purple: "#7c3aed",
  green: "#22c55e", red: "#ef4444", yellow: "#f59e0b",
  text: "#e2e8f0", muted: "#64748b", white: "#ffffff",
};

const POLLING_MS = 60_000;
const STORAGE_DESCARTADOS = "gestao_alertas_descartados";

const fmtBRL = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtData = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

const COR_SEVERIDADE = {
  ALTA: C.red, MEDIA: C.yellow, BAIXA: C.accent,
};

const ROTULO_TIPO = {
  ESTOQUE_BAIXO: { label: "Estoque baixo", icone: "📦" },
  CONTA_PAGAR_ATRASADA: { label: "Contas a pagar atrasadas", icone: "📤" },
  CONTA_PAGAR_PROXIMA: { label: "Contas a pagar próximas", icone: "📅" },
  CONTA_RECEBER_ATRASADA: { label: "Recebimentos atrasados", icone: "📥" },
  CONTA_RECEBER_PROXIMA: { label: "Recebimentos próximos", icone: "📅" },
};

function lerDescartados() {
  try {
    const raw = localStorage.getItem(STORAGE_DESCARTADOS);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function salvarDescartados(s) {
  try {
    localStorage.setItem(STORAGE_DESCARTADOS, JSON.stringify([...s]));
  } catch {}
}

export default function Alertas({ onNavegar }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregandoInicial, setCarregandoInicial] = useState(true);
  const [descartados, setDescartados] = useState(() => lerDescartados());
  const ref = useRef(null);

  const carregar = useCallback(async () => {
    try {
      const data = await api.obterAlertas();
      setDados(data);
      setErro("");
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregandoInicial(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, POLLING_MS);
    return () => clearInterval(t);
  }, [carregar]);

  useEffect(() => {
    function onClickFora(e) {
      if (aberto && ref.current && !ref.current.contains(e.target)) {
        setAberto(false);
      }
    }
    function onEsc(e) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", onClickFora);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickFora);
      document.removeEventListener("keydown", onEsc);
    };
  }, [aberto]);

  // Limpa descartados que nao existem mais (ex: estoque reposto, conta paga)
  useEffect(() => {
    if (!dados) return;
    const idsAtuais = new Set(dados.alertas.map(a => a.id));
    let mudou = false;
    const limpos = new Set();
    for (const id of descartados) {
      if (idsAtuais.has(id)) limpos.add(id);
      else mudou = true;
    }
    if (mudou) {
      setDescartados(limpos);
      salvarDescartados(limpos);
    }
  }, [dados, descartados]);

  const visiveis = (dados?.alertas || []).filter(a => !descartados.has(a.id));
  const alta = visiveis.filter(a => a.severidade === "ALTA").length;
  const media = visiveis.filter(a => a.severidade === "MEDIA").length;
  const totalVisivel = visiveis.length;

  const corBadge = alta > 0 ? C.red : media > 0 ? C.yellow : C.accent;

  function descartar(id) {
    const novo = new Set(descartados); novo.add(id);
    setDescartados(novo);
    salvarDescartados(novo);
  }

  function descartarTodos() {
    if (!visiveis.length) return;
    const novo = new Set(descartados);
    for (const a of visiveis) novo.add(a.id);
    setDescartados(novo);
    salvarDescartados(novo);
  }

  function restaurar() {
    setDescartados(new Set());
    salvarDescartados(new Set());
  }

  function clicarAlerta(a) {
    if (onNavegar) {
      if (a.link === "estoque") onNavegar("estoque");
      else if (a.link === "financeiro-pagar" || a.link === "financeiro-receber") onNavegar("financeiro");
    }
    setAberto(false);
  }

  // Agrupa por tipo
  const grupos = {};
  for (const a of visiveis) {
    if (!grupos[a.tipo]) grupos[a.tipo] = [];
    grupos[a.tipo].push(a);
  }
  const ordemTipos = [
    "ESTOQUE_BAIXO",
    "CONTA_PAGAR_ATRASADA",
    "CONTA_RECEBER_ATRASADA",
    "CONTA_PAGAR_PROXIMA",
    "CONTA_RECEBER_PROXIMA",
  ];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setAberto(v => !v)}
        title={totalVisivel > 0 ? `${totalVisivel} alerta(s)` : "Nenhum alerta"}
        style={{
          background: aberto ? C.card : "transparent",
          border: `1px solid ${aberto ? C.border : "transparent"}`,
          borderRadius: 10, padding: "8px 10px", cursor: "pointer",
          color: C.text, position: "relative", fontSize: 18, lineHeight: 1,
        }}
      >
        🔔
        {totalVisivel > 0 && (
          <span style={{
            position: "absolute", top: 2, right: 2,
            background: corBadge, color: C.white,
            borderRadius: 999, minWidth: 18, height: 18,
            padding: "0 5px", fontSize: 10, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `2px solid ${C.surface}`,
          }}>
            {totalVisivel > 99 ? "99+" : totalVisivel}
          </span>
        )}
      </button>

      {aberto && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: 380, maxHeight: "70vh", overflowY: "auto",
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 12, boxShadow: "0 10px 32px rgba(0,0,0,0.5)",
          zIndex: 60,
        }}>
          {/* Cabeçalho */}
          <div style={{
            padding: "14px 16px", borderBottom: `1px solid ${C.border}`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            position: "sticky", top: 0, background: C.card, zIndex: 1,
          }}>
            <div>
              <div style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>🔔 Notificações</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                {totalVisivel === 0
                  ? "Tudo em ordem por aqui"
                  : `${totalVisivel} alerta${totalVisivel === 1 ? "" : "s"}${alta > 0 ? ` · ${alta} crítico${alta === 1 ? "" : "s"}` : ""}`}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {descartados.size > 0 && (
                <button onClick={restaurar} title="Restaurar descartados" style={{
                  background: "transparent", border: `1px solid ${C.border}`, color: C.muted,
                  borderRadius: 6, padding: "4px 8px", fontSize: 10, fontWeight: 600, cursor: "pointer",
                }}>↺ {descartados.size}</button>
              )}
              {visiveis.length > 0 && (
                <button onClick={descartarTodos} title="Marcar todos como lidos" style={{
                  background: "transparent", border: `1px solid ${C.border}`, color: C.muted,
                  borderRadius: 6, padding: "4px 8px", fontSize: 10, fontWeight: 600, cursor: "pointer",
                }}>✓ Tudo</button>
              )}
            </div>
          </div>

          {/* Conteúdo */}
          {erro ? (
            <div style={{ padding: 20, color: C.red, fontSize: 12, textAlign: "center" }}>{erro}</div>
          ) : carregandoInicial ? (
            <div style={{ padding: 20, color: C.muted, fontSize: 12, textAlign: "center" }}>Carregando...</div>
          ) : visiveis.length === 0 ? (
            <div style={{ padding: 30, color: C.muted, fontSize: 12, textAlign: "center" }}>
              ✓ Nenhum alerta ativo no momento
            </div>
          ) : (
            ordemTipos.filter(t => grupos[t]?.length).map(tipo => {
              const lista = grupos[tipo];
              const meta = ROTULO_TIPO[tipo];
              return (
                <div key={tipo}>
                  <div style={{
                    padding: "10px 14px 6px", color: C.muted,
                    fontSize: 10, fontWeight: 800, textTransform: "uppercase",
                    letterSpacing: 0.6, display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span>{meta.icone}</span>
                    <span>{meta.label}</span>
                    <span style={{
                      background: C.surface, border: `1px solid ${C.border}`,
                      borderRadius: 999, padding: "1px 7px", fontSize: 10, color: C.text,
                    }}>{lista.length}</span>
                  </div>
                  {lista.map(a => <ItemAlerta key={a.id} alerta={a} onClicar={clicarAlerta} onDescartar={descartar} />)}
                </div>
              );
            })
          )}

          {dados?.geradoEm && (
            <div style={{
              padding: "8px 14px", borderTop: `1px solid ${C.border}`,
              color: C.muted, fontSize: 10, textAlign: "center",
            }}>
              Atualizado às {new Date(dados.geradoEm).toLocaleTimeString("pt-BR")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ItemAlerta({ alerta, onClicar, onDescartar }) {
  const cor = COR_SEVERIDADE[alerta.severidade] || C.muted;
  return (
    <div style={{
      padding: "10px 14px", borderBottom: `1px solid ${C.border}22`,
      display: "grid", gridTemplateColumns: "4px 1fr auto", gap: 10,
      alignItems: "flex-start",
    }}>
      <div style={{ width: 4, alignSelf: "stretch", background: cor, borderRadius: 2 }} />
      <button onClick={() => onClicar(alerta)} style={{
        background: "transparent", border: "none", padding: 0, textAlign: "left",
        cursor: "pointer", color: C.text, width: "100%",
      }}>
        <div style={{ color: cor, fontSize: 11, fontWeight: 700, marginBottom: 2 }}>
          {alerta.titulo}
        </div>
        <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>
          {alerta.descricao}
        </div>
        <div style={{
          color: C.muted, fontSize: 11, marginTop: 4,
          display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
        }}>
          {alerta.complemento && <span>{alerta.complemento}</span>}
          {alerta.valor != null && <span style={{ color: cor, fontWeight: 700 }}>{fmtBRL(alerta.valor)}</span>}
          {alerta.data && <span>vence {fmtData(alerta.data)}</span>}
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDescartar(alerta.id); }}
        title="Descartar"
        style={{
          background: "transparent", border: "none", color: C.muted,
          fontSize: 14, cursor: "pointer", padding: "2px 4px",
        }}
      >×</button>
    </div>
  );
}
