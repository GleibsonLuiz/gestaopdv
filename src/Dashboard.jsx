import { useCallback, useEffect, useMemo, useState } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";


const FONT_SANS = `"Manrope", "Segoe UI", system-ui, sans-serif`;
const FONT_MONO = `"JetBrains Mono", ui-monospace, "Courier New", monospace`;

const fmtBRL = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtBRLSplit = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return { reais: "—", centavos: "" };
  const fixed = Math.abs(n).toFixed(2);
  const [reais, centavos] = fixed.split(".");
  const reaisFmt = Number(reais).toLocaleString("pt-BR");
  const sinal = n < 0 ? "-" : "";
  return { reais: `${sinal}R$ ${reaisFmt}`, centavos: `,${centavos}` };
};

const fmtNumero = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR");
};

const fmtDataHora = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const fmtDiaCurto = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const fmtDiaSemana = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").toUpperCase();
};

function saudacao(nome) {
  const agora = new Date();
  const h = agora.getHours();
  const periodo = h < 12 ? "bom dia" : h < 18 ? "boa tarde" : "boa noite";
  const primeiro = (nome || "").split(" ")[0] || "";
  return primeiro
    ? `Olá, ${primeiro} — ${periodo}.`
    : `Olá — ${periodo}.`;
}

const ROTULO_PAGAMENTO = {
  DINHEIRO: "Dinheiro",
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO_DEBITO: "Cartão de débito",
  PIX: "Pix",
  BOLETO: "Boleto",
  CREDIARIO: "Crediário",
};

const fmtPercentual = (v) => {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  const sinal = n > 0 ? "+" : "";
  return `${sinal}${n.toFixed(1)}%`;
};

function niceMax(v) {
  const n = Math.max(1, Number(v) || 1);
  const exp = Math.floor(Math.log10(n));
  const base = Math.pow(10, exp);
  const ratio = n / base;
  let mult;
  if (ratio <= 1) mult = 1;
  else if (ratio <= 2) mult = 2;
  else if (ratio <= 2.5) mult = 2.5;
  else if (ratio <= 5) mult = 5;
  else mult = 10;
  return mult * base;
}

// ============================================================
// Dashboard (raiz) — auto-refresh + skeleton
// ============================================================

