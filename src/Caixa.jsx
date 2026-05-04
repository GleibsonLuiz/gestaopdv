import { useEffect, useMemo, useState, useCallback } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";

const fmtBRL = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const fmtDataCurta = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
};

const TIPO_INFO = {
  ABERTURA:      { label: "Abertura",       icone: "🟢", cor: "accent" },
  VENDA:         { label: "Venda",          icone: "🛒", cor: "green",  sinal: "+" },
  SUPRIMENTO:    { label: "Suprimento",     icone: "💵", cor: "green",  sinal: "+" },
  RECEBER_CONTA: { label: "Recebimento",    icone: "📥", cor: "green",  sinal: "+" },
  SANGRIA:       { label: "Sangria",        icone: "✂",  cor: "yellow", sinal: "−" },
  PAGAR_CONTA:   { label: "Pagamento",      icone: "📤", cor: "red",    sinal: "−" },
  FECHAMENTO:    { label: "Fechamento",     icone: "🔒", cor: "purple" },
};

const FORMA_LABEL = {
  DINHEIRO: "Dinheiro",
  CARTAO_CREDITO: "Crédito",
  CARTAO_DEBITO: "Débito",
  PIX: "PIX",
  BOLETO: "Boleto",
  CREDIARIO: "Crediário",
};

export default function Caixa({ user }) {
  const [aba, setAba] = useState("atual");
  const [caixaAtual, setCaixaAtual] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.obterCaixaAtual();
      setCaixaAtual(data.caixa);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  function flash(t) {
    setMensagem(t);
    setTimeout(() => setMensagem(""), 2500);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <BotaoAba ativo={aba === "atual"} onClick={() => setAba("atual")}>
          💵 Meu caixa
        </BotaoAba>
        <BotaoAba ativo={aba === "extrato"} onClick={() => setAba("extrato")} disabled={!caixaAtual}>
          📋 Extrato {caixaAtual ? `#${caixaAtual.numero}` : ""}
        </BotaoAba>
        <BotaoAba ativo={aba === "historico"} onClick={() => setAba("historico")}>
          📅 Histórico
        </BotaoAba>
      </div>

      {mensagem && <div style={alertStyle(C.green)}>{mensagem}</div>}
      {erro && <div style={alertStyle(C.red)}>{erro}</div>}

      {aba === "atual" && (
        <AbaAtual
          user={user}
          caixa={caixaAtual}
          carregando={carregando}
          onMudar={(msg) => { flash(msg); recarregar(); }}
          onErro={setErro}
        />
      )}
      {aba === "extrato" && caixaAtual && (
        <AbaExtrato caixaId={caixaAtual.id} />
      )}
      {aba === "historico" && (
        <AbaHistorico user={user} onAbrirExtrato={() => setAba("extrato")} />
      )}
    </div>
  );
}

// ==================== ABA: MEU CAIXA ====================

