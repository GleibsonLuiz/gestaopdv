import { useCallback, useEffect, useMemo, useState } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";
import { fmtBRL, fmtBRLSplit, fmtDataHora, fmtNum, fmtPercentual } from "./lib/format";


const FONT_SANS = `"Manrope", "Segoe UI", system-ui, sans-serif`;
const FONT_MONO = `"JetBrains Mono", ui-monospace, "Courier New", monospace`;



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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DashboardData = any;

interface DashboardProps {
  user?: { nome?: string; [extra: string]: unknown };
}

export default function Dashboard({ user }: DashboardProps) {
  const [dados, setDados] = useState<DashboardData | null>(null);
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
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Auto-refresh a cada 60 s. Usa variável local `c` — nunca chama state setter
  // dentro de outro state setter (violaria as regras do React 18).
  useEffect(() => {
    let c = 60;
    const id = setInterval(() => {
      c -= 1;
      setContagem(c);
      if (c <= 0) {
        c = 60;
        carregar();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [carregar]);

  if (carregando && !dados) return <SkeletonDashboard />;

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

function ConteudoDashboard({ dados, onAtualizar, user, contagem }: any) {
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

        {/* ========= META MENSAL + CAIXA ATUAL ========= */}
        {(k.metaMes || dados.caixaAtual) && (
          <section style={{
            display: "grid", gap: 14,
            gridTemplateColumns: dados.caixaAtual
              ? "minmax(0, 2fr) minmax(0, 1fr)"
              : "1fr",
          }}>
            {k.metaMes && <PainelMetaMensal meta={k.metaMes} />}
            {dados.caixaAtual && <PainelCaixaAtual caixa={dados.caixaAtual} />}
          </section>
        )}

        {/* ========= KPIs ========= */}
        <section style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}>
          <KpiCard
            cor={C.accent}
            icone={<IconCart />}
            rotulo="Vendas hoje"
            valor={fmtBRLSplit(k.vendasHoje.total)}
            descricao={`${fmtNum(tickets)} ${tickets === 1 ? "venda" : "vendas"} · ticket ${fmtBRL(ticketHoje)}`}
            comparativo="hoje"
            sparkline={<Sparkline cor={C.accent} pontos={(dados.vendasPorDia || []).map(d => d.total)} />}
          />
          <KpiCard
            cor={C.green}
            icone={<IconTrendUp />}
            rotulo="Faturamento do mês"
            valor={fmtBRLSplit(k.vendasMes.total)}
            descricao={`${fmtNum(k.vendasMes.quantidade)} vendas · ø ${fmtBRL(k.ticketMedioMes)}`}
            comparativo={variacaoMes ? `${variacaoMes} vs. mês anterior` : ""}
            delta={variacaoMes ? { texto: variacaoMes, tipo: tipoVariacao } : null}
            sparkline={<Sparkline cor={C.green} pontos={(dados.vendasPorDia || []).map(d => d.total)} />}
          />
          <KpiCard
            cor={C.yellow}
            icone={<IconCoin />}
            rotulo="Margem bruta (mês)"
            valor={fmtBRLSplit(k.margemBrutaMes?.total || 0)}
            descricao={
              k.margemBrutaMes?.percentual != null
                ? `${k.margemBrutaMes.percentual.toFixed(1)}% do faturamento`
                : "sem custos cadastrados"
            }
            comparativo="lucro estimado"
            delta={
              k.margemBrutaMes?.percentual != null
                ? {
                    texto: `${k.margemBrutaMes.percentual.toFixed(1)}%`,
                    tipo: k.margemBrutaMes.percentual >= 30 ? "up"
                        : k.margemBrutaMes.percentual >= 15 ? "flat" : "down",
                  }
                : null
            }
            sparkline={<Sparkline cor={C.yellow} pontos={(dados.vendasPorDia || []).map(d => d.total)} />}
          />
          <KpiCard
            cor={C.purple}
            icone={<IconBag />}
            rotulo="Compras do mês"
            valor={fmtBRLSplit(k.comprasMes.total)}
            descricao={`${fmtNum(k.comprasMes.quantidade)} ${k.comprasMes.quantidade === 1 ? "compra registrada" : "compras registradas"}`}
            comparativo={dados.ultimasCompras?.[0]
              ? `última ${new Date(dados.ultimasCompras[0].createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
              : "sem registros"}
            sparkline={null}
          />
        </section>

        {/* ========= MINI-TILES ========= */}
        <section style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        }}>
          <MiniTile
            icone={<IconTicket />}
            label="Ticket médio"
            valor={fmtBRL(k.ticketMedioMes)}
            hint="por venda no mês"
          />
          <MiniTile
            icone={<IconWarehouse />}
            label="Valor do estoque"
            valor={fmtBRL(k.valorEstoque?.total || 0)}
            hint={k.valorEstoque?.itens != null
              ? `${fmtNum(k.valorEstoque.itens)} unidades`
              : "imobilizado"}
          />
          <MiniTile icone={<IconPeople />} label="Clientes" valor={fmtNum(k.clientesAtivos)} hint="ativos" />
          <MiniTile icone={<IconUserPlus />} label="Novos clientes" valor={fmtNum(k.novosCLientesMes || 0)} hint="este mês" />
          <MiniTile icone={<IconBox />} label="Produtos" valor={fmtNum(k.produtosAtivos)} hint="ativos" />
          <MiniTile icone={<IconTruck />} label="Fornecedores" valor={fmtNum(k.fornecedoresAtivos)} hint="cadastrados" />
          <MiniTile icone={<IconUser />} label="Funcionários" valor={fmtNum(k.funcionariosAtivos)} hint="ativos" />
          <MiniTile
            icone={<IconAlert />}
            label="Estoque baixo"
            valor={fmtNum(k.produtosEstoqueBaixo)}
            hint={k.produtosEstoqueBaixo > 0 ? "requer ação" : "tudo ok"}
            warn={k.produtosEstoqueBaixo > 0}
            tagDelta={k.produtosEstoqueBaixo > 0 ? { texto: "crítico", tipo: "down" } : null}
          />
          {(k.clientesInativos || 0) > 0 && (
            <MiniTile
              icone={<IconUserOff />}
              label="Clientes inativos"
              valor={fmtNum(k.clientesInativos)}
              hint="sem comprar há 60d"
              warn
              tagDelta={{ texto: "reativar", tipo: "down" }}
            />
          )}
        </section>

        {/* ========= CHART + TOP PRODUTOS ========= */}
        <section style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)",
        }}>
          <PainelGraficoVendas dados={dados.vendasPorDia || []} totalSemana={totalSemana} />
          <PainelTopProdutos itens={dados.topProdutos || []} totalMes={k.vendasMes.total} />
        </section>

        {/* ========= TOP CATEGORIAS + VENDEDORES ========= */}
        <section style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
        }}>
          <PainelTopCategorias itens={dados.topCategorias || []} totalMes={k.vendasMes.total} />
          <PainelTopVendedores itens={dados.topVendedores || []} totalMes={k.vendasMes.total} qtdMes={k.vendasMes.quantidade} />
        </section>

        {/* ========= VENDAS POR HORA + PAGAMENTOS ========= */}
        <section style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
        }}>
          <PainelVendasPorHora itens={dados.vendasPorHora || []} />
          <PainelFormasPagamento itens={dados.formasPagamento || []} totalGeral={totalFormas} qtdMes={k.vendasMes.quantidade} />
        </section>

        {/* ========= FINANCEIRO ========= */}
        <section style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
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
          <PainelSaldoFinanceiro
            pagar={k.contasPagarPendentes}
            receber={k.contasReceberPendentes}
          />
        </section>

        {/* ========= PROXIMAS CONTAS (7 dias) ========= */}
        {dados.proximasContas && (
          <PainelProximasContas
            pagar={dados.proximasContas.pagar || []}
            receber={dados.proximasContas.receber || []}
          />
        )}

        {/* ========= ULTIMAS VENDAS + ULTIMAS COMPRAS ========= */}
        {/* Estoque baixo saiu daqui (poluia com itens descontinuados); a lista
            vive agora na tela de Estoque. O mini-card de contagem permanece. */}
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

function BotaoAtualizar({ onClick, contagem }: any) {
  return (
    <button
      onClick={onClick}
      title={contagem !== undefined ? `Atualiza automaticamente em ${contagem}s` : ""}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        height: 32, padding: "0 14px", borderRadius: 8,
        background: `linear-gradient(180deg, ${C.accent}55, ${C.card})`,
        border: `1px solid ${C.accent}77`, color: C.white,
        fontSize: 12.5, fontWeight: 700, letterSpacing: "0.02em",
        cursor: "pointer", fontFamily: FONT_SANS,
      }}
    >
      <IconRefresh /> Atualizar
      {contagem !== undefined && (
        <span style={{
          fontSize: 10, fontFamily: FONT_MONO, color: C.muted,
          background: "rgba(0,0,0,0.25)", borderRadius: 4,
          padding: "1px 5px", fontWeight: 500,
        }}>{contagem}s</span>
      )}
    </button>
  );
}

// ============================================================
// KPI Card
// ============================================================

function KpiCard({ cor, icone, rotulo, valor, descricao, comparativo, delta, sparkline }: any) {
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

function DeltaPill({ texto, tipo, style }: any) {
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

function Sparkline({ cor, pontos }: any) {
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

function MiniTile({ icone, label, valor, hint, warn, tagDelta }: any) {
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
          fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em",
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

function Card({ children, padding = 18, style }: any) {
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

function CardHead({ titulo, meta, acessorio }: any) {
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
// Gráfico de vendas semana
// ============================================================

function PainelGraficoVendas({ dados, totalSemana }: any) {
  const [hoveredBar, setHoveredBar] = useState(null);

  const totaisNum = dados.map(d => Number(d.total) || 0);
  const max = Math.max(...totaisNum, 0);
  const yMax = niceMax(max);
  const idxMax = totaisNum.indexOf(max);

  const W = 720, H = 240;
  const padL = 40, padR = 12, padT = 20, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const n = dados.length || 1;
  const colW = innerW / n;
  const barW = Math.min(40, colW * 0.5);

  const ticks = 5;
  const gridY: { y: number; v: number }[] = [];
  for (let i = 0; i <= ticks; i++) {
    const y = padT + innerH - (i / ticks) * innerH;
    const v = (yMax * i) / ticks;
    gridY.push({ y, v });
  }

  const barras = dados.map((d, i) => {
    const v = Number(d.total) || 0;
    const cx = padL + i * colW + colW / 2;
    const x = cx - barW / 2;
    const altura = yMax > 0 ? (v / yMax) * innerH : 0;
    const y = padT + innerH - altura;
    const ePico = i === idxMax && max > 0;
    const eHoje = i === dados.length - 1;
    return { d, v, cx, x, y, altura: Math.max(altura, 2), ePico, eHoje };
  });

  const media = totaisNum.map((_, i) => {
    const ini = Math.max(0, i - 1);
    const fim = Math.min(totaisNum.length - 1, i + 1);
    const slice = totaisNum.slice(ini, fim + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
  const mediaPath = barras.map((b, i) => {
    const y = padT + innerH - (yMax > 0 ? (media[i] / yMax) * innerH : 0);
    return `${i === 0 ? "M" : "L"}${b.cx},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <Card padding={20}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 6,
      }}>
        <h3 style={{
          margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: "0.02em",
          color: C.text,
        }}>Vendas dos últimos 7 dias</h3>
        <div style={{
          display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 10,
          background: C.card, padding: 3, gap: 2, marginLeft: 8,
        }}>
          <button style={segBtn(true)}>Faturamento</button>
          <button disabled style={{ ...segBtn(false), cursor: "not-allowed", opacity: 0.55 }}>Quantidade</button>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{
            fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted,
          }}>Total semana</div>
          <div style={{
            fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", color: C.white,
            fontVariantNumeric: "tabular-nums",
          }}>{fmtBRL(totalSemana)}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: C.muted, marginBottom: 8 }}>
        <span>
          <span style={{
            display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 6,
            verticalAlign: "-1px", background: `linear-gradient(180deg, ${C.accent}, ${C.purple})`,
          }} />Faturamento (R$)
        </span>
        <span>
          <span style={{
            display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 6,
            verticalAlign: "-1px", background: C.green,
          }} />Pico do dia
        </span>
        <span>
          <span style={{
            display: "inline-block", width: 14, height: 2, borderRadius: 0, marginRight: 6,
            verticalAlign: "3px", background: C.muted,
          }} />Média móvel
        </span>
      </div>

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
          </defs>

          {gridY.map((g, i) => (
            <g key={i}>
              <line x1={padL} y1={g.y} x2={W - padR} y2={g.y}
                stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3 3" />
              <text x={padL - 6} y={g.y + 3} textAnchor="end"
                style={{ fill: C.muted, fontSize: 10, fontFamily: FONT_MONO, opacity: 0.7 }}>
                {Math.round(g.v)}
              </text>
            </g>
          ))}

          {barras.map((b, i) => {
            const usaPlaceholder = b.v === 0;
            const fill = usaPlaceholder
              ? "url(#bar-flat)"
              : (b.ePico ? "url(#bar-green)" : "url(#bar-blue)");
            const isHovered = hoveredBar === i;
            return (
              <g key={i}
                opacity={b.eHoje && !usaPlaceholder ? 0.85 : 1}
                style={{ cursor: b.v > 0 ? "pointer" : "default" }}
                onMouseEnter={() => setHoveredBar(i)}
                onMouseLeave={() => setHoveredBar(null)}
              >
                <rect
                  x={b.x} y={usaPlaceholder ? padT + innerH - 2 : b.y}
                  width={barW} height={usaPlaceholder ? 2 : b.altura}
                  rx={6} fill={fill}
                  opacity={isHovered ? 0.7 : 1}
                />
                {b.v > 0 && (
                  <text x={b.cx} y={b.y - 6} textAnchor="middle"
                    style={{
                      fill: b.ePico ? C.green : C.text,
                      fontSize: 10.5, fontWeight: 600, fontFamily: FONT_MONO,
                    }}>
                    {b.v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </text>
                )}
              </g>
            );
          })}

          {totaisNum.some(v => v > 0) && (
            <path d={mediaPath} fill="none" stroke="rgba(255,255,255,0.3)"
              strokeWidth="1.2" strokeDasharray="3 4" />
          )}

          <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH}
            stroke={C.border} />

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

        {hoveredBar !== null && barras[hoveredBar] !== undefined && barras[hoveredBar].v > 0 && (
          <TooltipBarra barra={barras[hoveredBar]} W={W} />
        )}
      </div>
    </Card>
  );
}

