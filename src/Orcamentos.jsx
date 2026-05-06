import { useEffect, useState, useCallback, useMemo } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";

// ===================== HELPERS =====================

const fmtBRL = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

// Multiplicadores das tabelas de preco. AV = a vista (sem ajuste);
// PZ = a prazo (acrescimo); AT = atacado (desconto). Estes valores sao
// fixos no front por enquanto — quando virar configuracao, expor como
// dados do backend.
const FATOR_TABELA = { AV: 1.0, PZ: 1.10, AT: 0.85 };

const STATUS_LABEL = {
  RASCUNHO: "Rascunho",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  REJEITADO: "Rejeitado",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

function corStatus(status) {
  switch (status) {
    case "RASCUNHO": return C.muted;
    case "AGUARDANDO_APROVACAO": return C.yellow;
    case "APROVADO": return C.accent;
    case "ENTREGUE": return C.green;
    case "REJEITADO": return C.red;
    case "CANCELADO": return C.red;
    default: return C.text;
  }
}

const FORMAS_PAGAMENTO_LABEL = {
  DINHEIRO: "Dinheiro",
  CARTAO_CREDITO: "Cartão de Crédito",
  CARTAO_DEBITO: "Cartão de Débito",
  PIX: "PIX",
  BOLETO: "Boleto",
  CREDIARIO: "Crediário",
};

// Calcula totais a partir dos itens (front, igual ao backend).
function calcularItem(it) {
  const qtd = parseFloat(String(it.quantidade).replace(",", ".")) || 0;
  const valor = parseFloat(String(it.valorUnitario).replace(",", ".")) || 0;
  const largura = parseFloat(String(it.largura).replace(",", ".")) || 0;
  const altura = parseFloat(String(it.altura).replace(",", ".")) || 0;
  const acerto = parseFloat(String(it.acertoTotal).replace(",", ".")) || 0;
  let totalEm = 0;
  let subtotal;
  if (largura > 0 && altura > 0) {
    totalEm = largura * altura;
    subtotal = totalEm * valor * qtd + acerto;
  } else {
    subtotal = qtd * valor + acerto;
  }
  return { totalEm, subtotal };
}

// ===================== TELA PRINCIPAL =====================

export default function Orcamentos({ user }) {
  const [orcamentos, setOrcamentos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [busca, setBusca] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [clientes, setClientes] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);

  const [novoAberto, setNovoAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [mensagem, setMensagem] = useState("");

  const podeCriar = user.role === "ADMIN" || user.role === "GERENTE" || user.role === "VENDEDOR";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.listarOrcamentos({
        status: filtroStatus, tipo: filtroTipo, search: busca,
        dataInicio, dataFim,
      });
      setOrcamentos(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [filtroStatus, filtroTipo, busca, dataInicio, dataFim]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    api.listarClientes({ ativo: "true" }).then(setClientes).catch(() => {});
    api.listarProdutos({ ativo: "true" }).then(setProdutos).catch(() => {});
    if (user.role === "ADMIN") {
      api.listarFuncionarios({ ativo: "true" }).then(setFuncionarios).catch(() => {});
    }
  }, [user.role]);

  function flash(t) {
    setMensagem(t);
    setTimeout(() => setMensagem(""), 3500);
  }

  async function abrirDetalhe(id) {
    try {
      const o = await api.obterOrcamento(id);
      setDetalhe(o);
    } catch (err) {
      alert(err.message);
    }
  }

  async function abrirEdicao(id) {
    try {
      const o = await api.obterOrcamento(id);
      setEditando(o);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Buscar por número, cliente ou contato…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ ...inputCompacto, flex: "1 1 240px", minWidth: 200 }}
        />
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={inputCompacto}>
          <option value="">Todos os tipos</option>
          <option value="ORCAMENTO">Orçamento</option>
          <option value="ORDEM_SERVICO">Ordem de Serviço</option>
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={inputCompacto}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={inputCompacto} />
        <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={inputCompacto} />
        {(busca || filtroStatus || filtroTipo || dataInicio || dataFim) && (
          <button onClick={() => {
            setBusca(""); setFiltroStatus(""); setFiltroTipo("");
            setDataInicio(""); setDataFim("");
          }} style={{
            background: C.surface, border: `1px solid ${C.border}`, color: C.muted,
            borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer",
          }}>Limpar filtros</button>
        )}
        {podeCriar && (
          <button onClick={() => setNovoAberto(true)} style={{
            marginLeft: "auto",
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, border: "none", borderRadius: 8,
            padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>
            + Novo Orçamento
          </button>
        )}
      </div>

      {mensagem && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 8,
          background: C.green + "22", border: `1px solid ${C.green}55`, color: C.green, fontSize: 13,
        }}>{mensagem}</div>
      )}
      {erro && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 8,
          background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
        }}>{erro}</div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "90px 110px 1.6fr 130px 90px 130px 130px",
          padding: "12px 16px", background: C.surface,
          borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700,
          color: C.muted, textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          <div>Nº</div>
          <div>Tipo</div>
          <div>Cliente</div>
          <div>Status</div>
          <div style={{ textAlign: "right" }}>Itens</div>
          <div style={{ textAlign: "right" }}>Total</div>
          <div style={{ textAlign: "right" }}>Ações</div>
        </div>

        {carregando ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Carregando...</div>
        ) : orcamentos.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontSize: 13 }}>
            Nenhum orçamento encontrado.
          </div>
        ) : orcamentos.map(o => {
          const cor = corStatus(o.status);
          const nomeCliente = o.cliente?.nome || o.descricaoCliente || "—";
          return (
            <div key={o.id} style={{
              display: "grid", gridTemplateColumns: "90px 110px 1.6fr 130px 90px 130px 130px",
              padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
              alignItems: "center", fontSize: 13,
            }}>
              <div style={{ color: C.white, fontFamily: "monospace", fontWeight: 700 }}>#{o.numero}</div>
              <div>
                <span style={{
                  background: o.tipo === "ORDEM_SERVICO" ? C.purple + "22" : C.accent + "22",
                  border: `1px solid ${(o.tipo === "ORDEM_SERVICO" ? C.purple : C.accent)}55`,
                  color: o.tipo === "ORDEM_SERVICO" ? C.purple : C.accent,
                  fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
                  textTransform: "uppercase", letterSpacing: 0.4,
                }}>{o.tipo === "ORDEM_SERVICO" ? "O.S." : "Orçam."}</span>
              </div>
              <div>
                <div style={{ color: C.white, fontWeight: 600 }}>{nomeCliente}</div>
                <div style={{ color: C.muted, fontSize: 11 }}>{fmtData(o.createdAt)}</div>
              </div>
              <div>
                <span style={{
                  background: cor + "22", border: `1px solid ${cor}55`, color: cor,
                  fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
                  textTransform: "uppercase", letterSpacing: 0.4,
                }}>{STATUS_LABEL[o.status]}</span>
              </div>
              <div style={{ textAlign: "right", color: C.text }}>{o._count?.itens ?? "—"}</div>
              <div style={{ textAlign: "right", color: C.green, fontWeight: 700, fontSize: 14 }}>
                {fmtBRL(o.total)}
              </div>
              <div style={{ textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => abrirDetalhe(o.id)} style={btnIcone(C.accent)}>Ver</button>
                {(o.status === "RASCUNHO" || o.status === "AGUARDANDO_APROVACAO") && podeCriar && (
                  <button onClick={() => abrirEdicao(o.id)} style={btnIcone(C.yellow)}>Editar</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {novoAberto && (
        <FormularioOrcamentoModal
          modo="criar"
          clientes={clientes}
          produtos={produtos}
          funcionarios={funcionarios}
          onCancelar={() => setNovoAberto(false)}
          onSalvar={(o) => {
            setNovoAberto(false);
            flash(`${o.tipo === "ORDEM_SERVICO" ? "O.S." : "Orçamento"} #${o.numero} criado — total ${fmtBRL(o.total)}`);
            carregar();
          }}
        />
      )}

      {editando && (
        <FormularioOrcamentoModal
          modo="editar"
          orcamento={editando}
          clientes={clientes}
          produtos={produtos}
          funcionarios={funcionarios}
          onCancelar={() => setEditando(null)}
          onSalvar={(o) => {
            setEditando(null);
            flash(`#${o.numero} atualizado — total ${fmtBRL(o.total)}`);
            carregar();
          }}
        />
      )}

      {detalhe && (
        <DetalheOrcamentoModal
          orcamento={detalhe}
          podeAgir={podeCriar}
          podeExcluir={user.role === "ADMIN" || user.role === "GERENTE"}
          onFechar={() => setDetalhe(null)}
          onAtualizar={(msg) => {
            api.obterOrcamento(detalhe.id).then(setDetalhe).catch(() => setDetalhe(null));
            carregar();
            if (msg) flash(msg);
          }}
          onExcluir={(msg) => {
            setDetalhe(null);
            carregar();
            flash(msg);
          }}
        />
      )}
    </div>
  );
}

// ===================== MODAL: FORMULARIO (CRIAR / EDITAR) =====================

function FormularioOrcamentoModal({ modo, orcamento, clientes, produtos, funcionarios, onCancelar, onSalvar }) {
  const editando = modo === "editar";

  const [tipo, setTipo] = useState(orcamento?.tipo || "ORCAMENTO");
  const [tabelaPreco, setTabelaPreco] = useState(orcamento?.tabelaPreco || "AV");
  const [via, setVia] = useState(orcamento?.via || 1);

  const [clienteId, setClienteId] = useState(orcamento?.clienteId || "");
  const [descricaoCliente, setDescricaoCliente] = useState(orcamento?.descricaoCliente || "");
  const [contato, setContato] = useState(orcamento?.contato || "");
  const [telefone, setTelefone] = useState(orcamento?.telefone || "");

  const [responsavelId, setResponsavelId] = useState(orcamento?.responsavelId || "");
  const [formaCondicaoPagamento, setFormaCondicaoPagamento] = useState(orcamento?.formaCondicaoPagamento || "");

  const [observacoes, setObservacoes] = useState(orcamento?.observacoes || "");
  const [imprimirObservacoes, setImprimirObservacoes] = useState(orcamento?.imprimirObservacoes ?? true);
  const [rodape, setRodape] = useState(orcamento?.rodape || "Sempre guarde esse comprovante como sua garantia de entrega!");
  const [mostrarValorMetro, setMostrarValorMetro] = useState(orcamento?.mostrarValorMetro || false);
  const [imprimirValores, setImprimirValores] = useState(orcamento?.imprimirValores ?? true);

  const [deslocamento, setDeslocamento] = useState(orcamento?.deslocamento != null ? String(orcamento.deslocamento) : "0");
  const [desconto, setDesconto] = useState(orcamento?.desconto != null ? String(orcamento.desconto) : "0");

  const [itens, setItens] = useState(() => {
    if (orcamento?.itens?.length) {
      return orcamento.itens.map(it => ({
        produtoId: it.produtoId,
        descricao: it.descricao || "",
        quantidade: String(it.quantidade ?? 1),
        valorUnitario: String(it.valorUnitario ?? 0),
        largura: it.largura != null ? String(it.largura) : "",
        altura: it.altura != null ? String(it.altura) : "",
        acertoTotal: it.acertoTotal != null ? String(it.acertoTotal) : "0",
        formato: it.formato || "",
        vias: it.vias || "",
        cores: it.cores || "",
        complemento: it.complemento || "",
      }));
    }
    return [];
  });

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const totais = useMemo(() => {
    let valorProdutos = 0;
    let valorServicos = 0;
    for (const it of itens) {
      const { subtotal } = calcularItem(it);
      const prod = produtos.find(p => p.id === it.produtoId);
      if (prod?.tipoItem === "SERVICO") valorServicos += subtotal;
      else valorProdutos += subtotal;
    }
    const desl = parseFloat(String(deslocamento).replace(",", ".")) || 0;
    const desc = parseFloat(String(desconto).replace(",", ".")) || 0;
    const total = Math.max(0, valorProdutos + valorServicos + desl - desc);
    return { valorProdutos, valorServicos, total };
  }, [itens, produtos, deslocamento, desconto]);

  function adicionarItem() {
    setItens([...itens, {
      produtoId: "", descricao: "", quantidade: "1",
      valorUnitario: "", largura: "", altura: "",
      acertoTotal: "0", formato: "", vias: "", cores: "", complemento: "",
    }]);
  }

  function removerItem(idx) {
    setItens(itens.filter((_, i) => i !== idx));
  }

  function atualizarItem(idx, campo, valor) {
    const novos = [...itens];
    novos[idx] = { ...novos[idx], [campo]: valor };

    if (campo === "produtoId" && valor) {
      const p = produtos.find(x => x.id === valor);
      if (p) {
        // Aplica preco do produto ja com a tabela escolhida.
        const fator = FATOR_TABELA[tabelaPreco] ?? 1;
        const precoBase = Number(p.precoVenda) * fator;
        if (!novos[idx].valorUnitario || parseFloat(novos[idx].valorUnitario) === 0) {
          novos[idx].valorUnitario = precoBase.toFixed(2);
        }
        if (!novos[idx].descricao) {
          novos[idx].descricao = p.nome;
        }
      }
    }
    setItens(novos);
  }

  // Quando muda a tabela de preco, recalcula o valorUnitario dos itens
  // que ainda batem com o produto base (aproximadamente). Nao mexe em
  // itens onde o usuario ja editou o valor manualmente.
  function aplicarTabelaNosItens(novaTabela) {
    setTabelaPreco(novaTabela);
    const fatorNovo = FATOR_TABELA[novaTabela] ?? 1;
    const fatorAntigo = FATOR_TABELA[tabelaPreco] ?? 1;
    setItens(itens.map(it => {
      if (!it.produtoId) return it;
      const p = produtos.find(x => x.id === it.produtoId);
      if (!p) return it;
      const valorAtual = parseFloat(String(it.valorUnitario).replace(",", ".")) || 0;
      const valorEsperadoAntigo = Number(p.precoVenda) * fatorAntigo;
      // Se o valor atual ainda condiz com a tabela antiga (tolerancia 1c),
      // substitui pelo novo. Caso contrario, o usuario customizou - mantem.
      if (Math.abs(valorAtual - valorEsperadoAntigo) < 0.02) {
        return { ...it, valorUnitario: (Number(p.precoVenda) * fatorNovo).toFixed(2) };
      }
      return it;
    }));
  }

  function preencherDoCliente(id) {
    setClienteId(id);
    if (!id) return;
    const c = clientes.find(x => x.id === id);
    if (c) {
      if (!descricaoCliente) setDescricaoCliente(c.nome || "");
      if (!telefone && c.telefone) setTelefone(c.telefone);
    }
  }

  async function salvar(e) {
    e.preventDefault();
    setErro("");

    if (!descricaoCliente.trim() && !clienteId) {
      setErro("Informe o cliente (selecione um cadastrado ou digite a descrição)");
      return;
    }
    if (itens.length === 0) {
      setErro("Adicione ao menos um item");
      return;
    }
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      if (!it.produtoId) { setErro(`Item ${i + 1}: selecione o produto`); return; }
      const q = parseFloat(String(it.quantidade).replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) { setErro(`Item ${i + 1}: quantidade inválida`); return; }
      const v = parseFloat(String(it.valorUnitario).replace(",", "."));
      if (!Number.isFinite(v) || v < 0) { setErro(`Item ${i + 1}: valor unitário inválido`); return; }
    }

    setSalvando(true);
    try {
      const payload = {
        tipo, tabelaPreco, via,
        clienteId: clienteId || null,
        descricaoCliente, contato, telefone,
        observacoes, imprimirObservacoes, rodape,
        mostrarValorMetro, imprimirValores,
        deslocamento, desconto,
        formaCondicaoPagamento,
        responsavelId: responsavelId || null,
        itens: itens.map((it, idx) => ({
          produtoId: it.produtoId,
          descricao: it.descricao,
          quantidade: it.quantidade,
          valorUnitario: it.valorUnitario,
          largura: it.largura || null,
          altura: it.altura || null,
          acertoTotal: it.acertoTotal || 0,
          formato: it.formato,
          vias: it.vias,
          cores: it.cores,
          complemento: it.complemento,
          ordem: idx,
        })),
      };

      const o = editando
        ? await api.atualizarOrcamento(orcamento.id, payload)
        : await api.criarOrcamento(payload);
      onSalvar(o);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={modalOverlay}>
      <form onSubmit={salvar} onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 1100 }}>
        <div style={modalHeader}>
          <div>
            <div style={{ color: C.white, fontWeight: 700, fontSize: 18 }}>
              {editando ? `Editar #${orcamento.numero}` : "Novo Orçamento / O.S."}
            </div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
              {editando ? "Edição livre disponível enquanto o documento estiver em rascunho ou aguardando aprovação." : "Preencha os dados do documento e adicione os itens."}
            </div>
          </div>
          <button type="button" onClick={onCancelar} style={btnFechar}>×</button>
        </div>

        {/* TIPO + TABELA + VIA */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: 14, marginBottom: 14, display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr", gap: 12,
        }}>
          <Campo label="Tipo do documento *">
            <select value={tipo} onChange={e => setTipo(e.target.value)} style={inputStyle}>
              <option value="ORCAMENTO">📝 Orçamento</option>
              <option value="ORDEM_SERVICO">🛠 Ordem de Serviço</option>
            </select>
          </Campo>
          <Campo label="Tabela de preço">
            <select value={tabelaPreco} onChange={e => aplicarTabelaNosItens(e.target.value)} style={inputStyle}>
              <option value="AV">AV — À Vista (preço cheio)</option>
              <option value="PZ">PZ — A Prazo (+10%)</option>
              <option value="AT">AT — Atacado (-15%)</option>
            </select>
          </Campo>
          <Campo label="Via">
            <select value={via} onChange={e => setVia(parseInt(e.target.value, 10))} style={inputStyle}>
              <option value={1}>1ª Via</option>
              <option value={2}>2ª Via</option>
            </select>
          </Campo>
        </div>

        {/* CLIENTE */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: 14, marginBottom: 14,
        }}>
          <div style={secaoTitulo}>👤 Cliente</div>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 160px", gap: 12, marginBottom: 10 }}>
            <Campo label="Cliente cadastrado">
              <select value={clienteId} onChange={e => preencherDoCliente(e.target.value)} style={inputStyle}>
                <option value="">— Sem vínculo (digite manualmente) —</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
            <Campo label="Nome do contato / outros">
              <input value={contato} onChange={e => setContato(e.target.value)} style={inputStyle}
                placeholder="Pessoa que solicitou" maxLength={200} />
            </Campo>
            <Campo label="Telefone">
              <input value={telefone} onChange={e => setTelefone(e.target.value)} style={inputStyle}
                placeholder="(00) 00000-0000" maxLength={50} />
            </Campo>
          </div>
          <Campo label="Descrição do cliente *">
            <input value={descricaoCliente} onChange={e => setDescricaoCliente(e.target.value)} style={inputStyle}
              placeholder="Nome ou razão social a aparecer no documento" maxLength={200} required />
          </Campo>
        </div>

        {/* ITENS */}
        <div style={{ marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: C.white, fontWeight: 700, fontSize: 14 }}>
            📦 Produtos e serviços
          </div>
          <button type="button" onClick={adicionarItem} style={{
            background: C.accent, color: C.white, border: "none", borderRadius: 6,
            padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>+ Adicionar item</button>
        </div>
        <div style={{ color: C.muted, fontSize: 11, marginBottom: 10 }}>
          Itens com largura × altura ({">"} 0) calculam automaticamente o total em m². Caso contrário, usa quantidade × valor.
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
          {itens.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>
              Nenhum item ainda. Clique em "+ Adicionar item".
            </div>
          ) : itens.map((it, idx) => (
            <ItemFormulario
              key={idx}
              indice={idx}
              item={it}
              produtos={produtos}
              tabelaPreco={tabelaPreco}
              onAtualizar={(campo, valor) => atualizarItem(idx, campo, valor)}
              onRemover={() => removerItem(idx)}
            />
          ))}
        </div>

        {/* TOTAIS + AJUSTES */}
        <div style={{
          display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, marginBottom: 14,
        }}>
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14,
          }}>
            <div style={secaoTitulo}>💰 Pagamento e ajustes</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <Campo label="Deslocamento (R$)">
                <input type="number" step="0.01" min="0" value={deslocamento}
                  onChange={e => setDeslocamento(e.target.value)} style={inputStyle} />
              </Campo>
              <Campo label="Desconto (R$)">
                <input type="number" step="0.01" min="0" value={desconto}
                  onChange={e => setDesconto(e.target.value)} style={inputStyle} />
              </Campo>
            </div>
            <Campo label="Formas e condições de pagamento">
              <textarea value={formaCondicaoPagamento} onChange={e => setFormaCondicaoPagamento(e.target.value)}
                rows={2} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                placeholder="Ex.: 50% de entrada via PIX, restante na entrega" maxLength={500} />
            </Campo>
            {funcionarios.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <Campo label="Responsável (técnico/comercial)">
                  <select value={responsavelId} onChange={e => setResponsavelId(e.target.value)} style={inputStyle}>
                    <option value="">— Nenhum —</option>
                    {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </Campo>
              </div>
            )}
          </div>

          <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={secaoTitulo}>🧾 Totais</div>
            <LinhaTotal label="Valor produtos" valor={totais.valorProdutos} />
            <LinhaTotal label="Valor serviços" valor={totais.valorServicos} />
            <LinhaTotal label="Deslocamento" valor={parseFloat(String(deslocamento).replace(",", ".")) || 0} />
            <LinhaTotal label="Desconto" valor={-(parseFloat(String(desconto).replace(",", ".")) || 0)} />
            <div style={{
              borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 10,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ color: C.muted, fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>Total</div>
              <div style={{ color: C.green, fontSize: 22, fontWeight: 800 }}>{fmtBRL(totais.total)}</div>
            </div>
          </div>
        </div>

        {/* OBSERVACOES + IMPRESSAO */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: 14, marginBottom: 14,
        }}>
          <div style={secaoTitulo}>📋 Observações e impressão</div>
          <Campo label="Observações gerais">
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
              rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} maxLength={2000} />
          </Campo>
          <div style={{ marginTop: 10 }}>
            <Campo label="Texto de rodapé (garantia/aviso)">
              <input value={rodape} onChange={e => setRodape(e.target.value)} style={inputStyle} maxLength={300} />
            </Campo>
          </div>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <CheckboxLinha label="Imprimir observações" checked={imprimirObservacoes}
              onChange={setImprimirObservacoes} />
            <CheckboxLinha label="Mostrar valor por m² na impressão" checked={mostrarValorMetro}
              onChange={setMostrarValorMetro} />
            <CheckboxLinha label="Imprimir valores (totais)" checked={imprimirValores}
              onChange={setImprimirValores} />
          </div>
        </div>

        {erro && (
          <div style={{
            marginBottom: 12, padding: "10px 12px", borderRadius: 8,
            background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
          }}>{erro}</div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancelar} disabled={salvando} style={btnSecundario}>Cancelar</button>
          <button type="submit" disabled={salvando || itens.length === 0} style={{
            ...btnPrimario, opacity: itens.length === 0 ? 0.5 : 1,
          }}>
            {salvando ? "Salvando..." : (editando ? "Salvar alterações" : "Criar orçamento")}
          </button>
        </div>
      </form>
    </div>
  );
}