function AbaAtual({ user, caixa, carregando, onMudar, onErro }) {
  const [modal, setModal] = useState(null); // 'abrir' | 'fechar' | 'sangria' | 'suprimento'

  if (carregando) {
    return <div style={vazioStyle}>Carregando…</div>;
  }

  if (!caixa) {
    return (
      <>
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 40, textAlign: "center",
        }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🔒</div>
          <div style={{ color: C.white, fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
            Nenhum caixa aberto
          </div>
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 20, maxWidth: 460, margin: "0 auto 20px" }}>
            Você precisa abrir um caixa antes de registrar vendas. O sistema vai
            sugerir o saldo do troco que ficou do último fechamento.
          </div>
          <button onClick={() => setModal("abrir")} style={btnPrimario}>
            🟢 Abrir Caixa
          </button>
        </div>
        {modal === "abrir" && (
          <ModalAbrir
            onCancelar={() => setModal(null)}
            onSucesso={() => { setModal(null); onMudar("Caixa aberto"); }}
          />
        )}
      </>
    );
  }

  const t = caixa.totais || {};
  const aberto = caixa.status === "ABERTO";

  return (
    <>
      {/* Cabeçalho */}
      <div style={{
        background: `linear-gradient(135deg, ${C.accent}22, ${C.purple}22)`,
        border: `1px solid ${C.accent}55`, borderRadius: 14, padding: 20,
        marginBottom: 16, display: "flex", justifyContent: "space-between",
        alignItems: "center", flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{
              fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 6,
              background: aberto ? C.green + "33" : C.muted + "33",
              color: aberto ? C.green : C.muted,
              border: `1px solid ${aberto ? C.green : C.muted}55`,
              letterSpacing: 0.5,
            }}>{aberto ? "🟢 ABERTO" : "🔒 FECHADO"}</span>
            <span style={{ color: C.white, fontWeight: 800, fontSize: 18 }}>
              Caixa #{caixa.numero}
            </span>
          </div>
          <div style={{ color: C.muted, fontSize: 12 }}>
            Aberto em <b style={{ color: C.text }}>{fmtData(caixa.abertoEm)}</b>
            {" · operador "}<b style={{ color: C.text }}>{caixa.user?.nome || user.nome}</b>
          </div>
        </div>
        {aberto && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setModal("suprimento")} style={btnSecundario(C.green)}>
              ＋ Suprimento
            </button>
            <button onClick={() => setModal("sangria")} style={btnSecundario(C.yellow)}>
              ✂ Sangria
            </button>
            <button onClick={() => setModal("fechar")} style={btnPrimarioVermelho}>
              🔒 Fechar Caixa
            </button>
          </div>
        )}
      </div>

      {/* KPIs em grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12, marginBottom: 16,
      }}>
        <CardKpi titulo="Saldo Inicial" valor={fmtBRL(t.saldoInicial)} icone="🏁" cor={C.muted} />
        <CardKpi titulo="Entradas (dinheiro)" valor={fmtBRL(t.entradasDinheiro)} icone="📥" cor={C.green} />
        <CardKpi titulo="Saídas (dinheiro)" valor={fmtBRL(t.saidasDinheiro)} icone="📤" cor={C.red} />
        <CardKpi
          titulo="Saldo esperado"
          valor={fmtBRL(t.saldoEsperadoDinheiro)}
          icone="💵"
          cor={C.accent}
          destaque
        />
      </div>

      {/* Detalhamento por forma de pagamento */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 16,
      }}>
        <div style={{ color: C.white, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
          Movimentação por forma de pagamento
        </div>
        {t.porFormaPagamento && Object.keys(t.porFormaPagamento).length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            {Object.entries(t.porFormaPagamento).map(([forma, val]) => (
              <div key={forma} style={{
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                padding: "10px 12px",
              }}>
                <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>
                  {(FORMA_LABEL[forma] || forma).toUpperCase()}
                </div>
                <div style={{ color: C.white, fontWeight: 700, fontSize: 15, marginTop: 4 }}>
                  {fmtBRL(val)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: C.muted, fontSize: 13, fontStyle: "italic" }}>
            Nenhuma movimentação ainda.
          </div>
        )}
      </div>

      {/* Resumo de vendas */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16,
        display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 16,
      }}>
        <Mini titulo="Vendas registradas" valor={caixa._count?.vendas ?? 0} cor={C.green} />
        <Mini titulo="Movimentações" valor={caixa._count?.movimentacoes ?? 0} cor={C.accent} />
        <Mini titulo="Tempo aberto" valor={tempoAberto(caixa.abertoEm)} cor={C.muted} />
      </div>

      {modal === "abrir" && (
        <ModalAbrir
          onCancelar={() => setModal(null)}
          onSucesso={() => { setModal(null); onMudar("Caixa aberto"); }}
        />
      )}
      {modal === "fechar" && (
        <ModalFechar
          caixa={caixa}
          onCancelar={() => setModal(null)}
          onSucesso={(diferenca) => {
            setModal(null);
            onMudar(diferenca === 0 ? "Caixa fechado sem diferença"
              : diferenca > 0 ? `Caixa fechado — sobra de ${fmtBRL(diferenca)}`
              : `Caixa fechado — quebra de ${fmtBRL(Math.abs(diferenca))}`);
          }}
        />
      )}
      {modal === "sangria" && (
        <ModalManual
          caixa={caixa}
          tipo="sangria"
          onCancelar={() => setModal(null)}
          onSucesso={() => { setModal(null); onMudar("Sangria registrada"); }}
        />
      )}
      {modal === "suprimento" && (
        <ModalManual
          caixa={caixa}
          tipo="suprimento"
          onCancelar={() => setModal(null)}
          onSucesso={() => { setModal(null); onMudar("Suprimento registrado"); }}
        />
      )}
    </>
  );
}

