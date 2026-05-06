import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { C } from "./lib/theme.js";
import { api, BASE_URL } from "./lib/api.js";
import { useConfiguracaoEmpresa, formatarEndereco } from "./HeaderRelatorio.jsx";
import { urlLogotipo } from "./Configuracoes.jsx";
import { GerenciarFormasModal } from "./Financeiro.jsx";
import { useModalKeys } from "./lib/modalKeys.js";

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

export default function PDV({ user, onSair, sair }) {
  const [aba, setAba] = useState("nova");
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <PDVHeader
        user={user}
        aba={aba} setAba={setAba}
        onSair={onSair} sairConta={sair}
      />
      <div style={{ padding: "18px 24px", flex: 1 }}>
        {aba === "nova" ? <NovaVenda user={user} /> : <Historico user={user} />}
      </div>
    </div>
  );
}

// ==================== HEADER DO MODO PDV ====================
// Header proprio do PDV em modo focado: logo + tabs + avatar com dropdown
// (Menu / Sair). Substitui sidebar e topbar globais quando o user esta no
// PDV. "Menu" volta para a tela principal (dashboard); "Sair" desloga.
function PDVHeader({ user, aba, setAba, onSair, sairConta }) {
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function onClickFora(e) {
      if (menuAberto && menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuAberto(false);
      }
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, [menuAberto]);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16,
      padding: "10px 24px", borderBottom: `1px solid ${C.border}`,
      background: C.surface, position: "sticky", top: 0, zIndex: 30,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 22 }}>🏪</div>
        <div>
          <div style={{ color: C.white, fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>GestãoPRO</div>
          <div style={{ color: C.muted, fontSize: 10 }}>Ponto de Venda</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginLeft: 12 }}>
        <button onClick={() => setAba("nova")} style={tabBtn(aba === "nova")}>🛒 Nova Venda</button>
        <button onClick={() => setAba("historico")} style={tabBtn(aba === "historico")}>📜 Histórico</button>
      </div>

      <div style={{ flex: 1 }} />

      <div ref={menuRef} style={{ position: "relative" }}>
        <button
          onClick={() => setMenuAberto(v => !v)}
          title="Menu / Sair do PDV"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "6px 10px 6px 6px", cursor: "pointer",
            color: C.text, fontSize: 12,
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 13,
          }}>{(user.nome || "?").charAt(0)}</div>
          <div style={{ textAlign: "left", lineHeight: 1.2, maxWidth: 180, overflow: "hidden" }}>
            <div style={{ color: C.white, fontWeight: 700, fontSize: 12, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
              {user.nome}
            </div>
            <div style={{ color: C.muted, fontSize: 10 }}>{user.role}</div>
          </div>
          <span style={{ color: C.muted, fontSize: 10 }}>▾</span>
        </button>

        {menuAberto && (
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, minWidth: 220,
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)", overflow: "hidden", zIndex: 50,
          }}>
            <button
              onClick={() => { setMenuAberto(false); onSair?.(); }}
              style={menuItemStyle}
              onMouseEnter={e => e.currentTarget.style.background = C.surface}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span>🏠</span><span>Menu principal</span>
            </button>
            <div style={{ borderTop: `1px solid ${C.border}` }} />
            <button
              onClick={() => { setMenuAberto(false); sairConta?.(); }}
              style={{ ...menuItemStyle, color: C.red }}
              onMouseEnter={e => e.currentTarget.style.background = C.red + "11"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span>🚪</span><span>Sair da conta</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const menuItemStyle = {
  display: "flex", alignItems: "center", gap: 10, width: "100%",
  background: "transparent", border: "none", color: C.text,
  padding: "10px 14px", fontSize: 13, cursor: "pointer", textAlign: "left",
  fontFamily: "inherit",
};


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
  const [caixaAtual, setCaixaAtual] = useState(null);
  const [caixaCarregando, setCaixaCarregando] = useState(true);
  const [painel, setPainel] = useState({ topProdutos: [], ultimasVendas: [], resumoDia: null });
  const [vendaDetalheAberta, setVendaDetalheAberta] = useState(null);
  const [sugestaoIdx, setSugestaoIdx] = useState(0); // índice destacado nas sugestões
  const [qtdModalProduto, setQtdModalProduto] = useState(null); // produto p/ modal de qtd
  const [qtdModalValor, setQtdModalValor] = useState("1");
  const [formasCustom, setFormasCustom] = useState([]);
  const [formaCustomId, setFormaCustomId] = useState(null); // null = padrao; id = custom
  const [gerenciarFormasAberto, setGerenciarFormasAberto] = useState(false);
  const buscaRef = useRef(null);
  const finalizarRef = useRef(null);
  const valorRecebidoRef = useRef(null);
  const qtdInputRef = useRef(null);
  const qtdConfirmarRef = useRef(null);

  const algumaModalAberta = pagamentoAberto || cancelarAberto || !!reciboAberto || !!qtdModalProduto;
  const semCaixa = !caixaCarregando && !caixaAtual;

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

  const recarregarCaixa = useCallback(() => {
    return api.obterCaixaAtual()
      .then(r => setCaixaAtual(r.caixa))
      .catch(() => setCaixaAtual(null));
  }, []);

  const recarregarPainel = useCallback(() => {
    return api.obterPainelPDV()
      .then(setPainel)
      .catch(() => {});
  }, []);

  const recarregarFormasCustom = useCallback(() => {
    return api.listarFormasPagamento({ ativo: "true" })
      .then(lista => setFormasCustom(Array.isArray(lista) ? lista : []))
      .catch(() => setFormasCustom([]));
  }, []);

  useEffect(() => {
    api.listarProdutos({ ativo: "true" }).then(setProdutos).catch(() => {});
    api.listarClientes({ ativo: "true" }).then(setClientes).catch(() => {});
    recarregarCaixa().finally(() => setCaixaCarregando(false));
    recarregarPainel();
    recarregarFormasCustom();
  }, [recarregarCaixa, recarregarPainel, recarregarFormasCustom]);

  useEffect(() => {
    buscaRef.current?.focus();
  }, []);

  // Sugestões aparecem só com texto digitado — vista limpa quando idle, focada
  // em bipagem por scanner. Servicos sempre aparecem (estoque nao se aplica).
  // Busca tambem por codigo de barras e referencia para integrar scanner +
  // catalogos que usam SKU do fornecedor.
  const sugestoes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    return produtos
      .filter(p => p.ativo && (p.tipoItem === "SERVICO" || p.estoque > 0))
      .filter(p =>
        p.codigo.toLowerCase().includes(q) ||
        (p.codigoBarras || "").toLowerCase().includes(q) ||
        (p.referencia || "").toLowerCase().includes(q) ||
        p.nome.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [busca, produtos]);

  // Índice destacado na lista clampeado contra o tamanho atual de `sugestoes`
  // (a lista encolhe à medida que o usuário digita). Para resetar a 0 quando o
  // texto muda, o setSugestaoIdx(0) é chamado direto no onChange do input.
  const sugestaoSelecionada = sugestoes.length > 0
    ? Math.min(Math.max(sugestaoIdx, 0), sugestoes.length - 1)
    : 0;

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

  // Abre o modal de quantidade para um produto da lista de sugestões. Em vez
  // de adicionar direto qtd=1, deixa o operador escolher (Enter confirma).
  function abrirQtdModal(produto) {
    if (produto.tipoItem !== "SERVICO" && produto.estoque <= 0) {
      flashErro(`Sem estoque de "${produto.nome}".`);
      return;
    }
    setQtdModalProduto(produto);
    setQtdModalValor("1");
    setTimeout(() => {
      qtdInputRef.current?.focus();
      qtdInputRef.current?.select();
    }, 0);
  }

  function fecharQtdModal() {
    setQtdModalProduto(null);
    setQtdModalValor("1");
    focarBusca();
  }

  function confirmarQtdModal() {
    if (!qtdModalProduto) return;
    const n = Math.max(1, parseInt(qtdModalValor, 10) || 0);
    if (qtdModalProduto.tipoItem !== "SERVICO" && n > qtdModalProduto.estoque) {
      flashErro(`Estoque insuficiente de "${qtdModalProduto.nome}" (disponível: ${qtdModalProduto.estoque}).`);
      return;
    }
    adicionarProduto(qtdModalProduto, n);
    setQtdModalProduto(null);
    setQtdModalValor("1");
  }

  // Bipagem: chamado ao pressionar Enter no campo de busca. Tenta match exato
  // primeiro pelo CODIGO DE BARRAS (caso 99% dos scanners), depois pelo codigo
  // interno, depois referencia — nesses casos adiciona qtd=1 direto (scanner).
  // Em falta, abre o modal de quantidade para a sugestão destacada.
  function biparOuConfirmar() {
    const q = busca.trim();
    if (!q) return;
    const ql = q.toLowerCase();
    const exato = produtos.find(p =>
      p.ativo && (
        (p.codigoBarras && p.codigoBarras.toLowerCase() === ql) ||
        p.codigo.toLowerCase() === ql ||
        (p.referencia && p.referencia.toLowerCase() === ql)
      )
    );
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
      abrirQtdModal(sugestoes[sugestaoSelecionada]);
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

  function limparCarrinho({ refocar = true } = {}) {
    setCarrinho([]);
    setClienteId("");
    setDesconto("0");
    setObservacoes("");
    setForma("DINHEIRO");
    setFormaCustomId(null);
    setErro("");
    setValorRecebido("");
    setBusca("");
    if (refocar) focarBusca();
  }

  // Selecao de forma de pagamento — separa default vs custom para ser
  // possivel destacar visualmente qual variante esta ativa.
  function selecionarFormaPadrao(enumId) {
    setForma(enumId);
    setFormaCustomId(null);
  }
  function selecionarFormaCustom(custom) {
    setForma(custom.baseFormaPagamento);
    setFormaCustomId(custom.id);
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
        selecionarFormaPadrao(FORMA_POR_TECLA[e.key]);
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
        if (pagamentoAbertoRef.current) confirmarPagamentoRef.current?.();
        else abrirPagamentoRef.current?.();
        return;
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
  const confirmarPagamentoRef = useRef(null);
  useEffect(() => { carrinhoRef.current = carrinho; }, [carrinho]);
  useEffect(() => { pagamentoAbertoRef.current = pagamentoAberto; }, [pagamentoAberto]);

  function abrirPagamento() {
    setErro("");
    if (semCaixa) { flashErro("Abra um caixa antes de finalizar uma venda."); return; }
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
      // Não refocar busca — o ReciboModal vai roubar foco para "Nova Venda".
      limparCarrinho({ refocar: false });
      recarregarCaixa();
      recarregarPainel();
    } catch (err) {
      setErro(err.message);
      focarBusca();
    } finally {
      setSalvando(false);
    }
  }
  useEffect(() => { confirmarPagamentoRef.current = confirmarPagamento; });

  // Atalhos universais (Esc fecha) em cada modal aberto.
  useModalKeys(cancelarAberto, {
    onClose: () => { setCancelarAberto(false); focarBusca(); },
  });
  useModalKeys(pagamentoAberto, {
    onClose: () => { if (!salvando) { setPagamentoAberto(false); focarBusca(); } },
  });
  useModalKeys(!!reciboAberto, {
    onClose: () => { setReciboAberto(null); focarBusca(); },
  });
  useModalKeys(!!vendaDetalheAberta, {
    onClose: () => { setVendaDetalheAberta(null); focarBusca(); },
  });
  useModalKeys(!!qtdModalProduto, {
    onClose: fecharQtdModal,
    onConfirm: confirmarQtdModal,
    permitirEnter: true,
  });

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

      {/* TOPO: alerta quando nao ha caixa aberto OU resumo de vendas do dia
          por forma de pagamento (info financeira detalhada — saldo, sangria,
          suprimento — fica restrita a tela do Caixa). */}
      {!caixaCarregando && (
        semCaixa ? (
          <div style={{
            background: C.red + "22", border: `1px solid ${C.red}66`, borderRadius: 10,
            padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, flexWrap: "wrap",
          }}>
            <div style={{ color: C.red, fontWeight: 700, fontSize: 14 }}>
              🔒 <b>Nenhum caixa aberto.</b> Você não pode registrar vendas sem caixa.
              Vá em <b style={{ color: C.white }}>Caixa → Abrir Caixa</b>.
            </div>
          </div>
        ) : (
          <FormasPagamentoTopo resumo={painel.resumoDia} />
        )
      )}

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
            onChange={e => { setBusca(e.target.value); setSugestaoIdx(0); }}
            onKeyDown={e => {
              if (e.key === "ArrowDown") {
                if (sugestoes.length > 0) {
                  e.preventDefault();
                  setSugestaoIdx(i => (i + 1) % sugestoes.length);
                }
                return;
              }
              if (e.key === "ArrowUp") {
                if (sugestoes.length > 0) {
                  e.preventDefault();
                  setSugestaoIdx(i => (i - 1 + sugestoes.length) % sugestoes.length);
                }
                return;
              }
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
                onMouseEnter={() => setSugestaoIdx(idx)}
                onMouseDown={e => { e.preventDefault(); abrirQtdModal(p); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 14px", cursor: "pointer",
                  borderTop: idx === 0 ? "none" : `1px solid ${C.border}`,
                  background: idx === sugestaoSelecionada ? C.accent + "33" : "transparent",
                  borderLeft: idx === sugestaoSelecionada ? `3px solid ${C.accent}` : "3px solid transparent",
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
                    {p.codigo}
                    {p.codigoBarras && <span style={{ color: C.accent }}> · 📊 {p.codigoBarras}</span>}
                    {" · "}{p.tipoItem === "SERVICO" ? "♾ disponível" : `${p.estoque} ${p.unidade}`}
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
            <AcessoRapido
              topProdutos={painel.topProdutos}
              ultimasVendas={painel.ultimasVendas}
              onAdicionar={(p) => {
                if (p.tipoItem !== "SERVICO" && p.estoque <= 0) {
                  flashErro(`Sem estoque de "${p.nome}".`);
                  return;
                }
                adicionarProduto(p, 1);
              }}
              onAbrirVenda={async (id) => {
                try {
                  const v = await api.obterVenda(id);
                  setVendaDetalheAberta(v);
                } catch (err) { flashErro(err.message); }
              }}
            />
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
          {carrinho.length > 0 && (
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
                disabled={semCaixa}
                title={semCaixa ? "Abra um caixa antes de finalizar" : ""}
                style={{
                  background: semCaixa ? C.surface : `linear-gradient(135deg, ${C.green}, #15803d)`,
                  color: C.white, border: "none", borderRadius: 10,
                  padding: "16px", fontWeight: 800, fontSize: 16,
                  cursor: semCaixa ? "not-allowed" : "pointer",
                  opacity: semCaixa ? 0.5 : 1,
                  boxShadow: semCaixa ? "none" : `0 4px 14px ${C.green}55`,
                  letterSpacing: 0.3,
                }}>
                {semCaixa ? "🔒 CAIXA FECHADO" : `✓ FINALIZAR — ${fmtBRL(total)}`}
                <div style={{ fontSize: 10, marginTop: 2, opacity: 0.85, fontWeight: 700 }}>F10</div>
              </button>
            </div>
          )}

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>
              Atalhos rápidos
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <BotaoAtalho
                tecla="F8" cor={C.red} label="Cancelar item"
                disabled={carrinho.length === 0}
                onClick={() => carrinho.length > 0 && setCancelarAberto(true)}
              />
              <BotaoAtalho
                tecla="F10" cor={C.green} label="Finalizar"
                disabled={carrinho.length === 0 || semCaixa}
                onClick={abrirPagamento}
              />
              <BotaoAtalho
                tecla="Esc" cor={C.text} label="Limpar busca"
                onClick={() => { setBusca(""); focarBusca(); }}
              />
              <BotaoAtalho
                tecla="Enter" cor={C.accent} label="Adicionar bipado"
                onClick={() => { biparOuConfirmar(); focarBusca(); }}
              />
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
                F1–F6 forma de pagamento
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {FORMAS.map(f => {
                  const ativo = forma === f.id && !formaCustomId;
                  return (
                    <button
                      key={f.id} type="button"
                      onClick={() => selecionarFormaPadrao(f.id)}
                      title={`${f.atalho} • ${f.label}`}
                      style={{
                        flex: "1 1 calc(33% - 4px)", minWidth: 0,
                        background: ativo ? C.accent + "33" : C.surface,
                        border: `1px solid ${ativo ? C.accent + "88" : C.border}`,
                        color: ativo ? C.white : C.text,
                        borderRadius: 6, padding: "5px 4px",
                        fontSize: 10, fontWeight: 700, cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                        lineHeight: 1.2,
                      }}
                    >
                      <span style={{ fontSize: 13 }}>{f.icone}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                        {f.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              {formasCustom.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ color: C.muted, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
                    Personalizadas
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {formasCustom.map(c => {
                      const ativo = formaCustomId === c.id;
                      return (
                        <button
                          key={c.id} type="button"
                          onClick={() => selecionarFormaCustom(c)}
                          title={`${c.nome} (${c.baseFormaPagamento})`}
                          style={{
                            flex: "1 1 calc(50% - 4px)", minWidth: 0,
                            background: ativo ? C.purple + "33" : C.surface,
                            border: `1px solid ${ativo ? C.purple + "88" : C.border}`,
                            color: ativo ? C.white : C.text,
                            borderRadius: 6, padding: "5px 4px",
                            fontSize: 10, fontWeight: 700, cursor: "pointer",
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                            lineHeight: 1.2,
                          }}
                        >
                          <span style={{ fontSize: 13 }}>{c.icone || "•"}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                            {c.nome}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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
            <div style={{
              marginTop: 8, color: C.muted, fontSize: 10, textAlign: "center",
              fontFamily: "monospace", letterSpacing: 0.3,
            }}>
              Esc fecha · clique no item para remover
            </div>
          </div>
        </div>
      )}

      {/* MODAL QUANTIDADE — abre ao escolher item via setas+Enter ou clique */}
      {qtdModalProduto && (
        <div
          onClick={fecharQtdModal}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20, zIndex: 110,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.card, border: `1px solid ${C.accent}66`, borderRadius: 14,
              width: "100%", maxWidth: 460, padding: 22,
              boxShadow: `0 12px 40px rgba(0,0,0,0.5)`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <FotoProduto
                url={qtdModalProduto.imagem}
                nome={qtdModalProduto.nome}
                tamanho={56}
                servico={qtdModalProduto.tipoItem === "SERVICO"}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.white, fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {qtdModalProduto.nome}
                </div>
                <div style={{ color: C.muted, fontFamily: "monospace", fontSize: 11, marginTop: 2 }}>
                  {qtdModalProduto.codigo}
                  {" · "}
                  {qtdModalProduto.tipoItem === "SERVICO"
                    ? "♾ disponível"
                    : `${qtdModalProduto.estoque} ${qtdModalProduto.unidade || "un"}`}
                </div>
                <div style={{ color: C.green, fontWeight: 700, fontSize: 14, marginTop: 2 }}>
                  {fmtBRL(qtdModalProduto.precoVenda)}
                </div>
              </div>
            </div>

            <label style={{ display: "block", color: C.muted, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>
              QUANTIDADE
            </label>
            <input
              ref={qtdInputRef}
              type="number"
              min="1"
              max={qtdModalProduto.tipoItem === "SERVICO" ? undefined : qtdModalProduto.estoque}
              value={qtdModalValor}
              onChange={e => setQtdModalValor(e.target.value)}
              style={{
                width: "100%", background: C.surface, border: `2px solid ${C.accent}66`,
                borderRadius: 10, padding: "16px 18px", color: C.white,
                fontSize: 28, fontWeight: 800, textAlign: "center", outline: "none",
                letterSpacing: 1,
              }}
            />

            {(() => {
              const n = Math.max(1, parseInt(qtdModalValor, 10) || 0);
              const sub = n * Number(qtdModalProduto.precoVenda);
              return (
                <div style={{
                  marginTop: 12, padding: "10px 14px",
                  background: C.surface, borderRadius: 8,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span style={{ color: C.muted, fontSize: 12, fontWeight: 700 }}>SUBTOTAL</span>
                  <span style={{ color: C.green, fontSize: 20, fontWeight: 800 }}>{fmtBRL(sub)}</span>
                </div>
              );
            })()}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={fecharQtdModal}
                style={{
                  flex: 1, background: "transparent", border: `1px solid ${C.border}`,
                  color: C.text, borderRadius: 10, padding: "12px", fontWeight: 700,
                  fontSize: 14, cursor: "pointer",
                }}
              >Cancelar</button>
              <button
                ref={qtdConfirmarRef}
                type="button"
                onClick={confirmarQtdModal}
                style={{
                  flex: 1, background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                  color: C.white, border: "none", borderRadius: 10,
                  padding: "12px", fontWeight: 800, fontSize: 14, cursor: "pointer",
                  boxShadow: `0 4px 14px ${C.accent}55`,
                }}
              >✓ Adicionar (Enter)</button>
            </div>
            <div style={{
              marginTop: 8, color: C.muted, fontSize: 10, textAlign: "center",
              fontFamily: "monospace", letterSpacing: 0.3,
            }}>
              Esc cancela · Enter adiciona à cestinha
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={labelStyle}>Forma de pagamento</label>
                <button
                  type="button"
                  onClick={() => setGerenciarFormasAberto(true)}
                  title="Cadastrar/editar formas de pagamento"
                  style={{
                    background: "transparent", border: "none", color: C.accent,
                    fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0,
                  }}
                >⚙ Gerenciar</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {FORMAS.map(f => {
                  const ativo = forma === f.id && !formaCustomId;
                  return (
                    <button key={f.id} onClick={() => selecionarFormaPadrao(f.id)} type="button" style={{
                      cursor: "pointer", padding: "10px 4px", borderRadius: 8,
                      background: ativo ? C.accent : C.surface,
                      border: ativo ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
                      color: ativo ? C.white : C.muted,
                      fontSize: 12, fontWeight: 700, textAlign: "center",
                    }}>
                      <div style={{ fontSize: 18 }}>{f.icone}</div>
                      <div>{f.label}</div>
                      <div style={{ fontSize: 9, opacity: 0.7 }}>{f.atalho}</div>
                    </button>
                  );
                })}
              </div>
              {formasCustom.length > 0 && (
                <>
                  <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 10, marginBottom: 4 }}>
                    Personalizadas
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                    {formasCustom.map(c => {
                      const ativo = formaCustomId === c.id;
                      return (
                        <button key={c.id} onClick={() => selecionarFormaCustom(c)} type="button" style={{
                          cursor: "pointer", padding: "10px 4px", borderRadius: 8,
                          background: ativo ? C.purple : C.surface,
                          border: ativo ? `1px solid ${C.purple}` : `1px solid ${C.border}`,
                          color: ativo ? C.white : C.muted,
                          fontSize: 12, fontWeight: 700, textAlign: "center",
                        }}>
                          <div style={{ fontSize: 18 }}>{c.icone || "•"}</div>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</div>
                          <div style={{ fontSize: 9, opacity: 0.7 }}>{c.baseFormaPagamento === "CARTAO_DEBITO" ? "Débito" : c.baseFormaPagamento === "CARTAO_CREDITO" ? "Crédito" : c.baseFormaPagamento.charAt(0) + c.baseFormaPagamento.slice(1).toLowerCase()}</div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
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
            <div style={{
              marginTop: 4, color: C.muted, fontSize: 10, textAlign: "right",
              fontFamily: "monospace", letterSpacing: 0.3,
            }}>
              Esc cancela · F10 confirma
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

      {vendaDetalheAberta && (
        <DetalheVendaModal
          venda={vendaDetalheAberta}
          onFechar={() => { setVendaDetalheAberta(null); focarBusca(); }}
        />
      )}

      {gerenciarFormasAberto && (
        <GerenciarFormasModal
          podeExcluir={user.role === "ADMIN"}
          onFechar={async () => {
            setGerenciarFormasAberto(false);
            await recarregarFormasCustom();
          }}
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

// ============== TOPO DO PDV: VENDAS DE HOJE POR FORMA DE PAGAMENTO ==============
// Substitui o antigo CaixaStatusCard. Saldo, sangria, suprimento e faturamento
// total deixam de aparecer aqui — tudo isso fica restrito a tela do Caixa,
// que e quem trata da gestao financeira do operador. Aqui exibimos apenas a
// quebra de vendas do dia por forma de pagamento, util para o operador
// acompanhar o mix sem virar uma KPI dashboard.
function FormasPagamentoTopo({ resumo }) {
  const r = resumo || { porForma: [] };
  const totalPagamentos = r.porForma.reduce((acc, f) => acc + f.total, 0) || 1;
  const FORMA_COR = {
    DINHEIRO: C.green, PIX: C.accent, CARTAO_DEBITO: "#0ea5e9",
    CARTAO_CREDITO: C.purple, BOLETO: C.yellow, CREDIARIO: C.muted,
  };
  const dataLabel = new Date().toLocaleDateString("pt-BR", {
    weekday: "short", day: "2-digit", month: "short",
  });

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: "12px 16px",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: r.porForma.length > 0 ? 10 : 8,
      }}>
        <div style={{
          color: C.muted, fontSize: 11, fontWeight: 700,
          letterSpacing: 0.4, textTransform: "uppercase",
        }}>
          📊 Vendas de hoje por forma de pagamento
        </div>
        <div style={{ color: C.muted, fontSize: 10 }}>{dataLabel}</div>
      </div>

      {r.porForma.length === 0 ? (
        <div style={{
          padding: "10px 12px", textAlign: "center", color: C.muted, fontSize: 12,
          background: C.surface, borderRadius: 8, border: `1px dashed ${C.border}`,
        }}>
          Nenhuma venda finalizada hoje ainda.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(r.porForma.length, 6)}, 1fr)`,
          gap: 16,
        }}>
          {r.porForma.map(f => {
            const pct = (f.total / totalPagamentos) * 100;
            const cor = FORMA_COR[f.formaPagamento] || C.accent;
            return (
              <div key={f.formaPagamento} style={{ minWidth: 0 }}>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "baseline", gap: 6,
                }}>
                  <span style={{
                    color: C.text, fontSize: 11, fontWeight: 600,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {FORMA_LABEL[f.formaPagamento] || f.formaPagamento}
                  </span>
                  <span style={{
                    color: cor, fontSize: 11, fontWeight: 700, fontFamily: "monospace",
                  }}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div style={{
                  color: cor, fontSize: 16, fontWeight: 800,
                  fontFamily: "monospace", marginTop: 2,
                }}>
                  {fmtBRL(f.total)}
                </div>
                <div style={{
                  height: 4, background: C.surface, borderRadius: 4,
                  overflow: "hidden", marginTop: 4,
                }}>
                  <div style={{
                    width: `${pct}%`, height: "100%", background: cor,
                    transition: "width 0.3s ease",
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============== ACESSO RAPIDO (cestinha vazia) ==============
// Mostrado no espaco antes ocupado por "Cestinha vazia". Combina chips dos
// produtos mais vendidos (clicaveis) com lista das ultimas vendas do caixa.
function AcessoRapido({ topProdutos, ultimasVendas, onAdicionar, onAbrirVenda }) {
  const semDados = (!topProdutos?.length) && (!ultimasVendas?.length);

  if (semDados) {
    return (
      <div style={{
        padding: "60px 30px", textAlign: "center", color: C.muted, fontSize: 14,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      }}>
        <div style={{ fontSize: 48, opacity: 0.5 }}>🛒</div>
        <div style={{ fontWeight: 600 }}>Cestinha vazia</div>
        <div style={{ fontSize: 12 }}>Bipe um produto ou digite o código no campo acima.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      {topProdutos?.length > 0 && (
        <div>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            marginBottom: 8,
          }}>
            <div style={{ color: C.text, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>
              ⚡ Mais vendidos (30 dias)
            </div>
            <div style={{ color: C.muted, fontSize: 11 }}>clique para adicionar</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
            {topProdutos.map(p => {
              const semEstoque = p.tipoItem !== "SERVICO" && p.estoque <= 0;
              return (
                <button
                  key={p.id} type="button"
                  onClick={() => !semEstoque && onAdicionar(p)}
                  disabled={semEstoque}
                  title={semEstoque ? "Sem estoque" : `Adicionar ${p.nome}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: 8, background: C.surface,
                    border: `1px solid ${semEstoque ? C.red + "33" : C.border}`,
                    borderRadius: 10, cursor: semEstoque ? "not-allowed" : "pointer",
                    textAlign: "left", opacity: semEstoque ? 0.5 : 1,
                    transition: "transform 0.1s, border-color 0.1s",
                  }}
                  onMouseEnter={e => { if (!semEstoque) e.currentTarget.style.borderColor = C.accent + "88"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = semEstoque ? C.red + "33" : C.border; }}
                >
                  <FotoProduto url={p.imagem} nome={p.nome} tamanho={42} servico={p.tipoItem === "SERVICO"} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: C.white, fontWeight: 600, fontSize: 12, lineHeight: 1.3,
                      overflow: "hidden", textOverflow: "ellipsis",
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    }}>{p.nome}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}>
                      <span style={{ color: C.green, fontWeight: 700, fontSize: 12 }}>{fmtBRL(p.precoVenda)}</span>
                      <span style={{ color: C.muted, fontSize: 10 }}>
                        {p.tipoItem === "SERVICO" ? "♾" : `${p.estoque} ${p.unidade}`}
                      </span>
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
          <div style={{
            color: C.text, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4,
            marginBottom: 8,
          }}>
            🧾 Últimas vendas deste caixa
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            {ultimasVendas.map((v, i) => (
              <button
                key={v.id} type="button"
                onClick={() => onAbrirVenda(v.id)}
                className="pdv-sugestao"
                style={{
                  display: "grid", gridTemplateColumns: "70px 1fr 90px 100px 70px",
                  alignItems: "center", gap: 10,
                  width: "100%", padding: "10px 12px",
                  background: "transparent",
                  border: "none", borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                  cursor: "pointer", color: C.text, textAlign: "left",
                  transition: "background 0.1s",
                }}
              >
                <div style={{ color: C.white, fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>
                  #{v.numero}
                </div>
                <div style={{ color: C.text, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {v.cliente?.nome || <span style={{ color: C.muted, fontStyle: "italic" }}>Consumidor</span>}
                </div>
                <div style={{ color: C.muted, fontSize: 11 }}>
                  {FORMA_LABEL[v.formaPagamento] || v.formaPagamento}
                </div>
                <div style={{ color: C.green, fontWeight: 700, fontSize: 13, textAlign: "right" }}>
                  {fmtBRL(v.total)}
                </div>
                <div style={{ color: C.muted, fontSize: 10, textAlign: "right" }}>
                  {new Date(v.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============== ATALHO CLICAVEL ==============
function BotaoAtalho({ tecla, label, cor, disabled, onClick }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      title={`Pressione ${tecla}`}
      style={{
        display: "flex", flexDirection: "column", alignItems: "flex-start",
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: "8px 10px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        textAlign: "left", lineHeight: 1.2,
        transition: "border-color 0.1s, background 0.1s",
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = cor + "88"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}
    >
      <span style={{ color: cor, fontWeight: 800, fontSize: 11, fontFamily: "monospace" }}>{tecla}</span>
      <span style={{ color: C.text, fontSize: 11, marginTop: 2 }}>{label}</span>
    </button>
  );
}

const btnQtd = {
  background: "#1a1d27", border: "1px solid #2e3354", color: "#e2e8f0",
  borderRadius: 6, width: 26, height: 26, fontSize: 14, fontWeight: 700, cursor: "pointer",
};

// ==================== RECIBO ====================

function ReciboModal({ venda, valorRecebido = 0, troco = 0, onFechar, modoReimpressao = false }) {
  const subtotalCupom = Number(venda.total) + Number(venda.desconto || 0);
  const mostrarRecebidoTroco = Number(valorRecebido) > 0;
  const empresa = useConfiguracaoEmpresa();
  const logoUrl = empresa ? urlLogotipo(empresa.logotipo) : null;
  const enderecoCompleto = empresa ? formatarEndereco(empresa) : "";
  const novaVendaBtnRef = useRef(null);

  // Foca o botão principal (Nova Venda no fluxo PDV; Fechar na reimpressão).
  // Tenta imediatamente e de novo apos ticks caso outro setTimeout(0) esteja
  // na fila — vence focarBusca() do parent quando vindo do PDV.
  useEffect(() => {
    novaVendaBtnRef.current?.focus();
    const t1 = setTimeout(() => novaVendaBtnRef.current?.focus(), 30);
    const t2 = setTimeout(() => novaVendaBtnRef.current?.focus(), 150);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

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
        .recibo-nova-venda:focus,
        .recibo-nova-venda:focus-visible {
          box-shadow: 0 0 0 3px ${C.accent}aa, 0 4px 14px ${C.accent}66;
          transform: translateY(-1px);
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
            <div style={{ fontSize: 48 }}>{modoReimpressao ? "🖨️" : "✅"}</div>
            <div style={{ color: C.white, fontSize: 22, fontWeight: 800, marginTop: 4 }}>
              {modoReimpressao ? "Reimpressão de Cupom" : "Venda Concluída!"}
            </div>
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
            <button
              ref={novaVendaBtnRef}
              onClick={onFechar}
              className="recibo-nova-venda"
              style={{
                flex: 1, background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                color: C.white, border: "none", borderRadius: 10,
                padding: "12px", fontWeight: 700, fontSize: 14, cursor: "pointer",
                outline: "none",
              }}
            >
              {modoReimpressao ? "Fechar" : "Nova Venda"}
            </button>
          </div>
          <div style={{
            marginTop: 8, color: C.muted, fontSize: 10, textAlign: "center",
            fontFamily: "monospace", letterSpacing: 0.3,
          }}>
            Esc fecha
          </div>
        </div>
      </div>

      {/* Cupom oculto, visível apenas na impressão */}
      <div className="cupom-imprimivel" aria-hidden="true">
        {logoUrl && (
          <div className="cupom-centro" style={{ marginBottom: 4 }}>
            <img src={logoUrl} alt="" style={{ maxHeight: 50, maxWidth: "70%", objectFit: "contain" }} />
          </div>
        )}
        <div className="cupom-centro cupom-bold">
          {empresa?.nomeFantasia || empresa?.razaoSocial || "GESTÃOPRO"}
        </div>
        {empresa?.nomeFantasia && empresa?.razaoSocial !== empresa?.nomeFantasia && (
          <div className="cupom-centro" style={{ fontSize: 10 }}>{empresa.razaoSocial}</div>
        )}
        {empresa?.cnpj && (
          <div className="cupom-centro" style={{ fontSize: 10 }}>CNPJ {empresa.cnpj}</div>
        )}
        {enderecoCompleto && (
          <div className="cupom-centro" style={{ fontSize: 10 }}>{enderecoCompleto}</div>
        )}
        {(empresa?.telefone || empresa?.email) && (
          <div className="cupom-centro" style={{ fontSize: 10 }}>
            {empresa.telefone}
            {empresa.telefone && empresa.email && " · "}
            {empresa.email}
          </div>
        )}
        <hr className="cupom-divisor" />
        <div className="cupom-centro cupom-bold">CUPOM DE VENDA</div>
        <div className="cupom-centro" style={{ fontSize: 10 }}>** NÃO É DOCUMENTO FISCAL **</div>
        {modoReimpressao && (
          <div className="cupom-centro cupom-bold" style={{ fontSize: 11, marginTop: 2 }}>
            ** 2ª VIA — REIMPRESSÃO **
          </div>
        )}
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
  const [reimpressao, setReimpressao] = useState(null);
  const [mensagem, setMensagem] = useState("");

  const podeCancelar = user.role === "ADMIN" || user.role === "GERENTE";

  useModalKeys(!!detalhe, { onClose: () => setDetalhe(null) });
  useModalKeys(!!reimpressao, { onClose: () => setReimpressao(null) });

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

  async function abrirReimpressao(id) {
    try {
      const v = await api.obterVenda(id);
      setReimpressao(v);
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
          display: "grid", gridTemplateColumns: "150px 80px 1.5fr 120px 100px 90px 130px 150px",
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
              display: "grid", gridTemplateColumns: "150px 80px 1.5fr 120px 100px 90px 130px 150px",
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
              <div style={{ textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => abrirDetalhe(v.id)} style={btnIcone(C.accent)}>Ver</button>
                {v.status === "CONCLUIDA" && (
                  <button
                    onClick={() => abrirReimpressao(v.id)}
                    style={btnIcone(C.green)}
                    title="Reimprimir cupom (2ª via)"
                  >🖨️</button>
                )}
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

function DetalheVendaModal({ venda, onFechar, onCancelar, onReimprimir }) {
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
          <div style={{ display: "flex", gap: 10 }}>
            {onReimprimir && (
              <button onClick={onReimprimir} style={{
                background: C.green + "22", border: `1px solid ${C.green}55`, color: C.green,
                borderRadius: 8, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}>
                🖨️ Reimprimir cupom
              </button>
            )}
            <button onClick={onFechar} style={{
              background: C.surface, border: `1px solid ${C.border}`, color: C.text,
              borderRadius: 8, padding: "10px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer",
            }}>Fechar</button>
          </div>
        </div>
        <div style={{
          marginTop: 8, color: C.muted, fontSize: 10, textAlign: "right",
          fontFamily: "monospace", letterSpacing: 0.3,
        }}>
          Esc fecha
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
