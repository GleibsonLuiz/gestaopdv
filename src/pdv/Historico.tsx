// Aba Historico do PDV: lista de vendas com filtros, detalhe, reimpressao,
// cancelamento e refinalizacao (alterar forma de pagamento) com autorizacao
// gerencial para VENDEDOR. Tipagem fina fica para a etapa de tipagem.
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { C } from "../lib/theme";
import { api } from "../lib/api";
import { useModalKeys } from "../lib/modalKeys";
import ActionsMenu from "../components/ActionsMenu";
import ReciboModal from "./ReciboModal";
import {
  FORMAS, FORMA_LABEL, FORMAS_GERA_RECEBER, FORMA_COR_VAR,
  fmtBRL, fmtQtd, fmtData, STATUS_INFO, dataDaqui,
} from "./comum";
import { pagamentosReducer, criarPagamento } from "./pagamentos";

export default function Historico({ user }) {
  const [vendas, setVendas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [filtroForma, setFiltroForma] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [detalhe, setDetalhe] = useState<any>(null);
  const [reimpressao, setReimpressao] = useState<any>(null);
  const [refinalizar, setRefinalizar] = useState<any>(null);
  const [corrigindo, setCorrigindo] = useState<any>(null);
  const [autorizacaoPendente, setAutorizacaoPendente] = useState<any>(null);
  const [autorizacaoCreds, setAutorizacaoCreds] = useState<any>(null);
  const [mensagem, setMensagem] = useState("");

  const podeCancelar = user.role === "ADMIN" || user.role === "GERENTE";
  // VENDEDOR pode alterar forma de pagamento, mas precisa de autorizacao
  // gerencial (email + senha de um ADMIN/GERENTE) — validada no backend.
  const podeReabrir = true;
  const exigeAutorizacao = user.role === "VENDEDOR";

  useModalKeys(!!detalhe, { onClose: () => setDetalhe(null) });
  useModalKeys(!!reimpressao, { onClose: () => setReimpressao(null) });
  useModalKeys(!!refinalizar, { onClose: () => setRefinalizar(null) });
  useModalKeys(!!autorizacaoPendente, { onClose: () => setAutorizacaoPendente(null) });

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.listarVendas({
        formaPagamento: filtroForma,
        status: filtroStatus,
        dataInicio,
        dataFim,
        limite: "100",
      });
      setVendas(data as any[]);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [filtroForma, filtroStatus, dataInicio, dataFim]);

  useEffect(() => { carregar(); }, [carregar]);

  function flash(t) {
    setMensagem(t);
    setTimeout(() => setMensagem(""), 2500);
  }

  async function abrirDetalhe(id) {
    try {
      const v = await api.obterVenda(id);
      setDetalhe(v);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function abrirReimpressao(id) {
    try {
      const v = await api.obterVenda(id);
      setReimpressao(v);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function cancelar(v) {
    if (!confirm(`Cancelar venda #${v.numero}? Os itens serão devolvidos ao estoque.`)) return;
    try {
      await api.cancelarVenda(v.id);
      flash(`Venda #${v.numero} cancelada — estoque estornado.`);
      setDetalhe(null);
      carregar();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  // Ponto de entrada para "Alterar forma de pagamento" / "Continuar refinalizacao".
  // VENDEDOR cai antes na AutorizacaoModal; ADMIN/GERENTE seguem direto.
  function solicitarAlteracao(v, tipo) {
    if (exigeAutorizacao) {
      // Fecha o modal de detalhe (se estiver aberto) antes de pedir
      // a senha, para nao empilhar dois modais e nao reagir 2x ao Esc.
      setDetalhe(null);
      setAutorizacaoPendente({ tipo, venda: v });
      return;
    }
    if (tipo === "reabrir") return reabrir(v, null);
    if (tipo === "continuar") return continuarRefinalizacao(v, null);
  }

  async function reabrir(v, autorizacao) {
    // Para ADMIN/GERENTE mantemos o aviso por confirm. VENDEDOR ja viu a
    // modal de autorizacao gerencial, entao pulamos o confirm para nao
    // duplicar a friccao.
    if (!autorizacao) {
      const msg =
        `Reabrir venda #${v.numero} para alterar a forma de pagamento?\n\n` +
        `• O lançamento no caixa será estornado.\n` +
        `• Contas a receber pendentes serão canceladas.\n` +
        `• O estoque NÃO será mexido (o cliente já levou a mercadoria).`;
      if (!confirm(msg)) return;
    }
    try {
      const reaberta = await api.reabrirVenda(v.id, autorizacao || undefined);
      flash(`Venda #${v.numero} reaberta — selecione a nova forma de pagamento.`);
      setDetalhe(null);
      setAutorizacaoCreds(autorizacao || null);
      setRefinalizar(reaberta);
      carregar();
    } catch (err) {
      alert((err as Error).message);
      // Em caso de senha invalida, reabre a modal de autorizacao para
      // o vendedor tentar de novo sem perder o contexto.
      if (autorizacao) setAutorizacaoPendente({ tipo: "reabrir", venda: v });
    }
  }

  async function continuarRefinalizacao(v, autorizacao) {
    try {
      const completa = await api.obterVenda(v.id);
      setAutorizacaoCreds(autorizacao || null);
      setRefinalizar(completa);
      setDetalhe(null);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function confirmarAutorizacao(creds) {
    const pend = autorizacaoPendente;
    if (!pend) return;
    const autorizacao = {
      emailAutorizacao: creds.email,
      senhaAutorizacao: creds.senha,
    };
    setAutorizacaoPendente(null);
    if (pend.tipo === "reabrir") await reabrir(pend.venda, autorizacao);
    else if (pend.tipo === "continuar") await continuarRefinalizacao(pend.venda, autorizacao);
  }

  async function aplicarRefinalizacao(payload) {
    const corpo = autorizacaoCreds ? { ...payload, ...autorizacaoCreds } : payload;
    try {
      await api.refinalizarVenda(refinalizar.id, corpo);
      flash(`Venda #${refinalizar.numero} refinalizada com ${FORMA_LABEL[payload.formaPagamento]}.`);
      setRefinalizar(null);
      setAutorizacaoCreds(null);
      carregar();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  // Estatísticas rápidas
  const stats = useMemo(() => {
    const concluidas = vendas.filter(v => v.status === "CONCLUIDA");
    const totalVendido = concluidas.reduce((acc, v) => acc + Number(v.total), 0);
    return {
      total: vendas.length,
      concluidas: concluidas.length,
      canceladas: vendas.filter(v => v.status === "CANCELADA").length,
      totalVendido,
    };
  }, [vendas]);

  return (
    <div>
      <div className="pdv-stats-grid">
        <Card titulo="Total" valor={stats.total} cor="var(--pdv-t1)" />
        <Card titulo="Concluídas" valor={stats.concluidas} cor="var(--pdv-accent)" />
        <Card titulo="Canceladas" valor={stats.canceladas} cor="var(--pdv-c-rose)" />
        <Card titulo="Faturamento" valor={fmtBRL(stats.totalVendido)} cor="var(--pdv-accent)" />
      </div>

      <div className="pdv-filter-bar">
        <select value={filtroForma} onChange={e => setFiltroForma(e.target.value)} className="pdv-field-select" style={{ width: "auto", minWidth: 160 }}>
          <option value="">Todas as formas</option>
          {FORMAS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="pdv-field-select" style={{ width: "auto", minWidth: 160 }}>
          <option value="">Todos os status</option>
          <option value="CONCLUIDA">Concluídas</option>
          <option value="CANCELADA">Canceladas</option>
        </select>
        <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="pdv-field-input" style={{ width: "auto" }} />
        <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="pdv-field-input" style={{ width: "auto" }} />
        {(filtroForma || filtroStatus || dataInicio || dataFim) && (
          <button onClick={() => { setFiltroForma(""); setFiltroStatus(""); setDataInicio(""); setDataFim(""); }} className="pdv-btn-ghost" style={{ padding: "10px 16px" }}>
            Limpar filtros
          </button>
        )}
      </div>

      {mensagem && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 10,
          background: "color-mix(in oklab, var(--pdv-accent) 14%, transparent)",
          border: "1px solid var(--pdv-accent-glow)",
          color: "var(--pdv-accent)", fontSize: 13,
        }}>{mensagem}</div>
      )}
      {erro && (
        <div style={{ marginBottom: 12 }}>
          <div className="pdv-erro-inline">{erro}</div>
        </div>
      )}

      <div className="pdv-card">
        <div style={{
          display: "grid", gridTemplateColumns: "150px 80px 1.5fr 120px 100px 90px 130px 80px",
          padding: "12px 18px", background: "var(--pdv-surf-2)",
          borderBottom: "1px solid var(--pdv-line)", fontSize: 10.5, fontWeight: 500,
          color: "var(--pdv-t3)", textTransform: "uppercase", letterSpacing: ".06em",
        }}>
          <div>Data</div>
          <div>Nº</div>
          <div>Cliente / Vendedor</div>
          <div>Pagamento</div>
          <div>Status</div>
          <div style={{ textAlign: "right" }}>Itens</div>
          <div style={{ textAlign: "right" }}>Total</div>
          <div style={{ textAlign: "right" }}>Ações</div>
        </div>

        {carregando ? (
          <div style={{ padding: 36, textAlign: "center", color: "var(--pdv-t3)", fontSize: 13 }}>Carregando…</div>
        ) : vendas.length === 0 ? (
          <div style={{ padding: 36, textAlign: "center", color: "var(--pdv-t3)", fontSize: 13 }}>Nenhuma venda encontrada.</div>
        ) : vendas.map(v => {
          const st = STATUS_INFO[v.status] || STATUS_INFO.CONCLUIDA;
          return (
            <div key={v.id} style={{
              display: "grid", gridTemplateColumns: "150px 80px 1.5fr 120px 100px 90px 130px 80px",
              padding: "12px 18px", borderBottom: "1px solid var(--pdv-line)",
              alignItems: "center", fontSize: 13,
              opacity: v.status === "CANCELADA" ? 0.55 : 1,
            }}>
              <div style={{ color: "var(--pdv-t3)", fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>{fmtData(v.createdAt)}</div>
              <div style={{ color: "var(--pdv-t3)", fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>#{v.numero}</div>
              <div>
                <div style={{ color: "var(--pdv-t1)", fontWeight: 500, fontSize: 13 }}>
                  {v.cliente?.nome || <span style={{ color: "var(--pdv-t3)", fontStyle: "italic", fontWeight: 400 }}>Consumidor</span>}
                </div>
                <div style={{ color: "var(--pdv-t3)", fontSize: 11 }}>por {v.user?.nome}</div>
              </div>
              <div style={{ color: "var(--pdv-t2)", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span className="pdv-rec-method-dot" style={{ background: FORMA_COR_VAR[v.formaPagamento] || "var(--pdv-accent)" }} />
                {FORMA_LABEL[v.formaPagamento] || v.formaPagamento}
              </div>
              <div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
                  background: `color-mix(in srgb, ${st.cor} 18%, transparent)`,
                  color: st.cor, border: `1px solid color-mix(in srgb, ${st.cor} 35%, transparent)`,
                }}>{st.label}</span>
              </div>
              <div style={{ textAlign: "right", color: "var(--pdv-t2)", fontVariantNumeric: "tabular-nums" }}>{v._count?.itens || 0}</div>
              <div style={{ textAlign: "right", color: "var(--pdv-t1)", fontWeight: 600, fontSize: 14, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{fmtBRL(v.total)}</div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <ActionsMenu
                  items={[
                    {
                      label: "Ver detalhes",
                      icon: "👁",
                      color: C.accent,
                      onClick: () => abrirDetalhe(v.id),
                    },
                    {
                      label: "Reimprimir cupom",
                      icon: "🖨",
                      color: C.green,
                      onClick: () => abrirReimpressao(v.id),
                      hidden: v.status !== "CONCLUIDA",
                    },
                    {
                      label: "Alterar forma de pagamento",
                      icon: "💱",
                      color: C.yellow,
                      onClick: () => solicitarAlteracao(v, "reabrir"),
                      hidden: !podeReabrir || v.status !== "CONCLUIDA",
                    },
                    {
                      label: "Corrigir itens",
                      icon: "✏️",
                      color: C.yellow,
                      onClick: () => { setDetalhe(null); setCorrigindo(v); },
                      hidden: !podeReabrir || (v.status !== "CONCLUIDA" && v.status !== "EM_EDICAO"),
                    },
                    {
                      label: "Continuar refinalização",
                      icon: "▶",
                      color: C.yellow,
                      onClick: () => solicitarAlteracao(v, "continuar"),
                      hidden: !podeReabrir || v.status !== "EM_EDICAO",
                    },
                  ]}
                />
              </div>
            </div>
          );
        })}
      </div>

      {detalhe && (
        <DetalheVendaModal
          venda={detalhe}
          onFechar={() => setDetalhe(null)}
          onCancelar={podeCancelar && detalhe.status === "CONCLUIDA" ? () => cancelar(detalhe) : null}
          onReabrir={podeReabrir && detalhe.status === "CONCLUIDA" ? () => solicitarAlteracao(detalhe, "reabrir") : null}
          onCorrigirItens={podeReabrir && (detalhe.status === "CONCLUIDA" || detalhe.status === "EM_EDICAO") ? () => { const v = detalhe; setDetalhe(null); setCorrigindo(v); } : null}
          onContinuarRefinalizacao={podeReabrir && detalhe.status === "EM_EDICAO" ? () => solicitarAlteracao(detalhe, "continuar") : null}
          onReimprimir={detalhe.status === "CONCLUIDA" ? () => {
            setReimpressao(detalhe);
            setDetalhe(null);
          } : null}
        />
      )}

      {reimpressao && (
        <ReciboModal
          venda={reimpressao}
          modoReimpressao
          onFechar={() => setReimpressao(null)}
        />
      )}

      {refinalizar && (
        <RefinalizarVendaModal
          venda={refinalizar}
          onFechar={() => { setRefinalizar(null); setAutorizacaoCreds(null); }}
          onAplicar={aplicarRefinalizacao}
        />
      )}

      {autorizacaoPendente && (
        <AutorizacaoGerencialModal
          venda={autorizacaoPendente.venda}
          acao={autorizacaoPendente.tipo === "continuar"
            ? "continuar a refinalizacao da venda"
            : "alterar a forma de pagamento desta venda"}
          onCancelar={() => setAutorizacaoPendente(null)}
          onConfirmar={confirmarAutorizacao}
        />
      )}

      {corrigindo && (
        <CorrigirVendaFlow
          venda={corrigindo}
          user={user}
          onFechar={() => { setCorrigindo(null); carregar(); }}
          onConcluido={(msg) => { setCorrigindo(null); flash(msg); carregar(); }}
        />
      )}
    </div>
  );
}

function Card({ titulo, valor, cor }) {
  return (
    <div className="pdv-stat-card">
      <div className="pdv-stat-label">{titulo}</div>
      <div className="pdv-stat-value" style={{ color: cor }}>{valor}</div>
    </div>
  );
}

export function DetalheVendaModal({ venda, onFechar, onCancelar, onReimprimir, onReabrir, onCorrigirItens, onContinuarRefinalizacao }) {
  const st = STATUS_INFO[venda.status] || STATUS_INFO.CONCLUIDA;
  return (
    <div onClick={onFechar} className="pdv-modal-bg">
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" className="pdv-modal" style={{ width: "min(720px, calc(100vw - 32px))" }}>
        <div className="pdv-modal-hd">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className="pdv-modal-title">Venda #{venda.numero}</div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99,
                background: `color-mix(in srgb, ${st.cor} 18%, transparent)`,
                color: st.cor, border: `1px solid color-mix(in srgb, ${st.cor} 35%, transparent)`,
                letterSpacing: ".02em",
              }}>{st.label}</span>
            </div>
            <div className="pdv-modal-sub">{fmtData(venda.createdAt)}</div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="pdv-modal-x">×</button>
        </div>

        <div className="pdv-modal-body" style={{ paddingBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <Bloco titulo="Cliente">
              {venda.cliente ? (
                <>
                  <div style={{ color: "var(--pdv-t1)", fontSize: 13.5, fontWeight: 500 }}>{venda.cliente.nome}</div>
                  {venda.cliente.cpfCnpj && <div style={{ color: "var(--pdv-t3)", fontSize: 11.5, marginTop: 2 }}>{venda.cliente.cpfCnpj}</div>}
                </>
              ) : (
                <div style={{ color: "var(--pdv-t3)", fontSize: 13, fontStyle: "italic" }}>— Consumidor —</div>
              )}
            </Bloco>
            <Bloco titulo="Vendedor">
              <div style={{ color: "var(--pdv-t1)", fontSize: 13.5, fontWeight: 500 }}>{venda.user?.nome}</div>
              <div style={{ color: "var(--pdv-t3)", fontSize: 11.5, marginTop: 2 }}>{venda.user?.role}</div>
            </Bloco>
          </div>

          <div style={{
            background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
            borderRadius: 12, overflow: "hidden", marginBottom: 14,
          }}>
            <div style={{
              display: "grid", gridTemplateColumns: "2.5fr 80px 130px 130px",
              padding: "10px 16px", background: "var(--pdv-bg-2)", borderBottom: "1px solid var(--pdv-line)",
              fontSize: 10.5, fontWeight: 500, color: "var(--pdv-t3)", textTransform: "uppercase", letterSpacing: ".06em",
            }}>
              <div>Produto</div>
              <div style={{ textAlign: "right" }}>Qtd</div>
              <div style={{ textAlign: "right" }}>Preço unit.</div>
              <div style={{ textAlign: "right" }}>Subtotal</div>
            </div>
            {venda.itens?.map(it => (
              <div key={it.id} style={{
                display: "grid", gridTemplateColumns: "2.5fr 80px 130px 130px",
                padding: "10px 16px", borderBottom: "1px solid var(--pdv-line)",
                alignItems: "center", fontSize: 13,
              }}>
                <div>
                  <div style={{ color: "var(--pdv-t1)", fontWeight: 500 }}>{it.produto?.nome}</div>
                  <div style={{ color: "var(--pdv-t3)", fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>{it.produto?.codigo}</div>
                </div>
                <div style={{ textAlign: "right", color: "var(--pdv-t2)", fontVariantNumeric: "tabular-nums" }}>{fmtQtd(it.quantidade)} {it.produto?.unidade || ""}</div>
                <div style={{ textAlign: "right", color: "var(--pdv-t2)", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(it.precoUnitario)}</div>
                <div style={{ textAlign: "right", color: "var(--pdv-t1)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(it.subtotal)}</div>
              </div>
            ))}
          </div>

          <div style={{
            background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
            borderRadius: 12, padding: 14,
          }}>
            {Array.isArray(venda.pagamentos) && venda.pagamentos.length > 1 ? (
              <div style={{ marginBottom: 8 }}>
                <div style={{ color: "var(--pdv-t3)", fontSize: 11, marginBottom: 6, fontWeight: 500 }}>
                  Pagamentos ({venda.pagamentos.length})
                </div>
                {venda.pagamentos.map(p => (
                  <div key={p.id} style={{
                    display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4,
                    paddingLeft: 10, borderLeft: `3px solid ${FORMA_COR_VAR[p.forma] || "var(--pdv-accent)"}`,
                  }}>
                    <span style={{ color: "var(--pdv-t2)" }}>
                      {p.formaCustomNome || FORMA_LABEL[p.forma] || p.forma}
                    </span>
                    <span style={{ color: "var(--pdv-t1)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                      {fmtBRL(p.valor)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: "var(--pdv-t3)" }}>Forma de pagamento</span>
                <span style={{ color: "var(--pdv-t1)", fontWeight: 500 }}>
                  {venda.pagamentos?.[0]?.formaCustomNome
                    || FORMA_LABEL[venda.pagamentos?.[0]?.forma || venda.formaPagamento]
                    || venda.formaPagamento}
                </span>
              </div>
            )}
            {Number(venda.desconto) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: "var(--pdv-t3)" }}>Desconto</span>
                <span style={{ color: "var(--pdv-c-rose)", fontWeight: 500 }}>− {fmtBRL(venda.desconto)}</span>
              </div>
            )}
            {venda.observacoes && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: "var(--pdv-t3)" }}>Obs.</span>
                <span style={{ color: "var(--pdv-t2)" }}>{venda.observacoes}</span>
              </div>
            )}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--pdv-line-2)",
            }}>
              <span style={{ color: "var(--pdv-t3)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 500 }}>Total</span>
              <span style={{ color: "var(--pdv-accent)", fontSize: 26, fontWeight: 600, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{fmtBRL(venda.total)}</span>
            </div>
          </div>
        </div>

        <div className="pdv-modal-foot" style={{ justifyContent: "space-between" }}>
          {onCancelar ? (
            <button onClick={onCancelar} className="pdv-btn-ghost" style={{ color: "var(--pdv-c-rose)", borderColor: "rgba(251,113,133,.35)" }}>
              Cancelar venda (estornar estoque)
            </button>
          ) : <div />}
          <div style={{ display: "flex", gap: 10 }}>
            {onCorrigirItens && (
              <button onClick={onCorrigirItens} className="pdv-btn-ghost" style={{ color: C.yellow, borderColor: "rgba(245,158,11,.35)" }}>
                ✏️ Corrigir itens
              </button>
            )}
            {onReabrir && (
              <button onClick={onReabrir} className="pdv-btn-ghost" style={{ color: C.yellow, borderColor: "rgba(245,158,11,.35)" }}>
                💱 Alterar forma de pagamento
              </button>
            )}
            {onContinuarRefinalizacao && (
              <button onClick={onContinuarRefinalizacao} className="pdv-btn-ghost" style={{ color: C.yellow, borderColor: "rgba(245,158,11,.35)" }}>
                ▶ Continuar refinalização
              </button>
            )}
            {onReimprimir && (
              <button onClick={onReimprimir} className="pdv-btn-ghost" style={{ color: "var(--pdv-accent)", borderColor: "rgba(52,211,153,.35)" }}>
                🖨️ Reimprimir cupom
              </button>
            )}
            <button onClick={onFechar} className="pdv-btn-ghost">Fechar <span className="pdv-kbd is-warn" style={{ marginLeft: 4 }}>Esc</span></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RefinalizarVendaModal({ venda, onFechar, onAplicar }) {
  const total = Number(venda.total);
  // Mesmo reducer do modal de nova venda — split de pagamentos.
  const [pagamentos, dispatchPagamentos] = useReducer(
    pagamentosReducer,
    [],
    () => [criarPagamento(venda.formaPagamento || "DINHEIRO", total)]
  );
  const [gerarConta, setGerarConta] = useState(false);
  const [vencimento, setVencimento] = useState(dataDaqui(30));
  const [parcelas, setParcelas] = useState<any>(1);
  const [descricaoConta, setDescricaoConta] = useState("");
  const [observacoesConta, setObservacoesConta] = useState("");
  const [salvando, setSalvando] = useState(false);

  const pago = useMemo(
    () => Math.round(pagamentos.reduce((a, p) => a + (Number(p.valor) || 0), 0) * 100) / 100,
    [pagamentos]
  );
  const restante = Math.max(0, Math.round((total - pago) * 100) / 100);
  const valorAPrazo = useMemo(
    () => Math.round(
      pagamentos.filter(p => FORMAS_GERA_RECEBER.has(p.forma))
        .reduce((a, p) => a + (Number(p.valor) || 0), 0) * 100
    ) / 100,
    [pagamentos]
  );
  const podeFinalizar = total > 0 && Math.abs(pago - total) < 0.01;

  useEffect(() => {
    if (valorAPrazo <= 0 && gerarConta) setGerarConta(false);
  }, [valorAPrazo, gerarConta]);

  useModalKeys(true, { onClose: onFechar });

  function adicionar(formaId) {
    if (restante <= 0) return;
    dispatchPagamentos({
      type: "add",
      pagamento: criarPagamento(formaId, restante),
    });
  }

  async function aplicar() {
    if (!podeFinalizar) return;
    setSalvando(true);
    const payload: any = {
      pagamentos: pagamentos.map(p => ({
        forma: p.forma,
        valor: Math.round((Number(p.valor) || 0) * 100) / 100,
        formaCustomNome: p.formaCustomNome || undefined,
      })),
    };
    if (valorAPrazo > 0 && gerarConta) {
      payload.gerarContaReceber = {
        vencimento,
        parcelas: Number(parcelas) || 1,
        descricao: descricaoConta || undefined,
        observacoes: observacoesConta || undefined,
      };
    }
    try {
      await onAplicar(payload);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={onFechar} className="pdv-modal-bg">
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" className="pdv-modal" style={{ width: "min(620px, calc(100vw - 32px))" }}>
        <div className="pdv-modal-hd">
          <div>
            <div className="pdv-modal-title">Refinalizar venda #{venda.numero}</div>
            <div className="pdv-modal-sub">
              Total {fmtBRL(venda.total)} · forma original: {FORMA_LABEL[venda.formaPagamento]}
            </div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="pdv-modal-x">×</button>
        </div>

        <div className="pdv-modal-body" style={{ paddingBottom: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ color: "var(--pdv-t3)", fontSize: 10.5, fontWeight: 500, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".06em" }}>
              Adicionar pagamento
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {FORMAS.map(f => {
                const desabilitado = restante <= 0;
                return (
                  <button
                    key={f.id} type="button"
                    onClick={() => adicionar(f.id)}
                    disabled={desabilitado}
                    className="pdv-btn-ghost"
                    style={{
                      padding: "10px 8px",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                      opacity: desabilitado ? 0.4 : 1,
                      cursor: desabilitado ? "not-allowed" : "pointer",
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{f.icone}</span>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{f.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {pagamentos.length > 0 && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 6,
              padding: 8, borderRadius: 8,
              background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
            }}>
              {pagamentos.map(p => {
                const corBorda = FORMA_COR_VAR[p.forma] || "var(--pdv-accent)";
                return (
                  <div key={p.id} style={{
                    display: "grid", gridTemplateColumns: "1fr 140px auto",
                    gap: 8, alignItems: "center", padding: "6px 8px",
                    background: "var(--pdv-surf-1)", borderRadius: 6,
                    borderLeft: `3px solid ${corBorda}`,
                  }}>
                    <span style={{ fontSize: 12, color: "var(--pdv-t1)", fontWeight: 500 }}>
                      {FORMA_LABEL[p.forma]}
                    </span>
                    <input
                      type="number" step="0.01" min="0"
                      value={p.valor}
                      onChange={e => {
                        const v = parseFloat(e.target.value.replace(",", ".")) || 0;
                        dispatchPagamentos({ type: "update", id: p.id, patch: { valor: v } });
                      }}
                      className="pdv-field-input"
                      style={{ padding: "6px 8px", fontSize: 13 }}
                    />
                    <button
                      type="button"
                      onClick={() => dispatchPagamentos({ type: "remove", id: p.id })}
                      style={{
                        background: "transparent", border: "none", color: "var(--pdv-t3)",
                        fontSize: 16, cursor: "pointer", padding: "0 4px", lineHeight: 1,
                      }}
                    >×</button>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
            padding: "8px 12px", borderRadius: 8,
            background: restante > 0 ? "rgba(245,158,11,.08)" : "rgba(34,197,94,.10)",
            border: `1px solid ${restante > 0 ? "rgba(245,158,11,.30)" : "rgba(34,197,94,.30)"}`,
            fontSize: 12,
          }}>
            <div><span style={{ color: "var(--pdv-t3)" }}>Total:</span> <span style={{ color: "var(--pdv-t1)", fontWeight: 600 }}>{fmtBRL(total)}</span></div>
            <div><span style={{ color: "var(--pdv-t3)" }}>Pago:</span> <span style={{ color: "var(--pdv-t1)", fontWeight: 600 }}>{fmtBRL(pago)}</span></div>
            {restante > 0 && (
              <div style={{ gridColumn: "1 / -1", color: "var(--pdv-c-amber)", fontWeight: 600 }}>
                Falta {fmtBRL(restante)}
              </div>
            )}
          </div>

          {valorAPrazo > 0 && (
            <div style={{
              background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
              borderRadius: 12, padding: 14,
            }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={gerarConta} onChange={e => setGerarConta(e.target.checked)} />
                <span style={{ color: "var(--pdv-t1)" }}>
                  Gerar conta a receber pelo valor a prazo · {fmtBRL(valorAPrazo)}
                </span>
              </label>
              {gerarConta && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                  <label style={{ fontSize: 11, color: "var(--pdv-t3)" }}>
                    Vencimento
                    <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} className="pdv-field-input" />
                  </label>
                  <label style={{ fontSize: 11, color: "var(--pdv-t3)" }}>
                    Parcelas
                    <input type="number" min="1" max="60" value={parcelas} onChange={e => setParcelas(e.target.value)} className="pdv-field-input" />
                  </label>
                  <label style={{ fontSize: 11, color: "var(--pdv-t3)", gridColumn: "1 / -1" }}>
                    Descrição (opcional)
                    <input type="text" value={descricaoConta} onChange={e => setDescricaoConta(e.target.value)} className="pdv-field-input" placeholder="Padrão: VENDA #N - CLIENTE" />
                  </label>
                  <label style={{ fontSize: 11, color: "var(--pdv-t3)", gridColumn: "1 / -1" }}>
                    Observações (opcional)
                    <input type="text" value={observacoesConta} onChange={e => setObservacoesConta(e.target.value)} className="pdv-field-input" />
                  </label>
                </div>
              )}
            </div>
          )}

          <div style={{
            background: "color-mix(in oklab, var(--pdv-c-amber, #f59e0b) 10%, transparent)",
            border: "1px solid rgba(245,158,11,.30)", borderRadius: 10,
            padding: "10px 14px", fontSize: 12, color: "var(--pdv-t2)",
          }}>
            ⚠ Ao confirmar, a venda volta para CONCLUIDA com o novo split e o caixa (se aberto) é re-lançado.
          </div>
        </div>

        <div className="pdv-modal-foot" style={{ justifyContent: "flex-end", gap: 10 }}>
          <button type="button" onClick={onFechar} disabled={salvando} className="pdv-btn-ghost">Cancelar <span className="pdv-kbd is-warn" style={{ marginLeft: 4 }}>Esc</span></button>
          <button
            type="button"
            onClick={aplicar}
            disabled={salvando || !podeFinalizar}
            className="pdv-btn-primary"
            style={{ padding: "10px 18px", opacity: (salvando || !podeFinalizar) ? 0.55 : 1 }}
          >
            {salvando ? "Aplicando…" : `Confirmar (${fmtBRL(total)})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function AutorizacaoGerencialModal({ venda, acao, onCancelar, onConfirmar }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const podeConfirmar = email.trim() && senha;

  async function submeter(e) {
    e.preventDefault();
    if (!podeConfirmar || enviando) return;
    setEnviando(true);
    try {
      await onConfirmar({ email: email.trim(), senha });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div onClick={onCancelar} className="pdv-modal-bg">
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" className="pdv-modal" style={{ width: "min(460px, calc(100vw - 32px))" }}>
        <div className="pdv-modal-hd">
          <div>
            <div className="pdv-modal-title">🔐 Autorização gerencial</div>
            <div className="pdv-modal-sub">
              Venda #{venda?.numero} · {acao}
            </div>
          </div>
          <button type="button" onClick={onCancelar} aria-label="Fechar" className="pdv-modal-x">×</button>
        </div>

        <form onSubmit={submeter}>
          <div className="pdv-modal-body" style={{ paddingBottom: 14 }}>
            <div style={{
              padding: "12px 14px", borderRadius: 10, marginBottom: 14,
              background: "color-mix(in oklab, var(--pdv-c-amber, #f59e0b) 12%, transparent)",
              border: "1px solid rgba(245,158,11,.30)",
              color: "var(--pdv-t2)", fontSize: 12.5, lineHeight: 1.45,
            }}>
              Esta operação requer aprovação de um <b>ADMIN ou GERENTE</b>.
              Peça para alguém autorizado digitar e-mail e senha abaixo.
            </div>

            <label className="pdv-field-label" style={{ display: "block", marginBottom: 4 }}>E-mail do autorizador</label>
            <input
              type="email" autoComplete="off" autoFocus
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="gerente@empresa.com"
              className="pdv-field-input"
              style={{ marginBottom: 12 }}
            />

            <label className="pdv-field-label" style={{ display: "block", marginBottom: 4 }}>Senha</label>
            <input
              type="password" autoComplete="new-password"
              value={senha} onChange={e => setSenha(e.target.value)}
              placeholder="••••••••"
              className="pdv-field-input"
            />
          </div>

          <div className="pdv-modal-foot" style={{ justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={onCancelar} disabled={enviando} className="pdv-btn-ghost">
              Cancelar <span className="pdv-kbd is-warn" style={{ marginLeft: 4 }}>Esc</span>
            </button>
            <button type="submit" disabled={!podeConfirmar || enviando} className="pdv-btn-primary" style={{ padding: "10px 18px" }}>
              {enviando ? "Validando…" : "Autorizar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal dedicado de correcao de itens de uma venda EM_EDICAO. Lista os itens
// com quantidade/preco editaveis, permite remover e adicionar produtos (busca),
// e mostra o total recalculado em tempo real (preservando desconto embutido,
// ex: fidelidade, igual ao backend). Ao salvar, devolve { itens, desconto } —
// o fluxo segue para o pagamento (refinalizar).
function EditarItensVendaModal({ venda, onFechar, onSalvar }) {
  const [linhas, setLinhas] = useState(() =>
    (venda.itens || []).map((it, i) => ({
      key: it.id || `orig-${i}`,
      produtoId: it.produtoId,
      nome: it.produto?.nome || "Produto",
      codigo: it.produto?.codigo || "",
      unidade: it.produto?.unidade || "",
      quantidade: Number(it.quantidade),
      precoUnitario: Number(it.precoUnitario),
    }))
  );
  const [desconto, setDesconto] = useState(Number(venda.desconto) || 0);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Desconto embutido (ex: fidelidade) que nao esta no campo desconto — o
  // backend preserva esse valor; espelhamos aqui para o total bater.
  const subtotalAntigo = (venda.itens || []).reduce((a, it) => a + Number(it.subtotal), 0);
  const descontoEmbutido = Math.max(
    0,
    Math.round((subtotalAntigo - Number(venda.desconto) - Number(venda.total)) * 100) / 100
  );

  const subtotal = useMemo(
    () => Math.round(linhas.reduce((a, l) => a + l.quantidade * l.precoUnitario, 0) * 100) / 100,
    [linhas]
  );
  const total = Math.max(0, Math.round((subtotal - (Number(desconto) || 0) - descontoEmbutido) * 100) / 100);
  const podeSalvar = linhas.length > 0
    && linhas.every(l => l.quantidade > 0 && l.precoUnitario >= 0)
    && (Number(desconto) || 0) >= 0;

  useModalKeys(true, { onClose: onFechar });

  // Busca de produtos (debounce simples) para adicionar itens.
  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) { setResultados([]); return; }
    let cancel = false;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const lista = await api.listarProdutos({ search: termo, ativo: "true" });
        if (!cancel) setResultados((lista as any[]).slice(0, 8));
      } catch {
        if (!cancel) setResultados([]);
      } finally {
        if (!cancel) setBuscando(false);
      }
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [busca]);

  function adicionarProduto(p) {
    setLinhas(prev => {
      // Se ja existe linha do mesmo produto, incrementa a quantidade.
      const idx = prev.findIndex(l => l.produtoId === p.id);
      if (idx >= 0) {
        const cp = [...prev];
        cp[idx] = { ...cp[idx], quantidade: Math.round((cp[idx].quantidade + 1) * 1000) / 1000 };
        return cp;
      }
      return [...prev, {
        key: `novo-${p.id}-${Date.now()}`,
        produtoId: p.id,
        nome: p.nome,
        codigo: p.codigo || "",
        unidade: p.unidade || "",
        quantidade: 1,
        precoUnitario: Number(p.precoVenda) || 0,
      }];
    });
    setBusca("");
    setResultados([]);
  }

  function patchLinha(key, patch) {
    setLinhas(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
  }
  function removerLinha(key) {
    setLinhas(prev => prev.filter(l => l.key !== key));
  }

  async function salvar() {
    if (!podeSalvar || salvando) return;
    setSalvando(true);
    try {
      await onSalvar({
        itens: linhas.map(l => ({
          produtoId: l.produtoId,
          quantidade: l.quantidade,
          precoUnitario: l.precoUnitario,
        })),
        desconto: Number(desconto) || 0,
      });
    } catch {
      // Erro ja exibido pelo fluxo; mantem o modal aberto para nova tentativa.
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={onFechar} className="pdv-modal-bg">
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" className="pdv-modal" style={{ width: "min(720px, calc(100vw - 32px))" }}>
        <div className="pdv-modal-hd">
          <div>
            <div className="pdv-modal-title">✏️ Corrigir itens · Venda #{venda.numero}</div>
            <div className="pdv-modal-sub">
              Ajuste quantidades, remova ou adicione itens. O estoque é reconciliado pela diferença.
            </div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="pdv-modal-x">×</button>
        </div>

        <div className="pdv-modal-body" style={{ paddingBottom: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Busca para adicionar produto */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="➕ Adicionar produto (nome ou código)…"
              className="pdv-field-input"
              autoFocus
            />
            {(resultados.length > 0 || buscando) && busca.trim().length >= 2 && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 5,
                background: "var(--pdv-surf-1)", border: "1px solid var(--pdv-line)",
                borderRadius: 10, overflow: "hidden", maxHeight: 260, overflowY: "auto",
                boxShadow: "0 8px 24px rgba(0,0,0,.18)",
              }}>
                {buscando && resultados.length === 0 ? (
                  <div style={{ padding: 12, fontSize: 12.5, color: "var(--pdv-t3)" }}>Buscando…</div>
                ) : resultados.map(p => (
                  <button
                    key={p.id} type="button"
                    onClick={() => adicionarProduto(p)}
                    style={{
                      display: "grid", gridTemplateColumns: "1fr auto", gap: 8, width: "100%",
                      padding: "9px 12px", background: "transparent", border: "none",
                      borderBottom: "1px solid var(--pdv-line)", cursor: "pointer", textAlign: "left",
                      alignItems: "center",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--pdv-surf-2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div>
                      <div style={{ color: "var(--pdv-t1)", fontSize: 13, fontWeight: 500 }}>{p.nome}</div>
                      <div style={{ color: "var(--pdv-t3)", fontSize: 11, fontFamily: "'Geist Mono', monospace" }}>{p.codigo}</div>
                    </div>
                    <div style={{ color: "var(--pdv-accent)", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(p.precoVenda)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lista de itens editaveis */}
          <div style={{
            background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
            borderRadius: 12, overflow: "hidden",
            display: "flex", flexDirection: "column", minHeight: 0,
          }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 96px 120px 110px 36px",
              padding: "10px 14px", background: "var(--pdv-bg-2)", borderBottom: "1px solid var(--pdv-line)",
              fontSize: 10.5, fontWeight: 500, color: "var(--pdv-t3)", textTransform: "uppercase", letterSpacing: ".06em",
              gap: 8, flexShrink: 0,
            }}>
              <div>Produto</div>
              <div style={{ textAlign: "right" }}>Qtd</div>
              <div style={{ textAlign: "right" }}>Preço unit.</div>
              <div style={{ textAlign: "right" }}>Subtotal</div>
              <div />
            </div>
            {/* Area rolavel propria da lista — evita que o scroll vaze para o fundo */}
            <div style={{ maxHeight: "42vh", overflowY: "auto", overscrollBehavior: "contain" }}>
              {linhas.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "var(--pdv-t3)", fontSize: 12.5 }}>
                  Nenhum item — adicione ao menos um produto acima.
                </div>
              ) : linhas.map(l => (
                <div key={l.key} style={{
                  display: "grid", gridTemplateColumns: "1fr 96px 120px 110px 36px",
                  padding: "8px 14px", borderBottom: "1px solid var(--pdv-line)",
                  alignItems: "center", fontSize: 13, gap: 8,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: "var(--pdv-t1)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.nome}</div>
                    <div style={{ color: "var(--pdv-t3)", fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>{l.codigo}{l.unidade ? ` · ${l.unidade}` : ""}</div>
                  </div>
                  <input
                    type="number" step="0.001" min="0"
                    aria-label={`Quantidade de ${l.nome}`}
                    value={l.quantidade}
                    onChange={e => patchLinha(l.key, { quantidade: Math.max(0, parseFloat(e.target.value.replace(",", ".")) || 0) })}
                    className="pdv-field-input"
                    style={{ padding: "6px 8px", fontSize: 13, textAlign: "right" }}
                  />
                  <input
                    type="number" step="0.01" min="0"
                    aria-label={`Preço unitário de ${l.nome}`}
                    value={l.precoUnitario}
                    onChange={e => patchLinha(l.key, { precoUnitario: Math.max(0, parseFloat(e.target.value.replace(",", ".")) || 0) })}
                    className="pdv-field-input"
                    style={{ padding: "6px 8px", fontSize: 13, textAlign: "right" }}
                  />
                  <div style={{ textAlign: "right", color: "var(--pdv-t1)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {fmtBRL(Math.round(l.quantidade * l.precoUnitario * 100) / 100)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removerLinha(l.key)}
                    title="Remover item"
                    style={{ background: "transparent", border: "none", color: "var(--pdv-c-rose)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}
                  >×</button>
                </div>
              ))}
            </div>
          </div>

          {/* Desconto + totais */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center",
            background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
            borderRadius: 12, padding: 14,
          }}>
            <label style={{ fontSize: 12, color: "var(--pdv-t3)" }}>
              Desconto (R$)
              <input
                type="number" step="0.01" min="0"
                value={desconto}
                onChange={e => setDesconto(Math.max(0, parseFloat(e.target.value.replace(",", ".")) || 0))}
                className="pdv-field-input"
                style={{ marginTop: 4 }}
              />
            </label>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "var(--pdv-t3)" }}>
                Subtotal {fmtBRL(subtotal)}
                {descontoEmbutido > 0 && <> · embutido −{fmtBRL(descontoEmbutido)}</>}
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, color: "var(--pdv-accent)", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", marginTop: 2 }}>
                {fmtBRL(total)}
              </div>
            </div>
          </div>

          <div style={{
            background: "color-mix(in oklab, var(--pdv-c-amber, #f59e0b) 10%, transparent)",
            border: "1px solid rgba(245,158,11,.30)", borderRadius: 10,
            padding: "10px 14px", fontSize: 12, color: "var(--pdv-t2)",
          }}>
            ⚠ Ao salvar, o estoque é ajustado pela diferença e em seguida você confirma a forma de pagamento do novo total.
          </div>
        </div>

        <div className="pdv-modal-foot" style={{ justifyContent: "flex-end", gap: 10 }}>
          <button type="button" onClick={onFechar} disabled={salvando} className="pdv-btn-ghost">
            Cancelar <span className="pdv-kbd is-warn" style={{ marginLeft: 4 }}>Esc</span>
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={!podeSalvar || salvando}
            className="pdv-btn-primary"
            style={{ padding: "10px 18px", opacity: (!podeSalvar || salvando) ? 0.55 : 1 }}
          >
            {salvando ? "Salvando…" : `Salvar e ir ao pagamento (${fmtBRL(total)})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// Fluxo auto-contido de correcao de itens de uma venda. Encapsula toda a
// maquina de estados: (autorizacao gerencial p/ VENDEDOR) -> reabrir -> editar
// itens -> refinalizar (pagamento do novo total). Reaproveitavel: tanto a aba
// Historico quanto o PDV ("Minhas vendas de hoje") apenas montam este fluxo.
//
//   venda       — venda alvo (CONCLUIDA ou EM_EDICAO), idealmente com detalhe
//   user        — operador logado (define se exige autorizacao gerencial)
//   onFechar()  — fecha o fluxo (venda reaberta fica EM_EDICAO, recuperavel)
//   onConcluido(msg) — chamado ao refinalizar com sucesso
export function CorrigirVendaFlow({ venda, user, onFechar, onConcluido }) {
  const exigeAutorizacao = user?.role === "VENDEDOR";
  const [etapa, setEtapa] = useState("iniciando"); // iniciando|autorizacao|reabrindo|editar|pagamento
  const [creds, setCreds] = useState<any>(null);
  const [vendaEdit, setVendaEdit] = useState<any>(venda.status === "EM_EDICAO" ? venda : null);

  useModalKeys(etapa === "autorizacao" || etapa === "reabrindo", { onClose: onFechar });

  async function reabrir(autorizacao) {
    setEtapa("reabrindo");
    try {
      const reaberta = await api.reabrirVenda(venda.id, autorizacao || null);
      setCreds(autorizacao || null);
      setVendaEdit(reaberta);
      setEtapa("editar");
    } catch (err) {
      const msg = (err as Error).message;
      if (exigeAutorizacao) {
        alert(msg);
        setEtapa("autorizacao"); // senha errada: tenta de novo sem perder contexto
      } else {
        alert(msg);
        onFechar();
      }
    }
  }

  // Ponto de partida. Roda uma vez.
  useEffect(() => {
    let cancel = false;
    async function iniciar() {
      if (venda.status === "EM_EDICAO") {
        // Ja reaberta: carrega o detalhe completo e vai direto editar.
        try {
          const v = await api.obterVenda(venda.id);
          if (!cancel) { setVendaEdit(v); setEtapa("editar"); }
        } catch (err) {
          if (!cancel) { alert((err as Error).message); onFechar(); }
        }
        return;
      }
      if (exigeAutorizacao) { setEtapa("autorizacao"); return; }
      await reabrir(null); // ADMIN/GERENTE: reabre direto
    }
    iniciar();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmarAutorizacao(c) {
    const autorizacao = { emailAutorizacao: c.email, senhaAutorizacao: c.senha };
    await reabrir(autorizacao);
  }

  async function salvarItens(payload) {
    const corpo = creds ? { ...payload, ...creds } : payload;
    try {
      const atualizada = await api.editarItensVenda(vendaEdit.id, corpo);
      setVendaEdit(atualizada);
      setEtapa("pagamento");
    } catch (err) {
      alert((err as Error).message);
      throw err; // mantem o modal de edicao aberto
    }
  }

  async function aplicarPagamento(payload) {
    const corpo = creds ? { ...payload, ...creds } : payload;
    try {
      await api.refinalizarVenda(vendaEdit.id, corpo);
      onConcluido?.(`Venda #${vendaEdit.numero} corrigida e refinalizada.`);
    } catch (err) {
      alert((err as Error).message);
      throw err;
    }
  }

  if (etapa === "autorizacao") {
    return (
      <AutorizacaoGerencialModal
        venda={venda}
        acao="corrigir os itens desta venda"
        onCancelar={onFechar}
        onConfirmar={confirmarAutorizacao}
      />
    );
  }
  if (etapa === "iniciando" || etapa === "reabrindo") {
    return (
      <div onClick={onFechar} className="pdv-modal-bg">
        <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" className="pdv-modal" style={{ width: "min(360px, calc(100vw - 32px))" }}>
          <div className="pdv-modal-body" style={{ padding: 28, textAlign: "center", color: "var(--pdv-t2)", fontSize: 14 }}>
            {etapa === "reabrindo" ? "Reabrindo venda…" : "Preparando…"}
          </div>
        </div>
      </div>
    );
  }
  if (etapa === "editar" && vendaEdit) {
    return (
      <EditarItensVendaModal
        venda={vendaEdit}
        onFechar={onFechar}
        onSalvar={salvarItens}
      />
    );
  }
  if (etapa === "pagamento" && vendaEdit) {
    return (
      <RefinalizarVendaModal
        venda={vendaEdit}
        onFechar={onFechar}
        onAplicar={aplicarPagamento}
      />
    );
  }
  return null;
}

function Bloco({ titulo, children }) {
  return (
    <div style={{
      background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
      borderRadius: 12, padding: 12,
    }}>
      <div style={{
        color: "var(--pdv-t3)", fontSize: 10.5, fontWeight: 500, marginBottom: 6,
        textTransform: "uppercase", letterSpacing: ".06em",
      }}>{titulo}</div>
      {children}
    </div>
  );
}