function TooltipBarra({ barra, W }: any) {
  const pctLeft = (barra.cx / W) * 100;
  const isRight = pctLeft > 60;
  return (
    <div style={{
      position: "absolute",
      left: `${pctLeft}%`,
      top: 0,
      transform: isRight ? "translateX(-90%)" : "translateX(-10%)",
      pointerEvents: "none",
      zIndex: 10,
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: "8px 12px",
      minWidth: 130,
      boxShadow: "0 4px 16px rgba(0,0,0,0.45)",
    }}>
      <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 3, fontFamily: FONT_MONO }}>
        {fmtDiaSemana(barra.d.dia)} · {fmtDiaCurto(barra.d.dia)}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.white, fontFamily: FONT_MONO }}>
        {fmtBRL(barra.v)}
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
        {barra.d.qtd} {barra.d.qtd === 1 ? "venda" : "vendas"}
      </div>
      {barra.ePico && (
        <div style={{ fontSize: 10, color: C.green, marginTop: 4, fontWeight: 700 }}>
          ▲ Melhor dia da semana
        </div>
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
    fontFamily: FONT_SANS, cursor: ativo ? "default" : "pointer",
  };
}

// ============================================================
// Top produtos
// ============================================================

function PainelTopProdutos({ itens, totalMes }: any) {
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
                {t.produto?.codigo || "—"} · {fmtNum(t.quantidade)} {t.produto?.unidade || "UN"} · participação {part.toFixed(1)}%
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

function PainelTopVendedores({ itens, totalMes, qtdMes }: any) {
  return (
    <Card>
      <CardHead
        titulo="Top vendedores do mês"
        meta={`${fmtNum(qtdMes)} vendas · ${fmtBRL(totalMes)}`}
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
                  {fmtNum(t.vendas)} vendas · ticket {fmtBRL(ticket)}
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

function RoleTag({ rolinho }: any) {
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

function PainelFormasPagamento({ itens, totalGeral, qtdMes }: any) {
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
            {fmtBRL(totalGeral)} · {fmtNum(qtdMes)} vendas
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
                strokeLinecap={"round" as const}
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            ))}
            <text x={cx} y={cy - 2} textAnchor="middle"
              style={{ fill: C.white, fontSize: 14, fontWeight: 700, fontFamily: FONT_SANS }}>
              {fmtNum(qtdMes)}
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
                      <span style={{
                        width: 8, height: 8, borderRadius: 2, background: cor,
                      }} />
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
                  }}>{fmtNum(f.quantidade)} {f.quantidade === 1 ? "venda" : "vendas"}</div>
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

