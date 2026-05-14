import { useEffect, useState, useCallback } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";

// ============ CONFIGURACAO ============

const ETAPAS = [
  { id: "LEAD",        label: "Lead",        cor: C.muted,  icone: "🌱" },
  { id: "QUALIFICADO", label: "Qualificado", cor: C.accent, icone: "✨" },
  { id: "PROPOSTA",    label: "Proposta",    cor: "#7c3aed", icone: "📨" },
  { id: "NEGOCIACAO",  label: "Negociação",  cor: C.yellow, icone: "🤝" },
  { id: "GANHO",       label: "Ganho",       cor: C.green,  icone: "🏆" },
  { id: "PERDIDO",     label: "Perdido",     cor: C.red,    icone: "💔" },
];

const SEGMENTOS = [
  { id: "VIP",        label: "VIP",        cor: "#f59e0b", icone: "👑" },
  { id: "RECORRENTE", label: "Recorrente", cor: C.green,   icone: "🔄" },
  { id: "NOVO",       label: "Novo",       cor: C.accent,  icone: "🌟" },
  { id: "EM_RISCO",   label: "Em risco",   cor: C.yellow,  icone: "⚠️" },
  { id: "INATIVO",    label: "Inativo",    cor: C.muted,   icone: "💤" },
  { id: "PROSPECT",   label: "Prospect",   cor: "#7c3aed", icone: "🌱" },
];
const SEG_MAP = Object.fromEntries(SEGMENTOS.map((s) => [s.id, s]));

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtNum = (v) => Number(v || 0).toLocaleString("pt-BR");

// ============ COMPONENTE PRINCIPAL ============

export default function DashboardCrm() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [janela, setJanela] = useState(365);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      setDados(await api.obterDashboardCrm({ dias: janela }));
    } catch (e) {
      setErro(e.message || "Erro ao carregar");
    } finally {
      setCarregando(false);
    }
  }, [janela]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div style={{ padding: 16, color: C.text }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, color: C.white, fontSize: 22, fontWeight: 700 }}>
            🎯 Dashboard CRM
          </h2>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
            Visão consolidada de relacionamento: funil, segmentos, retenção e performance
          </div>
        </div>
        <select
          value={janela}
          onChange={(e) => setJanela(parseInt(e.target.value, 10))}
          style={{
            background: C.card, color: C.text, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: "8px 12px", fontSize: 13, width: 200,
          }}
        >
          <option value={90}>Últimos 90 dias</option>
          <option value={180}>Últimos 180 dias</option>
          <option value={365}>Últimos 365 dias</option>
          <option value={730}>Últimos 2 anos</option>
        </select>
      </div>

      {erro && (
        <div style={{ background: C.red + "22", color: C.red, padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {erro}
        </div>
      )}

      {carregando || !dados ? (
        <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Calculando métricas...</div>
      ) : (
        <>
          <KpisTop dados={dados} />
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginTop: 16 }} className="gp-crm-grid">
            <BlocoFunil funil={dados.funil} />
            <BlocoSegmentos segmentos={dados.clientes.segmentos} totalClientes={dados.clientes.total} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }} className="gp-crm-grid">
            <BlocoTopLtv clientes={dados.topLtv} />
            <BlocoEmRisco clientes={dados.emRisco} />
          </div>
          <div style={{ marginTop: 16 }}>
            <BlocoPerformance performance={dados.performance} />
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 900px) {
          .gp-crm-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

// ============ KPIS DO TOPO ============

function KpisTop({ dados }) {
  const { funil, clientes, tarefas } = dados;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
      <Kpi label="Total de clientes" valor={fmtNum(clientes.total)} icone="👥" cor={C.accent}
           sub={`${fmtNum(clientes.comCompra)} compraram no período`} />
      <Kpi label="Taxa de retenção" valor={`${clientes.taxaRetencao.toFixed(1)}%`} icone="🔄" cor={C.green}
           sub="Clientes ativos com 1+ compra" />
      <Kpi label="Forecast funil" valor={fmtBRL(funil.valorPonderadoAberto)} icone="🔮" cor="#7c3aed"
           sub="Valor × probabilidade (aberto)" />
      <Kpi label="Conversão funil" valor={`${funil.taxaConversao.toFixed(1)}%`} icone="📈" cor={C.yellow}
           sub={`${fmtNum(funil.totalGanho)} ganhas / ${fmtNum(funil.totalGanho + funil.totalPerdido)} fechadas`} />
      <Kpi label="Tarefas abertas" valor={fmtNum(tarefas.abertas)} icone="📋" cor={C.accent}
           sub={tarefas.atrasadas > 0 ? `${tarefas.atrasadas} atrasada(s)` : "Sem atrasadas"}
           subCor={tarefas.atrasadas > 0 ? C.red : C.muted} />
      <Kpi label="Tarefas concluídas" valor={fmtNum(tarefas.concluidasPeriodo)} icone="✅" cor={C.green}
           sub="No período selecionado" />
    </div>
  );
}