export default function Dashboard({ user }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [contagem, setContagem] = useState(60);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.obterDashboard();
      setDados(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
      setContagem(60);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Decrementa o contador a cada segundo (só quando não está carregando)
  useEffect(() => {
    if (carregando) return;
    const timer = setInterval(() => {
      setContagem(c => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [carregando]);

  // Dispara recarga quando o contador chega a zero
  useEffect(() => {
    if (contagem === 0 && !carregando) {
      carregar();
    }
  }, [contagem, carregando, carregar]);

  if (carregando && !dados) {
    return <SkeletonDashboard />;
  }

  if (erro) {
    return (
      <div style={{
        padding: "12px 14px", borderRadius: 8,
        background: C.red + "22", border: `1px solid ${C.red}55`,
        color: C.red, fontSize: 13, fontFamily: FONT_SANS,
      }}>
        {erro}
        <button onClick={carregar} style={{
          marginLeft: 12, background: "transparent", border: `1px solid ${C.red}55`,
          color: C.red, borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer",
        }}>Tentar novamente</button>
      </div>
    );
  }

  if (!dados) return null;
  return <ConteudoDashboard dados={dados} onAtualizar={carregar} user={user} contagem={contagem} />;
}

// ============================================================
// Skeleton loading
// ============================================================

function SkeletonDashboard() {
  return (
    <div style={{ fontFamily: FONT_SANS }}>
      <style>{`@keyframes shimmer{0%,100%{opacity:.35}50%{opacity:.6}}`}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <SkLine w={240} h={24} mb={10} />
          <SkLine w={320} h={12} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <SkLine w={240} h={34} r={10} />
          <SkLine w={96} h={34} r={8} />
        </div>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {/* KPI row — 5 cards */}
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
              borderRadius: 14, padding: 18, animation: "shimmer 1.6s ease-in-out infinite",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <SkLine w={34} h={34} r={9} />
                <SkLine w={90} h={10} r={4} />
              </div>
              <SkLine w="75%" h={26} r={6} mb={10} />
              <SkLine w="50%" h={10} r={4} />
            </div>
          ))}
        </div>

        {/* Mini-tiles — 7 */}
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          {[...Array(7)].map((_, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
              borderRadius: 14, padding: "14px 16px", display: "flex", gap: 12,
              animation: "shimmer 1.6s ease-in-out infinite",
            }}>
              <SkLine w={30} h={30} r={8} />
              <div style={{ flex: 1 }}>
                <SkLine w="50%" h={10} r={4} mb={8} />
                <SkLine w="70%" h={20} r={4} />
              </div>
            </div>
          ))}
        </div>

        {/* Chart row */}
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)" }}>
          <div style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
            borderRadius: 14, height: 320,
            animation: "shimmer 1.6s ease-in-out infinite",
          }} />
          <div style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`,
            borderRadius: 14, height: 320,
            animation: "shimmer 1.6s ease-in-out infinite",
          }} />
        </div>
      </div>
    </div>
  );
}

function SkLine({ w, h, r = 6, mb = 0 }) {
  return (
    <div style={{
      width: typeof w === "number" ? w : w,
      height: h, borderRadius: r, marginBottom: mb,
      background: "rgba(255,255,255,0.08)",
      animation: "shimmer 1.6s ease-in-out infinite",
      flexShrink: 0,
    }} />
  );
}

// ============================================================
// Conteudo principal
// ============================================================

function ConteudoDashboard({ dados, onAtualizar, user, contagem }) {
  const k = dados.kpis;

  const totalFormas = useMemo(
    () => (dados.formasPagamento || []).reduce((a, f) => a + Number(f.total || 0), 0),
    [dados.formasPagamento]
  );

  const totalSemana = useMemo(
    () => (dados.vendasPorDia || []).reduce((a, d) => a + (Number(d.total) || 0), 0),
    [dados.vendasPorDia]
  );

  const variacaoMes = fmtPercentual(k.vendasMes.variacaoPercentual);
  const tipoVariacao =
    k.vendasMes.variacaoPercentual === null ? "flat" :
    k.vendasMes.variacaoPercentual > 0 ? "up" :
    k.vendasMes.variacaoPercentual < 0 ? "down" : "flat";

  const tickets = Number(k.vendasHoje.quantidade) || 0;
  const ticketHoje = tickets > 0 ? Number(k.vendasHoje.total) / tickets : 0;

  // Margem bruta
  const margemValor = k.margemBruta?.valor ?? 0;
  const margemPct = k.margemBruta?.percentual ?? null;
  const margemFmt = fmtPercentual(margemPct);
  const margemTipo = margemValor < 0 ? "down" : margemPct !== null && margemPct >= 20 ? "up" : "flat";

  return (
    <div style={{ fontFamily: FONT_SANS, color: C.text }}>
      {/* HERO */}
      <header style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        gap: 16, marginBottom: 18, flexWrap: "wrap",
      }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em",
            color: C.white, fontFamily: FONT_SANS,
          }}>
            {saudacao(user?.nome)}
          </h1>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 6 }}>
            Visão geral do negócio · vendas, estoque e financeiro ·{" "}
            <b style={{ color: C.text, fontWeight: 600 }}>
              atualizado {fmtDataHora(dados.geradoEm)}
            </b>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SegmentedPeriodo />
          <BotaoAtualizar onClick={onAtualizar} contagem={contagem} />
        </div>
      </header>

      <div style={{ display: "grid", gap: 14 }}>

        {/* ========= KPIs (5 cards) ========= */}
        <section style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        }}>
          <KpiCard
            cor={C.accent}
            icone={<IconCart />}
            rotulo="Vendas hoje"
            valor={fmtBRLSplit(k.vendasHoje.total)}
            descricao={`${fmtNumero(tickets)} ${tickets === 1 ? "venda" : "vendas"} · ticket ${fmtBRL(ticketHoje)}`}
            comparativo="hoje"
            sparkline={<Sparkline cor={C.accent} pontos={(dados.vendasPorDia || []).map(d => d.total)} />}
          />
          <KpiCard
            cor={C.green}
            icone={<IconTrendUp />}
            rotulo="Faturamento do mês"
            valor={fmtBRLSplit(k.vendasMes.total)}
            descricao={`${fmtNumero(k.vendasMes.quantidade)} vendas · ø ${fmtBRL(k.ticketMedioMes)}`}
            comparativo={variacaoMes ? `${variacaoMes} vs. mês anterior` : ""}
            delta={variacaoMes ? { texto: variacaoMes, tipo: tipoVariacao } : null}
            sparkline={<Sparkline cor={C.green} pontos={(dados.vendasPorDia || []).map(d => d.total)} />}
          />
          <KpiCard
            cor={C.yellow}
            icone={<IconTicket />}
            rotulo="Ticket médio (mês)"
            valor={fmtBRLSplit(k.ticketMedioMes)}
            descricao="Média por venda concluída"
            comparativo={`${fmtNumero(k.vendasMes.quantidade)} vendas no mês`}
            sparkline={<Sparkline cor={C.yellow} pontos={(dados.vendasPorDia || []).map(d => d.total)} />}
          />
          <KpiCard
            cor={C.purple}
            icone={<IconBag />}
            rotulo="Compras do mês"
            valor={fmtBRLSplit(k.comprasMes.total)}
            descricao={`${fmtNumero(k.comprasMes.quantidade)} ${k.comprasMes.quantidade === 1 ? "compra registrada" : "compras registradas"}`}
            comparativo={dados.ultimasCompras?.[0]
              ? `última ${new Date(dados.ultimasCompras[0].createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
              : "sem registros"}
            sparkline={null}
          />
          <KpiCard
            cor={margemValor >= 0 ? C.green : C.red}
            icone={<IconMargin />}
            rotulo="Margem bruta (mês)"
            valor={fmtBRLSplit(margemValor)}
            descricao={margemPct !== null ? `${margemPct.toFixed(1)}% do faturamento` : "sem vendas no mês"}
            comparativo={k.vendasCanceladas > 0 ? `${k.vendasCanceladas} cancelada${k.vendasCanceladas > 1 ? "s" : ""}` : "sem cancelamentos"}
            delta={margemFmt ? { texto: margemFmt, tipo: margemTipo } : null}
            sparkline={null}
          />
        </section>

        {/* ========= MINI-TILES (7 tiles) ========= */}
        <section style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        }}>
          <MiniTile icone={<IconPeople />} label="Clientes" valor={fmtNumero(k.clientesAtivos)} hint="ativos" />
          <MiniTile
            icone={<IconPersonPlus />}
            label="Novos clientes"
            valor={fmtNumero(k.novosClientesMes)}
            hint="este mês"
            tagDelta={k.novosClientesMes > 0 ? { texto: "+" + k.novosClientesMes, tipo: "up" } : null}
          />
          <MiniTile icone={<IconBox />} label="Produtos" valor={fmtNumero(k.produtosAtivos)} hint="ativos" />
          <MiniTile
            icone={<IconWarehouse />}
            label="Estoque (valor)"
            valor={fmtBRL(k.valorEstoque)}
            hint="imobilizado"
          />
          <MiniTile icone={<IconTruck />} label="Fornecedores" valor={fmtNumero(k.fornecedoresAtivos)} hint="cadastrados" />
          <MiniTile icone={<IconUser />} label="Funcionários" valor={fmtNumero(k.funcionariosAtivos)} hint="ativos" />
          <MiniTile
            icone={<IconAlert />}
            label="Estoque baixo"
            valor={fmtNumero(k.produtosEstoqueBaixo)}
            hint={k.produtosEstoqueBaixo > 0 ? "requer ação" : "tudo ok"}
            warn={k.produtosEstoqueBaixo > 0}
            tagDelta={k.produtosEstoqueBaixo > 0 ? { texto: "crítico", tipo: "down" } : null}
          />
        </section>

        {/* ========= CHART + TOP PRODUTOS ========= */}
        <section style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)",
        }}>
          <PainelGraficoVendas dados={dados.vendasPorDia || []} totalSemana={totalSemana} />
          <PainelTopProdutos itens={dados.topProdutos || []} totalMes={k.vendasMes.total} />
        </section>

        {/* ========= TOP VENDEDORES + PAGAMENTOS ========= */}
        <section style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
        }}>
          <PainelTopVendedores itens={dados.topVendedores || []} totalMes={k.vendasMes.total} qtdMes={k.vendasMes.quantidade} />
          <PainelFormasPagamento itens={dados.formasPagamento || []} totalGeral={totalFormas} qtdMes={k.vendasMes.quantidade} />
        </section>

        {/* ========= FINANCEIRO ========= */}
        <section style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
        }}>
          <PainelFinanceiro
            tipo="payable"
            titulo="Contas a pagar pendentes"
            icone={<IconBillOut />}
            dados={k.contasPagarPendentes}
          />
          <PainelFinanceiro
            tipo="receive"
            titulo="Contas a receber pendentes"
            icone={<IconBillIn />}
            dados={k.contasReceberPendentes}
          />
        </section>

        {/* ========= PROXIMAS CONTAS + ESTOQUE BAIXO ========= */}
        <section style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
        }}>
          <PainelProximasContas itens={dados.proximasContas || []} />
          <PainelEstoqueBaixo itens={dados.estoqueBaixo || []} />
        </section>

        {/* ========= ULTIMAS VENDAS + ULTIMAS COMPRAS ========= */}
        <section style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
        }}>
          <PainelUltimasVendas itens={dados.ultimasVendas || []} totalHoje={k.vendasHoje.total} qtdHoje={k.vendasHoje.quantidade} />
          <PainelUltimasCompras itens={dados.ultimasCompras || []} />
        </section>

        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          color: C.muted, fontSize: 11, marginTop: 10, fontFamily: FONT_MONO,
          opacity: 0.6,
        }}>
          <div>GestãoPRO · sincronizado · sessão segura</div>
          <div>Atualizado {fmtDataHora(dados.geradoEm)}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// HERO controls
