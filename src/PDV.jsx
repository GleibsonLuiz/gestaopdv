import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { api } from "./lib/api.js";

const C = {
  bg: "#0f1117", surface: "#1a1d27", card: "#21253a",
  border: "#2e3354", accent: "#4f8ef7", text: "#e2e8f0",
  muted: "#64748b", white: "#ffffff", green: "#22c55e",
  yellow: "#f59e0b", red: "#ef4444", purple: "#7c3aed",
};

const FORMAS = [
  { id: "DINHEIRO",        label: "Dinheiro",       icone: "💵", atalho: "F1" },
  { id: "PIX",             label: "PIX",            icone: "⚡", atalho: "F2" },
  { id: "CARTAO_DEBITO",   label: "Débito",         icone: "💳", atalho: "F3" },
  { id: "CARTAO_CREDITO",  label: "Crédito",        icone: "💳", atalho: "F4" },
  { id: "BOLETO",          label: "Boleto",         icone: "🧾", atalho: "F5" },
  { id: "CREDIARIO",       label: "Crediário",      icone: "📒", atalho: "F6" },
];

const FORMA_LABEL = Object.fromEntries(FORMAS.map(f => [f.id, f.label]));

const STATUS_INFO = {
  CONCLUIDA: { label: "Concluída", cor: C.green },
  CANCELADA: { label: "Cancelada", cor: C.red },
  PENDENTE:  { label: "Pendente",  cor: C.yellow },
};

const fmtBRL = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export default function PDV({ user }) {
  const [aba, setAba] = useState("nova");
  return (
    <div>
      <style>{`
        .pdv-card-produto {
          transition: transform 0.06s ease, border-color 0.12s ease, box-shadow 0.12s ease;
        }
        .pdv-card-produto:hover {
          border-color: ${C.accent}88 !important;
          box-shadow: 0 4px 12px rgba(79,142,247,0.15);
        }
        .pdv-card-produto:active {
          transform: scale(0.98);
        }
        .pdv-btn-add-qtd {
          background: linear-gradient(135deg, ${C.accent}, ${C.purple});
          color: ${C.white};
          border: none;
          border-radius: 6px;
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          transition: filter 0.12s ease;
        }
        .pdv-btn-add-qtd:hover { filter: brightness(1.15); }
        .pdv-btn-add-qtd:active { filter: brightness(0.95); }
        .pdv-stepper-btn {
          background: ${C.card};
          border: 1px solid ${C.border};
          color: ${C.text};
          border-radius: 4px;
          width: 22px;
          height: 22px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          line-height: 1;
        }
        .pdv-stepper-btn:hover { border-color: ${C.accent}; color: ${C.white}; }
      `}</style>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setAba("nova")} style={tabBtn(aba === "nova")}>🛒 Nova Venda</button>
        <button onClick={() => setAba("historico")} style={tabBtn(aba === "historico")}>📜 Histórico de Vendas</button>
      </div>

      {aba === "nova" ? <NovaVenda user={user} /> : <Historico user={user} />}
    </div>
  );
}

// ==================== NOVA VENDA ====================

