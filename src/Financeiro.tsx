import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { C } from "./lib/theme";
import { api, BASE_URL, getUser } from "./lib/api";
import ActionsMenu from "./components/ActionsMenu";
import { useConfiguracaoEmpresa } from "./HeaderRelatorio";
import { obterConfigImpressora, devePrintar, imprimirDocumento } from "./lib/impressora";
import { ignorarErro } from "./lib/erroSilencioso";
import CupomEnvelope from "./components/cupons/CupomEnvelope.jsx";
import CupomReciboFinanceiro from "./components/cupons/CupomReciboFinanceiro.jsx";


const fmtBRL = (v: any) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtData = (iso: any) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
};

const STATUS_INFO: Record<string, { label: string; cor: string }> = {
  PENDENTE: { label: "Pendente", cor: C.yellow },
  PAGA: { label: "Paga", cor: C.green },
  ATRASADA: { label: "Atrasada", cor: C.red },
  CANCELADA: { label: "Cancelada", cor: C.muted },
};

function diasDiff(iso: any) {
  if (!iso) return 0;
  const venc = new Date(iso);
  venc.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((venc.getTime() - hoje.getTime()) / 86400000);
}

function statusEfetivo(conta: any) {
  if (conta.status === "PAGA" || conta.status === "CANCELADA") return conta.status;
  return diasDiff(conta.vencimento) < 0 ? "ATRASADA" : "PENDENTE";
}

export default function Financeiro({ user }: any) {
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

function BtnAba({ ativa, cor, onClick, children }: any) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 18px", borderRadius: 8, border: "none",
      background: ativa ? cor + "22" : "transparent",
      color: ativa ? cor : C.muted,
      fontWeight: ativa ? 700 : 600, fontSize: 13, cursor: "pointer",
    }}>{children}</button>
  );
}