// ===================== ITEM DO FORMULARIO (LARGURA × ALTURA) =====================

function ItemFormulario({ indice, item, produtos, tabelaPreco, onAtualizar, onRemover }) {
  const { totalEm, subtotal } = calcularItem(item);
  const usaArea = (parseFloat(item.largura) || 0) > 0 && (parseFloat(item.altura) || 0) > 0;
  const produto = produtos.find(p => p.id === item.produtoId);

  return (
    <div style={{
      padding: 12, borderBottom: `1px solid ${C.border}`,
      background: indice % 2 === 0 ? C.bg : "transparent",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "30px 2fr 1fr 1fr 1fr 1fr 1fr 130px 36px", gap: 8, alignItems: "end" }}>
        <div style={{ color: C.muted, fontSize: 13, fontWeight: 700, textAlign: "center", paddingBottom: 10 }}>
          {indice + 1}
        </div>
        <Campo label="Produto / Serviço *" noMargin>
          <select value={item.produtoId} onChange={e => onAtualizar("produtoId", e.target.value)}
            required style={{ ...inputStyle, padding: "6px 8px" }}>
            <option value="">— Selecione —</option>
            {produtos.map(p => (
              <option key={p.id} value={p.id}>
                {p.codigo} — {p.nome} {p.tipoItem === "SERVICO" ? "🔧" : ""} ({p.unidade})
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Largura" noMargin>
          <input type="number" step="0.001" min="0" value={item.largura}
            onChange={e => onAtualizar("largura", e.target.value)}
            style={{ ...inputStyle, padding: "6px 8px", textAlign: "right" }} placeholder="0,000" />
        </Campo>
        <Campo label="Altura" noMargin>
          <input type="number" step="0.001" min="0" value={item.altura}
            onChange={e => onAtualizar("altura", e.target.value)}
            style={{ ...inputStyle, padding: "6px 8px", textAlign: "right" }} placeholder="0,000" />
        </Campo>
        <Campo label="Total em m²" noMargin>
          <input value={totalEm > 0 ? totalEm.toFixed(3) : "—"} readOnly
            style={{ ...inputStyle, padding: "6px 8px", textAlign: "right", color: C.muted, background: C.bg }} />
        </Campo>
        <Campo label="Quantidade *" noMargin>
          <input type="number" step="0.001" min="0.001" value={item.quantidade}
            onChange={e => onAtualizar("quantidade", e.target.value)}
            required style={{ ...inputStyle, padding: "6px 8px", textAlign: "right" }} />
        </Campo>
        <Campo label={usaArea ? `Vlr p/ m² (${tabelaPreco})` : `Vlr unit. (${tabelaPreco})`} noMargin>
          <input type="number" step="0.01" min="0" value={item.valorUnitario}
            onChange={e => onAtualizar("valorUnitario", e.target.value)}
            required style={{ ...inputStyle, padding: "6px 8px", textAlign: "right" }} />
        </Campo>
        <Campo label="Subtotal" noMargin>
          <input value={fmtBRL(subtotal)} readOnly
            style={{ ...inputStyle, padding: "6px 8px", textAlign: "right",
              color: C.green, fontWeight: 700, background: C.bg }} />
        </Campo>
        <button type="button" onClick={onRemover} style={{
          background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red,
          borderRadius: 6, padding: "6px 8px", fontSize: 14, cursor: "pointer",
          alignSelf: "end",
        }} title="Remover item">×</button>
      </div>

      {/* CAMPOS EXTRAS DA GRAFICA / SINALIZACAO */}
      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 8 }}>
        <Campo label="Formato" noMargin>
          <input value={item.formato} onChange={e => onAtualizar("formato", e.target.value)}
            style={{ ...inputStyle, padding: "6px 8px" }} placeholder="Ex.: A4, 80×120cm" maxLength={100} />
        </Campo>
        <Campo label="Vias" noMargin>
          <input value={item.vias} onChange={e => onAtualizar("vias", e.target.value)}
            style={{ ...inputStyle, padding: "6px 8px" }} placeholder="Ex.: 2 vias" maxLength={50} />
        </Campo>
        <Campo label="Cores" noMargin>
          <input value={item.cores} onChange={e => onAtualizar("cores", e.target.value)}
            style={{ ...inputStyle, padding: "6px 8px" }} placeholder="Ex.: 4×4, P&B" maxLength={50} />
        </Campo>
        <Campo label="Acerto do total (R$)" noMargin>
          <input type="number" step="0.01" value={item.acertoTotal}
            onChange={e => onAtualizar("acertoTotal", e.target.value)}
            style={{ ...inputStyle, padding: "6px 8px", textAlign: "right" }} />
        </Campo>
        <Campo label="Descrição (snapshot)" noMargin>
          <input value={item.descricao} onChange={e => onAtualizar("descricao", e.target.value)}
            style={{ ...inputStyle, padding: "6px 8px" }}
            placeholder={produto?.nome || "Descrição que aparece no documento"} maxLength={200} />
        </Campo>
      </div>

      <div style={{ marginTop: 8 }}>
        <Campo label="Complemento do produto" noMargin>
          <input value={item.complemento} onChange={e => onAtualizar("complemento", e.target.value)}
            style={{ ...inputStyle, padding: "6px 8px" }}
            placeholder="Detalhes adicionais (acabamento, material, prazo…)" maxLength={500} />
        </Campo>
      </div>
    </div>
  );
}

// ===================== MODAL DETALHE =====================

function DetalheOrcamentoModal({ orcamento: orc, podeAgir, podeExcluir, onFechar, onAtualizar, onExcluir }) {
  const [acaoAberta, setAcaoAberta] = useState("");
  const [motivo, setMotivo] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("DINHEIRO");
  const [executando, setExecutando] = useState(false);
  const [erroAcao, setErroAcao] = useState("");

  const cor = corStatus(orc.status);

  // Acoes disponiveis pra cada status (matriz simplificada do backend).
  const acoesPossiveis = useMemo(() => {
    const arr = [];
    if (orc.status === "RASCUNHO") {
      arr.push({ id: "enviar", label: "Enviar para aprovação", cor: C.yellow });
      arr.push({ id: "cancelar", label: "Cancelar", cor: C.red, pedeMotivo: true });
    } else if (orc.status === "AGUARDANDO_APROVACAO") {
      arr.push({ id: "aprovar", label: "Aprovar", cor: C.green });
      arr.push({ id: "rejeitar", label: "Rejeitar", cor: C.red, pedeMotivo: true });
      arr.push({ id: "voltar", label: "Voltar a rascunho", cor: C.muted });
    } else if (orc.status === "APROVADO") {
      arr.push({ id: "entregar", label: "Finalizar (gerar venda)", cor: C.green, pedeForma: true });
      arr.push({ id: "cancelar", label: "Cancelar", cor: C.red, pedeMotivo: true });
    } else if (orc.status === "REJEITADO") {
      arr.push({ id: "voltar", label: "Voltar a rascunho", cor: C.accent });
    }
    return arr;
  }, [orc.status]);

  function abrirAcao(acao) {
    setAcaoAberta(acao);
    setErroAcao("");
    setMotivo("");
  }

  async function executarAcao() {
    setErroAcao("");
    const acao = acoesPossiveis.find(a => a.id === acaoAberta);
    if (!acao) return;

    if (acao.pedeMotivo && !motivo.trim()) {
      setErroAcao("Informe o motivo");
      return;
    }

    setExecutando(true);
    try {
      if (acao.id === "entregar") {
        const r = await api.converterOrcamentoEmVenda(orc.id, formaPagamento);
        onAtualizar(`✓ Orçamento #${orc.numero} entregue — venda #${r.venda.numero} gerada (${fmtBRL(r.venda.total)})`);
      } else {
        const mapaStatus = {
          enviar: "AGUARDANDO_APROVACAO",
          aprovar: "APROVADO",
          rejeitar: "REJEITADO",
          cancelar: "CANCELADO",
          voltar: "RASCUNHO",
        };
        const novoStatus = mapaStatus[acao.id];
        await api.alterarStatusOrcamento(orc.id, novoStatus, motivo);
        onAtualizar(`✓ Status alterado para "${STATUS_LABEL[novoStatus]}"`);
      }
      setAcaoAberta("");
    } catch (err) {
      setErroAcao(err.message);
    } finally {
      setExecutando(false);
    }
  }

  async function excluir() {
    if (!confirm(`Excluir o orçamento #${orc.numero}? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.excluirOrcamento(orc.id);
      onExcluir(`Orçamento #${orc.numero} excluído`);
    } catch (err) {
      alert(err.message);
    }
  }

  function imprimir() {
    // Abre uma janela com versao "imprimivel" do documento. Usa o estado
    // atual em memoria — se o documento foi alterado em outra aba, a
    // recarga e necessaria.
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { alert("Bloqueio de popup impediu a impressao. Permita popups e tente novamente."); return; }
    w.document.write(gerarHTMLImpressao(orc));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 250);
  }

  return (
    <div onClick={onFechar} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 880 }}>
        <div style={modalHeader}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ color: C.white, fontWeight: 700, fontSize: 20 }}>
                {orc.tipo === "ORDEM_SERVICO" ? "O.S." : "Orçamento"} #{orc.numero}
              </div>
              <span style={{
                background: cor + "22", border: `1px solid ${cor}55`, color: cor,
                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                textTransform: "uppercase", letterSpacing: 0.4,
              }}>{STATUS_LABEL[orc.status]}</span>
              <span style={{
                background: C.surface, border: `1px solid ${C.border}`, color: C.muted,
                fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
              }}>Tabela {orc.tabelaPreco}</span>
            </div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
              Criado em {fmtData(orc.createdAt)}
              {orc.user?.nome && <> · por {orc.user.nome}</>}
              {orc.responsavel?.nome && <> · responsável {orc.responsavel.nome}</>}
            </div>
          </div>
          <button type="button" onClick={onFechar} style={btnFechar}>×</button>
        </div>

        {/* Status meta */}
        {(orc.dataAprovacao || orc.dataEntrega || orc.dataRejeicao || orc.dataCancelamento) && (
          <div style={{
            marginBottom: 14, padding: 10, background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 8, display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12, color: C.muted,
          }}>
            {orc.dataAprovacao && <div><b style={{ color: C.accent }}>Aprovado:</b> {fmtData(orc.dataAprovacao)}</div>}
            {orc.dataEntrega && <div><b style={{ color: C.green }}>Entregue:</b> {fmtData(orc.dataEntrega)}</div>}
            {orc.dataRejeicao && <div><b style={{ color: C.red }}>Rejeitado:</b> {fmtData(orc.dataRejeicao)} {orc.motivoRejeicao ? `— ${orc.motivoRejeicao}` : ""}</div>}
            {orc.dataCancelamento && <div><b style={{ color: C.red }}>Cancelado:</b> {fmtData(orc.dataCancelamento)} {orc.motivoCancelamento ? `— ${orc.motivoCancelamento}` : ""}</div>}
            {orc.venda && <div><b style={{ color: C.green }}>Venda gerada:</b> #{orc.venda.numero} ({fmtBRL(orc.venda.total)})</div>}
          </div>
        )}

        {/* Cliente */}
        <div style={{
          padding: 12, background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 8, marginBottom: 14,
        }}>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>CLIENTE</div>
          <div style={{ color: C.white, fontWeight: 600, fontSize: 15 }}>
            {orc.cliente?.nome || orc.descricaoCliente || "—"}
          </div>
          {orc.contato && <div style={{ color: C.text, fontSize: 12, marginTop: 2 }}>Contato: {orc.contato}</div>}
          {orc.telefone && <div style={{ color: C.text, fontSize: 12 }}>Tel: {orc.telefone}</div>}
          {orc.cliente?.cpfCnpj && <div style={{ color: C.muted, fontSize: 12 }}>CPF/CNPJ: {orc.cliente.cpfCnpj}</div>}
        </div>

        {/* Itens */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
          <div style={{
            padding: "10px 14px", background: C.bg, borderBottom: `1px solid ${C.border}`,
            color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
          }}>Itens</div>
          {orc.itens?.map((it, idx) => {
            const usaArea = Number(it.largura || 0) > 0 && Number(it.altura || 0) > 0;
            return (
              <div key={it.id} style={{
                padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
                fontSize: 13,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: C.white, fontWeight: 600 }}>
                      {idx + 1}. {it.descricao}
                      {it.produto?.tipoItem === "SERVICO" && (
                        <span style={{ marginLeft: 8, color: C.purple, fontSize: 11 }}>🔧 SERVIÇO</span>
                      )}
                    </div>
                    <div style={{ color: C.muted, fontSize: 11, fontFamily: "monospace" }}>
                      {it.produto?.codigo}{it.produto?.referencia ? ` · ref: ${it.produto.referencia}` : ""}
                    </div>
                    <div style={{ color: C.text, fontSize: 12, marginTop: 4 }}>
                      {usaArea ? (
                        <>
                          {Number(it.largura).toFixed(3)} × {Number(it.altura).toFixed(3)} = {Number(it.totalEm).toFixed(3)} m² ·
                          {" "}{Number(it.quantidade)} × {fmtBRL(it.valorUnitario)}/m²
                        </>
                      ) : (
                        <>
                          {Number(it.quantidade)} {it.produto?.unidade || ""} × {fmtBRL(it.valorUnitario)}
                        </>
                      )}
                      {Number(it.acertoTotal) !== 0 && (
                        <> · acerto {fmtBRL(it.acertoTotal)}</>
                      )}
                    </div>
                    {(it.formato || it.vias || it.cores) && (
                      <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                        {it.formato && <>Formato: {it.formato} · </>}
                        {it.vias && <>Vias: {it.vias} · </>}
                        {it.cores && <>Cores: {it.cores}</>}
                      </div>
                    )}
                    {it.complemento && (
                      <div style={{ color: C.text, fontSize: 12, marginTop: 4, fontStyle: "italic" }}>
                        {it.complemento}
                      </div>
                    )}
                  </div>
                  <div style={{ color: C.green, fontWeight: 700, fontSize: 15, whiteSpace: "nowrap" }}>
                    {fmtBRL(it.subtotal)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Totais */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
          padding: 14, marginBottom: 14,
        }}>
          <LinhaTotal label="Valor produtos" valor={Number(orc.valorProdutos)} />
          <LinhaTotal label="Valor serviços" valor={Number(orc.valorServicos)} />
          <LinhaTotal label="Deslocamento" valor={Number(orc.deslocamento)} />
          <LinhaTotal label="Desconto" valor={-Number(orc.desconto)} />
          <div style={{
            borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 10,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ color: C.muted, fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>Total</div>
            <div style={{ color: C.green, fontSize: 22, fontWeight: 800 }}>{fmtBRL(orc.total)}</div>
          </div>
        </div>

        {orc.formaCondicaoPagamento && (
          <div style={{ marginBottom: 14, padding: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>FORMAS E CONDIÇÕES DE PAGAMENTO</div>
            <div style={{ color: C.text, fontSize: 13, whiteSpace: "pre-wrap" }}>{orc.formaCondicaoPagamento}</div>
          </div>
        )}

        {orc.observacoes && (
          <div style={{ marginBottom: 14, padding: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>OBSERVAÇÕES GERAIS</div>
            <div style={{ color: C.text, fontSize: 13, whiteSpace: "pre-wrap" }}>{orc.observacoes}</div>
          </div>
        )}

        {/* Acao em destaque */}
        {acaoAberta && (
          <div style={{
            marginBottom: 14, padding: 14, background: C.bg,
            border: `1px solid ${C.border}`, borderRadius: 10,
          }}>
            <div style={{ color: C.white, fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
              {acoesPossiveis.find(a => a.id === acaoAberta)?.label}
            </div>
            {acaoAberta === "entregar" && (
              <Campo label="Forma de pagamento da venda *">
                <select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} style={inputStyle}>
                  {Object.entries(FORMAS_PAGAMENTO_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Campo>
            )}
            {acoesPossiveis.find(a => a.id === acaoAberta)?.pedeMotivo && (
              <Campo label="Motivo">
                <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} maxLength={500} />
              </Campo>
            )}
            {erroAcao && (
              <div style={{
                marginTop: 8, padding: "8px 12px", borderRadius: 6,
                background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 12,
              }}>{erroAcao}</div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 12, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setAcaoAberta("")} disabled={executando} style={btnSecundario}>Cancelar</button>
              <button type="button" onClick={executarAcao} disabled={executando} style={btnPrimario}>
                {executando ? "Processando..." : "Confirmar"}
              </button>
            </div>
          </div>
        )}

        {/* Botoes de acao */}
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={imprimir} style={btnIcone(C.accent)}>🖨 Imprimir</button>
            {podeExcluir && !orc.vendaId && (
              <button type="button" onClick={excluir} style={btnIcone(C.red)}>🗑 Excluir</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {podeAgir && acoesPossiveis.map(a => (
              <button key={a.id} type="button" onClick={() => abrirAcao(a.id)}
                disabled={!!acaoAberta}
                style={{
                  background: a.cor + "22", border: `1px solid ${a.cor}55`, color: a.cor,
                  borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700,
                  cursor: acaoAberta ? "not-allowed" : "pointer",
                  opacity: acaoAberta ? 0.5 : 1,
                }}>{a.label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===================== HTML PARA IMPRESSAO =====================

function gerarHTMLImpressao(orc) {
  const tipoLabel = orc.tipo === "ORDEM_SERVICO" ? "ORDEM DE SERVIÇO" : "ORÇAMENTO";
  const data = new Date(orc.createdAt).toLocaleString("pt-BR");
  const cliente = orc.cliente?.nome || orc.descricaoCliente || "—";
  const itens = (orc.itens || []).map((it, i) => {
    const usaArea = Number(it.largura || 0) > 0 && Number(it.altura || 0) > 0;
    const desc = `${it.descricao}${it.complemento ? `<br><small>${it.complemento}</small>` : ""}`;
    const detalhe = usaArea
      ? `${Number(it.largura).toFixed(3)} × ${Number(it.altura).toFixed(3)} m = ${Number(it.totalEm).toFixed(3)} m² · ${Number(it.quantidade)} un`
      : `${Number(it.quantidade)} ${it.produto?.unidade || "un"}`;
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${desc}<br><small style="color:#888">${detalhe}</small></td>
        <td style="text-align:right">${fmtBRL(it.valorUnitario)}</td>
        <td style="text-align:right"><b>${fmtBRL(it.subtotal)}</b></td>
      </tr>
    `;
  }).join("");

  const valoresHTML = orc.imprimirValores ? `
    <table class="totais">
      <tr><td>Valor produtos</td><td>${fmtBRL(orc.valorProdutos)}</td></tr>
      <tr><td>Valor serviços</td><td>${fmtBRL(orc.valorServicos)}</td></tr>
      <tr><td>Deslocamento</td><td>${fmtBRL(orc.deslocamento)}</td></tr>
      <tr><td>Desconto</td><td>- ${fmtBRL(orc.desconto)}</td></tr>
      <tr class="total"><td>TOTAL</td><td>${fmtBRL(orc.total)}</td></tr>
    </table>
  ` : "";

  const obsHTML = orc.observacoes && orc.imprimirObservacoes
    ? `<div class="obs"><b>Observações:</b><br>${orc.observacoes.replace(/\n/g, "<br>")}</div>`
    : "";

  const formaHTML = orc.formaCondicaoPagamento
    ? `<div class="obs"><b>Formas e condições:</b> ${orc.formaCondicaoPagamento}</div>`
    : "";

  const rodapeHTML = orc.rodape ? `<div class="rodape">${orc.rodape}</div>` : "";

  return `
<!doctype html>
<html><head><meta charset="utf-8"><title>${tipoLabel} #${orc.numero}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 760px; margin: 20px auto; color: #222; padding: 0 16px; }
  h1 { font-size: 20px; border-bottom: 2px solid #333; padding-bottom: 6px; margin: 0 0 4px; }
  .meta { font-size: 12px; color: #666; margin-bottom: 16px; }
  .box { border: 1px solid #aaa; padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 13px; }
  .box b { color: #333; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #eee; }
  small { color: #666; }
  .totais { width: 320px; margin-left: auto; margin-top: 12px; }
  .totais td { padding: 4px 8px; text-align: right; }
  .totais td:first-child { text-align: left; color: #555; }
  .totais .total td { border-top: 2px solid #333; font-weight: 700; font-size: 14px; padding-top: 8px; }
  .obs { font-size: 12px; padding: 8px; background: #f6f6f6; border-radius: 4px; margin-top: 12px; }
  .rodape { margin-top: 18px; padding: 8px; text-align: center; font-style: italic; color: #b00; font-size: 12px; }
  .status { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background: #eee; }
  @media print { body { margin: 0; } }
</style></head><body>
  <h1>${tipoLabel} Nº ${orc.numero} ${orc.via === 2 ? "<small>(2ª via)</small>" : ""}</h1>
  <div class="meta">Emitido em ${data} · Tabela ${orc.tabelaPreco} · <span class="status">${orc.status.replace(/_/g, " ")}</span></div>

  <div class="box">
    <b>Cliente:</b> ${cliente}<br>
    ${orc.contato ? `<b>Contato:</b> ${orc.contato}<br>` : ""}
    ${orc.telefone ? `<b>Telefone:</b> ${orc.telefone}<br>` : ""}
    ${orc.cliente?.cpfCnpj ? `<b>CPF/CNPJ:</b> ${orc.cliente.cpfCnpj}<br>` : ""}
    ${orc.cliente?.endereco ? `<b>Endereço:</b> ${orc.cliente.endereco}${orc.cliente.cidade ? ` — ${orc.cliente.cidade}` : ""}<br>` : ""}
  </div>

  <table>
    <thead><tr><th>#</th><th>Descrição</th><th style="text-align:right">Vlr unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
    <tbody>${itens}</tbody>
  </table>

  ${valoresHTML}
  ${formaHTML}
  ${obsHTML}
  ${rodapeHTML}

  <div class="meta" style="margin-top:24px; font-size:11px;">
    ${orc.user?.nome ? `Atendido por: ${orc.user.nome}` : ""}
    ${orc.responsavel?.nome ? ` · Responsável: ${orc.responsavel.nome}` : ""}
  </div>
</body></html>
  `;
}

// ===================== AUX =====================

function Campo({ label, children, noMargin }) {
  return (
    <div style={{ marginBottom: noMargin ? 0 : 8 }}>
      <label style={{ display: "block", color: C.muted, fontSize: 11, marginBottom: 4, fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function CheckboxLinha({ label, checked, onChange }) {
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
      background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
      padding: "8px 10px", fontSize: 12, color: C.text,
    }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ accentColor: C.accent }} />
      {label}
    </label>
  );
}

function LinhaTotal({ label, valor }) {
  const negativo = valor < 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
      <span style={{ color: C.muted }}>{label}</span>
      <span style={{ color: negativo ? C.red : C.text, fontWeight: 600 }}>
        {negativo ? "- " : ""}{fmtBRL(Math.abs(valor))}
      </span>
    </div>
  );
}

const secaoTitulo = {
  color: C.white, fontSize: 13, fontWeight: 700, marginBottom: 10,
  textTransform: "uppercase", letterSpacing: 0.5,
};

const inputStyle = {
  width: "100%", background: C.bg, border: `1px solid ${C.border}`,
  borderRadius: 6, padding: "8px 10px", color: C.text, fontSize: 13,
  outline: "none", boxSizing: "border-box",
};

const inputCompacto = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: "9px 12px", color: C.text, fontSize: 13, outline: "none",
};

const modalOverlay = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 20, zIndex: 100,
};

const modalCard = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
  width: "100%", maxHeight: "92vh", overflowY: "auto", padding: 24,
};

const modalHeader = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  marginBottom: 18, gap: 12,
};

const btnFechar = {
  background: "transparent", border: "none", color: C.muted, fontSize: 22, cursor: "pointer",
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

function btnIcone(cor) {
  return {
    background: cor + "22", border: `1px solid ${cor}55`, color: cor,
    borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600,
    cursor: "pointer",
  };
}