function Kpi({ label, valor, icone, cor, sub, subCor }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${cor}`,
      borderRadius: 8, padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
        <span>{icone}</span> {label}
      </div>
      <div style={{ color: C.white, fontSize: 22, fontWeight: 700, marginTop: 4 }}>{valor}</div>
      {sub && <div style={{ color: subCor || C.muted, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ============ BLOCO FUNIL VISUAL ============

function BlocoFunil({ funil }) {
  const maxQtd = Math.max(...ETAPAS.map((e) => funil.porEtapa[e.id]?.quantidade || 0), 1);
  return (
    <Card titulo="Funil de Vendas" subtitulo="Distribuição de oportunidades por etapa">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {ETAPAS.map((e) => {
          const d = funil.porEtapa[e.id] || { quantidade: 0, valorEstimado: 0, valorPonderado: 0 };
          const pct = maxQtd > 0 ? (d.quantidade / maxQtd) * 100 : 0;
          return (
            <div key={e.id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3, fontSize: 12 }}>
                <span style={{ color: e.cor, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span>{e.icone}</span> {e.label}
                </span>
                <span style={{ color: C.text }}>
                  <strong>{d.quantidade}</strong>{" · "}
                  <span style={{ color: C.muted }}>{fmtBRL(d.valorEstimado)}</span>
                </span>
              </div>
              <div style={{
                width: "100%", height: 12, background: C.bg, borderRadius: 6, overflow: "hidden",
                border: `1px solid ${C.border}`,
              }}>
                <div style={{
                  width: `${pct}%`, height: "100%",
                  background: `linear-gradient(90deg, ${e.cor}, ${e.cor}cc)`,
                  transition: "width 0.4s ease",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ============ BLOCO SEGMENTOS ============

function BlocoSegmentos({ segmentos, totalClientes }) {
  return (
    <Card titulo="Segmentação de Clientes (RFM)" subtitulo="Classificação automática por comportamento">
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {SEGMENTOS.map((s) => {
          const d = segmentos[s.id] || { quantidade: 0, monetario: 0 };
          const pct = totalClientes > 0 ? (d.quantidade / totalClientes) * 100 : 0;
          return (
            <div key={s.id}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3, fontSize: 12 }}>
                <span style={{ color: s.cor, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span>{s.icone}</span> {s.label}
                </span>
                <span style={{ color: C.text }}>
                  <strong>{d.quantidade}</strong>
                  <span style={{ color: C.muted }}> ({pct.toFixed(1)}%)</span>
                  {d.monetario > 0 && (
                    <span style={{ color: C.muted, marginLeft: 6 }}>· {fmtBRL(d.monetario)}</span>
                  )}
                </span>
              </div>
              <div style={{
                width: "100%", height: 10, background: C.bg, borderRadius: 6, overflow: "hidden",
                border: `1px solid ${C.border}`,
              }}>
                <div style={{
                  width: `${pct}%`, height: "100%", background: s.cor,
                  transition: "width 0.4s ease",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ============ BLOCO TOP LTV ============

function BlocoTopLtv({ clientes }) {
  return (
    <Card titulo="Top 10 — Maior LTV" subtitulo="Clientes que mais geram receita">
      {clientes.length === 0 ? (
        <Vazio msg="Nenhum cliente com compras no período" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {clientes.map((c, i) => {
            const seg = SEG_MAP[c.segmento];
            return (
              <div key={c.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 0",
                borderBottom: i === clientes.length - 1 ? "none" : `1px solid ${C.border}`,
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: i < 3 ? "#f59e0b22" : C.bg,
                  color: i < 3 ? "#f59e0b" : C.muted,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, fontSize: 11, flexShrink: 0,
                }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.white, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.nome}
                  </div>
                  <div style={{ color: C.muted, fontSize: 10 }}>
                    {c.qtdCompras} compra(s) · {seg?.label || "—"}
                  </div>
                </div>
                <div style={{ color: C.green, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                  {fmtBRL(c.totalGasto)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ============ BLOCO EM RISCO ============

function BlocoEmRisco({ clientes }) {
  return (
    <Card titulo="Clientes em risco" subtitulo="Compraram antes mas pararam — priorize reativação"
          corBorda={C.yellow}>
      {clientes.length === 0 ? (
        <Vazio msg="Nenhum cliente em risco no período 🎉" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {clientes.map((c, i) => (
            <div key={c.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 0",
              borderBottom: i === clientes.length - 1 ? "none" : `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 16, flexShrink: 0 }}>⚠️</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.white, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.nome}
                </div>
                <div style={{ color: c.recenciaDias > 90 ? C.red : C.muted, fontSize: 10 }}>
                  {c.recenciaDias != null ? `${c.recenciaDias}d sem comprar` : "—"}
                  {" · "}{c.qtdCompras} compra(s) · LTV {fmtBRL(c.totalGasto)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ============ BLOCO PERFORMANCE POR VENDEDOR ============

function BlocoPerformance({ performance }) {
  return (
    <Card titulo="Performance comercial" subtitulo="Vendas, ganhos no funil e carga de tarefas por vendedor">
      {performance.length === 0 ? (
        <Vazio msg="Nenhum vendedor ativo" />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                <th style={th()}>Vendedor</th>
                <th style={{ ...th(), textAlign: "center" }}>Vendas</th>
                <th style={{ ...th(), textAlign: "right" }}>R$ Vendido</th>
                <th style={{ ...th(), textAlign: "center" }}>Ganhos funil</th>
                <th style={{ ...th(), textAlign: "right" }}>R$ Ganho</th>
                <th style={{ ...th(), textAlign: "center" }}>Tarefas abertas</th>
              </tr>
            </thead>
            <tbody>
              {performance.map((p) => (
                <tr key={p.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td()}>
                    <div style={{ color: C.white, fontWeight: 600 }}>{p.nome}</div>
                    <div style={{ color: C.muted, fontSize: 10 }}>{p.role}</div>
                  </td>
                  <td style={{ ...td(), textAlign: "center", color: C.text }}>{p.vendasQuantidade}</td>
                  <td style={{ ...td(), textAlign: "right", color: C.green, fontWeight: 700 }}>{fmtBRL(p.vendasTotal)}</td>
                  <td style={{ ...td(), textAlign: "center", color: C.text }}>{p.oportunidadesGanhas}</td>
                  <td style={{ ...td(), textAlign: "right", color: C.muted }}>{fmtBRL(p.valorGanho)}</td>
                  <td style={{ ...td(), textAlign: "center", color: p.tarefasAbertas > 5 ? C.yellow : C.text }}>
                    {p.tarefasAbertas}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function th() { return { padding: "8px 10px", textAlign: "left", fontWeight: 700 }; }
function td() { return { padding: "8px 10px", verticalAlign: "middle" }; }

// ============ CARD WRAPPER ============

function Card({ titulo, subtitulo, children, corBorda }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderTop: corBorda ? `2px solid ${corBorda}` : undefined,
      borderRadius: 8, padding: "14px 16px",
    }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>{titulo}</div>
        {subtitulo && <div style={{ color: C.muted, fontSize: 11, marginTop: 1 }}>{subtitulo}</div>}
      </div>
      {children}
    </div>
  );
}

function Vazio({ msg }) {
  return (
    <div style={{ color: C.muted, fontSize: 12, fontStyle: "italic", textAlign: "center", padding: 20 }}>
      {msg}
    </div>
  );
}