function ListaContas({ tipo, podeEditar }: any) {
  const ehPagar = tipo === "pagar";
  const rotuloEntidade = ehPagar ? "Fornecedor" : "Cliente";
  const empresa = useConfiguracaoEmpresa();

  const [contas, setContas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [search, setSearch] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroEntidade, setFiltroEntidade] = useState("");
  const [vencidas, setVencidas] = useState(false);
  const [entidades, setEntidades] = useState<any[]>([]);
  const [editando, setEditando] = useState<any>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [recebendoPagando, setRecebendoPagando] = useState<any>(null);
  const [anexandoEm, setAnexandoEm] = useState<any>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const args: any = {
        search,
        status: filtroStatus,
        dataInicio: "", dataFim: "",
        vencidas: vencidas ? "true" : "",
      };
      if (ehPagar) args.fornecedorId = filtroEntidade;
      else args.clienteId = filtroEntidade;
      const data = ehPagar
        ? await api.listarContasPagar(args) as any[]
        : await api.listarContasReceber(args) as any[];
      setContas(data);
    } catch (err: any) {
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
    promise.then((data: any) => setEntidades(Array.isArray(data) ? data : [])).catch(ignorarErro("dados"));
  }, [ehPagar]);

  function flash(t: string) {
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

  async function executarPagarReceber(conta: any, payload: any) {
    try {
      if (ehPagar) await api.pagarConta(conta.id, payload);
      else await api.receberConta(conta.id, payload);
      flash(ehPagar ? "Conta marcada como paga" : "Conta marcada como recebida");
      setRecebendoPagando(null);

      // Auto-imprime recibo se a config permitir. Monta a conta com os dados
      // pagos a partir do payload (mais barato que um GET a mais).
      const cfgImp = await obterConfigImpressora();
      if (cfgImp.imprimirAutomatico && devePrintar("RECIBO_FIN", cfgImp)) {
        const contaImpressao = {
          ...conta,
          valorPago: payload?.valorPago ?? payload?.valor ?? conta.valor,
          dataPagamento: payload?.dataPagamento || new Date().toISOString(),
          formaPagamento: payload?.formaPagamento || conta.formaPagamento,
          observacoes: payload?.observacoes || conta.observacoes,
        };
        await imprimirDocumento(
          <CupomEnvelope cfg={cfgImp}>
            <CupomReciboFinanceiro
              tipo={ehPagar ? "PAGAR" : "RECEBER"}
              conta={contaImpressao}
              operador={getUser()}
              empresa={empresa}
              cfg={cfgImp}
            />
          </CupomEnvelope>,
        );
      }

      carregar();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function imprimirReciboReimpressao(conta: any) {
    const cfgImp = await obterConfigImpressora();
    await imprimirDocumento(
      <CupomEnvelope cfg={cfgImp}>
        <CupomReciboFinanceiro
          tipo={ehPagar ? "PAGAR" : "RECEBER"}
          conta={conta}
          operador={getUser()}
          empresa={empresa}
          cfg={cfgImp}
        />
      </CupomEnvelope>,
    );
  }

  async function executarReabrir(conta: any) {
    if (!confirm("Reabrir esta conta? O recebimento/pagamento sera removido.")) return;
    try {
      if (ehPagar) await api.reabrirContaPagar(conta.id);
      else await api.reabrirContaReceber(conta.id);
      flash("Conta reaberta");
      carregar();
    } catch (err: any) {
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
    } catch (err: any) {
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
          display: "grid", gridTemplateColumns: "2fr 1.3fr 110px 130px 110px 80px",
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

          const qtdAnexos = c.anexos?.length || 0;
          const ehParcelada = c.tipoRecorrencia === "PARCELADA";
          const ehRecorrente = c.tipoRecorrencia === "RECORRENTE";
          const temAjuste = Number(c.juros) > 0 || Number(c.multa) > 0 || Number(c.desconto) > 0;

          return (
            <div key={c.id} style={{
              display: "grid", gridTemplateColumns: "2fr 1.3fr 110px 130px 110px 80px",
              padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
              alignItems: "center", fontSize: 13,
              opacity: c.status === "CANCELADA" ? 0.55 : 1,
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ color: C.white, fontWeight: 600 }}>{c.descricao}</span>
                  {ehParcelada && (
                    <span style={badgeMini(C.purple)}>
                      📋 {c.parcelaAtual}/{c.parcelaTotal}
                    </span>
                  )}
                  {ehRecorrente && (
                    <span style={badgeMini(C.accent)}>
                      🔁 {c.parcelaAtual}/{c.parcelaTotal}
                    </span>
                  )}
                  {qtdAnexos > 0 && (
                    <span style={badgeMini(C.yellow)} title={`${qtdAnexos} anexo${qtdAnexos > 1 ? "s" : ""}`}>
                      📎 {qtdAnexos}
                    </span>
                  )}
                </div>
                {c.observacoes && (
                  <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{c.observacoes}</div>
                )}
                {temAjuste && (
                  <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>
                    Bruto {fmtBRL(c.valorBruto || c.valor)}
                    {Number(c.juros) > 0 && ` + juros ${fmtBRL(c.juros)}`}
                    {Number(c.multa) > 0 && ` + multa ${fmtBRL(c.multa)}`}
                    {Number(c.desconto) > 0 && ` − desc ${fmtBRL(c.desconto)}`}
                  </div>
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
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <ActionsMenu
                  items={[
                    {
                      label: ehPagar ? "Pagar" : "Receber",
                      icon: "✓",
                      color: C.green,
                      onClick: () => setRecebendoPagando(c),
                      hidden: ehFinalizada || !podeEditar,
                    },
                    {
                      label: qtdAnexos > 0 ? `Anexos (${qtdAnexos})` : "Anexos",
                      icon: "📎",
                      color: C.yellow,
                      onClick: () => setAnexandoEm(c),
                    },
                    {
                      label: "Editar",
                      icon: "✎",
                      color: C.accent,
                      onClick: () => setEditando(c),
                      hidden: ehFinalizada || !podeEditar,
                    },
                    {
                      label: "Imprimir recibo",
                      icon: "🖨",
                      color: C.accent,
                      onClick: () => imprimirReciboReimpressao(c),
                      hidden: c.status !== "PAGA",
                    },
                    {
                      label: "Reabrir",
                      icon: "↺",
                      color: C.yellow,
                      onClick: () => executarReabrir(c),
                      hidden: !(c.status === "PAGA" && podeEditar),
                    },
                    {
                      label: "Cancelar",
                      icon: "✕",
                      color: C.red,
                      onClick: () => executarCancelar(c),
                      hidden: ehFinalizada || !podeEditar,
                    },
                  ]}
                />
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
          podeEditar={podeEditar}
          onCancelar={() => setRecebendoPagando(null)}
          onConfirmar={(payload) => executarPagarReceber(recebendoPagando, payload)}
        />
      )}

      {anexandoEm && (
        <AnexosModal
          tipo={tipo}
          conta={anexandoEm}
          podeEditar={podeEditar}
          onFechar={() => { setAnexandoEm(null); carregar(); }}
        />
      )}
    </div>
  );
}

// ============ Componentes auxiliares ============

function CardKpi({ icone, rotulo, valor, detalhe, cor }: any) {
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

export function ContaModal({ tipo, conta, entidades, onCancelar, onSalvar }: any) {
  const ehPagar = tipo === "pagar";
  const editar = !!conta;
  const [descricao, setDescricao] = useState(conta?.descricao || "");
  // valorBruto: nova conta usa "valorBruto"; conta antiga (sem essa coluna preenchida) cai no `valor`.
  const [valorBruto, setValorBruto] = useState(
    conta?.valorBruto != null ? String(conta.valorBruto)
    : conta?.valor != null ? String(conta.valor) : ""
  );
  const [juros, setJuros] = useState(conta?.juros ? String(conta.juros) : "");
  const [multa, setMulta] = useState(conta?.multa ? String(conta.multa) : "");
  const [desconto, setDesconto] = useState(conta?.desconto ? String(conta.desconto) : "");
  const [vencimento, setVencimento] = useState(
    conta?.vencimento ? new Date(conta.vencimento).toISOString().slice(0, 10) : ""
  );
  const [entidadeId, setEntidadeId] = useState(
    (ehPagar ? conta?.fornecedorId : conta?.clienteId) || ""
  );
  const [observacoes, setObservacoes] = useState(conta?.observacoes || "");
  // Recorrência só aparece em criação — alterar tipo de conta existente exigiria
  // mexer em todo o grupoRecorrenciaId.
  const [tipoRecorrencia, setTipoRecorrencia] = useState("NENHUMA");
  const [parcelaTotal, setParcelaTotal] = useState("3");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const liquido = useMemo(() => {
    const vb = parseFloat(String(valorBruto).replace(",", ".")) || 0;
    const j  = parseFloat(String(juros).replace(",", ".")) || 0;
    const m  = parseFloat(String(multa).replace(",", ".")) || 0;
    const d  = parseFloat(String(desconto).replace(",", ".")) || 0;
    return vb + j + m - d;
  }, [valorBruto, juros, multa, desconto]);

  const valorParcela = useMemo(() => {
    if (tipoRecorrencia === "NENHUMA") return null;
    const total = parseInt(parcelaTotal, 10);
    const vb = parseFloat(String(valorBruto).replace(",", ".")) || 0;
    if (!total || total < 2 || vb <= 0) return null;
    if (tipoRecorrencia === "PARCELADA") return vb / total;
    return vb; // recorrente repete o mesmo valor
  }, [tipoRecorrencia, parcelaTotal, valorBruto]);

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (!descricao.trim()) { setErro("Descrição é obrigatória"); return; }
    const vb = parseFloat(String(valorBruto).replace(",", "."));
    if (!Number.isFinite(vb) || vb <= 0) { setErro("Valor bruto deve ser maior que zero"); return; }
    if (!vencimento) { setErro("Vencimento é obrigatório"); return; }
    if (liquido <= 0) { setErro("Valor líquido (bruto + juros + multa - desconto) deve ser maior que zero"); return; }

    const payload: any = {
      descricao,
      valorBruto: vb,
      juros: parseFloat(String(juros).replace(",", ".")) || 0,
      multa: parseFloat(String(multa).replace(",", ".")) || 0,
      desconto: parseFloat(String(desconto).replace(",", ".")) || 0,
      vencimento,
      observacoes: observacoes || null,
    };
    if (ehPagar) payload.fornecedorId = entidadeId || null;
    else payload.clienteId = entidadeId || null;

    if (!editar && tipoRecorrencia !== "NENHUMA") {
      payload.tipoRecorrencia = tipoRecorrencia;
      const total = parseInt(parcelaTotal, 10);
      if (!total || total < 2 || total > 60) {
        setErro("Número de parcelas deve estar entre 2 e 60"); return;
      }
      payload.parcelaTotal = total;
    }

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
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={modalOverlay}>
      <form onSubmit={salvar} onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 560 }}>
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
          <Campo label="Valor bruto *">
            <input type="number" step="0.01" min="0.01" value={valorBruto}
              onChange={e => setValorBruto(e.target.value)} required style={inputStyle} placeholder="0,00" />
          </Campo>
          <Campo label="Vencimento *">
            <input type="date" value={vencimento}
              onChange={e => setVencimento(e.target.value)} required style={inputStyle} />
          </Campo>
        </div>

        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: "12px 14px", marginBottom: 12,
        }}>
          <div style={{
            color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 10,
            textTransform: "uppercase", letterSpacing: 0.5,
          }}>Juros, multa e desconto (opcionais)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Campo label="💸 Juros">
              <input type="number" step="0.01" min="0" value={juros}
                onChange={e => setJuros(e.target.value)} style={inputStyle} placeholder="0,00" />
            </Campo>
            <Campo label="⚠ Multa">
              <input type="number" step="0.01" min="0" value={multa}
                onChange={e => setMulta(e.target.value)} style={inputStyle} placeholder="0,00" />
            </Campo>
            <Campo label="💰 Desconto">
              <input type="number" step="0.01" min="0" value={desconto}
                onChange={e => setDesconto(e.target.value)} style={inputStyle} placeholder="0,00" />
            </Campo>
          </div>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginTop: 4, padding: "8px 12px", background: C.bg,
            border: `1px solid ${C.border}`, borderRadius: 8,
          }}>
            <span style={{ color: C.muted, fontSize: 12, fontWeight: 600 }}>Valor líquido</span>
            <span style={{ color: liquido > 0 ? C.green : C.red, fontWeight: 800, fontSize: 16 }}>
              {fmtBRL(liquido)}
            </span>
          </div>
        </div>

        <Campo label={ehPagar ? "Fornecedor" : "Cliente"}>
          <select value={entidadeId} onChange={e => setEntidadeId(e.target.value)} style={inputStyle}>
            <option value="">— Sem vínculo —</option>
            {entidades.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </Campo>

        {!editar && (
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "12px 14px", marginBottom: 12,
          }}>
            <div style={{
              color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 10,
              textTransform: "uppercase", letterSpacing: 0.5,
            }}>🔁 Recorrência</div>
            <div style={{ display: "flex", gap: 6, marginBottom: tipoRecorrencia === "NENHUMA" ? 0 : 10 }}>
              <BtnRecorrencia ativa={tipoRecorrencia === "NENHUMA"} onClick={() => setTipoRecorrencia("NENHUMA")}>
                Nenhuma
              </BtnRecorrencia>
              <BtnRecorrencia ativa={tipoRecorrencia === "PARCELADA"} onClick={() => setTipoRecorrencia("PARCELADA")}>
                Parcelada
              </BtnRecorrencia>
              <BtnRecorrencia ativa={tipoRecorrencia === "RECORRENTE"} onClick={() => setTipoRecorrencia("RECORRENTE")}>
                Recorrente (mensal)
              </BtnRecorrencia>
            </div>
            {tipoRecorrencia !== "NENHUMA" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "end" }}>
                <Campo label={tipoRecorrencia === "PARCELADA" ? "Nº de parcelas" : "Repetir por (meses)"}>
                  <input type="number" min="2" max="60" value={parcelaTotal}
                    onChange={e => setParcelaTotal(e.target.value)} style={inputStyle} />
                </Campo>
                <div style={{
                  background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: "9px 12px", fontSize: 12,
                }}>
                  <div style={{ color: C.muted, marginBottom: 2 }}>
                    {tipoRecorrencia === "PARCELADA" ? "Cada parcela (bruto)" : "Cada mês (bruto)"}
                  </div>
                  <div style={{ color: C.accent, fontWeight: 800, fontSize: 14 }}>
                    {valorParcela != null ? fmtBRL(valorParcela) : "—"}
                  </div>
                </div>
              </div>
            )}
            {tipoRecorrencia === "PARCELADA" && (
              <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>
                ℹ Juros, multa e desconto se aplicam apenas à 1ª parcela. Última parcela ajusta centavos do arredondamento.
              </div>
            )}
            {tipoRecorrencia === "RECORRENTE" && (
              <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>
                ℹ Cria N contas com mesmo valor, vencendo em meses subsequentes (preserva o dia).
              </div>
            )}
          </div>
        )}

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

