import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./lib/api.js";

const C = {
  bg: "#0f1117", surface: "#1a1d27", card: "#21253a",
  border: "#2e3354", accent: "#4f8ef7", purple: "#7c3aed",
  green: "#22c55e", red: "#ef4444", yellow: "#f59e0b",
  text: "#e2e8f0", muted: "#64748b", white: "#ffffff",
};

const fmtBRL = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
};

const STATUS_INFO = {
  PENDENTE: { label: "Pendente", cor: C.yellow },
  PAGA: { label: "Paga", cor: C.green },
  ATRASADA: { label: "Atrasada", cor: C.red },
  CANCELADA: { label: "Cancelada", cor: C.muted },
};

function diasDiff(iso) {
  if (!iso) return 0;
  const venc = new Date(iso);
  venc.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((venc - hoje) / 86400000);
}

function statusEfetivo(conta) {
  if (conta.status === "PAGA" || conta.status === "CANCELADA") return conta.status;
  return diasDiff(conta.vencimento) < 0 ? "ATRASADA" : "PENDENTE";
}

export default function Financeiro({ user }) {
  const [aba, setAba] = useState("pagar");
  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE";
  const ehReceber = aba === "receber";

  return (
    <div>
      <div style={{
        display: "flex", gap: 4, padding: 4, marginBottom: 18,
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 10, width: "fit-content",
      }}>
        <BtnAba ativa={aba === "pagar"} onClick={() => setAba("pagar")} cor={C.red}>
          📤 A Pagar
        </BtnAba>
        <BtnAba ativa={aba === "receber"} onClick={() => setAba("receber")} cor={C.green}>
          📥 A Receber
        </BtnAba>
      </div>

      {ehReceber
        ? <ListaContas key="receber" tipo="receber" podeEditar={podeEditar} />
        : <ListaContas key="pagar" tipo="pagar" podeEditar={podeEditar} />}
    </div>
  );
}

function BtnAba({ ativa, cor, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 18px", borderRadius: 8, border: "none",
      background: ativa ? cor + "22" : "transparent",
      color: ativa ? cor : C.muted,
      fontWeight: ativa ? 700 : 600, fontSize: 13, cursor: "pointer",
    }}>{children}</button>
  );
}

