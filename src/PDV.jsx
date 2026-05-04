import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { C } from "./lib/theme.js";
import { api, BASE_URL } from "./lib/api.js";

function urlImagem(imagem) {
  if (!imagem) return null;
  if (/^https?:\/\//i.test(imagem)) return imagem;
  return `${BASE_URL}${imagem}`;
}

function FotoProduto({ url, nome, tamanho = 56, servico = false }) {
  const src = urlImagem(url);
  const estilo = {
    width: tamanho, height: tamanho, borderRadius: 10, flexShrink: 0,
    objectFit: "cover",
    border: `1px solid ${servico ? C.purple + "55" : C.border}`,
    background: servico ? C.purple + "22" : C.surface,
  };
  if (src) return <img src={src} alt={nome || ""} loading="lazy" style={estilo} />;
  return (
    <div style={{
      ...estilo, display: "flex", alignItems: "center", justifyContent: "center",
      color: servico ? C.purple : C.muted, fontSize: tamanho * 0.42,
    }}>{servico ? "🛠" : "📦"}</div>
  );
}


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
  const [cancelarAberto, setCancelarAberto] = useState(false);
  const [valorRecebido, setValorRecebido] = useState("");
  const [destacado, setDestacado] = useState(null); // produtoId recém-adicionado (para flash)
  const buscaRef = useRef(null);
  const finalizarRef = useRef(null);
  const valorRecebidoRef = useRef(null);

  const algumaModalAberta = pagamentoAberto || cancelarAberto || !!reciboAberto;

  const focarBusca = useCallback(() => {
    setTimeout(() => buscaRef.current?.focus(), 0);
  }, []);

  function flashErro(msg) {
    setErro(msg);
    setTimeout(() => setErro(""), 2500);
  }

  function destacar(produtoId) {
    setDestacado(produtoId);
    setTimeout(() => setDestacado(prev => (prev === produtoId ? null : prev)), 800);
  }

  useEffect(() => {
    api.listarProdutos({ ativo: "true" }).then(setProdutos).catch(() => {});
    api.listarClientes({ ativo: "true" }).then(setClientes).catch(() => {});
  }, []);

  useEffect(() => {
    buscaRef.current?.focus();
  }, []);

  // Sugestões aparecem só com texto digitado — vista limpa quando idle, focada
  // em bipagem por scanner. Servicos sempre aparecem (estoque nao se aplica).
  const sugestoes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    return produtos
      .filter(p => p.ativo && (p.tipoItem === "SERVICO" || p.estoque > 0))
      .filter(p =>
        p.codigo.toLowerCase().includes(q) ||
        p.nome.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [busca, produtos]);

  function adicionarProduto(p, qtd = 1) {
    const incremento = Math.max(1, parseInt(qtd, 10) || 1);
    const ehServico = p.tipoItem === "SERVICO";
    setCarrinho(prev => {
      const idx = prev.findIndex(it => it.produtoId === p.id);
      if (idx >= 0) {
        const qtdAtual = prev[idx].quantidade;
        // Servico: ignora limite de estoque.
        if (!ehServico && qtdAtual + incremento > p.estoque) {
          flashErro(`Estoque insuficiente de "${p.nome}" (disponível: ${p.estoque}).`);
          return prev;
        }
        // Move o item incrementado para o topo (UX típica de PDV).
        const atualizado = { ...prev[idx], quantidade: qtdAtual + incremento };
        const restante = prev.filter((_, i) => i !== idx);
        return [atualizado, ...restante];
      }
      if (!ehServico && p.estoque < incremento) {
        flashErro(`Estoque insuficiente de "${p.nome}" (disponível: ${p.estoque}).`);
        return prev;
      }
      const novoItem = {
        produtoId: p.id,
        codigo: p.codigo,
        nome: p.nome,
        unidade: p.unidade,
        // Para servicos guardamos Infinity como estoque "logico" — assim os
        // controles + e definirQuantidade nao bloqueiam nada.
        estoque: ehServico ? Infinity : p.estoque,
        tipoItem: p.tipoItem || "PRODUTO",
        precoUnitario: Number(p.precoVenda),
        imagem: p.imagem || null,
        quantidade: incremento,
      };
      return [novoItem, ...prev];
    });
    destacar(p.id);
    setBusca("");
    focarBusca();
  }

  // Bipagem: chamado ao pressionar Enter no campo de busca. Procura match exato
  // por código primeiro (caso comum de scanner); em falta, cai para a primeira
  // sugestão ativa filtrada — assim digitar parte do nome + Enter também funciona.
  function biparOuConfirmar() {
    const q = busca.trim();
    if (!q) return;
    const exato = produtos.find(p => p.ativo && p.codigo.toLowerCase() === q.toLowerCase());
    if (exato) {
      // Servicos nunca ficam "sem estoque".
      if (exato.tipoItem !== "SERVICO" && exato.estoque <= 0) {
        flashErro(`Sem estoque de "${exato.nome}".`);
        return;
      }
      adicionarProduto(exato, 1);
      return;
    }
    if (sugestoes.length > 0) {
      adicionarProduto(sugestoes[0], 1);
      return;
    }
    flashErro(`Nenhum produto encontrado para "${q}".`);
  }

  function alterarQuantidade(produtoId, delta) {
    setCarrinho(prev => prev.map(it => {
      if (it.produtoId !== produtoId) return it;
      const nova = it.quantidade + delta;
      if (nova <= 0) return it;
      // Servicos: estoque = Infinity, qualquer quantidade passa.
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
    focarBusca();
  }

  function limparCarrinho() {
    setCarrinho([]);
    setClienteId("");
    setDesconto("0");
    setObservacoes("");
    setForma("DINHEIRO");
    setErro("");
    setValorRecebido("");
    setBusca("");
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

  // Atalhos globais:
  //   F1-F6   forma de pagamento
  //   F8      abre modal "Cancelar Item"
  //   F10     abre modal de pagamento (finalizar venda)
  //   Esc     fecha modais auxiliares e refoca busca
  useEffect(() => {
    const FORMA_POR_TECLA = {
      F1: "DINHEIRO", F2: "PIX", F3: "CARTAO_DEBITO",
      F4: "CARTAO_CREDITO", F5: "BOLETO", F6: "CREDIARIO",
    };
    function onKeyDown(e) {
      if (FORMA_POR_TECLA[e.key]) {
        e.preventDefault();
        setForma(FORMA_POR_TECLA[e.key]);
        if (FORMA_POR_TECLA[e.key] === "DINHEIRO" && pagamentoAberto) {
          setTimeout(() => valorRecebidoRef.current?.focus(), 0);
        }
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        if (carrinhoRef.current.length === 0) {
          flashErro("Carrinho vazio — nada para cancelar.");
          return;
        }
        setCancelarAberto(true);
        return;
      }
      if (e.key === "F10") {
        e.preventDefault();
        if (!pagamentoAbertoRef.current) abrirPagamentoRef.current?.();
        return;
      }
      if (e.key === "Escape") {
        if (cancelarAberto) {
          setCancelarAberto(false);
          focarBusca();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelarAberto, pagamentoAberto]);

  // Refs vivas para handlers do listener global (evita re-bind a cada render).
  const carrinhoRef = useRef(carrinho);
  const pagamentoAbertoRef = useRef(pagamentoAberto);
  const abrirPagamentoRef = useRef(null);
  useEffect(() => { carrinhoRef.current = carrinho; }, [carrinho]);
  useEffect(() => { pagamentoAbertoRef.current = pagamentoAberto; }, [pagamentoAberto]);

  function abrirPagamento() {
    setErro("");
    if (carrinho.length === 0) { flashErro("Adicione ao menos um item"); return; }
    if (descontoNum > subtotal) { flashErro("Desconto não pode ser maior que o subtotal"); return; }
    setPagamentoAberto(true);
    setTimeout(() => {
      if (forma === "DINHEIRO") valorRecebidoRef.current?.focus();
      else finalizarRef.current?.focus();
    }, 50);
  }
  // Mantém a ref atualizada para o listener global.
  useEffect(() => { abrirPagamentoRef.current = abrirPagamento; });

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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{`
        @keyframes pdv-flash-novo {
          0%   { background: ${C.green}33; transform: translateX(-2px); }
          100% { background: transparent; transform: translateX(0); }
        }
        .pdv-item-novo { animation: pdv-flash-novo 0.7s ease-out; }
        .pdv-sugestao:hover { background: ${C.accent}22 !important; }
        .pdv-cancel-row:hover { background: ${C.red}22 !important; }
      `}</style>

      {/* BARRA DE BIPAGEM CENTRAL — autofocus permanente */}
      <div style={{
        position: "relative",
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14,
        boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 24 }}>📡</div>
          <input
            ref={buscaRef}
            placeholder="Bipe um produto ou digite código/nome — pressione Enter para adicionar"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); biparOuConfirmar(); }
              if (e.key === "Escape") { e.preventDefault(); setBusca(""); }
            }}
            onBlur={() => {
              // Refoco automático em ~120ms — só aplica quando nenhuma modal
              // está aberta (evita roubar foco de inputs do checkout/cancelar).
              setTimeout(() => {
                if (!algumaModalAberta && document.activeElement === document.body) {
                  buscaRef.current?.focus();
                }
              }, 120);
            }}
            style={{
              flex: 1, background: C.surface, border: `2px solid ${C.accent}55`,
              borderRadius: 10, padding: "16px 18px",
              color: C.white, fontSize: 18, fontWeight: 600, outline: "none",
              letterSpacing: 0.5,
            }}
          />
          <div style={{ color: C.muted, fontSize: 11, textAlign: "right", lineHeight: 1.4 }}>
            <div><b style={{ color: C.text }}>F8</b> cancelar item</div>
            <div><b style={{ color: C.green }}>F10</b> finalizar</div>
          </div>
        </div>

        {/* Sugestões dropdown — só aparece quando há texto digitado */}
        {sugestoes.length > 0 && (
          <div style={{
            position: "absolute", left: 14, right: 14, top: "100%", marginTop: 4,
            background: C.card, border: `1px solid ${C.accent}55`, borderRadius: 10,
            zIndex: 5, overflow: "hidden",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}>
            {sugestoes.map((p, idx) => (
              <div
                key={p.id}
                className="pdv-sugestao"
                onMouseDown={e => { e.preventDefault(); adicionarProduto(p, 1); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", cursor: "pointer",
                  borderTop: idx === 0 ? "none" : `1px solid ${C.border}`,
                  transition: "background 0.1s ease",
                }}
              >
                <FotoProduto url={p.imagem} nome={p.nome} tamanho={40} servico={p.tipoItem === "SERVICO"} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.white, fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                    {p.nome}
                    {p.tipoItem === "SERVICO" && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 4,
                        background: C.purple + "33", color: C.purple, letterSpacing: 0.4,
                      }}>SERVIÇO</span>
                    )}
                  </div>
                  <div style={{ color: C.muted, fontFamily: "monospace", fontSize: 11 }}>
                    {p.codigo} · {p.tipoItem === "SERVICO" ? "♾ disponível" : `${p.estoque} ${p.unidade}`}
                  </div>
                </div>
                <div style={{ color: C.green, fontWeight: 700, fontSize: 14 }}>{fmtBRL(p.precoVenda)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 7fr) minmax(280px, 3fr)", gap: 14, alignItems: "start" }}>
        {/* CESTINHA — 70% — fotos, novos no topo */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{
            padding: "14px 18px", background: C.surface, borderBottom: `1px solid ${C.border}`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ color: C.white, fontWeight: 700, fontSize: 16 }}>
              🛒 Cestinha — {carrinho.length} {carrinho.length === 1 ? "item" : "itens"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {carrinho.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCancelarAberto(true)}
                  style={{
                    background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red,
                    borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700,
                    cursor: "pointer",
                  }}
                  title="F8"
                >🗑 Cancelar item (F8)</button>
              )}
              {carrinho.length > 0 && (
                <button onClick={limparCarrinho} style={{
                  background: "transparent", border: `1px solid ${C.border}`, color: C.muted,
                  borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer",
                }}>Limpar tudo</button>
              )}
            </div>
          </div>

          {carrinho.length === 0 ? (
            <div style={{
              padding: "60px 30px", textAlign: "center", color: C.muted, fontSize: 14,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
            }}>
              <div style={{ fontSize: 48, opacity: 0.5 }}>🛒</div>
              <div style={{ fontWeight: 600 }}>Cestinha vazia</div>
              <div style={{ fontSize: 12 }}>Bipe um produto ou digite o código no campo acima.</div>
            </div>
          ) : (
            <div style={{ maxHeight: "calc(100vh - 320px)", overflowY: "auto" }}>
              {carrinho.map(it => (
                <div
                  key={it.produtoId}
                  className={destacado === it.produtoId ? "pdv-item-novo" : ""}
                  style={{
                    display: "flex", gap: 14, alignItems: "center",
                    padding: "14px 18px", borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <FotoProduto url={it.imagem} nome={it.nome} tamanho={64} servico={it.tipoItem === "SERVICO"} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.white, fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8 }}>
                      {it.nome}
                      {it.tipoItem === "SERVICO" && (
                        <span style={{
                          fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4,
                          background: C.purple + "22", color: C.purple, border: `1px solid ${C.purple}55`,
                          letterSpacing: 0.4,
                        }}>♾ SERVIÇO</span>
                      )}
                    </div>
                    <div style={{ color: C.muted, fontFamily: "monospace", fontSize: 11, marginTop: 2 }}>
                      {it.codigo}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button onClick={() => alterarQuantidade(it.produtoId, -1)} style={btnQtd}>−</button>
                        <input
                          type="number" min="1"
                          max={Number.isFinite(it.estoque) ? it.estoque : undefined}
                          value={it.quantidade}
                          onChange={e => definirQuantidade(it.produtoId, e.target.value)}
                          style={{
                            width: 54, textAlign: "center",
                            background: C.surface, border: `1px solid ${C.border}`,
                            borderRadius: 6, padding: "5px 6px", color: C.text, fontSize: 13, outline: "none",
                          }}
                        />
                        <button onClick={() => alterarQuantidade(it.produtoId, +1)} style={btnQtd}>+</button>
                      </div>
                      <div style={{ color: C.muted, fontSize: 12 }}>×</div>
                      <input
                        type="number" step="0.01" min="0" value={it.precoUnitario}
                        onChange={e => alterarPreco(it.produtoId, e.target.value)}
                        style={{
                          width: 96, textAlign: "right",
                          background: C.surface, border: `1px solid ${C.border}`,
                          borderRadius: 6, padding: "5px 8px", color: C.text, fontSize: 13, outline: "none",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <div style={{ color: C.green, fontWeight: 800, fontSize: 18 }}>
                      {fmtBRL(it.quantidade * it.precoUnitario)}
                    </div>
                    <button
                      onClick={() => removerItem(it.produtoId)}
                      title="Remover este item"
                      style={{
                        background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red,
                        borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", fontWeight: 700,
                      }}
                    >× Remover</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PAINEL DIREITO — totais + botão Finalizar */}
        <div style={{
          display: "flex", flexDirection: "column", gap: 12,
          position: "sticky", top: 14,
          maxHeight: "calc(100vh - 32px)", overflowY: "auto",
        }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <Linha label={`Itens (${carrinho.reduce((acc, it) => acc + it.quantidade, 0)})`} valor={fmtBRL(subtotal)} />
              {descontoNum > 0 && (
                <Linha label="Desconto" valor={`− ${fmtBRL(descontoNum)}`} cor={C.red} />
              )}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginTop: 6, padding: "16px 16px",
                background: C.surface, borderRadius: 10,
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
              }}>
                <div style={{ color: C.muted, fontSize: 12, fontWeight: 700, letterSpacing: 0.4 }}>TOTAL</div>
                <div style={{ color: C.green, fontSize: 28, fontWeight: 800 }}>{fmtBRL(total)}</div>
              </div>
            </div>

            {erro && !algumaModalAberta && (
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
                padding: "16px", fontWeight: 800, fontSize: 16,
                cursor: carrinho.length === 0 ? "not-allowed" : "pointer",
                opacity: carrinho.length === 0 ? 0.5 : 1,
                boxShadow: carrinho.length === 0 ? "none" : `0 4px 14px ${C.green}55`,
                letterSpacing: 0.3,
              }}>
              ✓ FINALIZAR — {fmtBRL(total)}
              <div style={{ fontSize: 10, marginTop: 2, opacity: 0.85, fontWeight: 700 }}>F10</div>
            </button>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
              Atalhos
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", fontSize: 12, color: C.muted }}>
              <b style={{ color: C.text }}>Enter</b><span>adicionar produto bipado</span>
              <b style={{ color: C.text }}>F1–F6</b><span>forma de pagamento</span>
              <b style={{ color: C.red }}>F8</b><span>cancelar item</span>
              <b style={{ color: C.green }}>F10</b><span>finalizar venda</span>
              <b style={{ color: C.text }}>Esc</b><span>limpar busca / fechar</span>
            </div>
          </div>

          <div style={{ color: C.muted, fontSize: 11, textAlign: "center" }}>
            Vendedor: <span style={{ color: C.text, fontWeight: 600 }}>{user.nome}</span>
          </div>
        </div>
      </div>

      {/* MODAL CANCELAR ITEM (F8) — clique no produto para remover */}
      {cancelarAberto && (
        <div
          onClick={() => { setCancelarAberto(false); focarBusca(); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20, zIndex: 100,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.card, border: `1px solid ${C.red}55`, borderRadius: 14,
              width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto",
              padding: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <div style={{ color: C.white, fontWeight: 800, fontSize: 18 }}>🗑 Cancelar item</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                  Clique no item para remover da venda atual.
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setCancelarAberto(false); focarBusca(); }}
                style={{
                  background: "transparent", border: "none", color: C.muted,
                  fontSize: 22, cursor: "pointer",
                }}
              >×</button>
            </div>

            {carrinho.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>
                Carrinho vazio.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {carrinho.map(it => (
                  <button
                    key={it.produtoId}
                    type="button"
                    className="pdv-cancel-row"
                    onClick={() => {
                      removerItem(it.produtoId);
                      // Se foi o último item, fecha o modal automaticamente.
                      if (carrinho.length === 1) setCancelarAberto(false);
                      focarBusca();
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 12px", background: C.surface,
                      border: `1px solid ${C.border}`, borderRadius: 10,
                      cursor: "pointer", textAlign: "left",
                      transition: "background 0.12s ease",
                    }}
                  >
                    <FotoProduto url={it.imagem} nome={it.nome} tamanho={48} servico={it.tipoItem === "SERVICO"} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: C.white, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.nome}
                      </div>
                      <div style={{ color: C.muted, fontSize: 11, fontFamily: "monospace" }}>
                        {it.codigo} · {it.quantidade} × {fmtBRL(it.precoUnitario)}
                      </div>
                    </div>
                    <div style={{ color: C.green, fontWeight: 700, fontSize: 14 }}>
                      {fmtBRL(it.quantidade * it.precoUnitario)}
                    </div>
                    <div style={{
                      background: C.red, color: C.white, fontSize: 12, fontWeight: 800,
                      padding: "5px 10px", borderRadius: 6,
                    }}>Remover</div>
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button
                type="button"
                onClick={() => { setCancelarAberto(false); focarBusca(); }}
                style={{
                  background: C.surface, border: `1px solid ${C.border}`, color: C.text,
                  borderRadius: 8, padding: "10px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer",
                }}
              >Fechar</button>
            </div>
          </div>
        </div>
      )}

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
                onClick={() => { if (!salvando) { setPagamentoAberto(false); focarBusca(); } }}
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
                onClick={() => { if (!salvando) { setPagamentoAberto(false); focarBusca(); } }}
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
          onFechar={() => { setReciboAberto(null); focarBusca(); }}
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