function BtnRecorrencia({ ativa, onClick, children }: any) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1, padding: "8px 10px", borderRadius: 8,
      background: ativa ? C.accent + "22" : C.bg,
      border: `1px solid ${ativa ? C.accent + "88" : C.border}`,
      color: ativa ? C.accent : C.muted,
      fontWeight: ativa ? 700 : 600, fontSize: 12, cursor: "pointer",
    }}>{children}</button>
  );
}

const FORMAS_PAGAMENTO = [
  { id: "DINHEIRO",       label: "💵 Dinheiro" },
  { id: "PIX",            label: "⚡ PIX" },
  { id: "CARTAO_DEBITO",  label: "💳 Débito" },
  { id: "CARTAO_CREDITO", label: "💳 Crédito" },
  { id: "BOLETO",         label: "🧾 Boleto" },
  { id: "CREDIARIO",      label: "📒 Crediário" },
];

// Data de hoje em formato YYYY-MM-DD usando o fuso LOCAL. toISOString()
// retorna em UTC e em fusos negativos (ex: BRT) joga "ontem" depois das 21h.
function hojeLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

export function PagarReceberModal({ tipo, conta, podeEditar, onCancelar, onConfirmar }: any) {
  const ehPagar = tipo === "pagar";
  const [data, setData] = useState(hojeLocal());
  const [ajustar, setAjustar] = useState(false);
  const [juros, setJuros] = useState(conta.juros ? String(conta.juros) : "");
  const [multa, setMulta] = useState(conta.multa ? String(conta.multa) : "");
  const [desconto, setDesconto] = useState(conta.desconto ? String(conta.desconto) : "");
  // Valor armazenado e composito: "default:<ENUM>" para as 6 padroes ou
  // "custom:<id>" para formas cadastradas pelo usuario. No submit traduzimos
  // de volta para o enum FormaPagamento.
  const [formaSel, setFormaSel] = useState("default:DINHEIRO");
  const [formasCustom, setFormasCustom] = useState<any[]>([]);
  const [gerenciarAberto, setGerenciarAberto] = useState(false);
  const [caixaId, setCaixaId] = useState(""); // "" => default backend (caixa do user); "FORA" => null (fora do PDV)
  const [caixasAbertos, setCaixasAbertos] = useState<any[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Carrega caixas abertos (todos do sistema) para o usuario escolher onde
  // lancar a movimentacao. Default fica "" (backend usa o caixa do user).
  useEffect(() => {
    api.listarCaixas({ status: "ABERTO" })
      .then((lista: any) => {
        setCaixasAbertos(Array.isArray(lista) ? lista : (lista?.caixas || []));
      })
      .catch(ignorarErro("caixasAbertos", () => setCaixasAbertos([])));
  }, []);

  const recarregarFormasCustom = useCallback(() => {
    return api.listarFormasPagamento({ ativo: "true" })
      .then((lista: any) => setFormasCustom(Array.isArray(lista) ? lista : []))
      .catch(ignorarErro("formasPagamento", () => setFormasCustom([])));
  }, []);

  useEffect(() => { recarregarFormasCustom(); }, [recarregarFormasCustom]);

  // Traduz o valor selecionado (composito) para o enum FormaPagamento que
  // sera persistido no backend.
  const formaPagamentoEnum = useMemo(() => {
    if (formaSel.startsWith("default:")) return formaSel.slice("default:".length);
    if (formaSel.startsWith("custom:")) {
      const id = formaSel.slice("custom:".length);
      const c = formasCustom.find(x => x.id === id);
      return c ? c.baseFormaPagamento : "DINHEIRO";
    }
    return "DINHEIRO";
  }, [formaSel, formasCustom]);

  const valorBrutoOriginal = Number(conta.valorBruto || conta.valor || 0);

  const liquido = useMemo(() => {
    if (!ajustar) return Number(conta.valor) || 0;
    const j = parseFloat(String(juros).replace(",", ".")) || 0;
    const m = parseFloat(String(multa).replace(",", ".")) || 0;
    const d = parseFloat(String(desconto).replace(",", ".")) || 0;
    return valorBrutoOriginal + j + m - d;
  }, [ajustar, juros, multa, desconto, valorBrutoOriginal, conta.valor]);

  async function confirmar(e: any) {
    e.preventDefault();
    setErro("");
    if (!data) { setErro("Informe a data"); return; }
    if (ajustar && liquido <= 0) {
      setErro("Valor líquido (bruto + juros + multa - desconto) deve ser maior que zero"); return;
    }
    setSalvando(true);
    try {
      const payload: any = ehPagar ? { pagamento: data } : { recebimento: data };
      payload.formaPagamento = formaPagamentoEnum;
      // caixaId: "FORA" -> null explicito (nao registra no caixa); "" -> nao envia (default backend); uuid -> caixa especifico
      if (caixaId === "FORA") payload.caixaId = null;
      else if (caixaId) payload.caixaId = caixaId;
      if (ajustar) {
        payload.juros = parseFloat(String(juros).replace(",", ".")) || 0;
        payload.multa = parseFloat(String(multa).replace(",", ".")) || 0;
        payload.desconto = parseFloat(String(desconto).replace(",", ".")) || 0;
      }
      await onConfirmar(payload);
    } catch (err: any) {
      setErro(err.message);
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={modalOverlay}>
      <form onSubmit={confirmar} onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 440 }}>
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
            {fmtBRL(liquido)}
          </div>
          {ajustar && (
            <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
              Bruto: {fmtBRL(valorBrutoOriginal)}
            </div>
          )}
        </div>

        <Campo label={`Data do ${ehPagar ? "pagamento" : "recebimento"} *`}>
          <input type="date" value={data} onChange={e => setData(e.target.value)}
            required style={inputStyle} />
        </Campo>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={{ color: C.muted, fontSize: 12, fontWeight: 600 }}>Forma de pagamento</label>
              {podeEditar && (
                <button
                  type="button"
                  onClick={() => setGerenciarAberto(true)}
                  title="Cadastrar/editar formas de pagamento"
                  style={{
                    background: "transparent", border: "none", color: C.accent,
                    fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0,
                  }}
                >⚙ Gerenciar</button>
              )}
            </div>
            <select value={formaSel} onChange={e => setFormaSel(e.target.value)} style={inputStyle}>
              {FORMAS_PAGAMENTO.map(f => (
                <option key={f.id} value={`default:${f.id}`}>{f.label}</option>
              ))}
              {formasCustom.length > 0 && (
                <option disabled>──────── Personalizadas ────────</option>
              )}
              {formasCustom.map(c => (
                <option key={c.id} value={`custom:${c.id}`}>
                  {c.icone ? `${c.icone} ` : ""}{c.nome}
                </option>
              ))}
            </select>
          </div>
          <Campo label={ehPagar ? "Caixa de pagamento" : "Caixa de recebimento"}>
            <select value={caixaId} onChange={e => setCaixaId(e.target.value)} style={inputStyle}>
              <option value="">— Caixa do meu usuário (padrão) —</option>
              {caixasAbertos.map(c => (
                <option key={c.id} value={c.id}>
                  Caixa #{c.numero} · {c.user?.nome || "—"}
                </option>
              ))}
              <option value="FORA">Fora do PDV (não registrar)</option>
            </select>
          </Campo>
        </div>

        <button type="button" onClick={() => setAjustar(v => !v)} style={{
          width: "100%", marginBottom: ajustar ? 12 : 0, padding: "9px 12px",
          background: ajustar ? C.accent + "22" : C.surface,
          border: `1px solid ${ajustar ? C.accent + "55" : C.border}`,
          color: ajustar ? C.accent : C.muted, borderRadius: 8,
          fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}>
          {ajustar ? "✓ " : "+ "}Ajustar juros / multa / desconto
        </button>

        {ajustar && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Campo label="💸 Juros">
              <input type="number" step="0.01" min="0" value={juros}
                onChange={e => setJuros(e.target.value)} style={inputStyle} placeholder="0,00" />
            </Campo>
            <Campo label="⚠ Multa">
              <input type="number" step="0.01" min="0" value={multa}
                onChange={e => setMulta(e.target.value)} style={inputStyle} placeholder="0,00" />
            </Campo>
            <Campo label="💰 Desconto">
              <input type="number" step="0.01" min="0" value={desconto}
                onChange={e => setDesconto(e.target.value)} style={inputStyle} placeholder="0,00" />
            </Campo>
          </div>
        )}

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

      {gerenciarAberto && (
        <GerenciarFormasModal
          podeExcluir={podeEditar}
          onFechar={async () => {
            setGerenciarAberto(false);
            await recarregarFormasCustom();
          }}
        />
      )}
    </div>
  );
}

