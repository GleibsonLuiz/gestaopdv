import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from "recharts";
import { C } from "../lib/theme.js";
import { api } from "../lib/api.js";

const fmtBRL = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (n) => Number(n || 0).toLocaleString("pt-BR");

// "YYYY-MM" -> "mai/26"
function formatarMesCurto(chave) {
  if (!chave) return "";
  const [ano, mes] = chave.split("-");
  const nomes = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${nomes[Number(mes) - 1] || mes}/${ano.slice(2)}`;
}

// Paleta para diferenciar vendedores nos charts. Roda em ciclo se passar de 8.
const CORES_VENDEDOR = [
  "#4f8ef7", "#7c3aed", "#22c55e", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#84cc16",
];

// Padroes de data: ultimos 6 meses como default.
function dataInicioPadrao() {
  const d = new Date();
  d.setMonth(d.getMonth() - 5);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function dataFimPadrao() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Componente reutilizavel — usado dentro de Comissoes.jsx (aba Evolucao) e
 * dentro de Relatorios.jsx (aba Comissoes).
 *
 * Props:
 *   - lockUserId?: string — quando passado, fixa o filtro no vendedor e
 *     esconde o seletor (util para mostrar so o proprio na futura visao
 *     do vendedor).
 *   - compacto?: boolean — reduz padding/altura dos charts (uso embedded).
 */
export default function RelatorioComissoes({ lockUserId = "", compacto = false }) {
  const [dataInicio, setDataInicio] = useState(dataInicioPadrao());
  const [dataFim, setDataFim] = useState(dataFimPadrao());
  const [userId, setUserId] = useState(lockUserId || "");
  const [vendedoresLista, setVendedoresLista] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  // Carrega lista de vendedores (para o filtro). Quando lockUserId esta
  // setado, nao precisa.
  useEffect(() => {
    if (lockUserId) return;
    api.listarVendedoresComissao()
      .then(setVendedoresLista)
      .catch(() => {});
  }, [lockUserId]);

  const gerar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await api.relatorioComissoes({
        dataInicio, dataFim,
        userId: lockUserId || userId,
      });
      setDados(r);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [dataInicio, dataFim, userId, lockUserId]);

  // Carrega ao montar e sempre que filtros mudarem (com debounce simples
  // via setTimeout pra evitar request a cada tecla na data).
  useEffect(() => {
    const t = setTimeout(gerar, 300);
    return () => clearTimeout(t);
  }, [gerar]);

  const vendedores = dados?.vendedores || [];
  const mensal = dados?.mensal || [];
  const resumo = dados?.resumo || null;

  // Mapa userId -> cor (consistente entre charts).
  const corDoVendedor = useMemo(() => {
    const m = {};
    vendedores.forEach((v, i) => {
      m[v.id] = CORES_VENDEDOR[i % CORES_VENDEDOR.length];
    });
    return m;
  }, [vendedores]);

  // Top 5 para line chart (evolucao mensal). Mostrar todos polui o grafico.
  const topVendedoresLinha = useMemo(() => {
    return vendedores.slice(0, 5);
  }, [vendedores]);

  // Dados pro line chart com nome legivel substituindo userId nas chaves.
  const mensalChart = useMemo(() => {
    return mensal.map(linha => {
      const out = { mes: formatarMesCurto(linha.mes) };
      for (const v of topVendedoresLinha) {
        out[v.nome] = linha[v.id] || 0;
      }
      return out;
    });
  }, [mensal, topVendedoresLinha]);

  // Dados pro bar chart de ranking (top 10).
  const ranking = useMemo(() => {
    return vendedores.slice(0, 10).map(v => ({
      nome: v.nome.length > 18 ? v.nome.slice(0, 16) + "…" : v.nome,
      Comissão: v.totalComissao,
      Vendas: v.totalVendas,
    }));
  }, [vendedores]);

  return (
    <div>
      {/* Filtros */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: compacto ? 12 : 16, marginBottom: 16,
        display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end",
      }}>
        <CampoFiltro label="Data início">
          <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={inputStyle} />
        </CampoFiltro>
        <CampoFiltro label="Data fim">
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={inputStyle} />
        </CampoFiltro>
        {!lockUserId && (
          <CampoFiltro label="Vendedor">
            <select value={userId} onChange={e => setUserId(e.target.value)} style={{ ...inputStyle, minWidth: 200 }}>
              <option value="">Todos</option>
              {vendedoresLista.map(v => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          </CampoFiltro>
        )}
        <button onClick={gerar} disabled={carregando} style={{
          background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
          color: C.white, border: "none", borderRadius: 8,
          padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer",
        }}>
          {carregando ? "Carregando..." : "🔄 Atualizar"}
        </button>
      </div>

      {erro && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 8,
          background: C.red + "22", border: `1px solid ${C.red}55`,
          color: C.red, fontSize: 13,
        }}>{erro}</div>
      )}

      {!resumo && !carregando && (
        <div style={cardVazio}>Sem dados no período selecionado.</div>
      )}

      {resumo && (
        <>
          {/* KPIs */}
          <div style={{
            display: "grid", gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            marginBottom: 16,
          }}>
            <KPI
              icone="💰"
              titulo="Comissão total"
              valor={fmtBRL(resumo.totalComissao)}
              cor={C.green}
            />
            <KPI
              icone="🛒"
              titulo="Faturamento"
              valor={fmtBRL(resumo.totalVendas)}
              cor={C.accent}
            />
            <KPI
              icone="📦"
              titulo="Vendas"
              valor={fmtNum(resumo.totalVendasCount)}
              cor={C.purple}
            />
            <KPI
              icone="🏆"
              titulo="Top vendedor"
              valor={resumo.melhorVendedor || "—"}
              subtitulo={resumo.melhorVendedor ? fmtBRL(resumo.melhorComissao) : ""}
              cor={C.yellow}
            />
          </div>

          {/* Grafico: ranking */}
          <Card titulo="Ranking de comissões" subtitulo="Top 10 vendedores no período" icone="📊">
            {ranking.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 13, padding: 20, textAlign: "center" }}>
                Sem vendas no período.
              </div>
            ) : (
              <div style={{ width: "100%", height: compacto ? 240 : 320 }}>
                <ResponsiveContainer>
                  <BarChart data={ranking} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="nome" stroke={C.muted} tick={{ fontSize: 11, fill: C.muted }} />
                    <YAxis stroke={C.muted} tick={{ fontSize: 11, fill: C.muted }}
                      tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<TooltipChart />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Comissão" fill={C.green} radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Vendas" fill={C.accent} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Grafico: evolucao mensal */}
          <Card titulo="Evolução mensal" subtitulo="Comissão por mês — top 5 vendedores" icone="📈">
            {mensalChart.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 13, padding: 20, textAlign: "center" }}>
                Selecione um período para ver a evolução.
              </div>
            ) : (
              <div style={{ width: "100%", height: compacto ? 240 : 320 }}>
                <ResponsiveContainer>
                  <LineChart data={mensalChart} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="mes" stroke={C.muted} tick={{ fontSize: 11, fill: C.muted }} />
                    <YAxis stroke={C.muted} tick={{ fontSize: 11, fill: C.muted }}
                      tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<TooltipChart />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {topVendedoresLinha.map(v => (
                      <Line
                        key={v.id}
                        type="monotone"
                        dataKey={v.nome}
                        stroke={corDoVendedor[v.id]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Cards detalhados por vendedor (com gauge de meta) */}
          <Card titulo="Detalhamento por vendedor" subtitulo="Meta x realizado e indicadores" icone="👥">
            {vendedores.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 13, padding: 20, textAlign: "center" }}>
                Nenhum vendedor com configuração no período.
              </div>
            ) : (
              <div style={{
                display: "grid", gap: 12,
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              }}>
                {vendedores.map(v => (
                  <CardVendedor key={v.id} vendedor={v} cor={corDoVendedor[v.id]} />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// ============ SUBCOMPONENTES ============

function CardVendedor({ vendedor, cor }) {
  const cfg = vendedor.configuracao;
  const meta = Number(cfg?.metaMensal || 0);
  const mesesNoPeriodo = vendedor.mesesNoPeriodo || 0;
  const ticketMedio = Number(vendedor.ticketMedio || 0);
  // % medio de meta atingida no periodo (vendas medias por mes / meta)
  const mediaMensal = mesesNoPeriodo > 0 ? vendedor.totalVendas / mesesNoPeriodo : 0;
  const progressoMeta = meta > 0 ? Math.min(100, (mediaMensal / meta) * 100) : 0;

  const gaugeData = [{ name: "meta", value: progressoMeta, fill: cor }];

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: 14, display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          background: cor, color: C.white,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 14, flexShrink: 0,
        }}>{vendedor.nome.charAt(0).toUpperCase()}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            color: C.white, fontWeight: 700, fontSize: 13,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{vendedor.nome}</div>
          <div style={{ color: C.muted, fontSize: 11 }}>{vendedor.role}</div>
        </div>
        {cfg && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
            background: cfg.tipo === "PORCENTAGEM" ? C.accent + "22" : C.purple + "22",
            color: cfg.tipo === "PORCENTAGEM" ? C.accent : C.purple,
            border: `1px solid ${cfg.tipo === "PORCENTAGEM" ? C.accent : C.purple}55`,
          }}>
            {cfg.tipo === "PORCENTAGEM" ? `${cfg.valor}%` : fmtBRL(cfg.valor)}
          </span>
        )}
      </div>

      {/* Gauge de meta + numeros */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 90, height: 90, flexShrink: 0 }}>
          <ResponsiveContainer>
            <RadialBarChart
              innerRadius="70%" outerRadius="100%"
              data={gaugeData} startAngle={90} endAngle={-270}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
              <RadialBar dataKey="value" cornerRadius={4} background={{ fill: C.bg }} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Meta atingida (média)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: cor, lineHeight: 1.1 }}>
            {meta > 0 ? `${progressoMeta.toFixed(0)}%` : "—"}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            {meta > 0 ? `${vendedor.mesesAcimaDaMeta} mês(es) acima da meta` : "Sem meta definida"}
          </div>
        </div>
      </div>

      <div style={{
        display: "grid", gap: 6,
        gridTemplateColumns: "1fr 1fr", fontSize: 12,
        paddingTop: 10, borderTop: `1px solid ${C.border}`,
      }}>
        <Linha label="Comissão" valor={fmtBRL(vendedor.totalComissao)} cor={C.green} />
        <Linha label="Faturamento" valor={fmtBRL(vendedor.totalVendas)} />
        <Linha label="Vendas" valor={fmtNum(vendedor.vendasCount)} />
        <Linha label="Ticket médio" valor={fmtBRL(ticketMedio)} />
      </div>
    </div>
  );
}

function Linha({ label, valor, cor }) {
  return (
    <div>
      <div style={{ color: C.muted, fontSize: 10, fontWeight: 600 }}>{label}</div>
      <div style={{ color: cor || C.text, fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {valor}
      </div>
    </div>
  );
}

function KPI({ icone, titulo, valor, subtitulo, cor }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: 16, display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: cor + "22", color: cor,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18,
        }}>{icone}</div>
        <div style={{ color: C.muted, fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>
          {titulo}
        </div>
      </div>
      <div style={{
        color: C.white, fontSize: 20, fontWeight: 800, fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{valor}</div>
      {subtitulo && (
        <div style={{ color: C.muted, fontSize: 11 }}>{subtitulo}</div>
      )}
    </div>
  );
}

function Card({ titulo, subtitulo, icone, children }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
      padding: 18, marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>{icone}</span>
        <div>
          <div style={{ color: C.white, fontWeight: 700, fontSize: 14 }}>{titulo}</div>
          {subtitulo && (
            <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{subtitulo}</div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function CampoFiltro({ label, children }) {
  return (
    <div>
      <div style={{ color: C.muted, fontSize: 11, marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  );
}

function TooltipChart({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: "8px 12px", boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      fontSize: 12,
    }}>
      <div style={{ color: C.white, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.text, lineHeight: 1.5 }}>
          <span style={{ color: C.muted }}>{p.name}: </span>
          <strong>{fmtBRL(p.value)}</strong>
        </div>
      ))}
    </div>
  );
}

const inputStyle = {
  background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 13,
  outline: "none",
};

const cardVazio = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
  padding: 30, textAlign: "center", color: C.muted, fontSize: 14,
};