function ListaContas({ tipo, podeEditar }) {
  const ehPagar = tipo === "pagar";
  const rotuloEntidade = ehPagar ? "Fornecedor" : "Cliente";

  const [contas, setContas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [search, setSearch] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroEntidade, setFiltroEntidade] = useState("");
  const [vencidas, setVencidas] = useState(false);
  const [entidades, setEntidades] = useState([]);
  const [editando, setEditando] = useState(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [recebendoPagando, setRecebendoPagando] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const args = {
        search,
        status: filtroStatus,
        dataInicio: "", dataFim: "",
        vencidas: vencidas ? "true" : "",
      };
      if (ehPagar) args.fornecedorId = filtroEntidade;
      else args.clienteId = filtroEntidade;
      const data = ehPagar
        ? await api.listarContasPagar(args)
        : await api.listarContasReceber(args);
      setContas(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [ehPagar, search, filtroStatus, filtroEntidade, vencidas]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    const promise = ehPagar
      ? api.listarFornecedores({ ativo: "true" })
      : api.listarClientes({ ativo: "true" });
    promise.then(setEntidades).catch(() => {});
  }, [ehPagar]);

  function flash(t) {
    setMensagem(t);
    setTimeout(() => setMensagem(""), 3000);
  }

  const kpis = useMemo(() => {
    const ativos = contas.map(c => ({ ...c, _statusEf: statusEfetivo(c) }));
    let totalPendente = 0, qtdPendente = 0;
    let totalAtrasado = 0, qtdAtrasado = 0;
    let totalQuitado = 0, qtdQuitado = 0;
    let proximaData = null;
    let proximoTotal = 0, proximoQtd = 0;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const em7 = new Date(hoje); em7.setDate(em7.getDate() + 7);

    for (const c of ativos) {
      const v = Number(c.valor) || 0;
      if (c._statusEf === "PAGA") { totalQuitado += v; qtdQuitado++; }
      else if (c._statusEf === "ATRASADA") { totalAtrasado += v; qtdAtrasado++; }
      else if (c._statusEf === "PENDENTE") {
        totalPendente += v; qtdPendente++;
        const dv = new Date(c.vencimento);
        if (dv <= em7) { proximoTotal += v; proximoQtd++; }
      }
    }
    return {
      totalPendente, qtdPendente,
      totalAtrasado, qtdAtrasado,
      totalQuitado, qtdQuitado,
      proximoTotal, proximoQtd,
    };
  }, [contas]);

  async function executarPagarReceber(conta, data) {
    try {
      if (ehPagar) await api.pagarConta(conta.id, data);
      else await api.receberConta(conta.id, data);
      flash(ehPagar ? "Conta marcada como paga" : "Conta marcada como recebida");
      setRecebendoPagando(null);
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  async function executarReabrir(conta) {
    if (!confirm("Reabrir esta conta? O recebimento/pagamento sera removido.")) return;
    try {
      if (ehPagar) await api.reabrirContaPagar(conta.id);
      else await api.reabrirContaReceber(conta.id);
      flash("Conta reaberta");
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  async function executarCancelar(conta) {
    if (!confirm("Cancelar esta conta? Esta acao nao pode ser desfeita facilmente.")) return;
    try {
      if (ehPagar) await api.cancelarContaPagar(conta.id);
      else await api.cancelarContaReceber(conta.id);
      flash("Conta cancelada");
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      {/* KPIs */}
      <div style={{
        display: "grid", gap: 12, marginBottom: 16,
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
      }}>
        <CardKpi
          icone="⏳" rotulo="Pendentes" cor={C.yellow}
          valor={fmtBRL(kpis.totalPendente)}
          detalhe={`${kpis.qtdPendente} ${kpis.qtdPendente === 1 ? "conta" : "contas"}`}
        />
        <CardKpi
          icone="⚠" rotulo="Atrasadas" cor={C.red}
          valor={fmtBRL(kpis.totalAtrasado)}
          detalhe={`${kpis.qtdAtrasado} ${kpis.qtdAtrasado === 1 ? "conta" : "contas"}`}
        />
        <CardKpi
          icone="📅" rotulo="Vencendo em 7 dias" cor={C.accent}
          valor={fmtBRL(kpis.proximoTotal)}
          detalhe={`${kpis.proximoQtd} ${kpis.proximoQtd === 1 ? "conta" : "contas"}`}
        />
        <CardKpi
          icone="✓" rotulo={ehPagar ? "Pagas" : "Recebidas"} cor={C.green}
          valor={fmtBRL(kpis.totalQuitado)}
          detalhe={`${kpis.qtdQuitado} ${kpis.qtdQuitado === 1 ? "conta" : "contas"}`}
        />
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar descrição..." style={{ ...inputStyle, flex: "1 1 240px" }} />
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={inputStyle}>
          <option value="">Todos os status</option>
          <option value="PENDENTE">Pendentes</option>
          <option value="PAGA">{ehPagar ? "Pagas" : "Recebidas"}</option>
          <option value="ATRASADA">Atrasadas</option>
          <option value="CANCELADA">Canceladas</option>
        </select>
        <select value={filtroEntidade} onChange={e => setFiltroEntidade(e.target.value)} style={inputStyle}>
          <option value="">Todos {ehPagar ? "fornecedores" : "clientes"}</option>
          {entidades.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <label style={{
          display: "flex", alignItems: "center", gap: 6, color: C.text, fontSize: 12,
          cursor: "pointer", padding: "9px 12px",
          background: vencidas ? C.red + "22" : C.surface,
          border: `1px solid ${vencidas ? C.red + "55" : C.border}`,
          borderRadius: 8, fontWeight: 600,
        }}>
          <input type="checkbox" checked={vencidas} onChange={e => setVencidas(e.target.checked)} />
          Apenas vencidas
        </label>
        {(search || filtroStatus || filtroEntidade || vencidas) && (
          <button onClick={() => {
            setSearch(""); setFiltroStatus(""); setFiltroEntidade(""); setVencidas(false);
          }} style={{
            background: C.surface, border: `1px solid ${C.border}`, color: C.muted,
            borderRadius: 8, padding: "9px 14px", fontSize: 12, cursor: "pointer",
          }}>Limpar</button>
        )}
        {podeEditar && (
          <button onClick={() => setNovoAberto(true)} style={{
            marginLeft: "auto",
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, border: "none", borderRadius: 8,
            padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>
            + Nova conta {ehPagar ? "a pagar" : "a receber"}
          </button>
        )}
      </div>

      {mensagem && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 8,
          background: C.green + "22", border: `1px solid ${C.green}55`,
          color: C.green, fontSize: 13,
        }}>{mensagem}</div>
      )}
      {erro && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 8,
          background: C.red + "22", border: `1px solid ${C.red}55`,
          color: C.red, fontSize: 13,
        }}>{erro}</div>
      )}

      {/* Lista */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 1.4fr 110px 120px 110px 200px",
          padding: "12px 16px", background: C.surface,
          borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700,
          color: C.muted, textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          <div>Descrição</div>
          <div>{rotuloEntidade}</div>
          <div>Vencimento</div>
          <div style={{ textAlign: "right" }}>Valor</div>
          <div style={{ textAlign: "center" }}>Status</div>
          <div style={{ textAlign: "right" }}>Ações</div>
        </div>

        {carregando ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Carregando...</div>
        ) : contas.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>
            Nenhuma conta encontrada.
          </div>
        ) : contas.map(c => {
          const stEf = statusEfetivo(c);
          const info = STATUS_INFO[stEf];
          const dias = diasDiff(c.vencimento);
          const entidade = ehPagar ? c.fornecedor : c.cliente;
          const ehFinalizada = c.status === "PAGA" || c.status === "CANCELADA";

          return (
            <div key={c.id} style={{
              display: "grid", gridTemplateColumns: "2fr 1.4fr 110px 120px 110px 200px",
              padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
              alignItems: "center", fontSize: 13,
              opacity: c.status === "CANCELADA" ? 0.55 : 1,
            }}>
              <div>
                <div style={{ color: C.white, fontWeight: 600 }}>{c.descricao}</div>
                {c.observacoes && (
                  <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{c.observacoes}</div>
                )}
              </div>
              <div style={{ color: C.text, fontSize: 12 }}>
                {entidade?.nome || <span style={{ color: C.muted }}>—</span>}
              </div>
              <div>
                <div style={{ color: C.text, fontSize: 12 }}>{fmtData(c.vencimento)}</div>
                {!ehFinalizada && (
                  <div style={{
                    color: dias < 0 ? C.red : dias <= 7 ? C.yellow : C.muted,
                    fontSize: 10, fontWeight: 600,
                  }}>
                    {dias < 0
                      ? `${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"} atrasada`
                      : dias === 0 ? "Vence hoje"
                      : `Em ${dias} dia${dias === 1 ? "" : "s"}`}
                  </div>
                )}
                {c.status === "PAGA" && (c.pagamento || c.recebimento) && (
                  <div style={{ color: C.green, fontSize: 10, fontWeight: 600 }}>
                    {ehPagar ? "Pago" : "Recebido"} em {fmtData(c.pagamento || c.recebimento)}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", color: ehFinalizada ? C.muted : C.text, fontWeight: 700, fontSize: 14 }}>
                {fmtBRL(c.valor)}
              </div>
              <div style={{ textAlign: "center" }}>
                <span style={{
                  display: "inline-block",
                  padding: "3px 10px", borderRadius: 6,
                  background: info.cor + "22",
                  border: `1px solid ${info.cor}55`,
                  color: info.cor,
                  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                }}>{info.label}</span>
              </div>
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                {!ehFinalizada && podeEditar && (
                  <button onClick={() => setRecebendoPagando(c)} style={btnAcao(C.green)}>
                    {ehPagar ? "Pagar" : "Receber"}
                  </button>
                )}
                {!ehFinalizada && podeEditar && (
                  <button onClick={() => setEditando(c)} style={btnAcao(C.accent)}>
                    Editar
                  </button>
                )}
                {c.status === "PAGA" && podeEditar && (
                  <button onClick={() => executarReabrir(c)} style={btnAcao(C.yellow)}>
                    Reabrir
                  </button>
                )}
                {!ehFinalizada && podeEditar && (
                  <button onClick={() => executarCancelar(c)} style={btnAcao(C.red)}>
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {novoAberto && (
        <ContaModal
          tipo={tipo}
          entidades={entidades}
          onCancelar={() => setNovoAberto(false)}
          onSalvar={() => {
            setNovoAberto(false);
            flash(`Conta ${ehPagar ? "a pagar" : "a receber"} criada`);
            carregar();
          }}
        />
      )}

      {editando && (
        <ContaModal
          tipo={tipo}
          conta={editando}
          entidades={entidades}
          onCancelar={() => setEditando(null)}
          onSalvar={() => {
            setEditando(null);
            flash("Conta atualizada");
            carregar();
          }}
        />
      )}

      {recebendoPagando && (
        <PagarReceberModal
          tipo={tipo}
          conta={recebendoPagando}
          onCancelar={() => setRecebendoPagando(null)}
          onConfirmar={(data) => executarPagarReceber(recebendoPagando, data)}
        />
      )}
    </div>
  );
}

// ============ Componentes auxiliares ============

function CardKpi({ icone, rotulo, valor, detalhe, cor }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: "14px 16px", position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: cor }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>{icone}</span>
        <span style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {rotulo}
        </span>
      </div>
      <div style={{ color: cor, fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{valor}</div>
      <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{detalhe}</div>
    </div>
  );
}

function ContaModal({ tipo, conta, entidades, onCancelar, onSalvar }) {
  const ehPagar = tipo === "pagar";
  const editar = !!conta;
  const [descricao, setDescricao] = useState(conta?.descricao || "");
  const [valor, setValor] = useState(conta?.valor != null ? String(conta.valor) : "");
  const [vencimento, setVencimento] = useState(
    conta?.vencimento ? new Date(conta.vencimento).toISOString().slice(0, 10) : ""
  );
  const [entidadeId, setEntidadeId] = useState(
    (ehPagar ? conta?.fornecedorId : conta?.clienteId) || ""
  );
  const [observacoes, setObservacoes] = useState(conta?.observacoes || "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (!descricao.trim()) { setErro("Descrição é obrigatória"); return; }
    const v = parseFloat(String(valor).replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) { setErro("Valor deve ser maior que zero"); return; }
    if (!vencimento) { setErro("Vencimento é obrigatório"); return; }

    const payload = {
      descricao,
      valor: v,
      vencimento,
      observacoes: observacoes || null,
    };
    if (ehPagar) payload.fornecedorId = entidadeId || null;
    else payload.clienteId = entidadeId || null;

    setSalvando(true);
    try {
      if (editar) {
        if (ehPagar) await api.atualizarContaPagar(conta.id, payload);
        else await api.atualizarContaReceber(conta.id, payload);
      } else {
        if (ehPagar) await api.criarContaPagar(payload);
        else await api.criarContaReceber(payload);
      }
      onSalvar();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={modalOverlay}>
      <form onSubmit={salvar} onClick={e => e.stopPropagation()} style={modalCard}>
        <div style={modalHeader}>
          <div>
            <div style={{ color: C.white, fontWeight: 700, fontSize: 18 }}>
              {editar ? "Editar conta" : `Nova conta ${ehPagar ? "a pagar" : "a receber"}`}
            </div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
              {ehPagar ? "Despesa / pagamento" : "Receita / recebimento"}
            </div>
          </div>
          <button type="button" onClick={onCancelar} disabled={salvando} style={btnFechar}>×</button>
        </div>

        <Campo label="Descrição *">
          <input value={descricao} onChange={e => setDescricao(e.target.value)}
            required autoFocus style={inputStyle} placeholder="Ex: Aluguel, Energia, NF #123..." />
        </Campo>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Campo label="Valor *">
            <input type="number" step="0.01" min="0.01" value={valor}
              onChange={e => setValor(e.target.value)} required style={inputStyle} placeholder="0,00" />
          </Campo>
          <Campo label="Vencimento *">
            <input type="date" value={vencimento}
              onChange={e => setVencimento(e.target.value)} required style={inputStyle} />
          </Campo>
        </div>

        <Campo label={ehPagar ? "Fornecedor" : "Cliente"}>
          <select value={entidadeId} onChange={e => setEntidadeId(e.target.value)} style={inputStyle}>
            <option value="">— Sem vínculo —</option>
            {entidades.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </Campo>

        <Campo label="Observações">
          <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
            rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
        </Campo>

        {erro && (
          <div style={{
            marginTop: 8, padding: "10px 12px", borderRadius: 8,
            background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
          }}>{erro}</div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" onClick={onCancelar} disabled={salvando} style={btnSecundario}>Cancelar</button>
          <button type="submit" disabled={salvando} style={btnPrimario}>
            {salvando ? "Salvando..." : (editar ? "Salvar alterações" : "Criar conta")}
          </button>
        </div>
      </form>
    </div>
  );
}

function PagarReceberModal({ tipo, conta, onCancelar, onConfirmar }) {
  const ehPagar = tipo === "pagar";
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function confirmar(e) {
    e.preventDefault();
    setErro("");
    if (!data) { setErro("Informe a data"); return; }
    setSalvando(true);
    try {
      await onConfirmar(data);
    } catch (err) {
      setErro(err.message);
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={modalOverlay}>
      <form onSubmit={confirmar} onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 380 }}>
        <div style={modalHeader}>
          <div style={{ color: C.white, fontWeight: 700, fontSize: 18 }}>
            {ehPagar ? "💸 Pagar conta" : "💵 Receber conta"}
          </div>
          <button type="button" onClick={onCancelar} disabled={salvando} style={btnFechar}>×</button>
        </div>

        <div style={{
          padding: "12px 14px", marginBottom: 14,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
        }}>
          <div style={{ color: C.white, fontWeight: 600, fontSize: 14 }}>{conta.descricao}</div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
            Vencimento: {fmtData(conta.vencimento)}
          </div>
          <div style={{ color: ehPagar ? C.red : C.green, fontSize: 22, fontWeight: 800, marginTop: 6 }}>
            {fmtBRL(conta.valor)}
          </div>
        </div>

        <Campo label={`Data do ${ehPagar ? "pagamento" : "recebimento"} *`}>
          <input type="date" value={data} onChange={e => setData(e.target.value)}
            required style={inputStyle} />
        </Campo>

        {erro && (
          <div style={{
            marginTop: 8, padding: "10px 12px", borderRadius: 8,
            background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
          }}>{erro}</div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" onClick={onCancelar} disabled={salvando} style={btnSecundario}>Cancelar</button>
          <button type="submit" disabled={salvando} style={{
            ...btnPrimario,
            background: ehPagar
              ? `linear-gradient(135deg, ${C.red}, ${C.purple})`
              : `linear-gradient(135deg, ${C.green}, ${C.accent})`,
          }}>
            {salvando ? "Confirmando..." : (ehPagar ? "Confirmar pagamento" : "Confirmar recebimento")}
          </button>
        </div>
      </form>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: "block", color: C.muted, fontSize: 12, marginBottom: 6, fontWeight: 600,
      }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 13,
  outline: "none", boxSizing: "border-box", width: "100%",
};

const modalOverlay = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 20, zIndex: 100,
};

const modalCard = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
  width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", padding: 24,
};

const modalHeader = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  marginBottom: 18,
};

const btnFechar = {
  background: "transparent", border: "none", color: C.muted,
  fontSize: 22, cursor: "pointer",
};

const btnSecundario = {
  background: C.surface, border: `1px solid ${C.border}`, color: C.text,
  borderRadius: 8, padding: "10px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer",
};

const btnPrimario = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: C.white, border: "none", borderRadius: 8,
  padding: "10px 22px", fontWeight: 700, fontSize: 13, cursor: "pointer",
};

function btnAcao(cor) {
  return {
    background: cor + "22", border: `1px solid ${cor}55`, color: cor,
    borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600,
    cursor: "pointer", whiteSpace: "nowrap",
  };
}
