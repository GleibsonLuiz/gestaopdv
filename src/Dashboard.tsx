import { useCallback, useEffect, useMemo, useState } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";
// Fase 5 (fatiamento): helpers, primitivos visuais, paineis e icones do
// Dashboard moram em src/dashboard/. Aqui ficam o root (fetch + auto-refresh)
// e o ConteudoDashboard (composicao das secoes).
import {
  FONT_SANS, FONT_MONO, fmtBRL, fmtBRLSplit, fmtDataHora, fmtNumero,
  fmtPercentual, saudacao,
} from "./dashboard/comum";
import {
  SegmentedPeriodo, BotaoAtualizar, KpiCard, Sparkline, MiniTile,
  SkeletonDashboard,
} from "./dashboard/primitivos";
import {
  PainelGraficoVendas, PainelTopProdutos, PainelTopVendedores,
  PainelFormasPagamento, PainelFinanceiro, PainelSaldoFinanceiro,
  PainelProximasContas, PainelUltimasVendas, PainelUltimasCompras,
  PainelMetaMensal, PainelCaixaAtual, PainelTopCategorias, PainelVendasPorHora,
} from "./dashboard/paineis";
import {
  IconAlert, IconBag, IconBillIn, IconBillOut, IconBox, IconCart, IconCoin,
  IconPeople, IconTicket, IconTrendUp, IconTruck, IconUser, IconUserOff,
  IconUserPlus, IconWarehouse,
} from "./dashboard/icones";


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
  // Seletor de periodo do header. Reescala os paineis analiticos + o KPI de
  // periodo (o backend recebe ?periodo= e recalcula a janela). Os KPIs fixos
  // por natureza (vendas hoje/mes, meta, caixa, proximas contas) nao mudam.
  const [periodo, setPeriodo] = useState("7dias");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.obterDashboard(periodo);
      setDados(data);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

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
  return (
    <ConteudoDashboard
      dados={dados}
      onAtualizar={carregar}
      user={user}
      contagem={contagem}
      periodo={periodo}
      onPeriodoChange={setPeriodo}
    />
  );
}

function ConteudoDashboard({ dados, onAtualizar, user, contagem, periodo, onPeriodoChange }: any) {
  const k = dados.kpis;
  // Resumo + rotulo do periodo selecionado (alimentam o KPI de periodo e os
  // titulos/denominadores dos paineis analiticos). Fallbacks p/ payloads antigos.
  const periodoResumo = dados.periodoResumo || { total: 0, quantidade: 0, ticket: 0, variacaoPercentual: null };
  const periodoLabel = dados.periodo?.label || "7 dias";
  const periodoChave = dados.periodo?.chave || "7dias";
  const serie = dados.serie || dados.vendasPorDia || [];
  const serieGranularidade = dados.serieGranularidade || "dia";

  const variacaoPeriodo = fmtPercentual(periodoResumo.variacaoPercentual);
  const tipoVariacaoPeriodo =
    periodoResumo.variacaoPercentual === null ? "flat" :
    periodoResumo.variacaoPercentual > 0 ? "up" :
    periodoResumo.variacaoPercentual < 0 ? "down" : "flat";
  const ticketPeriodo = Number(periodoResumo.ticket) || 0;
  const qtdPeriodo = Number(periodoResumo.quantidade) || 0;

  const totalFormas = useMemo(
    () => (dados.formasPagamento || []).reduce((a, f) => a + Number(f.total || 0), 0),
    [dados.formasPagamento]
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
          <SegmentedPeriodo valor={periodo} onChange={onPeriodoChange} />
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
            icone={<IconTrendUp />}
            rotulo={`Vendas · ${periodoLabel}`}
            valor={fmtBRLSplit(periodoResumo.total)}
            descricao={`${fmtNumero(qtdPeriodo)} ${qtdPeriodo === 1 ? "venda" : "vendas"} · ticket ${fmtBRL(ticketPeriodo)}`}
            comparativo={variacaoPeriodo ? `${variacaoPeriodo} vs. período anterior` : "no período selecionado"}
            delta={variacaoPeriodo ? { texto: variacaoPeriodo, tipo: tipoVariacaoPeriodo } : null}
            sparkline={<Sparkline cor={C.accent} pontos={serie.map(d => d.total)} />}
          />
          {/* "Vendas hoje" e a referencia fixa do dia. Quando o periodo
              selecionado JA e "Hoje", o card de periodo acima mostra o mesmo
              numero — entao ocultamos este para nao duplicar. */}
          {periodoChave !== "hoje" && (
            <KpiCard
              cor={C.accent}
              icone={<IconCart />}
              rotulo="Vendas hoje"
              valor={fmtBRLSplit(k.vendasHoje.total)}
              descricao={`${fmtNumero(tickets)} ${tickets === 1 ? "venda" : "vendas"} · ticket ${fmtBRL(ticketHoje)}`}
              comparativo="hoje"
              sparkline={<Sparkline cor={C.accent} pontos={(dados.vendasPorDia || []).map(d => d.total)} />}
            />
          )}
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
            descricao={`${fmtNumero(k.comprasMes.quantidade)} ${k.comprasMes.quantidade === 1 ? "compra registrada" : "compras registradas"}`}
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
              ? `${fmtNumero(k.valorEstoque.itens)} unidades`
              : "imobilizado"}
          />
          <MiniTile icone={<IconPeople />} label="Clientes" valor={fmtNumero(k.clientesAtivos)} hint="ativos" />
          <MiniTile icone={<IconUserPlus />} label="Novos clientes" valor={fmtNumero(k.novosCLientesMes || 0)} hint="este mês" />
          <MiniTile icone={<IconBox />} label="Produtos" valor={fmtNumero(k.produtosAtivos)} hint="ativos" />
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
          {(k.clientesInativos || 0) > 0 && (
            <MiniTile
              icone={<IconUserOff />}
              label="Clientes inativos"
              valor={fmtNumero(k.clientesInativos)}
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
          <PainelGraficoVendas
            dados={serie}
            total={periodoResumo.total}
            granularidade={serieGranularidade}
            titulo={`Vendas · ${periodoLabel}`}
          />
          <PainelTopProdutos itens={dados.topProdutos || []} totalMes={periodoResumo.total} periodoLabel={periodoLabel} />
        </section>

        {/* ========= TOP CATEGORIAS + VENDEDORES ========= */}
        <section style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
        }}>
          <PainelTopCategorias itens={dados.topCategorias || []} totalMes={periodoResumo.total} periodoLabel={periodoLabel} />
          <PainelTopVendedores
            itens={dados.topVendedores || []}
            totalMes={periodoResumo.total}
            qtdMes={qtdPeriodo}
            periodoLabel={periodoLabel}
            periodoChave={periodoChave}
          />
        </section>

        {/* ========= VENDAS POR HORA + PAGAMENTOS ========= */}
        <section style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
        }}>
          <PainelVendasPorHora itens={dados.vendasPorHora || []} periodoLabel={periodoLabel} />
          <PainelFormasPagamento itens={dados.formasPagamento || []} totalGeral={totalFormas} qtdMes={qtdPeriodo} periodoLabel={periodoLabel} />
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
          <div>Gestão<span className="gp-brand-max">ProMax</span> · sincronizado · sessão segura</div>
          <div>Atualizado {fmtDataHora(dados.geradoEm)}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// HERO controls
// ============================================================