function PainelFinanceiro({ tipo, titulo, icone, dados }: any) {
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
          }}>{fmtNum(dados.quantidade)}</div>
        </div>
        <div>
          <div style={{
            fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
            color: C.muted, marginBottom: 4,
          }}>Atrasadas</div>
          <div style={{
            fontSize: 20, fontWeight: 700, color: atrasadas > 0 ? corPrincipal : C.text,
            fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums",
          }}>{fmtNum(atrasadas)}</div>
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
// Saldo financeiro previsto
// ============================================================

function PainelSaldoFinanceiro({ pagar, receber }: any) {
  const aPagar = Number(pagar?.total) || 0;
  const aReceber = Number(receber?.total) || 0;
  const saldo = aReceber - aPagar;
  const positivo = saldo >= 0;
  const cor = positivo ? C.green : C.red;
  const totalGeral = aPagar + aReceber;
  const pctReceber = totalGeral > 0 ? (aReceber / totalGeral) * 100 : 50;
  const pctPagar = 100 - pctReceber;

  return (
    <article style={{
      background: positivo
        ? `linear-gradient(180deg, ${C.green}18, ${C.card})`
        : `linear-gradient(180deg, ${C.red}18, ${C.card})`,
      border: `1px solid ${positivo ? C.green + "44" : C.red + "44"}`,
      borderRadius: 14, padding: 18, position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "inherit",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%)",
        pointerEvents: "none",
      }} />
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 12, position: "relative",
      }}>
        <span style={{ color: cor, display: "inline-flex" }}><IconBalance /></span>
        <h4 style={{ margin: 0, fontSize: 12.5, fontWeight: 600, letterSpacing: "0.02em", color: C.text }}>
          Saldo previsto
        </h4>
        <DeltaPill
          texto={positivo ? "Positivo" : "Negativo"}
          tipo={positivo ? "up" : "down"}
          style={{ marginLeft: "auto" }}
        />
      </div>

      <div style={{ position: "relative" }}>
        <div style={{
          fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
          color: C.muted, marginBottom: 4,
        }}>A receber − A pagar</div>
        <div style={{
          fontSize: 30, fontWeight: 800, letterSpacing: "-0.025em",
          color: cor, fontVariantNumeric: "tabular-nums",
        }}>
          {positivo ? "" : "−"}{fmtBRL(Math.abs(saldo))}
        </div>
      </div>

      <div style={{ marginTop: 14, position: "relative" }}>
        <div style={{
          height: 6, borderRadius: 99, display: "flex", overflow: "hidden",
          background: "rgba(255,255,255,0.05)",
        }}>
          <div style={{ width: `${pctReceber}%`, background: C.green }} />
          <div style={{ width: `${pctPagar}%`, background: C.red }} />
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between",
          marginTop: 6, fontSize: 11, fontFamily: FONT_MONO,
        }}>
          <span style={{ color: C.green }}>↑ Receber {fmtBRL(aReceber)}</span>
          <span style={{ color: C.red }}>↓ Pagar {fmtBRL(aPagar)}</span>
        </div>
      </div>
    </article>
  );
}

