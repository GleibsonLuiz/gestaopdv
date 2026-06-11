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
  descartarPendente, aoMudarFila,
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

// Formas que representam venda a prazo: o cliente (ou operadora) ainda nao
// pagou no ato. O modal de pagamento exibe vencimento + parcelas para
// gerar ContaReceber automatica.
const FORMAS_GERA_RECEBER = new Set(["CARTAO_CREDITO", "BOLETO", "CREDIARIO"]);

// Hoje + N dias no formato YYYY-MM-DD usando o fuso LOCAL (toISOString usa
// UTC e pode voltar um dia em fusos negativos como BRT).
function dataDaqui(diasAFrente) {
  const d = new Date();
  d.setDate(d.getDate() + diasAFrente);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

const STATUS_INFO = {
  CONCLUIDA: { label: "Concluída", cor: C.green },
  CANCELADA: { label: "Cancelada", cor: C.red },
  PENDENTE:  { label: "Pendente",  cor: C.yellow },
  EM_EDICAO: { label: "Em edição", cor: C.yellow },
};

const fmtBRL = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

// Formata quantidade exibindo decimais apenas quando existem (1.5 -> "1,5",
// 2 -> "2"). Bate com Decimal(12,3) do schema (ate 3 casas).
const fmtQtd = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
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

// Mapeamento de cor (CSS var name) por forma de pagamento — usado em pílulas
// e no dashboard de "vendas hoje por forma".
const FORMA_COR_VAR = {
  DINHEIRO: "var(--pdv-accent)",
  PIX: "var(--pdv-c-cyan)",
  CARTAO_DEBITO: "var(--pdv-c-sky)",
  CARTAO_CREDITO: "var(--pdv-c-amber)",
  BOLETO: "var(--pdv-c-violet)",
  CREDIARIO: "var(--pdv-c-rose)",
};

// Codificação cromática por método (memória muscular do operador): cada
// método tem cor distinta e estável; aplicada na borda lateral + fundo do
// ícone. PIX em ciano BACEN, dinheiro em verde-bandeira, demais conforme
// convenção de bandeiras (débito azul / crédito laranja-âmbar etc).
const FORMA_COR_CLASSE = {
  DINHEIRO: "pdv-pay-c-emerald",
  PIX: "pdv-pay-c-cyan",
  CARTAO_DEBITO: "pdv-pay-c-sky",
  CARTAO_CREDITO: "pdv-pay-c-amber",
  BOLETO: "pdv-pay-c-violet",
  CREDIARIO: "pdv-pay-c-rose",
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
// Estado dos pagamentos do modal de fechamento. O reducer mantem apenas a
// lista — derivados (pago, restante, troco, valorAPrazo) ficam em useMemo
// do componente, garantindo estado minimo.
//
// Por pagamento:
//   - id              chave estavel (crypto.randomUUID — n unique por modal)
//   - forma           FormaPagamento enum
//   - formaCustomId   id de FormaPagamentoCustom (se variante personalizada)
//   - formaCustomNome snapshot textual da forma custom (envia ao backend)
//   - valor           o que efetivamente entra na venda (== vai no payload)
//   - valorEntregue   so DINHEIRO: o que o cliente entregou (default = valor);
//                     se > valor, vira troco — exibido na UI mas NAO persiste
function pagamentosReducer(state, action) {
  switch (action.type) {
    case "add":
      return [...state, action.pagamento];
    case "remove":
      return state.filter(p => p.id !== action.id);
    case "update":
      return state.map(p => p.id === action.id ? { ...p, ...action.patch } : p);
    case "reset":
      return [];
    case "reconcileTotal": {
      // Total mudou DEPOIS de semear/digitar os pagamentos (caso classico:
      // operador aplica um desconto com o modal de pagamento ja aberto). Se a
      // soma dos `valor` passou a exceder o novo total, apara o excedente do
      // ultimo pagamento para o primeiro. Em DINHEIRO o `valorEntregue` e
      // preservado de proposito: o excesso vira TROCO em vez de bloquear o
      // botao "Confirmar pagamento".
      const totalAlvo = Math.max(0, Number(action.total) || 0);
      const soma = state.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
      let excedente = Math.round((soma - totalAlvo) * 100) / 100;
      if (excedente <= 0.001) return state;
      const next = state.map(p => ({ ...p }));
      for (let i = next.length - 1; i >= 0 && excedente > 0.001; i--) {
        const reduz = Math.min(Number(next[i].valor) || 0, excedente);
        next[i].valor = Math.round(((Number(next[i].valor) || 0) - reduz) * 100) / 100;
        excedente = Math.round((excedente - reduz) * 100) / 100;
      }
      return next;
    }
    default:
      return state;
  }
}

const novoId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

function criarPagamento(forma, valor, opts = {}) {
  return {
    id: novoId(),
    forma,
    formaCustomId: opts.formaCustomId || null,
    formaCustomNome: opts.formaCustomNome || null,
    valor: Math.max(0, Number(valor) || 0),
    // "Recebi" comeca VAZIO (undefined), nao espelhando o valor. So e
    // preenchido quando o cliente entrega mais que o devido — ai vira troco.
    // Vazio = pagamento exato (sem troco). Evita o "0" confuso no campo.
    valorEntregue: undefined,
  };
}

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
    api.listarProdutos({ ativo: "true" }).then(setProdutos).catch(() => {});
    api.listarClientes({ ativo: "true" }).then(setClientes).catch(() => {});
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
        // Servico: ignora limite de estoque.
        if (!ehServico && qtdAtual + incremento > estoqueProduto + 1e-9) {
          flashErro(`Estoque insuficiente de "${p.nome}" (disponível: ${estoqueProduto}).`);
          return prev;
        }
        // Move o item incrementado para o topo (UX típica de PDV).
        const atualizado = { ...prev[idx], quantidade: Math.round((qtdAtual + incremento) * 1000) / 1000 };
        const restante = prev.filter((_, i) => i !== idx);
        return [atualizado, ...restante];
      }
      if (!ehServico && estoqueProduto + 1e-9 < incremento) {
        flashErro(`Estoque insuficiente de "${p.nome}" (disponível: ${estoqueProduto}).`);
        return prev;
      }
      const novoItem = {
        produtoId: p.id,
        codigo: p.codigo,
        nome: p.nome,
        unidade: p.unidade,
        // Para servicos guardamos Infinity como estoque "logico" — assim os
        // controles + e definirQuantidade nao bloqueiam nada.
        estoque: ehServico ? Infinity : estoqueProduto,
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
    if (produto.tipoItem !== "SERVICO" && produto.estoque <= 0) {
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
    if (qtdModalProduto.tipoItem !== "SERVICO" && n > estoqueProduto + 1e-9) {
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
      if (prod.tipoItem !== "SERVICO" && Number(prod.estoque) + 1e-9 < etiqueta.quantidade) {
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
    () => carrinho.reduce((acc, it) => acc + it.quantidade * it.precoUnitario, 0),
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
  const total = Math.max(0, subtotal - descontoNum - descontoFidelidade);

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
        if (p.tipoItem !== "SERVICO" && p.estoque <= 0) {
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
            className="pdv-modal"
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
                className="pdv-modal-x"
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
            className="pdv-modal"
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
              <button type="button" onClick={fecharQtdModal} className="pdv-modal-x">×</button>
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
                className="pdv-modal-x"
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

// ============== MODAL: ORCAMENTO RAPIDO (WhatsApp / E-mail) ==============
// Converte o carrinho atual em um orcamento (status RASCUNHO) e gera o link
// de envio por WhatsApp ou e-mail com o resumo do orcamento. A cestinha
// continua intacta — e um passo pre-venda, nao substitui o fechamento.

function OrcamentoRapidoModal({
  carrinho, subtotal, desconto, total, clientes, clienteId, empresa, user,
  podeEnviar, onFechar, onSucesso,
}) {
  const clienteSel = useMemo(
    () => clientes.find(c => c.id === clienteId) || null,
    [clientes, clienteId],
  );

  const [nome, setNome] = useState(clienteSel?.nome || "");
  const [telefone, setTelefone] = useState(clienteSel?.telefone || "");
  const [email, setEmail] = useState(clienteSel?.email || "");
  const [validadeDias, setValidadeDias] = useState("7");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useModalKeys(true, { onClose: () => !salvando && onFechar() });

  // Monta o texto do orcamento. Usa a marcacao do WhatsApp (*negrito*,
  // _italico_) para um cupom visual; para EMAIL os marcadores sao removidos
  // (o corpo do mailto e texto puro e exibiria os asteriscos literalmente).
  function montarMensagem(numero, canal) {
    const empresaNome = (empresa?.nomeFantasia || empresa?.razaoSocial || "GestãoProMax").trim();
    const sep = "━━━━━━━━━━━━━━━━━━";
    const L = [];

    // Cabeçalho
    L.push(`🧾 *ORÇAMENTO Nº ${numero}*`);
    L.push(`*${empresaNome}*`);
    if (empresa?.cnpj) L.push(`CNPJ: ${empresa.cnpj}`);
    const endereco = formatarEndereco(empresa);
    if (endereco) L.push(`📍 ${endereco}`);
    const contato = [empresa?.telefone, empresa?.email].filter(Boolean).join("  ·  ");
    if (contato) L.push(contato);
    L.push("");

    // Dados do orçamento
    L.push(sep);
    if (nome.trim()) L.push(`👤 *Cliente:* ${nome.trim()}`);
    L.push(`📅 *Data:* ${new Date().toLocaleDateString("pt-BR")}`);
    const dias = parseInt(validadeDias, 10);
    if (Number.isFinite(dias) && dias > 0) {
      L.push(`⏳ *Validade:* ${dias} ${dias === 1 ? "dia" : "dias"}`);
    }
    L.push(sep);
    L.push("");

    // Itens
    L.push("🛒 *ITENS*");
    L.push("");
    carrinho.forEach((it, i) => {
      const sub = it.quantidade * it.precoUnitario;
      const un = (it.unidade || "un").toString();
      L.push(`*${i + 1}.* ${it.nome}`);
      L.push(`${fmtQtd(it.quantidade)} ${un} × ${fmtBRL(it.precoUnitario)} = *${fmtBRL(sub)}*`);
      L.push("");
    });

    // Totais
    L.push(sep);
    L.push(`Subtotal:  ${fmtBRL(subtotal)}`);
    if (desconto > 0) L.push(`Desconto:  -${fmtBRL(desconto)}`);
    L.push(`💰 *TOTAL:  ${fmtBRL(total)}*`);
    L.push(sep);

    // Observações
    if (observacoes.trim()) {
      L.push("");
      L.push("📝 *Observações:*");
      L.push(observacoes.trim());
    }

    L.push("");
    if (user?.nome) L.push(`_Atendido por: ${user.nome}_`);
    L.push("_Obrigado pela preferência!_ 🙏");

    let txt = L.join("\n");
    if (canal === "EMAIL") txt = txt.replace(/[*_]/g, "");
    return txt;
  }

  // Cria o orcamento no backend e (se houver canal) abre o link de envio.
  async function gerar(canal) {
    setErro("");
    if (!podeEnviar) {
      setErro("Sem conexão com o servidor. Tente novamente quando a conexão voltar.");
      return;
    }
    if (carrinho.length === 0) { setErro("Carrinho vazio."); return; }
    if (canal === "WHATSAPP" && !String(telefone).replace(/\D/g, "")) {
      setErro("Informe um telefone para enviar por WhatsApp.");
      return;
    }
    if (canal === "EMAIL" && !email.trim()) {
      setErro("Informe um e-mail para enviar por e-mail.");
      return;
    }

    const dias = parseInt(validadeDias, 10);
    const notaValidade = Number.isFinite(dias) && dias > 0
      ? `Validade do orçamento: ${dias} ${dias === 1 ? "dia" : "dias"}.`
      : "";
    const obsFinal = [observacoes.trim(), notaValidade].filter(Boolean).join(" ") || null;

    setSalvando(true);
    try {
      const orc = await api.criarOrcamento({
        tipo: "ORCAMENTO",
        tabelaPreco: "AV",
        clienteId: clienteId || null,
        descricaoCliente: nome.trim() || "Consumidor",
        telefone: telefone || null,
        desconto,
        observacoes: obsFinal,
        itens: carrinho.map((it, idx) => ({
          produtoId: it.produtoId,
          descricao: it.nome,
          quantidade: it.quantidade,
          valorUnitario: it.precoUnitario,
          ordem: idx,
        })),
      });

      if (canal) {
        const corpo = montarMensagem(orc.numero, canal);
        const link = gerarLink({
          tipo: canal,
          telefone,
          email,
          assunto: `Orçamento Nº ${orc.numero} — ${(empresa?.nomeFantasia || empresa?.razaoSocial || "GestãoProMax").trim()}`,
          corpo,
        });
        if (link) window.open(link, "_blank", "noopener,noreferrer");
      }

      const via = canal === "WHATSAPP" ? " — abrindo WhatsApp"
        : canal === "EMAIL" ? " — abrindo e-mail"
        : "";
      onSucesso(`Orçamento #${orc.numero} (${fmtBRL(total)}) salvo${via}. Veja em Orçamentos.`);
    } catch (err) {
      setErro(err.message || "Falha ao gerar o orçamento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onFechar()} className="pdv-modal-bg">
      <div onClick={e => e.stopPropagation()} className="pdv-modal" style={{ width: "min(540px, calc(100vw - 32px))" }}>
        <div className="pdv-modal-hd">
          <div>
            <div className="pdv-modal-title">Orçamento rápido</div>
            <div className="pdv-modal-sub">
              {carrinho.length} {carrinho.length === 1 ? "item" : "itens"} · {fmtBRL(total)} — envie por WhatsApp ou e-mail
            </div>
          </div>
          <button type="button" onClick={() => !salvando && onFechar()} className="pdv-modal-x">×</button>
        </div>

        <div className="pdv-modal-body" style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 12 }}>
          <div>
            <label className="pdv-field-label">Cliente</label>
            <input
              className="pdv-field-input"
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Nome do cliente (opcional)"
              maxLength={200}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="pdv-field-label">Telefone (WhatsApp)</label>
              <input
                className="pdv-field-input"
                value={telefone}
                onChange={e => setTelefone(e.target.value)}
                placeholder="(00) 00000-0000"
                maxLength={50}
              />
            </div>
            <div>
              <label className="pdv-field-label">E-mail</label>
              <input
                className="pdv-field-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="cliente@email.com"
                maxLength={200}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
            <div>
              <label className="pdv-field-label">Validade (dias)</label>
              <input
                className="pdv-field-input"
                type="number" min="0" step="1"
                value={validadeDias}
                onChange={e => setValidadeDias(e.target.value)}
              />
            </div>
            <div>
              <label className="pdv-field-label">Observações</label>
              <input
                className="pdv-field-input"
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                placeholder="Ex.: condições de pagamento, prazo de entrega…"
                maxLength={500}
              />
            </div>
          </div>

          {/* Resumo dos itens */}
          <div style={{
            border: "1px solid var(--pdv-line)", borderRadius: 10, padding: "10px 12px",
            background: "var(--pdv-surface, rgba(255,255,255,.02))", maxHeight: 180, overflowY: "auto",
          }}>
            {carrinho.map(it => (
              <div key={it.produtoId} style={{
                display: "flex", justifyContent: "space-between", gap: 10,
                fontSize: 12.5, color: "var(--pdv-t2)", padding: "3px 0",
              }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {fmtQtd(it.quantidade)}× {it.nome}
                </span>
                <span style={{ flexShrink: 0, color: "var(--pdv-t1)" }}>{fmtBRL(it.quantidade * it.precoUnitario)}</span>
              </div>
            ))}
            <div style={{
              display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6,
              borderTop: "1px dashed var(--pdv-line)", fontWeight: 700, color: "var(--pdv-t1)", fontSize: 13.5,
            }}>
              <span>Total</span><span>{fmtBRL(total)}</span>
            </div>
          </div>

          {erro && <div className="pdv-erro-inline">{erro}</div>}
        </div>

        <div className="pdv-modal-foot" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <button type="button" onClick={() => !salvando && onFechar()} className="pdv-btn-ghost" disabled={salvando}>
            Cancelar <span className="pdv-kbd is-warn">Esc</span>
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => gerar(null)}
              disabled={salvando}
              className="pdv-btn-rm"
              title="Apenas salvar o orçamento (sem enviar)"
            >
              {salvando ? "Salvando…" : "Só salvar"}
            </button>
            <button
              type="button"
              onClick={() => gerar("EMAIL")}
              disabled={salvando}
              className="pdv-btn-rm"
              style={{ color: "var(--pdv-c-violet, #a78bfa)", borderColor: "rgba(167,139,250,.4)" }}
            >
              ✉️ E-mail
            </button>
            <button
              type="button"
              onClick={() => gerar("WHATSAPP")}
              disabled={salvando}
              className="pdv-btn-rm"
              style={{ color: "var(--pdv-c-emerald, #22c55e)", borderColor: "rgba(34,197,94,.4)" }}
            >
              💬 WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== MODAL: ABRIR CAIXA DIRETO DO PDV ==============

function ModalAbrirCaixaPDV({ onCancelar, onSucesso }) {
  const [saldoInicial, setSaldoInicial] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [sugestao, setSugestao] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const saldoRef = useRef(null);
  useModalKeys(true, { onClose: () => !salvando && onCancelar() });

  useEffect(() => {
    api.sugerirTrocoCaixa()
      .then(r => { setSugestao(r); setSaldoInicial(String(r.sugestao ?? 0)); })
      .catch(() => setSaldoInicial("0"));
    setTimeout(() => saldoRef.current?.focus(), 80);
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
    <div className="pdv-modal-bg" onClick={() => !salvando && onCancelar()}>
      <div className="pdv-modal" style={{ width: "min(440px, calc(100vw - 32px))" }} onClick={e => e.stopPropagation()}>
        <div className="pdv-modal-hd">
          <div>
            <div className="pdv-modal-title">🟢 Abrir Caixa</div>
            <div className="pdv-modal-sub">Informe o saldo inicial em dinheiro (troco)</div>
          </div>
          <button type="button" onClick={onCancelar} disabled={salvando} className="pdv-modal-x">×</button>
        </div>

        <form onSubmit={salvar}>
          <div className="pdv-modal-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
            {sugestao?.origem && (
              <div style={{
                background: "color-mix(in oklab, var(--pdv-accent) 10%, transparent)",
                border: "1px solid color-mix(in oklab, var(--pdv-accent) 30%, transparent)",
                borderRadius: 10, padding: "10px 14px", marginBottom: 14,
                fontSize: 12.5, color: "var(--pdv-t2)", lineHeight: 1.5,
              }}>
                💡 Sugestão baseada no fechamento do caixa <b style={{ color: "var(--pdv-t1)" }}>#{sugestao.origem.caixaNumero}</b>:{" "}
                <b style={{ color: "var(--pdv-c-lime)" }}>{fmtBRL(sugestao.sugestao)}</b>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label className="pdv-field-label">Saldo Inicial (R$) *</label>
              <input
                ref={saldoRef}
                type="number" step="0.01" min="0"
                value={saldoInicial}
                onChange={e => setSaldoInicial(e.target.value)}
                className="pdv-field-input"
              />
            </div>
            <div style={{ marginBottom: 4 }}>
              <label className="pdv-field-label">Observações</label>
              <input
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                placeholder="Opcional"
                className="pdv-field-input"
              />
            </div>

            {erro && <div className="pdv-erro-inline" style={{ marginTop: 12 }}>{erro}</div>}
          </div>

          <div className="pdv-modal-foot">
            <button type="button" onClick={onCancelar} disabled={salvando} className="pdv-btn-ghost">
              Cancelar <span className="pdv-kbd is-warn">Esc</span>
            </button>
            <button type="submit" disabled={salvando} className="pdv-btn-finalize" style={{ flex: 1 }}>
              {salvando ? "Abrindo…" : "Abrir Caixa"}
              {!salvando && <span className="pdv-kbd">Enter</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============== TOPO DO PDV: VENDAS DE HOJE POR FORMA DE PAGAMENTO ==============
// Substitui o antigo CaixaStatusCard. Saldo, sangria, suprimento e faturamento
// total deixam de aparecer aqui — tudo isso fica restrito a tela do Caixa.
// Componente colapsavel: por default vira uma barra fina de ~28px no topo,
// mostrando apenas o total do dia + chips minimalistas. Click expande para os
// cards detalhados. Estado persistido em localStorage.
function FormasPagamentoTopo({ resumo, role }) {
  const r = resumo || { porForma: [], quantidade: 0 };
  const totalPagamentos = r.porForma.reduce((acc, f) => acc + f.total, 0);
  const qtdVendas = r.quantidade || r.porForma.reduce((acc, f) => acc + (f.quantidade || 0), 0);
  const dataLabel = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const semVendas = r.porForma.length === 0;
  const formasOrdenadas = [...r.porForma].sort((a, b) => b.total - a.total);
  const maxValor = formasOrdenadas.reduce((m, f) => Math.max(m, f.total), 0) || 1;
  // VENDEDOR ve apenas percentuais; GERENTE/ADMIN veem valores em R$.
  const mostrarValor = role === "ADMIN" || role === "GERENTE";
  // Resumo numerico contextual: "R$ 50,00 · 3 vendas" para gerente,
  // "3 vendas" para vendedor. Substitui o antigo "100%" isolado que
  // nao dizia 100% DE QUE.
  const totalLabel = semVendas
    ? "—"
    : mostrarValor
      ? `${fmtBRL(totalPagamentos)} · ${qtdVendas} ${qtdVendas === 1 ? "venda" : "vendas"}`
      : `${qtdVendas} ${qtdVendas === 1 ? "venda" : "vendas"}`;

  return (
    <div className="pdv-graf-formas">
      <div className="pdv-graf-hd">
        <span className="pdv-graf-icon">◆</span>
        <span className="pdv-graf-lbl">Vendas de hoje</span>
        <span className="pdv-graf-date">{dataLabel}</span>
        <span className="pdv-graf-total" title={semVendas ? "" : `${qtdVendas} venda(s) finalizada(s) hoje${mostrarValor ? ` totalizando ${fmtBRL(totalPagamentos)}` : ""}`}>
          {semVendas ? <span className="pdv-graf-total-mut">—</span> : totalLabel}
        </span>
      </div>
      <div className="pdv-graf-body">
        {semVendas ? (
          <div className="pdv-graf-empty">Sem vendas finalizadas hoje</div>
        ) : (
          <div className="pdv-graf-chart">
            {formasOrdenadas.map(f => {
              const pct = (f.total / maxValor) * 100;
              const pctTotal = (f.total / (totalPagamentos || 1)) * 100;
              const cor = FORMA_COR_VAR[f.formaPagamento] || "var(--pdv-accent)";
              const nomeCompleto = FORMA_LABEL[f.formaPagamento] || f.formaPagamento;
              const label = nomeCompleto.slice(0, 6);
              return (
                <div
                  key={f.formaPagamento}
                  className="pdv-graf-col"
                  title={`${nomeCompleto}: ${fmtBRL(f.total)} (${pctTotal.toFixed(0)}%)`}
                >
                  <div className="pdv-graf-lbl-bot">{label}</div>
                  <div className="pdv-graf-bar-wrap">
                    <div
                      className="pdv-graf-bar"
                      style={{
                        width: `${Math.max(pct, 6)}%`,
                        background: `linear-gradient(90deg, color-mix(in oklab, ${cor} 75%, white), ${cor})`,
                        boxShadow: `3px 0 10px -2px ${cor}66, inset 0 1px 0 rgba(255,255,255,.15)`,
                      }}
                    />
                  </div>
                  <div className="pdv-graf-val" style={{ color: cor }}>
                    {mostrarValor ? fmtBRL(f.total) : `${pctTotal.toFixed(0)}%`}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============== CESTINHA VAZIA — MODO CLEAN ==============
// Substituto do AcessoRapido no modo focado: nada de "Mais vendidos" nem
// historico — so a confirmacao visual de que o sistema esta pronto pra
// bipar. Quem quer os cards alterna de volta com F7.
function CestinhaVaziaClean() {
  return (
    <div className="pdv-clean-vazio">
      <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7V5a1 1 0 0 1 1-1h2"/>
        <path d="M20 7V5a1 1 0 0 0-1-1h-2"/>
        <path d="M4 17v2a1 1 0 0 0 1 1h2"/>
        <path d="M20 17v2a1 1 0 0 1-1 1h-2"/>
        <path d="M8 9v6M12 9v6M16 9v6"/>
      </svg>
      <div className="pdv-clean-vazio-tit">Pronto para bipar</div>
      <div className="pdv-clean-vazio-sub">
        Bipe ou digite o código/nome do produto e pressione <span className="pdv-kbd is-accent">⏎</span>
      </div>
    </div>
  );
}

// ============== ACESSO RAPIDO (cestinha vazia) ==============
// Mostrado no espaco antes ocupado por "Cestinha vazia". Combina chips dos
// produtos mais vendidos (clicaveis) com lista das ultimas vendas do caixa.
function AcessoRapido({ user, topProdutos, ultimasVendas, onAdicionar, onAbrirVenda }) {
  const semDados = (!topProdutos?.length) && (!ultimasVendas?.length);
  // ADMIN/GERENTE veem vendas de varios vendedores — mostrar de quem e cada
  // uma. VENDEDOR ja so ve as proprias (filtrado no backend).
  const mostrarVendedor = user?.role === "ADMIN" || user?.role === "GERENTE";

  if (semDados) {
    return (
      <div className="pdv-cart-empty">
        <div className="pdv-cart-empty-mark">🛒</div>
        <div className="pdv-cart-empty-body">
          <div className="pdv-cart-empty-title">Pronto para a primeira venda</div>
          <div className="pdv-cart-empty-sub">Três formas de adicionar um produto:</div>
          <ul className="pdv-cart-empty-steps">
            <li>
              <span className="pdv-cart-empty-step-num">1</span>
              <div>
                <b>Bipe</b> o código de barras com o leitor
                <span className="pdv-cart-empty-step-hint">o foco está no campo de busca</span>
              </div>
            </li>
            <li>
              <span className="pdv-cart-empty-step-num">2</span>
              <div>
                <b>Digite</b> o nome ou código no campo à direita
                <span className="pdv-cart-empty-step-hint">use ↑ ↓ + Enter para escolher</span>
              </div>
            </li>
            <li>
              <span className="pdv-cart-empty-step-num">3</span>
              <div>
                <b>Finalize</b> com <span className="pdv-kbd">F10</span> e escolha forma de pagamento (F1–F6)
              </div>
            </li>
          </ul>
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
            <div className="helper">Alt+1–{Math.min(topProdutos.length, 9)} ou clique</div>
          </div>
          <div className="pdv-top-grid">
            {topProdutos.map((p, idx) => {
              const isServico = p.tipoItem === "SERVICO";
              const estoqueNum = Number(p.estoque) || 0;
              const minimoNum = Number(p.estoqueMinimo) || 0;
              const semEstoque = !isServico && estoqueNum <= 0;
              // Critico = abaixo ou igual ao minimo configurado, mas ainda
              // com algum estoque. Sem minimo cadastrado (0), nao alerta.
              const estoqueCritico = !isServico && !semEstoque && minimoNum > 0 && estoqueNum <= minimoNum;
              const numero = idx + 1;
              const temAtalho = numero <= 9;
              const tooltipBase = isServico
                ? `Serviço — ${p.nome}`
                : semEstoque
                  ? `Sem estoque — ${p.nome}`
                  : estoqueCritico
                    ? `⚠ Estoque crítico (${fmtQtd(estoqueNum)} ${p.unidade}, mínimo ${fmtQtd(minimoNum)}) — ${p.nome}`
                    : `${p.nome} — ${fmtQtd(estoqueNum)} ${p.unidade} em estoque`;
              return (
                <button
                  key={p.id} type="button"
                  onClick={() => !semEstoque && onAdicionar(p)}
                  disabled={semEstoque}
                  title={`${tooltipBase}${temAtalho && !semEstoque ? ` (Alt+${numero})` : ""}`}
                  className={`pdv-top-card ${estoqueCritico ? "is-critico" : ""}`}
                >
                  {temAtalho && (
                    <span className="pdv-top-card-num" aria-hidden="true">{numero}</span>
                  )}
                  <FotoProduto url={p.imagem} nome={p.nome} tamanho={42} servico={isServico} />
                  <div className="pdv-top-card-info">
                    <div className="pdv-top-card-name" title={p.nome}>{p.nome}</div>
                    <div className="pdv-top-card-foot">
                      <span className="pdv-top-card-price">{fmtBRL(p.precoVenda)}</span>
                      {isServico ? (
                        <span className="pdv-top-card-tag is-svc">SERVIÇO</span>
                      ) : estoqueCritico ? (
                        <span className="pdv-top-card-tag is-warn" title={`Mínimo: ${fmtQtd(minimoNum)} ${p.unidade}`}>
                          ⚠ {fmtQtd(estoqueNum)} {p.unidade}
                        </span>
                      ) : (
                        <span className="pdv-top-card-stock">
                          {fmtQtd(estoqueNum)} {p.unidade}
                        </span>
                      )}
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
              {mostrarVendedor ? "Últimas vendas deste caixa" : "Minhas vendas de hoje"}
            </div>
          </div>
          <div>
            {ultimasVendas.map((v) => {
              const cor = FORMA_COR_VAR[v.formaPagamento] || "var(--pdv-accent)";
              const primeiroNomeVendedor = v.user?.nome?.split(" ")[0] || "";
              return (
                <button
                  key={v.id} type="button"
                  onClick={() => onAbrirVenda(v.id)}
                  className="pdv-rec-row"
                  title={mostrarVendedor && v.user?.nome ? `Vendedor: ${v.user.nome}` : undefined}
                >
                  <div className="pdv-rec-id">#{v.numero}</div>
                  <div className={`pdv-rec-cust ${!v.cliente?.nome ? "is-empty" : ""}`}>
                    {v.cliente?.nome || "Consumidor"}
                    {mostrarVendedor && primeiroNomeVendedor && (
                      <span style={{
                        marginLeft: 8, fontSize: 11, color: "var(--pdv-t3)",
                        opacity: 0.75, fontWeight: 500,
                      }}>
                        · {primeiroNomeVendedor}
                      </span>
                    )}
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
  const mostrarRecebidoTroco = Number(valorRecebido) > 0;
  const empresa = useConfiguracaoEmpresa();
  const novaVendaBtnRef = useRef(null);
  const [cfgImp, setCfgImp] = useState(null);
  const printDispatchedRef = useRef(false);

  // Carrega ConfiguracaoImpressora — usada para decidir auto-print, vias e
  // largura/conteudo do cupom. Cacheada (TTL 30s no helper).
  useEffect(() => {
    let ativo = true;
    obterConfigImpressora().then(c => { if (ativo) setCfgImp(c); });
    return () => { ativo = false; };
  }, []);

  // Auto-imprime ao abrir o recibo (apenas no fluxo de venda concluida —
  // reimpressao requer clique explicito). Respeita cfgImp.imprimirAutomatico
  // e cfgImp.imprimirVenda. Espera o cupom estar no DOM (paint) + imagens.
  useEffect(() => {
    if (printDispatchedRef.current) return;
    if (modoReimpressao) return;
    if (!cfgImp || !empresa) return;
    if (!devePrintar("VENDA", cfgImp)) return;
    if (!cfgImp.imprimirAutomatico) return;
    printDispatchedRef.current = true;
    const vias = Math.max(1, Number(cfgImp.viasVenda) || 1);
    let i = 0;
    const disparar = async () => {
      await imprimirUmaVia();
      i += 1;
      if (i < vias) setTimeout(disparar, 500);
    };
    // 2 RAFs + microtask para garantir paint e que o logo carregou.
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(disparar, 100)));
  }, [cfgImp, empresa, modoReimpressao]);

  // Foca o botão principal (Nova Venda no fluxo PDV; Fechar na reimpressão).
  // Tenta imediatamente e de novo apos ticks caso outro setTimeout(0) esteja
  // na fila — vence focarBusca() do parent quando vindo do PDV.
  useEffect(() => {
    novaVendaBtnRef.current?.focus();
    const t1 = setTimeout(() => novaVendaBtnRef.current?.focus(), 30);
    const t2 = setTimeout(() => novaVendaBtnRef.current?.focus(), 150);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Monta o cupom da venda em comandos ESC/POS — compartilhado entre o
  // agente QZ Tray e a impressao via Bluetooth (mesmo layout/bytes).
  function construirComandosVenda(): Uint8Array {
    const segmento = (getEmpresa()?.segmento) || "GERAL";
    const formaLabel = Array.isArray(venda.pagamentos) && venda.pagamentos.length === 1
      ? (venda.pagamentos[0].formaCustomNome || FORMA_LABEL[venda.pagamentos[0].forma] || venda.pagamentos[0].forma)
      : null;
    return gerarComandosPedido(
      {
        numero: venda.numero,
        createdAt: venda.createdAt,
        total: venda.total,
        desconto: venda.desconto,
        cliente: venda.cliente,
        user: venda.user,
        itens: venda.itens,
        observacoes: venda.observacoes,
        formaPagamentoLabel: formaLabel,
        valorRecebido,
        troco,
      },
      {
        nome: empresa?.nomeFantasia || empresa?.razaoSocial,
        cnpj: empresa?.cnpj,
        endereco: empresa ? formatarEndereco(empresa) : null,
        telefone: empresa?.telefone,
      },
      {
        larguraMm: cfgImp?.largura === "MM_58" ? 58 : 80,
        abrirGavetaDinheiro: cfgImp?.abrirGavetaDinheiro && (venda.formaPagamento === "DINHEIRO"),
        segmento: segmento as any,
        cortarPapel: true,
      },
    );
  }

  // Imprime UMA via do cupom: tenta o agente QZ Tray (se ligado neste PC) e,
  // em qualquer falha, cai no window.print() do navegador. Nunca lanca.
  async function imprimirUmaVia(): Promise<void> {
    if (qzAtivoEConfigurado()) {
      try {
        await imprimirRawQz(construirComandosVenda());
        return;
      } catch (err) {
        console.warn("[QZ] falhou, usando impressao do navegador:", err);
      }
    }
    window.print();
  }

  function imprimir() {
    imprimirUmaVia();
  }

  // ETAPA#8a: impressao termica via Web Bluetooth (impressora portatil
  // pareada). Layout muda conforme empresa.segmento (OEM em auto-pecas,
  // lote/validade em farmacia). Mostra o botao so se navegador suporta.
  const [imprimindoBT, setImprimindoBT] = useState(false);
  async function imprimirBT() {
    if (imprimindoBT) return;
    setImprimindoBT(true);
    try {
      await imprimirViaBluetooth(construirComandosVenda());
    } catch (err) {
      alert("Falha na impressao Bluetooth:\n" + (err as Error).message);
    } finally {
      setImprimindoBT(false);
    }
  }

  // ===== Emissao de NFC-e (modelo 65) =====
  // O botao so aparece quando a emissao fiscal esta ativa (Configuracoes >
  // Emissao Fiscal). Status guarda PENDENTE/AUTORIZADA/etc da nota da venda.
  const [fiscalAtivo, setFiscalAtivo] = useState(false);
  const [statusNfce, setStatusNfce] = useState(null);
  const [emitindoNfce, setEmitindoNfce] = useState(false);

  useEffect(() => {
    let ativo = true;
    api.obterConfigFiscal()
      .then((c: any) => { if (ativo) setFiscalAtivo(!!c?.fiscalAtivo); })
      .catch(() => {});
    return () => { ativo = false; };
  }, []);

  async function emitirNotaFiscal() {
    if (emitindoNfce || !venda?.id) return;
    setEmitindoNfce(true);
    try {
      const resp: any = await api.emitirNfce(venda.id);
      const nota = resp?.nota;
      setStatusNfce(nota?.status || null);
      if (nota?.status === "AUTORIZADA") {
        emitirToast({ tipo: "sucesso", titulo: "NFC-e autorizada", mensagem: `Nota ${nota.numeroFiscal} autorizada.` });
        try {
          await imprimirDanfeNfce(nota.id, { pagamentos: venda.pagamentos, troco });
        } catch { /* impressao e best-effort — a nota ja esta autorizada */ }
      } else if (nota?.status === "REJEITADA") {
        emitirToast({ tipo: "erro", titulo: "NFC-e rejeitada", mensagem: nota.xMotivo || "Verifique o cadastro fiscal.", duracao: 8000 });
      } else if (resp?.aviso) {
        emitirToast({ tipo: "aviso", titulo: "NFC-e pendente", mensagem: resp.aviso, duracao: 7000 });
      }
    } catch (err) {
      emitirToast({ tipo: "erro", titulo: "Falha ao emitir NFC-e", mensagem: (err as Error).message, duracao: 8000 });
    } finally {
      setEmitindoNfce(false);
    }
  }

  return (
    <>
      <style>{`
        .recibo-nova-venda:focus,
        .recibo-nova-venda:focus-visible {
          box-shadow: 0 0 0 3px var(--pdv-accent-glow), 0 6px 18px -6px var(--pdv-accent-glow), 0 1px 0 rgba(255,255,255,.2) inset;
          transform: translateY(-1px);
        }
      `}</style>

      <div onClick={onFechar} className="pdv-modal-bg">
        <div onClick={e => e.stopPropagation()} className="pdv-modal" style={{ width: "min(500px, calc(100vw - 32px))", maxHeight: "calc(100vh - 24px)" }}>
          {!modoReimpressao ? (
            <div className="pdv-success" style={{ paddingBottom: 12 }}>
              <div className="pdv-success-mark">✓</div>
              <div className="pdv-success-title">Venda concluída</div>
              <div className="pdv-success-sub">
                {fmtBRL(venda.total)} via {
                  Array.isArray(venda.pagamentos) && venda.pagamentos.length > 1
                    ? `${venda.pagamentos.length} formas`
                    : (FORMA_LABEL[venda.pagamentos?.[0]?.forma || venda.formaPagamento] || venda.formaPagamento)
                } · #{venda.numero}
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

          <div className="pdv-modal-body" style={{ paddingBottom: 6 }}>
            <div style={{
              background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
              borderRadius: 12, padding: 12, marginBottom: 10,
            }}>
              <div style={{ color: "var(--pdv-t3)", fontSize: 10.5, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 6 }}>Itens</div>
              {venda.itens?.map((it, i) => (
                <div key={it.id} style={{
                  display: "flex", justifyContent: "space-between", padding: "6px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--pdv-line)", fontSize: 13,
                }}>
                  <div>
                    <div style={{ color: "var(--pdv-t1)", fontWeight: 500 }}>{it.produto?.nome}</div>
                    <div style={{ color: "var(--pdv-t3)", fontSize: 11.5, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                      {fmtQtd(it.quantidade)} × {fmtBRL(it.precoUnitario)}
                    </div>
                  </div>
                  <div style={{ color: "var(--pdv-t1)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(it.subtotal)}</div>
                </div>
              ))}
            </div>

            <div style={{
              background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
              borderRadius: 12, padding: 12, marginBottom: 0,
            }}>
              {Array.isArray(venda.pagamentos) && venda.pagamentos.length > 1 ? (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: "var(--pdv-t3)", fontSize: 11, marginBottom: 6, fontWeight: 500 }}>
                    Pagamentos ({venda.pagamentos.length})
                  </div>
                  {venda.pagamentos.map(p => (
                    <div key={p.id} style={{
                      display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4,
                      paddingLeft: 10, borderLeft: `3px solid ${FORMA_COR_VAR[p.forma] || "var(--pdv-accent)"}`,
                    }}>
                      <span style={{ color: "var(--pdv-t2)" }}>
                        {p.formaCustomNome || FORMA_LABEL[p.forma] || p.forma}
                      </span>
                      <span style={{ color: "var(--pdv-t1)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                        {fmtBRL(p.valor)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: "var(--pdv-t3)" }}>Forma de pagamento</span>
                  <span style={{ color: "var(--pdv-t1)", fontWeight: 500 }}>
                    {venda.pagamentos?.[0]?.formaCustomNome
                      || FORMA_LABEL[venda.pagamentos?.[0]?.forma || venda.formaPagamento]
                      || venda.formaPagamento}
                  </span>
                </div>
              )}
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

          {/* NFC-e: emissao fiscal (so quando ativa). Status fica visivel
              apos emitir; AUTORIZADA ja dispara a impressao do DANFE. */}
          {fiscalAtivo && venda?.id && (
            <div style={{ padding: "0 16px 8px", display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={emitirNotaFiscal}
                disabled={emitindoNfce || statusNfce === "AUTORIZADA"}
                className="pdv-btn-ghost"
                style={{ flex: 1, justifyContent: "center" }}
                title="Emitir Nota Fiscal de Consumidor eletronica (NFC-e)"
              >
                {statusNfce === "AUTORIZADA"
                  ? "✓ NFC-e autorizada"
                  : emitindoNfce ? "Emitindo NFC-e…" : "🧾 Emitir NFC-e"}
              </button>
              {statusNfce && statusNfce !== "AUTORIZADA" && (
                <span style={{ fontSize: 11, color: "var(--pdv-t3)" }}>{statusNfce}</span>
              )}
            </div>
          )}

          <div className="pdv-modal-foot">
            <button onClick={imprimir} className="pdv-btn-ghost" style={{ flex: 1, justifyContent: "center" }}>
              🖨️ Imprimir cupom
            </button>
            {/* ETAPA#8a: impressao direta via Bluetooth — so aparece se o
                navegador suporta Web Bluetooth (Chromium-based em HTTPS). */}
            {bluetoothDisponivel() && (
              <button
                onClick={imprimirBT}
                disabled={imprimindoBT}
                className="pdv-btn-ghost"
                style={{ justifyContent: "center", padding: "0 14px" }}
                title="Imprimir via impressora Bluetooth pareada (ESC/POS)"
              >
                {imprimindoBT ? "..." : "🔌 BT"}
              </button>
            )}
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

      {/* Cupom oculto, visivel apenas na impressao — quando habilitado.
          Renderizado num portal no body (fora do #root) para que o
          @media print possa esconder o app inteiro com #root{display:none}
          sem matar o cupom — evitando paginas em branco. */}
      {cfgImp && devePrintar("VENDA", cfgImp) && createPortal(
        <CupomEnvelope cfg={cfgImp}>
          <CupomVenda
            venda={venda}
            empresa={empresa}
            cfg={cfgImp}
            valorRecebido={valorRecebido}
            troco={troco}
            modoReimpressao={modoReimpressao}
          />
        </CupomEnvelope>,
        document.body,
      )}
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
  const [refinalizar, setRefinalizar] = useState(null);
  const [autorizacaoPendente, setAutorizacaoPendente] = useState(null);
  const [autorizacaoCreds, setAutorizacaoCreds] = useState(null);
  const [mensagem, setMensagem] = useState("");

  const podeCancelar = user.role === "ADMIN" || user.role === "GERENTE";
  // VENDEDOR pode alterar forma de pagamento, mas precisa de autorizacao
  // gerencial (email + senha de um ADMIN/GERENTE) — validada no backend.
  const podeReabrir = true;
  const exigeAutorizacao = user.role === "VENDEDOR";

  useModalKeys(!!detalhe, { onClose: () => setDetalhe(null) });
  useModalKeys(!!reimpressao, { onClose: () => setReimpressao(null) });
  useModalKeys(!!refinalizar, { onClose: () => setRefinalizar(null) });
  useModalKeys(!!autorizacaoPendente, { onClose: () => setAutorizacaoPendente(null) });

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

  // Ponto de entrada para "Alterar forma de pagamento" / "Continuar refinalizacao".
  // VENDEDOR cai antes na AutorizacaoModal; ADMIN/GERENTE seguem direto.
  function solicitarAlteracao(v, tipo) {
    if (exigeAutorizacao) {
      // Fecha o modal de detalhe (se estiver aberto) antes de pedir
      // a senha, para nao empilhar dois modais e nao reagir 2x ao Esc.
      setDetalhe(null);
      setAutorizacaoPendente({ tipo, venda: v });
      return;
    }
    if (tipo === "reabrir") return reabrir(v, null);
    if (tipo === "continuar") return continuarRefinalizacao(v, null);
  }

  async function reabrir(v, autorizacao) {
    // Para ADMIN/GERENTE mantemos o aviso por confirm. VENDEDOR ja viu a
    // modal de autorizacao gerencial, entao pulamos o confirm para nao
    // duplicar a friccao.
    if (!autorizacao) {
      const msg =
        `Reabrir venda #${v.numero} para alterar a forma de pagamento?\n\n` +
        `• O lançamento no caixa será estornado.\n` +
        `• Contas a receber pendentes serão canceladas.\n` +
        `• O estoque NÃO será mexido (o cliente já levou a mercadoria).`;
      if (!confirm(msg)) return;
    }
    try {
      const reaberta = await api.reabrirVenda(v.id, autorizacao || undefined);
      flash(`Venda #${v.numero} reaberta — selecione a nova forma de pagamento.`);
      setDetalhe(null);
      setAutorizacaoCreds(autorizacao || null);
      setRefinalizar(reaberta);
      carregar();
    } catch (err) {
      alert(err.message);
      // Em caso de senha invalida, reabre a modal de autorizacao para
      // o vendedor tentar de novo sem perder o contexto.
      if (autorizacao) setAutorizacaoPendente({ tipo: "reabrir", venda: v });
    }
  }

  async function continuarRefinalizacao(v, autorizacao) {
    try {
      const completa = await api.obterVenda(v.id);
      setAutorizacaoCreds(autorizacao || null);
      setRefinalizar(completa);
      setDetalhe(null);
    } catch (err) {
      alert(err.message);
    }
  }

  async function confirmarAutorizacao(creds) {
    const pend = autorizacaoPendente;
    if (!pend) return;
    const autorizacao = {
      emailAutorizacao: creds.email,
      senhaAutorizacao: creds.senha,
    };
    setAutorizacaoPendente(null);
    if (pend.tipo === "reabrir") await reabrir(pend.venda, autorizacao);
    else if (pend.tipo === "continuar") await continuarRefinalizacao(pend.venda, autorizacao);
  }

  async function aplicarRefinalizacao(payload) {
    const corpo = autorizacaoCreds ? { ...payload, ...autorizacaoCreds } : payload;
    try {
      await api.refinalizarVenda(refinalizar.id, corpo);
      flash(`Venda #${refinalizar.numero} refinalizada com ${FORMA_LABEL[payload.formaPagamento]}.`);
      setRefinalizar(null);
      setAutorizacaoCreds(null);
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
          display: "grid", gridTemplateColumns: "150px 80px 1.5fr 120px 100px 90px 130px 80px",
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
              display: "grid", gridTemplateColumns: "150px 80px 1.5fr 120px 100px 90px 130px 80px",
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
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <ActionsMenu
                  items={[
                    {
                      label: "Ver detalhes",
                      icon: "👁",
                      color: C.accent,
                      onClick: () => abrirDetalhe(v.id),
                    },
                    {
                      label: "Reimprimir cupom",
                      icon: "🖨",
                      color: C.green,
                      onClick: () => abrirReimpressao(v.id),
                      hidden: v.status !== "CONCLUIDA",
                    },
                    {
                      label: "Alterar forma de pagamento",
                      icon: "💱",
                      color: C.yellow,
                      onClick: () => solicitarAlteracao(v, "reabrir"),
                      hidden: !podeReabrir || v.status !== "CONCLUIDA",
                    },
                    {
                      label: "Continuar refinalização",
                      icon: "▶",
                      color: C.yellow,
                      onClick: () => solicitarAlteracao(v, "continuar"),
                      hidden: !podeReabrir || v.status !== "EM_EDICAO",
                    },
                  ]}
                />
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
          onReabrir={podeReabrir && detalhe.status === "CONCLUIDA" ? () => solicitarAlteracao(detalhe, "reabrir") : null}
          onContinuarRefinalizacao={podeReabrir && detalhe.status === "EM_EDICAO" ? () => solicitarAlteracao(detalhe, "continuar") : null}
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

      {refinalizar && (
        <RefinalizarVendaModal
          venda={refinalizar}
          onFechar={() => { setRefinalizar(null); setAutorizacaoCreds(null); }}
          onAplicar={aplicarRefinalizacao}
        />
      )}

      {autorizacaoPendente && (
        <AutorizacaoGerencialModal
          venda={autorizacaoPendente.venda}
          acao={autorizacaoPendente.tipo === "continuar"
            ? "continuar a refinalizacao da venda"
            : "alterar a forma de pagamento desta venda"}
          onCancelar={() => setAutorizacaoPendente(null)}
          onConfirmar={confirmarAutorizacao}
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

function DetalheVendaModal({ venda, onFechar, onCancelar, onReimprimir, onReabrir, onContinuarRefinalizacao }) {
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
                <div style={{ textAlign: "right", color: "var(--pdv-t2)", fontVariantNumeric: "tabular-nums" }}>{fmtQtd(it.quantidade)} {it.produto?.unidade || ""}</div>
                <div style={{ textAlign: "right", color: "var(--pdv-t2)", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(it.precoUnitario)}</div>
                <div style={{ textAlign: "right", color: "var(--pdv-t1)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(it.subtotal)}</div>
              </div>
            ))}
          </div>

          <div style={{
            background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
            borderRadius: 12, padding: 14,
          }}>
            {Array.isArray(venda.pagamentos) && venda.pagamentos.length > 1 ? (
              <div style={{ marginBottom: 8 }}>
                <div style={{ color: "var(--pdv-t3)", fontSize: 11, marginBottom: 6, fontWeight: 500 }}>
                  Pagamentos ({venda.pagamentos.length})
                </div>
                {venda.pagamentos.map(p => (
                  <div key={p.id} style={{
                    display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4,
                    paddingLeft: 10, borderLeft: `3px solid ${FORMA_COR_VAR[p.forma] || "var(--pdv-accent)"}`,
                  }}>
                    <span style={{ color: "var(--pdv-t2)" }}>
                      {p.formaCustomNome || FORMA_LABEL[p.forma] || p.forma}
                    </span>
                    <span style={{ color: "var(--pdv-t1)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                      {fmtBRL(p.valor)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: "var(--pdv-t3)" }}>Forma de pagamento</span>
                <span style={{ color: "var(--pdv-t1)", fontWeight: 500 }}>
                  {venda.pagamentos?.[0]?.formaCustomNome
                    || FORMA_LABEL[venda.pagamentos?.[0]?.forma || venda.formaPagamento]
                    || venda.formaPagamento}
                </span>
              </div>
            )}
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
            {onReabrir && (
              <button onClick={onReabrir} className="pdv-btn-ghost" style={{ color: C.yellow, borderColor: "rgba(245,158,11,.35)" }}>
                💱 Alterar forma de pagamento
              </button>
            )}
            {onContinuarRefinalizacao && (
              <button onClick={onContinuarRefinalizacao} className="pdv-btn-ghost" style={{ color: C.yellow, borderColor: "rgba(245,158,11,.35)" }}>
                ▶ Continuar refinalização
              </button>
            )}
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

function RefinalizarVendaModal({ venda, onFechar, onAplicar }) {
  const total = Number(venda.total);
  // Mesmo reducer do modal de nova venda — split de pagamentos.
  const [pagamentos, dispatchPagamentos] = useReducer(
    pagamentosReducer,
    [],
    () => [criarPagamento(venda.formaPagamento || "DINHEIRO", total)]
  );
  const [gerarConta, setGerarConta] = useState(false);
  const [vencimento, setVencimento] = useState(dataDaqui(30));
  const [parcelas, setParcelas] = useState(1);
  const [descricaoConta, setDescricaoConta] = useState("");
  const [observacoesConta, setObservacoesConta] = useState("");
  const [salvando, setSalvando] = useState(false);

  const pago = useMemo(
    () => Math.round(pagamentos.reduce((a, p) => a + (Number(p.valor) || 0), 0) * 100) / 100,
    [pagamentos]
  );
  const restante = Math.max(0, Math.round((total - pago) * 100) / 100);
  const valorAPrazo = useMemo(
    () => Math.round(
      pagamentos.filter(p => FORMAS_GERA_RECEBER.has(p.forma))
        .reduce((a, p) => a + (Number(p.valor) || 0), 0) * 100
    ) / 100,
    [pagamentos]
  );
  const podeFinalizar = total > 0 && Math.abs(pago - total) < 0.01;

  useEffect(() => {
    if (valorAPrazo <= 0 && gerarConta) setGerarConta(false);
  }, [valorAPrazo, gerarConta]);

  useModalKeys(true, { onClose: onFechar });

  function adicionar(formaId) {
    if (restante <= 0) return;
    dispatchPagamentos({
      type: "add",
      pagamento: criarPagamento(formaId, restante),
    });
  }

  async function aplicar() {
    if (!podeFinalizar) return;
    setSalvando(true);
    const payload = {
      pagamentos: pagamentos.map(p => ({
        forma: p.forma,
        valor: Math.round((Number(p.valor) || 0) * 100) / 100,
        formaCustomNome: p.formaCustomNome || undefined,
      })),
    };
    if (valorAPrazo > 0 && gerarConta) {
      payload.gerarContaReceber = {
        vencimento,
        parcelas: Number(parcelas) || 1,
        descricao: descricaoConta || undefined,
        observacoes: observacoesConta || undefined,
      };
    }
    try {
      await onAplicar(payload);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={onFechar} className="pdv-modal-bg">
      <div onClick={e => e.stopPropagation()} className="pdv-modal" style={{ width: "min(620px, calc(100vw - 32px))" }}>
        <div className="pdv-modal-hd">
          <div>
            <div className="pdv-modal-title">Refinalizar venda #{venda.numero}</div>
            <div className="pdv-modal-sub">
              Total {fmtBRL(venda.total)} · forma original: {FORMA_LABEL[venda.formaPagamento]}
            </div>
          </div>
          <button type="button" onClick={onFechar} className="pdv-modal-x">×</button>
        </div>

        <div className="pdv-modal-body" style={{ paddingBottom: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ color: "var(--pdv-t3)", fontSize: 10.5, fontWeight: 500, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".06em" }}>
              Adicionar pagamento
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {FORMAS.map(f => {
                const desabilitado = restante <= 0;
                return (
                  <button
                    key={f.id} type="button"
                    onClick={() => adicionar(f.id)}
                    disabled={desabilitado}
                    className="pdv-btn-ghost"
                    style={{
                      padding: "10px 8px",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                      opacity: desabilitado ? 0.4 : 1,
                      cursor: desabilitado ? "not-allowed" : "pointer",
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{f.icone}</span>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{f.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {pagamentos.length > 0 && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 6,
              padding: 8, borderRadius: 8,
              background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
            }}>
              {pagamentos.map(p => {
                const corBorda = FORMA_COR_VAR[p.forma] || "var(--pdv-accent)";
                return (
                  <div key={p.id} style={{
                    display: "grid", gridTemplateColumns: "1fr 140px auto",
                    gap: 8, alignItems: "center", padding: "6px 8px",
                    background: "var(--pdv-surf-1)", borderRadius: 6,
                    borderLeft: `3px solid ${corBorda}`,
                  }}>
                    <span style={{ fontSize: 12, color: "var(--pdv-t1)", fontWeight: 500 }}>
                      {FORMA_LABEL[p.forma]}
                    </span>
                    <input
                      type="number" step="0.01" min="0"
                      value={p.valor}
                      onChange={e => {
                        const v = parseFloat(e.target.value.replace(",", ".")) || 0;
                        dispatchPagamentos({ type: "update", id: p.id, patch: { valor: v } });
                      }}
                      className="pdv-field-input"
                      style={{ padding: "6px 8px", fontSize: 13 }}
                    />
                    <button
                      type="button"
                      onClick={() => dispatchPagamentos({ type: "remove", id: p.id })}
                      style={{
                        background: "transparent", border: "none", color: "var(--pdv-t3)",
                        fontSize: 16, cursor: "pointer", padding: "0 4px", lineHeight: 1,
                      }}
                    >×</button>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
            padding: "8px 12px", borderRadius: 8,
            background: restante > 0 ? "rgba(245,158,11,.08)" : "rgba(34,197,94,.10)",
            border: `1px solid ${restante > 0 ? "rgba(245,158,11,.30)" : "rgba(34,197,94,.30)"}`,
            fontSize: 12,
          }}>
            <div><span style={{ color: "var(--pdv-t3)" }}>Total:</span> <span style={{ color: "var(--pdv-t1)", fontWeight: 600 }}>{fmtBRL(total)}</span></div>
            <div><span style={{ color: "var(--pdv-t3)" }}>Pago:</span> <span style={{ color: "var(--pdv-t1)", fontWeight: 600 }}>{fmtBRL(pago)}</span></div>
            {restante > 0 && (
              <div style={{ gridColumn: "1 / -1", color: "var(--pdv-c-amber)", fontWeight: 600 }}>
                Falta {fmtBRL(restante)}
              </div>
            )}
          </div>

          {valorAPrazo > 0 && (
            <div style={{
              background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
              borderRadius: 12, padding: 14,
            }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={gerarConta} onChange={e => setGerarConta(e.target.checked)} />
                <span style={{ color: "var(--pdv-t1)" }}>
                  Gerar conta a receber pelo valor a prazo · {fmtBRL(valorAPrazo)}
                </span>
              </label>
              {gerarConta && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                  <label style={{ fontSize: 11, color: "var(--pdv-t3)" }}>
                    Vencimento
                    <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} className="pdv-field-input" />
                  </label>
                  <label style={{ fontSize: 11, color: "var(--pdv-t3)" }}>
                    Parcelas
                    <input type="number" min="1" max="60" value={parcelas} onChange={e => setParcelas(e.target.value)} className="pdv-field-input" />
                  </label>
                  <label style={{ fontSize: 11, color: "var(--pdv-t3)", gridColumn: "1 / -1" }}>
                    Descrição (opcional)
                    <input type="text" value={descricaoConta} onChange={e => setDescricaoConta(e.target.value)} className="pdv-field-input" placeholder="Padrão: VENDA #N - CLIENTE" />
                  </label>
                  <label style={{ fontSize: 11, color: "var(--pdv-t3)", gridColumn: "1 / -1" }}>
                    Observações (opcional)
                    <input type="text" value={observacoesConta} onChange={e => setObservacoesConta(e.target.value)} className="pdv-field-input" />
                  </label>
                </div>
              )}
            </div>
          )}

          <div style={{
            background: "color-mix(in oklab, var(--pdv-c-amber, #f59e0b) 10%, transparent)",
            border: "1px solid rgba(245,158,11,.30)", borderRadius: 10,
            padding: "10px 14px", fontSize: 12, color: "var(--pdv-t2)",
          }}>
            ⚠ Ao confirmar, a venda volta para CONCLUIDA com o novo split e o caixa (se aberto) é re-lançado.
          </div>
        </div>

        <div className="pdv-modal-foot" style={{ justifyContent: "flex-end", gap: 10 }}>
          <button type="button" onClick={onFechar} disabled={salvando} className="pdv-btn-ghost">Cancelar <span className="pdv-kbd is-warn" style={{ marginLeft: 4 }}>Esc</span></button>
          <button
            type="button"
            onClick={aplicar}
            disabled={salvando || !podeFinalizar}
            className="pdv-btn-primary"
            style={{ padding: "10px 18px", opacity: (salvando || !podeFinalizar) ? 0.55 : 1 }}
          >
            {salvando ? "Aplicando…" : `Confirmar (${fmtBRL(total)})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function AutorizacaoGerencialModal({ venda, acao, onCancelar, onConfirmar }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const podeConfirmar = email.trim() && senha;

  async function submeter(e) {
    e.preventDefault();
    if (!podeConfirmar || enviando) return;
    setEnviando(true);
    try {
      await onConfirmar({ email: email.trim(), senha });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div onClick={onCancelar} className="pdv-modal-bg">
      <div onClick={e => e.stopPropagation()} className="pdv-modal" style={{ width: "min(460px, calc(100vw - 32px))" }}>
        <div className="pdv-modal-hd">
          <div>
            <div className="pdv-modal-title">🔐 Autorização gerencial</div>
            <div className="pdv-modal-sub">
              Venda #{venda?.numero} · {acao}
            </div>
          </div>
          <button type="button" onClick={onCancelar} className="pdv-modal-x">×</button>
        </div>

        <form onSubmit={submeter}>
          <div className="pdv-modal-body" style={{ paddingBottom: 14 }}>
            <div style={{
              padding: "12px 14px", borderRadius: 10, marginBottom: 14,
              background: "color-mix(in oklab, var(--pdv-c-amber, #f59e0b) 12%, transparent)",
              border: "1px solid rgba(245,158,11,.30)",
              color: "var(--pdv-t2)", fontSize: 12.5, lineHeight: 1.45,
            }}>
              Esta operação requer aprovação de um <b>ADMIN ou GERENTE</b>.
              Peça para alguém autorizado digitar e-mail e senha abaixo.
            </div>

            <label className="pdv-field-label" style={{ display: "block", marginBottom: 4 }}>E-mail do autorizador</label>
            <input
              type="email" autoComplete="off" autoFocus
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="gerente@empresa.com"
              className="pdv-field-input"
              style={{ marginBottom: 12 }}
            />

            <label className="pdv-field-label" style={{ display: "block", marginBottom: 4 }}>Senha</label>
            <input
              type="password" autoComplete="new-password"
              value={senha} onChange={e => setSenha(e.target.value)}
              placeholder="••••••••"
              className="pdv-field-input"
            />
          </div>

          <div className="pdv-modal-foot" style={{ justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={onCancelar} disabled={enviando} className="pdv-btn-ghost">
              Cancelar <span className="pdv-kbd is-warn" style={{ marginLeft: 4 }}>Esc</span>
            </button>
            <button type="submit" disabled={!podeConfirmar || enviando} className="pdv-btn-primary" style={{ padding: "10px 18px" }}>
              {enviando ? "Validando…" : "Autorizar"}
            </button>
          </div>
        </form>
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

