// @ts-nocheck — lazy migration: nucleo do PDV (2800 linhas, 22 sub-componentes).
// Tela mais critica do sistema (vendas em tempo real, atalhos, cestinha,
// recibo com auto-print, historico). Tipar tudo de uma vez seria arriscado
// — manter @ts-nocheck e refinar em etapa propria, ja com o sistema
// inteiro em TS pra apoiar o type narrowing.
import { useEffect, useMemo, useRef, useState, useCallback, useReducer } from "react";
import { createPortal } from "react-dom";
import { C } from "./lib/theme";
import { api, BASE_URL, ApiError } from "./lib/api";
import { useRascunho } from "./lib/useRascunho";
import { emitirToast } from "./lib/toast";
// Fase 3 — PDV offline-first: vendas finalizadas sem conexao entram numa
// fila em IndexedDB e sao enviadas (com idempotencia) quando a rede volta.
import {
  enfileirarVenda, sincronizarVendasPendentes, listarPendentes,
  descartarPendente, aoMudarFila, carregarComSnapshot,
} from "./lib/filaVendasOffline";
import { useNetworkStatus } from "./lib/useNetworkStatus";
import { useConfiguracaoEmpresa, formatarEndereco } from "./HeaderRelatorio";
import { obterConfigImpressora, devePrintar } from "./lib/impressora";
import CupomEnvelope from "./components/cupons/CupomEnvelope";
import CupomVenda from "./components/cupons/CupomVenda";
import { imprimirDanfeNfce } from "./lib/danfeNfce";
import { useModalKeys } from "./lib/modalKeys";
import ActionsMenu from "./components/ActionsMenu";
import SelectBusca from "./components/SelectBusca";
import MaquininhaMpModal from "./components/MaquininhaMpModal";
import PixQrCodeModal from "./components/PixQrCodeModal";
// ETAPA#8a: impressao termica direta via Web Bluetooth (alternativa ao window.print()).
import { gerarComandosPedido } from "./lib/escposPedido";
import { imprimirViaBluetooth, bluetoothDisponivel } from "./lib/webBluetoothPrint";
// Agente QZ Tray: imprime o cupom direto numa impressora escolhida pelo
// nome, sem caixa de dialogo. Fallback automatico para window.print().
import { qzAtivoEConfigurado, imprimirRawQz } from "./lib/qztray";
import { getEmpresa } from "./lib/api";
import { gerarLink } from "./lib/templates";
import { ehUnidadePeso, pesoGramasParaEstoque, resolverEtiquetaBalanca, PRESETS_PESO_G } from "./lib/unidades";

// Produto que ignora limite de estoque na venda: serviços e produção própria
// (controlarEstoque=false — pão, lanche feito na hora). Para esses, o PDV não
// bloqueia por falta de saldo e o backend permite o estoque ficar negativo.
const ignoraLimiteEstoque = (p) => p?.tipoItem === "SERVICO" || p?.controlarEstoque === false;
// Fase 5 (fatiamento): constantes/formatadores compartilhados e o recibo
// pos-venda agora moram em src/pdv/.
import {
  FORMAS, FORMA_LABEL, FORMAS_GERA_RECEBER, FORMA_COR_VAR, FORMA_COR_CLASSE,
  fmtBRL, fmtQtd, fmtData, fmtPartes, dataDaqui,
} from "./pdv/comum";
import { pagamentosReducer, criarPagamento, novoId } from "./pdv/pagamentos";
import ReciboModal from "./pdv/ReciboModal";
import Historico, { DetalheVendaModal } from "./pdv/Historico";
import FotoProduto from "./pdv/FotoProduto";
import OrcamentoRapidoModal from "./pdv/OrcamentoRapidoModal";
import ModalAbrirCaixaPDV from "./pdv/ModalAbrirCaixaPDV";
import {
  FormasPagamentoTopo, CestinhaVaziaClean, AcessoRapido, BotaoAtalho, TotalAnimado,
} from "./pdv/PaineisVenda";

// "agora", "há 3 min", "há 2 h", "há 1 d" — relativo curto para a lista de
// atendimentos em espera.
const tempoAtras = (iso) => {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 60000) return "agora";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
};

export default function PDV({ user, onSair, sair, contextoInicial, onContextoConsumido }) {
  // Quando chega com contextoInicial (ex: convertendo oportunidade), forca
  // a aba "nova" — Historico nao faz sentido nesse fluxo. O contexto e
  // consumido pelo NovaVenda no primeiro render util.
  const [aba, setAba] = useState(contextoInicial ? "nova" : "nova");
  // Modo Clean (F7): layout alternativo focado — busca + cestinha na
  // esquerda, total grande + F1-F6 na direita, sem painel do dia nem "Mais
  // vendidos". O estado vive AQUI (e nao em NovaVenda) por dois motivos:
  // o botao de alternancia mora no header, e a troca de layout NUNCA pode
  // desmontar NovaVenda — o carrinho e estado local de la, e remontar
  // exigiria recuperacao via banner de rascunho.
  // Chave por USUARIO (mesmo padrao do rascunho): operadores que revezam na
  // mesma maquina mantem cada um sua preferencia de layout.
  const chaveModoClean = `pdv:modoClean:${user?.id || "anon"}`;
  const [modoClean, setModoClean] = useState(() => {
    try { return localStorage.getItem(chaveModoClean) === "1"; } catch { return false; }
  });
  const alternarModoClean = useCallback(() => {
    setModoClean(v => {
      const nv = !v;
      try { localStorage.setItem(chaveModoClean, nv ? "1" : "0"); } catch { /* modo privado */ }
      return nv;
    });
  }, [chaveModoClean]);
  return (
    <div className="pdv-redesign" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <PDVHeader
        user={user}
        aba={aba} setAba={setAba}
        modoClean={modoClean} onAlternarClean={alternarModoClean}
        onSair={onSair} sairConta={sair}
      />
      <div className="pdv-app">
        {aba === "nova"
          ? <NovaVenda
              user={user} contextoInicial={contextoInicial} onContextoConsumido={onContextoConsumido}
              modoClean={modoClean} onAlternarClean={alternarModoClean}
            />
          : <Historico user={user} />}
      </div>
    </div>
  );
}

