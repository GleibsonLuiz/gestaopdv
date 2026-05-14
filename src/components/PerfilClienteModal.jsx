import { useEffect, useState, useCallback } from "react";
import { C } from "../lib/theme.js";
import { api } from "../lib/api.js";
import BotoesContatoCliente from "./BotoesContatoCliente.jsx";

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
};

const fmtDataHora = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const STATUS_VENDA = {
  CONCLUIDA: { label: "Concluída", cor: C.green },
  CANCELADA: { label: "Cancelada", cor: C.red },
  PENDENTE: { label: "Pendente", cor: C.yellow },
  EM_EDICAO: { label: "Em edição", cor: C.muted },
};

const STATUS_CONTA = {
  PENDENTE: { label: "Pendente", cor: C.yellow },
  PAGA: { label: "Recebida", cor: C.green },
  ATRASADA: { label: "Atrasada", cor: C.red },
  CANCELADA: { label: "Cancelada", cor: C.muted },
};

const STATUS_ORC = {
  RASCUNHO: { label: "Rascunho", cor: C.muted },
  AGUARDANDO_APROVACAO: { label: "Aguardando", cor: C.yellow },
  APROVADO: { label: "Aprovado", cor: C.accent },
  ENTREGUE: { label: "Entregue", cor: C.green },
  REJEITADO: { label: "Rejeitado", cor: C.red },
  CANCELADO: { label: "Cancelado", cor: C.muted },
};

const FORMA_LABEL = {
  DINHEIRO: "Dinheiro",
  CARTAO_CREDITO: "Cartão Crédito",
  CARTAO_DEBITO: "Cartão Débito",
  PIX: "PIX",
  BOLETO: "Boleto",
  CREDIARIO: "Crediário",
};

const TIPO_INTERACAO = {
  LIGACAO:  { label: "Ligação",   icon: "📞", cor: C.accent },
  WHATSAPP: { label: "WhatsApp",  icon: "💬", cor: C.green },
  VISITA:   { label: "Visita",    icon: "🏠", cor: C.purple },
  EMAIL:    { label: "E-mail",    icon: "✉️", cor: C.yellow },
  REUNIAO:  { label: "Reunião",   icon: "👥", cor: "#f97316" },
  ANOTACAO: { label: "Anotação",  icon: "📝", cor: C.muted },
};

const ABAS = [
  { id: "resumo",      label: "Resumo" },
  { id: "interacoes",  label: "Interações" },
  { id: "compras",     label: "Compras" },
  { id: "financeiro",  label: "Financeiro" },
  { id: "orcamentos",  label: "Orçamentos" },
];

function Pill({ status, mapa }) {
  const info = mapa[status] || { label: status, cor: C.muted };
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      background: `${info.cor}22`,
      color: info.cor,
      border: `1px solid ${info.cor}44`,
      whiteSpace: "nowrap",
    }}>
      {info.label}
    </span>
  );
}

function KpiCard({ label, valor, sub, cor }) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: "16px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      flex: 1,
      minWidth: 140,
    }}>
      <span style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
        {label}
      </span>
      <span style={{ fontSize: 22, fontWeight: 700, color: cor || C.text, lineHeight: 1.2 }}>
        {valor}
      </span>
      {sub && <span style={{ fontSize: 11, color: C.muted }}>{sub}</span>}
    </div>
  );
}

function TabelaVazia({ msg }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: 13 }}>
      {msg}
    </div>
  );
}

// ============ ABAS ============

