import { useState, useEffect, useCallback } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";

const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const TIPO_INFO = {
  GANHO:   { label: "Ganho",   cor: C.green,  icone: "+" },
  RESGATE: { label: "Resgate", cor: C.accent, icone: "−" },
  AJUSTE:  { label: "Ajuste",  cor: C.yellow, icone: "±" },
};

function Pill({ tipo }) {
  const info = TIPO_INFO[tipo] || { label: tipo, cor: C.muted, icone: "?" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: info.cor + "22", color: info.cor, letterSpacing: ".04em",
    }}>
      {info.icone} {info.label}
    </span>
  );
}

// ==================== ABA CONFIGURACAO ====================
function AbaConfig({ user }) {
  const podeEditar = user.role === "ADMIN";
  const [config, setConfig] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  const [ativo, setAtivo] = useState(true);
  const [reaisPorPonto, setReaisPorPonto] = useState("1");
  const [pontosParaUmReal, setPontosParaUmReal] = useState("100");
  const [minimoResgate, setMinimoResgate] = useState("100");
  const [maximoDescPct, setMaximoDescPct] = useState("50");

  useEffect(() => {
    api.obterConfiguracaoFidelidade()
      .then(c => {
        setConfig(c);
        setAtivo(c.ativo);
        setReaisPorPonto(String(c.reaisPorPonto));
        setPontosParaUmReal(String(c.pontosParaUmReal));
        setMinimoResgate(String(c.minimoResgate));
        setMaximoDescPct(String(c.maximoDescPct));
      })
      .catch(() => setErro("Erro ao carregar configuracao"));
  }, []);

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro(""); setOk("");
    try {
      const c = await api.salvarConfiguracaoFidelidade({
        ativo,
        reaisPorPonto: Number(reaisPorPonto),
        pontosParaUmReal: parseInt(pontosParaUmReal, 10),
        minimoResgate: parseInt(minimoResgate, 10),
        maximoDescPct: Number(maximoDescPct),
      });
      setConfig(c);
      setOk("Configuracao salva com sucesso.");
      setTimeout(() => setOk(""), 3000);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  if (!config) return <div style={{ color: C.muted, padding: 32, textAlign: "center" }}>Carregando...</div>;

  const exemploPontos = Math.floor(100 / Number(reaisPorPonto) || 0);
  const exemploDesconto = Math.floor(parseInt(pontosParaUmReal, 10) || 100);

  return (
    <form onSubmit={salvar} style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 560 }}>
      {/* Toggle ativo */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 20px", borderRadius: 12,
        background: ativo ? C.green + "18" : C.card,
        border: `1px solid ${ativo ? C.green + "44" : C.border}`,
      }}>
        <div>
          <div style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>Programa de Fidelidade</div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
            {ativo ? "Ativo — clientes acumulam e resgatam pontos" : "Inativo — nenhum ponto é acumulado ou resgatado"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => podeEditar && setAtivo(v => !v)}
          disabled={!podeEditar}
          style={{
            width: 48, height: 26, borderRadius: 13, border: "none", cursor: podeEditar ? "pointer" : "default",
            background: ativo ? C.green : C.border,
            position: "relative", transition: "background .2s",
          }}
        >
          <span style={{
            position: "absolute", top: 3,
            left: ativo ? 25 : 3,
            width: 20, height: 20, borderRadius: "50%", background: C.white,
            transition: "left .2s",
          }} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={{ color: C.muted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
            Reais por ponto (R$ por ponto ganho)
          </label>
          <input
            type="number" step="0.01" min="0.01" value={reaisPorPonto}
            onChange={e => setReaisPorPonto(e.target.value)}
            disabled={!podeEditar}
            style={{
              width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: "10px 12px", color: C.text, fontSize: 14, boxSizing: "border-box",
            }}
          />
          <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
            A cada R$ {reaisPorPonto || "1"} gasto, o cliente ganha 1 ponto
          </div>
        </div>
        <div>
          <label style={{ color: C.muted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
            Pontos para R$ 1 de desconto
          </label>
          <input
            type="number" step="1" min="1" value={pontosParaUmReal}
            onChange={e => setPontosParaUmReal(e.target.value)}
            disabled={!podeEditar}
            style={{
              width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: "10px 12px", color: C.text, fontSize: 14, boxSizing: "border-box",
            }}
          />
          <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
            {pontosParaUmReal || "100"} pontos = R$ 1,00 de desconto
          </div>
        </div>
        <div>
          <label style={{ color: C.muted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
            Mínimo de resgate (pontos)
          </label>
          <input
            type="number" step="1" min="0" value={minimoResgate}
            onChange={e => setMinimoResgate(e.target.value)}
            disabled={!podeEditar}
            style={{
              width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: "10px 12px", color: C.text, fontSize: 14, boxSizing: "border-box",
            }}
          />
          <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
            Pontos mínimos para resgatar em uma compra
          </div>
        </div>
        <div>
          <label style={{ color: C.muted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
            Desconto máximo por resgate (%)
          </label>
          <input
            type="number" step="0.1" min="0" max="100" value={maximoDescPct}
            onChange={e => setMaximoDescPct(e.target.value)}
            disabled={!podeEditar}
            style={{
              width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: "10px 12px", color: C.text, fontSize: 14, boxSizing: "border-box",
            }}
          />
          <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
            Limite de desconto via pontos por compra
          </div>
        </div>
      </div>

      {/* Preview das regras */}
      <div style={{
        padding: "14px 18px", borderRadius: 10, background: C.accent + "11",
        border: `1px solid ${C.accent + "33"}`,
        fontSize: 12, color: C.muted, lineHeight: 1.7,
      }}>
        <div style={{ color: C.accent, fontWeight: 700, marginBottom: 6, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase" }}>
          Preview das regras
        </div>
        <div>• Compra de <strong style={{ color: C.text }}>R$ 100</strong> → ganha <strong style={{ color: C.green }}>{exemploPontos} pontos</strong></div>
        <div>• <strong style={{ color: C.text }}>{exemploDesconto} pontos</strong> valem <strong style={{ color: C.accent }}>R$ 1,00</strong> de desconto</div>
        <div>• Resgate mínimo: <strong style={{ color: C.text }}>{minimoResgate || "0"} pontos</strong></div>
        <div>• Limite de desconto: <strong style={{ color: C.text }}>{maximoDescPct || "0"}% do subtotal</strong></div>
      </div>

      {erro && <div style={{ color: C.red, fontSize: 13 }}>{erro}</div>}
      {ok && <div style={{ color: C.green, fontSize: 13 }}>{ok}</div>}

      {podeEditar && (
        <button
          type="submit"
          disabled={salvando}
          style={{
            padding: "12px 24px", borderRadius: 10, border: "none", cursor: "pointer",
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, fontWeight: 700, fontSize: 14, alignSelf: "flex-start",
          }}
        >
          {salvando ? "Salvando..." : "Salvar configuração"}
        </button>
      )}
      {!podeEditar && (
        <div style={{ color: C.muted, fontSize: 12 }}>Apenas administradores podem alterar as configurações de fidelidade.</div>
      )}
    </form>
  );
}

// ==================== ABA CONSULTAR ====================
function AbaConsultar({ user }) {
  const podeAjustar = user.role === "ADMIN" || user.role === "GERENTE";
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState("");
  const [busca, setBusca] = useState("");
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const [ajusteAberto, setAjusteAberto] = useState(false);
  const [ajusteTipo, setAjusteTipo] = useState("GANHO");
  const [ajustePontos, setAjustePontos] = useState("");
  const [ajusteDesc, setAjusteDesc] = useState("");
  const [ajustando, setAjustando] = useState(false);
  const [ajusteErro, setAjusteErro] = useState("");

  useEffect(() => {
    api.listarClientes({ ativo: "true" })
      .then(lista => setClientes(Array.isArray(lista) ? lista : []))
      .catch(() => {});
  }, []);

  const clientesFiltrados = clientes.filter(c => {
    const q = busca.toLowerCase();
    return !q || c.nome?.toLowerCase().includes(q) || c.cpfCnpj?.includes(q);
  }).slice(0, 20);

  const carregar = useCallback(async (id) => {
    if (!id) { setDados(null); return; }
    setCarregando(true);
    setErro("");
    try {
      const d = await api.pontosFidelidade(id);
      setDados(d);
    } catch (err) {
      setErro(err.message);
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  function selecionarCliente(id) {
    setClienteId(id);
    setBusca("");
    setAjusteAberto(false);
    carregar(id);
  }

  async function submeterAjuste(e) {
    e.preventDefault();
    const qtd = parseInt(ajustePontos, 10);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      setAjusteErro("Informe uma quantidade válida de pontos");
      return;
    }
    setAjustando(true);
    setAjusteErro("");
    try {
      await api.ajustarPontosFidelidade(clienteId, {
        tipo: ajusteTipo,
        pontos: qtd,
        descricao: ajusteDesc.trim() || null,
      });
      setAjusteAberto(false);
      setAjustePontos("");
      setAjusteDesc("");
      carregar(clienteId);
    } catch (err) {
      setAjusteErro(err.message);
    } finally {
      setAjustando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Seletor de cliente */}
      <div style={{ maxWidth: 420 }}>
        <label style={{ color: C.muted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
          Selecionar cliente
        </label>
        <div style={{ position: "relative" }}>
          <input
            value={clienteId ? (clientes.find(c => c.id === clienteId)?.nome || clienteId) : busca}
            onChange={e => { setBusca(e.target.value); setClienteId(""); setDados(null); }}
            placeholder="Buscar por nome ou CPF/CNPJ..."
            style={{
              width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: "10px 12px", color: C.text, fontSize: 14, boxSizing: "border-box",
            }}
          />
          {busca && !clienteId && clientesFiltrados.length > 0 && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)", overflow: "hidden",
            }}>
              {clientesFiltrados.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selecionarCliente(c.id)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "10px 14px", background: "transparent", border: "none",
                    color: C.text, fontSize: 13, cursor: "pointer", borderBottom: `1px solid ${C.border}`,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = C.border + "55"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ fontWeight: 600 }}>{c.nome}</div>
                  {c.cpfCnpj && <div style={{ color: C.muted, fontSize: 11 }}>{c.cpfCnpj}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {carregando && <div style={{ color: C.muted, fontSize: 13 }}>Carregando...</div>}
      {erro && <div style={{ color: C.red, fontSize: 13 }}>{erro}</div>}

      {dados && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Cards de saldo */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[
              { label: "Saldo atual", valor: dados.saldo, cor: C.accent, icone: "⭐" },
              { label: "Total ganho", valor: dados.totalGanho, cor: C.green, icone: "↑" },
              { label: "Total resgatado", valor: dados.totalResgatado, cor: C.purple, icone: "↓" },
            ].map(({ label, valor, cor, icone }) => (
              <div key={label} style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
                padding: "16px 18px",
              }}>
                <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, marginBottom: 8, letterSpacing: ".04em" }}>
                  {icone} {label.toUpperCase()}
                </div>
                <div style={{ color: cor, fontSize: 28, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                  {valor.toLocaleString("pt-BR")}
                  <span style={{ fontSize: 13, fontWeight: 400, color: C.muted, marginLeft: 4 }}>pts</span>
                </div>
              </div>
            ))}
          </div>

          {/* Ajuste manual */}
          {podeAjustar && (
            <div>
              {!ajusteAberto ? (
                <button
                  onClick={() => setAjusteAberto(true)}
                  style={{
                    padding: "8px 18px", borderRadius: 8, border: `1px solid ${C.border}`,
                    background: "transparent", color: C.text, fontSize: 13, cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  ± Ajuste manual de pontos
                </button>
              ) : (
                <form onSubmit={submeterAjuste} style={{
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
                  padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12,
                }}>
                  <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>Ajuste manual de pontos</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ color: C.muted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Tipo</label>
                      <select
                        value={ajusteTipo} onChange={e => setAjusteTipo(e.target.value)}
                        style={{
                          width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                          padding: "9px 12px", color: C.text, fontSize: 13, boxSizing: "border-box",
                        }}
                      >
                        <option value="GANHO">Ganho (creditar)</option>
                        <option value="RESGATE">Resgate (debitar)</option>
                        <option value="AJUSTE">Ajuste administrativo</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ color: C.muted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Pontos</label>
                      <input
                        type="number" min="1" value={ajustePontos}
                        onChange={e => setAjustePontos(e.target.value)}
                        placeholder="Ex: 100"
                        style={{
                          width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                          padding: "9px 12px", color: C.text, fontSize: 13, boxSizing: "border-box",
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ color: C.muted, fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Motivo (opcional)</label>
                    <input
                      value={ajusteDesc} onChange={e => setAjusteDesc(e.target.value)}
                      placeholder="Ex: BRINDE ANIVERSÁRIO"
                      style={{
                        width: "100%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                        padding: "9px 12px", color: C.text, fontSize: 13, boxSizing: "border-box",
                      }}
                    />
                  </div>
                  {ajusteErro && <div style={{ color: C.red, fontSize: 12 }}>{ajusteErro}</div>}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button" onClick={() => { setAjusteAberto(false); setAjusteErro(""); }}
                      style={{
                        padding: "8px 18px", borderRadius: 8, border: `1px solid ${C.border}`,
                        background: "transparent", color: C.muted, fontSize: 13, cursor: "pointer",
                      }}
                    >Cancelar</button>
                    <button
                      type="submit" disabled={ajustando}
                      style={{
                        padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
                        background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                        color: C.white, fontWeight: 700, fontSize: 13,
                      }}
                    >{ajustando ? "Salvando..." : "Confirmar ajuste"}</button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Histórico */}
          <div>
            <div style={{ color: C.muted, fontSize: 12, fontWeight: 600, marginBottom: 10, letterSpacing: ".04em" }}>
              HISTÓRICO DE MOVIMENTAÇÕES
            </div>
            {dados.historico.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 13, padding: "20px 0" }}>Nenhuma movimentação registrada.</div>
            ) : (
              <div style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden",
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      {["Data", "Tipo", "Pontos", "Descrição", "Vendedor", "Venda"].map(h => (
                        <th key={h} style={{
                          padding: "10px 14px", textAlign: "left", color: C.muted,
                          fontWeight: 600, fontSize: 11, letterSpacing: ".04em",
                          borderBottom: `1px solid ${C.border}`,
                        }}>{h.toUpperCase()}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.historico.map((m, i) => {
                      const info = TIPO_INFO[m.tipo] || { cor: C.muted, icone: "?" };
                      const ehCredito = m.tipo === "GANHO" || m.tipo === "AJUSTE";
                      return (
                        <tr key={m.id} style={{ borderBottom: i < dados.historico.length - 1 ? `1px solid ${C.border}` : "none" }}>
                          <td style={{ padding: "10px 14px", color: C.muted, whiteSpace: "nowrap" }}>{fmtData(m.createdAt)}</td>
                          <td style={{ padding: "10px 14px" }}><Pill tipo={m.tipo} /></td>
                          <td style={{ padding: "10px 14px", fontWeight: 700, color: info.cor, fontVariantNumeric: "tabular-nums" }}>
                            {ehCredito ? "+" : "−"}{m.pontos.toLocaleString("pt-BR")}
                          </td>
                          <td style={{ padding: "10px 14px", color: C.muted }}>{m.descricao || "—"}</td>
                          <td style={{ padding: "10px 14px", color: C.muted }}>{m.user?.nome || "—"}</td>
                          <td style={{ padding: "10px 14px", color: C.muted }}>
                            {m.venda ? `#${m.venda.numero}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== PAGE ====================
export default function Fidelidade({ user }) {
  const [aba, setAba] = useState("config");

  const ABAS = [
    { id: "config", label: "Configuração", icone: "⚙" },
    { id: "consultar", label: "Consultar Clientes", icone: "🔍" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        {ABAS.map(a => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            style={{
              padding: "10px 20px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: "transparent",
              color: aba === a.id ? C.accent : C.muted,
              borderBottom: aba === a.id ? `2px solid ${C.accent}` : "2px solid transparent",
              marginBottom: -1, transition: "color .15s, border-color .15s",
            }}
          >
            {a.icone} {a.label}
          </button>
        ))}
      </div>

      {aba === "config" && <AbaConfig user={user} />}
      {aba === "consultar" && <AbaConsultar user={user} />}
    </div>
  );
}
