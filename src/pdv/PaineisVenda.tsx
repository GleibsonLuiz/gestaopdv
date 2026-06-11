// Paineis e leafs da tela NovaVenda: grafico "Vendas de hoje" por forma,
// estados de cestinha vazia (clean e completo), atalho clicavel e total
// animado da sidebar do carrinho.
import { useEffect, useRef, useState } from "react";
import FotoProduto from "./FotoProduto";
import { FORMA_LABEL, FORMA_COR_VAR, fmtBRL, fmtQtd, fmtPartes } from "./comum";

// ============== TOPO DO PDV: VENDAS DE HOJE POR FORMA DE PAGAMENTO ==============
// Substitui o antigo CaixaStatusCard. Saldo, sangria, suprimento e faturamento
// total deixam de aparecer aqui — tudo isso fica restrito a tela do Caixa.
export function FormasPagamentoTopo({ resumo, role }) {
  const r = resumo || { porForma: [], quantidade: 0 };
  const totalPagamentos = r.porForma.reduce((acc, f) => acc + f.total, 0);
  const qtdVendas = r.quantidade || r.porForma.reduce((acc, f) => acc + (f.quantidade || 0), 0);
  const dataLabel = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const semVendas = r.porForma.length === 0;
  const formasOrdenadas = [...r.porForma].sort((a, b) => b.total - a.total);
  const maxValor = formasOrdenadas.reduce((m, f) => Math.max(m, f.total), 0) || 1;
  // VENDEDOR ve apenas percentuais; GERENTE/ADMIN veem valores em R$.
  const mostrarValor = role === "ADMIN" || role === "GERENTE";
  // Resumo numerico contextual: "R$ 50,00 · 3 vendas" para gerente,
  // "3 vendas" para vendedor. Substitui o antigo "100%" isolado que
  // nao dizia 100% DE QUE.
  const totalLabel = semVendas
    ? "—"
    : mostrarValor
      ? `${fmtBRL(totalPagamentos)} · ${qtdVendas} ${qtdVendas === 1 ? "venda" : "vendas"}`
      : `${qtdVendas} ${qtdVendas === 1 ? "venda" : "vendas"}`;

  return (
    <div className="pdv-graf-formas">
      <div className="pdv-graf-hd">
        <span className="pdv-graf-icon">◆</span>
        <span className="pdv-graf-lbl">Vendas de hoje</span>
        <span className="pdv-graf-date">{dataLabel}</span>
        <span className="pdv-graf-total" title={semVendas ? "" : `${qtdVendas} venda(s) finalizada(s) hoje${mostrarValor ? ` totalizando ${fmtBRL(totalPagamentos)}` : ""}`}>
          {semVendas ? <span className="pdv-graf-total-mut">—</span> : totalLabel}
        </span>
      </div>
      <div className="pdv-graf-body">
        {semVendas ? (
          <div className="pdv-graf-empty">Sem vendas finalizadas hoje</div>
        ) : (
          <div className="pdv-graf-chart">
            {formasOrdenadas.map(f => {
              const pct = (f.total / maxValor) * 100;
              const pctTotal = (f.total / (totalPagamentos || 1)) * 100;
              const cor = FORMA_COR_VAR[f.formaPagamento] || "var(--pdv-accent)";
              const nomeCompleto = FORMA_LABEL[f.formaPagamento] || f.formaPagamento;
              const label = nomeCompleto.slice(0, 6);
              return (
                <div
                  key={f.formaPagamento}
                  className="pdv-graf-col"
                  title={`${nomeCompleto}: ${fmtBRL(f.total)} (${pctTotal.toFixed(0)}%)`}
                >
                  <div className="pdv-graf-lbl-bot">{label}</div>
                  <div className="pdv-graf-bar-wrap">
                    <div
                      className="pdv-graf-bar"
                      style={{
                        width: `${Math.max(pct, 6)}%`,
                        background: `linear-gradient(90deg, color-mix(in oklab, ${cor} 75%, white), ${cor})`,
                        boxShadow: `3px 0 10px -2px ${cor}66, inset 0 1px 0 rgba(255,255,255,.15)`,
                      }}
                    />
                  </div>
                  <div className="pdv-graf-val" style={{ color: cor }}>
                    {mostrarValor ? fmtBRL(f.total) : `${pctTotal.toFixed(0)}%`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============== CESTINHA VAZIA — MODO CLEAN ==============
// Substituto do AcessoRapido no modo focado: nada de "Mais vendidos" nem
// historico — so a confirmacao visual de que o sistema esta pronto pra
// bipar. Quem quer os cards alterna de volta com F7.
export function CestinhaVaziaClean() {
  return (
    <div className="pdv-clean-vazio">
      <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7V5a1 1 0 0 1 1-1h2"/>
        <path d="M20 7V5a1 1 0 0 0-1-1h-2"/>
        <path d="M4 17v2a1 1 0 0 0 1 1h2"/>
        <path d="M20 17v2a1 1 0 0 1-1 1h-2"/>
        <path d="M8 9v6M12 9v6M16 9v6"/>
      </svg>
      <div className="pdv-clean-vazio-tit">Pronto para bipar</div>
      <div className="pdv-clean-vazio-sub">
        Bipe ou digite o código/nome do produto e pressione <span className="pdv-kbd is-accent">⏎</span>
      </div>
    </div>
  );
}

// ============== ACESSO RAPIDO (cestinha vazia) ==============
// Mostrado no espaco antes ocupado por "Cestinha vazia". Combina chips dos
// produtos mais vendidos (clicaveis) com lista das ultimas vendas do caixa.
export function AcessoRapido({ user, topProdutos, ultimasVendas, onAdicionar, onAbrirVenda }) {
  const semDados = (!topProdutos?.length) && (!ultimasVendas?.length);
  // ADMIN/GERENTE veem vendas de varios vendedores — mostrar de quem e cada
  // uma. VENDEDOR ja so ve as proprias (filtrado no backend).
  const mostrarVendedor = user?.role === "ADMIN" || user?.role === "GERENTE";

  if (semDados) {
    return (
      <div className="pdv-cart-empty">
        <div className="pdv-cart-empty-mark">🛒</div>
        <div className="pdv-cart-empty-body">
          <div className="pdv-cart-empty-title">Pronto para a primeira venda</div>
          <div className="pdv-cart-empty-sub">Três formas de adicionar um produto:</div>
          <ul className="pdv-cart-empty-steps">
            <li>
              <span className="pdv-cart-empty-step-num">1</span>
              <div>
                <b>Bipe</b> o código de barras com o leitor
                <span className="pdv-cart-empty-step-hint">o foco está no campo de busca</span>
              </div>
            </li>
            <li>
              <span className="pdv-cart-empty-step-num">2</span>
              <div>
                <b>Digite</b> o nome ou código no campo à direita
                <span className="pdv-cart-empty-step-hint">use ↑ ↓ + Enter para escolher</span>
              </div>
            </li>
            <li>
              <span className="pdv-cart-empty-step-num">3</span>
              <div>
                <b>Finalize</b> com <span className="pdv-kbd">F10</span> e escolha forma de pagamento (F1–F6)
              </div>
            </li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div>
      {topProdutos?.length > 0 && (
        <div>
          <div className="pdv-section-hd">
            <div className="pdv-card-title">
              <span style={{ color: "var(--pdv-accent)" }}>⚡</span>
              Mais vendidos · 30 dias
              <span className="pill">{topProdutos.length}</span>
            </div>
            <div className="helper">Alt+1–{Math.min(topProdutos.length, 9)} ou clique</div>
          </div>
          <div className="pdv-top-grid">
            {topProdutos.map((p, idx) => {
              const isServico = p.tipoItem === "SERVICO";
              const estoqueNum = Number(p.estoque) || 0;
              const minimoNum = Number(p.estoqueMinimo) || 0;
              const semEstoque = !isServico && estoqueNum <= 0;
              // Critico = abaixo ou igual ao minimo configurado, mas ainda
              // com algum estoque. Sem minimo cadastrado (0), nao alerta.
              const estoqueCritico = !isServico && !semEstoque && minimoNum > 0 && estoqueNum <= minimoNum;
              const numero = idx + 1;
              const temAtalho = numero <= 9;
              const tooltipBase = isServico
                ? `Serviço — ${p.nome}`
                : semEstoque
                  ? `Sem estoque — ${p.nome}`
                  : estoqueCritico
                    ? `⚠ Estoque crítico (${fmtQtd(estoqueNum)} ${p.unidade}, mínimo ${fmtQtd(minimoNum)}) — ${p.nome}`
                    : `${p.nome} — ${fmtQtd(estoqueNum)} ${p.unidade} em estoque`;
              return (
                <button
                  key={p.id} type="button"
                  onClick={() => !semEstoque && onAdicionar(p)}
                  disabled={semEstoque}
                  title={`${tooltipBase}${temAtalho && !semEstoque ? ` (Alt+${numero})` : ""}`}
                  className={`pdv-top-card ${estoqueCritico ? "is-critico" : ""}`}
                >
                  {temAtalho && (
                    <span className="pdv-top-card-num" aria-hidden="true">{numero}</span>
                  )}
                  <FotoProduto url={p.imagem} nome={p.nome} tamanho={42} servico={isServico} />
                  <div className="pdv-top-card-info">
                    <div className="pdv-top-card-name" title={p.nome}>{p.nome}</div>
                    <div className="pdv-top-card-foot">
                      <span className="pdv-top-card-price">{fmtBRL(p.precoVenda)}</span>
                      {isServico ? (
                        <span className="pdv-top-card-tag is-svc">SERVIÇO</span>
                      ) : estoqueCritico ? (
                        <span className="pdv-top-card-tag is-warn" title={`Mínimo: ${fmtQtd(minimoNum)} ${p.unidade}`}>
                          ⚠ {fmtQtd(estoqueNum)} {p.unidade}
                        </span>
                      ) : (
                        <span className="pdv-top-card-stock">
                          {fmtQtd(estoqueNum)} {p.unidade}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {ultimasVendas?.length > 0 && (
        <div>
          <div className="pdv-section-hd" style={{ marginTop: 8 }}>
            <div className="pdv-card-title">
              <span style={{ color: "var(--pdv-t3)" }}>⏱</span>
              {mostrarVendedor ? "Últimas vendas deste caixa" : "Minhas vendas de hoje"}
            </div>
          </div>
          <div>
            {ultimasVendas.map((v) => {
              const cor = FORMA_COR_VAR[v.formaPagamento] || "var(--pdv-accent)";
              const primeiroNomeVendedor = v.user?.nome?.split(" ")[0] || "";
              return (
                <button
                  key={v.id} type="button"
                  onClick={() => onAbrirVenda(v.id)}
                  className="pdv-rec-row"
                  title={mostrarVendedor && v.user?.nome ? `Vendedor: ${v.user.nome}` : undefined}
                >
                  <div className="pdv-rec-id">#{v.numero}</div>
                  <div className={`pdv-rec-cust ${!v.cliente?.nome ? "is-empty" : ""}`}>
                    {v.cliente?.nome || "Consumidor"}
                    {mostrarVendedor && primeiroNomeVendedor && (
                      <span style={{
                        marginLeft: 8, fontSize: 11, color: "var(--pdv-t3)",
                        opacity: 0.75, fontWeight: 500,
                      }}>
                        · {primeiroNomeVendedor}
                      </span>
                    )}
                  </div>
                  <div className="pdv-rec-method">
                    <span className="pdv-rec-method-dot" style={{ background: cor }} />
                    {FORMA_LABEL[v.formaPagamento] || v.formaPagamento}
                  </div>
                  <div className="pdv-rec-total">{fmtBRL(v.total)}</div>
                  <div className="pdv-rec-time">
                    {new Date(v.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============== ATALHO CLICAVEL ==============
export function BotaoAtalho({ tecla, label, tom = "mut", disabled, onClick }) {
  const klass = tom === "warn" ? "k-warn" : tom === "ok" ? "k-ok" : tom === "info" ? "k-info" : "k-mut";
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      title={`Pressione ${tecla}`}
      className="pdv-short-btn"
    >
      <span className={`pdv-short-key ${klass}`}>{tecla}</span>
      <span className="pdv-short-lbl">{label}</span>
    </button>
  );
}

// Animated counter — interpolação cubic-out para o total mudar suave
function useCountUp(target, duration = 380) {
  const [v, setV] = useState(target);
  const startRef = useRef(target);
  useEffect(() => {
    const from = startRef.current;
    const to = target;
    if (from === to) return;
    let raf, t0;
    const step = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else startRef.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

// ============== TOTAL ANIMADO (cart sidebar) ==============
export function TotalAnimado({ valor }) {
  const v = useCountUp(valor);
  const { int, dec } = fmtPartes(v);
  return (
    <span className="pdv-total-num">
      <span className="cur">R$</span>{int}<span className="cents">,{dec}</span>
    </span>
  );
}