// ============================================================
// Próximas contas (7 dias)
// ============================================================

function PainelProximasContas({ pagar, receber }: any) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const itens = [
    ...(pagar || []).map(c => ({ ...c, tipo: "pagar" })),
    ...(receber || []).map(c => ({ ...c, tipo: "receber" })),
  ].sort((a, b) => new Date(a.vencimento).getTime() - new Date(b.vencimento).getTime());

  function fmtVenc(iso: string | null | undefined) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const diff = Math.round((d.getTime() - hoje.getTime()) / 86400000);
    if (diff === 0) return "Hoje";
    if (diff === 1) return "Amanhã";
    if (diff < 0) return `${Math.abs(diff)}d atrás`;
    return `em ${diff} dias`;
  }

  const totalPagar = (pagar || []).reduce((a, c) => a + (Number(c.valor) || 0), 0);
  const totalReceber = (receber || []).reduce((a, c) => a + (Number(c.valor) || 0), 0);

  return (
    <Card>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
      }}>
        <h3 style={{
          margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: "0.02em", color: C.text,
        }}>Próximas contas — 7 dias</h3>
        <span style={{ marginLeft: "auto", display: "flex", gap: 12, fontSize: 11.5, fontFamily: FONT_MONO }}>
          {totalReceber > 0 && (
            <span style={{ color: C.green }}>↑ {fmtBRL(totalReceber)}</span>
          )}
          {totalPagar > 0 && (
            <span style={{ color: C.red }}>↓ {fmtBRL(totalPagar)}</span>
          )}
        </span>
      </div>

      {itens.length === 0 ? (
        <Vazio texto="✓ Nenhuma conta vencendo nos próximos 7 dias." />
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: 0,
        }}>
          {itens.map((c, idx) => {
            const isPagar = c.tipo === "pagar";
            const cor = isPagar ? C.red : C.green;
            const atrasada = c.status === "ATRASADA";
            const vencLabel = fmtVenc(c.vencimento);
            return (
              <div key={`${c.tipo}-${c.id}`} style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr auto auto",
                gap: 10,
                alignItems: "center",
                padding: "10px 0",
                borderBottom: idx < itens.length - 1 ? `1px dashed ${C.border}` : "0",
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  display: "grid", placeItems: "center",
                  color: cor, background: cor + "1f", border: `1px solid ${cor}44`,
                  fontSize: 14, fontWeight: 700,
                }}>
                  {isPagar ? "↓" : "↑"}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: C.white,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {c.descricao || (isPagar ? "Conta a pagar" : "Conta a receber")}
                  </div>
                  <div style={{ fontSize: 10.5, color: C.muted, fontFamily: FONT_MONO, marginTop: 1 }}>
                    {isPagar ? "A pagar" : "A receber"}
                    {atrasada && (
                      <span style={{ color: C.red, marginLeft: 6, fontWeight: 700 }}>· ATRASADA</span>
                    )}
                  </div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 600, fontFamily: FONT_MONO,
                  color: atrasada ? C.red : C.muted, whiteSpace: "nowrap",
                }}>
                  {vencLabel}
                </div>
                <div style={{
                  fontFamily: FONT_MONO, fontWeight: 700, fontSize: 13,
                  color: cor, textAlign: "right", whiteSpace: "nowrap",
                }}>
                  {fmtBRL(c.valor)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ============================================================
// Últimas vendas
// ============================================================

function PainelUltimasVendas({ itens, totalHoje, qtdHoje }: any) {
  return (
    <Card>
      <CardHead
        titulo="Últimas vendas"
        meta={`${fmtNum(qtdHoje)} hoje · ${fmtBRL(totalHoje)}`}
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

function PainelUltimasCompras({ itens }: any) {
  return (
    <Card>
      <CardHead
        titulo="Últimas compras"
        meta={itens.length > 0 ? `${fmtNum(itens.length)} ${itens.length === 1 ? "registro recente" : "registros recentes"}` : "sem registros"}
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

// ============================================================
// Meta mensal com forecast
// ============================================================

function PainelMetaMensal({ meta }: any) {
  const pct = Math.min(100, Math.max(0, Number(meta.percentual) || 0));
  const pctReal = Number(meta.percentual) || 0;
  const noRitmo = !!meta.noRitmo;
  const cor = pctReal >= 100 ? C.green : noRitmo ? C.accent : C.yellow;
  const estimada = Number(meta.estimada) || 0;
  const faturado = Number(meta.faturado) || 0;
  const faltando = Number(meta.faltando) || 0;
  const porDia = Number(meta.porDia) || 0;
  const diasRestantes = Number(meta.diasRestantes) || 0;

  return (
    <article style={{
      background: `linear-gradient(135deg, ${cor}1a, ${C.card} 60%)`,
      border: `1px solid ${cor}55`, borderRadius: 14,
      padding: 20, position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "inherit",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%)",
        pointerEvents: "none",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, position: "relative" }}>
        <span style={{ color: cor, display: "inline-flex" }}><IconTarget /></span>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: "0.02em", color: C.text }}>
          Meta do mês
        </h3>
        <span style={{ fontSize: 11, color: C.muted, marginLeft: 4, fontFamily: FONT_MONO }}>
          estimada pela média dos últimos 3 meses
        </span>
        <DeltaPill
          texto={pctReal >= 100 ? "Bateu meta" : noRitmo ? "No ritmo" : "Atrasado"}
          tipo={pctReal >= 100 ? "up" : noRitmo ? "up" : "down"}
          style={{ marginLeft: "auto" }}
        />
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
        gap: 18, alignItems: "end", position: "relative",
      }}>
        <div>
          <div style={{
            fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
            color: C.muted, marginBottom: 4,
          }}>Faturado de {fmtBRL(estimada)}</div>
          <div style={{
            fontSize: 30, fontWeight: 800, letterSpacing: "-0.025em",
            color: cor, fontVariantNumeric: "tabular-nums",
          }}>{fmtBRL(faturado)}</div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, fontFamily: FONT_MONO }}>
            {pctReal.toFixed(1)}% da meta
          </div>
        </div>
        <div>
          <div style={{
            fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
            color: C.muted, marginBottom: 4,
          }}>Falta</div>
          <div style={{
            fontSize: 20, fontWeight: 700, color: C.text,
            fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums",
          }}>{fmtBRL(faltando)}</div>
        </div>
        <div>
          <div style={{
            fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
            color: C.muted, marginBottom: 4,
          }}>Dias restantes</div>
          <div style={{
            fontSize: 20, fontWeight: 700, color: C.text,
            fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums",
          }}>{fmtNum(diasRestantes)}</div>
        </div>
        <div>
          <div style={{
            fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
            color: C.muted, marginBottom: 4,
          }}>Necessário/dia</div>
          <div style={{
            fontSize: 20, fontWeight: 700, color: noRitmo ? C.text : cor,
            fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums",
          }}>{fmtBRL(porDia)}</div>
        </div>
      </div>

      {/* Barra de progresso */}
      <div style={{ marginTop: 14, position: "relative" }}>
        <div style={{
          height: 10, borderRadius: 99, overflow: "hidden",
          background: "rgba(255,255,255,0.05)", position: "relative",
        }}>
          <div style={{
            width: `${pct}%`, height: "100%",
            background: pctReal >= 100
              ? `linear-gradient(90deg, ${C.green}, ${C.accent})`
              : `linear-gradient(90deg, ${cor}, ${cor}cc)`,
            transition: "width 0.4s ease",
          }} />
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between",
          marginTop: 6, fontSize: 10, color: C.muted, fontFamily: FONT_MONO,
        }}>
          <span>R$ 0</span>
          <span>{fmtBRL(estimada)}</span>
        </div>
      </div>
    </article>
  );
}