function tempoAberto(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

// ==================== ABA: EXTRATO ====================

function AbaExtrato({ caixaId }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await api.obterExtratoCaixa(caixaId);
      setDados(r);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [caixaId]);

  useEffect(() => { carregar(); }, [carregar]);

  if (carregando) return <div style={vazioStyle}>Carregando extrato…</div>;
  if (erro) return <div style={alertStyle(C.red)}>{erro}</div>;
  if (!dados) return null;

  const { caixa, movimentacoes, totais } = dados;

  return (
    <div>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: 14, marginBottom: 12, display: "flex", justifyContent: "space-between",
        alignItems: "center", flexWrap: "wrap", gap: 10,
      }}>
        <div>
          <div style={{ color: C.white, fontWeight: 700 }}>
            Extrato — Caixa #{caixa.numero}
          </div>
          <div style={{ color: C.muted, fontSize: 12 }}>
            Aberto em {fmtData(caixa.abertoEm)}
            {caixa.fechadoEm ? ` · Fechado em ${fmtData(caixa.fechadoEm)}` : " · em andamento"}
          </div>
        </div>
        <button onClick={carregar} style={{
          background: C.surface, border: `1px solid ${C.border}`, color: C.text,
          borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600,
        }}>↻ Atualizar</button>
      </div>

      {/* Tabela de movimentações */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "140px 130px 1fr 110px 130px 130px",
          padding: "12px 16px", background: C.surface,
          borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700,
          color: C.muted, textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          <div>Quando</div>
          <div>Tipo</div>
          <div>Descrição</div>
          <div style={{ textAlign: "right" }}>Valor</div>
          <div>Forma</div>
          <div style={{ textAlign: "right" }}>Saldo (após)</div>
        </div>

        {movimentacoes.length === 0 ? (
          <div style={vazioStyle}>Nenhuma movimentação ainda.</div>
        ) : movimentacoes.map(m => {
          const info = TIPO_INFO[m.tipo] || { label: m.tipo, cor: "muted" };
          const cor = C[info.cor] || C.muted;
          return (
            <div key={m.id} style={{
              display: "grid", gridTemplateColumns: "140px 130px 1fr 110px 130px 130px",
              padding: "10px 16px", borderBottom: `1px solid ${C.border}`,
              alignItems: "center", fontSize: 13,
            }}>
              <div style={{ color: C.muted, fontSize: 12 }}>{fmtData(m.createdAt)}</div>
              <div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                  background: cor + "22", color: cor, border: `1px solid ${cor}55`,
                }}>{info.icone} {info.label}</span>
              </div>
              <div style={{ color: C.text, fontSize: 12 }}>
                {m.descricao}
                {m.venda && (
                  <span style={{ color: C.muted, marginLeft: 6 }}>
                    · venda #{m.venda.numero}
                  </span>
                )}
              </div>
              <div style={{ textAlign: "right", color: cor, fontWeight: 700, fontSize: 13 }}>
                {info.sinal || ""}{fmtBRL(m.valor)}
              </div>
              <div style={{ color: C.muted, fontSize: 11 }}>
                {FORMA_LABEL[m.formaPagamento] || m.formaPagamento}
              </div>
              <div style={{ textAlign: "right", color: C.white, fontWeight: 600, fontFamily: "monospace", fontSize: 12 }}>
                {fmtBRL(m.saldoDepois)}
              </div>
            </div>
          );
        })}

        {/* Rodapé com totais */}
        <div style={{
          background: C.surface, padding: "16px 18px",
          borderTop: `2px solid ${C.accent}55`,
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12,
        }}>
          <RodapeBloco titulo="Saldo Anterior" valor={fmtBRL(totais.saldoInicial)} cor={C.muted} />
          <RodapeBloco titulo="Total Entradas" valor={fmtBRL(totais.totalEntradas)} cor={C.green} />
          <RodapeBloco titulo="Total Saídas" valor={fmtBRL(totais.totalSaidas)} cor={C.red} />
          <RodapeBloco
            titulo={caixa.status === "FECHADO" ? "Saldo Esperado" : "Saldo Atual"}
            valor={fmtBRL(totais.saldoEsperadoDinheiro)}
            cor={C.accent}
            destaque
          />
        </div>

        {/* Bloco extra para caixa fechado: contado vs esperado */}
        {caixa.status === "FECHADO" && (
          <div style={{
            background: C.bg, padding: "16px 18px", borderTop: `1px solid ${C.border}`,
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12,
          }}>
            <RodapeBloco titulo="Saldo Contado" valor={fmtBRL(caixa.saldoFinalContado)} cor={C.text} />
            <RodapeBloco titulo="Troco do próximo dia" valor={fmtBRL(caixa.trocoProximoDia)} cor={C.purple} />
            <RodapeBloco
              titulo={Number(caixa.diferenca) === 0 ? "Diferença" : Number(caixa.diferenca) > 0 ? "Sobra" : "Quebra"}
              valor={fmtBRL(Math.abs(Number(caixa.diferenca || 0)))}
              cor={Number(caixa.diferenca) === 0 ? C.green : Number(caixa.diferenca) > 0 ? C.yellow : C.red}
              destaque
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== ABA: HISTÓRICO ====================

function AbaHistorico() {
  const [caixas, setCaixas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [filtros, setFiltros] = useState({ status: "", dataInicio: "", dataFim: "" });
  const [extratoId, setExtratoId] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api.listarCaixas(filtros);
      setCaixas(r);
    } catch {
      setCaixas([]);
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => {
    const t = setTimeout(carregar, 200);
    return () => clearTimeout(t);
  }, [carregar]);

  if (extratoId) {
    return (
      <div>
        <button onClick={() => setExtratoId(null)} style={{
          background: C.surface, border: `1px solid ${C.border}`, color: C.text,
          borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer",
          fontWeight: 600, marginBottom: 12,
        }}>← Voltar para histórico</button>
        <AbaExtrato caixaId={extratoId} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filtros.status} onChange={e => setFiltros(f => ({ ...f, status: e.target.value }))} style={selectStyle}>
          <option value="">Todos os status</option>
          <option value="ABERTO">Apenas abertos</option>
          <option value="FECHADO">Apenas fechados</option>
        </select>
        <input type="date" value={filtros.dataInicio}
          onChange={e => setFiltros(f => ({ ...f, dataInicio: e.target.value }))}
          style={{ ...selectStyle, color: C.text }} />
        <input type="date" value={filtros.dataFim}
          onChange={e => setFiltros(f => ({ ...f, dataFim: e.target.value }))}
          style={{ ...selectStyle, color: C.text }} />
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "70px 1fr 130px 130px 130px 130px 100px",
          padding: "12px 16px", background: C.surface,
          borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700,
          color: C.muted, textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          <div>#</div>
          <div>Operador</div>
          <div>Aberto em</div>
          <div>Fechado em</div>
          <div style={{ textAlign: "right" }}>Saldo Final</div>
          <div style={{ textAlign: "right" }}>Diferença</div>
          <div>Status</div>
        </div>

        {carregando ? (
          <div style={vazioStyle}>Carregando…</div>
        ) : caixas.length === 0 ? (
          <div style={vazioStyle}>Nenhum caixa encontrado.</div>
        ) : caixas.map(c => {
          const dif = Number(c.diferenca || 0);
          const corDif = dif === 0 ? C.muted : dif > 0 ? C.yellow : C.red;
          return (
            <div key={c.id}
              onClick={() => setExtratoId(c.id)}
              style={{
                display: "grid", gridTemplateColumns: "70px 1fr 130px 130px 130px 130px 100px",
                padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
                alignItems: "center", fontSize: 13, cursor: "pointer",
              }}>
              <div style={{ color: C.accent, fontFamily: "monospace", fontWeight: 700 }}>#{c.numero}</div>
              <div style={{ color: C.text }}>{c.user?.nome || "—"}</div>
              <div style={{ color: C.muted, fontSize: 12 }}>{fmtDataCurta(c.abertoEm)}</div>
              <div style={{ color: C.muted, fontSize: 12 }}>{c.fechadoEm ? fmtDataCurta(c.fechadoEm) : "—"}</div>
              <div style={{ textAlign: "right", color: C.text, fontFamily: "monospace", fontSize: 12 }}>
                {c.saldoFinalContado != null ? fmtBRL(c.saldoFinalContado) : "—"}
              </div>
              <div style={{ textAlign: "right", color: corDif, fontFamily: "monospace", fontWeight: 700, fontSize: 12 }}>
                {c.diferenca != null ? (dif > 0 ? "+" : "") + fmtBRL(dif) : "—"}
              </div>
              <div>
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 6,
                  background: c.status === "ABERTO" ? C.green + "22" : C.muted + "22",
                  color: c.status === "ABERTO" ? C.green : C.muted,
                  border: `1px solid ${c.status === "ABERTO" ? C.green + "55" : C.border}`,
                  letterSpacing: 0.4,
                }}>{c.status}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== MODAIS ====================

function ModalAbrir({ onCancelar, onSucesso }) {
  const [saldoInicial, setSaldoInicial] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [sugestao, setSugestao] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.sugerirTrocoCaixa().then(r => {
      setSugestao(r);
      setSaldoInicial(String(r.sugestao || 0));
    }).catch(() => setSaldoInicial("0"));
  }, []);

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    const valor = Number(String(saldoInicial).replace(",", "."));
    if (!Number.isFinite(valor) || valor < 0) { setErro("Saldo inicial inválido"); return; }
    setSalvando(true);
    try {
      await api.abrirCaixa({ saldoInicial: valor, observacoesAbertura: observacoes });
      onSucesso();
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <ModalShell titulo="🟢 Abrir Caixa" onFechar={salvando ? undefined : onCancelar}>
      <form onSubmit={salvar}>
        {sugestao?.origem && (
          <div style={dicaStyle}>
            💡 Sugestão de troco baseada no fechamento do caixa <b>#{sugestao.origem.caixaNumero}</b>
            {" em "}<b>{fmtData(sugestao.origem.fechadoEm)}</b>: <b style={{ color: C.green }}>{fmtBRL(sugestao.sugestao)}</b>
          </div>
        )}
        {sugestao && !sugestao.origem && (
          <div style={dicaStyle}>
            💡 Este é o seu primeiro caixa — comece informando o valor do troco que tem em dinheiro.
          </div>
        )}
        <Campo label="Saldo Inicial (R$) *">
          <input
            type="number" step="0.01" min="0" autoFocus
            value={saldoInicial} onChange={e => setSaldoInicial(e.target.value)}
            style={inputStyle}
          />
        </Campo>
        <Campo label="Observações">
          <input value={observacoes} onChange={e => setObservacoes(e.target.value)}
            placeholder="Opcional" style={inputStyle} />
        </Campo>
        {erro && <div style={erroStyle}>{erro}</div>}
        <RodapeModal>
          <button type="button" onClick={onCancelar} disabled={salvando} style={btnCancelar}>Cancelar</button>
          <button type="submit" disabled={salvando} style={btnPrimario}>
            {salvando ? "Abrindo…" : "Abrir caixa"}
          </button>
        </RodapeModal>
      </form>
    </ModalShell>
  );
}

function ModalFechar({ caixa, onCancelar, onSucesso }) {
  const [saldoContado, setSaldoContado] = useState("");
  const [trocoProximo, setTrocoProximo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [revelado, setRevelado] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    const contado = Number(String(saldoContado).replace(",", "."));
    const troco = Number(String(trocoProximo || 0).replace(",", "."));
    if (!Number.isFinite(contado) || contado < 0) { setErro("Saldo contado inválido"); return; }
    if (!Number.isFinite(troco) || troco < 0) { setErro("Troco inválido"); return; }
    if (troco > contado) { setErro("O troco não pode ser maior que o saldo contado"); return; }

    setSalvando(true);
    try {
      const r = await api.fecharCaixa(caixa.id, {
        saldoFinalContado: contado,
        trocoProximoDia: troco,
        observacoesFechamento: observacoes,
      });
      setRevelado({
        contado, troco,
        esperado: Number(r.saldoFinalEsperado),
        diferenca: Number(r.diferenca),
      });
    } catch (err) {
      setErro(err.message);
      setSalvando(false);
    }
  }

  // Confirmação cega — só revela esperado/diferença depois do POST.
  if (revelado) {
    const dif = revelado.diferenca;
    return (
      <ModalShell titulo="🔒 Caixa Fechado" onFechar={() => onSucesso(dif)}>
        <div style={{ textAlign: "center", padding: "10px 0 20px" }}>
          <div style={{ fontSize: 48 }}>
            {dif === 0 ? "✅" : dif > 0 ? "📈" : "⚠️"}
          </div>
          <div style={{ color: C.white, fontWeight: 700, fontSize: 20, marginTop: 6 }}>
            {dif === 0 ? "Conferência exata!"
              : dif > 0 ? `Sobra de ${fmtBRL(dif)}`
              : `Quebra de ${fmtBRL(Math.abs(dif))}`}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <KpiBox titulo="Esperado pelo sistema" valor={fmtBRL(revelado.esperado)} cor={C.accent} />
          <KpiBox titulo="Contado por você" valor={fmtBRL(revelado.contado)} cor={C.text} />
          <KpiBox titulo="Troco para amanhã" valor={fmtBRL(revelado.troco)} cor={C.purple} />
          <KpiBox titulo="Diferença"
            valor={(dif > 0 ? "+" : "") + fmtBRL(dif)}
            cor={dif === 0 ? C.green : dif > 0 ? C.yellow : C.red} />
        </div>
        <RodapeModal>
          <button onClick={() => onSucesso(dif)} style={btnPrimario}>Concluir</button>
        </RodapeModal>
      </ModalShell>
    );
  }

  return (
    <ModalShell titulo="🔒 Fechar Caixa" onFechar={salvando ? undefined : onCancelar}>
      <form onSubmit={salvar}>
        <div style={{ ...dicaStyle, background: C.yellow + "22", borderColor: C.yellow + "55", color: C.yellow }}>
          🔍 <b>Conferência cega:</b> conte o dinheiro fisicamente no caixa e digite o valor.
          O sistema só revela o saldo esperado depois — assim você confirma sem viés.
        </div>
        <Campo label="Saldo contado em dinheiro (R$) *">
          <input
            type="number" step="0.01" min="0" autoFocus
            value={saldoContado} onChange={e => setSaldoContado(e.target.value)}
            placeholder="0,00"
            style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }}
          />
        </Campo>
        <Campo label="Troco para o próximo dia (R$)">
          <input
            type="number" step="0.01" min="0"
            value={trocoProximo} onChange={e => setTrocoProximo(e.target.value)}
            placeholder="Quanto fica para abrir o próximo caixa"
            style={inputStyle}
          />
        </Campo>
        <Campo label="Observações">
          <input value={observacoes} onChange={e => setObservacoes(e.target.value)}
            placeholder="Opcional" style={inputStyle} />
        </Campo>
        {erro && <div style={erroStyle}>{erro}</div>}
        <RodapeModal>
          <button type="button" onClick={onCancelar} disabled={salvando} style={btnCancelar}>Cancelar</button>
          <button type="submit" disabled={salvando} style={btnPrimarioVermelho}>
            {salvando ? "Fechando…" : "Fechar caixa"}
          </button>
        </RodapeModal>
      </form>
    </ModalShell>
  );
}

function ModalManual({ caixa, tipo, onCancelar, onSucesso }) {
  const ehSangria = tipo === "sangria";
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    const v = Number(String(valor).replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) { setErro("Valor inválido"); return; }
    setSalvando(true);
    try {
      const fn = ehSangria ? api.sangriaCaixa : api.suprimentoCaixa;
      await fn(caixa.id, { valor: v, descricao });
      onSucesso();
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <ModalShell
      titulo={ehSangria ? "✂ Sangria (saída de dinheiro)" : "＋ Suprimento (entrada de dinheiro)"}
      onFechar={salvando ? undefined : onCancelar}
    >
      <form onSubmit={salvar}>
        <div style={dicaStyle}>
          {ehSangria
            ? "Use para retirar dinheiro do caixa (ex: levar ao banco, despesa do dia)."
            : "Use para adicionar dinheiro ao caixa (ex: trocar notas, repor troco)."}
        </div>
        <Campo label="Valor (R$) *">
          <input
            type="number" step="0.01" min="0.01" autoFocus
            value={valor} onChange={e => setValor(e.target.value)}
            style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }}
          />
        </Campo>
        <Campo label="Descrição / motivo">
          <input value={descricao} onChange={e => setDescricao(e.target.value)}
            placeholder={ehSangria ? "Ex: depósito banco, vale funcionário" : "Ex: troca de cédula"}
            style={inputStyle} />
        </Campo>
        {erro && <div style={erroStyle}>{erro}</div>}
        <RodapeModal>
          <button type="button" onClick={onCancelar} disabled={salvando} style={btnCancelar}>Cancelar</button>
          <button type="submit" disabled={salvando}
            style={ehSangria ? btnSecundario(C.yellow) : btnSecundario(C.green)}>
            {salvando ? "Salvando…" : "Confirmar"}
          </button>
        </RodapeModal>
      </form>
    </ModalShell>
  );
}