// ==================== HEADER DO MODO PDV ====================
// Header proprio do PDV em modo focado: logo + tabs + avatar com dropdown
// (Menu / Sair). Substitui sidebar e topbar globais quando o user esta no
// PDV. "Menu" volta para a tela principal (dashboard); "Sair" desloga.
function PDVHeader({ user, aba, setAba, modoClean, onAlternarClean, onSair, sairConta }) {
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
          <div className="pdv-brand-name">Gestão<span className="gp-brand-max">ProMax</span></div>
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

      {/* Alternancia de layout (so faz sentido na aba Nova venda). Botao no
          header — longe da area de bipagem/fechamento, mas sempre visivel —
          com a tecla F7 estampada pra ensinar o atalho pelo proprio botao. */}
      {aba === "nova" && (
        <button
          type="button"
          onClick={onAlternarClean}
          className={`pdv-clean-toggle ${modoClean ? "is-on" : ""}`}
          title={modoClean ? "Voltar ao layout completo (F7)" : "Modo focado: só busca, cestinha e fechamento (F7)"}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {modoClean
              ? <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>
              : <><circle cx="12" cy="12" r="3"/><path d="M3 12h3M18 12h3M12 3v3M12 18v3"/></>}
          </svg>
          {modoClean ? "Completo" : "Focado"}
          <span className="pdv-kbd">F7</span>
        </button>
      )}

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


// ==================== SPLIT DE PAGAMENTO (reducer) ====================
// ==================== NOVA VENDA ====================

function NovaVenda({ user, contextoInicial, onContextoConsumido, modoClean, onAlternarClean }) {
  const empresa = useConfiguracaoEmpresa();
  const [produtos, setProdutos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [busca, setBusca] = useState("");
  const [carrinho, setCarrinho] = useState([]);
  const [clienteId, setClienteId] = useState("");
  // Crediario do cliente selecionado (saldo/limite/disponivel) — mostrado pro
  // operador antes de fechar no fiado. null = sem info / modulo indisponivel.
  const [crediarioCliente, setCrediarioCliente] = useState(null);
  // Rastreia conversao Oportunidade -> Venda (vindo do Funil). Quando setado,
  // a finalizacao da venda passa `oportunidadeId` no payload pro backend
  // vincular automaticamente. Limpo ao cancelar conversao ou apos sucesso.
  const [oportunidadeConvertendo, setOportunidadeConvertendo] = useState(null);
  // Split de pagamento: array de pagamentos via useReducer (substitui o
  // estado antigo "forma + valorRecebido + formaCustomId" que so suportava 1
  // forma). Soma dos pagamentos.valor == total da venda; entregue extra em
  // DINHEIRO vira troco. Ver pagamentosReducer().
  const [pagamentos, dispatchPagamentos] = useReducer(pagamentosReducer, []);
  const [desconto, setDesconto] = useState("0");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [reciboAberto, setReciboAberto] = useState(null);
  const [pagamentoAberto, setPagamentoAberto] = useState(false);
  const [cancelarAberto, setCancelarAberto] = useState(false);
  const [formaAtalhoFlash, setFormaAtalhoFlash] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [destacado, setDestacado] = useState(null); // produtoId recém-adicionado (para flash)
  const [caixaAtual, setCaixaAtual] = useState(null);
  const [tipoCaixa, setTipoCaixa] = useState("INDEPENDENTE");
  const [caixaCarregando, setCaixaCarregando] = useState(true);
  const [painel, setPainel] = useState({ topProdutos: [], ultimasVendas: [], resumoDia: null, formasFrequencia: [] });
  const [vendaDetalheAberta, setVendaDetalheAberta] = useState(null);
  const [sugestaoIdx, setSugestaoIdx] = useState(0); // índice destacado nas sugestões
  const [qtdModalProduto, setQtdModalProduto] = useState(null); // produto p/ modal de qtd
  const [qtdModalValor, setQtdModalValor] = useState("1");
  const [formasCustom, setFormasCustom] = useState([]);
  // Bloco financeiro (gera ContaReceber) — visivel apenas para BOLETO/CREDITO/
  // CREDIARIO. Default: 30 dias a frente, 1 parcela.
  const [contaVencimento, setContaVencimento] = useState(() => dataDaqui(30));
  const [contaParcelas, setContaParcelas] = useState(1);
  const [configFidelidade, setConfigFidelidade] = useState(null);
  const [saldoPontos, setSaldoPontos] = useState(null);
  const [pontosResgatando, setPontosResgatando] = useState(0);
  const [painelPontosAberto, setPainelPontosAberto] = useState(false);
  const buscaRef = useRef(null);
  const finalizarRef = useRef(null);
  // Foca dinamicamente o input "Recebi" do PRIMEIRO pagamento DINHEIRO no
  // split (substitui o ref antigo unico para forma==DINHEIRO).
  const dinheiroInputRef = useRef(null);
  const qtdInputRef = useRef(null);
  const qtdConfirmarRef = useRef(null);

  // Trava SINCRONA contra duplo envio da venda. O estado `salvando` (React)
  // so vira true no proximo render — entre dois disparos no MESMO tick (F10
  // repetido, F10 + clique, double-click) o closure ainda le salvando=false e
  // ambos passariam. Esta ref muda na hora e fecha essa janela.
  const enviandoVendaRef = useRef(false);
  // Chave de idempotencia do checkout atual. Gerada sob demanda e reenviada
  // identica em qualquer retry da MESMA venda — o backend usa-a para nunca
  // duplicar. Rotaciona (volta a null) ao concluir a venda ou limpar o
  // carrinho, para a PROXIMA venda nascer com chave nova. NAO rotaciona em
  // erro/validacao: se a 1a requisicao chegou a gravar mas a resposta se
  // perdeu, o retry com a mesma chave devolve a venda existente (sem dup).
  const idempotencyKeyRef = useRef(null);

  const [abrirCaixaAberto, setAbrirCaixaAberto] = useState(false);

  // Vendas em espera (park/hold): atendimentos congelados no servidor para
  // retomar depois. Visiveis para todo o tenant (qualquer operador retoma).
  const [vendasEspera, setVendasEspera] = useState([]);
  const [esperaAberta, setEsperaAberta] = useState(false);
  const [salvandoEspera, setSalvandoEspera] = useState(false);
  // Orcamento rapido: converte o carrinho atual em um orcamento (RASCUNHO) e
  // gera o link de envio por WhatsApp/e-mail. Nao mexe na cestinha — fluxo
  // pre-venda (o operador pode finalizar a venda normalmente depois).
  const [orcamentoAberto, setOrcamentoAberto] = useState(false);
  // Confirmacao em 2 cliques do "Descartar" (evita perder um atendimento
  // por engano). Guarda o id da espera aguardando o 2o clique.
  const [descarteConfirmar, setDescarteConfirmar] = useState(null);

  // Persistencia de rascunho do carrinho. Salva em localStorage cada vez
  // que o carrinho muda (debounce 600ms). Chave por usuario evita que
  // 2 vendedores no mesmo browser misturem itens. `desativar` quando vazio
  // mantem o localStorage limpo apos limparCarrinho().
  const rascunhoChave = `pdv:rascunho:${user?.id || "anon"}`;
  const rascunhoCarrinho = useRascunho(rascunhoChave, carrinho, {
    debounceMs: 600,
    desativar: carrinho.length === 0,
    versao: 1,
  });

  // Status de rede: bloqueia botões críticos quando offline / API caida.
  // Finalizar venda exige roundtrip no backend (criar venda + baixa de estoque
  // + ContaReceber). Tentar offline corromperia o estado local.
  const { online, apiSaudavel } = useNetworkStatus();
  const podeFinalizarRede = online && apiSaudavel;

  // ===== Fila offline (Fase 3) =====
  // filaOffline alimenta o banner de pendencias; o sincronizador dispara
  // quando a rede volta (podeFinalizarRede false->true) e a cada 60s.
  const [filaOffline, setFilaOffline] = useState([]);
  const pendenciaOfflineComErro = filaOffline.find(v => v.ultimoErro) || null;
  useEffect(() => {
    let ativo = true;
    const carregar = () => listarPendentes()
      .then(l => { if (ativo) setFilaOffline(l); })
      .catch(() => {});
    carregar();
    const off = aoMudarFila(carregar);
    return () => { ativo = false; off(); };
  }, []);

  async function sincronizarVendasOffline() {
    const r = await sincronizarVendasPendentes().catch(() => null);
    if (!r) return;
    if (r.enviadas > 0) {
      emitirToast({
        tipo: "sucesso",
        titulo: `${r.enviadas} venda${r.enviadas > 1 ? "s" : ""} offline enviada${r.enviadas > 1 ? "s" : ""} ✓`,
        mensagem: r.pendentes > 0 ? `${r.pendentes} ainda na fila.` : "Caixa e relatorios atualizados.",
        duracao: 6000,
      });
      recarregarCaixa();
      recarregarPainel();
    }
  }
  // Ref viva (padrao do arquivo): o intervalo enxerga sempre a versao atual
  // sem re-bindar a cada render.
  const sincronizarVendasOfflineRef = useRef(null);
  useEffect(() => { sincronizarVendasOfflineRef.current = sincronizarVendasOffline; });
  useEffect(() => {
    if (!podeFinalizarRede) return;
    sincronizarVendasOfflineRef.current?.();
    const timer = setInterval(() => sincronizarVendasOfflineRef.current?.(), 60_000);
    return () => clearInterval(timer);
  }, [podeFinalizarRede]);

  // Banner de recuperacao: aparece uma vez no mount se houver rascunho salvo
  // E o carrinho atual estiver vazio. Usuario decide se restaura ou descarta.
  const [rascunhoOferta, setRascunhoOferta] = useState<{ itens: number; idadeMin: number } | null>(null);
  useEffect(() => {
    if (carrinho.length > 0) return; // ja tem coisa, nao oferece
    const salvo = rascunhoCarrinho.restaurar();
    if (Array.isArray(salvo) && salvo.length > 0) {
      const idade = rascunhoCarrinho.idadeMs() ?? 0;
      // Rascunho com mais de 24h e provavelmente lixo — descarta direto.
      if (idade > 24 * 60 * 60 * 1000) {
        rascunhoCarrinho.descartar();
        return;
      }
      setRascunhoOferta({ itens: salvo.length, idadeMin: Math.max(1, Math.round(idade / 60000)) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function recuperarRascunho() {
    const salvo = rascunhoCarrinho.restaurar();
    if (Array.isArray(salvo) && salvo.length > 0) {
      setCarrinho(salvo);
      emitirToast({
        tipo: "sucesso",
        titulo: "Carrinho recuperado",
        mensagem: `${salvo.length} ${salvo.length === 1 ? "item restaurado" : "itens restaurados"} do rascunho.`,
        duracao: 4000,
      });
    }
    setRascunhoOferta(null);
  }
  function dispensarRascunho() {
    rascunhoCarrinho.descartar();
    setRascunhoOferta(null);
  }

  // Mercado Pago Point (maquininha fisica). configMp = null ate carregar.
  // mpAberto controla a visibilidade do modal de cobranca (CREDITO/DEBITO).
  // pixAberto e um modal SEPARADO que mostra QR Code na propria tela do PDV
  // (PIX usa /v1/payments, nao a Point API — funciona em qualquer device).
  const [configMp, setConfigMp] = useState(null);
  const [mpAberto, setMpAberto] = useState(false);
  const [pixAberto, setPixAberto] = useState(false);

  const algumaModalAberta = pagamentoAberto || cancelarAberto || !!reciboAberto || !!qtdModalProduto || abrirCaixaAberto || mpAberto || pixAberto || esperaAberta || orcamentoAberto;
  const semCaixa = !caixaCarregando && !caixaAtual;

  // Reordena FORMAS por uso real (ultimos 90 dias) e reatribui os atalhos
  // F1-F6 conforme a nova posicao. Forma mais usada ganha F1 (tecla de
  // home-row mais acessivel). Tenant sem historico cai no fallback
  // estatico. Formas nao vistas no historico vao para o fim, mantendo
  // sua ordem relativa original.
  const FORMAS_ORDENADAS = useMemo(() => {
    const ranking = painel.formasFrequencia || [];
    if (ranking.length === 0) return FORMAS;
    const peso = new Map(ranking.map((f, idx) => [f.formaPagamento, idx]));
    const ordenadas = [...FORMAS].sort((a, b) => {
      const pa = peso.has(a.id) ? peso.get(a.id) : Infinity;
      const pb = peso.has(b.id) ? peso.get(b.id) : Infinity;
      return pa - pb;
    });
    return ordenadas.map((f, idx) => ({ ...f, atalho: `F${idx + 1}` }));
  }, [painel.formasFrequencia]);

  // Mapeamento tecla -> id da forma, derivado da ordem dinamica. Ref vivo
  // pra o listener global (linha ~607) ler sem precisar re-bindar.
  const FORMA_POR_TECLA = useMemo(() => {
    const map = {};
    FORMAS_ORDENADAS.forEach(f => { map[f.atalho] = f.id; });
    return map;
  }, [FORMAS_ORDENADAS]);
  const formaPorTeclaRef = useRef(FORMA_POR_TECLA);
  useEffect(() => { formaPorTeclaRef.current = FORMA_POR_TECLA; }, [FORMA_POR_TECLA]);

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
      .then(r => {
        setCaixaAtual(r.caixa);
        if (r.tipoCaixa) setTipoCaixa(r.tipoCaixa);
      })
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

  const recarregarEspera = useCallback(() => {
    return api.listarVendasEspera()
      .then(lista => setVendasEspera(Array.isArray(lista) ? lista : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Catalogo com fallback offline: a carga normal atualiza um snapshot em
    // IndexedDB; se a rede falhar (PDV aberto sem internet), os produtos/
    // clientes da ultima sessao entram no lugar — com aviso de defasagem.
    carregarComSnapshot("catalogo:produtos", () => api.listarProdutos({ ativo: "true" }))
      .then(r => {
        if (!r) return;
        setProdutos(r.dados);
        if (r.origem === "snapshot") {
          const quando = r.salvoEm
            ? new Date(r.salvoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
            : "anteriormente";
          emitirToast({
            tipo: "aviso",
            titulo: "Catálogo offline 📦",
            mensagem: `Sem conexão — usando o catálogo salvo em ${quando}. Preços e estoques podem estar defasados; tudo sincroniza quando a internet voltar.`,
            duracao: 8000,
          });
        }
      });
    carregarComSnapshot("catalogo:clientes", () => api.listarClientes({ ativo: "true" }))
      .then(r => { if (r) setClientes(r.dados); });
    recarregarCaixa().finally(() => setCaixaCarregando(false));
    recarregarPainel();
    recarregarFormasCustom();
    recarregarEspera();
    api.obterConfiguracaoFidelidade().then(setConfigFidelidade).catch(() => {});
    // Carrega config Mercado Pago Point. Em erro (sem config ainda, 403 sem
    // permissao) cai pro estado "nao configurada" — botao da maquininha
    // simplesmente nao aparece.
    api.obterConfigMp()
      .then(setConfigMp)
      .catch(() => setConfigMp({ configurada: false, mpAtivo: false }));
  }, [recarregarCaixa, recarregarPainel, recarregarFormasCustom, recarregarEspera]);

  useEffect(() => {
    setPontosResgatando(0);
    setPainelPontosAberto(false);
    setSaldoPontos(null);
    if (clienteId && configFidelidade?.ativo) {
      api.pontosFidelidade(clienteId)
        .then(d => setSaldoPontos(d.saldo ?? 0))
        .catch(() => setSaldoPontos(null));
    }
    // Crediario do cliente (saldo/limite). Best-effort: se o modulo nao estiver
    // no plano ou o user sem permissao, simplesmente nao mostra.
    setCrediarioCliente(null);
    if (clienteId) {
      api.crediarioCaderneta(clienteId)
        .then(d => setCrediarioCliente({
          saldo: d.saldoDevedor ?? 0,
          limite: d.cliente?.limiteCredito ?? null,
          disponivel: d.creditoDisponivel,
          vencido: d.vencido ?? 0,
          acimaDoLimite: d.acimaDoLimite,
        }))
        .catch(() => setCrediarioCliente(null));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  useEffect(() => {
    buscaRef.current?.focus();
  }, []);

  // Consome contextoInicial (vindo do Funil via App.tsx): pre-seleciona o
  // cliente, registra a oportunidade que esta sendo convertida e avisa o
  // App pra limpar o contexto (evita reaplicar em re-render).
  useEffect(() => {
    if (!contextoInicial) return;
    if (contextoInicial.clienteId) setClienteId(contextoInicial.clienteId);
    setOportunidadeConvertendo({
      id: contextoInicial.oportunidadeId,
      numero: contextoInicial.numero,
      titulo: contextoInicial.titulo,
    });
    onContextoConsumido?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextoInicial]);

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
    // Quantidade aceita decimal (vendas por metro/kg). Backend e DB usam
    // Decimal(12,3) — ver Produto.estoque / ItemVenda.quantidade no schema.
    const qtdNum = typeof qtd === "number" ? qtd : parseFloat(String(qtd).replace(",", "."));
    const incremento = Math.max(0.001, Number.isFinite(qtdNum) ? qtdNum : 1);
    const ehServico = p.tipoItem === "SERVICO";
    const estoqueProduto = Number(p.estoque) || 0;
    setCarrinho(prev => {
      const idx = prev.findIndex(it => it.produtoId === p.id);
      if (idx >= 0) {
        const qtdAtual = prev[idx].quantidade;
        // Servico/producao propria: ignora limite de estoque.
        if (!ignoraLimiteEstoque(p) && qtdAtual + incremento > estoqueProduto + 1e-9) {
          flashErro(`Estoque insuficiente de "${p.nome}" (disponível: ${estoqueProduto}).`);
          return prev;
        }
        // Move o item incrementado para o topo (UX típica de PDV).
        const atualizado = { ...prev[idx], quantidade: Math.round((qtdAtual + incremento) * 1000) / 1000 };
        const restante = prev.filter((_, i) => i !== idx);
        return [atualizado, ...restante];
      }
      if (!ignoraLimiteEstoque(p) && estoqueProduto + 1e-9 < incremento) {
        flashErro(`Estoque insuficiente de "${p.nome}" (disponível: ${estoqueProduto}).`);
        return prev;
      }
      const novoItem = {
        produtoId: p.id,
        codigo: p.codigo,
        nome: p.nome,
        unidade: p.unidade,
        // Para servicos e producao propria guardamos Infinity como estoque
        // "logico" — assim os controles + e definirQuantidade nao bloqueiam.
        estoque: ignoraLimiteEstoque(p) ? Infinity : estoqueProduto,
        tipoItem: p.tipoItem || "PRODUTO",
        precoUnitario: Number(p.precoVenda),
        imagem: p.imagem || null,
        quantidade: Math.round(incremento * 1000) / 1000,
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
    if (!ignoraLimiteEstoque(produto) && produto.estoque <= 0) {
      flashErro(`Sem estoque de "${produto.nome}".`);
      return;
    }
    setQtdModalProduto(produto);
    // Produto por peso abre o teclado de balança vazio (vendedor digita os
    // gramas); demais começam em 1 unidade.
    setQtdModalValor(ehUnidadePeso(produto.unidade) ? "" : "1");
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
    let n;
    if (ehUnidadePeso(qtdModalProduto.unidade)) {
      // Produto por peso: o campo guarda GRAMAS. Converte para a unidade de
      // estoque (KG/G) — 400 g → 0,400 kg.
      const gramas = parseFloat(String(qtdModalValor).replace(",", "."));
      n = pesoGramasParaEstoque(gramas, qtdModalProduto.unidade);
      if (!(n > 0)) {
        flashErro(`Informe o peso de "${qtdModalProduto.nome}".`);
        return;
      }
    } else {
      // Quantidade fracionaria — produtos por metro/litro confirmam 1,5; 2,25 etc.
      const raw = parseFloat(String(qtdModalValor).replace(",", "."));
      n = Number.isFinite(raw) && raw > 0
        ? Math.max(0.001, Math.round(raw * 1000) / 1000)
        : 1;
    }
    const estoqueProduto = Number(qtdModalProduto.estoque) || 0;
    if (!ignoraLimiteEstoque(qtdModalProduto) && n > estoqueProduto + 1e-9) {
      flashErro(`Estoque insuficiente de "${qtdModalProduto.nome}" (disponível: ${estoqueProduto}).`);
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
    // Etiqueta de balança (EAN-13 de peso/preço embutido) — bipou, já entra
    // com o peso embutido, sem abrir modal. Padrão de supermercado.
    const etiqueta = resolverEtiquetaBalanca(q, produtos);
    if (etiqueta) {
      const prod = etiqueta.produto;
      if (!ignoraLimiteEstoque(prod) && Number(prod.estoque) + 1e-9 < etiqueta.quantidade) {
        flashErro(`Estoque insuficiente de "${prod.nome}" (disponível: ${prod.estoque} ${prod.unidade || ""}).`);
        setBusca("");
        return;
      }
      adicionarProduto(prod, etiqueta.quantidade);
      return;
    }
    const ql = q.toLowerCase();
    const exato = produtos.find(p =>
      p.ativo && (
        (p.codigoBarras && p.codigoBarras.toLowerCase() === ql) ||
        p.codigo.toLowerCase() === ql ||
        (p.referencia && p.referencia.toLowerCase() === ql)
      )
    );
    if (exato) {
      // Servicos e producao propria nunca ficam "sem estoque".
      if (!ignoraLimiteEstoque(exato) && exato.estoque <= 0) {
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
    // Aceita decimal (1.5m, 2.5kg). Arredonda para 3 casas — bate com o
    // banco (Decimal(12,3)).
    const parsed = typeof valor === "number" ? valor : parseFloat(String(valor).replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const n = Math.round(parsed * 1000) / 1000;
    setCarrinho(prev => prev.map(it => {
      if (it.produtoId !== produtoId) return it;
      if (n > it.estoque + 1e-9) {
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
    dispatchPagamentos({ type: "reset" });
    setErro("");
    setBusca("");
    setPontosResgatando(0);
    setPainelPontosAberto(false);
    setSaldoPontos(null);
    // Limpa rascunho — venda finalizou ou foi explicitamente descartada.
    rascunhoCarrinho.descartar();
    setRascunhoOferta(null);
    // Carrinho zerado = novo atendimento: descarta a chave de idempotencia
    // para a proxima venda nascer com chave nova (em sucesso ja foi rotacionada
    // antes; aqui cobre cancelamento/limpeza manual do carrinho).
    idempotencyKeyRef.current = null;
    if (refocar) focarBusca();
  }

  // ===== Vendas em espera (park/hold) =====
  // Congela o carrinho atual no servidor e libera a tela. Retorna a espera
  // criada (ou null em falha) — usado pelo "swap" do retomarEspera.
  async function salvarEmEspera() {
    if (carrinho.length === 0) { flashErro("Carrinho vazio — nada para colocar em espera."); return null; }
    if (salvandoEspera) return null;
    if (!podeFinalizarRede) {
      emitirToast({
        tipo: "aviso",
        titulo: "Sem conexão com o servidor",
        mensagem: "Não foi possível salvar em espera agora. O carrinho continua salvo neste navegador — tente de novo quando a conexão voltar.",
        duracao: 5000,
      });
      return null;
    }
    setSalvandoEspera(true);
    try {
      const espera = await api.salvarVendaEspera({
        clienteId: clienteId || null,
        desconto: descontoNum,
        observacoes: null,
        itens: carrinho.map(it => ({
          produtoId: it.produtoId,
          codigo: it.codigo,
          nome: it.nome,
          unidade: it.unidade,
          tipoItem: it.tipoItem,
          imagem: it.imagem,
          precoUnitario: it.precoUnitario,
          quantidade: it.quantidade,
        })),
      });
      limparCarrinho({ refocar: true });
      await recarregarEspera();
      emitirToast({
        tipo: "sucesso",
        titulo: `Atendimento #${espera.numero} em espera`,
        mensagem: "Carrinho salvo. Tela liberada para o próximo cliente.",
        duracao: 4000,
      });
      return espera;
    } catch (err) {
      flashErro(err.message || "Falha ao colocar o atendimento em espera.");
      return null;
    } finally {
      setSalvandoEspera(false);
    }
  }

  // Reconstrói os itens salvos contra o catálogo vivo (estoque/dados atuais),
  // caindo no snapshot quando o produto sumiu/foi desativado. Preserva o
  // preço salvo (pode ter sido negociado/editado no atendimento original).
  function reconstruirItensEspera(itens) {
    return (Array.isArray(itens) ? itens : []).map(it => {
      const prod = produtos.find(p => p.id === it.produtoId);
      const ehServico = (prod?.tipoItem || it.tipoItem) === "SERVICO";
      return {
        produtoId: it.produtoId,
        codigo: prod?.codigo ?? it.codigo,
        nome: prod?.nome ?? it.nome,
        unidade: prod?.unidade ?? it.unidade,
        estoque: ehServico ? Infinity : Number(prod?.estoque ?? 0),
        tipoItem: ehServico ? "SERVICO" : "PRODUTO",
        precoUnitario: Number(it.precoUnitario) || 0,
        imagem: prod?.imagem ?? it.imagem ?? null,
        quantidade: Number(it.quantidade) || 0,
      };
    });
  }

  // Retoma uma espera: traz os itens de volta para a cestinha e remove a
  // espera do servidor. Se já houver atendimento em andamento, ele é salvo
  // em espera antes (troca de cliente sem perder nada).
  async function retomarEspera(espera) {
    if (!espera) return;
    if (carrinho.length > 0) {
      const salvo = await salvarEmEspera();
      if (!salvo) return; // falhou ao salvar o atual — aborta a troca
    }
    setCarrinho(reconstruirItensEspera(espera.itens));
    setClienteId(espera.cliente?.id || espera.clienteId || "");
    setDesconto(String(espera.desconto ?? "0"));
    setEsperaAberta(false);
    setDescarteConfirmar(null);
    try {
      await api.excluirVendaEspera(espera.id);
    } catch { /* backend é idempotente; ignora */ }
    await recarregarEspera();
    focarBusca();
    const n = Array.isArray(espera.itens) ? espera.itens.length : 0;
    emitirToast({
      tipo: "sucesso",
      titulo: `Atendimento #${espera.numero} retomado`,
      mensagem: `${n} ${n === 1 ? "item de volta" : "itens de volta"} na cestinha.`,
      duracao: 4000,
    });
  }

  // Descarta uma espera sem retomar (cliente desistiu). A confirmação em 2
  // cliques é controlada pela UI via descarteConfirmar.
  async function descartarEspera(espera) {
    if (!espera) return;
    try {
      await api.excluirVendaEspera(espera.id);
    } catch { /* idempotente */ }
    setDescarteConfirmar(null);
    await recarregarEspera();
    emitirToast({
      tipo: "info",
      titulo: `Espera #${espera.numero} descartada`,
      duracao: 3000,
    });
  }

  const subtotal = useMemo(
    // Arredonda a cents: quantidades fracionarias (peso/KG) geram ruido de
    // ponto flutuante (ex.: 45,3 * preco => 507,71999999999997). Sem isto, o
    // valor vaza para o campo de pagamento como "507,71999999999997".
    () => Math.round(carrinho.reduce((acc, it) => acc + it.quantidade * it.precoUnitario, 0) * 100) / 100,
    [carrinho]
  );
  const descontoNum = useMemo(() => {
    const n = parseFloat(String(desconto).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [desconto]);
  const descontoFidelidade = useMemo(() => {
    if (!pontosResgatando || !configFidelidade?.pontosParaUmReal) return 0;
    const n = parseInt(pontosResgatando, 10);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n / Number(configFidelidade.pontosParaUmReal) * 100) / 100;
  }, [pontosResgatando, configFidelidade]);
  const total = Math.round(Math.max(0, subtotal - descontoNum - descontoFidelidade) * 100) / 100;

  // ===== Derivados do split de pagamento =====
  // Cada pagamento.valor entra na soma (jamais o valorEntregue — esse so
  // serve para calcular troco visual do DINHEIRO).
  const pagoNum = useMemo(
    () => pagamentos.reduce((acc, p) => acc + (Number(p.valor) || 0), 0),
    [pagamentos]
  );
  const pago = Math.round(pagoNum * 100) / 100;
  const restanteNum = Math.max(0, total - pago);
  const restante = Math.round(restanteNum * 100) / 100;
  // Troco: para cada pagamento DINHEIRO, max(0, valorEntregue - valor).
  // Sem dinheiro no split, troco e sempre 0.
  const troco = useMemo(() => {
    const t = pagamentos
      .filter(p => p.forma === "DINHEIRO")
      .reduce((acc, p) => acc + Math.max(0, (Number(p.valorEntregue) || 0) - (Number(p.valor) || 0)), 0);
    return Math.round(t * 100) / 100;
  }, [pagamentos]);
  const temDinheiro = useMemo(
    () => pagamentos.some(p => p.forma === "DINHEIRO"),
    [pagamentos]
  );
  const valorAPrazo = useMemo(() => {
    const t = pagamentos
      .filter(p => FORMAS_GERA_RECEBER.has(p.forma))
      .reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
    return Math.round(t * 100) / 100;
  }, [pagamentos]);
  const podeFinalizar = total > 0 && Math.abs(pago - total) < 0.01;

  // Reconcilia os pagamentos quando o total muda com o modal aberto (ex.:
  // desconto aplicado depois de semear o DINHEIRO). Sem isto, o `valor`
  // semeado com o total antigo passa a exceder o novo total e trava o botao
  // "Confirmar pagamento". Reage so a mudanca de `total` — nao reaperta o
  // valor enquanto o operador digita um split manualmente.
  useEffect(() => {
    if (!pagamentoAberto) return;
    dispatchPagamentos({ type: "reconcileTotal", total });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // Helper: adiciona um pagamento padrao (com valor preenchido = restante).
  // Bloqueia se ja nao ha o que receber. Foca o input apos adicionar para
  // permitir ajuste rapido do valor.
  function adicionarPagamentoForma(formaId, opts = {}) {
    if (restante <= 0 && pago >= total) {
      flashErro("Total ja esta totalmente coberto pelos pagamentos");
      return;
    }
    const valorSugerido = restante > 0 ? restante : 0;
    dispatchPagamentos({
      type: "add",
      pagamento: criarPagamento(formaId, valorSugerido, opts),
    });
    if (formaId === "DINHEIRO") {
      setTimeout(() => dinheiroInputRef.current?.focus(), 30);
    }
  }
  function adicionarPagamentoCustom(custom) {
    adicionarPagamentoForma(custom.baseFormaPagamento, {
      formaCustomId: custom.id,
      formaCustomNome: custom.nome,
    });
  }

  // Atalhos globais:
  //   F1-F6   forma de pagamento (global — abre modal se fechado, ou adiciona linha se aberto)
  //   F8      abre modal "Cancelar Item"
  //   F10     abre modal de pagamento (finalizar venda)
  //   Esc     fecha modais auxiliares e refoca busca
  useEffect(() => {
    function onKeyDown(e) {
      // Tecla SEGURADA repete o evento (F7 piscaria o layout, F8/F9
      // reabririam modais). So o primeiro keydown de cada pressionada conta —
      // nao afeta o scanner (bipa digitos em keydowns distintos) nem a
      // digitacao na busca (input tem handler proprio).
      if (e.repeat) return;
      // Alt+1..9 -> adiciona o N-esimo card de "Mais vendidos" quando o
      // carrinho esta vazio (estado em que AcessoRapido esta visivel).
      // Modifier Alt evita conflito com bipagem do scanner (que dispara
      // digitos sem modifier em <30ms) e com digitacao livre na busca.
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        if (carrinhoRef.current.length > 0) return;
        const idx = Number(e.key) - 1;
        const p = (topProdutosRef.current || [])[idx];
        if (!p) return;
        e.preventDefault();
        if (!ignoraLimiteEstoque(p) && p.estoque <= 0) {
          flashErro(`Sem estoque de "${p.nome}".`);
          return;
        }
        adicionarProduto(p, 1);
        return;
      }
      const mapa = formaPorTeclaRef.current || {};
      if (mapa[e.key]) {
        e.preventDefault();
        const forma = mapa[e.key];
        // Flash visual no botao correspondente (limpa em 400ms)
        setFormaAtalhoFlash(forma);
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => setFormaAtalhoFlash(null), 400);
        // Comportamento global:
        //   - modal de pagamento ABERTO → adiciona linha com a forma escolhida
        //   - modal FECHADO            → abre modal ja com a forma escolhida (precisa de carrinho)
        if (pagamentoAbertoRef.current) {
          adicionarPagamentoFormaRef.current?.(forma);
        } else {
          if (carrinhoRef.current.length === 0) {
            flashErro("Adicione ao menos um item antes de escolher a forma de pagamento.");
            return;
          }
          abrirPagamentoRef.current?.(forma);
        }
        return;
      }
      if (e.key === "F7") {
        e.preventDefault();
        // Troca de layout e inofensiva em qualquer estado (modal aberto
        // inclusive): os modais sao overlays independentes do grid e todo o
        // estado vive neste componente — nada desmonta, nada se perde.
        onAlternarCleanRef.current?.();
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
      if (e.key === "F9") {
        e.preventDefault();
        // F9 nao faz sentido com o modal de pagamento aberto.
        if (pagamentoAbertoRef.current) return;
        if (carrinhoRef.current.length === 0) {
          flashErro("Carrinho vazio — nada para colocar em espera.");
          return;
        }
        salvarEmEsperaRef.current?.();
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
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelarAberto, pagamentoAberto]);

  // Refs vivas para handlers do listener global (evita re-bind a cada render).
  const carrinhoRef = useRef(carrinho);
  const pagamentoAbertoRef = useRef(pagamentoAberto);
  const abrirPagamentoRef = useRef(null);
  const confirmarPagamentoRef = useRef(null);
  const adicionarPagamentoFormaRef = useRef(null);
  const salvarEmEsperaRef = useRef(null);
  const onAlternarCleanRef = useRef(onAlternarClean);
  const topProdutosRef = useRef(painel.topProdutos);
  useEffect(() => { carrinhoRef.current = carrinho; }, [carrinho]);
  useEffect(() => { pagamentoAbertoRef.current = pagamentoAberto; }, [pagamentoAberto]);
  useEffect(() => { topProdutosRef.current = painel.topProdutos; }, [painel.topProdutos]);
  useEffect(() => { adicionarPagamentoFormaRef.current = adicionarPagamentoForma; });
  useEffect(() => { salvarEmEsperaRef.current = salvarEmEspera; });
  useEffect(() => { onAlternarCleanRef.current = onAlternarClean; });

  function abrirPagamento(formaInicial = "DINHEIRO", seedOpts = {}) {
    setErro("");
    // Offline NAO bloqueia mais a venda (Fase 3): o pagamento abre normal e
    // o confirmar guarda a venda na fila local para envio automatico depois.
    if (!podeFinalizarRede) {
      emitirToast({
        tipo: "aviso",
        titulo: "Sem conexao — modo offline",
        mensagem: "Pode vender normalmente: a venda fica guardada neste computador e sera enviada sozinha quando a conexao voltar.",
        duracao: 5000,
      });
    }
    if (semCaixa) { flashErro("Abra um caixa antes de finalizar uma venda."); return; }
    if (carrinho.length === 0) { flashErro("Adicione ao menos um item"); return; }
    if (descontoNum > subtotal) { flashErro("Desconto não pode ser maior que o subtotal"); return; }
    setPagamentoAberto(true);
    // Caso comum: 1 forma so. Semeia o split com a forma escolhida cobrindo o
    // total — F10 sem argumento usa DINHEIRO; clique nos cards F1-F6 do painel
    // principal passa a forma do card pra evitar dupla entrada (DINHEIRO + forma).
    if (pagamentos.length === 0) {
      dispatchPagamentos({
        type: "add",
        pagamento: criarPagamento(formaInicial, total, seedOpts),
      });
    }
    setTimeout(() => {
      if (dinheiroInputRef.current) dinheiroInputRef.current.focus();
      else finalizarRef.current?.focus();
    }, 50);
  }
  // Mantém a ref atualizada para o listener global.
  useEffect(() => { abrirPagamentoRef.current = abrirPagamento; });

  // Venda sem rede: o payload (que ja carrega a idempotencyKey) vai para a
  // fila local em IndexedDB; o sincronizador envia quando a conexao voltar.
  // Espelha o pos-venda online (baixa estoque local, fecha modal, limpa
  // carrinho) — sem recibo: o cupom depende do numero que o servidor atribui
  // no envio (fica no Historico depois da sincronizacao).
  async function finalizarOffline(payload) {
    await enfileirarVenda(payload, {
      total,
      itens: carrinho.length,
      formas: pagamentos.map(p => p.forma),
    });
    idempotencyKeyRef.current = null;
    setProdutos(prev => prev.map(p => {
      const it = carrinho.find(c => c.produtoId === p.id);
      if (!it) return p;
      const novoEstoque = Math.round((Number(p.estoque) - Number(it.quantidade)) * 1000) / 1000;
      return { ...p, estoque: novoEstoque };
    }));
    setPagamentoAberto(false);
    emitirToast({
      tipo: "aviso",
      titulo: "Venda guardada offline 📡",
      mensagem: "Sera enviada automaticamente quando a conexao voltar. O cupom fica disponivel no Historico apos o envio.",
      duracao: 6500,
    });
    limparCarrinho({ refocar: true });
  }

  async function confirmarPagamento() {
    // Trava sincrona: barra o 2o disparo no mesmo tick (F10 repetido, F10 +
    // clique, double-click) antes que `salvando` reflita no estado. Sem este
    // return imediato, dois disparos viravam duas vendas (#1046/#1047).
    if (enviandoVendaRef.current) return;
    setErro("");
    if (carrinho.length === 0) { setErro("Adicione ao menos um item"); return; }
    if (descontoNum > subtotal) { setErro("Desconto não pode ser maior que o subtotal"); return; }
    if (pagamentos.length === 0) { setErro("Adicione ao menos uma forma de pagamento"); return; }
    if (!podeFinalizar) {
      setErro(restante > 0
        ? `Falta receber ${fmtBRL(restante)} para fechar o total`
        : `Soma dos pagamentos (${fmtBRL(pago)}) excede o total. Ajuste o valor antes de finalizar.`);
      return;
    }

    const geraReceber = valorAPrazo > 0;
    if (geraReceber) {
      if (!contaVencimento) { setErro("Informe o vencimento da conta a receber"); return; }
      const p = parseInt(contaParcelas, 10);
      if (!Number.isFinite(p) || p < 1 || p > 60) {
        setErro("Numero de parcelas deve estar entre 1 e 60"); return;
      }
    }

    // Fecha a trava sincrona ANTES de qualquer await. Liberada no finally.
    enviandoVendaRef.current = true;
    // Gera a chave de idempotencia uma vez por checkout e reusa em retries.
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = novoId();
    setSalvando(true);
    // Visivel no catch: se a rede cair NO MEIO do envio, o mesmo payload vai
    // para a fila offline (a idempotencyKey impede duplicar caso o servidor
    // tenha gravado antes da queda).
    let payloadEnviado = null;
    try {
      const payload = {
        clienteId: clienteId || null,
        // Idempotencia: backend rejeita (devolve a venda ja criada) se receber
        // 2 requisicoes com esta mesma chave. Blindagem definitiva contra dup.
        idempotencyKey: idempotencyKeyRef.current,
        // Backend deriva Venda.formaPagamento como a forma do pagamento de
        // MAIOR valor — nao precisamos enviar formaPagamento singular.
        pagamentos: pagamentos.map(p => ({
          forma: p.forma,
          valor: Math.round((Number(p.valor) || 0) * 100) / 100,
          formaCustomNome: p.formaCustomNome || undefined,
        })),
        desconto: descontoNum,
        observacoes: null,
        itens: carrinho.map(it => ({
          produtoId: it.produtoId,
          quantidade: it.quantidade,
          precoUnitario: it.precoUnitario,
        })),
      };
      const pontosN = parseInt(pontosResgatando, 10);
      if (clienteId && Number.isFinite(pontosN) && pontosN > 0) {
        payload.pontosResgatar = pontosN;
      }
      if (geraReceber) {
        payload.gerarContaReceber = {
          vencimento: contaVencimento,
          parcelas: parseInt(contaParcelas, 10) || 1,
        };
      }
      // Conversao Oportunidade -> Venda: backend vincula vendaId na mesma
      // transacao que cria a venda. Se o vinculo falhar (409 race), a venda
      // inteira reverte — operador pode tentar de novo.
      if (oportunidadeConvertendo?.id) {
        payload.oportunidadeId = oportunidadeConvertendo.id;
      }
      payloadEnviado = payload;

      // SEM REDE: nem tenta o servidor — direto para a fila local. Pontos e
      // conversao de oportunidade exigem validacao online no ato.
      if (!podeFinalizarRede) {
        if (payload.pontosResgatar) {
          throw new Error("Resgate de pontos precisa de conexao. Remova os pontos para vender offline.");
        }
        if (payload.oportunidadeId) {
          throw new Error("Conversao de oportunidade precisa de conexao. Tente quando a rede voltar.");
        }
        await finalizarOffline(payload);
        return;
      }

      const venda = await api.criarVenda(payload);
      // Venda gravada: rotaciona a chave para a PROXIMA venda nascer com chave
      // nova. (Em erro nao rotaciona — o retry reaproveita a chave e o backend
      // devolve a venda existente se a 1a tiver gravado apesar da falha de rede.)
      idempotencyKeyRef.current = null;
      // Limpa estado de conversao apos sucesso para evitar reaplicar.
      if (oportunidadeConvertendo) setOportunidadeConvertendo(null);
      // Atualiza estoques locais (estoque do backend chega como Decimal
      // serializado em string — Number() normaliza para subtracao)
      setProdutos(prev => prev.map(p => {
        const it = carrinho.find(c => c.produtoId === p.id);
        if (!it) return p;
        const novoEstoque = Math.round((Number(p.estoque) - Number(it.quantidade)) * 1000) / 1000;
        return { ...p, estoque: novoEstoque };
      }));
      setPagamentoAberto(false);
      // Para o recibo: somatorio do que foi entregue em dinheiro e troco
      // total. ReciboModal ainda mostra resumo "Valor recebido / Troco".
      const recebidoDinheiro = pagamentos
        .filter(p => p.forma === "DINHEIRO")
        .reduce((acc, p) => acc + (Number(p.valorEntregue) || Number(p.valor) || 0), 0);
      setReciboAberto({
        venda,
        valorRecebido: Math.round(recebidoDinheiro * 100) / 100,
        troco,
      });
      // Não refocar busca — o ReciboModal vai roubar foco para "Nova Venda".
      limparCarrinho({ refocar: false });
      recarregarCaixa();
      recarregarPainel();
    } catch (err) {
      // Conexao caiu NO MEIO do envio (fetch falhou ou estourou timeout):
      // guarda offline em vez de mostrar erro. Se o servidor chegou a gravar
      // antes da queda, o reenvio com a mesma idempotencyKey devolve a venda
      // existente — zero duplicata.
      const quedaDeRede = err instanceof ApiError && (err.kind === "NETWORK" || err.kind === "TIMEOUT");
      if (quedaDeRede && payloadEnviado && !payloadEnviado.pontosResgatar && !payloadEnviado.oportunidadeId) {
        try {
          await finalizarOffline(payloadEnviado);
          return; // finally libera a trava
        } catch { /* IndexedDB indisponivel — cai no erro padrao abaixo */ }
      }
      setErro(err.message);
      focarBusca();
    } finally {
      setSalvando(false);
      // Libera a trava sincrona — permite novo envio (mesmo carrinho em caso
      // de erro, ou a proxima venda apos sucesso).
      enviandoVendaRef.current = false;
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
  useModalKeys(esperaAberta, {
    onClose: () => { setEsperaAberta(false); setDescarteConfirmar(null); focarBusca(); },
  });
  useModalKeys(orcamentoAberto, {
    onClose: () => { setOrcamentoAberto(false); focarBusca(); },
  });

  const [scanFocused, setScanFocused] = useState(false);

  // Barra de bipagem extraida pra variavel: o MESMO no de JSX e montado na
  // coluna direita (layout completo) ou acima da cestinha (modo Clean).
  // Fonte unica — autofocus, sugestoes e teclado nao se duplicam nunca.
  const barraBipagem = (
    <div className={`pdv-scan pdv-scan-side ${scanFocused ? "is-focused" : ""}`}>
      <div className="pdv-scan-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7V5a1 1 0 0 1 1-1h2"/>
          <path d="M20 7V5a1 1 0 0 0-1-1h-2"/>
          <path d="M4 17v2a1 1 0 0 0 1 1h2"/>
          <path d="M20 17v2a1 1 0 0 1-1 1h-2"/>
          <path d="M4 12h16"/>
        </svg>
      </div>
      <input
        ref={buscaRef}
        aria-label="Buscar ou bipar produto por código ou nome"
        placeholder="Bipe ou digite código/nome…"
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
          setTimeout(() => {
            if (!algumaModalAberta && document.activeElement === document.body) {
              buscaRef.current?.focus();
            }
          }, 120);
        }}
      />
      <span className="pdv-scan-hint">
        <span className="pdv-kbd is-accent">⏎</span>
      </span>

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
                <FotoProduto url={p.imagem} nome={p.nome} tamanho={32} servico={p.tipoItem === "SERVICO"} />
                <div className="pdv-scan-sugg-name">
                  <div className="nm">
                    {p.nome}
                    {p.tipoItem === "SERVICO" && <span className="pdv-srv-tag">SVC</span>}
                  </div>
                  <div className="meta">
                    {p.codigo}
                    {" · "}{p.tipoItem === "SERVICO" ? "♾" : `${p.estoque} ${p.unidade}`}
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
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* TOPO: alerta quando nao ha caixa aberto (full-width). Resumo de vendas
          do dia e barra de bipagem foram movidos para a coluna direita pra dar
          mais altura vertical ao cupom. */}
      {!caixaCarregando && semCaixa && (
        <div className="pdv-no-cash" style={{ justifyContent: "space-between" }}>
          <span style={{ fontSize: 18 }}>🔒</span>
          <div style={{ flex: 1 }}>
            {tipoCaixa === "COMPARTILHADO" ? (
              <>
                <b>Nenhum caixa compartilhado aberto.</b> Peça para alguém abrir
                o caixa do turno antes de registrar vendas.
              </>
            ) : (
              <><b>Nenhum caixa aberto.</b> Você não pode registrar vendas sem caixa.</>
            )}
          </div>
          <button
            onClick={() => setAbrirCaixaAberto(true)}
            className="pdv-btn-finalize"
            style={{ width: "auto", padding: "10px 20px", fontSize: 13, flexShrink: 0 }}
          >🟢 Abrir Caixa</button>
        </div>
      )}

      {oportunidadeConvertendo && (
        <div className="pdv-conversao-banner" role="status">
          <span className="pdv-conversao-icon">🎯</span>
          <span className="pdv-conversao-text">
            Convertendo <b>Oportunidade #{oportunidadeConvertendo.numero}</b>
            {oportunidadeConvertendo.titulo ? <> — &ldquo;{oportunidadeConvertendo.titulo}&rdquo;</> : null}
            <span className="pdv-conversao-hint"> · finalize a venda para vincular automaticamente</span>
          </span>
          <button
            type="button"
            onClick={() => setOportunidadeConvertendo(null)}
            className="pdv-conversao-cancelar"
            title="Cancelar a conversão (a venda nao sera vinculada a oportunidade)"
          >✕ Cancelar conversão</button>
        </div>
      )}

      {/* Vendas feitas offline aguardando envio — some sozinho quando a fila
          esvazia. Erro do servidor (estoque, caixa fechado) aparece aqui com
          opcao de reenviar ou descartar. */}
      {filaOffline.length > 0 && (
        <div
          role="status"
          data-testid="banner-vendas-offline"
          style={{
            background: C.card,
            border: `1px solid ${pendenciaOfflineComErro ? C.red : C.yellow}`,
            borderRadius: 8,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 13,
          }}
        >
          <span style={{ fontSize: 20 }}>📡</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: C.text }}>
              {filaOffline.length} venda{filaOffline.length > 1 ? "s" : ""} aguardando envio (feita{filaOffline.length > 1 ? "s" : ""} offline)
            </div>
            <div style={{ fontSize: 12, color: pendenciaOfflineComErro ? C.red : C.muted, marginTop: 2 }}>
              {pendenciaOfflineComErro
                ? `Rejeitada pelo servidor: ${pendenciaOfflineComErro.ultimoErro}. Resolva e reenvie, ou descarte.`
                : podeFinalizarRede
                  ? "Enviando automaticamente…"
                  : "Serao enviadas sozinhas assim que a conexao voltar."}
            </div>
          </div>
          {podeFinalizarRede && (
            <button
              type="button"
              onClick={() => sincronizarVendasOffline()}
              style={{
                background: C.accent, color: "var(--accent-ink)", border: "none",
                borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}
            >
              Enviar agora
            </button>
          )}
          {pendenciaOfflineComErro && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Descartar esta venda offline? Ela NAO sera registrada no sistema.")) {
                  descartarPendente(pendenciaOfflineComErro.chave);
                }
              }}
              style={{
                background: "transparent", color: C.red, border: `1px solid ${C.red}66`,
                borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}
            >
              Descartar
            </button>
          )}
        </div>
      )}

      {rascunhoOferta && (
        <div
          role="status"
          style={{
            background: C.card,
            border: `1px solid ${C.accent}`,
            borderRadius: 8,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 13,
          }}
        >
          <span style={{ fontSize: 20 }}>💾</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: C.text }}>
              Voce tinha {rascunhoOferta.itens} {rascunhoOferta.itens === 1 ? "item" : "itens"} no carrinho
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              Salvo automaticamente ha {rascunhoOferta.idadeMin} {rascunhoOferta.idadeMin === 1 ? "minuto" : "minutos"}. Deseja recuperar?
            </div>
          </div>
          <button
            type="button"
            onClick={recuperarRascunho}
            style={{
              background: C.accent,
              color: "var(--accent-ink)",
              border: "none",
              borderRadius: 6,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >Recuperar</button>
          <button
            type="button"
            onClick={dispensarRascunho}
            style={{
              background: "transparent",
              color: C.muted,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 13,
              cursor: "pointer",
            }}
            title="Descartar rascunho"
          >Descartar</button>
        </div>
      )}

      <div className={`pdv-main${modoClean ? " pdv-main--clean" : ""}`}>
        {/* COLUNA ESQUERDA — no modo Clean a bipagem sobe pra ca, acima da cestinha */}
        <div className="pdv-col-venda">
        {modoClean && barraBipagem}
        {/* CESTINHA — fotos, novos no topo */}
        <div className="pdv-card">
          <div
            className={`pdv-card-hd pdv-cestinha-hd ${carrinho.length > 0 ? "is-cupom" : ""}`}
            style={{ borderBottom: carrinho.length > 0 ? "0" : "1px solid var(--pdv-line)" }}
          >
            <div className="pdv-card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="20" r="1.4"/>
                <circle cx="17" cy="20" r="1.4"/>
                <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6"/>
              </svg>
              {carrinho.length === 0 ? (
                <>
                  Cestinha
                  <span className="pill pdv-pill-waiting" title="O sistema está pronto. Bipe ou digite no campo de busca.">
                    <span className="pdv-pill-dot pdv-pill-dot-mut" />
                    aguardando bipagem
                  </span>
                </>
              ) : (
                <>
                  <span className="pdv-cestinha-hd-lbl">Cupom em andamento</span>
                  <span className="pill pdv-pill-live">
                    <span className="pdv-pill-dot" />
                    {carrinho.length} {carrinho.length === 1 ? "item" : "itens"}
                  </span>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {vendasEspera.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setEsperaAberta(true); setDescarteConfirmar(null); }}
                  className="pdv-btn-rm"
                  style={{ color: "var(--pdv-accent)", borderColor: "color-mix(in oklab, var(--pdv-accent) 40%, transparent)" }}
                  title="Atendimentos em espera — clique para retomar"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                  </svg>
                  Em espera
                  <span className="pdv-pill-dot" style={{ position: "static", animation: "none", background: "var(--pdv-accent)" }} />
                  {vendasEspera.length}
                </button>
              )}
              {carrinho.length > 0 && (
                <button
                  type="button"
                  onClick={salvarEmEspera}
                  disabled={salvandoEspera}
                  className="pdv-btn-rm"
                  title="Salvar este atendimento para retomar depois (F9)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
                  </svg>
                  {salvandoEspera ? "Salvando…" : "Salvar atendimento"}
                  <span className="pdv-kbd">F9</span>
                </button>
              )}
              {carrinho.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOrcamentoAberto(true)}
                  className="pdv-btn-rm"
                  style={{ color: "var(--pdv-c-violet, #a78bfa)", borderColor: "rgba(167,139,250,.4)" }}
                  title="Converter este pedido em orçamento e enviar por WhatsApp ou e-mail"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  Orçamento
                </button>
              )}
              {carrinho.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCancelarAberto(true)}
                  className="pdv-btn-rm pdv-btn-rm-danger"
                  title="Cancelar item (F8)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  </svg>
                  Cancelar item
                  <span className="pdv-kbd">F8</span>
                </button>
              )}
              {carrinho.length > 0 && (
                <button onClick={limparCarrinho} className="pdv-btn-rm" title="Limpar carrinho">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                  </svg>
                  Limpar tudo
                </button>
              )}
            </div>
          </div>

          {carrinho.length === 0 ? (modoClean ? (
            <CestinhaVaziaClean />
          ) : (
            <AcessoRapido
              user={user}
              topProdutos={painel.topProdutos}
              ultimasVendas={painel.ultimasVendas}
              onAdicionar={(p) => {
                if (!ignoraLimiteEstoque(p) && p.estoque <= 0) {
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
          )) : (
            <div className="pdv-cupom-outer">
              <div className="pdv-cupom-paper">
                {/* === HEADER DO CUPOM === */}
                <div className="pdv-cupom-hd">
                  <div className="pdv-cupom-hd-store">
                    {((empresa?.nomeFantasia || empresa?.razaoSocial) || "GESTÃOPROMAX").toUpperCase()}
                  </div>
                  {empresa?.cnpj && (
                    <div className="pdv-cupom-hd-sub">CNPJ {empresa.cnpj}</div>
                  )}
                  {(() => {
                    const end = formatarEndereco(empresa);
                    return end ? <div className="pdv-cupom-hd-sub">{end.toUpperCase()}</div> : null;
                  })()}
                  {(empresa?.telefone || empresa?.email) && (
                    <div className="pdv-cupom-hd-sub">
                      {[empresa.telefone, empresa.email].filter(Boolean).join(" · ").toUpperCase()}
                    </div>
                  )}
                  <div className="pdv-cupom-hd-tag">— CUPOM DE VENDA · NÃO FISCAL —</div>
                  <div className="pdv-cupom-hd-meta">
                    <span>{new Date().toLocaleDateString("pt-BR")} {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span>CX#{caixaAtual?.id ? String(caixaAtual.id).slice(-4) : "—"}</span>
                  </div>
                  <div className="pdv-cupom-hd-meta">
                    <span>OPERADOR: {(user.nome || "—").toUpperCase().slice(0, 22)}</span>
                  </div>
                  <div className="pdv-cupom-hd-cols">
                    <span>ITEM  DESCRIÇÃO</span>
                    <span>VALOR</span>
                  </div>
                  <div className="pdv-cupom-hd-dashes">--------------------------------</div>
                </div>

                <div className="pdv-cart-list">
                {carrinho.map((it, idx) => (
                  <div
                    key={it.produtoId}
                    className={`pdv-cupom-item ${destacado === it.produtoId ? "is-new" : ""}`}
                  >
                    {/* Linha 1: índice + nome */}
                    <div className="pdv-cupom-linha1">
                      <span className="pdv-cupom-idx">{String(idx + 1).padStart(3, "0")}</span>
                      <span className="pdv-cupom-nome">
                        {it.nome.toUpperCase()}{it.tipoItem === "SERVICO" && " [SVC]"}
                      </span>
                    </div>
                    {/* Linha 2: qtd UN x preço ....... total */}
                    <div className="pdv-cupom-linha2">
                      <span className="pdv-cupom-calc-txt">
                        {fmtQtd(it.quantidade)} {(it.unidade || "UN").toString().toUpperCase()} x {fmtBRL(it.precoUnitario)}
                      </span>
                      <span className="pdv-cupom-dots" />
                      <span className="pdv-cupom-total-txt">{fmtBRL(it.quantidade * it.precoUnitario)}</span>
                    </div>
                    {/* Overlay de controles — visível apenas no hover */}
                    <div className="pdv-cupom-ctrl">
                      <button className="pdv-cupom-ctrl-btn" onClick={() => alterarQuantidade(it.produtoId, -1)}>−</button>
                      <span className="pdv-cupom-ctrl-qty">{fmtQtd(it.quantidade)}</span>
                      <button className="pdv-cupom-ctrl-btn" onClick={() => alterarQuantidade(it.produtoId, +1)}>+</button>
                      {it.tipoItem === "SERVICO" && (
                        <input
                          type="number" step="0.01" min="0"
                          value={it.precoUnitario}
                          onChange={e => alterarPreco(it.produtoId, e.target.value)}
                          className="pdv-cupom-ctrl-preco"
                          title="Preço editável (serviço)"
                        />
                      )}
                      <button className="pdv-cupom-ctrl-rm" onClick={() => removerItem(it.produtoId)} title="Remover item">✕</button>
                    </div>
                  </div>
                ))}
                </div>

                {/* === FOOTER DO CUPOM === */}
                <div className="pdv-cupom-ft">
                  <div className="pdv-cupom-ft-dashes">--------------------------------</div>
                  <div className="pdv-cupom-ft-row">
                    <span>QTD. ITENS</span>
                    <span>{fmtQtd(carrinho.reduce((acc, it) => acc + it.quantidade, 0))}</span>
                  </div>
                  <div className="pdv-cupom-ft-row">
                    <span>SUBTOTAL</span>
                    <span>{fmtBRL(subtotal)}</span>
                  </div>
                  {descontoNum > 0 && (
                    <div className="pdv-cupom-ft-row pdv-cupom-ft-desc">
                      <span>(-) DESCONTO</span>
                      <span>- {fmtBRL(descontoNum)}</span>
                    </div>
                  )}
                  {descontoFidelidade > 0 && (
                    <div className="pdv-cupom-ft-row pdv-cupom-ft-desc">
                      <span>(-) PONTOS</span>
                      <span>- {fmtBRL(descontoFidelidade)}</span>
                    </div>
                  )}
                  <div className="pdv-cupom-ft-total">
                    <span>TOTAL R$</span>
                    <span>{fmtBRL(total).replace("R$", "").trim()}</span>
                  </div>
                  <div className="pdv-cupom-ft-dashes">================================</div>
                  <div className="pdv-cupom-ft-aviso">* VENDA EM ANDAMENTO · F10 para finalizar *</div>
                </div>
              </div>
            </div>
          )}

          {/* ATALHOS RÁPIDOS — abaixo dos mais vendidos / cupom */}
          <div className="pdv-shortcuts">
            <div className="pdv-shortcuts-label">Atalhos rápidos</div>
            <div className="pdv-short-grid">
              <BotaoAtalho
                tecla="F8" tom="warn" label="Cancelar item"
                disabled={carrinho.length === 0}
                onClick={() => carrinho.length > 0 && setCancelarAberto(true)}
              />
              <BotaoAtalho
                tecla="F9" tom="info" label="Em espera"
                disabled={carrinho.length === 0 || salvandoEspera}
                onClick={salvarEmEspera}
              />
              <BotaoAtalho
                tecla="F10" tom="ok" label="Finalizar"
                disabled={carrinho.length === 0 || semCaixa}
                onClick={() => abrirPagamento()}
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
          </div>
        </div>
        </div>

        {/* PAINEL DIREITO — bipagem (layout completo), totais, finalizar, atalhos */}
        <div className="pdv-side">
          {/* BARRA DE BIPAGEM — autofocus permanente. No modo Clean ela
              renderiza na coluna esquerda, acima da cestinha. */}
          {!modoClean && barraBipagem}

          {(modoClean || carrinho.length > 0) && (
            <div className="pdv-totals-card">
              <div className="pdv-total-block pdv-total-block-lg">
                <div className="pdv-total-lbl">Total a pagar</div>
                <TotalAnimado valor={total} />
              </div>

              {erro && !algumaModalAberta && (
                <div className="pdv-erro-inline">{erro}</div>
              )}

              <button
                onClick={() => abrirPagamento()}
                disabled={semCaixa || carrinho.length === 0}
                title={
                  semCaixa ? "Abra um caixa antes de finalizar"
                  : !podeFinalizarRede ? "Sem conexao — finalize quando a conexao voltar"
                  : ""
                }
                className={`pdv-btn-finalize ${podeFinalizarRede ? "" : "gp-bloqueio-offline"}`}
              >
                {semCaixa ? <>🔒 Caixa fechado</> : <>Finalizar venda</>}
                <span className="pdv-kbd">F10</span>
                <span style={{ fontSize: 16 }}>→</span>
              </button>
            </div>
          )}

          {/* VENDAS DE HOJE — entre o total e as formas de pagamento.
              No modo Clean some: nada de numeros do dia na frente do operador. */}
          {!modoClean && !caixaCarregando && !semCaixa && (
            <FormasPagamentoTopo resumo={painel.resumoDia} role={user.role} />
          )}

          <div className="pdv-pay-card">
            <div className="pdv-shortcuts-label">F1 – F6 forma de pagamento</div>
            <div className="pdv-pay-grid">
              {FORMAS_ORDENADAS.map(f => {
                const cor = FORMA_COR_CLASSE[f.id] || "pdv-pay-c-emerald";
                const flash = formaAtalhoFlash === f.id;
                return (
                  <button
                    key={f.id} type="button"
                    onClick={() => abrirPagamento(f.id)}
                    title={`${f.atalho} • ${f.label}`}
                    className={`pdv-pay-btn ${cor}${flash ? " pdv-pay-btn--flash" : ""}`}
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
                    const cor = FORMA_COR_CLASSE[c.baseFormaPagamento] || "pdv-pay-c-violet";
                    return (
                      <button
                        key={c.id} type="button"
                        onClick={() => abrirPagamento(c.baseFormaPagamento, { formaCustomId: c.id, formaCustomNome: c.nome })}
                        title={`${c.nome} (${c.baseFormaPagamento})`}
                        className={`pdv-pay-btn ${cor}`}
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

          {/* AVISO DE VENDEDOR — abaixo das formas de pagamento */}
          <div className="pdv-vendedor-aviso">
            Vendedor: <span>{user.nome}</span>
          </div>
        </div>
      </div>

      {/* MODAL CANCELAR ITEM (F8) — clique no produto para remover */}
      {esperaAberta && (
        <div
          onClick={() => { setEsperaAberta(false); setDescarteConfirmar(null); focarBusca(); }}
          className="pdv-modal-bg"
        >
          <div
            onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" className="pdv-modal"
            style={{ width: "min(580px, calc(100vw - 32px))" }}
          >
            <div className="pdv-modal-hd">
              <div>
                <div className="pdv-modal-title">Atendimentos em espera</div>
                <div className="pdv-modal-sub">
                  Retome um atendimento salvo. Os itens voltam para a cestinha.
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setEsperaAberta(false); setDescarteConfirmar(null); focarBusca(); }}
                aria-label="Fechar" className="pdv-modal-x"
              >×</button>
            </div>

            <div className="pdv-modal-body">
              {vendasEspera.length === 0 ? (
                <div style={{ padding: "30px 0", textAlign: "center", color: "var(--pdv-t3)", fontSize: 13 }}>
                  Nenhum atendimento em espera.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 16 }}>
                  {vendasEspera.map(esp => {
                    const qtdItens = Array.isArray(esp.itens) ? esp.itens.length : 0;
                    const confirmando = descarteConfirmar === esp.id;
                    return (
                      <div key={esp.id} className="pdv-cancel-item" style={{ cursor: "default" }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: "color-mix(in oklab, var(--pdv-accent) 12%, transparent)",
                          color: "var(--pdv-accent)", fontWeight: 700, fontSize: 13,
                          fontFamily: "'Geist Mono', monospace",
                        }}>#{esp.numero}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: "var(--pdv-t1)", fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {esp.cliente?.nome || "Sem cliente"}
                          </div>
                          <div style={{ color: "var(--pdv-t3)", fontSize: 11, marginTop: 2 }}>
                            {qtdItens} {qtdItens === 1 ? "item" : "itens"} · {fmtBRL(esp.total)} · {tempoAtras(esp.criadoEm)}
                            {esp.user?.nome ? ` · ${esp.user.nome}` : ""}
                          </div>
                        </div>
                        {confirmando ? (
                          <button
                            type="button"
                            onClick={() => descartarEspera(esp)}
                            className="pdv-btn-rm pdv-btn-rm-danger"
                            title="Confirmar exclusão deste atendimento"
                          >Confirmar exclusão</button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setDescarteConfirmar(esp.id);
                              setTimeout(() => setDescarteConfirmar(prev => (prev === esp.id ? null : prev)), 3500);
                            }}
                            className="pdv-btn-rm"
                            title="Descartar este atendimento (cliente desistiu)"
                          >Descartar</button>
                        )}
                        <button
                          type="button"
                          onClick={() => retomarEspera(esp)}
                          disabled={salvandoEspera}
                          className="pdv-btn-rm"
                          style={{ color: "var(--pdv-c-emerald, #22c55e)", borderColor: "rgba(34,197,94,.35)" }}
                          title="Retomar este atendimento"
                        >↩ Retomar</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pdv-modal-foot" style={{ justifyContent: "space-between" }}>
              <span style={{ fontSize: 11.5, color: "var(--pdv-t3)" }}>
                Tem itens na cestinha? Ao retomar, eles são salvos em espera automaticamente.
              </span>
              <button
                type="button"
                onClick={() => { setEsperaAberta(false); setDescarteConfirmar(null); focarBusca(); }}
                className="pdv-btn-ghost"
              >Fechar <span className="pdv-kbd is-warn">Esc</span></button>
            </div>
          </div>
        </div>
      )}

      {orcamentoAberto && (
        <OrcamentoRapidoModal
          carrinho={carrinho}
          subtotal={subtotal}
          desconto={descontoNum}
          total={total}
          clientes={clientes}
          clienteId={clienteId}
          empresa={empresa}
          user={user}
          podeEnviar={podeFinalizarRede}
          onFechar={() => { setOrcamentoAberto(false); focarBusca(); }}
          onSucesso={(msg) => {
            setOrcamentoAberto(false);
            emitirToast({ tipo: "sucesso", titulo: "Orçamento gerado", mensagem: msg, duracao: 5000 });
            focarBusca();
          }}
        />
      )}

      {cancelarAberto && (
        <div
          onClick={() => { setCancelarAberto(false); focarBusca(); }}
          className="pdv-modal-bg"
        >
          <div
            onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" className="pdv-modal"
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
                aria-label="Fechar" className="pdv-modal-x"
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
                          {it.codigo} · {fmtQtd(it.quantidade)} × {fmtBRL(it.precoUnitario)}
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
            role="dialog" aria-modal="true" className="pdv-modal"
            style={{ width: `min(${ehUnidadePeso(qtdModalProduto.unidade) ? 500 : 420}px, calc(100vw - 32px))` }}
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
              <button type="button" onClick={fecharQtdModal} aria-label="Fechar" className="pdv-modal-x">×</button>
            </div>

            <div className="pdv-modal-body" style={{ paddingBottom: 12 }}>
              {ehUnidadePeso(qtdModalProduto.unidade) ? (() => {
                // ===== Produto por PESO: teclado de balança (gramas) =====
                // O campo guarda os GRAMAS digitados; o sistema converte para
                // a unidade de estoque (KG/G) e calcula o valor pelo preço/kg.
                const gramas = parseFloat(String(qtdModalValor).replace(",", ".")) || 0;
                const qtdEstoque = pesoGramasParaEstoque(gramas, qtdModalProduto.unidade);
                const un = (qtdModalProduto.unidade || "KG").toUpperCase();
                const sub = qtdEstoque * Number(qtdModalProduto.precoVenda);
                const append = (d) => setQtdModalValor(v => {
                  const s = String(v || "") + d;
                  return s.replace(/^0+(?=\d)/, "");
                });
                const tecla = {
                  padding: "10px 0", borderRadius: 9, border: "1px solid var(--pdv-line)",
                  color: "var(--pdv-t1)", fontSize: 18, fontWeight: 600, cursor: "pointer",
                  fontVariantNumeric: "tabular-nums", lineHeight: 1, fontFamily: "inherit",
                };
                return (
                  // Layout em duas colunas: à esquerda display + atalhos + total;
                  // à direita o teclado numérico (estilo balança). Mantém tudo
                  // acima da dobra em notebooks (sem rolagem). A digitação física
                  // (numpad) cai direto no input focado; Enter confirma (useModalKeys).
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.05fr)", gap: 12, alignItems: "stretch" }}>
                    {/* COLUNA ESQUERDA */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                      <div>
                        <label className="pdv-field-label" style={{ marginBottom: 4 }}>Peso (gramas)</label>
                        <input
                          ref={qtdInputRef}
                          type="text"
                          inputMode="numeric"
                          value={qtdModalValor}
                          onChange={e => setQtdModalValor(e.target.value.replace(/[^0-9.,]/g, ""))}
                          placeholder="0"
                          className="pdv-qty-input"
                          style={{ padding: "10px 14px", fontSize: 26, borderRadius: 10, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                        />
                      </div>

                      {/* Atalhos de peso (grade 2×2, discretos) */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        {PRESETS_PESO_G.map(g => {
                          const ativo = gramas === g;
                          return (
                            <button
                              key={g}
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => setQtdModalValor(String(g))}
                              style={{
                                padding: "7px 0", borderRadius: 8,
                                border: `1px solid ${ativo ? "var(--pdv-accent)" : "var(--pdv-line)"}`,
                                background: ativo ? "var(--pdv-accent-glow)" : "var(--pdv-surf-2)",
                                color: ativo ? "var(--pdv-accent)" : "var(--pdv-t2)",
                                fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                                fontVariantNumeric: "tabular-nums", fontFamily: "inherit",
                              }}
                            >
                              {g >= 1000 ? `${g / 1000}kg` : `${g}g`}
                            </button>
                          );
                        })}
                      </div>

                      {/* Total (empurrado para a base, alinhado ao teclado) */}
                      <div
                        className="pdv-modal-amount"
                        style={{ margin: "auto 0 0", padding: "12px 14px", flexDirection: "column", alignItems: "stretch", gap: 6 }}
                      >
                        <div className="pdv-modal-amount-lbl">
                          {gramas > 0 ? `${fmtQtd(qtdEstoque)} ${un} × ${fmtBRL(qtdModalProduto.precoVenda)}` : `R$ ${fmtBRL(qtdModalProduto.precoVenda)} / ${un}`}
                        </div>
                        <div className="pdv-modal-amount-num" style={{ fontSize: 26 }}>
                          {(() => { const { int, dec } = fmtPartes(sub); return <><span className="cur">R$</span>{int}<span className="cents">,{dec}</span></>; })()}
                        </div>
                      </div>
                    </div>

                    {/* COLUNA DIREITA — teclado numérico compacto */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridAutoRows: "1fr", gap: 6 }}>
                      {["7", "8", "9", "4", "5", "6", "1", "2", "3", ",", "0", "⌫"].map(k => (
                        <button
                          key={k}
                          type="button"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            if (k === "⌫") setQtdModalValor(v => String(v || "").slice(0, -1));
                            else if (k === ",") setQtdModalValor(v => {
                              const s = String(v || "");
                              return s.includes(",") || s.includes(".") ? s : (s || "0") + ",";
                            });
                            else append(k);
                          }}
                          style={{ ...tecla, background: k === "⌫" ? "var(--pdv-surf-1)" : "var(--pdv-surf-2)", color: k === "⌫" ? "var(--pdv-t3)" : "var(--pdv-t1)" }}
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })() : (
                <>
                  <label className="pdv-field-label">Quantidade</label>
                  <input
                    ref={qtdInputRef}
                    type="number"
                    step="0.001"
                    min="0.001"
                    max={qtdModalProduto.tipoItem === "SERVICO" ? undefined : Number(qtdModalProduto.estoque) || undefined}
                    value={qtdModalValor}
                    onChange={e => setQtdModalValor(e.target.value)}
                    className="pdv-qty-input"
                  />

                  {(() => {
                    // Quantidade fracionaria — produtos vendidos por metro/litro
                    // multiplicam direto (1.5m * R$1,80 = R$2,70).
                    const raw = parseFloat(String(qtdModalValor).replace(",", "."));
                    const n = Number.isFinite(raw) && raw > 0 ? Math.round(raw * 1000) / 1000 : 0;
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
                </>
              )}
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
            role="dialog" aria-modal="true"
            className="pdv-modal pdv-modal--compact"
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
                aria-label="Fechar" className="pdv-modal-x"
              >×</button>
            </div>

            <div className="pdv-modal-body pdv-modal-body--compact" style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 10 }}>
              <div className="pdv-modal-amount" style={{ margin: 0 }}>
                <div>
                  <div className="pdv-modal-amount-lbl">Total a receber</div>
                  <div className="pdv-modal-amount-sub">
                    {fmtQtd(carrinho.reduce((a,it)=>a+it.quantidade,0))} produtos
                    {descontoNum > 0 && <> · desconto {fmtBRL(descontoNum)}</>}
                    {descontoFidelidade > 0 && <> · pontos −{fmtBRL(descontoFidelidade)}</>}
                  </div>
                </div>
                <div className="pdv-modal-amount-num">
                  {(() => { const { int, dec } = fmtPartes(total); return <><span className="cur">R$</span>{int}<span className="cents">,{dec}</span></>; })()}
                </div>
              </div>

              <div>
                <label className="pdv-field-label">Cliente (opcional)</label>
                <SelectBusca
                  opcoes={clientes}
                  value={clienteId}
                  onChange={setClienteId}
                  placeholder="— Consumidor —"
                  className="pdv-field-input"
                />
              </div>

              {/* Crediario do cliente: saldo/limite/disponivel (pro fiado) */}
              {clienteId && crediarioCliente && (crediarioCliente.limite != null || crediarioCliente.saldo > 0) && (
                <div style={{
                  padding: "10px 12px", borderRadius: 10,
                  background: crediarioCliente.acimaDoLimite ? "rgba(244,63,94,.08)" : "rgba(99,102,241,.08)",
                  border: `1px solid ${crediarioCliente.acimaDoLimite ? "rgba(244,63,94,.35)" : "rgba(99,102,241,.3)"}`,
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15 }}>📒</span>
                    <div>
                      <div style={{ color: "var(--pdv-t1)", fontWeight: 700, fontSize: 13 }}>
                        Crediário · deve {fmtBRL(crediarioCliente.saldo)}
                        {crediarioCliente.vencido > 0 && (
                          <span style={{ color: "var(--pdv-c-rose)", fontWeight: 700 }}> · {fmtBRL(crediarioCliente.vencido)} vencido</span>
                        )}
                      </div>
                      <div style={{ color: "var(--pdv-t3)", fontSize: 11 }}>
                        {crediarioCliente.limite != null
                          ? <>Limite {fmtBRL(crediarioCliente.limite)} · disponível <strong style={{ color: crediarioCliente.acimaDoLimite ? "var(--pdv-c-rose)" : "var(--pdv-c-emerald)" }}>{fmtBRL(crediarioCliente.disponivel)}</strong></>
                          : "Sem limite definido (fiado livre)"}
                      </div>
                    </div>
                  </div>
                  {crediarioCliente.acimaDoLimite && (
                    <span style={{ color: "var(--pdv-c-rose)", fontSize: 11, fontWeight: 700 }}>⚠️ Acima do limite</span>
                  )}
                </div>
              )}

              {configFidelidade?.ativo && clienteId && saldoPontos !== null && (
                <div style={{
                  padding: "12px 14px", borderRadius: 10,
                  background: "rgba(251,191,36,.08)",
                  border: "1px solid rgba(251,191,36,.3)",
                  display: "flex", flexDirection: "column", gap: 10,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 15 }}>⭐</span>
                      <div>
                        <div style={{ color: "var(--pdv-t1)", fontWeight: 700, fontSize: 13 }}>
                          {saldoPontos.toLocaleString("pt-BR")} pontos disponíveis
                        </div>
                        {saldoPontos > 0 && (
                          <div style={{ color: "var(--pdv-t3)", fontSize: 11 }}>
                            ≈ R$ {(saldoPontos / Number(configFidelidade.pontosParaUmReal)).toFixed(2)} em desconto
                          </div>
                        )}
                      </div>
                    </div>
                    {saldoPontos >= (configFidelidade.minimoResgate || 1) && (
                      <button
                        type="button"
                        onClick={() => { setPainelPontosAberto(v => !v); if (painelPontosAberto) setPontosResgatando(0); }}
                        style={{
                          padding: "5px 12px", borderRadius: 6, border: "1px solid rgba(251,191,36,.5)",
                          background: painelPontosAberto ? "rgba(251,191,36,.2)" : "transparent",
                          color: "var(--pdv-c-amber)", fontSize: 12, fontWeight: 600, cursor: "pointer",
                        }}
                      >{painelPontosAberto ? "Cancelar" : "Usar pontos"}</button>
                    )}
                  </div>

                  {painelPontosAberto && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                        <div style={{ flex: 1 }}>
                          <label className="pdv-field-label" style={{ color: "var(--pdv-c-amber)" }}>
                            Pontos a resgatar (mín. {configFidelidade.minimoResgate})
                          </label>
                          <input
                            type="number" min={configFidelidade.minimoResgate} max={saldoPontos}
                            step={configFidelidade.minimoResgate || 1}
                            value={pontosResgatando || ""}
                            onChange={e => setPontosResgatando(parseInt(e.target.value, 10) || 0)}
                            placeholder={`0 – ${saldoPontos.toLocaleString("pt-BR")} pts`}
                            className="pdv-field-input"
                          />
                        </div>
                        {descontoFidelidade > 0 && (
                          <div style={{
                            padding: "9px 14px", borderRadius: 8, background: "rgba(251,191,36,.15)",
                            border: "1px solid rgba(251,191,36,.4)", color: "var(--pdv-c-amber)",
                            fontWeight: 700, fontSize: 14, whiteSpace: "nowrap",
                          }}>
                            − R$ {descontoFidelidade.toFixed(2)}
                          </div>
                        )}
                      </div>
                      {pontosResgatando > saldoPontos && (
                        <div style={{ color: "var(--pdv-c-rose)", fontSize: 11 }}>
                          Saldo insuficiente — disponível: {saldoPontos.toLocaleString("pt-BR")} pts
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ETAPA#3: bloco visual de selecao de pagamentos (F1-F6 + personalizadas
                  + botao ⚙ Gerenciar) foi REMOVIDO do modal. Os atalhos F1-F6 continuam
                  funcionando globalmente (ver listener em useEffect acima — ETAPA#5).
                  Gerenciar formas de pagamento agora fica na sidebar (Sistema > Formas
                  de pagamento). Dica textual minimalista substitui o grid de botoes. */}
              {pagamentos.length === 0 && (
                <div style={{
                  padding: "8px 12px", borderRadius: 8,
                  background: "var(--pdv-surf-2)", border: "1px dashed var(--pdv-line)",
                  color: "var(--pdv-t3)", fontSize: 12, textAlign: "center",
                }}>
                  Pressione <span className="pdv-kbd">F1</span>–<span className="pdv-kbd">F6</span> para adicionar forma de pagamento
                </div>
              )}

              {pagamentos.length > 0 && (
                <div style={{
                  display: "flex", flexDirection: "column", gap: 8,
                  padding: 10, borderRadius: 10,
                  background: "var(--pdv-surf-2)",
                  border: "1px solid var(--pdv-line)",
                }}>
                  <div style={{
                    color: "var(--pdv-t3)", fontSize: 10.5, fontWeight: 500,
                    letterSpacing: ".06em", textTransform: "uppercase",
                  }}>
                    Pagamentos ({pagamentos.length})
                  </div>
                  {pagamentos.map((p, idx) => {
                    const ehDinheiro = p.forma === "DINHEIRO";
                    const trocoDoPagamento = ehDinheiro
                      ? Math.max(0, (Number(p.valorEntregue) || 0) - (Number(p.valor) || 0))
                      : 0;
                    const corBorda = FORMA_COR_VAR[p.forma] || "var(--pdv-accent)";
                    const primeiroDinheiroIdx = pagamentos.findIndex(x => x.forma === "DINHEIRO");
                    const ehPrimeiroDinheiro = ehDinheiro && idx === primeiroDinheiroIdx;
                    return (
                      <div key={p.id} style={{
                        display: "grid",
                        gridTemplateColumns: ehDinheiro ? "auto 1fr 1fr auto" : "auto 1fr auto",
                        gap: 8, alignItems: "center",
                        padding: "8px 10px", borderRadius: 8,
                        background: "var(--pdv-surf-1)",
                        borderLeft: `3px solid ${corBorda}`,
                      }}>
                        <div style={{
                          display: "flex", flexDirection: "column", minWidth: 80,
                        }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--pdv-t1)" }}>
                            {p.formaCustomNome || FORMA_LABEL[p.forma] || p.forma}
                          </span>
                          {p.formaCustomNome && (
                            <span style={{ fontSize: 10, color: "var(--pdv-t3)" }}>
                              {FORMA_LABEL[p.forma]}
                            </span>
                          )}
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 10, color: "var(--pdv-t3)", marginBottom: 2 }}>
                            {ehDinheiro ? "Vai pagar (R$)" : "Valor (R$)"}
                          </label>
                          <input
                            type="number" step="0.01" min="0"
                            value={p.valor}
                            onChange={e => {
                              const v = parseFloat(e.target.value.replace(",", ".")) || 0;
                              dispatchPagamentos({
                                type: "update", id: p.id,
                                patch: { valor: v },
                              });
                            }}
                            className="pdv-field-input"
                            style={{ padding: "6px 8px", fontSize: 13 }}
                          />
                        </div>
                        {ehDinheiro && (
                          <div>
                            <label style={{ display: "block", fontSize: 10, color: "var(--pdv-t3)", marginBottom: 2 }}>
                              Recebi (R$) {trocoDoPagamento > 0 && (
                                <span style={{ color: "var(--pdv-accent)" }}> → troco {fmtBRL(trocoDoPagamento)}</span>
                              )}
                            </label>
                            <input
                              ref={ehPrimeiroDinheiro ? dinheiroInputRef : null}
                              type="number" step="0.01" min={0}
                              // Vazio quando nao informado (em vez de "0"). Placeholder
                              // mostra o valor devido como dica: deixar vazio = exato.
                              value={p.valorEntregue ? p.valorEntregue : ""}
                              placeholder={String(p.valor)}
                              onChange={e => {
                                const raw = e.target.value.trim();
                                const v = parseFloat(raw.replace(",", "."));
                                dispatchPagamentos({
                                  type: "update", id: p.id,
                                  // Campo vazio/invalido => undefined (pagamento exato,
                                  // sem troco) em vez de gravar um "0".
                                  patch: { valorEntregue: raw === "" || !Number.isFinite(v) ? undefined : v },
                                });
                              }}
                              className="pdv-field-input"
                              style={{ padding: "6px 8px", fontSize: 13 }}
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => dispatchPagamentos({ type: "remove", id: p.id })}
                          title="Remover este pagamento"
                          style={{
                            background: "transparent", border: "none", color: "var(--pdv-t3)",
                            fontSize: 18, cursor: "pointer", padding: "0 4px",
                            alignSelf: "end", lineHeight: 1,
                          }}
                        >×</button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{
                display: "grid", gap: 4,
                gridTemplateColumns: "1fr 1fr",
                padding: "8px 12px", borderRadius: 10,
                background: restante > 0
                  ? "rgba(245,158,11,.08)"
                  : "color-mix(in oklab, var(--pdv-accent) 14%, var(--pdv-surf-2))",
                border: `1px solid ${restante > 0 ? "rgba(245,158,11,.30)" : "var(--pdv-accent-glow)"}`,
              }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ color: "var(--pdv-t3)", fontSize: 10.5, fontWeight: 500, textTransform: "uppercase", letterSpacing: ".06em" }}>Total</span>
                  <span style={{ color: "var(--pdv-t1)", fontSize: 17, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(total)}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ color: "var(--pdv-t3)", fontSize: 10.5, fontWeight: 500, textTransform: "uppercase", letterSpacing: ".06em" }}>Pago</span>
                  <span style={{ color: "var(--pdv-t1)", fontSize: 17, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(pago)}</span>
                </div>
                {restante > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gridColumn: "1 / -1" }}>
                    <span style={{ color: "var(--pdv-c-amber)", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Falta receber</span>
                    <span style={{ color: "var(--pdv-c-amber)", fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(restante)}</span>
                  </div>
                ) : troco > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gridColumn: "1 / -1" }}>
                    <span style={{ color: "var(--pdv-accent)", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>Troco</span>
                    <span style={{ color: "var(--pdv-accent)", fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(troco)}</span>
                  </div>
                ) : null}
              </div>

              <div>
                <label className="pdv-field-label">Desconto (R$)</label>
                <input type="number" step="0.01" min="0" value={desconto}
                  onChange={e => setDesconto(e.target.value)} className="pdv-field-input" />
              </div>

              {valorAPrazo > 0 && (
                <div style={{
                  padding: "12px 14px", borderRadius: 10,
                  background: "color-mix(in oklab, var(--pdv-c-violet) 10%, var(--pdv-surf-2))",
                  border: "1px solid color-mix(in oklab, var(--pdv-c-violet) 35%, transparent)",
                  display: "flex", flexDirection: "column", gap: 10,
                }}>
                  <div style={{
                    color: "var(--pdv-c-violet)", fontSize: 11, fontWeight: 600,
                    letterSpacing: ".06em", textTransform: "uppercase",
                  }}>
                    Conta a receber será gerada · {fmtBRL(valorAPrazo)} a prazo
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label className="pdv-field-label">
                        {contaParcelas > 1 ? "Vencimento da 1ª parcela" : "Vencimento"}
                      </label>
                      <input
                        type="date"
                        value={contaVencimento}
                        onChange={e => setContaVencimento(e.target.value)}
                        className="pdv-field-input"
                      />
                    </div>
                    <div>
                      <label className="pdv-field-label">Parcelas</label>
                      <input
                        type="number" min="1" max="60" step="1"
                        value={contaParcelas}
                        onChange={e => setContaParcelas(e.target.value)}
                        className="pdv-field-input"
                      />
                    </div>
                  </div>
                  {contaVencimento && (
                    <div style={{ fontSize: 12, color: "var(--pdv-t2)" }}>
                      ✓ {contaParcelas}× {fmtBRL(valorAPrazo / Math.max(1, parseInt(contaParcelas, 10) || 1))}
                      {parseInt(contaParcelas, 10) > 1 ? (
                        <> — vencendo no dia {new Date(contaVencimento + "T12:00:00").getDate()} de cada mês a partir de {new Date(contaVencimento + "T12:00:00").toLocaleDateString("pt-BR")}</>
                      ) : (
                        <> — vencimento em {new Date(contaVencimento + "T12:00:00").toLocaleDateString("pt-BR")}</>
                      )}
                    </div>
                  )}
                </div>
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
              {/* Cobrar na maquininha Mercado Pago — visivel so quando a empresa
                  configurou o device (Configuracoes > Maquininha). Substitui o
                  fluxo manual de pagamentos: cobra o TOTAL da venda via Point e
                  a venda real e criada automaticamente quando o pagamento aprovar. */}
              {configMp?.mpAtivo && configMp?.configurada && total > 0 && !salvando && (
                <button
                  type="button"
                  onClick={() => setMpAberto(true)}
                  className="pdv-btn-ghost"
                  style={{ borderColor: C.green + "55", color: C.green }}
                  title="Cobrar o total da venda na maquininha Mercado Pago"
                >
                  📲 Maquininha MP
                </button>
              )}
              {/* PIX tem flag propria (mpPixAtivo) — pode ser ligado/desligado
                  independente da maquininha. Gera QR Code via /v1/payments e
                  exibe na tela do PDV; nao usa o device fisico. */}
              {configMp?.mpPixAtivo && total > 0 && !salvando && (
                <button
                  type="button"
                  onClick={() => setPixAberto(true)}
                  className="pdv-btn-ghost"
                  style={{ borderColor: "#06b6d455", color: "#06b6d4" }}
                  title="Gerar QR Code PIX para o cliente pagar pelo app do banco"
                >
                  ⚡ PIX
                </button>
              )}
              <button
                ref={finalizarRef}
                onClick={confirmarPagamento}
                disabled={salvando || !podeFinalizar}
                className={`pdv-btn-finalize ${podeFinalizarRede ? "" : "gp-bloqueio-offline"}`}
                style={{ flex: 1, opacity: (salvando || !podeFinalizar) ? 0.55 : 1 }}
                title={!podeFinalizar
                  ? (restante > 0
                      ? `Falta ${fmtBRL(restante)} para fechar`
                      : "Soma dos pagamentos excede o total — ajuste")
                  : undefined}
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

      {mpAberto && (
        <MaquininhaMpModal
          totalReais={total}
          // Payload de venda — backend re-executa vendaController.criar quando
          // o webhook aprovar. Para MP usamos pagamento UNICO com a forma que
          // mapeia para o tipo escolhido (decidido dentro do modal).
          vendaPayload={{
            clienteId: clienteId || null,
            // pagamentos[]: 1 linha com o tipo final do MP. O modal sabe o tipo
            // que o cliente escolheu — backend usa CARTAO_CREDITO/CARTAO_DEBITO/PIX
            // como forma para que relatorios/caixa registrem corretamente.
            // Aqui passamos placeholder PIX; o backend NAO usa este campo —
            // o modal sobrescreve via "tipo" no body do /pagamentos-mp/cobrar
            // e o webhook handler aplica a forma correta no payload guardado.
            // Para o efeito de criar a venda apos aprovar, montamos pagamento
            // unico igual ao total — split nao e suportado nesta v1 do MP.
            pagamentos: [{
              forma: "CARTAO_CREDITO", // o modal substituira pelo tipo escolhido
              valor: Math.round(total * 100) / 100,
            }],
            desconto: descontoNum,
            observacoes: null,
            itens: carrinho.map(it => ({
              produtoId: it.produtoId,
              quantidade: it.quantidade,
              precoUnitario: it.precoUnitario,
            })),
            ...(clienteId && parseInt(pontosResgatando, 10) > 0
              ? { pontosResgatar: parseInt(pontosResgatando, 10) }
              : {}),
            ...(oportunidadeConvertendo?.id
              ? { oportunidadeId: oportunidadeConvertendo.id }
              : {}),
          }}
          onFechar={() => setMpAberto(false)}
          onConcluido={({ vendaNumero, valor }) => {
            // Aprovado pela maquininha: backend ja criou a Venda. Aqui so
            // limpamos o estado local. Como nao temos o objeto Venda completo
            // pra abrir o ReciboModal sem outra request, simplesmente fechamos
            // o modal e disparamos um refetch do painel — o operador inicia
            // uma nova venda. (futuro: GET /vendas/:id e abrir recibo)
            setMpAberto(false);
            setPagamentoAberto(false);
            if (oportunidadeConvertendo) setOportunidadeConvertendo(null);
            // Atualiza estoques locais (mesmo padrao de confirmarPagamento).
            setProdutos(prev => prev.map(p => {
              const it = carrinho.find(c => c.produtoId === p.id);
              if (!it) return p;
              const novoEstoque = Math.round((Number(p.estoque) - Number(it.quantidade)) * 1000) / 1000;
              return { ...p, estoque: novoEstoque };
            }));
            limparCarrinho({ refocar: false });
            recarregarCaixa();
            recarregarPainel();
            // Feedback visual rapido: alerta nativo + foco volta para busca.
            alert(`✅ Pagamento aprovado · Venda #${vendaNumero || "—"} · ${fmtBRL(valor)}`);
            focarBusca();
          }}
        />
      )}

      {pixAberto && (
        <PixQrCodeModal
          totalReais={total}
          vendaPayload={{
            clienteId: clienteId || null,
            pagamentos: [{ forma: "PIX", valor: Math.round(total * 100) / 100 }],
            desconto: descontoNum,
            observacoes: null,
            itens: carrinho.map(it => ({
              produtoId: it.produtoId,
              quantidade: it.quantidade,
              precoUnitario: it.precoUnitario,
            })),
            ...(clienteId && parseInt(pontosResgatando, 10) > 0
              ? { pontosResgatar: parseInt(pontosResgatando, 10) }
              : {}),
            ...(oportunidadeConvertendo?.id
              ? { oportunidadeId: oportunidadeConvertendo.id }
              : {}),
          }}
          onFechar={() => setPixAberto(false)}
          onConcluido={({ vendaNumero, valor }) => {
            setPixAberto(false);
            setPagamentoAberto(false);
            if (oportunidadeConvertendo) setOportunidadeConvertendo(null);
            setProdutos(prev => prev.map(p => {
              const it = carrinho.find(c => c.produtoId === p.id);
              if (!it) return p;
              const novoEstoque = Math.round((Number(p.estoque) - Number(it.quantidade)) * 1000) / 1000;
              return { ...p, estoque: novoEstoque };
            }));
            limparCarrinho({ refocar: false });
            recarregarCaixa();
            recarregarPainel();
            alert(`✅ PIX aprovado · Venda #${vendaNumero || "—"} · ${fmtBRL(valor)}`);
            focarBusca();
          }}
        />
      )}

      {vendaDetalheAberta && (
        <DetalheVendaModal
          venda={vendaDetalheAberta}
          onFechar={() => { setVendaDetalheAberta(null); focarBusca(); }}
        />
      )}

      {abrirCaixaAberto && (
        <ModalAbrirCaixaPDV
          onCancelar={() => setAbrirCaixaAberto(false)}
          onSucesso={() => { setAbrirCaixaAberto(false); recarregarCaixa(); }}
        />
      )}
    </div>
  );
}

