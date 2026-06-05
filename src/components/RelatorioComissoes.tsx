import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from "recharts";
import { C } from "../lib/theme";
import { api } from "../lib/api";
import { fmtBRL, fmtNum } from "../lib/format";


// "YYYY-MM" -> "mai/26"
function formatarMesCurto(chave: string | undefined | null): string {
  if (!chave) return "";
  const [ano, mes] = chave.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(mes) - 1] || mes}/${ano.slice(2)}`;
}

// Paleta para diferenciar vendedores nos charts. Roda em ciclo se passar de 8.
const CORES_VENDEDOR = [
  "#4f8ef7", "#7c3aed", "#22c55e", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#84cc16",
];

// Padroes de data: ultimos 6 meses como default.
function dataInicioPadrao(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 5);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function dataFimPadrao(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ConfiguracaoComissao {
  tipo: "PORCENTAGEM" | "FIXO";
  valor: number;
  metaMensal?: number;
}

interface Vendedor {
  id: string;
  nome: string;
  role: string;
  totalComissao: number;
  totalVendas: number;
  vendasCount: number;
  ticketMedio: number;
  mesesNoPeriodo?: number;
  mesesAcimaDaMeta?: number;
  configuracao?: ConfiguracaoComissao | null;
}

interface ResumoRelatorio {
  totalComissao: number;
  totalVendas: number;
  totalVendasCount: number;
  melhorVendedor?: string | null;
  melhorComissao?: number;
}

interface RelatorioComissoesData {
  vendedores: Vendedor[];
  mensal: Array<{ mes: string } & Record<string, number | string>>;
  resumo: ResumoRelatorio | null;
}

interface VendedorListaItem {
  id: string;
  nome: string;
}

interface RelatorioComissoesProps {
  lockUserId?: string;
  compacto?: boolean;
}

/**
 * Componente reutilizavel — usado dentro de Comissoes.jsx (aba Evolucao) e
 * dentro de Relatorios.jsx (aba Comissoes).
 */
export default function RelatorioComissoes({ lockUserId = "", compacto = false }: RelatorioComissoesProps) {
  const [dataInicio, setDataInicio] = useState(dataInicioPadrao());
  const [dataFim, setDataFim] = useState(dataFimPadrao());
  const [userId, setUserId] = useState(lockUserId || "");
  const [vendedoresLista, setVendedoresLista] = useState<VendedorListaItem[]>([]);
  const [dados, setDados] = useState<RelatorioComissoesData | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  // Carrega lista de vendedores (para o filtro). Quando lockUserId esta
  // setado, nao precisa.
  useEffect(() => {
    if (lockUserId) return;
    api.listarVendedoresComissao()
      .then((r) => setVendedoresLista(r as VendedorListaItem[]))
      .catch(() => { /* silencioso */ });
  }, [lockUserId]);

  const gerar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await api.relatorioComissoes({
        dataInicio, dataFim,
        userId: lockUserId || userId,
      }) as RelatorioComissoesData;
      setDados(r);
    } catch (err) {
      setErro((err as Error).message);
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
    const m: Record<string, string> = {};
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
    return mensal.map((linha) => {
      const out: Record<string, string | number> = { mes: formatarMesCurto(linha.mes) };
      for (const v of topVendedoresLinha) {
        out[v.nome] = Number(linha[v.id] || 0);
      }
      return out;
    });
  }, [mensal, topVendedoresLinha]);

  // Dados pro bar chart de ranking (top 10).
  const ranking = useMemo(() => {
    return vendedores.slice(0, 10).map((v) => ({
      nome: v.nome.length > 18 ? v.nome.slice(0, 16) + "…" : v.nome,
      Comissão: v.totalComissao,
      Vendas: v.totalVendas,
    }));
  }, [vendedores]);

  return (
    <div>
      {/* Filtros */}
      <div
        className="bg-gp-card border border-gp-border rounded-xl mb-4 flex gap-[10px] flex-wrap items-end"
        style={{ padding: compacto ? 12 : 16 }}
      >
        <CampoFiltro label="Data início">
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} style={inputStyle} />
        </CampoFiltro>
        <CampoFiltro label="Data fim">
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} style={inputStyle} />
        </CampoFiltro>
        {!lockUserId && (
          <CampoFiltro label="Vendedor">
            <select value={userId} onChange={(e) => setUserId(e.target.value)} style={{ ...inputStyle, minWidth: 200 }}>
              <option value="">Todos</option>
              {vendedoresLista.map((v) => (
                <option key={v.id} value={v.id}>{v.nome}</option>
              ))}
            </select>
          </CampoFiltro>
        )}
        <button
          onClick={gerar}
          disabled={carregando}
          className="text-gp-white border-none rounded-lg px-[18px] py-[10px] font-bold text-[13px] cursor-pointer"
          style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.purple})` }}
        >
          {carregando ? "Carregando..." : "🔄 Atualizar"}
        </button>
      </div>

      {erro && (
        <div
          className="mb-3 px-[14px] py-[10px] rounded-lg text-gp-red text-[13px]"
          style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}
        >
          {erro}
        </div>
      )}

      {!resumo && !carregando && (
        <div style={cardVazio}>Sem dados no período selecionado.</div>
      )}

      {resumo && (
        <>
          {/* KPIs */}
          <div
            className="grid gap-3 mb-4"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
          >
            <KPI icone="💰" titulo="Comissão total" valor={fmtBRL(resumo.totalComissao)} cor={C.green} />
            <KPI icone="🛒" titulo="Faturamento" valor={fmtBRL(resumo.totalVendas)} cor={C.accent} />
            <KPI icone="📦" titulo="Vendas" valor={fmtNum(resumo.totalVendasCount)} cor={C.purple} />
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
              <div className="text-gp-muted text-[13px] p-5 text-center">
                Sem vendas no período.
              </div>
            ) : (
              <div className="w-full" style={{ height: compacto ? 240 : 320 }}>
                <ResponsiveContainer>
                  <BarChart data={ranking} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="nome" stroke={C.muted} tick={{ fontSize: 11, fill: C.muted }} />
                    <YAxis
                      stroke={C.muted}
                      tick={{ fontSize: 11, fill: C.muted }}
                      tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`}
                    />
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
              <div className="text-gp-muted text-[13px] p-5 text-center">
                Selecione um período para ver a evolução.
              </div>
            ) : (
              <div className="w-full" style={{ height: compacto ? 240 : 320 }}>
                <ResponsiveContainer>
                  <LineChart data={mensalChart} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="mes" stroke={C.muted} tick={{ fontSize: 11, fill: C.muted }} />
                    <YAxis
                      stroke={C.muted}
                      tick={{ fontSize: 11, fill: C.muted }}
                      tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip content={<TooltipChart />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {topVendedoresLinha.map((v) => (
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
              <div className="text-gp-muted text-[13px] p-5 text-center">
                Nenhum vendedor com configuração no período.
              </div>
            ) : (
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
              >
                {vendedores.map((v) => (
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

function CardVendedor({ vendedor, cor }: { vendedor: Vendedor; cor: string }) {
  const cfg = vendedor.configuracao;
  const meta = Number(cfg?.metaMensal || 0);
  const mesesNoPeriodo = vendedor.mesesNoPeriodo || 0;
  const ticketMedio = Number(vendedor.ticketMedio || 0);
  // % medio de meta atingida no periodo (vendas medias por mes / meta)
  const mediaMensal = mesesNoPeriodo > 0 ? vendedor.totalVendas / mesesNoPeriodo : 0;
  const progressoMeta = meta > 0 ? Math.min(100, (mediaMensal / meta) * 100) : 0;

  const gaugeData = [{ name: "meta", value: progressoMeta, fill: cor }];

  return (
    <div className="bg-gp-surface border border-gp-border rounded-xl p-[14px] flex flex-col gap-[10px]">
      <div className="flex items-center gap-[10px]">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center font-extrabold text-sm shrink-0 text-gp-white"
          style={{ background: cor }}
        >
          {vendedor.nome.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-gp-white font-bold text-[13px] whitespace-nowrap overflow-hidden text-ellipsis">
            {vendedor.nome}
          </div>
          <div className="text-gp-muted text-[11px]">{vendedor.role}</div>
        </div>
        {cfg && (
          <span
            className="text-[10px] font-bold px-[6px] py-[2px] rounded"
            style={{
              background: cfg.tipo === "PORCENTAGEM" ? C.accent + "22" : C.purple + "22",
              color: cfg.tipo === "PORCENTAGEM" ? C.accent : C.purple,
              border: `1px solid ${cfg.tipo === "PORCENTAGEM" ? C.accent : C.purple}55`,
            }}
          >
            {cfg.tipo === "PORCENTAGEM" ? `${cfg.valor}%` : fmtBRL(cfg.valor)}
          </span>
        )}
      </div>

      {/* Gauge de meta + numeros */}
      <div className="flex items-center gap-3">
        <div className="w-[90px] h-[90px] shrink-0">
          <ResponsiveContainer>
            <RadialBarChart
              innerRadius="70%"
              outerRadius="100%"
              data={gaugeData}
              startAngle={90}
              endAngle={-270}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
              <RadialBar dataKey="value" cornerRadius={4} background={{ fill: C.bg }} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-gp-muted font-semibold">Meta atingida (média)</div>
          <div className="text-[22px] font-extrabold leading-[1.1]" style={{ color: cor }}>
            {meta > 0 ? `${progressoMeta.toFixed(0)}%` : "—"}
          </div>
          <div className="text-[11px] text-gp-muted mt-[2px]">
            {meta > 0 ? `${vendedor.mesesAcimaDaMeta} mês(es) acima da meta` : "Sem meta definida"}
          </div>
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-[6px] text-xs pt-[10px]"
        style={{ borderTop: `1px solid ${C.border}` }}
      >
        <Linha label="Comissão" valor={fmtBRL(vendedor.totalComissao)} cor={C.green} />
        <Linha label="Faturamento" valor={fmtBRL(vendedor.totalVendas)} />
        <Linha label="Vendas" valor={fmtNum(vendedor.vendasCount)} />
        <Linha label="Ticket médio" valor={fmtBRL(ticketMedio)} />
      </div>
    </div>
  );
}

function Linha({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div>
      <div className="text-gp-muted text-[10px] font-semibold">{label}</div>
      <div className="text-[13px] font-bold tabular-nums" style={{ color: cor || C.text }}>
        {valor}
      </div>
    </div>
  );
}

function KPI({ icone, titulo, valor, subtitulo, cor }: { icone: string; titulo: string; valor: string; subtitulo?: string; cor: string }) {
  return (
    <div className="bg-gp-card border border-gp-border rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div
          className="w-9 h-9 rounded-[10px] flex items-center justify-center text-lg"
          style={{ background: cor + "22", color: cor }}
        >
          {icone}
        </div>
        <div className="text-gp-muted text-[11px] font-semibold tracking-[0.4px] uppercase">
          {titulo}
        </div>
      </div>
      <div className="text-gp-white text-xl font-extrabold tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">
        {valor}
      </div>
      {subtitulo && <div className="text-gp-muted text-[11px]">{subtitulo}</div>}
    </div>
  );
}

function Card({ titulo, subtitulo, icone, children }: { titulo: string; subtitulo?: string; icone: string; children: ReactNode }) {
  return (
    <div className="bg-gp-card border border-gp-border rounded-[14px] p-[18px] mb-4">
      <div className="flex items-center gap-[10px] mb-[14px]">
        <span className="text-lg">{icone}</span>
        <div>
          <div className="text-gp-white font-bold text-sm">{titulo}</div>
          {subtitulo && <div className="text-gp-muted text-[11px] mt-[2px]">{subtitulo}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function CampoFiltro({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-gp-muted text-[11px] mb-1 font-semibold">{label}</div>
      {children}
    </div>
  );
}

interface TooltipPayloadEntry {
  name?: string;
  value?: number;
  color?: string;
}

function TooltipChart({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}
    >
      <div className="text-gp-white font-bold mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.text, lineHeight: 1.5 }}>
          <span className="text-gp-muted">{p.name}: </span>
          <strong>{fmtBRL(p.value)}</strong>
        </div>
      ))}
    </div>
  );
}

const inputStyle: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  color: C.text,
  fontSize: 13,
  outline: "none",
};

const cardVazio: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: 30,
  textAlign: "center",
  color: C.muted,
  fontSize: 14,
};