// ==================== HELPERS UI ====================

function BotaoAba({ ativo, onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: ativo ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : C.surface,
      color: ativo ? C.white : disabled ? C.muted : C.text,
      border: `1px solid ${ativo ? C.accent : C.border}`,
      borderRadius: 8, padding: "10px 18px",
      fontWeight: 700, fontSize: 13,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  );
}

function CardKpi({ titulo, valor, icone, cor, destaque }) {
  return (
    <div style={{
      background: destaque ? `linear-gradient(135deg, ${cor}33, ${cor}11)` : C.card,
      border: `1px solid ${destaque ? cor + "88" : C.border}`,
      borderRadius: 12, padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 14 }}>{icone}</span> {titulo.toUpperCase()}
      </div>
      <div style={{ color: cor, fontWeight: 800, fontSize: destaque ? 22 : 18, fontFamily: "monospace" }}>
        {valor}
      </div>
    </div>
  );
}

function Mini({ titulo, valor, cor }) {
  return (
    <div style={{ textAlign: "center", minWidth: 120 }}>
      <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>
        {titulo.toUpperCase()}
      </div>
      <div style={{ color: cor, fontWeight: 800, fontSize: 18, marginTop: 4 }}>{valor}</div>
    </div>
  );
}

function RodapeBloco({ titulo, valor, cor, destaque }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>
        {titulo.toUpperCase()}
      </div>
      <div style={{
        color: cor, fontWeight: 800,
        fontSize: destaque ? 22 : 16, fontFamily: "monospace", marginTop: 4,
      }}>{valor}</div>
    </div>
  );
}