// ============================================================

function SegmentedPeriodo() {
  return (
    <div style={{
      display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 10,
      background: C.card, padding: 3, gap: 2,
    }}>
      {["Hoje", "7 dias", "30 dias", "Mês", "Ano"].map((label) => {
        const ativo = label === "7 dias";
        return (
          <button
            key={label}
            disabled={!ativo}
            title={ativo ? "" : "Em breve"}
            style={{
              border: 0, background: ativo ? "rgba(255,255,255,0.08)" : "transparent",
              color: ativo ? C.white : C.muted,
              height: 28, padding: "0 12px", borderRadius: 7,
              fontSize: 12, fontWeight: 600, letterSpacing: "0.02em",
              fontFamily: FONT_SANS,
              cursor: ativo ? "default" : "not-allowed",
              opacity: ativo ? 1 : 0.55,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function BotaoAtualizar({ onClick, contagem }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        height: 32, padding: "0 14px", borderRadius: 8,
        background: `linear-gradient(180deg, ${C.accent}55, ${C.card})`,
        border: `1px solid ${C.accent}77`, color: C.white,
        fontSize: 12.5, fontWeight: 700, letterSpacing: "0.02em",
        cursor: "pointer", fontFamily: FONT_SANS,
      }}
    >
      <IconRefresh />
      Atualizar
      <span style={{
        fontSize: 10.5, fontFamily: FONT_MONO, color: C.muted,
        marginLeft: 2, fontWeight: 500,
      }}>{contagem}s</span>
    </button>
  );
}

// ============================================================
// KPI Card
// ============================================================

function KpiCard({ cor, icone, rotulo, valor, descricao, comparativo, delta, sparkline }) {
  return (
    <article style={{
      background: `linear-gradient(180deg, ${C.card}, ${C.surface})`,
      border: `1px solid ${C.border}`, borderRadius: 14,
      padding: 18, position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "inherit",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%)",
        pointerEvents: "none",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          display: "grid", placeItems: "center",
          color: cor,
          background: cor + "1f",
          border: `1px solid ${cor}55`,
        }}>{icone}</div>
        <div style={{
          fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
          color: C.muted, fontWeight: 700,
        }}>{rotulo}</div>
        {delta && <DeltaPill {...delta} style={{ marginLeft: "auto" }} />}
      </div>

      <div style={{
        fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em",
        color: C.white, marginTop: 10,
        fontVariantNumeric: "tabular-nums",
        position: "relative",
      }}>
        {valor.reais}
        {valor.centavos && (
          <small style={{
            fontSize: 14, fontWeight: 500, color: C.muted, marginLeft: 1,
          }}>{valor.centavos}</small>
        )}
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginTop: 10, fontSize: 11.5, color: C.muted, gap: 8, position: "relative",
      }}>
        <span>{descricao}</span>
        {comparativo && (
          <span style={{ fontFamily: FONT_MONO }}>{comparativo}</span>
        )}
      </div>

      {sparkline && (
        <div style={{ marginTop: 12, height: 36, position: "relative" }}>
          {sparkline}
        </div>
      )}
    </article>
  );
}

function DeltaPill({ texto, tipo, style }) {
  const cores = {
    up: { bg: C.green + "22", fg: C.green },
    down: { bg: C.red + "22", fg: C.red },
    flat: { bg: "rgba(255,255,255,0.05)", fg: C.muted },
  };
  const cor = cores[tipo] || cores.flat;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontWeight: 600, padding: "2px 8px", borderRadius: 999,
      fontSize: 11, color: cor.fg, background: cor.bg,
      whiteSpace: "nowrap",
      ...style,
    }}>{texto}</span>
  );
}