export function AnexosModal({ tipo, conta, podeEditar, onFechar }: any) {
  const ehPagar = tipo === "pagar";
  const [anexos, setAnexos] = useState(conta.anexos || []);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function enviar(file) {
    if (!file) return;
    setErro(""); setEnviando(true);
    try {
      const novo = ehPagar
        ? await api.anexarContaPagar(conta.id, file)
        : await api.anexarContaReceber(conta.id, file);
      setAnexos((prev: any[]) => [...prev, novo]);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function excluir(anexo: any) {
    if (!confirm(`Excluir anexo "${anexo.nomeOriginal}"?`)) return;
    setErro("");
    try {
      if (ehPagar) await api.excluirAnexoContaPagar(conta.id, anexo.id);
      else await api.excluirAnexoContaReceber(conta.id, anexo.id);
      setAnexos((prev: any[]) => prev.filter((a: any) => a.id !== anexo.id));
    } catch (err: any) {
      setErro(err.message);
    }
  }

  function fmtTamanho(bytes: any) {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  function iconeTipo(mime) {
    if (mime === "application/pdf") return "📄";
    if (mime?.startsWith("image/")) return "🖼";
    return "📎";
  }

  return (
    <div onClick={() => !enviando && onFechar()} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 540 }}>
        <div style={modalHeader}>
          <div>
            <div style={{ color: C.white, fontWeight: 700, fontSize: 18 }}>
              📎 Anexos
            </div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
              {conta.descricao}
            </div>
          </div>
          <button type="button" onClick={onFechar} disabled={enviando} style={btnFechar}>×</button>
        </div>

        {podeEditar && (
          <label style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "16px 14px", marginBottom: 14,
            background: enviando ? C.surface : C.accent + "11",
            border: `2px dashed ${enviando ? C.border : C.accent + "55"}`,
            borderRadius: 10, cursor: enviando ? "wait" : "pointer",
            color: enviando ? C.muted : C.accent, fontSize: 13, fontWeight: 600,
          }}>
            <input type="file" accept="application/pdf,image/jpeg,image/png"
              disabled={enviando}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) enviar(f);
                e.target.value = "";
              }}
              style={{ display: "none" }} />
            {enviando ? "⏳ Enviando..." : "📤 Selecionar arquivo (PDF, JPG, PNG até 5 MB)"}
          </label>
        )}

        {erro && (
          <div style={{
            marginBottom: 12, padding: "10px 12px", borderRadius: 8,
            background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
          }}>{erro}</div>
        )}

        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 10, overflow: "hidden",
        }}>
          {anexos.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>
              Nenhum anexo nesta conta.
            </div>
          ) : anexos.map(a => (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 22 }}>{iconeTipo(a.mimeType)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <a href={`${BASE_URL}${a.url}`} target="_blank" rel="noreferrer" style={{
                  color: C.text, fontWeight: 600, fontSize: 13,
                  textDecoration: "none", display: "block",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{a.nomeOriginal}</a>
                <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                  {fmtTamanho(a.tamanho)} · {fmtData(a.createdAt)}
                </div>
              </div>
              <a href={`${BASE_URL}${a.url}`} target="_blank" rel="noreferrer" style={{
                ...btnAcao(C.accent), textDecoration: "none",
              }}>Abrir</a>
              {podeEditar && (
                <button type="button" onClick={() => excluir(a)} style={btnAcao(C.red)}>
                  Excluir
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" onClick={onFechar} disabled={enviando} style={btnSecundario}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: any) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: "block", color: C.muted, fontSize: 12, marginBottom: 6, fontWeight: 600,
      }}>{label}</label>
      {children}
    </div>
  );
}

// Modal de cadastro/edicao das formas de pagamento personalizadas. Cada
// forma cadastrada referencia uma das 6 padroes (DINHEIRO/PIX/etc) — o
// label custom aparece no dropdown mas o valor persistido no banco
// continua sendo o enum base, preservando relatorios e historico.
//
// Exportado para ser reusado em PDV.jsx e Compras.jsx.
export function GerenciarFormasModal({ podeExcluir, onFechar }: any) {
  const [formas, setFormas] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<any>(null); // null = nova; objeto = editando
  const [nome, setNome] = useState("");
  const [icone, setIcone] = useState("");
  const [base, setBase] = useState("DINHEIRO");
  const [ordem, setOrdem] = useState("0");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const lista: any = await api.listarFormasPagamento();
      setFormas(Array.isArray(lista) ? lista : []);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function limparForm() {
    setEditando(null); setNome(""); setIcone("");
    setBase("DINHEIRO"); setOrdem("0"); setErro("");
  }

  function iniciarEdicao(f: any) {
    setEditando(f);
    setNome(f.nome);
    setIcone(f.icone || "");
    setBase(f.baseFormaPagamento);
    setOrdem(String(f.ordem ?? 0));
    setErro("");
  }

  async function salvar(e: any) {
    e.preventDefault();
    setErro("");
    const nomeTrim = nome.trim();
    if (!nomeTrim) { setErro("Informe um nome"); return; }
    setSalvando(true);
    try {
      const payload: any = {
        nome: nomeTrim,
        icone: icone.trim() || null,
        baseFormaPagamento: base,
        ordem: parseInt(ordem, 10) || 0,
      };
      if (editando) {
        payload.ativo = editando.ativo;
        await api.atualizarFormaPagamento(editando.id, payload);
      } else {
        await api.criarFormaPagamento(payload);
      }
      await carregar();
      limparForm();
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(f: any) {
    setErro("");
    try {
      await api.atualizarFormaPagamento(f.id, {
        nome: f.nome,
        icone: f.icone,
        baseFormaPagamento: f.baseFormaPagamento,
        ordem: f.ordem,
        ativo: !f.ativo,
      });
      await carregar();
    } catch (err: any) { setErro(err.message); }
  }

  async function remover(f: any) {
    if (!confirm(`Excluir a forma "${f.nome}"?`)) return;
    setErro("");
    try {
      await api.excluirFormaPagamento(f.id);
      await carregar();
      if (editando?.id === f.id) limparForm();
    } catch (err: any) { setErro(err.message); }
  }

  return (
    <div onClick={onFechar} style={{ ...modalOverlay, zIndex: 110 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 560 }}>
        <div style={modalHeader}>
          <div>
            <div style={{ color: C.white, fontWeight: 700, fontSize: 18 }}>
              💳 Formas de pagamento
            </div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
              Cadastre formas extras (ex: Vale-Refeição). Cada uma é vinculada a uma forma base
              (Dinheiro/PIX/etc) para fins de relatório.
            </div>
          </div>
          <button type="button" onClick={onFechar} style={btnFechar}>×</button>
        </div>

        {/* LISTA */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: 8, marginBottom: 14, maxHeight: 220, overflowY: "auto",
        }}>
          {carregando ? (
            <div style={{ padding: 14, color: C.muted, fontSize: 12, textAlign: "center" }}>
              Carregando...
            </div>
          ) : formas.length === 0 ? (
            <div style={{ padding: 14, color: C.muted, fontSize: 12, textAlign: "center" }}>
              Nenhuma forma cadastrada ainda. Use o formulário abaixo.
            </div>
          ) : formas.map(f => (
            <div key={f.id} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 10px", borderRadius: 6,
              background: editando?.id === f.id ? C.accent + "22" : "transparent",
              opacity: f.ativo ? 1 : 0.55,
            }}>
              <div style={{ fontSize: 18, width: 24, textAlign: "center" }}>{f.icone || "•"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>
                  {f.nome}
                  {!f.ativo && (
                    <span style={{
                      marginLeft: 8, fontSize: 9, padding: "1px 6px", borderRadius: 4,
                      background: C.muted + "22", color: C.muted, fontWeight: 700,
                    }}>INATIVA</span>
                  )}
                </div>
                <div style={{ color: C.muted, fontSize: 10, marginTop: 1 }}>
                  base: {LABEL_BASE[f.baseFormaPagamento] || f.baseFormaPagamento} · ordem {f.ordem}
                </div>
              </div>
              <button type="button" onClick={() => iniciarEdicao(f)}
                style={{ ...btnAcao(C.accent), fontSize: 10 }}>Editar</button>
              <button type="button" onClick={() => alternarAtivo(f)}
                style={{ ...btnAcao(f.ativo ? C.yellow : C.green), fontSize: 10 }}>
                {f.ativo ? "Desativar" : "Ativar"}
              </button>
              {podeExcluir && (
                <button type="button" onClick={() => remover(f)}
                  style={{ ...btnAcao(C.red), fontSize: 10 }}>×</button>
              )}
            </div>
          ))}
        </div>

        {/* FORMULARIO */}
        <form onSubmit={salvar} style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: 14,
        }}>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, marginBottom: 10 }}>
            {editando ? "EDITAR FORMA" : "NOVA FORMA"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 8 }}>
            <Campo label="Ícone">
              <input value={icone} onChange={e => setIcone(e.target.value)}
                placeholder="🍽" maxLength={4} style={{ ...inputStyle, textAlign: "center" }} />
            </Campo>
            <Campo label="Nome *">
              <input value={nome} onChange={e => setNome(e.target.value)}
                required placeholder="Ex: Vale-Refeição"
                style={inputStyle} />
            </Campo>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 8 }}>
            <Campo label="Forma base *">
              <select value={base} onChange={e => setBase(e.target.value)} style={inputStyle}>
                {FORMAS_PAGAMENTO.map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Ordem">
              <input type="number" value={ordem} onChange={e => setOrdem(e.target.value)}
                style={inputStyle} />
            </Campo>
          </div>

          {erro && (
            <div style={{
              padding: "8px 10px", borderRadius: 6,
              background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 12,
              marginBottom: 8,
            }}>{erro}</div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {editando && (
              <button type="button" onClick={limparForm}
                disabled={salvando} style={btnSecundario}>Cancelar edição</button>
            )}
            <button type="submit" disabled={salvando} style={btnPrimario}>
              {salvando ? "Salvando..." : (editando ? "Salvar" : "+ Adicionar")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const LABEL_BASE: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "PIX",
  CARTAO_DEBITO: "Débito",
  CARTAO_CREDITO: "Crédito",
  BOLETO: "Boleto",
  CREDIARIO: "Crediário",
};

const inputStyle: CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 13,
  outline: "none", boxSizing: "border-box", width: "100%",
};

const modalOverlay: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 20, zIndex: 100,
};

const modalCard: CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
  width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", padding: 24,
};

const modalHeader: CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  marginBottom: 18,
};

const btnFechar: CSSProperties = {
  background: "transparent", border: "none", color: C.muted,
  fontSize: 22, cursor: "pointer",
};

const btnSecundario: CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`, color: C.text,
  borderRadius: 8, padding: "10px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer",
};

const btnPrimario: CSSProperties = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: C.white, border: "none", borderRadius: 8,
  padding: "10px 22px", fontWeight: 700, fontSize: 13, cursor: "pointer",
};

function btnAcao(cor: string): CSSProperties {
  return {
    background: cor + "22", border: `1px solid ${cor}55`, color: cor,
    borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600,
    cursor: "pointer", whiteSpace: "nowrap",
  };
}

function badgeMini(cor: string): CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 3,
    padding: "1px 7px", borderRadius: 5,
    background: cor + "22", border: `1px solid ${cor}55`, color: cor,
    fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
  };
}