function KpiBox({ titulo, valor, cor }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${cor}55`, borderRadius: 10,
      padding: "12px 14px",
    }}>
      <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>
        {titulo.toUpperCase()}
      </div>
      <div style={{ color: cor, fontWeight: 800, fontSize: 18, marginTop: 4, fontFamily: "monospace" }}>
        {valor}
      </div>
    </div>
  );
}

function ModalShell({ titulo, children, onFechar }) {
  return (
    <div onClick={onFechar} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", padding: 22,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ color: C.white, fontWeight: 800, fontSize: 18 }}>{titulo}</div>
          {onFechar && (
            <button type="button" onClick={onFechar} style={{
              background: "transparent", border: "none", color: C.muted, fontSize: 22, cursor: "pointer",
            }}>×</button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", color: C.muted, fontSize: 12, marginBottom: 6, fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function RodapeModal({ children }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 13,
  outline: "none", boxSizing: "border-box",
};

const selectStyle = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: "10px 12px", color: C.text, fontSize: 13, cursor: "pointer",
};

const btnPrimario = {
  background: `linear-gradient(135deg, ${C.green}, #15803d)`,
  color: C.white, border: "none", borderRadius: 8,
  padding: "11px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer",
  boxShadow: `0 2px 10px ${C.green}55`,
};

const btnPrimarioVermelho = {
  background: `linear-gradient(135deg, ${C.red}, #991b1b)`,
  color: C.white, border: "none", borderRadius: 8,
  padding: "11px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer",
};

const btnCancelar = {
  background: C.surface, border: `1px solid ${C.border}`, color: C.text,
  borderRadius: 8, padding: "10px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer",
};

function btnSecundario(cor) {
  return {
    background: cor + "22", border: `1px solid ${cor}66`, color: cor,
    borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer",
  };
}

function alertStyle(cor) {
  return {
    marginBottom: 12, padding: "10px 14px", borderRadius: 8,
    background: cor + "22", border: `1px solid ${cor}55`, color: cor, fontSize: 13,
  };
}

const dicaStyle = {
  marginBottom: 14, padding: "10px 14px", borderRadius: 8,
  background: C.accent + "22", border: `1px solid ${C.accent}55`,
  color: C.text, fontSize: 12, lineHeight: 1.5,
};

const erroStyle = {
  marginTop: 10, padding: "10px 12px", borderRadius: 8,
  background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
};

const vazioStyle = {
  padding: 30, textAlign: "center", color: C.muted, fontSize: 13,
};