function Sparkline({ cor, pontos }) {
  if (!pontos || pontos.length < 2) {
    return (
      <svg viewBox="0 0 200 36" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
        <line x1="0" y1="30" x2="200" y2="30" stroke={C.border} strokeDasharray="3 3" />
      </svg>
    );
  }
  const max = Math.max(1, ...pontos.map(Number).filter(Number.isFinite));
  const w = 200, h = 36, top = 4, bot = h - 2;
  const xs = pontos.map((_, i) => (i / (pontos.length - 1)) * w);
  const ys = pontos.map(p => {
    const v = Number(p) || 0;
    return bot - (v / max) * (bot - top);
  });
  const linha = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const fill = `${linha} L${w},${h} L0,${h} Z`;
  const id = "sp-" + Math.random().toString(36).slice(2, 9);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity="0.45" />
          <stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${id})`} />
      <path d={linha} fill="none" stroke={cor} strokeWidth="1.5" />
    </svg>
  );
}

// ============================================================
// Mini-tiles
// ============================================================

function MiniTile({ icone, label, valor, hint, warn, tagDelta }) {
  return (
    <article style={{
      background: warn
        ? `linear-gradient(180deg, ${C.yellow}15, ${C.card})`
        : `linear-gradient(180deg, ${C.card}, ${C.surface})`,
      border: `1px solid ${warn ? C.yellow + "55" : C.border}`,
      borderRadius: 14, padding: "14px 16px",
      display: "flex", alignItems: "center", gap: 12,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "inherit",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%)",
        pointerEvents: "none",
      }} />
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        display: "grid", placeItems: "center",
        color: warn ? C.yellow : C.muted,
        background: warn ? C.yellow + "1f" : "rgba(255,255,255,0.04)",
        border: `1px solid ${warn ? C.yellow + "55" : C.border}`,
      }}>{icone}</div>
      <div style={{ position: "relative" }}>
        <div style={{
          fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
          color: C.muted, fontWeight: 700,
        }}>{label}</div>
        <div style={{
          fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em",
          color: warn ? C.yellow : C.white, marginTop: 2,
          fontVariantNumeric: "tabular-nums",
        }}>{valor}</div>
      </div>
      <div style={{ marginLeft: "auto", textAlign: "right", position: "relative" }}>
        {tagDelta && <DeltaPill {...tagDelta} />}
        {hint && (
          <div style={{
            fontSize: 10, color: C.muted, marginTop: tagDelta ? 4 : 0,
            fontFamily: FONT_MONO,
          }}>{hint}</div>
        )}
      </div>
    </article>
  );
}

// ============================================================
// Cards genéricos
// ============================================================

function Card({ children, padding = 18, style }) {
  return (
    <article style={{
      background: `linear-gradient(180deg, ${C.card}, ${C.surface})`,
      border: `1px solid ${C.border}`, borderRadius: 14,
      padding, position: "relative", overflow: "hidden", ...style,
    }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "inherit",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%)",
        pointerEvents: "none",
      }} />
      <div style={{ position: "relative" }}>{children}</div>
    </article>
  );
}

function CardHead({ titulo, meta, acessorio }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
    }}>
      <h3 style={{
        margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: "0.02em",
        color: C.text,
      }}>{titulo}</h3>
      {meta && (
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: C.muted }}>
          {meta}
        </span>
      )}
      {acessorio && (
        <span style={{ marginLeft: meta ? 0 : "auto" }}>{acessorio}</span>
      )}
    </div>
  );
}

// ============================================================
// Gráfico de vendas — toggle faturamento/quantidade + tooltip hover
// ============================================================

function PainelGraficoVendas({ dados, totalSemana }) {
  const [modo, setModo] = useState("faturamento"); // "faturamento" | "quantidade"
  const [hoveredBar, setHoveredBar] = useState(null);

  const valoresModo = dados.map(d => modo === "faturamento" ? Number(d.total) || 0 : Number(d.qtd) || 0);
  const totalModo = valoresModo.reduce((a, b) => a + b, 0);
  const max = Math.max(...valoresModo, 0);
  const yMax = niceMax(max);
  const idxMax = valoresModo.indexOf(max);

  // SVG dimensões
  const W = 720, H = 240;
  const padL = 40, padR = 12, padT = 20, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const n = dados.length || 1;
  const colW = innerW / n;
  const barW = Math.min(40, colW * 0.5);

  // gridlines
  const ticks = 5;
  const gridY = [];
  for (let i = 0; i <= ticks; i++) {
    const y = padT + innerH - (i / ticks) * innerH;
    const v = (yMax * i) / ticks;
    gridY.push({ y, v });
  }

  // barras
  const barras = dados.map((d, i) => {
    const v = valoresModo[i];
    const cx = padL + i * colW + colW / 2;
    const x = cx - barW / 2;
    const altura = yMax > 0 ? (v / yMax) * innerH : 0;
    const y = padT + innerH - altura;
    const ePico = i === idxMax && max > 0;
    const eHoje = i === dados.length - 1;
    return { d, v, cx, x, y, altura: Math.max(altura, 2), ePico, eHoje };
  });

  // Média móvel (3 dias)
  const media = valoresModo.map((_, i) => {
    const ini = Math.max(0, i - 1);
    const fim = Math.min(valoresModo.length - 1, i + 1);
    const slice = valoresModo.slice(ini, fim + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
  const mediaPath = barras.map((b, i) => {
    const y = padT + innerH - (yMax > 0 ? (media[i] / yMax) * innerH : 0);
    return `${i === 0 ? "M" : "L"}${b.cx},${y.toFixed(1)}`;
  }).join(" ");

  const fmtYAxis = (v) => {
    if (modo === "quantidade") return Math.round(v).toString();
    return Math.round(v).toLocaleString("pt-BR");
  };

  const fmtBarLabel = (b) => {
    if (modo === "quantidade") return b.v.toString();
    return b.v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <Card padding={20}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <h3 style={{
          margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: "0.02em", color: C.text,
        }}>Vendas dos últimos 7 dias</h3>
        <div style={{
          display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 10,
          background: C.card, padding: 3, gap: 2, marginLeft: 8,
        }}>
          <button onClick={() => setModo("faturamento")} style={segBtn(modo === "faturamento")}>Faturamento</button>
          <button onClick={() => setModo("quantidade")} style={segBtn(modo === "quantidade")}>Quantidade</button>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{
            fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted,
          }}>{modo === "faturamento" ? "Total semana" : "Vendas semana"}</div>
          <div style={{
            fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: C.white,
            fontVariantNumeric: "tabular-nums",
          }}>
            {modo === "faturamento" ? fmtBRL(totalModo) : fmtNumero(totalModo)}
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: C.muted, marginBottom: 8 }}>
        <span>
          <span style={{
            display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 6,
            verticalAlign: "-1px", background: `linear-gradient(180deg, ${C.accent}, ${C.purple})`,
          }} />{modo === "faturamento" ? "Faturamento (R$)" : "Qtd. vendas"}
        </span>
        <span>
          <span style={{
            display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 6,
            verticalAlign: "-1px", background: C.green,
          }} />Pico do período
        </span>
        <span>
          <span style={{
            display: "inline-block", width: 14, height: 2, borderRadius: 0, marginRight: 6,
            verticalAlign: "3px", background: C.muted,
          }} />Média móvel
        </span>
      </div>

      {/* Container do gráfico — posição relativa p/ overlay do tooltip */}
      <div style={{ position: "relative", height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
             style={{ width: "100%", height: "100%", overflow: "visible" }}>
          <defs>
            <linearGradient id="bar-blue" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={C.accent} stopOpacity="1" />
              <stop offset="100%" stopColor={C.purple} stopOpacity="1" />
            </linearGradient>
            <linearGradient id="bar-green" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={C.green} stopOpacity="1" />
              <stop offset="100%" stopColor={C.accent} stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id="bar-flat" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
            </linearGradient>
            <linearGradient id="bar-hover" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={C.white} stopOpacity="0.22" />
              <stop offset="100%" stopColor={C.white} stopOpacity="0.06" />
            </linearGradient>
          </defs>

          {/* gridlines */}
          {gridY.map((g, i) => (
            <g key={i}>
              <line x1={padL} y1={g.y} x2={W - padR} y2={g.y}
                stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3 3" />
              <text x={padL - 6} y={g.y + 3} textAnchor="end"
                style={{ fill: C.muted, fontSize: 10, fontFamily: FONT_MONO, opacity: 0.7 }}>
                {fmtYAxis(g.v)}
              </text>
            </g>
          ))}

          {/* barras */}
          {barras.map((b, i) => {
            const usaPlaceholder = b.v === 0;
            const hovered = hoveredBar === i;
            const fill = usaPlaceholder
              ? "url(#bar-flat)"
              : (b.ePico ? "url(#bar-green)" : "url(#bar-blue)");
            return (
              <g key={i} opacity={hovered ? 1 : (hoveredBar !== null ? 0.55 : (b.eHoje && !usaPlaceholder ? 0.85 : 1))}>
                <rect
                  x={b.x} y={usaPlaceholder ? padT + innerH - 2 : b.y}
                  width={barW} height={usaPlaceholder ? 2 : b.altura}
                  rx={6} fill={fill}
                />
                {hovered && !usaPlaceholder && (
                  <rect x={b.x - 2} y={b.y - 2} width={barW + 4} height={b.altura + 2}
                    rx={7} fill="none" stroke={b.ePico ? C.green : C.accent} strokeWidth="1.5" strokeOpacity="0.7" />
                )}
                {b.v > 0 && (
                  <text x={b.cx} y={b.y - 6} textAnchor="middle"
                    style={{
                      fill: b.ePico ? C.green : (hovered ? C.white : C.text),
                      fontSize: 10.5, fontWeight: hovered ? 700 : 600, fontFamily: FONT_MONO,
                    }}>
                    {fmtBarLabel(b)}
                  </text>
                )}
              </g>
            );
          })}

          {/* média móvel */}
          {valoresModo.some(v => v > 0) && (
            <path d={mediaPath} fill="none" stroke="rgba(255,255,255,0.3)"
              strokeWidth="1.2" strokeDasharray="3 4" />
          )}

          {/* baseline */}
          <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH}
            stroke={C.border} />

          {/* x-axis labels */}
          {barras.map((b, i) => (
            <g key={"x" + i}>
              <text x={b.cx} y={H - 14} textAnchor="middle"
                style={{
                  fill: b.ePico ? C.green : (b.eHoje ? C.white : C.text),
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.16em",
                  textTransform: "uppercase",
                }}>
                {fmtDiaSemana(b.d.dia)}
              </text>
              <text x={b.cx} y={H - 2} textAnchor="middle"
                style={{ fill: C.muted, fontSize: 10, fontFamily: FONT_MONO }}>
                {fmtDiaCurto(b.d.dia)} · {b.d.qtd} vd
              </text>
            </g>
          ))}
        </svg>

        {/* Overlay transparente p/ hover — cobre cada coluna */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {barras.map((b, i) => {
            const leftPct = (b.x / W) * 100;
            const widthPct = (barW / W) * 100;
            return (
              <div
                key={"ov" + i}
                style={{
                  position: "absolute",
                  left: `${Math.max(0, leftPct - 2)}%`,
                  width: `${widthPct + 4}%`,
                  top: 0, bottom: 0,
                  pointerEvents: "auto",
                  cursor: "default",
                  zIndex: 2,
                }}
                onMouseEnter={() => setHoveredBar(i)}
                onMouseLeave={() => setHoveredBar(null)}
              />
            );
          })}

          {/* Tooltip flutuante */}
          {hoveredBar !== null && (
            <TooltipBarra
              b={barras[hoveredBar]}
              W={W} H={H}
              modo={modo}
            />
          )}
        </div>
      </div>
    </Card>
  );
}

function TooltipBarra({ b, W, H, modo }) {
  const leftPct = (b.cx / W) * 100;
  const topPct = Math.max(2, ((b.y - 8) / H) * 100);
  return (
    <div style={{
      position: "absolute",
      left: `${Math.min(Math.max(2, leftPct - 8), 72)}%`,
      top: `${topPct}%`,
      width: 112,
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 9,
      padding: "7px 10px",
      fontSize: 11.5,
      fontFamily: FONT_MONO,
      color: C.text,
      pointerEvents: "none",
      zIndex: 10,
      boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
    }}>
      <div style={{
        fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
        color: C.muted, marginBottom: 4,
      }}>
        {fmtDiaSemana(b.d.dia)} {fmtDiaCurto(b.d.dia)}
      </div>
      <div style={{ fontWeight: 700, color: b.ePico ? C.green : C.white, fontSize: 13 }}>
        {modo === "faturamento" ? fmtBRL(b.v) : `${b.v} venda${b.v !== 1 ? "s" : ""}`}
      </div>
      {modo === "faturamento" && (
        <div style={{ color: C.muted, fontSize: 10.5, marginTop: 2 }}>
          {b.d.qtd} venda{b.d.qtd !== 1 ? "s" : ""}
        </div>
      )}
      {b.ePico && (
        <div style={{
          fontSize: 9.5, color: C.green, marginTop: 4,
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>★ Pico</div>
      )}
    </div>
  );
}

function segBtn(ativo) {
  return {
    border: 0, background: ativo ? "rgba(255,255,255,0.08)" : "transparent",
    color: ativo ? C.white : C.muted,
    height: 28, padding: "0 12px", borderRadius: 7,
    fontSize: 12, fontWeight: 600, letterSpacing: "0.02em",
    fontFamily: FONT_SANS, cursor: "pointer",
  };
}

// ============================================================
// Top produtos
// ============================================================

function PainelTopProdutos({ itens, totalMes }) {
  return (
    <Card>
      <CardHead
        titulo="Top 5 produtos do mês"
        meta={totalMes > 0 ? `por faturamento · ${fmtBRL(totalMes)}` : "—"}
      />
      {itens.length === 0 ? (
        <Vazio texto="Nenhum produto vendido no mês." />
      ) : itens.map((t, idx) => {
        const part = totalMes > 0 ? (Number(t.total) / Number(totalMes)) * 100 : 0;
        const isFirst = idx === 0;
        return (
          <div key={(t.produto?.id || idx) + "-tp"} style={{
            display: "grid", gridTemplateColumns: "28px 1fr auto",
            alignItems: "center", gap: 12, padding: "11px 0",
            borderBottom: idx < itens.length - 1 ? `1px dashed ${C.border}` : "0",
          }}>
            <div style={{
              width: 24, height: 24, borderRadius: 7,
              display: "grid", placeItems: "center",
              fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700,
              color: isFirst ? C.bg : C.muted,
              background: isFirst
                ? `linear-gradient(135deg, ${C.accent}, ${C.green})`
                : "rgba(255,255,255,0.02)",
              border: `1px solid ${isFirst ? "transparent" : C.border}`,
            }}>{String(idx + 1).padStart(2, "0")}</div>
            <div>
              <div style={{
                fontSize: 13, fontWeight: 600, letterSpacing: "-0.005em", color: C.white,
              }}>{t.produto?.nome || "—"}</div>
              <div style={{ fontSize: 10.5, color: C.muted, fontFamily: FONT_MONO }}>
                {t.produto?.codigo || "—"} · {fmtNumero(t.quantidade)} {t.produto?.unidade || "UN"} · {part.toFixed(1)}%
              </div>
            </div>
            <div style={{
              fontFamily: FONT_MONO, fontWeight: 700, color: C.green, fontSize: 13,
            }}>{fmtBRL(t.total)}</div>
          </div>
        );
      })}
    </Card>
  );
}

// ============================================================
// Top vendedores
// ============================================================

const ROLE_TAG = {
  ADMIN: { texto: "Admin", cor: "yellow" },
  GERENTE: { texto: "Gerente", cor: "accent" },
  VENDEDOR: { texto: "Vendedor", cor: "muted" },
};

function PainelTopVendedores({ itens, totalMes, qtdMes }) {
  return (
    <Card>
      <CardHead
        titulo="Top vendedores do mês"
        meta={`${fmtNumero(qtdMes)} vendas · ${fmtBRL(totalMes)}`}
      />
      {itens.length === 0 ? (
        <Vazio texto="Nenhuma venda registrada no mês." />
      ) : itens.map((t, idx) => {
        const pct = totalMes > 0 ? (Number(t.total) / Number(totalMes)) * 100 : 0;
        const role = ROLE_TAG[t.user?.role] || ROLE_TAG.VENDEDOR;
        const ticket = t.vendas > 0 ? Number(t.total) / t.vendas : 0;
        const monograma = (t.user?.nome || "?")
          .split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("") || "?";
        const gradientes = [
          `linear-gradient(135deg, ${C.accent}, ${C.green})`,
          `linear-gradient(135deg, ${C.green}, ${C.yellow})`,
          `linear-gradient(135deg, ${C.yellow}, ${C.purple})`,
          `linear-gradient(135deg, ${C.muted}, ${C.border})`,
        ];
        const barCores = [
          `linear-gradient(90deg, ${C.accent}, ${C.green})`,
          `linear-gradient(90deg, ${C.green}, ${C.yellow})`,
          `linear-gradient(90deg, ${C.yellow}, ${C.purple})`,
          `linear-gradient(90deg, ${C.muted}, ${C.border})`,
        ];
        const idx4 = Math.min(idx, 3);
        return (
          <div key={(t.user?.id || idx) + "-tv"} style={{
            padding: "10px 0",
            borderBottom: idx < itens.length - 1 ? `1px dashed ${C.border}` : "0",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                display: "grid", placeItems: "center",
                fontSize: 11, fontWeight: 700, color: C.bg,
                background: gradientes[idx4],
              }}>{monograma}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.white, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.user?.nome || "—"}
                  </span>
                  <RoleTag rolinho={role} />
                </div>
                <div style={{
                  fontSize: 11, color: C.muted, marginTop: 2, fontFamily: FONT_MONO,
                }}>
                  {fmtNumero(t.vendas)} vendas · ticket {fmtBRL(ticket)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{
                  fontFamily: FONT_MONO, fontWeight: 600, color: C.green, fontSize: 13,
                }}>{fmtBRL(t.total)}</div>
                <div style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>
                  {pct.toFixed(0)}% do total
                </div>
              </div>
            </div>
            <div style={{
              height: 4, borderRadius: 999, background: "rgba(255,255,255,0.05)",
              marginTop: 8, overflow: "hidden",
            }}>
              <div style={{
                width: `${Math.max(2, pct)}%`, height: "100%",
                borderRadius: 999, background: barCores[idx4],
              }} />
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function RoleTag({ rolinho }) {
  const corMap = {
    accent: { bg: C.accent + "22", fg: C.accent },
    yellow: { bg: C.yellow + "22", fg: C.yellow },
    muted: { bg: "rgba(255,255,255,0.05)", fg: C.muted },
  };
  const cor = corMap[rolinho.cor] || corMap.muted;
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
      letterSpacing: "0.12em", textTransform: "uppercase",
      background: cor.bg, color: cor.fg, whiteSpace: "nowrap",
    }}>{rolinho.texto}</span>
  );
}

// ============================================================
// Formas de pagamento
// ============================================================

function PainelFormasPagamento({ itens, totalGeral, qtdMes }) {
  const ordenados = [...itens].sort((a, b) => Number(b.total) - Number(a.total));
  const cores = [C.accent, C.green, C.yellow, C.purple, C.red, C.muted];

  const r = 46, cx = 60, cy = 60;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  const arcos = ordenados.map((f, i) => {
    const cor = cores[i % cores.length];
    const pct = totalGeral > 0 ? Number(f.total) / Number(totalGeral) : 0;
    const dash = pct * circ;
    const arco = { cor, dash, offset: -offset, pct };
    offset += dash;
    return arco;
  });

  return (
    <Card>
      <CardHead
        titulo="Formas de pagamento (mês)"
        meta={
          <span style={{ fontFamily: FONT_MONO }}>
            {fmtBRL(totalGeral)} · {fmtNumero(qtdMes)} vendas
          </span>
        }
      />

      {ordenados.length === 0 ? (
        <Vazio texto="Nenhuma venda no mês." />
      ) : (
        <div style={{
          display: "flex", alignItems: "center", gap: 18,
          margin: "6px 0 6px", flexWrap: "wrap",
        }}>
          <svg viewBox="0 0 120 120" width={120} height={120} style={{ flexShrink: 0 }}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeWidth="14" />
            {arcos.map((a, i) => (
              <circle key={i}
                cx={cx} cy={cy} r={r} fill="none" stroke={a.cor} strokeWidth="14"
                strokeDasharray={`${a.dash} ${circ}`}
                strokeDashoffset={a.offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            ))}
            <text x={cx} y={cy - 2} textAnchor="middle"
              style={{ fill: C.white, fontSize: 14, fontWeight: 700, fontFamily: FONT_SANS }}>
              {fmtNumero(qtdMes)}
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle"
              style={{ fill: C.muted, fontSize: 9, letterSpacing: "0.16em", fontFamily: FONT_SANS }}>
              VENDAS
            </text>
          </svg>

          <div style={{ flex: 1, minWidth: 200 }}>
            {ordenados.map((f, i) => {
              const cor = cores[i % cores.length];
              const pct = totalGeral > 0 ? (Number(f.total) / Number(totalGeral)) * 100 : 0;
              return (
                <div key={f.formaPagamento} style={{
                  padding: "9px 0",
                  borderBottom: i < ordenados.length - 1 ? `1px dashed ${C.border}` : "0",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      fontSize: 13, fontWeight: 600, color: C.white,
                    }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: cor }} />
                      {ROTULO_PAGAMENTO[f.formaPagamento] || f.formaPagamento}
                    </span>
                    <span style={{
                      marginLeft: "auto", fontFamily: FONT_MONO,
                      fontSize: 11.5, color: C.muted, fontWeight: 600,
                    }}>{pct.toFixed(0)}%</span>
                    <span style={{
                      fontFamily: FONT_MONO, fontWeight: 700, color: C.text, fontSize: 13,
                      marginLeft: 8,
                    }}>{fmtBRL(f.total)}</span>
                  </div>
                  <div style={{
                    height: 4, borderRadius: 999, background: "rgba(255,255,255,0.05)",
                    marginTop: 6, overflow: "hidden",
                  }}>
                    <div style={{ width: `${Math.max(2, pct)}%`, height: "100%", background: cor }} />
                  </div>
                  <div style={{
                    fontSize: 11, color: C.muted, marginTop: 5, fontFamily: FONT_MONO,
                  }}>{fmtNumero(f.quantidade)} {f.quantidade === 1 ? "venda" : "vendas"}</div>
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
// Financeiro callout
// ============================================================

function PainelFinanceiro({ tipo, titulo, icone, dados }) {
  const corPrincipal = tipo === "payable" ? C.red : C.green;
  const fundo = tipo === "payable"
    ? `linear-gradient(180deg, ${C.red}1f, ${C.card})`
    : `linear-gradient(180deg, ${C.green}1f, ${C.card})`;
  const atrasadas = dados.atrasadas || 0;

  return (
    <article style={{
      background: fundo, border: `1px solid ${C.border}`, borderRadius: 14,
      padding: 18, position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "inherit",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%)",
        pointerEvents: "none",
      }} />
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 12, position: "relative",
      }}>
        <span style={{ color: corPrincipal, display: "inline-flex" }}>{icone}</span>
        <h4 style={{
          margin: 0, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.02em", color: C.text,
        }}>{titulo}</h4>
        {atrasadas > 0 && (
          <DeltaPill texto={`${atrasadas} ${atrasadas === 1 ? "atrasada" : "atrasadas"}`}
            tipo="down" style={{ marginLeft: "auto" }} />
        )}
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr",
        alignItems: "end", gap: 14, position: "relative",
      }}>
        <div>
          <div style={{
            fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
            color: C.muted, marginBottom: 4,
          }}>{tipo === "payable" ? "Total pendente" : "Total a receber"}</div>
          <div style={{
            fontSize: 30, fontWeight: 800, letterSpacing: "-0.025em",
            color: corPrincipal, fontVariantNumeric: "tabular-nums",
          }}>{fmtBRL(dados.total)}</div>
        </div>
        <div>
          <div style={{
            fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
            color: C.muted, marginBottom: 4,
          }}>Contas</div>
          <div style={{
            fontSize: 20, fontWeight: 700, color: C.text,
            fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums",
          }}>{fmtNumero(dados.quantidade)}</div>
        </div>
        <div>
          <div style={{
            fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
            color: C.muted, marginBottom: 4,
          }}>Atrasadas</div>
          <div style={{
            fontSize: 20, fontWeight: 700, color: atrasadas > 0 ? corPrincipal : C.text,
            fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums",
          }}>{fmtNumero(atrasadas)}</div>
        </div>
      </div>

      <div style={{
        marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6,
        padding: "5px 9px", borderRadius: 7, fontSize: 11.5, fontWeight: 600,
        background: atrasadas > 0 ? corPrincipal + "22" : C.green + "11",
        border: `1px solid ${atrasadas > 0 ? corPrincipal + "55" : C.green + "33"}`,
        color: atrasadas > 0 ? corPrincipal : C.green,
        position: "relative",
      }}>
        {atrasadas > 0
          ? `⚠ ${atrasadas} ${atrasadas === 1 ? "conta atrasada" : "contas atrasadas"} — ${tipo === "payable" ? "ação urgente" : "cobrar clientes"}`
          : "✓ Nenhuma conta atrasada"}
      </div>
    </article>
  );
}

// ============================================================
// Próximas contas a vencer
// ============================================================

function PainelProximasContas({ itens }) {
  if (!itens || itens.length === 0) {
    return (
      <Card>
        <CardHead titulo="Próximas contas a vencer" meta="agenda financeira" />
        <Vazio texto="✓ Nenhuma conta com vencimento próximo." />
      </Card>
    );
  }

  return (
    <Card>
      <CardHead
        titulo="Próximas contas a vencer"
        meta={`${itens.length} conta${itens.length !== 1 ? "s" : ""} agendada${itens.length !== 1 ? "s" : ""}`}
      />
      {itens.map((c, idx) => {
        const venc = new Date(c.vencimento);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const diasAte = Math.round((venc - hoje) / 86400000);
        const urgente = diasAte <= 2;
        const ePagar = c.tipo === "pagar";
        const cor = ePagar ? C.red : C.green;

        let labelDia;
        if (diasAte === 0) labelDia = "hoje";
        else if (diasAte === 1) labelDia = "amanhã";
        else labelDia = `${diasAte}d`;

        return (
          <div key={c.id} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
            borderBottom: idx < itens.length - 1 ? `1px dashed ${C.border}` : "0",
          }}>
            {/* Tipo pill */}
            <div style={{
              flexShrink: 0, width: 5, alignSelf: "stretch",
              borderRadius: 99, background: cor,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: C.white,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{c.descricao}</div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO, marginTop: 1 }}>
                {ePagar ? "↑ Pagar" : "↓ Receber"}
                {c.entidade ? ` · ${c.entidade}` : ""}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{
                fontFamily: FONT_MONO, fontWeight: 700,
                color: ePagar ? C.red : C.green, fontSize: 13,
              }}>{fmtBRL(c.valor)}</div>
              <div style={{
                fontSize: 10.5, marginTop: 2, fontFamily: FONT_MONO,
                color: urgente ? C.yellow : C.muted,
                fontWeight: urgente ? 700 : 400,
              }}>{labelDia}</div>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

// ============================================================
// Estoque baixo
// ============================================================

function PainelEstoqueBaixo({ itens }) {
  return (
    <Card>
      <CardHead
        titulo="Produtos com estoque baixo"
        meta={
          itens.length > 0
            ? <span><span style={{ color: C.yellow, fontWeight: 700 }}>{itens.length}</span> {itens.length === 1 ? "item crítico" : "itens críticos"}</span>
            : "tudo em ordem"
        }
      />
      {itens.length === 0 ? (
        <Vazio texto="✓ Todos os produtos com estoque acima do mínimo." />
      ) : itens.map((p, idx) => {
        const min = Number(p.estoqueMinimo) || 0;
        const est = Number(p.estoque) || 0;
        const pct = min > 0 ? Math.max(0, Math.min(100, (est / min) * 100)) : 0;
        const eZero = est <= 0;
        return (
          <div key={p.id} style={{
            display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10,
            alignItems: "center", padding: "11px 0",
            borderBottom: idx < itens.length - 1 ? `1px dashed ${C.border}` : "0",
          }}>
            <div>
              <div style={{
                fontSize: 13, fontWeight: 600, color: C.white, letterSpacing: "-0.005em",
              }}>{p.nome}</div>
              <div style={{
                fontSize: 10.5, color: C.muted, fontFamily: FONT_MONO, marginTop: 2,
              }}>
                {p.codigo || "—"} · mín. {fmtNumero(min)} {p.unidade || "UN"}
              </div>
            </div>
            <div style={{
              width: 90, height: 6, borderRadius: 99,
              background: "rgba(255,255,255,0.05)", overflow: "hidden",
            }}>
              <div style={{
                width: `${pct}%`, height: "100%",
                background: eZero
                  ? C.red
                  : `linear-gradient(90deg, ${C.yellow}, ${C.red})`,
              }} />
            </div>
            <div style={{
              fontFamily: FONT_MONO, fontWeight: 700, fontSize: 13,
              color: eZero ? C.red : C.yellow, textAlign: "right",
            }}>
              {fmtNumero(est)} {p.unidade || "UN"}
              <small style={{
                display: "block", fontSize: 10, color: C.muted, fontWeight: 500,
                marginTop: 1, letterSpacing: "0.04em",
              }}>{eZero ? "esgotado" : "abaixo do mín."}</small>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

// ============================================================
// Últimas vendas
// ============================================================

function PainelUltimasVendas({ itens, totalHoje, qtdHoje }) {
  return (
    <Card>
      <CardHead
        titulo="Últimas vendas"
        meta={`${fmtNumero(qtdHoje)} hoje · ${fmtBRL(totalHoje)}`}
      />
      {itens.length === 0 ? (
        <Vazio texto="Nenhuma venda registrada ainda." />
      ) : itens.map((v, idx) => {
        const data = new Date(v.createdAt);
        const dataCurta = data.toLocaleString("pt-BR", {
          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
        });
        const isCartao = (v.formaPagamento || "").includes("CARTAO");
        return (
          <div key={v.id} style={{
            display: "grid", gridTemplateColumns: "60px 1fr auto", gap: 10,
            alignItems: "center", padding: "9px 0",
            borderBottom: idx < itens.length - 1 ? `1px dashed ${C.border}` : "0",
          }}>
            <div style={{
              fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color: C.muted,
            }}>#{v.numero}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: C.white,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{v.cliente || "Cliente avulso"}</div>
              <div style={{
                fontSize: 11, color: C.muted, fontFamily: FONT_MONO, marginTop: 1,
              }}>
                {dataCurta}
                <span style={{
                  fontSize: 10, padding: "1px 6px", borderRadius: 4,
                  marginLeft: 6, fontWeight: 600, letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  background: isCartao ? C.yellow + "33" : "rgba(255,255,255,0.05)",
                  color: isCartao ? C.yellow : C.muted,
                  fontFamily: FONT_SANS,
                }}>{ROTULO_PAGAMENTO[v.formaPagamento] || v.formaPagamento}</span>
                {v.vendedor && <span> · {v.vendedor.toUpperCase()}</span>}
              </div>
            </div>
            <div style={{
              fontFamily: FONT_MONO, fontWeight: 700, color: C.green, fontSize: 13,
            }}>{fmtBRL(v.total)}</div>
          </div>
        );
      })}
    </Card>
  );
}

// ============================================================
// Últimas compras
// ============================================================

function PainelUltimasCompras({ itens }) {
  return (
    <Card>
      <CardHead
        titulo="Últimas compras"
        meta={itens.length > 0 ? `${fmtNumero(itens.length)} ${itens.length === 1 ? "registro recente" : "registros recentes"}` : "sem registros"}
      />
      {itens.length === 0 ? (
        <Vazio texto="Nenhuma compra registrada ainda." />
      ) : itens.map((c, idx) => {
        const data = new Date(c.createdAt);
        const dataFmt = data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
        return (
          <div key={c.id} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "10px 2px",
            borderBottom: idx < itens.length - 1 ? `1px dashed ${C.border}` : "0",
          }}>
            <div style={{
              fontFamily: FONT_MONO, fontSize: 11.5, fontWeight: 600, color: C.muted, minWidth: 50,
            }}>#{c.numero}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13.5, fontWeight: 600, color: C.white, letterSpacing: "-0.005em",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{c.fornecedor || "—"}</div>
              <div style={{
                fontSize: 11, color: C.muted, fontFamily: FONT_MONO, marginTop: 2,
              }}>compra registrada</div>
            </div>
            <div style={{
              fontSize: 11, color: C.muted, fontFamily: FONT_MONO, marginLeft: "auto",
            }}>{dataFmt}</div>
            <div style={{
              fontFamily: FONT_MONO, fontWeight: 700, fontSize: 14, color: C.text,
            }}>{fmtBRL(c.total)}</div>
          </div>
        );
      })}
    </Card>
  );
}

function Vazio({ texto }) {
  return (
    <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "16px 0" }}>
      {texto}
    </div>
  );
}

// ============================================================
// Ícones (SVG inline)
// ============================================================

const sw = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };

function IconCart() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" {...sw}><path d="M6 6h15l-1.5 9H8z" /><path d="M6 6 5 3H2" /><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /></svg>);
}
function IconTrendUp() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" {...sw}><path d="M3 17 9 11l4 4 8-9" /><path d="M14 6h7v7" /></svg>);
}
function IconTicket() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" {...sw}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 11h18" /><path d="M7 16h4" /></svg>);
}
function IconBag() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" {...sw}><path d="M3 6h18l-2 12H5z" /><path d="M9 10v4M15 10v4" /></svg>);
}
function IconMargin() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" {...sw}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>);
}
function IconPeople() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" {...sw}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 5-6 8-6s7 2 8 6" /></svg>);
}
function IconPersonPlus() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" {...sw}><circle cx="10" cy="8" r="4" /><path d="M2 21c1-4 5-6 8-6 1.3 0 2.6.3 3.6.8" /><path d="M19 13v6M16 16h6" /></svg>);
}
function IconBox() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" {...sw}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 9v12" /></svg>);
}
function IconWarehouse() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" {...sw}><path d="M3 21V8l9-5 9 5v13H3z" /><path d="M9 21v-6h6v6" /></svg>);
}
function IconTruck() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" {...sw}><path d="M3 7h13l5 5v5a2 2 0 0 1-2 2H3z" /><circle cx="7" cy="19" r="2" /><circle cx="17" cy="19" r="2" /></svg>);
}
function IconUser() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" {...sw}><circle cx="12" cy="7" r="3" /><path d="M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" /></svg>);
}
function IconAlert() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" {...sw}><path d="M12 3 2 21h20z" /><path d="M12 10v5M12 18h.01" /></svg>);
}
function IconBillOut() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" {...sw}><path d="M3 6h18v12H3z" /><path d="M3 10h18M7 15h4" /></svg>);
}
function IconBillIn() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" {...sw}><path d="M3 6h18v12H3z" /><path d="M3 10h18M13 15h4" /></svg>);
}
function IconRefresh() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" {...sw}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>);
}