function AbaInteracoes({ clienteId, user, onContadorChange }) {
  const [interacoes, setInteracoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ tipo: "ANOTACAO", descricao: "", data: "" });
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const d = await api.listarInteracoes(clienteId);
      setInteracoes(d);
      onContadorChange?.(d.length);
    } catch {}
    finally { setCarregando(false); }
  }, [clienteId, onContadorChange]);

  useEffect(() => { carregar(); }, [carregar]);

  async function registrar(e) {
    e.preventDefault();
    if (!form.descricao.trim()) { setErro("Descrição é obrigatória"); return; }
    setSalvando(true);
    setErro("");
    try {
      await api.criarInteracao(clienteId, {
        tipo: form.tipo,
        descricao: form.descricao.trim(),
        data: form.data || undefined,
      });
      setForm({ tipo: "ANOTACAO", descricao: "", data: "" });
      await carregar();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function deletar(id) {
    if (!confirm("Excluir esta interação?")) return;
    try {
      await api.excluirInteracao(clienteId, id);
      setInteracoes(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      alert(err.message);
    }
  }

  const podeExcluir = user?.role === "ADMIN";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Formulário de registro rápido */}
      <form onSubmit={registrar} style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}>
        <p style={{ margin: 0, fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Registrar contato
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            value={form.tipo}
            onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
            style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7,
              padding: "7px 10px", color: C.text, fontSize: 13, cursor: "pointer",
            }}
          >
            {Object.entries(TIPO_INTERACAO).map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v.label}</option>
            ))}
          </select>
          <input
            type="date"
            value={form.data}
            onChange={e => setForm(p => ({ ...p, data: e.target.value }))}
            style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7,
              padding: "7px 10px", color: C.text, fontSize: 13,
            }}
            title="Deixe em branco para usar a data/hora atual"
          />
        </div>
        <textarea
          value={form.descricao}
          onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
          placeholder="Descreva o contato, resultado da ligação, compromisso agendado..."
          rows={3}
          style={{
            background: C.surface, border: `1px solid ${erro ? C.red : C.border}`,
            borderRadius: 7, padding: "8px 10px", color: C.text, fontSize: 13,
            resize: "vertical", outline: "none", fontFamily: "inherit",
          }}
        />
        {erro && <p style={{ margin: 0, fontSize: 12, color: C.red }}>{erro}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            disabled={salvando}
            style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              color: C.white, border: "none", borderRadius: 8,
              padding: "7px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer",
              opacity: salvando ? 0.7 : 1,
            }}
          >
            {salvando ? "Salvando..." : "Registrar"}
          </button>
        </div>
      </form>

      {/* Timeline */}
      {carregando ? (
        <div style={{ textAlign: "center", padding: "30px 0", color: C.muted, fontSize: 13 }}>
          Carregando interações...
        </div>
      ) : interacoes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 0", color: C.muted, fontSize: 13 }}>
          Nenhuma interação registrada. Use o formulário acima para começar.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0, position: "relative" }}>
          {/* linha vertical */}
          <div style={{
            position: "absolute", left: 19, top: 0, bottom: 0,
            width: 2, background: `${C.border}`, zIndex: 0,
          }} />
          {interacoes.map((int) => {
            const info = TIPO_INTERACAO[int.tipo] || TIPO_INTERACAO.ANOTACAO;
            return (
              <div key={int.id} style={{
                display: "flex", gap: 14, paddingBottom: 20, position: "relative", zIndex: 1,
              }}>
                {/* bolinha */}
                <div style={{
                  width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                  background: `${info.cor}22`,
                  border: `2px solid ${info.cor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, lineHeight: 1,
                }}>
                  {info.icon}
                </div>
                {/* conteúdo */}
                <div style={{
                  flex: 1, background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: "10px 14px",
                  display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: info.cor }}>
                        {info.label}
                      </span>
                      <span style={{ fontSize: 11, color: C.muted }}>
                        {new Date(int.data).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </span>
                      <span style={{ fontSize: 11, color: C.muted }}>
                        · {int.user?.nome || "—"}
                      </span>
                    </div>
                    {podeExcluir && (
                      <button
                        onClick={() => deletar(int.id)}
                        title="Excluir interação"
                        style={{
                          background: "none", border: "none", color: C.muted,
                          cursor: "pointer", fontSize: 13, padding: "2px 4px",
                          borderRadius: 4, lineHeight: 1,
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = C.red}
                        onMouseLeave={e => e.currentTarget.style.color = C.muted}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {int.descricao}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AbaResumo({ kpis, cliente }) {
  const diasDesdeUltimaCompra = kpis.ultimaCompra
    ? Math.floor((Date.now() - new Date(kpis.ultimaCompra)) / 86400000)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <KpiCard
          label="Total gasto"
          valor={fmtBRL(kpis.totalGasto)}
          cor={C.green}
        />
        <KpiCard
          label="Compras"
          valor={kpis.qtdCompras}
          sub={kpis.ultimaCompra ? `Última há ${diasDesdeUltimaCompra} dia(s)` : "Nenhuma compra"}
        />
        <KpiCard
          label="Ticket médio"
          valor={fmtBRL(kpis.ticketMedio)}
        />
        <KpiCard
          label="Inadimplência"
          valor={fmtBRL(kpis.valorInadimplente)}
          cor={kpis.valorInadimplente > 0 ? C.red : C.green}
          sub={kpis.valorInadimplente > 0 ? "Contas pendentes/atrasadas" : "Sem pendências"}
        />
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 20px" }}>
        <p style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, margin: "0 0 12px" }}>
          Dados cadastrais
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px 24px" }}>
          {[
            ["CPF/CNPJ", cliente.cpfCnpj],
            ["E-mail", cliente.email],
            ["Telefone", cliente.telefone],
            ["Cidade/UF", cliente.cidade ? `${cliente.cidade}${cliente.estado ? ` / ${cliente.estado}` : ""}` : null],
            ["CEP", cliente.cep],
            ["Endereço", cliente.endereco],
            ["Observações", cliente.observacoes],
          ].map(([label, val]) => val ? (
            <div key={label}>
              <span style={{ display: "block", fontSize: 10, color: C.muted, fontWeight: 600, textTransform: "uppercase" }}>{label}</span>
              <span style={{ fontSize: 13, color: C.text }}>{val}</span>
            </div>
          ) : null)}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: C.muted }}>
          Cliente desde {fmtData(cliente.createdAt)}
          {!cliente.ativo && (
            <span style={{ marginLeft: 8, color: C.red, fontWeight: 600 }}>• INATIVO</span>
          )}
        </div>
      </div>
    </div>
  );
}

function AbaCompras({ vendas }) {
  const concluidas = vendas.filter(v => v.status !== "CANCELADA");
  if (vendas.length === 0) return <TabelaVazia msg="Nenhuma venda registrada para este cliente." />;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {["#", "Data", "Itens", "Forma", "Total", "Status"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: C.muted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vendas.map((v, i) => (
            <tr key={v.id} style={{ borderBottom: `1px solid ${C.border}22`, background: i % 2 === 0 ? "transparent" : `${C.surface}55` }}>
              <td style={{ padding: "8px 10px", color: C.muted, fontWeight: 600 }}>#{v.numero}</td>
              <td style={{ padding: "8px 10px", color: C.text, whiteSpace: "nowrap" }}>{fmtDataHora(v.createdAt)}</td>
              <td style={{ padding: "8px 10px", color: C.muted, maxWidth: 200 }}>
                <span title={v.itens.map(it => `${it.quantidade}× ${it.produto.nome}`).join(", ")}>
                  {v.itens.length === 0 ? "—" : v.itens.length === 1
                    ? `${v.itens[0].quantidade}× ${v.itens[0].produto.nome}`
                    : `${v.itens.length} itens`}
                </span>
              </td>
              <td style={{ padding: "8px 10px", color: C.text }}>{FORMA_LABEL[v.formaPagamento] || v.formaPagamento}</td>
              <td style={{ padding: "8px 10px", color: C.green, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtBRL(v.total)}</td>
              <td style={{ padding: "8px 10px" }}><Pill status={v.status} mapa={STATUS_VENDA} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {vendas.length >= 50 && (
        <p style={{ textAlign: "center", fontSize: 11, color: C.muted, marginTop: 8 }}>
          Exibindo as 50 vendas mais recentes.
        </p>
      )}
    </div>
  );
}

function AbaFinanceiro({ contas }) {
  if (contas.length === 0) return <TabelaVazia msg="Nenhuma conta a receber registrada." />;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {["Descrição", "Parcela", "Valor", "Vencimento", "Recebimento", "Status"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: C.muted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contas.map((c, i) => (
            <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}22`, background: i % 2 === 0 ? "transparent" : `${C.surface}55` }}>
              <td style={{ padding: "8px 10px", color: C.text, maxWidth: 220 }}>{c.descricao}</td>
              <td style={{ padding: "8px 10px", color: C.muted, whiteSpace: "nowrap" }}>
                {c.tipoRecorrencia === "PARCELADA" && c.parcelaAtual
                  ? `${c.parcelaAtual}/${c.parcelaTotal}`
                  : "—"}
              </td>
              <td style={{ padding: "8px 10px", color: C.text, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtBRL(c.valor)}</td>
              <td style={{ padding: "8px 10px", color: c.status === "ATRASADA" ? C.red : C.text, whiteSpace: "nowrap" }}>
                {fmtData(c.vencimento)}
              </td>
              <td style={{ padding: "8px 10px", color: C.muted, whiteSpace: "nowrap" }}>{fmtData(c.recebimento)}</td>
              <td style={{ padding: "8px 10px" }}><Pill status={c.status} mapa={STATUS_CONTA} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {contas.length >= 50 && (
        <p style={{ textAlign: "center", fontSize: 11, color: C.muted, marginTop: 8 }}>
          Exibindo as 50 contas mais recentes.
        </p>
      )}
    </div>
  );
}

function AbaOrcamentos({ orcamentos }) {
  if (orcamentos.length === 0) return <TabelaVazia msg="Nenhum orçamento registrado para este cliente." />;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {["#", "Tipo", "Data", "Responsável", "Total", "Status"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: C.muted, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orcamentos.map((o, i) => (
            <tr key={o.id} style={{ borderBottom: `1px solid ${C.border}22`, background: i % 2 === 0 ? "transparent" : `${C.surface}55` }}>
              <td style={{ padding: "8px 10px", color: C.muted, fontWeight: 600 }}>#{o.numero}</td>
              <td style={{ padding: "8px 10px", color: C.text }}>
                {o.tipo === "ORDEM_SERVICO" ? "O.S." : "Orçamento"}
              </td>
              <td style={{ padding: "8px 10px", color: C.text, whiteSpace: "nowrap" }}>{fmtData(o.createdAt)}</td>
              <td style={{ padding: "8px 10px", color: C.muted }}>
                {o.responsavel?.nome || o.user?.nome || "—"}
              </td>
              <td style={{ padding: "8px 10px", color: C.text, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtBRL(o.total)}</td>
              <td style={{ padding: "8px 10px" }}><Pill status={o.status} mapa={STATUS_ORC} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {orcamentos.length >= 30 && (
        <p style={{ textAlign: "center", fontSize: 11, color: C.muted, marginTop: 8 }}>
          Exibindo os 30 orçamentos mais recentes.
        </p>
      )}
    </div>
  );
}

// ============ MODAL PRINCIPAL ============

export default function PerfilClienteModal({ clienteId, onFechar, user }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState("resumo");
  const [templates, setTemplates] = useState([]);

  const carregar = useCallback(async () => {
    if (!clienteId) return;
    setCarregando(true);
    setErro("");
    try {
      const d = await api.perfilCliente(clienteId);
      setDados(d);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [clienteId]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    api.listarTemplates({ ativo: "true" }).then(setTemplates).catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar]);

  const [qtdInteracoes, setQtdInteracoes] = useState(null);

  const abasComContador = ABAS.map(a => {
    let count = null;
    if (dados) {
      if (a.id === "compras") count = dados.vendas.length;
      if (a.id === "financeiro") count = dados.contasReceber.length;
      if (a.id === "orcamentos") count = dados.orcamentos.length;
    }
    if (a.id === "interacoes" && qtdInteracoes !== null) count = qtdInteracoes;
    return { ...a, count };
  });

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.65)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        width: "100%",
        maxWidth: 820,
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px 16px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
              Perfil do cliente
            </p>
            <h2 style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {dados?.cliente?.nome || "Carregando..."}
            </h2>
            {dados?.cliente && (
              <p style={{ margin: "2px 0 0", fontSize: 12, color: C.muted }}>
                {dados.cliente.cpfCnpj || "Sem CPF/CNPJ"}
                {dados.cliente.email && ` · ${dados.cliente.email}`}
                {dados.cliente.telefone && ` · ${dados.cliente.telefone}`}
              </p>
            )}
            {dados?.cliente?.tags && dados.cliente.tags.length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                {dados.cliente.tags.map((t) => (
                  <span key={t.id} style={{
                    background: t.cor + "22", color: t.cor,
                    padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                    border: `1px solid ${t.cor}55`,
                  }}>{t.nome}</span>
                ))}
              </div>
            )}
            {dados?.cliente && (dados.cliente.telefone || dados.cliente.email) && (
              <div style={{ marginTop: 10 }}>
                <BotoesContatoCliente
                  cliente={dados.cliente}
                  templates={templates}
                  kpis={dados.kpis}
                  variant="completo"
                  tamanho="md"
                />
              </div>
            )}
          </div>
          <button
            onClick={onFechar}
            style={{
              background: "none", border: "none", color: C.muted,
              cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 4, flexShrink: 0,
            }}
            title="Fechar (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex",
          gap: 2,
          padding: "0 24px",
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
          overflowX: "auto",
        }}>
          {abasComContador.map(a => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              style={{
                background: "none",
                border: "none",
                borderBottom: aba === a.id ? `2px solid ${C.accent}` : "2px solid transparent",
                color: aba === a.id ? C.accent : C.muted,
                cursor: "pointer",
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: aba === a.id ? 600 : 500,
                whiteSpace: "nowrap",
                transition: "color .15s, border-color .15s",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {a.label}
              {a.count !== null && (
                <span style={{
                  background: aba === a.id ? `${C.accent}33` : `${C.border}`,
                  color: aba === a.id ? C.accent : C.muted,
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 6px",
                  lineHeight: 1.6,
                }}>
                  {a.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
          {carregando ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.muted }}>
              Carregando perfil...
            </div>
          ) : erro ? (
            <div style={{ color: C.red, fontSize: 13, textAlign: "center", padding: "40px 0" }}>
              {erro}
            </div>
          ) : dados ? (
            <>
              {aba === "resumo" && <AbaResumo kpis={dados.kpis} cliente={dados.cliente} />}
              {aba === "interacoes" && (
                <AbaInteracoes
                  clienteId={clienteId}
                  user={user}
                  onContadorChange={setQtdInteracoes}
                />
              )}
              {aba === "compras" && <AbaCompras vendas={dados.vendas} />}
              {aba === "financeiro" && <AbaFinanceiro contas={dados.contasReceber} />}
              {aba === "orcamentos" && <AbaOrcamentos orcamentos={dados.orcamentos} />}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div style={{
          padding: "10px 24px",
          borderTop: `1px solid ${C.border}`,
          display: "flex",
          justifyContent: "flex-end",
          flexShrink: 0,
        }}>
          <button
            onClick={onFechar}
            style={{
              padding: "7px 20px",
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              color: C.text,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
