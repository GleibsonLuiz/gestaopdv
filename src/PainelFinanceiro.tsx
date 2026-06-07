// PainelFinanceiro.tsx — painel executivo do modulo de Contabilidade.
//
// Visao gerencial (dono), nao o fechamento do contador. Transforma despesas,
// contas a pagar/receber e vendas do PDV em 4 blocos de decisao rapida:
//   1. KPIs   — Faturamento Liquido Real, Receitas, Despesas, Margem.
//   2. Donut  — distribuicao de despesas por categoria (Pareto: top 5 + Outros).
//   3. Breakeven — quanto precisa faturar para cobrir os custos fixos.
//   4. Projecao  — fluxo de caixa dos proximos 30 dias (a receber x a pagar),
//      pintando de vermelho os dias em que o saldo projetado fica negativo.
//
// Todos os numeros vem agregados do banco (GET /contabilidade/dashboard) —
// o componente so desenha. Graficos em SVG puro (mesmo padrao do Dashboard),
// 100% aderentes ao tema escuro via CSS vars (C).

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";

const FONT_MONO = `"JetBrains Mono", ui-monospace, "Courier New", monospace`;

const fmtBRL = (v: unknown) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Compacto p/ eixos e legendas (R$ 12,5k). Mantem sinal.
const fmtCompacto = (v: number) => {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  const sinal = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sinal}R$ ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sinal}R$ ${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${sinal}R$ ${abs.toFixed(0)}`;
};

const fmtPct = (frac: number, casas = 1) =>
  `${(Number(frac) * 100).toFixed(casas)}%`;

const fmtDiaCurto = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

// Paleta para fatias de categoria (consistente com o resto do dashboard).
const CORES_CAT = [C.accent, C.purple, C.yellow, C.green, "#e0729a", C.muted];

interface CategoriaDespesa { codigo: string | null; nome: string; valor: number; }
interface DiaProjecao { dia: string; aReceber: number; aPagar: number; saldoAcumulado: number; alerta: boolean; }

interface PainelData {
  periodo: { inicio: string; fim: string };
  kpis: {
    receitas: { vendasPdv: number; recebimentosAvulsos: number; total: number; qtdVendas: number };
    despesas: { operacionais: number; contasPagas: number; total: number };
    faturamentoLiquido: number;
    margemContribuicaoPct: number;
    cmv: number;
  };
  despesasPorCategoria: CategoriaDespesa[];
  breakeven: {
    custosFixos: number;
    margemContribuicaoPct: number;
    faturamentoEquilibrio: number | null;
    faturamentoAtual: number;
    atingidoPct: number | null;
  };
  serie: Array<{ dia: string; entrada: number; saida: number }>;
  projecao: {
    saldoInicial: number;
    atrasadoReceber: number;
    atrasadoPagar: number;
    dias: DiaProjecao[];
  };
}

export default function PainelFinanceiro({ inicio, fim }: { inicio: string; fim: string }) {
  const [dados, setDados] = useState<PainelData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro("");
    api.contabilidadeDashboard({ inicio, fim })
      .then((r) => { if (vivo) setDados(r as PainelData); })
      .catch((e) => { if (vivo) setErro((e as Error).message); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [inicio, fim]);

  if (carregando && !dados) return <Skeleton />;
  if (erro) return <Aviso texto={erro} />;
  if (!dados) return null;

  const k = dados.kpis;
  const liqPositivo = k.faturamentoLiquido >= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ===== KPIs ===== */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        <Kpi
          destaque
          cor={liqPositivo ? C.green : C.red}
          rotulo="Faturamento líquido real"
          valor={fmtBRL(k.faturamentoLiquido)}
          hint="(vendas + recebidos) − (despesas + contas pagas)"
        />
        <Kpi
          cor={C.accent}
          rotulo="Receitas no período"
          valor={fmtBRL(k.receitas.total)}
          hint={`${k.receitas.qtdVendas} vendas PDV · ${fmtBRL(k.receitas.recebimentosAvulsos)} avulsos`}
        />
        <Kpi
          cor={C.red}
          rotulo="Despesas realizadas"
          valor={fmtBRL(k.despesas.total)}
          hint={`oper. ${fmtBRL(k.despesas.operacionais)} · contas ${fmtBRL(k.despesas.contasPagas)}`}
        />
        <Kpi
          cor={C.yellow}
          rotulo="Margem de contribuição"
          valor={k.margemContribuicaoPct > 0 ? fmtPct(k.margemContribuicaoPct) : "—"}
          hint={k.cmv > 0 ? `CMV ${fmtBRL(k.cmv)} no período` : "produtos sem custo cadastrado"}
        />
      </div>

      {/* ===== Donut categorias + Breakeven ===== */}
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        <DonutDespesas categorias={dados.despesasPorCategoria} total={k.despesas.total} />
        <Breakeven b={dados.breakeven} />
      </div>

      {/* ===== Entradas x Saídas (série do período) ===== */}
      <SerieEntradasSaidas serie={dados.serie} />

      {/* ===== Projeção de fluxo de caixa 30 dias ===== */}
      <ProjecaoFluxo proj={dados.projecao} />
    </div>
  );
}

// ============================================================
// KPI card
// ============================================================

function Kpi({ rotulo, valor, hint, cor, destaque }: {
  rotulo: string; valor: string; hint: string; cor: string; destaque?: boolean;
}) {
  return (
    <div style={{
      background: destaque
        ? `linear-gradient(180deg, ${cor}1f, ${C.card})`
        : `linear-gradient(180deg, ${C.card}, ${C.surface})`,
      border: `1px solid ${destaque ? cor + "55" : C.border}`,
      borderRadius: 14, padding: 16,
    }}>
      <div style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, fontWeight: 700 }}>
        {rotulo}
      </div>
      <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.02em", color: cor, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
        {valor}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 6, fontFamily: FONT_MONO }}>{hint}</div>
    </div>
  );
}

// ============================================================
// Donut de despesas por categoria (Pareto: top 5 + Outros)
// ============================================================

function DonutDespesas({ categorias, total }: { categorias: CategoriaDespesa[]; total: number }) {
  // Pareto: as 5 maiores; o restante vira um bloco "Outros" para nao virar
  // arco-iris ilegivel quando ha dezenas de categorias.
  const fatias = useMemo(() => {
    const top = categorias.slice(0, 5).map((c) => ({ nome: c.nome, codigo: c.codigo, valor: c.valor }));
    const resto = categorias.slice(5);
    if (resto.length > 0) {
      const soma = resto.reduce((s, c) => s + c.valor, 0);
      if (soma > 0) top.push({ nome: `Outros (${resto.length})`, codigo: null, valor: soma });
    }
    return top;
  }, [categorias]);

  const r = 46, cx = 60, cy = 60, circ = 2 * Math.PI * r;
  let offset = 0;
  const arcos = fatias.map((f, i) => {
    const pct = total > 0 ? f.valor / total : 0;
    const dash = pct * circ;
    const a = { cor: CORES_CAT[i % CORES_CAT.length], dash, offset: -offset, pct };
    offset += dash;
    return a;
  });

  return (
    <Card titulo="Distribuição de despesas" meta={fmtBRL(total)}>
      {fatias.length === 0 ? (
        <Vazio texto="Nenhuma despesa no período." />
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginTop: 4 }}>
          <svg viewBox="0 0 120 120" width={120} height={120} style={{ flexShrink: 0 }}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeWidth="14" />
            {arcos.map((a, i) => (
              <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={a.cor} strokeWidth="14"
                strokeDasharray={`${a.dash} ${circ}`} strokeDashoffset={a.offset}
                transform={`rotate(-90 ${cx} ${cy})`} />
            ))}
            <text x={cx} y={cy - 1} textAnchor="middle" style={{ fill: C.white, fontSize: 11, fontWeight: 700 }}>
              {fatias.length}
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" style={{ fill: C.muted, fontSize: 8, letterSpacing: "0.14em" }}>
              CATEGORIAS
            </text>
          </svg>
          <div style={{ flex: 1, minWidth: 200 }}>
            {fatias.map((f, i) => {
              const pct = total > 0 ? (f.valor / total) * 100 : 0;
              return (
                <div key={f.nome} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < fatias.length - 1 ? `1px dashed ${C.border}` : "0" }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: CORES_CAT[i % CORES_CAT.length], flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: C.white, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {f.codigo ? <span style={{ color: C.muted, fontFamily: FONT_MONO, fontSize: 10.5, marginRight: 5 }}>{f.codigo}</span> : null}
                    {f.nome}
                  </span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.muted, fontWeight: 600 }}>{pct.toFixed(0)}%</span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: C.text, fontWeight: 700, minWidth: 84, textAlign: "right" }}>{fmtBRL(f.valor)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

// ============================================================
// Ponto de equilíbrio (Breakeven)
// ============================================================

function Breakeven({ b }: { b: PainelData["breakeven"] }) {
  const temMargem = b.margemContribuicaoPct > 0 && b.faturamentoEquilibrio != null;
  const atingido = b.atingidoPct ?? 0;
  const corBarra = atingido >= 100 ? C.green : atingido >= 70 ? C.yellow : C.accent;
  // Largura da barra de progresso: faturamento atual sobre o ponto de
  // equilibrio, com teto visual de 130% para nao estourar o card.
  const larguraAtual = Math.min(130, atingido);
  // Posicao do marcador de "equilibrio" (100%) na mesma escala de 0..130%.
  const posEquilibrio = (100 / 130) * 100;

  return (
    <Card titulo="Ponto de equilíbrio" meta={temMargem ? `margem ${fmtPct(b.margemContribuicaoPct, 0)}` : "—"}>
      {!temMargem ? (
        <Vazio texto="Sem dados de margem no período (cadastre o custo dos produtos para calcular o ponto de equilíbrio)." />
      ) : (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, fontWeight: 700 }}>
                Precisa faturar
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: C.white, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                {fmtBRL(b.faturamentoEquilibrio)}
              </div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, fontWeight: 700 }}>
                Já faturado
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: corBarra, fontFamily: FONT_MONO }}>
                {fmtBRL(b.faturamentoAtual)} · {atingido.toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Barra de progresso com marcador no ponto de equilibrio (100%) */}
          <div style={{ position: "relative", height: 14, borderRadius: 999, background: "rgba(255,255,255,0.05)", marginTop: 16, overflow: "hidden" }}>
            <div style={{ width: `${Math.max(2, larguraAtual)}%`, height: "100%", background: `linear-gradient(90deg, ${corBarra}, ${corBarra}cc)`, borderRadius: 999 }} />
          </div>
          <div style={{ position: "relative", height: 16, marginTop: 2 }}>
            <div style={{ position: "absolute", left: `${posEquilibrio}%`, top: -20, height: 18, borderLeft: `2px dashed ${C.muted}` }} />
            <div style={{ position: "absolute", left: `${posEquilibrio}%`, top: 0, transform: "translateX(-50%)", fontSize: 9.5, color: C.muted, whiteSpace: "nowrap", fontFamily: FONT_MONO }}>
              equilíbrio
            </div>
          </div>

          <div style={{
            marginTop: 10, fontSize: 12, fontWeight: 600, padding: "7px 10px", borderRadius: 8,
            background: (atingido >= 100 ? C.green : C.yellow) + "1c",
            border: `1px solid ${(atingido >= 100 ? C.green : C.yellow)}44`,
            color: atingido >= 100 ? C.green : C.yellow,
          }}>
            {atingido >= 100
              ? `✓ Acima do equilíbrio — lucro estimado de ${fmtBRL(b.faturamentoAtual - (b.faturamentoEquilibrio || 0))} sobre os custos fixos.`
              : `Faltam ${fmtBRL((b.faturamentoEquilibrio || 0) - b.faturamentoAtual)} em vendas para cobrir os custos fixos (${fmtBRL(b.custosFixos)}).`}
          </div>
        </div>
      )}
    </Card>
  );
}

// ============================================================
// Série diária: entradas x saídas no período
// ============================================================

function SerieEntradasSaidas({ serie }: { serie: PainelData["serie"] }) {
  if (!serie || serie.length === 0) {
    return <Card titulo="Entradas × saídas"><Vazio texto="Sem movimento no período." /></Card>;
  }

  const W = 760, H = 200, padL = 48, padR = 12, padT = 14, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = Math.max(1, ...serie.flatMap((d) => [d.entrada, d.saida]));
  const n = serie.length;
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const path = (sel: (d: PainelData["serie"][number]) => number) =>
    serie.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(sel(d)).toFixed(1)}`).join(" ");
  const area = (sel: (d: PainelData["serie"][number]) => number) =>
    `${path(sel)} L${x(n - 1).toFixed(1)},${padT + innerH} L${x(0).toFixed(1)},${padT + innerH} Z`;

  const totalEnt = serie.reduce((s, d) => s + d.entrada, 0);
  const totalSai = serie.reduce((s, d) => s + d.saida, 0);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <Card
      titulo="Entradas × saídas no período"
      meta={<span style={{ fontFamily: FONT_MONO }}>
        <span style={{ color: C.green }}>+{fmtBRL(totalEnt)}</span> · <span style={{ color: C.red }}>−{fmtBRL(totalSai)}</span>
      </span>}
    >
      <Legenda itens={[{ cor: C.green, txt: "Entradas (vendas)" }, { cor: C.red, txt: "Saídas (despesas + contas pagas)" }]} />
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H }}>
        <defs>
          <linearGradient id="pf-ent" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={C.green} stopOpacity="0.35" /><stop offset="100%" stopColor={C.green} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="pf-sai" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={C.red} stopOpacity="0.28" /><stop offset="100%" stopColor={C.red} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => {
          const yy = padT + innerH - t * innerH;
          return (
            <g key={i}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <text x={padL - 6} y={yy + 3} textAnchor="end" style={{ fill: C.muted, fontSize: 9.5, fontFamily: FONT_MONO, opacity: 0.7 }}>
                {fmtCompacto(max * t)}
              </text>
            </g>
          );
        })}
        <path d={area((d) => d.entrada)} fill="url(#pf-ent)" />
        <path d={area((d) => d.saida)} fill="url(#pf-sai)" />
        <path d={path((d) => d.entrada)} fill="none" stroke={C.green} strokeWidth="1.8" />
        <path d={path((d) => d.saida)} fill="none" stroke={C.red} strokeWidth="1.8" />
        {/* rotulos de data: primeiro, meio e ultimo (evita poluir) */}
        {[0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" style={{ fill: C.muted, fontSize: 9.5, fontFamily: FONT_MONO }}>
            {fmtDiaCurto(serie[i].dia)}
          </text>
        ))}
      </svg>
    </Card>
  );
}