function NovaVenda({ user }) {
  const [produtos, setProdutos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [busca, setBusca] = useState("");
  const [carrinho, setCarrinho] = useState([]);
  const [clienteId, setClienteId] = useState("");
  const [forma, setForma] = useState("DINHEIRO");
  const [desconto, setDesconto] = useState("0");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [reciboAberto, setReciboAberto] = useState(null);
  const [pagamentoAberto, setPagamentoAberto] = useState(false);
  const [valorRecebido, setValorRecebido] = useState("");
  const [qtdPorCard, setQtdPorCard] = useState({});
  const buscaRef = useRef(null);
  const finalizarRef = useRef(null);
  const valorRecebidoRef = useRef(null);

  const focarBusca = useCallback(() => {
    setTimeout(() => buscaRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    api.listarProdutos({ ativo: "true" }).then(setProdutos).catch(() => {});
    api.listarClientes({ ativo: "true" }).then(setClientes).catch(() => {});
  }, []);

  useEffect(() => {
    buscaRef.current?.focus();
  }, []);

  const produtosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const ativos = produtos.filter(p => p.ativo && p.estoque > 0);
    if (!q) return ativos.slice(0, 30);
    return ativos.filter(p =>
      p.codigo.toLowerCase().includes(q) ||
      p.nome.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [busca, produtos]);

  function adicionarProduto(p, qtd = 1) {
    const incremento = Math.max(1, parseInt(qtd, 10) || 1);
    setCarrinho(prev => {
      const idx = prev.findIndex(it => it.produtoId === p.id);
      if (idx >= 0) {
        const novo = [...prev];
        const qtdAtual = novo[idx].quantidade;
        if (qtdAtual + incremento > p.estoque) {
          setErro(`Estoque insuficiente de "${p.nome}" (disponível: ${p.estoque}).`);
          setTimeout(() => setErro(""), 2500);
          return prev;
        }
        novo[idx] = { ...novo[idx], quantidade: qtdAtual + incremento };
        return novo;
      }
      if (p.estoque < incremento) {
        setErro(`Estoque insuficiente de "${p.nome}" (disponível: ${p.estoque}).`);
        setTimeout(() => setErro(""), 2500);
        return prev;
      }
      return [...prev, {
        produtoId: p.id,
        codigo: p.codigo,
        nome: p.nome,
        unidade: p.unidade,
        estoque: p.estoque,
        precoUnitario: Number(p.precoVenda),
        quantidade: incremento,
      }];
    });
    setQtdPorCard(prev => ({ ...prev, [p.id]: 1 }));
    focarBusca();
  }

  function alterarQuantidade(produtoId, delta) {
    setCarrinho(prev => prev.map(it => {
      if (it.produtoId !== produtoId) return it;
      const nova = it.quantidade + delta;
      if (nova <= 0) return it;
      if (nova > it.estoque) {
        setErro(`Estoque insuficiente de "${it.nome}" (disponível: ${it.estoque}).`);
        setTimeout(() => setErro(""), 2500);
        return it;
      }
      return { ...it, quantidade: nova };
    }));
  }

  function definirQuantidade(produtoId, valor) {
    const n = parseInt(valor, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    setCarrinho(prev => prev.map(it => {
      if (it.produtoId !== produtoId) return it;
      if (n > it.estoque) {
        setErro(`Estoque insuficiente de "${it.nome}" (disponível: ${it.estoque}).`);
        setTimeout(() => setErro(""), 2500);
        return { ...it, quantidade: it.estoque };
      }
      return { ...it, quantidade: n };
    }));
  }

  function alterarPreco(produtoId, valor) {
    setCarrinho(prev => prev.map(it => {
      if (it.produtoId !== produtoId) return it;
      const n = parseFloat(String(valor).replace(",", "."));
      return { ...it, precoUnitario: Number.isFinite(n) && n >= 0 ? n : it.precoUnitario };
    }));
  }

  function removerItem(produtoId) {
    setCarrinho(prev => prev.filter(it => it.produtoId !== produtoId));
  }

  function limparCarrinho() {
    setCarrinho([]);
    setClienteId("");
    setDesconto("0");
    setObservacoes("");
    setForma("DINHEIRO");
    setErro("");
    setValorRecebido("");
    setQtdPorCard({});
    focarBusca();
  }

  const subtotal = useMemo(
    () => carrinho.reduce((acc, it) => acc + it.quantidade * it.precoUnitario, 0),
    [carrinho]
  );
  const descontoNum = useMemo(() => {
    const n = parseFloat(String(desconto).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [desconto]);
  const total = Math.max(0, subtotal - descontoNum);

  const valorRecebidoNum = useMemo(() => {
    const n = parseFloat(String(valorRecebido).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [valorRecebido]);
  const troco = Math.max(0, valorRecebidoNum - total);
  const trocoFalta = Math.max(0, total - valorRecebidoNum);
  const mostrarTroco = forma === "DINHEIRO" && total > 0;

  // Atalhos: F1-F6 forma de pagamento, End foca botão Finalizar
  useEffect(() => {
    const FORMA_POR_TECLA = {
      F1: "DINHEIRO", F2: "PIX", F3: "CARTAO_DEBITO",
      F4: "CARTAO_CREDITO", F5: "BOLETO", F6: "CREDIARIO",
    };
    function onKeyDown(e) {
      if (FORMA_POR_TECLA[e.key]) {
        e.preventDefault();
        setForma(FORMA_POR_TECLA[e.key]);
        if (FORMA_POR_TECLA[e.key] === "DINHEIRO") {
          setTimeout(() => valorRecebidoRef.current?.focus(), 0);
        }
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        finalizarRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrirPagamento() {
    setErro("");
    if (carrinho.length === 0) { setErro("Adicione ao menos um item"); return; }
    if (descontoNum > subtotal) { setErro("Desconto não pode ser maior que o subtotal"); return; }
    setPagamentoAberto(true);
    setTimeout(() => {
      if (forma === "DINHEIRO") valorRecebidoRef.current?.focus();
      else finalizarRef.current?.focus();
    }, 50);
  }

  async function confirmarPagamento() {
    setErro("");
    if (carrinho.length === 0) { setErro("Adicione ao menos um item"); return; }
    if (descontoNum > subtotal) { setErro("Desconto não pode ser maior que o subtotal"); return; }

    setSalvando(true);
    try {
      const venda = await api.criarVenda({
        clienteId: clienteId || null,
        formaPagamento: forma,
        desconto: descontoNum,
        observacoes: observacoes ? observacoes.toUpperCase() : null,
        itens: carrinho.map(it => ({
          produtoId: it.produtoId,
          quantidade: it.quantidade,
          precoUnitario: it.precoUnitario,
        })),
      });
      // Atualiza estoques locais
      setProdutos(prev => prev.map(p => {
        const it = carrinho.find(c => c.produtoId === p.id);
        return it ? { ...p, estoque: p.estoque - it.quantidade } : p;
      }));
      setPagamentoAberto(false);
      const recebido = forma === "DINHEIRO" ? valorRecebidoNum : 0;
      const trocoPago = forma === "DINHEIRO" ? troco : 0;
      setReciboAberto({ venda, valorRecebido: recebido, troco: trocoPago });
      limparCarrinho();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
      focarBusca();
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 16, alignItems: "start" }}>
      {/* COLUNA ESQUERDA: BUSCA + GRID DE PRODUTOS */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
        <input
          ref={buscaRef}
          placeholder="🔎 Buscar por código ou nome (clique no produto para adicionar)"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box",
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "12px 14px", color: C.text, fontSize: 14, outline: "none",
            marginBottom: 12,
          }}
        />
        {produtosFiltrados.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>
            {busca ? "Nenhum produto encontrado." : "Carregando produtos..."}
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
            gap: 10,
          }}>
            {produtosFiltrados.map(p => {
              const baixo = p.estoque <= p.estoqueMinimo;
              const corSelo = baixo ? C.yellow : C.green;
              const qtdCard = qtdPorCard[p.id] || 1;
              const setQtd = (n) => setQtdPorCard(prev => ({
                ...prev,
                [p.id]: Math.min(p.estoque, Math.max(1, n)),
              }));
              return (
                <div
                  key={p.id}
                  className="pdv-card-produto"
                  onClick={() => adicionarProduto(p, qtdCard)}
                  style={{
                    textAlign: "left", cursor: "pointer", padding: 12,
                    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
                    color: C.text, display: "flex", flexDirection: "column", gap: 6,
                  }}
                >
                  <div style={{ color: C.muted, fontFamily: "monospace", fontSize: 11 }}>{p.codigo}</div>
                  <div style={{ color: C.white, fontWeight: 600, fontSize: 13, minHeight: 36, lineHeight: 1.3 }}>
                    {p.nome}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <div style={{ color: C.green, fontWeight: 800, fontSize: 14 }}>{fmtBRL(p.precoVenda)}</div>
                    <div style={{
                      fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 6,
                      background: corSelo + "33",
                      color: corSelo,
                      border: `1px solid ${corSelo}88`,
                      letterSpacing: 0.3,
                    }}>
                      {p.estoque} {p.unidade}
                    </div>
                  </div>
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      marginTop: 6, padding: 4,
                      background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`,
                    }}
                  >
                    <button
                      type="button"
                      className="pdv-stepper-btn"
                      onClick={() => setQtd(qtdCard - 1)}
                      disabled={qtdCard <= 1}
                    >−</button>
                    <input
                      type="number" min="1" max={p.estoque}
                      value={qtdCard}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setQtd(parseInt(e.target.value, 10) || 1)}
                      style={{
                        flex: 1, minWidth: 0, textAlign: "center",
                        background: "transparent", border: "none",
                        color: C.white, fontSize: 13, fontWeight: 700, outline: "none",
                      }}
                    />
                    <button
                      type="button"
                      className="pdv-stepper-btn"
                      onClick={() => setQtd(qtdCard + 1)}
                      disabled={qtdCard >= p.estoque}
                    >+</button>
                    <button
                      type="button"
                      className="pdv-btn-add-qtd"
                      onClick={() => adicionarProduto(p, qtdCard)}
                    >
                      + Add
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* COLUNA DIREITA: CARRINHO + CHECKOUT */}
      <div style={{
        display: "flex", flexDirection: "column", gap: 12,
        position: "sticky", top: 16,
        maxHeight: "calc(100vh - 32px)", overflowY: "auto",
      }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{
            padding: "12px 16px", background: C.surface, borderBottom: `1px solid ${C.border}`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ color: C.white, fontWeight: 700, fontSize: 14 }}>🛒 Carrinho ({carrinho.length})</div>
            {carrinho.length > 0 && (
              <button onClick={limparCarrinho} style={{
                background: "transparent", border: "none", color: C.muted, fontSize: 12, cursor: "pointer",
              }}>Limpar</button>
            )}
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {carrinho.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>
                Carrinho vazio.<br />Clique nos produtos à esquerda.
              </div>
            ) : carrinho.map(it => (
              <div key={it.produtoId} style={{
                padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
                display: "flex", flexDirection: "column", gap: 6,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.white, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {it.nome}
                    </div>
                    <div style={{ color: C.muted, fontFamily: "monospace", fontSize: 10 }}>{it.codigo}</div>
                  </div>
                  <button onClick={() => removerItem(it.produtoId)} style={{
                    background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red,
                    borderRadius: 6, padding: "2px 8px", fontSize: 12, cursor: "pointer",
                  }}>×</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button onClick={() => alterarQuantidade(it.produtoId, -1)} style={btnQtd}>−</button>
                    <input
                      type="number" min="1" max={it.estoque} value={it.quantidade}
                      onChange={e => definirQuantidade(it.produtoId, e.target.value)}
                      style={{
                        width: 50, textAlign: "center",
                        background: C.surface, border: `1px solid ${C.border}`,
                        borderRadius: 6, padding: "4px 6px", color: C.text, fontSize: 13, outline: "none",
                      }}
                    />
                    <button onClick={() => alterarQuantidade(it.produtoId, +1)} style={btnQtd}>+</button>
                  </div>
                  <div style={{ color: C.muted, fontSize: 11 }}>×</div>
                  <input
                    type="number" step="0.01" min="0" value={it.precoUnitario}
                    onChange={e => alterarPreco(it.produtoId, e.target.value)}
                    style={{
                      width: 80, textAlign: "right",
                      background: C.surface, border: `1px solid ${C.border}`,
                      borderRadius: 6, padding: "4px 6px", color: C.text, fontSize: 12, outline: "none",
                    }}
                  />
                  <div style={{ marginLeft: "auto", color: C.green, fontWeight: 700, fontSize: 14 }}>
                    {fmtBRL(it.quantidade * it.precoUnitario)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Linha label="Subtotal" valor={fmtBRL(subtotal)} />
            {descontoNum > 0 && (
              <Linha label="Desconto" valor={`− ${fmtBRL(descontoNum)}`} cor={C.red} />
            )}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginTop: 6, padding: "12px 14px",
              background: C.surface, borderRadius: 8,
              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            }}>
              <div style={{ color: C.muted, fontSize: 12, fontWeight: 700 }}>TOTAL</div>
              <div style={{ color: C.green, fontSize: 24, fontWeight: 800 }}>{fmtBRL(total)}</div>
            </div>
          </div>

          {erro && !pagamentoAberto && (
            <div style={{
              padding: "8px 12px", borderRadius: 8,
              background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 12,
            }}>{erro}</div>
          )}

          <button
            onClick={abrirPagamento}
            disabled={carrinho.length === 0}
            style={{
              background: carrinho.length === 0 ? C.surface : `linear-gradient(135deg, ${C.green}, #15803d)`,
              color: C.white, border: "none", borderRadius: 10,
              padding: "14px", fontWeight: 800, fontSize: 16,
              cursor: carrinho.length === 0 ? "not-allowed" : "pointer",
              opacity: carrinho.length === 0 ? 0.5 : 1,
              boxShadow: carrinho.length === 0 ? "none" : `0 4px 14px ${C.green}55`,
            }}>
            ✓ FINALIZAR VENDA — {fmtBRL(total)} <span style={{ fontSize: 10, opacity: 0.85, fontWeight: 700 }}>(End)</span>
          </button>
        </div>

        <div style={{ color: C.muted, fontSize: 11, textAlign: "center" }}>
          Vendedor: <span style={{ color: C.text, fontWeight: 600 }}>{user.nome}</span>
        </div>
      </div>

      {pagamentoAberto && (
        <div
          onClick={() => !salvando && setPagamentoAberto(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20, zIndex: 100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
              width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto",
              padding: 22, display: "flex", flexDirection: "column", gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: C.white, fontWeight: 800, fontSize: 18 }}>
                💰 Pagamento
              </div>
              <button
                type="button"
                onClick={() => !salvando && setPagamentoAberto(false)}
                style={{
                  background: "transparent", border: "none", color: C.muted,
                  fontSize: 22, cursor: salvando ? "default" : "pointer",
                }}
              >×</button>
            </div>

            <div>
              <label style={labelStyle}>Cliente (opcional)</label>
              <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={inputStyle}>
                <option value="">— Consumidor —</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Forma de pagamento</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {FORMAS.map(f => (
                  <button key={f.id} onClick={() => setForma(f.id)} type="button" style={{
                    cursor: "pointer", padding: "10px 4px", borderRadius: 8,
                    background: forma === f.id ? C.accent : C.surface,
                    border: forma === f.id ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
                    color: forma === f.id ? C.white : C.muted,
                    fontSize: 12, fontWeight: 700, textAlign: "center",
                  }}>
                    <div style={{ fontSize: 18 }}>{f.icone}</div>
                    <div>{f.label}</div>
                    <div style={{ fontSize: 9, opacity: 0.7 }}>{f.atalho}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>Desconto (R$)</label>
                <input type="number" step="0.01" min="0" value={desconto}
                  onChange={e => setDesconto(e.target.value)} style={inputStyle} />
              </div>
              {forma === "DINHEIRO" && (
                <div>
                  <label style={labelStyle}>Valor recebido (R$)</label>
                  <input
                    ref={valorRecebidoRef}
                    type="number" step="0.01" min="0"
                    value={valorRecebido}
                    onChange={e => setValorRecebido(e.target.value)}
                    placeholder="0,00"
                    style={inputStyle}
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Observações</label>
              <input value={observacoes} onChange={e => setObservacoes(e.target.value)}
                placeholder="Opcional" style={inputStyle} />
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
              <Linha label="Subtotal" valor={fmtBRL(subtotal)} />
              <Linha label="Desconto" valor={`− ${fmtBRL(descontoNum)}`} cor={C.red} />
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginTop: 6, padding: "12px 14px",
                background: C.surface, borderRadius: 8,
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              }}>
                <div style={{ color: C.muted, fontSize: 12, fontWeight: 700 }}>TOTAL</div>
                <div style={{ color: C.green, fontSize: 24, fontWeight: 800 }}>{fmtBRL(total)}</div>
              </div>
              {mostrarTroco && valorRecebidoNum > 0 && (
                trocoFalta > 0 ? (
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 12px", borderRadius: 8,
                    background: C.yellow + "22", border: `1px solid ${C.yellow}66`,
                  }}>
                    <div style={{ color: C.yellow, fontSize: 11, fontWeight: 800, letterSpacing: 0.3 }}>
                      FALTA RECEBER
                    </div>
                    <div style={{ color: C.yellow, fontSize: 18, fontWeight: 800 }}>
                      {fmtBRL(trocoFalta)}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 12px", borderRadius: 8,
                    background: `linear-gradient(135deg, ${C.green}33, ${C.green}11)`,
                    border: `1px solid ${C.green}88`,
                  }}>
                    <div style={{ color: C.green, fontSize: 11, fontWeight: 800, letterSpacing: 0.3 }}>
                      TROCO
                    </div>
                    <div style={{ color: C.green, fontSize: 20, fontWeight: 800 }}>
                      {fmtBRL(troco)}
                    </div>
                  </div>
                )
              )}
            </div>

            {erro && (
              <div style={{
                padding: "8px 12px", borderRadius: 8,
                background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 12,
              }}>{erro}</div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => !salvando && setPagamentoAberto(false)}
                disabled={salvando}
                style={{
                  flex: "0 0 auto",
                  background: "transparent", border: `1px solid ${C.border}`, color: C.muted,
                  borderRadius: 10, padding: "13px 22px", fontWeight: 600, fontSize: 13,
                  cursor: salvando ? "default" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                ref={finalizarRef}
                onClick={confirmarPagamento}
                disabled={salvando}
                style={{
                  flex: 1,
                  background: salvando ? C.muted : `linear-gradient(135deg, ${C.green}, #15803d)`,
                  color: C.white, border: "none", borderRadius: 10,
                  padding: "13px", fontWeight: 800, fontSize: 15,
                  cursor: salvando ? "default" : "pointer",
                  boxShadow: salvando ? "none" : `0 4px 14px ${C.green}55`,
                }}
              >
                {salvando ? "Confirmando..." : `✓ Confirmar Pagamento — ${fmtBRL(total)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {reciboAberto && (
        <ReciboModal
          venda={reciboAberto.venda}
          valorRecebido={reciboAberto.valorRecebido}
          troco={reciboAberto.troco}
          onFechar={() => setReciboAberto(null)}
        />
      )}
    </div>
  );
}

function Linha({ label, valor, cor }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <div style={{ color: C.muted }}>{label}</div>
      <div style={{ color: cor || C.text, fontWeight: 600 }}>{valor}</div>
    </div>
  );
}

const btnQtd = {
  background: "#1a1d27", border: "1px solid #2e3354", color: "#e2e8f0",
  borderRadius: 6, width: 26, height: 26, fontSize: 14, fontWeight: 700, cursor: "pointer",
};

// ==================== RECIBO ====================

function ReciboModal({ venda, valorRecebido = 0, troco = 0, onFechar }) {
  const subtotalCupom = Number(venda.total) + Number(venda.desconto || 0);
  const mostrarRecebidoTroco = Number(valorRecebido) > 0;

  function imprimir() {
    window.print();
  }

  return (
    <>
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 4mm; }
          body * { visibility: hidden !important; }
          .cupom-imprimivel, .cupom-imprimivel * { visibility: visible !important; }
          .cupom-imprimivel {
            position: absolute !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important;
            background: white !important;
            color: black !important;
          }
        }
        .cupom-imprimivel {
          position: absolute;
          left: -9999px;
          top: -9999px;
          width: 80mm;
          background: white;
          color: black;
          font-family: 'Courier New', Courier, monospace;
          font-size: 12px;
          line-height: 1.4;
          padding: 8px 6px;
        }
        .cupom-imprimivel .cupom-divisor {
          border: 0;
          border-top: 1px dashed #000;
          margin: 6px 0;
        }
        .cupom-imprimivel .cupom-linha {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }
        .cupom-imprimivel .cupom-centro { text-align: center; }
        .cupom-imprimivel .cupom-bold { font-weight: 700; }
        .cupom-imprimivel .cupom-grande { font-size: 14px; font-weight: 700; }
      `}</style>

      <div onClick={onFechar} style={modalOverlay}>
        <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 480 }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 48 }}>✅</div>
            <div style={{ color: C.white, fontSize: 22, fontWeight: 800, marginTop: 4 }}>Venda Concluída!</div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
              Venda #{venda.numero} · {fmtData(venda.createdAt)}
            </div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>ITENS</div>
            {venda.itens?.map(it => (
              <div key={it.id} style={{
                display: "flex", justifyContent: "space-between", padding: "6px 0",
                borderBottom: `1px solid ${C.border}`, fontSize: 13,
              }}>
                <div>
                  <div style={{ color: C.white }}>{it.produto?.nome}</div>
                  <div style={{ color: C.muted, fontSize: 11 }}>
                    {it.quantidade} × {fmtBRL(it.precoUnitario)}
                  </div>
                </div>
                <div style={{ color: C.green, fontWeight: 700 }}>{fmtBRL(it.subtotal)}</div>
              </div>
            ))}
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: C.muted }}>Forma de pagamento:</span>
              <span style={{ color: C.white, fontWeight: 600 }}>{FORMA_LABEL[venda.formaPagamento]}</span>
            </div>
            {Number(venda.desconto) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: C.muted }}>Desconto:</span>
                <span style={{ color: C.red, fontWeight: 600 }}>− {fmtBRL(venda.desconto)}</span>
              </div>
            )}
            {mostrarRecebidoTroco && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: C.muted }}>Valor recebido:</span>
                  <span style={{ color: C.text, fontWeight: 600 }}>{fmtBRL(valorRecebido)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: C.muted }}>Troco:</span>
                  <span style={{ color: C.green, fontWeight: 700 }}>{fmtBRL(troco)}</span>
                </div>
              </>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
              <span style={{ color: C.muted }}>TOTAL</span>
              <span style={{ color: C.green }}>{fmtBRL(venda.total)}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={imprimir} style={{
              flex: 1, background: C.surface, border: `1px solid ${C.accent}55`, color: C.accent,
              borderRadius: 10, padding: "12px", fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}>
              🖨️ Imprimir Cupom
            </button>
            <button onClick={onFechar} style={{
              flex: 1, background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              color: C.white, border: "none", borderRadius: 10,
              padding: "12px", fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}>
              Nova Venda
            </button>
          </div>
        </div>
      </div>

      {/* Cupom oculto, visível apenas na impressão */}
      <div className="cupom-imprimivel" aria-hidden="true">
        <div className="cupom-centro cupom-bold">GESTÃOPRO</div>
        <div className="cupom-centro">CUPOM DE VENDA</div>
        <div className="cupom-centro" style={{ fontSize: 10 }}>** NÃO É DOCUMENTO FISCAL **</div>
        <hr className="cupom-divisor" />
        <div>Venda: <span className="cupom-bold">#{venda.numero}</span></div>
        <div>Data: {fmtData(venda.createdAt)}</div>
        {venda.cliente?.nome && <div>Cliente: {venda.cliente.nome}</div>}
        {venda.cliente?.cpfCnpj && <div>CPF/CNPJ: {venda.cliente.cpfCnpj}</div>}
        <div>Vendedor: {venda.user?.nome}</div>
        <hr className="cupom-divisor" />
        <div className="cupom-linha cupom-bold">
          <span>ITEM</span>
          <span>VALOR</span>
        </div>
        <hr className="cupom-divisor" />
        {venda.itens?.map(it => (
          <div key={it.id} style={{ marginBottom: 4 }}>
            <div>{it.produto?.codigo} {it.produto?.nome}</div>
            <div className="cupom-linha">
              <span>{it.quantidade} {it.produto?.unidade || ""} x {fmtBRL(it.precoUnitario)}</span>
              <span>{fmtBRL(it.subtotal)}</span>
            </div>
          </div>
        ))}
        <hr className="cupom-divisor" />
        <div className="cupom-linha">
          <span>Subtotal:</span>
          <span>{fmtBRL(subtotalCupom)}</span>
        </div>
        {Number(venda.desconto) > 0 && (
          <div className="cupom-linha">
            <span>Desconto:</span>
            <span>- {fmtBRL(venda.desconto)}</span>
          </div>
        )}
        <hr className="cupom-divisor" />
        <div className="cupom-linha cupom-grande">
          <span>TOTAL:</span>
          <span>{fmtBRL(venda.total)}</span>
        </div>
        <hr className="cupom-divisor" />
        <div>Pagamento: <span className="cupom-bold">{FORMA_LABEL[venda.formaPagamento]}</span></div>
        {mostrarRecebidoTroco && (
          <>
            <div className="cupom-linha">
              <span>Valor recebido:</span>
              <span>{fmtBRL(valorRecebido)}</span>
            </div>
            <div className="cupom-linha cupom-bold">
              <span>TROCO:</span>
              <span>{fmtBRL(troco)}</span>
            </div>
          </>
        )}
        {venda.observacoes && (
          <>
            <hr className="cupom-divisor" />
            <div>Obs: {venda.observacoes}</div>
          </>
        )}
        <hr className="cupom-divisor" />
        <div className="cupom-centro" style={{ marginTop: 6 }}>OBRIGADO PELA PREFERÊNCIA!</div>
        <div className="cupom-centro" style={{ fontSize: 10, marginTop: 4 }}>{fmtData(new Date().toISOString())}</div>
      </div>
    </>
  );
}

// ==================== HISTÓRICO ====================

function Historico({ user }) {
  const [vendas, setVendas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [filtroForma, setFiltroForma] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [detalhe, setDetalhe] = useState(null);
  const [mensagem, setMensagem] = useState("");

  const podeCancelar = user.role === "ADMIN" || user.role === "GERENTE";

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
      setVendas(data);
    } catch (err) {
      setErro(err.message);
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
      alert(err.message);
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
      alert(err.message);
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
        <Card titulo="Total" valor={stats.total} cor={C.text} />
        <Card titulo="Concluídas" valor={stats.concluidas} cor={C.green} />
        <Card titulo="Canceladas" valor={stats.canceladas} cor={C.red} />
        <Card titulo="Faturamento" valor={fmtBRL(stats.totalVendido)} cor={C.accent} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filtroForma} onChange={e => setFiltroForma(e.target.value)} style={selectCompacto}>
          <option value="">Todas as formas</option>
          {FORMAS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={selectCompacto}>
          <option value="">Todos os status</option>
          <option value="CONCLUIDA">Concluídas</option>
          <option value="CANCELADA">Canceladas</option>
        </select>
        <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={selectCompacto} />
        <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={selectCompacto} />
        {(filtroForma || filtroStatus || dataInicio || dataFim) && (
          <button onClick={() => { setFiltroForma(""); setFiltroStatus(""); setDataInicio(""); setDataFim(""); }} style={{
            background: C.surface, border: `1px solid ${C.border}`, color: C.muted,
            borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer",
          }}>Limpar filtros</button>
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
          display: "grid", gridTemplateColumns: "150px 80px 1.5fr 120px 100px 90px 130px 110px",
          padding: "12px 16px", background: C.surface,
          borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700,
          color: C.muted, textTransform: "uppercase", letterSpacing: 0.5,
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
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Carregando...</div>
        ) : vendas.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Nenhuma venda encontrada.</div>
        ) : vendas.map(v => {
          const st = STATUS_INFO[v.status] || STATUS_INFO.CONCLUIDA;
          return (
            <div key={v.id} style={{
              display: "grid", gridTemplateColumns: "150px 80px 1.5fr 120px 100px 90px 130px 110px",
              padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
              alignItems: "center", fontSize: 13,
              opacity: v.status === "CANCELADA" ? 0.6 : 1,
            }}>
              <div style={{ color: C.muted, fontSize: 12 }}>{fmtData(v.createdAt)}</div>
              <div style={{ color: C.white, fontFamily: "monospace", fontWeight: 700 }}>#{v.numero}</div>
              <div>
                <div style={{ color: C.white, fontWeight: 600, fontSize: 13 }}>
                  {v.cliente?.nome || "— Consumidor —"}
                </div>
                <div style={{ color: C.muted, fontSize: 11 }}>por {v.user?.nome}</div>
              </div>
              <div style={{ color: C.text, fontSize: 12 }}>{FORMA_LABEL[v.formaPagamento] || v.formaPagamento}</div>
              <div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                  background: st.cor + "22", color: st.cor, border: `1px solid ${st.cor}55`,
                }}>{st.label}</span>
              </div>
              <div style={{ textAlign: "right", color: C.text }}>{v._count?.itens || 0}</div>
              <div style={{ textAlign: "right", color: C.green, fontWeight: 700, fontSize: 14 }}>{fmtBRL(v.total)}</div>
              <div style={{ textAlign: "right" }}>
                <button onClick={() => abrirDetalhe(v.id)} style={btnIcone(C.accent)}>Ver</button>
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
        />
      )}
    </div>
  );
}

function Card({ titulo, valor, cor }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{titulo}</div>
      <div style={{ color: cor, fontSize: 20, fontWeight: 800, marginTop: 6 }}>{valor}</div>
    </div>
  );
}

function DetalheVendaModal({ venda, onFechar, onCancelar }) {
  const st = STATUS_INFO[venda.status] || STATUS_INFO.CONCLUIDA;
  return (
    <div onClick={onFechar} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 720 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ color: C.white, fontWeight: 700, fontSize: 18 }}>Venda #{venda.numero}</div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                background: st.cor + "22", color: st.cor, border: `1px solid ${st.cor}55`,
              }}>{st.label}</span>
            </div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{fmtData(venda.createdAt)}</div>
          </div>
          <button type="button" onClick={onFechar} style={{
            background: "transparent", border: "none", color: C.muted, fontSize: 22, cursor: "pointer",
          }}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <Bloco titulo="Cliente">
            {venda.cliente ? (
              <>
                <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{venda.cliente.nome}</div>
                {venda.cliente.cpfCnpj && <div style={{ color: C.muted, fontSize: 11 }}>{venda.cliente.cpfCnpj}</div>}
              </>
            ) : (
              <div style={{ color: C.muted, fontSize: 13 }}>— Consumidor —</div>
            )}
          </Bloco>
          <Bloco titulo="Vendedor">
            <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{venda.user?.nome}</div>
            <div style={{ color: C.muted, fontSize: 11 }}>{venda.user?.role}</div>
          </Bloco>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
          <div style={{
            display: "grid", gridTemplateColumns: "2.5fr 80px 130px 130px",
            padding: "10px 14px", background: C.bg, borderBottom: `1px solid ${C.border}`,
            fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase",
          }}>
            <div>Produto</div>
            <div style={{ textAlign: "right" }}>Qtd</div>
            <div style={{ textAlign: "right" }}>Preço unit.</div>
            <div style={{ textAlign: "right" }}>Subtotal</div>
          </div>
          {venda.itens?.map(it => (
            <div key={it.id} style={{
              display: "grid", gridTemplateColumns: "2.5fr 80px 130px 130px",
              padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
              alignItems: "center", fontSize: 13,
            }}>
              <div>
                <div style={{ color: C.white, fontWeight: 600 }}>{it.produto?.nome}</div>
                <div style={{ color: C.muted, fontFamily: "monospace", fontSize: 11 }}>{it.produto?.codigo}</div>
              </div>
              <div style={{ textAlign: "right", color: C.text }}>{it.quantidade} {it.produto?.unidade || ""}</div>
              <div style={{ textAlign: "right", color: C.text }}>{fmtBRL(it.precoUnitario)}</div>
              <div style={{ textAlign: "right", color: C.green, fontWeight: 600 }}>{fmtBRL(it.subtotal)}</div>
            </div>
          ))}
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
            <span style={{ color: C.muted }}>Forma de pagamento:</span>
            <span style={{ color: C.white, fontWeight: 600 }}>{FORMA_LABEL[venda.formaPagamento]}</span>
          </div>
          {Number(venda.desconto) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: C.muted }}>Desconto:</span>
              <span style={{ color: C.red, fontWeight: 600 }}>− {fmtBRL(venda.desconto)}</span>
            </div>
          )}
          {venda.observacoes && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: C.muted }}>Obs:</span>
              <span style={{ color: C.text }}>{venda.observacoes}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 800, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
            <span style={{ color: C.muted }}>TOTAL</span>
            <span style={{ color: C.green }}>{fmtBRL(venda.total)}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", marginTop: 18 }}>
          {onCancelar ? (
            <button onClick={onCancelar} style={{
              background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red,
              borderRadius: 8, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>
              Cancelar venda (estornar estoque)
            </button>
          ) : <div />}
          <button onClick={onFechar} style={{
            background: C.surface, border: `1px solid ${C.border}`, color: C.text,
            borderRadius: 8, padding: "10px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer",
          }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function Bloco({ titulo, children }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
      <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{titulo.toUpperCase()}</div>
      {children}
    </div>
  );
}

// ==================== ESTILOS COMUNS ====================

function tabBtn(ativo) {
  return {
    padding: "10px 18px", borderRadius: 8, border: "none", cursor: "pointer",
    fontWeight: 700, fontSize: 13,
    background: ativo ? C.accent : C.card,
    color: ativo ? C.white : C.muted,
  };
}

const labelStyle = {
  display: "block", color: "#64748b", fontSize: 11, marginBottom: 4, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: 0.3,
};

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  background: "#1a1d27", border: "1px solid #2e3354",
  borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 13, outline: "none",
};

const selectCompacto = {
  background: "#1a1d27", border: "1px solid #2e3354", borderRadius: 8,
  padding: "9px 12px", color: "#e2e8f0", fontSize: 13, outline: "none",
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

function btnIcone(cor) {
  return {
    background: cor + "22", border: `1px solid ${cor}55`, color: cor,
    borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600,
    cursor: "pointer",
  };
}
