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

// Quebra "1234.56" em { int: "1.234", dec: "56" } pra renderizar o R$ com
// rítmo tipográfico (símbolo + inteiros grandes + centavos menores).
const fmtPartes = (v) => {
  const n = Math.max(0, Number(v) || 0);
  const [int, dec] = n.toFixed(2).split(".");
  return {
    int: int.replace(/\B(?=(\d{3})+(?!\d))/g, "."),
    dec,
  };
};

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

const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

// Mapeamento de cor (CSS var name) por forma de pagamento — usado em pílulas
// e no dashboard de "vendas hoje por forma".
const FORMA_COR_VAR = {
  DINHEIRO: "var(--pdv-c-lime)",
  PIX: "var(--pdv-accent)",
  CARTAO_DEBITO: "var(--pdv-c-sky)",
  CARTAO_CREDITO: "var(--pdv-c-violet)",
  BOLETO: "var(--pdv-c-amber)",
  CREDIARIO: "var(--pdv-c-rose)",
};

const FORMA_COR_CLASSE = {
  DINHEIRO: "pdv-pay-c-lime",
  PIX: "pdv-pay-c-emerald",
  CARTAO_DEBITO: "pdv-pay-c-sky",
  CARTAO_CREDITO: "pdv-pay-c-violet",
  BOLETO: "pdv-pay-c-amber",
  CREDIARIO: "pdv-pay-c-rose",
};

