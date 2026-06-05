import { useEffect, useState, useCallback, type CSSProperties, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";
import { fmtBRL, fmtNum } from "./lib/format";


// ============ TIPOS / CONFIGURACAO ============

type EtapaId = "LEAD" | "QUALIFICADO" | "PROPOSTA" | "NEGOCIACAO" | "GANHO" | "PERDIDO";
type SegmentoId = "VIP" | "RECORRENTE" | "NOVO" | "EM_RISCO" | "INATIVO" | "PROSPECT";

interface EtapaMeta {
  id: EtapaId;
  label: string;
  cor: string;
  icone: string;
}

interface SegmentoMeta {
  id: SegmentoId;
  label: string;
  cor: string;
  icone: string;
}

const ETAPAS: EtapaMeta[] = [
  { id: "LEAD",        label: "Lead",        cor: C.muted,  icone: "🌱" },
  { id: "QUALIFICADO", label: "Qualificado", cor: C.accent, icone: "✨" },
  { id: "PROPOSTA",    label: "Proposta",    cor: "#7c3aed", icone: "📨" },
  { id: "NEGOCIACAO",  label: "Negociação",  cor: C.yellow, icone: "🤝" },
  { id: "GANHO",       label: "Ganho",       cor: C.green,  icone: "🏆" },
  { id: "PERDIDO",     label: "Perdido",     cor: C.red,    icone: "💔" },
];

const SEGMENTOS: SegmentoMeta[] = [
  { id: "VIP",        label: "VIP",        cor: "#f59e0b", icone: "👑" },
  { id: "RECORRENTE", label: "Recorrente", cor: C.green,   icone: "🔄" },
  { id: "NOVO",       label: "Novo",       cor: C.accent,  icone: "🌟" },
  { id: "EM_RISCO",   label: "Em risco",   cor: C.yellow,  icone: "⚠️" },
  { id: "INATIVO",    label: "Inativo",    cor: C.muted,   icone: "💤" },
  { id: "PROSPECT",   label: "Prospect",   cor: "#7c3aed", icone: "🌱" },
];
const SEG_MAP: Record<string, SegmentoMeta> = Object.fromEntries(SEGMENTOS.map((s) => [s.id, s]));

interface EtapaResumo {
  quantidade: number;
  valorEstimado: number;
  valorPonderado: number;
}

interface SegmentoResumo {
  quantidade: number;
  monetario: number;
}

interface FunilData {
  totalGanho: number;
  totalPerdido: number;
  valorPonderadoAberto: number;
  taxaConversao: number;
  porEtapa: Record<string, EtapaResumo>;
}

interface ClienteTop {
  id: string;
  nome: string;
  qtdCompras: number;
  totalGasto: number;
  segmento: SegmentoId;
}

interface ClienteRisco {
  id: string;
  nome: string;
  recenciaDias: number | null;
  qtdCompras: number;
  totalGasto: number;
}

interface ClientesData {
  total: number;
  comCompra: number;
  taxaRetencao: number;
  segmentos: Record<string, SegmentoResumo>;
}

interface TarefasData {
  abertas: number;
  atrasadas: number;
  concluidasPeriodo: number;
}

interface PerformanceItem {
  id: string;
  nome: string;
  role: string;
  vendasQuantidade: number;
  vendasTotal: number;
  oportunidadesGanhas: number;
  valorGanho: number;
  tarefasAbertas: number;
}

interface DashboardData {
  funil: FunilData;
  clientes: ClientesData;
  tarefas: TarefasData;
  topLtv: ClienteTop[];
  emRisco: ClienteRisco[];
  performance: PerformanceItem[];
}

// ============ COMPONENTE PRINCIPAL ============

export default function DashboardCrm() {
  const [dados, setDados] = useState<DashboardData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [janela, setJanela] = useState(365);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await api.obterDashboardCrm({ dias: String(janela) }) as DashboardData;
      setDados(r);
    } catch (e) {
      setErro((e as Error).message || "Erro ao carregar");
    } finally {
      setCarregando(false);
    }
  }, [janela]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="p-4 text-gp-text">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="m-0 text-gp-white text-[22px] font-bold">
            🎯 Dashboard CRM
          </h2>
          <div className="text-gp-muted text-[13px] mt-0.5">
            Visão consolidada de relacionamento: funil, segmentos, retenção e performance
          </div>
        </div>
        <select
          value={janela}
          onChange={(e) => setJanela(parseInt(e.target.value, 10))}
          aria-label="Janela de tempo"
          className="bg-gp-card text-gp-text text-[13px] rounded-md"
          style={{
            border: `1px solid ${C.border}`,
            padding: "8px 12px",
            width: 200,
          }}
        >
          <option value={90}>Últimos 90 dias</option>
          <option value={180}>Últimos 180 dias</option>
          <option value={365}>Últimos 365 dias</option>
          <option value={730}>Últimos 2 anos</option>
        </select>
      </div>

      {erro && (
        <div
          className="px-[14px] py-[10px] rounded-lg mb-3 text-[13px] text-gp-red"
          style={{ background: C.red + "22" }}
        >
          {erro}
        </div>
      )}

      {carregando || !dados ? (
        <div className="text-gp-muted py-10 text-center">Calculando métricas...</div>
      ) : (
        <>
          <KpisTop dados={dados} />
          <div
            className="grid gap-4 mt-4 gp-crm-grid"
            style={{ gridTemplateColumns: "1.4fr 1fr" }}
          >
            <BlocoFunil funil={dados.funil} />
            <BlocoSegmentos segmentos={dados.clientes.segmentos} totalClientes={dados.clientes.total} />
          </div>
          <div
            className="grid grid-cols-2 gap-4 mt-4 gp-crm-grid"
          >
            <BlocoTopLtv clientes={dados.topLtv} />
            <BlocoEmRisco clientes={dados.emRisco} />
          </div>
          <div className="mt-4">
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

function KpisTop({ dados }: { dados: DashboardData }) {
  const { funil, clientes, tarefas } = dados;
  return (
    <div
      className="grid gap-[10px]"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
    >
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

interface KpiProps {
  label: string;
  valor: string;
  icone: string;
  cor: string;
  sub?: string;
  subCor?: string;
}

function Kpi({ label, valor, icone, cor, sub, subCor }: KpiProps) {
  return (
    <div
      className="bg-gp-surface rounded-lg"
      style={{
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${cor}`,
        padding: "12px 14px",
      }}
    >
      <div
        className="flex items-center gap-1.5 text-gp-muted text-[11px] uppercase font-semibold"
        style={{ letterSpacing: 0.5 }}
      >
        <span>{icone}</span> {label}
      </div>
      <div className="text-gp-white text-[22px] font-bold mt-1">{valor}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: subCor || C.muted }}>{sub}</div>}
    </div>
  );
}

// ============ BLOCO FUNIL VISUAL ============

function BlocoFunil({ funil }: { funil: FunilData }) {
  const maxQtd = Math.max(...ETAPAS.map((e) => funil.porEtapa[e.id]?.quantidade || 0), 1);
  return (
    <Card titulo="Funil de Vendas" subtitulo="Distribuição de oportunidades por etapa">
      <div className="flex flex-col gap-1.5">
        {ETAPAS.map((e) => {
          const d = funil.porEtapa[e.id] || { quantidade: 0, valorEstimado: 0, valorPonderado: 0 };
          const pct = maxQtd > 0 ? (d.quantidade / maxQtd) * 100 : 0;
          return (
            <div key={e.id}>
              <div className="flex items-center justify-between mb-[3px] text-xs">
                <span
                  className="font-bold inline-flex items-center gap-1"
                  style={{ color: e.cor }}
                >
                  <span>{e.icone}</span> {e.label}
                </span>
                <span className="text-gp-text">
                  <strong>{d.quantidade}</strong>{" · "}
                  <span className="text-gp-muted">{fmtBRL(d.valorEstimado)}</span>
                  {e.id !== "GANHO" && e.id !== "PERDIDO" && d.valorPonderado > 0 && (
                    <span style={{ color: "#7c3aed" }} title="Forecast ponderado (valor × probabilidade)">
                      {" · 🔮 "}{fmtBRL(d.valorPonderado)}
                    </span>
                  )}
                </span>
              </div>
              <div
                className="w-full overflow-hidden rounded-md"
                style={{
                  height: 12,
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                }}
              >
                <div
                  className="h-full"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${e.cor}, ${e.cor}cc)`,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ============ BLOCO SEGMENTOS ============

interface BlocoSegmentosProps {
  segmentos: Record<string, SegmentoResumo>;
  totalClientes: number;
}

function BlocoSegmentos({ segmentos, totalClientes }: BlocoSegmentosProps) {
  return (
    <Card titulo="Segmentação de Clientes (RFM)" subtitulo="Classificação automática por comportamento">
      <div className="flex flex-col gap-1.5">
        {SEGMENTOS.map((s) => {
          const d = segmentos[s.id] || { quantidade: 0, monetario: 0 };
          const pct = totalClientes > 0 ? (d.quantidade / totalClientes) * 100 : 0;
          return (
            <div key={s.id}>
              <div className="flex items-center justify-between mb-[3px] text-xs">
                <span
                  className="font-bold inline-flex items-center gap-1"
                  style={{ color: s.cor }}
                >
                  <span>{s.icone}</span> {s.label}
                </span>
                <span className="text-gp-text">
                  <strong>{d.quantidade}</strong>
                  <span className="text-gp-muted"> ({pct.toFixed(1)}%)</span>
                  {d.monetario > 0 && (
                    <span className="text-gp-muted ml-1.5">· {fmtBRL(d.monetario)}</span>
                  )}
                </span>
              </div>
              <div
                className="w-full overflow-hidden rounded-md"
                style={{
                  height: 10,
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                }}
              >
                <div
                  className="h-full"
                  style={{
                    width: `${pct}%`,
                    background: s.cor,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ============ BLOCO TOP LTV ============

function BlocoTopLtv({ clientes }: { clientes: ClienteTop[] }) {
  return (
    <Card titulo="Top 10 — Maior LTV" subtitulo="Clientes que mais geram receita">
      {clientes.length === 0 ? (
        <Vazio msg="Nenhum cliente com compras no período" />
      ) : (
        <div className="flex flex-col">
          {clientes.map((c, i) => {
            const seg = SEG_MAP[c.segmento];
            return (
              <div
                key={c.id}
                className="flex items-center gap-2.5"
                style={{
                  padding: "8px 0",
                  borderBottom: i === clientes.length - 1 ? "none" : `1px solid ${C.border}`,
                }}
              >
                <div
                  className="rounded-full flex items-center justify-center font-bold text-[11px] flex-shrink-0"
                  style={{
                    width: 24,
                    height: 24,
                    background: i < 3 ? "#f59e0b22" : C.bg,
                    color: i < 3 ? "#f59e0b" : C.muted,
                  }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-gp-white text-xs font-semibold overflow-hidden text-ellipsis whitespace-nowrap">
                    {c.nome}
                  </div>
                  <div className="text-gp-muted text-[10px]">
                    {c.qtdCompras} compra(s) · {seg?.label || "—"}
                  </div>
                </div>
                <div className="text-gp-green font-bold text-[13px] flex-shrink-0">
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

function BlocoEmRisco({ clientes }: { clientes: ClienteRisco[] }) {
  return (
    <Card titulo="Clientes em risco" subtitulo="Compraram antes mas pararam — priorize reativação"
          corBorda={C.yellow}>
      {clientes.length === 0 ? (
        <Vazio msg="Nenhum cliente em risco no período 🎉" />
      ) : (
        <div className="flex flex-col">
          {clientes.map((c, i) => (
            <div
              key={c.id}
              className="flex items-center gap-2.5"
              style={{
                padding: "8px 0",
                borderBottom: i === clientes.length - 1 ? "none" : `1px solid ${C.border}`,
              }}
            >
              <div className="text-base flex-shrink-0">⚠️</div>
              <div className="flex-1 min-w-0">
                <div className="text-gp-white text-xs font-semibold overflow-hidden text-ellipsis whitespace-nowrap">
                  {c.nome}
                </div>
                <div
                  className="text-[10px]"
                  style={{ color: c.recenciaDias != null && c.recenciaDias > 90 ? C.red : C.muted }}
                >
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

function BlocoPerformance({ performance }: { performance: PerformanceItem[] }) {
  return (
    <Card titulo="Performance comercial" subtitulo="Vendas, ganhos no funil e carga de tarefas por vendedor">
      {performance.length === 0 ? (
        <Vazio msg="Nenhum vendedor ativo" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr
                className="text-gp-muted text-[10px] uppercase"
                style={{ letterSpacing: 0.5 }}
              >
                <th style={thStyle}>Vendedor</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Vendas</th>
                <th style={{ ...thStyle, textAlign: "right" }}>R$ Vendido</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Ganhos funil</th>
                <th style={{ ...thStyle, textAlign: "right" }}>R$ Ganho</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Tarefas abertas</th>
              </tr>
            </thead>
            <tbody>
              {performance.map((p) => (
                <tr key={p.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={tdStyle}>
                    <div className="text-gp-white font-semibold">{p.nome}</div>
                    <div className="text-gp-muted text-[10px]">{p.role}</div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }} className="text-gp-text">{p.vendasQuantidade}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }} className="text-gp-green font-bold">{fmtBRL(p.vendasTotal)}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }} className="text-gp-text">{p.oportunidadesGanhas}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }} className="text-gp-muted">{fmtBRL(p.valorGanho)}</td>
                  <td
                    style={{ ...tdStyle, textAlign: "center", color: p.tarefasAbertas > 5 ? C.yellow : C.text }}
                  >
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

const thStyle: CSSProperties = { padding: "8px 10px", textAlign: "left", fontWeight: 700 };
const tdStyle: CSSProperties = { padding: "8px 10px", verticalAlign: "middle" };

// ============ CARD WRAPPER ============

interface CardProps {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
  corBorda?: string;
}

function Card({ titulo, subtitulo, children, corBorda }: CardProps) {
  return (
    <div
      className="bg-gp-surface rounded-lg"
      style={{
        border: `1px solid ${C.border}`,
        borderTop: corBorda ? `2px solid ${corBorda}` : undefined,
        padding: "14px 16px",
      }}
    >
      <div className="mb-2.5">
        <div className="text-gp-white text-sm font-bold">{titulo}</div>
        {subtitulo && <div className="text-gp-muted text-[11px] mt-px">{subtitulo}</div>}
      </div>
      {children}
    </div>
  );
}

function Vazio({ msg }: { msg: string }) {
  return (
    <div className="text-gp-muted text-xs italic text-center py-5">
      {msg}
    </div>
  );
}