// ============================================================
// Projeção de fluxo de caixa — próximos 30 dias
// ============================================================

function ProjecaoFluxo({ proj }: { proj: PainelData["projecao"] }) {
  const dias = proj.dias;
  // Acumulados de a receber / a pagar (as duas linhas que "se cruzam").
  const { cumReceber, cumPagar } = useMemo(() => {
    const cr: number[] = []; const cp: number[] = [];
    let r = 0, p = 0;
    for (const d of dias) { r += d.aReceber; p += d.aPagar; cr.push(r); cp.push(p); }
    return { cumReceber: cr, cumPagar: cp };
  }, [dias]);

  const saldoFinal = dias.length ? dias[dias.length - 1].saldoAcumulado : proj.saldoInicial;
  const primeiroNegativo = dias.find((d) => d.alerta) || null;

  const W = 760, H = 240, padL = 52, padR = 14, padT = 16, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const saldos = dias.map((d) => d.saldoAcumulado);
  const maxV = Math.max(proj.saldoInicial, ...cumReceber, ...cumPagar, ...saldos, 0);
  const minV = Math.min(0, ...saldos);
  const span = maxV - minV || 1;
  const n = dias.length || 1;
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((v - minV) / span) * innerH;
  const yZero = y(0);

  const linha = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <Card
      titulo="Projeção de fluxo de caixa — próximos 30 dias"
      meta={<span style={{ fontFamily: FONT_MONO, color: saldoFinal < 0 ? C.red : C.green }}>
        saldo projetado {fmtBRL(saldoFinal)}
      </span>}
    >
      <Legenda itens={[
        { cor: C.green, txt: "A receber (acum.)" },
        { cor: C.red, txt: "A pagar (acum.)" },
        { cor: C.accent, txt: "Saldo projetado" },
      ]} />

      {(proj.atrasadoReceber > 0 || proj.atrasadoPagar > 0) && (
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, fontFamily: FONT_MONO }}>
          Inclui vencidos no dia 1: <span style={{ color: C.green }}>+{fmtBRL(proj.atrasadoReceber)}</span> / <span style={{ color: C.red }}>−{fmtBRL(proj.atrasadoPagar)}</span> · saldo inicial {fmtBRL(proj.saldoInicial)}
        </div>
      )}

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, overflow: "visible" }}>
        <defs>
          <linearGradient id="pf-neg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={C.red} stopOpacity="0" /><stop offset="100%" stopColor={C.red} stopOpacity="0.30" />
          </linearGradient>
        </defs>

        {ticks.map((t, i) => {
          const v = minV + t * span;
          const yy = y(v);
          return (
            <g key={i}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <text x={padL - 6} y={yy + 3} textAnchor="end" style={{ fill: C.muted, fontSize: 9.5, fontFamily: FONT_MONO, opacity: 0.7 }}>
                {fmtCompacto(v)}
              </text>
            </g>
          );
        })}

        {/* Zona de saldo negativo (abaixo do zero) — pintada de vermelho */}
        {minV < 0 && (
          <rect x={padL} y={yZero} width={innerW} height={padT + innerH - yZero} fill="url(#pf-neg)" />
        )}
        <line x1={padL} y1={yZero} x2={W - padR} y2={yZero} stroke={C.red} strokeWidth="1" strokeOpacity={minV < 0 ? 0.6 : 0.25} />

        <path d={linha(cumReceber)} fill="none" stroke={C.green} strokeWidth="1.6" strokeOpacity="0.85" />
        <path d={linha(cumPagar)} fill="none" stroke={C.red} strokeWidth="1.6" strokeOpacity="0.85" />
        <path d={linha(saldos)} fill="none" stroke={C.accent} strokeWidth="2.4" />

        {/* Marcadores nos dias com saldo negativo */}
        {dias.map((d, i) => d.alerta ? (
          <circle key={i} cx={x(i)} cy={y(d.saldoAcumulado)} r={2.6} fill={C.red} />
        ) : null)}

        {/* Datas: dia 1, ~15 e 30 */}
        {[0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" style={{ fill: C.muted, fontSize: 9.5, fontFamily: FONT_MONO }}>
            {fmtDiaCurto(dias[i].dia)}
          </text>
        ))}
      </svg>

      <div style={{
        marginTop: 6, fontSize: 12, fontWeight: 600, padding: "8px 11px", borderRadius: 8,
        background: (primeiroNegativo ? C.red : C.green) + "1c",
        border: `1px solid ${(primeiroNegativo ? C.red : C.green)}44`,
        color: primeiroNegativo ? C.red : C.green,
      }}>
        {primeiroNegativo
          ? `⚠ O saldo projetado fica negativo em ${fmtDiaCurto(primeiroNegativo.dia)} — antecipe cobranças ou segure pagamentos.`
          : "✓ Saldo projetado permanece positivo nos próximos 30 dias."}
      </div>
    </Card>
  );
}