export default function PDV({ user, onSair, sair }) {
  const [aba, setAba] = useState("nova");
  return (
    <div className="pdv-redesign" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <PDVHeader
        user={user}
        aba={aba} setAba={setAba}
        onSair={onSair} sairConta={sair}
      />
      <div className="pdv-app">
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

  const iniciais = (user.nome || "?")
    .split(" ").filter(Boolean).slice(0, 2)
    .map(p => p.charAt(0).toUpperCase()).join("") || "?";

  return (
    <header className="pdv-hdr">
      <div className="pdv-brand">
        <div className="pdv-brand-mark">G</div>
        <div>
          <div className="pdv-brand-name">GestãoPRO</div>
          <div className="pdv-brand-sub">Ponto de Venda</div>
        </div>
      </div>

      <nav className="pdv-nav">
        <button
          onClick={() => setAba("nova")}
          className={`pdv-nav-btn ${aba === "nova" ? "is-active" : ""}`}
        >
          {aba === "nova" && <span className="dot" />}
          Nova venda
        </button>
        <button
          onClick={() => setAba("historico")}
          className={`pdv-nav-btn ${aba === "historico" ? "is-active" : ""}`}
        >
          {aba === "historico" && <span className="dot" />}
          Histórico
        </button>
      </nav>

      <div style={{ flex: 1 }} />

      <div ref={menuRef} style={{ position: "relative" }}>
        <button
          onClick={() => setMenuAberto(v => !v)}
          title="Menu / Sair do PDV"
          className="pdv-user-chip"
        >
          <div className="pdv-user-av">{iniciais}</div>
          <div style={{ textAlign: "left" }}>
            <div className="pdv-user-name">{user.nome}</div>
            <div className="pdv-user-role">{user.role}</div>
          </div>
          <span style={{ color: "var(--pdv-t3)", fontSize: 10, marginLeft: 2 }}>▾</span>
        </button>

        {menuAberto && (
          <div className="pdv-user-menu">
            <button
              onClick={() => { setMenuAberto(false); onSair?.(); }}
              className="pdv-user-menu-item"
            >
              <span>🏠</span><span>Menu principal</span>
            </button>
            <div style={{ borderTop: "1px solid var(--pdv-line)" }} />
            <button
              onClick={() => { setMenuAberto(false); sairConta?.(); }}
              className="pdv-user-menu-item is-danger"
            >
              <span>🚪</span><span>Sair da conta</span>
            </button>
          </div>
        )}
      </div>
    </header>
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

  const [scanFocused, setScanFocused] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* TOPO: alerta quando nao ha caixa aberto OU resumo de vendas do dia
          por forma de pagamento (info financeira detalhada — saldo, sangria,
          suprimento — fica restrita a tela do Caixa). */}
      {!caixaCarregando && (
        semCaixa ? (
          <div className="pdv-no-cash">
            <span style={{ fontSize: 18 }}>🔒</span>
            <div>
              <b>Nenhum caixa aberto.</b> Você não pode registrar vendas sem caixa.
              Vá em <b>Caixa → Abrir Caixa</b>.
            </div>
          </div>
        ) : (
          <FormasPagamentoTopo resumo={painel.resumoDia} />
        )
      )}

      {/* BARRA DE BIPAGEM CENTRAL — autofocus permanente */}
      <div className={`pdv-scan ${scanFocused ? "is-focused" : ""}`}>
        <div className="pdv-scan-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7V5a1 1 0 0 1 1-1h2"/>
            <path d="M20 7V5a1 1 0 0 0-1-1h-2"/>
            <path d="M4 17v2a1 1 0 0 0 1 1h2"/>
            <path d="M20 17v2a1 1 0 0 1-1 1h-2"/>
            <path d="M4 12h16"/>
          </svg>
        </div>
        <input
          ref={buscaRef}
          placeholder="Bipe um produto ou digite código/nome — pressione Enter para adicionar"
          value={busca}
          onChange={e => { setBusca(e.target.value); setSugestaoIdx(0); }}
          onFocus={() => setScanFocused(true)}
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
            setScanFocused(false);
            // Refoco automático em ~120ms — só aplica quando nenhuma modal
            // está aberta (evita roubar foco de inputs do checkout/cancelar).
            setTimeout(() => {
              if (!algumaModalAberta && document.activeElement === document.body) {
                buscaRef.current?.focus();
              }
            }, 120);
          }}
        />
        <span className="pdv-scan-hint">
          <span className="pdv-kbd">/</span> focar &nbsp;·&nbsp;
          <span className="pdv-kbd is-accent">Enter</span> adicionar
        </span>

        {/* Sugestões dropdown — só aparece quando há texto digitado */}
        {sugestoes.length > 0 && (
          <div className="pdv-scan-sugg">
            {sugestoes.map((p, idx) => {
              const ativo = idx === sugestaoSelecionada;
              return (
                <div
                  key={p.id}
                  onMouseEnter={() => setSugestaoIdx(idx)}
                  onMouseDown={e => { e.preventDefault(); abrirQtdModal(p); }}
                  className={`pdv-scan-sugg-row ${ativo ? "is-active" : ""}`}
                >
                  <FotoProduto url={p.imagem} nome={p.nome} tamanho={38} servico={p.tipoItem === "SERVICO"} />
                  <div className="pdv-scan-sugg-name">
                    <div className="nm">
                      {p.nome}
                      {p.tipoItem === "SERVICO" && <span className="pdv-srv-tag">SERVIÇO</span>}
                    </div>
                    <div className="meta">
                      {p.codigo}
                      {p.codigoBarras && <> · 📊 {p.codigoBarras}</>}
                      {" · "}{p.tipoItem === "SERVICO" ? "♾ disponível" : `${p.estoque} ${p.unidade}`}
                    </div>
                  </div>
                  <div className="pdv-scan-sugg-price">{fmtBRL(p.precoVenda)}</div>
                  {ativo && <span className="pdv-kbd is-accent">↵</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pdv-main">
        {/* CESTINHA — fotos, novos no topo */}
        <div className="pdv-card">
          <div className="pdv-card-hd" style={{ borderBottom: "1px solid var(--pdv-line)" }}>
            <div className="pdv-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="20" r="1.4"/>
                <circle cx="17" cy="20" r="1.4"/>
                <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6"/>
              </svg>
              Cestinha
              <span className="pill">{carrinho.length} {carrinho.length === 1 ? "item" : "itens"}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {carrinho.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCancelarAberto(true)}
                  className="pdv-btn-rm"
                  style={{ color: "var(--pdv-c-rose)", borderColor: "rgba(251,113,133,.35)" }}
                  title="F8"
                >Cancelar item · F8</button>
              )}
              {carrinho.length > 0 && (
                <button onClick={limparCarrinho} className="pdv-btn-rm">
                  Limpar tudo
                </button>
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
            <div className="pdv-cart-list">
              {carrinho.map(it => (
                <div
                  key={it.produtoId}
                  className={`pdv-cart-item ${destacado === it.produtoId ? "is-new" : ""}`}
                >
                  <FotoProduto url={it.imagem} nome={it.nome} tamanho={56} servico={it.tipoItem === "SERVICO"} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pdv-cart-item-name">
                      {it.nome}
                      {it.tipoItem === "SERVICO" && (
                        <span className="pdv-srv-tag">♾ SERVIÇO</span>
                      )}
                    </div>
                    <div className="pdv-cart-item-code">{it.codigo}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                      <div className="pdv-qty">
                        <button onClick={() => alterarQuantidade(it.produtoId, -1)}>−</button>
                        <input
                          type="number" min="1"
                          max={Number.isFinite(it.estoque) ? it.estoque : undefined}
                          value={it.quantidade}
                          onChange={e => definirQuantidade(it.produtoId, e.target.value)}
                        />
                        <button onClick={() => alterarQuantidade(it.produtoId, +1)}>+</button>
                      </div>
                      <span style={{ color: "var(--pdv-t3)", fontSize: 12 }}>×</span>
                      <input
                        type="number" step="0.01" min="0" value={it.precoUnitario}
                        onChange={e => alterarPreco(it.produtoId, e.target.value)}
                        className="pdv-input-preco"
                      />
                    </div>
                  </div>

                  <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                    <div className="pdv-cart-item-total">
                      {fmtBRL(it.quantidade * it.precoUnitario)}
                    </div>
                    <button
                      onClick={() => removerItem(it.produtoId)}
                      title="Remover este item"
                      className="pdv-btn-rm"
                    >× Remover</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PAINEL DIREITO — totais + botão Finalizar + atalhos */}
        <div className="pdv-side">
          {carrinho.length > 0 && (
            <div className="pdv-totals-card">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="pdv-totals-row">
                  <span>Subtotal · {carrinho.reduce((acc, it) => acc + it.quantidade, 0)} {carrinho.reduce((acc, it) => acc + it.quantidade, 0) === 1 ? "item" : "itens"}</span>
                  <strong>{fmtBRL(subtotal)}</strong>
                </div>
                {descontoNum > 0 && (
                  <div className="pdv-totals-row">
                    <span>Desconto</span>
                    <strong style={{ color: "var(--pdv-c-rose)" }}>− {fmtBRL(descontoNum)}</strong>
                  </div>
                )}
                <div className="pdv-total-block">
                  <div className="pdv-total-lbl">Total</div>
                  <TotalAnimado valor={total} />
                </div>
              </div>

              {erro && !algumaModalAberta && (
                <div className="pdv-erro-inline">{erro}</div>
              )}

              <button
                onClick={abrirPagamento}
                disabled={semCaixa}
                title={semCaixa ? "Abra um caixa antes de finalizar" : ""}
                className="pdv-btn-finalize"
              >
                {semCaixa ? <>🔒 Caixa fechado</> : <>Finalizar venda</>}
                <span className="pdv-kbd">F10</span>
                <span style={{ fontSize: 16 }}>→</span>
              </button>
            </div>
          )}

          <div className="pdv-pay-card">
            <div className="pdv-shortcuts-label">F1 – F6 forma de pagamento</div>
            <div className="pdv-pay-grid">
              {FORMAS.map(f => {
                const ativo = forma === f.id && !formaCustomId;
                const cor = FORMA_COR_CLASSE[f.id] || "pdv-pay-c-emerald";
                return (
                  <button
                    key={f.id} type="button"
                    onClick={() => selecionarFormaPadrao(f.id)}
                    title={`${f.atalho} • ${f.label}`}
                    className={`pdv-pay-btn ${cor} ${ativo ? "is-active" : ""}`}
                  >
                    <div className="pay-row">
                      <div className="pay-icon">{f.icone}</div>
                      <span className="pay-key">{f.atalho}</span>
                    </div>
                    <div className="pay-lbl">{f.label}</div>
                  </button>
                );
              })}
            </div>
            {formasCustom.length > 0 && (
              <>
                <div className="pdv-shortcuts-label" style={{ marginTop: 12 }}>Personalizadas</div>
                <div className="pdv-pay-grid">
                  {formasCustom.map(c => {
                    const ativo = formaCustomId === c.id;
                    const cor = FORMA_COR_CLASSE[c.baseFormaPagamento] || "pdv-pay-c-violet";
                    return (
                      <button
                        key={c.id} type="button"
                        onClick={() => selecionarFormaCustom(c)}
                        title={`${c.nome} (${c.baseFormaPagamento})`}
                        className={`pdv-pay-btn ${cor} ${ativo ? "is-active" : ""}`}
                      >
                        <div className="pay-row">
                          <div className="pay-icon">{c.icone || "•"}</div>
                          <span className="pay-key">CST</span>
                        </div>
                        <div className="pay-lbl">{c.nome}</div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="pdv-shortcuts">
            <div className="pdv-shortcuts-label">Atalhos rápidos</div>
            <div className="pdv-short-grid">
              <BotaoAtalho
                tecla="F8" tom="warn" label="Cancelar item"
                disabled={carrinho.length === 0}
                onClick={() => carrinho.length > 0 && setCancelarAberto(true)}
              />
              <BotaoAtalho
                tecla="F10" tom="ok" label="Finalizar"
                disabled={carrinho.length === 0 || semCaixa}
                onClick={abrirPagamento}
              />
              <BotaoAtalho
                tecla="Esc" tom="mut" label="Limpar busca"
                onClick={() => { setBusca(""); focarBusca(); }}
              />
              <BotaoAtalho
                tecla="Enter" tom="ok" label="Adicionar bipado"
                onClick={() => { biparOuConfirmar(); focarBusca(); }}
              />
            </div>
            <div style={{ color: "var(--pdv-t3)", fontSize: 11, textAlign: "center", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--pdv-line)" }}>
              Vendedor: <span style={{ color: "var(--pdv-t1)", fontWeight: 500 }}>{user.nome}</span>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL CANCELAR ITEM (F8) — clique no produto para remover */}
      {cancelarAberto && (
        <div
          onClick={() => { setCancelarAberto(false); focarBusca(); }}
          className="pdv-modal-bg"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="pdv-modal"
            style={{ width: "min(560px, calc(100vw - 32px))" }}
          >
            <div className="pdv-modal-hd">
              <div>
                <div className="pdv-modal-title">Cancelar item</div>
                <div className="pdv-modal-sub">Clique no item para remover da venda atual.</div>
              </div>
              <button
                type="button"
                onClick={() => { setCancelarAberto(false); focarBusca(); }}
                className="pdv-modal-x"
              >×</button>
            </div>

            <div className="pdv-modal-body">
              {carrinho.length === 0 ? (
                <div style={{ padding: "30px 0", textAlign: "center", color: "var(--pdv-t3)", fontSize: 13 }}>
                  Carrinho vazio.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 16 }}>
                  {carrinho.map(it => (
                    <button
                      key={it.produtoId}
                      type="button"
                      className="pdv-cancel-item"
                      onClick={() => {
                        removerItem(it.produtoId);
                        // Se foi o último item, fecha o modal automaticamente.
                        if (carrinho.length === 1) setCancelarAberto(false);
                        focarBusca();
                      }}
                    >
                      <FotoProduto url={it.imagem} nome={it.nome} tamanho={44} servico={it.tipoItem === "SERVICO"} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: "var(--pdv-t1)", fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {it.nome}
                        </div>
                        <div style={{ color: "var(--pdv-t3)", fontSize: 11, fontFamily: "'Geist Mono', monospace", marginTop: 2 }}>
                          {it.codigo} · {it.quantidade} × {fmtBRL(it.precoUnitario)}
                        </div>
                      </div>
                      <div style={{ color: "var(--pdv-accent)", fontWeight: 600, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>
                        {fmtBRL(it.quantidade * it.precoUnitario)}
                      </div>
                      <div className="pdv-cancel-item-tag">Remover</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="pdv-modal-foot" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => { setCancelarAberto(false); focarBusca(); }}
                className="pdv-btn-ghost"
              >Fechar <span className="pdv-kbd is-warn">Esc</span></button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL QUANTIDADE — abre ao escolher item via setas+Enter ou clique */}
      {qtdModalProduto && (
        <div
          onClick={fecharQtdModal}
          className="pdv-modal-bg"
          style={{ zIndex: 110 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="pdv-modal"
            style={{ width: "min(460px, calc(100vw - 32px))" }}
          >
            <div className="pdv-modal-hd">
              <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                <FotoProduto
                  url={qtdModalProduto.imagem}
                  nome={qtdModalProduto.nome}
                  tamanho={48}
                  servico={qtdModalProduto.tipoItem === "SERVICO"}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pdv-modal-title" style={{ fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {qtdModalProduto.nome}
                  </div>
                  <div className="pdv-modal-sub" style={{ fontFamily: "'Geist Mono', monospace" }}>
                    {qtdModalProduto.codigo}
                    {" · "}
                    {qtdModalProduto.tipoItem === "SERVICO"
                      ? "♾ disponível"
                      : `${qtdModalProduto.estoque} ${qtdModalProduto.unidade || "un"}`}
                    {" · "}
                    <span style={{ color: "var(--pdv-accent)", fontWeight: 600 }}>{fmtBRL(qtdModalProduto.precoVenda)}</span>
                  </div>
                </div>
              </div>
              <button type="button" onClick={fecharQtdModal} className="pdv-modal-x">×</button>
            </div>

            <div className="pdv-modal-body" style={{ paddingBottom: 12 }}>
              <label className="pdv-field-label">Quantidade</label>
              <input
                ref={qtdInputRef}
                type="number"
                min="1"
                max={qtdModalProduto.tipoItem === "SERVICO" ? undefined : qtdModalProduto.estoque}
                value={qtdModalValor}
                onChange={e => setQtdModalValor(e.target.value)}
                className="pdv-qty-input"
              />

              {(() => {
                const n = Math.max(1, parseInt(qtdModalValor, 10) || 0);
                const sub = n * Number(qtdModalProduto.precoVenda);
                return (
                  <div className="pdv-modal-amount" style={{ margin: "12px 0 0" }}>
                    <div>
                      <div className="pdv-modal-amount-lbl">Subtotal</div>
                      <div className="pdv-modal-amount-sub">{n} × {fmtBRL(qtdModalProduto.precoVenda)}</div>
                    </div>
                    <div className="pdv-modal-amount-num">
                      {(() => { const { int, dec } = fmtPartes(sub); return <><span className="cur">R$</span>{int}<span className="cents">,{dec}</span></>; })()}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="pdv-modal-foot">
              <button
                type="button"
                onClick={fecharQtdModal}
                className="pdv-btn-ghost"
              >Cancelar <span className="pdv-kbd is-warn">Esc</span></button>
              <button
                ref={qtdConfirmarRef}
                type="button"
                onClick={confirmarQtdModal}
                className="pdv-btn-finalize"
                style={{ flex: 1 }}
              >
                Adicionar à cestinha
                <span className="pdv-kbd">Enter</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {pagamentoAberto && (
        <div
          onClick={() => !salvando && setPagamentoAberto(false)}
          className="pdv-modal-bg"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="pdv-modal"
            style={{ width: "min(560px, calc(100vw - 32px))" }}
          >
            <div className="pdv-modal-hd">
              <div>
                <div className="pdv-modal-title">Finalizar venda</div>
                <div className="pdv-modal-sub">
                  {carrinho.length} {carrinho.length === 1 ? "item" : "itens"} · revise o total e selecione a forma de pagamento
                </div>
              </div>
              <button
                type="button"
                onClick={() => { if (!salvando) { setPagamentoAberto(false); focarBusca(); } }}
                className="pdv-modal-x"
              >×</button>
            </div>

            <div className="pdv-modal-body" style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 16 }}>
              <div className="pdv-modal-amount" style={{ margin: 0 }}>
                <div>
                  <div className="pdv-modal-amount-lbl">Total a receber</div>
                  <div className="pdv-modal-amount-sub">
                    {carrinho.reduce((a,it)=>a+it.quantidade,0)} produtos
                    {descontoNum > 0 && <> · desconto {fmtBRL(descontoNum)}</>}
                  </div>
                </div>
                <div className="pdv-modal-amount-num">
                  {(() => { const { int, dec } = fmtPartes(total); return <><span className="cur">R$</span>{int}<span className="cents">,{dec}</span></>; })()}
                </div>
              </div>

              <div>
                <label className="pdv-field-label">Cliente (opcional)</label>
                <select value={clienteId} onChange={e => setClienteId(e.target.value)} className="pdv-field-select">
                  <option value="">— Consumidor —</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label className="pdv-field-label" style={{ marginBottom: 0 }}>Forma de pagamento</label>
                  <button
                    type="button"
                    onClick={() => setGerenciarFormasAberto(true)}
                    title="Cadastrar/editar formas de pagamento"
                    style={{
                      background: "transparent", border: "none", color: "var(--pdv-accent)",
                      fontSize: 11.5, fontWeight: 500, cursor: "pointer", padding: 0,
                      fontFamily: "inherit",
                    }}
                  >⚙ Gerenciar</button>
                </div>
                <div className="pdv-pay-grid">
                  {FORMAS.map(f => {
                    const ativo = forma === f.id && !formaCustomId;
                    const cor = FORMA_COR_CLASSE[f.id] || "pdv-pay-c-emerald";
                    return (
                      <button
                        key={f.id} onClick={() => selecionarFormaPadrao(f.id)} type="button"
                        className={`pdv-pay-btn ${cor} ${ativo ? "is-active" : ""}`}
                      >
                        <div className="pay-row">
                          <div className="pay-icon">{f.icone}</div>
                          <span className="pay-key">{f.atalho}</span>
                        </div>
                        <div className="pay-lbl">{f.label}</div>
                      </button>
                    );
                  })}
                </div>
                {formasCustom.length > 0 && (
                  <>
                    <div className="pdv-shortcuts-label" style={{ marginTop: 12 }}>Personalizadas</div>
                    <div className="pdv-pay-grid">
                      {formasCustom.map(c => {
                        const ativo = formaCustomId === c.id;
                        const cor = FORMA_COR_CLASSE[c.baseFormaPagamento] || "pdv-pay-c-violet";
                        return (
                          <button
                            key={c.id} onClick={() => selecionarFormaCustom(c)} type="button"
                            className={`pdv-pay-btn ${cor} ${ativo ? "is-active" : ""}`}
                          >
                            <div className="pay-row">
                              <div className="pay-icon">{c.icone || "•"}</div>
                              <span className="pay-key">CST</span>
                            </div>
                            <div className="pay-lbl">{c.nome}</div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="pdv-field-label">Desconto (R$)</label>
                  <input type="number" step="0.01" min="0" value={desconto}
                    onChange={e => setDesconto(e.target.value)} className="pdv-field-input" />
                </div>
                {forma === "DINHEIRO" && (
                  <div>
                    <label className="pdv-field-label">Valor recebido (R$)</label>
                    <input
                      ref={valorRecebidoRef}
                      type="number" step="0.01" min="0"
                      value={valorRecebido}
                      onChange={e => setValorRecebido(e.target.value)}
                      placeholder="0,00"
                      className="pdv-field-input"
                      autoFocus
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="pdv-field-label">Observações</label>
                <input value={observacoes} onChange={e => setObservacoes(e.target.value)}
                  placeholder="Opcional" className="pdv-field-input" />
              </div>

              {mostrarTroco && valorRecebidoNum > 0 && (
                trocoFalta > 0 ? (
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 14px", borderRadius: 10,
                    background: "rgba(245,158,11,.10)", border: "1px solid rgba(245,158,11,.35)",
                  }}>
                    <div style={{ color: "var(--pdv-c-amber)", fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>
                      Falta receber
                    </div>
                    <div style={{ color: "var(--pdv-c-amber)", fontSize: 20, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {fmtBRL(trocoFalta)}
                    </div>
                  </div>
                ) : (
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "12px 14px", borderRadius: 10,
                    background: "color-mix(in oklab, var(--pdv-accent) 14%, var(--pdv-surf-2))",
                    border: "1px solid var(--pdv-accent-glow)",
                  }}>
                    <div style={{ color: "var(--pdv-accent)", fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>
                      Troco
                    </div>
                    <div style={{ color: "var(--pdv-accent)", fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {fmtBRL(troco)}
                    </div>
                  </div>
                )
              )}

              {erro && (
                <div className="pdv-erro-inline">{erro}</div>
              )}
            </div>

            <div className="pdv-modal-foot">
              <button
                type="button"
                onClick={() => { if (!salvando) { setPagamentoAberto(false); focarBusca(); } }}
                disabled={salvando}
                className="pdv-btn-ghost"
              >
                Cancelar <span className="pdv-kbd is-warn">Esc</span>
              </button>
              <button
                ref={finalizarRef}
                onClick={confirmarPagamento}
                disabled={salvando}
                className="pdv-btn-finalize"
                style={{ flex: 1 }}
              >
                {salvando ? "Confirmando…" : <>Confirmar pagamento · {fmtBRL(total)}</>}
                {!salvando && <span className="pdv-kbd">F10</span>}
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

// ============== TOPO DO PDV: VENDAS DE HOJE POR FORMA DE PAGAMENTO ==============
// Substitui o antigo CaixaStatusCard. Saldo, sangria, suprimento e faturamento
// total deixam de aparecer aqui — tudo isso fica restrito a tela do Caixa,
// que e quem trata da gestao financeira do operador. Aqui exibimos apenas a
// quebra de vendas do dia por forma de pagamento, util para o operador
// acompanhar o mix sem virar uma KPI dashboard.
function FormasPagamentoTopo({ resumo }) {
  const r = resumo || { porForma: [] };
  const totalPagamentos = r.porForma.reduce((acc, f) => acc + f.total, 0) || 1;
  const dataLabel = new Date().toLocaleDateString("pt-BR", {
    weekday: "short", day: "2-digit", month: "short",
  });

  return (
    <div className="pdv-dash">
      <div className="pdv-dash-hd">
        <div className="pdv-dash-title">
          <span style={{ color: "var(--pdv-accent)", fontSize: 13 }}>◆</span>
          Vendas de hoje por forma de pagamento
        </div>
        <div className="pdv-dash-date">{dataLabel}</div>
      </div>

      {r.porForma.length === 0 ? (
        <div className="pdv-dash-empty">
          Nenhuma venda finalizada hoje ainda.
        </div>
      ) : (
        <div
          className="pdv-dash-grid"
          style={{ gridTemplateColumns: `repeat(${Math.min(r.porForma.length, 6)}, minmax(0, 1fr))` }}
        >
          {r.porForma.map(f => {
            const pct = (f.total / totalPagamentos) * 100;
            const cor = FORMA_COR_VAR[f.formaPagamento] || "var(--pdv-accent)";
            return (
              <div key={f.formaPagamento} className="pdv-dash-block">
                <div className="pdv-dash-row">
                  <span className="pdv-dash-label-mut">
                    {FORMA_LABEL[f.formaPagamento] || f.formaPagamento}
                  </span>
                  <span className="pdv-dash-pct" style={{ color: cor }}>{pct.toFixed(0)}%</span>
                </div>
                <div className="pdv-dash-num" style={{ color: cor }}>
                  {fmtBRL(f.total)}
                </div>
                <div className="pdv-dash-bar">
                  <span style={{ width: `${pct}%`, background: cor }} />
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
      <div className="pdv-cart-empty">
        <div className="pdv-cart-empty-mark">🛒</div>
        <div>
          <div className="pdv-cart-empty-title">Cestinha vazia</div>
          <div className="pdv-cart-empty-sub">Bipe um produto, digite o código no campo acima ou escolha um dos mais vendidos.</div>
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
            <div className="helper">clique para adicionar</div>
          </div>
          <div className="pdv-top-grid">
            {topProdutos.map(p => {
              const semEstoque = p.tipoItem !== "SERVICO" && p.estoque <= 0;
              return (
                <button
                  key={p.id} type="button"
                  onClick={() => !semEstoque && onAdicionar(p)}
                  disabled={semEstoque}
                  title={semEstoque ? "Sem estoque" : `Adicionar ${p.nome}`}
                  className="pdv-top-card"
                >
                  <FotoProduto url={p.imagem} nome={p.nome} tamanho={42} servico={p.tipoItem === "SERVICO"} />
                  <div className="pdv-top-card-info">
                    <div className="pdv-top-card-name">{p.nome}</div>
                    <div className="pdv-top-card-foot">
                      <span className="pdv-top-card-price">{fmtBRL(p.precoVenda)}</span>
                      <span className="pdv-top-card-stock">
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
          <div className="pdv-section-hd" style={{ marginTop: 8 }}>
            <div className="pdv-card-title">
              <span style={{ color: "var(--pdv-t3)" }}>⏱</span>
              Últimas vendas deste caixa
            </div>
          </div>
          <div>
            {ultimasVendas.map((v) => {
              const cor = FORMA_COR_VAR[v.formaPagamento] || "var(--pdv-accent)";
              return (
                <button
                  key={v.id} type="button"
                  onClick={() => onAbrirVenda(v.id)}
                  className="pdv-rec-row"
                >
                  <div className="pdv-rec-id">#{v.numero}</div>
                  <div className={`pdv-rec-cust ${!v.cliente?.nome ? "is-empty" : ""}`}>
                    {v.cliente?.nome || "Consumidor"}
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
function BotaoAtalho({ tecla, label, tom = "mut", disabled, onClick }) {
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

// ============== TOTAL ANIMADO (cart sidebar) ==============
function TotalAnimado({ valor }) {
  const v = useCountUp(valor);
  const { int, dec } = fmtPartes(v);
  return (
    <span className="pdv-total-num">
      <span className="cur">R$</span>{int}<span className="cents">,{dec}</span>
    </span>
  );
}

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
          box-shadow: 0 0 0 3px var(--pdv-accent-glow), 0 6px 18px -6px var(--pdv-accent-glow), 0 1px 0 rgba(255,255,255,.2) inset;
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

      <div onClick={onFechar} className="pdv-modal-bg">
        <div onClick={e => e.stopPropagation()} className="pdv-modal" style={{ width: "min(500px, calc(100vw - 32px))" }}>
          {!modoReimpressao ? (
            <div className="pdv-success" style={{ paddingBottom: 16 }}>
              <div className="pdv-success-mark">✓</div>
              <div className="pdv-success-title">Venda concluída</div>
              <div className="pdv-success-sub">
                {fmtBRL(venda.total)} via {FORMA_LABEL[venda.formaPagamento]} · #{venda.numero}
              </div>
            </div>
          ) : (
            <div className="pdv-modal-hd">
              <div>
                <div className="pdv-modal-title">Reimpressão de cupom</div>
                <div className="pdv-modal-sub">Venda #{venda.numero} · {fmtData(venda.createdAt)}</div>
              </div>
              <button type="button" onClick={onFechar} className="pdv-modal-x">×</button>
            </div>
          )}

          <div className="pdv-modal-body" style={{ paddingBottom: 8 }}>
            <div style={{
              background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
              borderRadius: 12, padding: 14, marginBottom: 12,
            }}>
              <div style={{ color: "var(--pdv-t3)", fontSize: 10.5, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 8 }}>Itens</div>
              {venda.itens?.map((it, i) => (
                <div key={it.id} style={{
                  display: "flex", justifyContent: "space-between", padding: "8px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--pdv-line)", fontSize: 13,
                }}>
                  <div>
                    <div style={{ color: "var(--pdv-t1)", fontWeight: 500 }}>{it.produto?.nome}</div>
                    <div style={{ color: "var(--pdv-t3)", fontSize: 11.5, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                      {it.quantidade} × {fmtBRL(it.precoUnitario)}
                    </div>
                  </div>
                  <div style={{ color: "var(--pdv-t1)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(it.subtotal)}</div>
                </div>
              ))}
            </div>

            <div style={{
              background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
              borderRadius: 12, padding: 14, marginBottom: 16,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: "var(--pdv-t3)" }}>Forma de pagamento</span>
                <span style={{ color: "var(--pdv-t1)", fontWeight: 500 }}>{FORMA_LABEL[venda.formaPagamento]}</span>
              </div>
              {Number(venda.desconto) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: "var(--pdv-t3)" }}>Desconto</span>
                  <span style={{ color: "var(--pdv-c-rose)", fontWeight: 500 }}>− {fmtBRL(venda.desconto)}</span>
                </div>
              )}
              {mostrarRecebidoTroco && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: "var(--pdv-t3)" }}>Valor recebido</span>
                    <span style={{ color: "var(--pdv-t1)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(valorRecebido)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: "var(--pdv-t3)" }}>Troco</span>
                    <span style={{ color: "var(--pdv-accent)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(troco)}</span>
                  </div>
                </>
              )}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--pdv-line-2)",
              }}>
                <span style={{ color: "var(--pdv-t3)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 500 }}>Total</span>
                <span style={{ color: "var(--pdv-accent)", fontSize: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{fmtBRL(venda.total)}</span>
              </div>
            </div>
          </div>

          <div className="pdv-modal-foot">
            <button onClick={imprimir} className="pdv-btn-ghost" style={{ flex: 1, justifyContent: "center" }}>
              🖨️ Imprimir cupom
            </button>
            <button
              ref={novaVendaBtnRef}
              onClick={onFechar}
              className="pdv-btn-finalize recibo-nova-venda"
              style={{ flex: 1 }}
            >
              {modoReimpressao ? "Fechar" : "Nova venda"}
              <span className="pdv-kbd">Enter</span>
            </button>
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
          display: "grid", gridTemplateColumns: "150px 80px 1.5fr 120px 100px 90px 130px 150px",
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
              display: "grid", gridTemplateColumns: "150px 80px 1.5fr 120px 100px 90px 130px 150px",
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
              <div style={{ textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => abrirDetalhe(v.id)} className="pdv-btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }}>Ver</button>
                {v.status === "CONCLUIDA" && (
                  <button
                    onClick={() => abrirReimpressao(v.id)}
                    className="pdv-btn-ghost"
                    style={{ padding: "6px 10px", fontSize: 12, color: "var(--pdv-accent)", borderColor: "rgba(52,211,153,.35)" }}
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
    <div className="pdv-stat-card">
      <div className="pdv-stat-label">{titulo}</div>
      <div className="pdv-stat-value" style={{ color: cor }}>{valor}</div>
    </div>
  );
}

function DetalheVendaModal({ venda, onFechar, onCancelar, onReimprimir }) {
  const st = STATUS_INFO[venda.status] || STATUS_INFO.CONCLUIDA;
  return (
    <div onClick={onFechar} className="pdv-modal-bg">
      <div onClick={e => e.stopPropagation()} className="pdv-modal" style={{ width: "min(720px, calc(100vw - 32px))" }}>
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
          <button type="button" onClick={onFechar} className="pdv-modal-x">×</button>
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
                <div style={{ textAlign: "right", color: "var(--pdv-t2)", fontVariantNumeric: "tabular-nums" }}>{it.quantidade} {it.produto?.unidade || ""}</div>
                <div style={{ textAlign: "right", color: "var(--pdv-t2)", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(it.precoUnitario)}</div>
                <div style={{ textAlign: "right", color: "var(--pdv-t1)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(it.subtotal)}</div>
              </div>
            ))}
          </div>

          <div style={{
            background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
            borderRadius: 12, padding: 14,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: "var(--pdv-t3)" }}>Forma de pagamento</span>
              <span style={{ color: "var(--pdv-t1)", fontWeight: 500 }}>{FORMA_LABEL[venda.formaPagamento]}</span>
            </div>
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