// ============================================================
// Caixa atual (status em tempo real)
// ============================================================

function PainelCaixaAtual({ caixa }: any) {
  const saldo = Number(caixa.saldoEsperado) || 0;
  const inicial = Number(caixa.saldoInicial) || 0;
  const entradas = Number(caixa.entradas) || 0;
  const saidas = Number(caixa.saidas) || 0;
  const abertoEm = caixa.abertoEm ? new Date(caixa.abertoEm) : null;
  const horaAberto = abertoEm
    ? abertoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <article style={{
      background: `linear-gradient(135deg, ${C.green}1a, ${C.card} 60%)`,
      border: `1px solid ${C.green}55`, borderRadius: 14,
      padding: 20, position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "inherit",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%)",
        pointerEvents: "none",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, position: "relative" }}>
        <span style={{ color: C.green, display: "inline-flex" }}><IconCash /></span>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: "0.02em", color: C.text }}>
          Caixa #{caixa.numero}
        </h3>
        <DeltaPill texto="Aberto" tipo="up" style={{ marginLeft: "auto" }} />
      </div>

      <div style={{ position: "relative" }}>
        <div style={{
          fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
          color: C.muted, marginBottom: 4,
        }}>Saldo esperado</div>
        <div style={{
          fontSize: 28, fontWeight: 800, letterSpacing: "-0.025em",
          color: C.green, fontVariantNumeric: "tabular-nums",
        }}>{fmtBRL(saldo)}</div>
      </div>

      <div style={{
        marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
        gap: 8, fontSize: 11, fontFamily: FONT_MONO, position: "relative",
      }}>
        <div>
          <div style={{ color: C.muted, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Inicial
          </div>
          <div style={{ color: C.text, fontWeight: 600, marginTop: 2 }}>{fmtBRL(inicial)}</div>
        </div>
        <div>
          <div style={{ color: C.muted, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Entradas
          </div>
          <div style={{ color: C.green, fontWeight: 600, marginTop: 2 }}>+{fmtBRL(entradas)}</div>
        </div>
        <div>
          <div style={{ color: C.muted, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Saídas
          </div>
          <div style={{ color: C.red, fontWeight: 600, marginTop: 2 }}>−{fmtBRL(saidas)}</div>
        </div>
      </div>

      <div style={{
        marginTop: 10, fontSize: 11, color: C.muted, fontFamily: FONT_MONO,
        position: "relative",
      }}>
        Aberto às {horaAberto}
      </div>
    </article>
  );
}

// ============================================================
// Top categorias do mês
// ============================================================

function PainelTopCategorias({ itens, totalMes }: any) {
  const cores = [C.accent, C.green, C.yellow, C.purple, C.red];
  return (
    <Card>
      <CardHead
        titulo="Top categorias do mês"
        meta={totalMes > 0 ? `${fmtBRL(totalMes)} no total` : "—"}
      />
      {itens.length === 0 ? (
        <Vazio texto="Nenhuma categoria com vendas no mês." />
      ) : itens.map((cat, idx) => {
        const pct = totalMes > 0 ? (Number(cat.total) / Number(totalMes)) * 100 : 0;
        const cor = cores[idx % cores.length];
        return (
          <div key={cat.id} style={{
            padding: "10px 0",
            borderBottom: idx < itens.length - 1 ? `1px dashed ${C.border}` : "0",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                display: "grid", placeItems: "center",
                fontFamily: FONT_MONO, fontSize: 10, fontWeight: 700,
                color: cor, background: cor + "1f", border: `1px solid ${cor}44`,
              }}>{idx + 1}</span>
              <span style={{
                flex: 1, fontSize: 13, fontWeight: 600, color: C.white,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{cat.nome}</span>
              <span style={{
                fontSize: 11, color: C.muted, fontFamily: FONT_MONO,
              }}>{fmtNum(cat.quantidade)} un</span>
              <span style={{
                fontSize: 13, color: cor, fontFamily: FONT_MONO, fontWeight: 700,
              }}>{fmtBRL(cat.total)}</span>
            </div>
            <div style={{
              height: 5, borderRadius: 99, overflow: "hidden",
              background: "rgba(255,255,255,0.05)",
            }}>
              <div style={{
                width: `${Math.max(2, pct)}%`, height: "100%",
                background: `linear-gradient(90deg, ${cor}, ${cor}88)`,
              }} />
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 4, fontFamily: FONT_MONO }}>
              {pct.toFixed(1)}% do faturamento
            </div>
          </div>
        );
      })}
    </Card>
  );
}

// ============================================================
// Vendas por hora do dia (heatmap horizontal)
// ============================================================

function PainelVendasPorHora({ itens }: any) {
  const arr = itens.length === 24 ? itens : Array.from({ length: 24 }, (_, h) => {
    const found = itens.find(x => Number(x.hora) === h);
    return found || { hora: h, qtd: 0, total: 0 };
  });
  const max = Math.max(0, ...arr.map(x => Number(x.total) || 0));
  const totalDia = arr.reduce((a, x) => a + (Number(x.total) || 0), 0);
  const pico = arr.reduce((best, x) =>
    (Number(x.total) || 0) > (Number(best.total) || 0) ? x : best
  , { hora: -1, total: 0, qtd: 0 });

  const W = 720, H = 140;
  const padL = 32, padR = 12, padT = 14, padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const colW = innerW / 24;
  const barW = Math.max(8, colW * 0.7);

  return (
    <Card>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
      }}>
        <h3 style={{
          margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: "0.02em", color: C.text,
        }}>Vendas por hora (mês)</h3>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: C.muted, fontFamily: FONT_MONO }}>
          {pico.hora >= 0 && pico.total > 0
            ? `pico ${String(pico.hora).padStart(2, "0")}h · ${fmtBRL(pico.total)}`
            : "sem dados"}
        </span>
      </div>

      <div style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
             style={{ width: "100%", height: "100%" }}>
          <defs>
            <linearGradient id="hora-bar" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={C.accent} />
              <stop offset="100%" stopColor={C.purple} />
            </linearGradient>
          </defs>

          {/* baseline */}
          <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH}
            stroke={C.border} />

          {arr.map((h, i) => {
            const v = Number(h.total) || 0;
            const altura = max > 0 ? (v / max) * innerH : 0;
            const cx = padL + i * colW + colW / 2;
            const x = cx - barW / 2;
            const y = padT + innerH - altura;
            const isPico = pico.hora === h.hora && v > 0;
            const fill = v === 0
              ? "rgba(255,255,255,0.06)"
              : isPico ? C.green : "url(#hora-bar)";
            return (
              <g key={i}>
                <rect x={x} y={v === 0 ? padT + innerH - 2 : y}
                  width={barW} height={v === 0 ? 2 : Math.max(altura, 2)}
                  rx={3} fill={fill} />
                {(i % 3 === 0 || isPico) && (
                  <text x={cx} y={H - 12} textAnchor="middle"
                    style={{
                      fill: isPico ? C.green : C.muted,
                      fontSize: 9.5, fontFamily: FONT_MONO,
                      fontWeight: isPico ? 700 : 500,
                    }}>
                    {String(h.hora).padStart(2, "0")}h
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginTop: 8, fontSize: 11, color: C.muted, fontFamily: FONT_MONO,
      }}>
        <span>Total distribuído: {fmtBRL(totalDia)}</span>
        <span>24 horas</span>
      </div>
    </Card>
  );
}

// ============================================================
// Skeleton de loading
// ============================================================

function SkeletonDashboard() {
  const sk = (h) => ({
    height: h, borderRadius: 14,
    background: `linear-gradient(180deg, ${C.card}, ${C.surface})`,
    border: `1px solid ${C.border}`,
    opacity: 0.65,
  });
  return (
    <div style={{ fontFamily: FONT_SANS }}>
      <div style={{
        height: 44, borderRadius: 8, width: 260, marginBottom: 18,
        background: C.card, border: `1px solid ${C.border}`, opacity: 0.65,
      }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 14 }}>
        {[0,1,2,3].map(i => <div key={i} style={sk(124)} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 14 }}>
        {[0,1,2,3,4,5].map(i => <div key={i} style={sk(72)} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)", gap: 14, marginBottom: 14 }}>
        <div style={sk(296)} />
        <div style={sk(296)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 14 }}>
        <div style={sk(200)} />
        <div style={sk(200)} />
      </div>
    </div>
  );
}

function Vazio({ texto }: any) {
  return (
    <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "16px 0" }}>
      {texto}
    </div>
  );
}