// ============================================================
// UI helpers
// ============================================================

function Card({ titulo, meta, children }: { titulo: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <article style={{ background: `linear-gradient(180deg, ${C.card}, ${C.surface})`, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.text }}>{titulo}</h3>
        {meta && <span style={{ marginLeft: "auto", fontSize: 11.5, color: C.muted }}>{meta}</span>}
      </div>
      {children}
    </article>
  );
}

function Legenda({ itens }: { itens: Array<{ cor: string; txt: string }> }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: C.muted, marginBottom: 8 }}>
      {itens.map((it) => (
        <span key={it.txt} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 3, borderRadius: 2, background: it.cor }} />{it.txt}
        </span>
      ))}
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <div style={{ color: C.muted, padding: "22px 8px", textAlign: "center", fontSize: 13 }}>{texto}</div>;
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div style={{ background: C.red + "22", border: `1px solid ${C.red}`, color: C.text, padding: "10px 14px", borderRadius: 10 }}>
      {texto}
    </div>
  );
}

function Skeleton() {
  const bloco: CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, height: 96 };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
        {[0, 1, 2, 3].map((i) => <div key={i} style={bloco} />)}
      </div>
      <div style={{ ...bloco, height: 260 }} />
      <div style={{ ...bloco, height: 240 }} />
    </div>
  );
}