// ============================================================
// Ícones (SVG inline, stroke 1.8)
// ============================================================

const sw = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

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
function IconPeople() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" {...sw}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 5-6 8-6s7 2 8 6" /></svg>);
}
function IconUserPlus() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" {...sw}><circle cx="10" cy="8" r="4" /><path d="M2 21c1-4 5-6 8-6 1.4 0 2.7.3 3.8.8" /><path d="M18 12v6M15 15h6" /></svg>);
}
function IconBox() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" {...sw}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 9v12" /></svg>);
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
function IconBalance() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" {...sw}><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h7" /><path d="M17 15l2 2 4-4" /></svg>);
}
function IconCoin() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" {...sw}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.4c0 3 6 1.5 6 4.6 0 1.4-1.3 2.5-3 2.5s-3-1-3-2.5" /></svg>);
}
function IconTarget() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" {...sw}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>);
}
function IconCash() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" {...sw}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M5 9.5v5M19 9.5v5" /></svg>);
}
function IconWarehouse() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" {...sw}><path d="M3 21V9l9-5 9 5v12" /><path d="M7 21v-8h10v8" /><path d="M10 17h4" /></svg>);
}
function IconUserOff() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" {...sw}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 5-6 8-6 1.4 0 2.7.3 3.8.8" /><path d="M16 16l6 6M22 16l-6 6" /></svg>);
}
