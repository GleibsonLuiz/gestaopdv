import { useState, useEffect, useRef, useMemo, lazy, Suspense, type CSSProperties } from "react";
import { C, hidratarAparenciaDoUser } from "./lib/theme";
import Alertas from "./Alertas";
import { getUser, getToken, clearSession, setEmpresa, api } from "./lib/api";
import { podeAcessar, moduloNoPlano } from "./lib/permissoes";
import { TELA_AJUDA } from "./Ajuda";
import CommandPalette, { type ItemPaleta } from "./components/CommandPalette";

// Todas as telas sao lazy — cada uma vira um chunk separado e so e baixada
// quando o usuario navegar para ela. Login fica lazy tambem (so carrega
// quando nao ha sessao). Alertas continua eager por ser parte do shell.
const Login = lazy(() => import("./Login"));
const Clientes = lazy(() => import("./Clientes"));
const Fornecedores = lazy(() => import("./Fornecedores"));
const Produtos = lazy(() => import("./Produtos"));
const Etiquetas = lazy(() => import("./Etiquetas"));
const Estoque = lazy(() => import("./Estoque"));
const Inventario = lazy(() => import("./Inventario"));
const Compras = lazy(() => import("./Compras"));
const Sugestoes = lazy(() => import("./Sugestoes"));
const Orcamentos = lazy(() => import("./Orcamentos"));
const Funcionarios = lazy(() => import("./Funcionarios"));
const Comissoes = lazy(() => import("./Comissoes"));
const FinanceiroPage = lazy(() => import("./pages/financeiro/FinanceiroPage"));
const Despesas = lazy(() => import("./Despesas"));
const Contabilidade = lazy(() => import("./Contabilidade"));
const Caixa = lazy(() => import("./Caixa"));
const PDV = lazy(() => import("./PDV"));
const Dashboard = lazy(() => import("./Dashboard"));
const Relatorios = lazy(() => import("./Relatorios"));
const NotasFiscais = lazy(() => import("./NotasFiscais"));
const EntradaNfe = lazy(() => import("./EntradaNfe"));
const Crediario = lazy(() => import("./Crediario"));
const OrdemServico = lazy(() => import("./OrdemServico"));
const FiscalAvancado = lazy(() => import("./FiscalAvancado"));
const Projeto = lazy(() => import("./Projeto"));
const Sistema = lazy(() => import("./Sistema"));
const Backup = lazy(() => import("./Backup"));
const ConfiguracoesImpressora = lazy(() => import("./ConfiguracoesImpressora"));
const Empresa = lazy(() => import("./Empresa"));
const TrocarSenhaModal = lazy(() => import("./TrocarSenhaModal"));
const Verificacao2faModal = lazy(() => import("./Verificacao2faModal"));
const Aparencia = lazy(() => import("./Aparencia"));
const Tarefas = lazy(() => import("./Tarefas"));
const Fidelidade = lazy(() => import("./Fidelidade"));
const Funil = lazy(() => import("./Funil"));
const Segmentos = lazy(() => import("./Segmentos"));
const Automacoes = lazy(() => import("./Automacoes"));
const DashboardCrm = lazy(() => import("./DashboardCrm"));
const Reativacao = lazy(() => import("./Reativacao"));
const Nps = lazy(() => import("./Nps"));
const PesquisaPublicaNps = lazy(() => import("./PesquisaPublicaNps"));
const AceitePublicoOrcamento = lazy(() => import("./AceitePublicoOrcamento"));
const CardapioPublico = lazy(() => import("./CardapioPublico"));
const InventarioMobile = lazy(() => import("./InventarioMobile"));
const PdvVolante = lazy(() => import("./PdvVolante"));
const PainelComandas = lazy(() => import("./PainelComandas"));
const Whatsapp = lazy(() => import("./Whatsapp"));
const Logs = lazy(() => import("./Logs"));
const Ajuda = lazy(() => import("./Ajuda"));
// Modal de gerencia de formas de pagamento — antes ficava dentro do PDV
// (botao ⚙ no modal de Finalizar Venda). Movido para a sidebar como entrada
// global em "Sistema" — ETAPA#3.
const GerenciarFormasModal = lazy(() => import("./Financeiro").then(m => ({ default: m.GerenciarFormasModal })));


const SIDEBAR_W_EXPANDIDA = 240;
const SIDEBAR_W_RECOLHIDA = 72;
const PREF_SIDEBAR_KEY = "gestao_sidebar_collapsed";

// Helpers de persistencia. localStorage e cache local (escrita sincrona pra
// nao causar layout shift no proximo boot) e PUT /auth/preferencias sincroniza
// entre dispositivos — debounced em 400ms para suportar toggles rapidos.
let timerSyncSidebar: ReturnType<typeof setTimeout> | null = null;
function salvarPreferenciaSidebar(collapsed: boolean) {
  try { localStorage.setItem(PREF_SIDEBAR_KEY, collapsed ? "1" : "0"); } catch {}
  if (!getToken()) return;
  if (timerSyncSidebar) clearTimeout(timerSyncSidebar);
  timerSyncSidebar = setTimeout(() => {
    api.salvarPreferencias({ sidebarCollapsed: collapsed }).catch(() => {
      /* best-effort: localStorage ja persistiu */
    });
  }, 400);
}

function lerPreferenciaSidebar() {
  try { return localStorage.getItem(PREF_SIDEBAR_KEY) === "1"; } catch { return false; }
}

const ESTILO_RESPONSIVO = `
.gp-sidebar {
  position: fixed; top: 0; left: 0; height: 100vh;
  background: ${C.surface}; border-right: 1px solid ${C.border};
  display: flex; flex-direction: column; z-index: 60;
  transition: transform 0.25s ease, width 0.25s ease;
}
.gp-content { min-height: 100vh; transition: margin-left 0.25s ease; }
.gp-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.55);
  z-index: 55; opacity: 0; pointer-events: none;
  transition: opacity 0.2s ease;
}
.gp-mobile-bar { display: none; }
.gp-nav-section { flex: 1; overflow-y: auto; overflow-x: hidden; }
.gp-nav-section::-webkit-scrollbar { width: 6px; }
.gp-nav-section::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
@media (max-width: 900px) {
  .gp-sidebar { transform: translateX(-100%); box-shadow: 8px 0 30px rgba(0,0,0,0.5); width: 240px !important; }
  .gp-sidebar.open { transform: translateX(0); }
  .gp-content { margin-left: 0 !important; }
  .gp-overlay.open { opacity: 1; pointer-events: auto; }
  .gp-mobile-bar { display: flex; }
  .gp-toggle-desktop { display: none !important; }
  /* No mobile o disparador da busca vira so o icone (a topbar fica apertada) */
  .gp-busca-label, .gp-busca-kbd { display: none !important; }
}
`;

// Detecta token NPS na URL antes mesmo de instanciar App, para que o
// usuario externo (cliente) nunca veja a tela de login.
function getNpsToken() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("nps") || null;
  } catch { return null; }
}

// Token de aceite online de orcamento (?orc=<token>). Mesmo padrao do NPS:
// cliente externo aprova/recusa sem ver a tela de login.
function getOrcamentoToken() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("orc") || null;
  } catch { return null; }
}

// Cardapio digital publico (?cardapio=<token>): cliente final monta o pedido
// sem login. Mesmo padrao do ?orc / ?nps.
function getCardapioToken() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("cardapio") || null;
  } catch { return null; }
}

// ETAPA#1 / #7: rotas mobile dedicadas via query string (mesmo padrao
// do ?nps=token). Cada modulo mobile e um chunk separado, carregado
// so quando ?mobile=<id> esta presente.
function detectarModoMobile(): "inventario" | "pdv-volante" | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("mobile");
    if (v === "inventario" || v === "pdv-volante") return v;
    return null;
  } catch { return null; }
}

// Fallback de Suspense usado em todos os pontos onde uma tela lazy entra
// em cena. Mantem aparencia consistente com a tela inicial de carregamento.
function TelaCarregando({ alturaMin = "100vh" }: { alturaMin?: string }) {
  return (
    <div style={{
      minHeight: alturaMin, display: "flex",
      alignItems: "center", justifyContent: "center",
      color: C.muted, fontFamily: "'Segoe UI', sans-serif",
      padding: 24, fontSize: 13,
    }}>
      Carregando...
    </div>
  );
}

// Registry da busca rapida (Command Palette). Cada item aponta para um id de
// `tela` (navegacao via navegar) ou um id sintetico "@acao" tratado no handler.
// `keywords` carrega sinonimos/termos relacionados para o match — buscar por
// "pagar" acha Financeiro/Despesas, "fiado" acha Crediario, etc. A visibilidade
// e aplicada em runtime por podeVer() + gates de role, entao itens fora do
// plano/permissao do usuario nunca aparecem aqui.
const MODULOS_PALETA: ItemPaleta[] = [
  // Início
  { id: "pdv",            label: "PDV",                 icone: "🛒", secao: "Início",    keywords: "venda vender frente de caixa pos ponto de venda balcao" },
  { id: "dashboard",      label: "Dashboard",           icone: "📊", secao: "Início",    keywords: "painel inicio visao geral metricas indicadores resumo" },
  { id: "dashboardcrm",   label: "Dashboard CRM",       icone: "🎯", secao: "Início",    keywords: "crm relacionamento clientes painel funil visao" },
  // Cadastros
  { id: "clientes",       label: "Clientes",            icone: "👥", secao: "Cadastros", keywords: "cliente consumidor cadastro contato" },
  { id: "segmentos",      label: "Segmentos",           icone: "📊", secao: "Cadastros", keywords: "segmentacao grupos publico rfm classificacao clientes" },
  { id: "reativacao",     label: "Aniversários",        icone: "🎂", secao: "Cadastros", keywords: "aniversario niver reativacao datas resgate inativos" },
  { id: "tarefas",        label: "Tarefas",             icone: "✅", secao: "Cadastros", keywords: "tarefa follow up lembrete afazeres pendencia todo agenda" },
  { id: "fidelidade",     label: "Fidelidade",          icone: "⭐", secao: "Cadastros", keywords: "pontos programa recompensa cashback premio" },
  { id: "fornecedores",   label: "Fornecedores",        icone: "🏭", secao: "Cadastros", keywords: "fornecedor suprimento distribuidor representante" },
  { id: "produtos",       label: "Produtos",            icone: "📦", secao: "Cadastros", keywords: "produto item mercadoria sku cadastro preco" },
  { id: "etiquetas",      label: "Etiquetas",           icone: "🏷️", secao: "Cadastros", keywords: "etiqueta preco gondola impressao codigo de barras" },
  // Operação
  { id: "caixa",          label: "Caixa",               icone: "💵", secao: "Operação",  keywords: "abertura fechamento sangria suprimento dinheiro gaveta" },
  { id: "estoque",        label: "Estoque",             icone: "🗃️", secao: "Operação",  keywords: "estoque movimentacao entrada saida ajuste saldo" },
  { id: "inventario",     label: "Inventário",          icone: "📋", secao: "Operação",  keywords: "inventario contagem balanco conferencia cega" },
  { id: "compras",        label: "Compras",             icone: "🛍️", secao: "Operação",  keywords: "compra pedido entrada mercadoria fornecedor reposicao" },
  { id: "sugestoes",      label: "Sugestões de Compra", icone: "🧮", secao: "Operação",  keywords: "reposicao sugestao estoque minimo repor pedido automatico" },
  { id: "orcamentos",     label: "Orçamentos",          icone: "📝", secao: "Operação",  keywords: "orcamento proposta cotacao pre-venda" },
  { id: "funil",          label: "Funil de Vendas",     icone: "🎯", secao: "Operação",  keywords: "oportunidade pipeline negociacao lead prospecto kanban vendas" },
  { id: "automacoes",     label: "Automações",          icone: "⚡", secao: "Operação",  keywords: "automacao fluxo gatilho workflow regra disparo" },
  { id: "nps",            label: "NPS",                 icone: "⭐", secao: "Operação",  keywords: "nps satisfacao pesquisa pos-venda avaliacao feedback" },
  { id: "financeiro",     label: "Financeiro",          icone: "💰", secao: "Operação",  keywords: "financeiro contas a pagar contas a receber pagar receber boleto fluxo de caixa banco titulo" },
  { id: "despesas",       label: "Despesas",            icone: "🧾", secao: "Operação",  keywords: "despesa gasto custo conta a pagar pagamento operacional" },
  { id: "contabilidade",  label: "Contabilidade",       icone: "📚", secao: "Operação",  keywords: "contador plano de contas fechamento contabil dre balancete" },
  { id: "crediario",      label: "Crediário",           icone: "📒", secao: "Operação",  keywords: "fiado caderneta credito limite recebimento parcelado a prazo" },
  { id: "ordemservico",   label: "Ordem de Serviço",    icone: "🔧", secao: "Operação",  keywords: "os oficina assistencia tecnica conserto reparo servico" },
  { id: "relatorios",     label: "Relatórios",          icone: "📑", secao: "Operação",  keywords: "relatorio analise pdf exportar grafico vendas" },
  { id: "notasfiscais",   label: "Notas Fiscais",       icone: "🧾", secao: "Operação",  keywords: "nfce nota fiscal cupom danfe emitir cancelar xml" },
  { id: "entradanfe",     label: "Entrada NF-e",        icone: "📥", secao: "Operação",  keywords: "importar nfe xml nota de entrada compra fornecedor" },
  { id: "fiscalavancado", label: "NF-e / NFS-e",        icone: "📄", secao: "Operação",  keywords: "nfe nfse nota de servico fiscal avancado b2b produto" },
  { id: "comissoes",      label: "Comissões",           icone: "🏆", secao: "Operação",  keywords: "comissao vendedor remuneracao meta premiacao" },
  { id: "painelcomandas", label: "Central de Comandas", icone: "🍽️", secao: "Operação",  keywords: "comanda kanban pedido mesa cozinha bar garcom" },
  { id: "whatsapp",       label: "Atendimento WhatsApp",icone: "💬", secao: "Operação",  keywords: "whatsapp zap chat ia atendimento bot conversa" },
  // Sistema
  { id: "funcionarios",   label: "Funcionários",        icone: "🧑‍💼", secao: "Sistema",  keywords: "funcionario usuario equipe acesso permissao vendedor login" },
  { id: "empresa",        label: "Empresa",             icone: "🏢", secao: "Sistema",   keywords: "empresa dados fiscais identidade logo logotipo cnpj endereco" },
  { id: "impressora",     label: "Impressora",          icone: "🖨️", secao: "Sistema",   keywords: "impressora impressao cupom recibo termica" },
  { id: "@formas-pagamento", label: "Formas de pagamento", icone: "💳", secao: "Sistema", keywords: "forma de pagamento pix cartao credito debito dinheiro maquininha" },
  { id: "@pdv-volante",   label: "PDV Volante (mobile)",icone: "📱", secao: "Sistema",   keywords: "pdv volante mobile celular garcom pwa pedido mesa" },
  { id: "aparencia",      label: "Aparência",           icone: "🎨", secao: "Sistema",   keywords: "tema cores dark mode aparencia personalizar fonte densidade" },
  { id: "ajuda",          label: "Ajuda",               icone: "❓", secao: "Sistema",   keywords: "ajuda manual suporte duvida help tutorial" },
  { id: "projeto",        label: "Projeto",             icone: "📋", secao: "Sistema",   keywords: "projeto roadmap etapas rastreador progresso" },
  { id: "logs",           label: "Logs",                icone: "📜", secao: "Sistema",   keywords: "log auditoria historico acesso eventos" },
  { id: "backup",         label: "Backup",              icone: "💾", secao: "Sistema",   keywords: "backup restauracao exportar dados json salvar" },
  { id: "sistema",        label: "Sistema",             icone: "🛡", secao: "Sistema",   keywords: "sistema reset zona de perigo administrativo apagar" },
];

// Rotulo do atalho conforme a plataforma (⌘K no Mac, Ctrl+K no resto).
const ATALHO_BUSCA = (() => {
  try {
    const mac = /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || "");
    return mac ? "⌘K" : "Ctrl+K";
  } catch { return "Ctrl+K"; }
})();

export default function App() {
  // Bypass de auth para pesquisa publica de NPS. Calculado uma vez via
  // useState para nao re-renderizar a cada update.
  const [npsToken] = useState(() => getNpsToken());
  // Bypass de auth para aceite online de orcamento (?orc=token).
  const [orcamentoToken] = useState(() => getOrcamentoToken());
  // Bypass de auth para o cardapio digital publico (?cardapio=token).
  const [cardapioToken] = useState(() => getCardapioToken());
  // ETAPA#1 / #7: bypass do shell desktop pra ir direto em uma UI mobile
  // (Inventario ou PDV Volante). Mantem a sessao JWT do usuario logado.
  const [modoMobile] = useState(() => detectarModoMobile());

  const [user, setUser] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [tela, setTela] = useState("pdv");
  const [ajudaTopico, setAjudaTopico] = useState<string | null>(null);
  // Contexto opcional ao navegar pro PDV vindo de outro modulo (ex: Funil ->
  // Converter oportunidade em venda). Quando definido, PDV pre-seleciona o
  // cliente, mostra banner no topo e injeta `oportunidadeId` no payload da
  // venda ao finalizar. Limpo automaticamente ao sair do PDV.
  const [pdvContexto, setPdvContexto] = useState<null | {
    clienteId: string;
    oportunidadeId: string;
    numero: number;
    titulo: string;
  }>(null);
  const [menuUsuario, setMenuUsuario] = useState(false);
  const [trocarSenhaAberto, setTrocarSenhaAberto] = useState(false);
  const [verificacao2faAberta, setVerificacao2faAberta] = useState(false);
  const [sidebarAberta, setSidebarAberta] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => lerPreferenciaSidebar());
  const [gerenciarFormasAberto, setGerenciarFormasAberto] = useState(false);
  const [paletaAberta, setPaletaAberta] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  function alternarColapso() {
    setSidebarCollapsed((v) => {
      const novo = !v;
      salvarPreferenciaSidebar(novo);
      return novo;
    });
  }

  // Aplica preferencias de UI vindas do servidor sobre o cache local.
  // Chamado apos /auth/me (boot) e apos /auth/login (Login.onSuccess).
  // Hidratacao silenciosa: nao re-dispara PUT para o backend.
  function hidratarPreferencias(u: any) {
    const prefs = u?.preferencias;
    if (!prefs || typeof prefs !== "object") return;
    if (prefs.aparencia) hidratarAparenciaDoUser(prefs.aparencia);
    if (typeof prefs.sidebarCollapsed === "boolean") {
      try { localStorage.setItem(PREF_SIDEBAR_KEY, prefs.sidebarCollapsed ? "1" : "0"); } catch {}
      setSidebarCollapsed(prefs.sidebarCollapsed);
    }
  }

  const sidebarLargura = sidebarCollapsed ? SIDEBAR_W_RECOLHIDA : SIDEBAR_W_EXPANDIDA;

  // Wrappers para injetar collapsed em todos os itens da sidebar.
  const Item = (props: any) => <NavItem {...props} collapsed={sidebarCollapsed} />;
  const Secao = (props: any) => <SecaoLabel {...props} collapsed={sidebarCollapsed} />;

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (menuUsuario && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuUsuario(false);
      }
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, [menuUsuario]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setSidebarAberta(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Atalho global da busca rapida: Ctrl/Cmd+K alterna o palette; Alt+S abre
  // (atalho que o usuario pediu). Funciona em qualquer tela — inclusive no PDV
  // em modo focado, onde nao ha sidebar.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.key) return; // alguns eventos (autofill/IME) nao tem e.key
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "k") {
        e.preventDefault();
        setPaletaAberta((v) => !v);
      } else if (e.altKey && k === "s") {
        e.preventDefault();
        setPaletaAberta(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let ativo = true;
    async function init() {
      const token = getToken();
      const cached = getUser();
      if (!token) { setCarregando(false); return; }
      try {
        const u: any = await api.me();
        if (ativo) {
          setUser(u);
          hidratarPreferencias(u);
          // Sincroniza cache da empresa: o segmento pode ter sido alterado
          // no Admin Master enquanto o user estava logado. Sem isso,
          // Produtos.tsx renderiza com segmento antigo ate o proximo login.
          if (u?.empresa) setEmpresa(u.empresa);
        }
      } catch {
        clearSession();
        if (ativo && cached) setUser(null);
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    init();

    function onLogout() { setUser(null); }
    window.addEventListener("auth:logout", onLogout);
    return () => {
      ativo = false;
      window.removeEventListener("auth:logout", onLogout);
    };
  }, []);

  // CONTROLE DE LICENCA — heartbeat: enquanto logado, valida a sessao no backend
  // a cada 30s. Se o dispositivo desta maquina foi revogado (admin liberou a
  // vaga, ou o cliente derrubou esta maquina ao logar em outra), /auth/me
  // responde 401 e o interceptor do api.ts limpa a sessao + dispara auth:logout.
  // Cobre a aba PARADA/ociosa (que nao faz outras chamadas) — o middleware do
  // backend ja derruba a aba ATIVA no proximo clique. Fire-and-forget: erro de
  // rede nao desloga (so 401 o faz, dentro do request()).
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => { api.me().catch(() => {}); }, 30_000);
    return () => clearInterval(id);
  }, [user]);

  function sair() {
    // Best-effort: avisa o backend para registrar o evento de logout no
    // log de auditoria; em seguida limpa sessao local independentemente.
    api.logout().finally(() => {
      clearSession();
      setUser(null);
    });
  }

  // ETAPA 12: banner de notificacoes broadcast (super-admin -> todos clientes).
  // Carrega ao logar e a cada 5 minutos. User dismissa via X (marcar-lida).
  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  useEffect(() => {
    if (!user) { setNotificacoes([]); return; }
    let ativo = true;
    async function buscar() {
      try {
        const r = await api.notificacoesMinhas() as { notificacoes?: any[] };
        if (ativo) setNotificacoes(r.notificacoes || []);
      } catch { /* silencioso */ }
    }
    buscar();
    const id = setInterval(buscar, 5 * 60 * 1000);
    return () => { ativo = false; clearInterval(id); };
  }, [user]);

  async function fecharNotificacao(notifId: string) {
    setNotificacoes(ns => ns.filter(n => n.id !== notifId));
    try { await api.notificacoesMarcarLida(notifId); } catch { /* silencioso */ }
  }

  function navegar(t: string) {
    setTela(t);
    setSidebarAberta(false);
  }

  // Mapeia cada tela do app para o modulo de permissao correspondente.
  // "projeto" e ferramenta interna, fica liberada.
  const TELA_MODULO: Record<string, string> = {
    pdv: "PDV", dashboard: "DASHBOARD", dashboardcrm: "DASHBOARD", caixa: "CAIXA", clientes: "CLIENTES",
    fornecedores: "FORNECEDORES", produtos: "PRODUTOS", etiquetas: "PRODUTOS", estoque: "ESTOQUE",
    inventario: "INVENTARIO",
    compras: "COMPRAS", sugestoes: "COMPRAS", orcamentos: "ORCAMENTOS",
    funil: "OPORTUNIDADES",
    automacoes: "AUTOMACOES",
    nps: "NPS",
    financeiro: "FINANCEIRO", despesas: "DESPESAS", contabilidade: "CONTABILIDADE", relatorios: "RELATORIOS",
    notasfiscais: "RELATORIOS",
    entradanfe: "COMPRAS",
    crediario: "CREDIARIO",
    ordemservico: "ORDEM_SERVICO",
    comissoes: "COMISSOES",
    painelcomandas: "COMANDAS",
    whatsapp: "WHATSAPP",
    funcionarios: "FUNCIONARIOS",
    tarefas: "CLIENTES",
    fidelidade: "CLIENTES",
    segmentos: "CLIENTES",
    reativacao: "CLIENTES",
  };

  function podeVer(t: string) {
    if (t === "projeto" || t === "aparencia" || t === "ajuda") return true;
    if (t === "sistema" || t === "logs" || t === "backup") return user?.role === "ADMIN";
    if (t === "empresa") return user?.role === "ADMIN" || user?.role === "GERENTE";
    if (t === "impressora") return user?.role === "ADMIN" || user?.role === "GERENTE";
    // NFC-e: permissao de usuario (RELATORIOS) + plano precisa incluir FISCAL.
    if (t === "notasfiscais") return podeAcessar(user, "RELATORIOS") && moduloNoPlano("FISCAL");
    // Entrada de NF-e: importacao de compra. Permissao COMPRAS + plano FISCAL.
    if (t === "entradanfe") return podeAcessar(user, "COMPRAS") && moduloNoPlano("FISCAL");
    // Fiscal avancado (NF-e 55 / NFS-e): so-de-plano, gerencial.
    if (t === "fiscalavancado") return (user?.role === "ADMIN" || user?.role === "GERENTE") && (moduloNoPlano("NFE55") || moduloNoPlano("NFSE"));
    return podeAcessar(user, TELA_MODULO[t] as any);
  }

  // Se o usuario abriu uma tela sem permissao (ex: cache), redireciona para a primeira disponivel.
  useEffect(() => {
    if (!user) return;
    if (!podeVer(tela)) {
      const primeira = ["pdv","dashboard","dashboardcrm","caixa","clientes","segmentos","reativacao","tarefas","fidelidade","funil","automacoes","nps","fornecedores","produtos","etiquetas",
        "estoque","inventario","compras","sugestoes","orcamentos","ordemservico","financeiro","despesas","contabilidade","crediario","relatorios","notasfiscais","entradanfe","fiscalavancado","comissoes","painelcomandas","whatsapp","funcionarios","projeto","sistema","backup","empresa","impressora"].find(podeVer);
      if (primeira && primeira !== tela) setTela(primeira);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tela]);

  // Itens visiveis da busca rapida: filtra o registry pela visibilidade real do
  // usuario. podeVer() ja resolve permissao + plano + role para cada tela; as
  // acoes sinteticas (@formas-pagamento, @pdv-volante) tem gate proprio.
  const itensPaleta = useMemo<ItemPaleta[]>(() => {
    if (!user) return [];
    return MODULOS_PALETA.filter((m) => {
      if (m.id === "@formas-pagamento") return user.role === "ADMIN" || user.role === "GERENTE";
      if (m.id === "@pdv-volante") return podeAcessar(user, "PDV");
      return podeVer(m.id);
    });
    // podeVer depende de user/plano; recomputar quando user muda basta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Executa a escolha do palette: acoes sinteticas viram modal/aba; o resto e
  // navegacao normal por tela.
  function selecionarPaleta(item: ItemPaleta) {
    setPaletaAberta(false);
    if (item.id === "@formas-pagamento") { setGerenciarFormasAberto(true); return; }
    if (item.id === "@pdv-volante") { window.open("?mobile=pdv-volante", "_blank"); return; }
    if (item.id === "ajuda") { setAjudaTopico(null); navegar("ajuda"); return; }
    navegar(item.id);
  }

  // Pesquisa publica NPS: cliente externo acessa sem login.
  if (npsToken) return (
    <Suspense fallback={<TelaCarregando />}>
      <PesquisaPublicaNps token={npsToken} />
    </Suspense>
  );

  // Aceite online de orcamento: cliente externo aprova/recusa sem login.
  if (orcamentoToken) return (
    <Suspense fallback={<TelaCarregando />}>
      <AceitePublicoOrcamento token={orcamentoToken} />
    </Suspense>
  );

  // Cardapio digital: cliente final monta o pedido sem login.
  if (cardapioToken) return (
    <Suspense fallback={<TelaCarregando />}>
      <CardapioPublico token={cardapioToken} />
    </Suspense>
  );

  // ETAPA#1 / #7: modos mobile dedicados. Precisam de usuario logado;
  // se nao houver, cai na tela de login normal (gate abaixo).
  if (modoMobile === "inventario" && user) return (
    <Suspense fallback={<TelaCarregando />}>
      <InventarioMobile />
    </Suspense>
  );
  if (modoMobile === "pdv-volante" && user) return (
    <Suspense fallback={<TelaCarregando />}>
      <PdvVolante />
    </Suspense>
  );

  if (carregando) {
    return (
      <div style={{
        background: C.bg, minHeight: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center",
        color: C.muted, fontFamily: "sans-serif",
      }}>
        Carregando...
      </div>
    );
  }

  if (!user) return (
    <Suspense fallback={<TelaCarregando />}>
      <Login onSuccess={(u: any) => { setUser(u); hidratarPreferencias(u); }} />
    </Suspense>
  );

  // ETAPA 11: banner global quando sessao foi gerada via impersonate.
  // O JWT do super-admin "fingindo ser" outro user carrega claim `imp`
  // com o id do super-admin original. Tudo que ele fizer fica auditado
  // como esse user (com claim imp registrado).
  const impersonado = (() => {
    const token = getToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload?.imp) return { porId: payload.imp, porNome: payload.impNome };
      return null;
    } catch { return null; }
  })();

  // Modo focado do PDV: ocupa 100% da tela, sem sidebar/topbar/header de
  // pagina. PDV gerencia seu proprio header com logo, tabs, status do
  // caixa e botao "Menu" para sair do modo focado.
  if (tela === "pdv") {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Segoe UI', sans-serif", color: C.text }}>
        <style>{ESTILO_RESPONSIVO}</style>
        <Suspense fallback={<TelaCarregando />}>
          <PDV
            user={user}
            onSair={() => { setPdvContexto(null); setTela("dashboard"); }}
            sair={sair}
            contextoInicial={pdvContexto}
            onContextoConsumido={() => setPdvContexto(null)}
          />
        </Suspense>
        {/* Busca rapida tambem no PDV focado, onde nao ha sidebar */}
        <CommandPalette
          aberta={paletaAberta}
          itens={itensPaleta}
          telaAtual={tela}
          onFechar={() => setPaletaAberta(false)}
          onSelecionar={selecionarPaleta}
        />
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Segoe UI', sans-serif", color: C.text }}>
      <style>{ESTILO_RESPONSIVO}</style>
      {impersonado && (
        <div style={{
          background: "#f59e0b", color: "#0a0c14",
          padding: "8px 16px", textAlign: "center",
          fontSize: 12, fontWeight: 700,
          display: "flex", justifyContent: "center", alignItems: "center", gap: 12,
        }}>
          <span>👤 Você está impersonando como <strong>{user.nome}</strong> ({user.email}) — supervisão: {impersonado.porNome || "super-admin"}</span>
          <a href="/admin-master" style={{
            background: "#0a0c14", color: "#f59e0b",
            padding: "3px 10px", borderRadius: 4, textDecoration: "none",
            fontSize: 11, fontWeight: 800,
          }}>← Voltar ao Admin Master</a>
        </div>
      )}
      {/* ETAPA 12: banner de notificacoes broadcast — uma por vez, mais recente */}
      {notificacoes.length > 0 && (() => {
        const n = notificacoes[0];
        const cor = n.tipo === "MANUTENCAO" ? "#ef4444"
          : n.tipo === "AVISO" ? "#f59e0b"
          : n.tipo === "NOVIDADE" ? "#7c3aed"
          : "#4f8ef7";
        const icone = n.tipo === "MANUTENCAO" ? "🛠️"
          : n.tipo === "AVISO" ? "⚠️"
          : n.tipo === "NOVIDADE" ? "✨"
          : "📢";
        return (
          <div style={{
            background: cor, color: "#ffffff",
            padding: "10px 16px",
            display: "flex", alignItems: "center", gap: 12,
            fontSize: 13,
          }}>
            <span style={{ fontSize: 18 }}>{icone}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, lineHeight: 1.2 }}>{n.titulo}</div>
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>{n.mensagem}</div>
            </div>
            {notificacoes.length > 1 && (
              <span style={{
                background: "rgba(0,0,0,0.25)", padding: "3px 8px",
                borderRadius: 10, fontSize: 11, fontWeight: 700,
              }}>+{notificacoes.length - 1}</span>
            )}
            <button
              onClick={() => fecharNotificacao(n.id)}
              style={{
                background: "rgba(0,0,0,0.25)", color: "#ffffff",
                border: "none", borderRadius: 4,
                padding: "4px 10px", cursor: "pointer",
                fontSize: 12, fontWeight: 700,
              }}
              title="Marcar como lida"
            >✓ OK</button>
          </div>
        );
      })()}

      {/* Sidebar */}
      <aside
        className={`gp-sidebar ${sidebarAberta ? "open" : ""}`}
        style={{ width: sidebarLargura }}
      >
        <div style={{
          padding: sidebarCollapsed ? "18px 12px 16px" : "18px 18px 16px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center",
          gap: sidebarCollapsed ? 0 : 10,
          justifyContent: sidebarCollapsed ? "center" : "flex-start",
        }}>
          <div style={{ fontSize: 24 }}>🏪</div>
          {!sidebarCollapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.white, fontWeight: 800, fontSize: 16, lineHeight: 1.1, whiteSpace: "nowrap" }}>Gestão<span style={{ fontWeight: 600 }}>Pro</span><span className="gp-brand-max">Max</span></div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Gestão + PDV</div>
            </div>
          )}
          <button
            onClick={() => setSidebarAberta(false)}
            className="gp-mobile-bar"
            aria-label="Fechar menu"
            style={{
              background: "transparent", border: "none", color: C.muted,
              fontSize: 22, cursor: "pointer", padding: 4, lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Botao de toggle (so desktop) */}
        <button
          onClick={alternarColapso}
          aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          style={{
            display: "block", margin: sidebarCollapsed ? "10px auto 0" : "10px 12px 0 auto",
            background: C.card, border: `1px solid ${C.border}`, color: C.muted,
            borderRadius: 6, width: 28, height: 28, cursor: "pointer",
            fontSize: 14, lineHeight: 1, padding: 0,
            transition: "background 0.15s ease, color 0.15s ease",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = C.accent + "22"; e.currentTarget.style.color = C.accent; }}
          onMouseLeave={e => { e.currentTarget.style.background = C.card; e.currentTarget.style.color = C.muted; }}
          className="gp-toggle-desktop"
        >{sidebarCollapsed ? "›" : "‹"}</button>

        <nav className="gp-nav-section" style={{ padding: "12px 10px" }}>
          {podeAcessar(user, "PDV") && (
            <Item icone="🛒" label="PDV" destaque ativo={tela === "pdv"} onClick={() => navegar("pdv")} />
          )}
          {podeAcessar(user, "DASHBOARD") && (
            <Item icone="📊" label="Dashboard" ativo={tela === "dashboard"} onClick={() => navegar("dashboard")} />
          )}
          {podeAcessar(user, "DASHBOARD") && (
            <Item icone="🎯" label="Dashboard CRM" ativo={tela === "dashboardcrm"} onClick={() => navegar("dashboardcrm")} />
          )}
          {(podeAcessar(user, "CLIENTES") || podeAcessar(user, "FORNECEDORES") || podeAcessar(user, "PRODUTOS")) && (
            <Secao>Cadastros</Secao>
          )}
          {podeAcessar(user, "CLIENTES") && (
            <Item icone="👥" label="Clientes" ativo={tela === "clientes"} onClick={() => navegar("clientes")} />
          )}
          {podeAcessar(user, "CLIENTES") && (
            <Item icone="📊" label="Segmentos" ativo={tela === "segmentos"} onClick={() => navegar("segmentos")} />
          )}
          {podeAcessar(user, "CLIENTES") && (
            <Item icone="🎂" label="Aniversários" ativo={tela === "reativacao"} onClick={() => navegar("reativacao")} />
          )}
          {podeAcessar(user, "CLIENTES") && (
            <Item icone="✅" label="Tarefas" ativo={tela === "tarefas"} onClick={() => navegar("tarefas")} />
          )}
          {podeAcessar(user, "CLIENTES") && (
            <Item icone="⭐" label="Fidelidade" ativo={tela === "fidelidade"} onClick={() => navegar("fidelidade")} />
          )}
          {podeAcessar(user, "FORNECEDORES") && (
            <Item icone="🏭" label="Fornecedores" ativo={tela === "fornecedores"} onClick={() => navegar("fornecedores")} />
          )}
          {podeAcessar(user, "PRODUTOS") && (
            <Item icone="📦" label="Produtos" ativo={tela === "produtos"} onClick={() => navegar("produtos")} />
          )}
          {podeAcessar(user, "PRODUTOS") && (
            <Item icone="🏷️" label="Etiquetas" ativo={tela === "etiquetas"} onClick={() => navegar("etiquetas")} />
          )}
          {(podeAcessar(user, "CAIXA") || podeAcessar(user, "ESTOQUE") || podeAcessar(user, "COMPRAS") || podeAcessar(user, "ORCAMENTOS") || podeAcessar(user, "FINANCEIRO") || podeAcessar(user, "RELATORIOS")) && (
            <Secao>Operação</Secao>
          )}
          {podeAcessar(user, "CAIXA") && (
            <Item icone="💵" label="Caixa" ativo={tela === "caixa"} onClick={() => navegar("caixa")} />
          )}
          {podeAcessar(user, "ESTOQUE") && (
            <Item icone="🗃️" label="Estoque" ativo={tela === "estoque"} onClick={() => navegar("estoque")} />
          )}
          {podeAcessar(user, "INVENTARIO") && (
            <Item icone="📋" label="Inventário" ativo={tela === "inventario"} onClick={() => navegar("inventario")} />
          )}
          {podeAcessar(user, "COMPRAS") && (
            <Item icone="🛍️" label="Compras" ativo={tela === "compras"} onClick={() => navegar("compras")} />
          )}
          {podeAcessar(user, "COMPRAS") && (
            <Item icone="🧮" label="Sugestões de Compra" ativo={tela === "sugestoes"} onClick={() => navegar("sugestoes")} />
          )}
          {podeAcessar(user, "ORCAMENTOS") && (
            <Item icone="📝" label="Orçamentos" ativo={tela === "orcamentos"} onClick={() => navegar("orcamentos")} />
          )}
          {podeAcessar(user, "OPORTUNIDADES") && (
            <Item icone="🎯" label="Funil de Vendas" ativo={tela === "funil"} onClick={() => navegar("funil")} />
          )}
          {podeAcessar(user, "AUTOMACOES") && (
            <Item icone="⚡" label="Automações" ativo={tela === "automacoes"} onClick={() => navegar("automacoes")} />
          )}
          {podeAcessar(user, "NPS") && (
            <Item icone="⭐" label="NPS" ativo={tela === "nps"} onClick={() => navegar("nps")} />
          )}
          {podeAcessar(user, "FINANCEIRO") && (
            <Item icone="💰" label="Financeiro" ativo={tela === "financeiro"} onClick={() => navegar("financeiro")} />
          )}
          {podeAcessar(user, "DESPESAS") && (
            <Item icone="🧾" label="Despesas" ativo={tela === "despesas"} onClick={() => navegar("despesas")} />
          )}
          {podeAcessar(user, "CONTABILIDADE") && (
            <Item icone="📚" label="Contabilidade" ativo={tela === "contabilidade"} onClick={() => navegar("contabilidade")} />
          )}
          {podeAcessar(user, "CREDIARIO") && (
            <Item icone="📒" label="Crediário" ativo={tela === "crediario"} onClick={() => navegar("crediario")} />
          )}
          {podeAcessar(user, "ORDEM_SERVICO") && (
            <Item icone="🔧" label="Ordem de Serviço" ativo={tela === "ordemservico"} onClick={() => navegar("ordemservico")} />
          )}
          {podeAcessar(user, "RELATORIOS") && (
            <Item icone="📑" label="Relatórios" ativo={tela === "relatorios"} onClick={() => navegar("relatorios")} />
          )}
          {podeAcessar(user, "RELATORIOS") && moduloNoPlano("FISCAL") && (
            <Item icone="🧾" label="Notas Fiscais" ativo={tela === "notasfiscais"} onClick={() => navegar("notasfiscais")} />
          )}
          {podeAcessar(user, "COMPRAS") && moduloNoPlano("FISCAL") && (
            <Item icone="📥" label="Entrada NF-e" ativo={tela === "entradanfe"} onClick={() => navegar("entradanfe")} />
          )}
          {(user.role === "ADMIN" || user.role === "GERENTE") && (moduloNoPlano("NFE55") || moduloNoPlano("NFSE")) && (
            <Item icone="📄" label="NF-e / NFS-e" ativo={tela === "fiscalavancado"} onClick={() => navegar("fiscalavancado")} />
          )}
          {podeAcessar(user, "COMISSOES") && (
            <Item icone="🏆" label="Comissões" ativo={tela === "comissoes"} onClick={() => navegar("comissoes")} />
          )}
          {/* ETAPA#8b: Central de Comandas (Kanban) */}
          {podeAcessar(user, "COMANDAS") && (
            <Item icone="🍽️" label="Central de Comandas" ativo={tela === "painelcomandas"} onClick={() => navegar("painelcomandas")} />
          )}
          {/* ETAPA#9b: Atendimento Inteligente WhatsApp */}
          {podeAcessar(user, "WHATSAPP") && (
            <Item icone="💬" label="Atendimento WhatsApp" ativo={tela === "whatsapp"} onClick={() => navegar("whatsapp")} />
          )}
          <Secao>Sistema</Secao>
          {user.role === "ADMIN" && (
            <Item icone="🧑‍💼" label="Funcionários" ativo={tela === "funcionarios"} onClick={() => navegar("funcionarios")} />
          )}
          {(user.role === "ADMIN" || user.role === "GERENTE") && (
            <Item icone="🏢" label="Empresa" ativo={tela === "empresa"} onClick={() => navegar("empresa")} />
          )}
          {(user.role === "ADMIN" || user.role === "GERENTE") && (
            <Item icone="🖨️" label="Impressora" ativo={tela === "impressora"} onClick={() => navegar("impressora")} />
          )}
          {/* Formas de pagamento — abre modal global. Antes ficava como botao
              ⚙ Gerenciar dentro do modal de Finalizar Venda do PDV. */}
          {(user.role === "ADMIN" || user.role === "GERENTE") && (
            <Item icone="💳" label="Formas de pagamento" ativo={false} onClick={() => setGerenciarFormasAberto(true)} />
          )}
          {/* ETAPA#7: link rapido para a versao mobile do PDV (PWA).
              Abre em nova aba para preservar a sessao desktop atual. */}
          {podeAcessar(user, "PDV") && (
            <Item icone="📱" label="PDV Volante (mobile)" ativo={false}
              onClick={() => window.open("?mobile=pdv-volante", "_blank")} />
          )}
          <Item icone="❓" label="Ajuda" ativo={tela === "ajuda"} onClick={() => { setAjudaTopico(null); navegar("ajuda"); }} />
          <Item icone="📋" label="Projeto" ativo={tela === "projeto"} onClick={() => navegar("projeto")} />
          {user.role === "ADMIN" && (
            <Item icone="📜" label="Logs" ativo={tela === "logs"} onClick={() => navegar("logs")} />
          )}
          {user.role === "ADMIN" && (
            <Item icone="💾" label="Backup" ativo={tela === "backup"} onClick={() => navegar("backup")} />
          )}
          {user.role === "ADMIN" && (
            <Item icone="🛡" label="Sistema" ativo={tela === "sistema"} onClick={() => navegar("sistema")} />
          )}
        </nav>

        {/* Card de usuário no rodapé */}
        <div ref={menuRef} style={{
          borderTop: `1px solid ${C.border}`, padding: 10, position: "relative",
        }}>
          <button
            onClick={() => setMenuUsuario(v => !v)}
            title={sidebarCollapsed ? `${user.nome} (${user.role})` : undefined}
            style={{
              background: C.card, border: `1px solid ${C.border}`, color: C.text,
              borderRadius: 10,
              padding: sidebarCollapsed ? "8px 0" : "8px 10px",
              display: "flex", alignItems: "center",
              justifyContent: sidebarCollapsed ? "center" : "flex-start",
              gap: sidebarCollapsed ? 0 : 10, cursor: "pointer", width: "100%",
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
              background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              color: "var(--accent-ink)", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800,
            }}>
              {(user.nome || "?").charAt(0).toUpperCase()}
            </div>
            {!sidebarCollapsed && (
              <>
                <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                  <div style={{
                    color: C.white, fontSize: 13, fontWeight: 600, lineHeight: 1.1,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{user.nome}</div>
                  <div style={{ color: C.muted, fontSize: 11 }}>{user.role}</div>
                </div>
                <div style={{ color: C.muted, fontSize: 11 }}>▴</div>
              </>
            )}
          </button>

          {menuUsuario && (
            <div style={{
              position: "absolute", bottom: "calc(100% + 4px)", left: 10, right: 10,
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 70, overflow: "hidden",
            }}>
              <div style={{
                padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
                color: C.muted, fontSize: 11,
              }}>
                Logado como
                <div style={{
                  color: C.text, fontSize: 12, marginTop: 2, fontWeight: 600,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{user.email || user.nome}</div>
              </div>
              <button onClick={() => { setMenuUsuario(false); navegar("aparencia"); }} style={menuItem}>
                🎨 Aparência
              </button>
              <button onClick={() => { setMenuUsuario(false); setTrocarSenhaAberto(true); }} style={menuItem}>
                🔐 Trocar senha
              </button>
              <button onClick={() => { setMenuUsuario(false); setVerificacao2faAberta(true); }} style={menuItem}>
                🛡️ Verificação em 2 etapas
              </button>
              {user.superAdmin && (
                <a
                  href="/admin-master"
                  style={{
                    ...menuItem,
                    display: "block", textDecoration: "none",
                    borderTop: `1px solid ${C.border}`,
                    color: C.yellow, fontWeight: 700,
                  }}
                >
                  👑 Admin Master
                </a>
              )}
              <button onClick={() => { setMenuUsuario(false); sair(); }} style={{ ...menuItem, color: C.text }}>
                <span style={{ color: C.red }}>↩ Sair</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Overlay clicável (mobile) */}
      <div
        className={`gp-overlay ${sidebarAberta ? "open" : ""}`}
        onClick={() => setSidebarAberta(false)}
      />

      {/* Conteúdo principal */}
      <main className="gp-content" style={{ marginLeft: sidebarLargura }}>
        {/* Top bar (mobile + alertas) */}
        <div style={{
          background: C.surface, borderBottom: `1px solid ${C.border}`,
          padding: "10px 18px", display: "flex", alignItems: "center", gap: 12,
          position: "sticky", top: 0, zIndex: 40,
        }}>
          <button
            className="gp-mobile-bar"
            onClick={() => setSidebarAberta(true)}
            aria-label="Abrir menu"
            style={{
              background: C.card, border: `1px solid ${C.border}`, color: C.text,
              borderRadius: 8, padding: "6px 10px", fontSize: 18, cursor: "pointer", lineHeight: 1,
            }}
          >☰</button>
          <div style={{ flex: 1, color: C.muted, fontSize: 12 }}>
            <span className="gp-mobile-bar" style={{ color: C.white, fontWeight: 700, fontSize: 14 }}>
              Gestão<span style={{ fontWeight: 600 }}>Pro</span><span className="gp-brand-max">Max</span>
            </span>
          </div>
          {/* Disparador discreto da busca rapida — descoberta sem poluir a
              sidebar (que permanece visualmente intacta). O atalho real e o
              Ctrl/Cmd+K (ou Alt+S). */}
          <button
            onClick={() => setPaletaAberta(true)}
            title="Buscar módulo (Ctrl+K / Alt+S)"
            aria-label="Buscar módulo"
            className="gp-busca-trigger"
            style={{
              background: C.card, border: `1px solid ${C.border}`, color: C.muted,
              borderRadius: 8, padding: "6px 10px", fontSize: 13, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
              transition: "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.accent + "14"; e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = C.accent + "55"; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.card; e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}
          >
            <span>🔍</span>
            <span className="gp-busca-label" style={{ fontSize: 12 }}>Buscar</span>
            <kbd className="gp-busca-kbd" style={{
              fontFamily: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
              fontSize: 10, lineHeight: 1, color: C.muted,
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 5, padding: "3px 6px",
            }}>{ATALHO_BUSCA}</kbd>
          </button>
          <button
            onClick={() => {
              const topico = TELA_AJUDA[tela] || null;
              setAjudaTopico(topico);
              navegar("ajuda");
            }}
            title={`Ajuda sobre ${tela}`}
            aria-label="Abrir ajuda"
            style={{
              background: C.card, border: `1px solid ${C.border}`, color: C.text,
              borderRadius: 8, padding: "6px 12px", fontSize: 14, cursor: "pointer",
              fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
              transition: "background 0.15s ease, color 0.15s ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.accent + "22"; e.currentTarget.style.color = C.accent; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.card; e.currentTarget.style.color = C.text; }}
          >
            <span>❓</span>
            <span style={{ fontSize: 12 }}>Ajuda</span>
          </button>
          <Alertas onNavegar={navegar} />
        </div>

        <div style={{ padding: "24px" }}>
          <Suspense fallback={<TelaCarregando alturaMin="60vh" />}>
          {tela === "dashboard" && (
            <Dashboard user={user} />
          )}
          {tela === "clientes" && (
            <>
              <PageHeader titulo="Clientes" subtitulo="Cadastro e gerenciamento de clientes" />
              <Clientes user={user} />
            </>
          )}
          {tela === "fornecedores" && (
            <>
              <PageHeader titulo="Fornecedores" subtitulo="Cadastro e gerenciamento de fornecedores" />
              <Fornecedores user={user} />
            </>
          )}
          {tela === "produtos" && (
            <>
              <PageHeader titulo="Produtos" subtitulo="Cadastro de produtos com preço, estoque e categorização" />
              <Produtos user={user} />
            </>
          )}
          {tela === "etiquetas" && (
            <>
              <PageHeader titulo="Etiquetas de Preço" subtitulo="Impressão em lote — selecione produtos por categoria e quantidade de cópias" />
              <Etiquetas />
            </>
          )}
          {tela === "estoque" && (
            <>
              <PageHeader titulo="Controle de Estoque" subtitulo="Histórico e movimentações (entrada, saída, ajuste)" />
              <Estoque user={user} />
            </>
          )}
          {tela === "inventario" && (
            <>
              <PageHeader titulo="Inventário" subtitulo="Contagem cega de estoque — o operador conta sem ver o valor do sistema" />
              <Inventario user={user} />
            </>
          )}
          {tela === "compras" && (
            <>
              <PageHeader titulo="Compras" subtitulo="Registro de compras (gera entrada de estoque automaticamente)" />
              <Compras user={user} />
            </>
          )}
          {tela === "sugestoes" && (
            <>
              <PageHeader titulo="Sugestões de Compra" subtitulo="Reposição de estoque — itens abaixo do mínimo (automático) + adições manuais. Selecione e gere o pedido de compra." />
              <Sugestoes user={user} />
            </>
          )}
          {tela === "orcamentos" && (
            <>
              <PageHeader titulo="Orçamentos / Ordens de Serviço" subtitulo="Documento comercial pré-venda — vira venda quando aprovado e finalizado" />
              <Orcamentos user={user} />
            </>
          )}
          {tela === "funil" && (
            <Funil
              user={user}
              onConverterEmVenda={(ctx) => {
                setPdvContexto(ctx);
                setTela("pdv");
              }}
            />
          )}
          {tela === "segmentos" && (
            <Segmentos user={user} />
          )}
          {tela === "automacoes" && (
            <Automacoes user={user} />
          )}
          {tela === "dashboardcrm" && (
            <DashboardCrm />
          )}
          {tela === "reativacao" && (
            <Reativacao user={user} />
          )}
          {tela === "nps" && (
            <Nps />
          )}
          {tela === "financeiro" && (
            <FinanceiroPage user={user} />
          )}
          {tela === "despesas" && (
            <>
              <PageHeader titulo="Despesas" subtitulo="Lançamento rápido de despesas operacionais (não-estoque) classificadas pelo plano de contas" />
              <Despesas user={user} />
            </>
          )}
          {tela === "contabilidade" && (
            <>
              <PageHeader titulo="Contabilidade" subtitulo="Painel financeiro gerencial + fechamento do período e exportação para o contador (CSV / layout Domínio·Alterdata)" />
              <Contabilidade user={user} />
            </>
          )}
          {tela === "caixa" && (
            <>
              <PageHeader titulo="Caixa" subtitulo="Abertura, fechamento e extrato — controle do dinheiro físico no PDV" />
              <Caixa user={user} />
            </>
          )}
          {tela === "empresa" && (user.role === "ADMIN" || user.role === "GERENTE") && (
            <>
              <PageHeader titulo="Empresa" subtitulo="Identidade do tenant, dados fiscais e estatísticas" />
              <Empresa user={user} />
            </>
          )}
          {tela === "impressora" && (user.role === "ADMIN" || user.role === "GERENTE") && (
            <>
              <PageHeader titulo="Impressora" subtitulo="Configurações de impressão não-fiscal — cupons, recibos, sangrias e fechamento" />
              <ConfiguracoesImpressora user={user} />
            </>
          )}
          {tela === "relatorios" && (
            <>
              <PageHeader titulo="Relatórios" subtitulo="Relatórios analíticos com exportação em PDF" />
              <Relatorios />
            </>
          )}
          {tela === "notasfiscais" && (
            <>
              <PageHeader titulo="Notas Fiscais" subtitulo="NFC-e emitidas — reimpressão, cancelamento, inutilização e XML" />
              <NotasFiscais user={user} />
            </>
          )}
          {tela === "entradanfe" && (
            <>
              <PageHeader titulo="Entrada de NF-e" subtitulo="Importar NF-e do fornecedor — vira compra, estoque e contas a pagar" />
              <EntradaNfe user={user} />
            </>
          )}
          {tela === "crediario" && (
            <>
              <PageHeader titulo="Crediário" subtitulo="Caderneta digital — fiado, limite de crédito e recebimentos" />
              <Crediario user={user} />
            </>
          )}
          {tela === "ordemservico" && (
            <>
              <PageHeader titulo="Ordem de Serviço" subtitulo="Oficina e assistência técnica — peças, serviços e acompanhamento" />
              <OrdemServico user={user} />
            </>
          )}
          {tela === "fiscalavancado" && (
            <>
              <PageHeader titulo="NF-e / NFS-e" subtitulo="Documentos fiscais avançados — produto (B2B) e serviços" />
              <FiscalAvancado />
            </>
          )}
          {tela === "tarefas" && (
            <>
              <PageHeader titulo="Tarefas" subtitulo="Follow-ups, lembretes e ações vinculadas a clientes" />
              <Tarefas user={user} />
            </>
          )}
          {tela === "fidelidade" && (
            <>
              <PageHeader titulo="Fidelidade" subtitulo="Programa de pontos — configuração e consulta por cliente" />
              <Fidelidade user={user} />
            </>
          )}
          {tela === "comissoes" && (
            <>
              <PageHeader titulo="Comissões" subtitulo="Configure como cada vendedor é remunerado por venda e meta" />
              <Comissoes user={user} />
            </>
          )}
          {tela === "painelcomandas" && (
            <>
              <PageHeader titulo="Central de Comandas" subtitulo="Kanban de pedidos do PDV Volante — aceite, prepare e finalize" />
              <PainelComandas user={user} />
            </>
          )}
          {tela === "whatsapp" && (
            <>
              <PageHeader titulo="Atendimento WhatsApp" subtitulo="IA Claude responde clientes automaticamente via Evolution API" />
              <Whatsapp />
            </>
          )}
          {tela === "funcionarios" && user.role === "ADMIN" && (
            <>
              <PageHeader titulo="Funcionários" subtitulo="Cadastro de funcionários e controle de acesso (Admin/Gerente/Vendedor)" />
              <Funcionarios user={user} />
            </>
          )}
          {tela === "projeto" && (
            <>
              <PageHeader titulo="Rastreador do Projeto" subtitulo="Acompanhe o progresso das etapas" />
              <Projeto />
            </>
          )}
          {tela === "aparencia" && (
            <Aparencia />
          )}
          {tela === "ajuda" && (
            <Ajuda topicoInicial={ajudaTopico} />
          )}
          {tela === "logs" && user.role === "ADMIN" && (
            <Logs />
          )}
          {tela === "backup" && user.role === "ADMIN" && (
            <>
              <PageHeader titulo="Backup e Restauração" subtitulo="Baixe ou restaure todos os dados da empresa em um arquivo .json" />
              <Backup user={user} />
            </>
          )}
          {tela === "sistema" && user.role === "ADMIN" && (
            <>
              <PageHeader titulo="Sistema" subtitulo="Operações administrativas e zona de perigo" />
              <Sistema
                user={user}
                onResetar={(resumo: any) => {
                  const total = Object.values(resumo?.removidos || {}).reduce((a: any, b: any) => a + b, 0);
                  alert(`✓ Sistema resetado com sucesso.\n\n${total} registros removidos em ${Object.keys(resumo?.removidos || {}).length} tabelas.\n\nRedirecionando para o Dashboard...`);
                  navegar(podeAcessar(user, "DASHBOARD") ? "dashboard" : "pdv");
                }}
              />
            </>
          )}
          </Suspense>
        </div>
      </main>

      {trocarSenhaAberto && (
        <Suspense fallback={null}>
          <TrocarSenhaModal onFechar={() => setTrocarSenhaAberto(false)} />
        </Suspense>
      )}
      {verificacao2faAberta && (
        <Suspense fallback={null}>
          <Verificacao2faModal onFechar={() => setVerificacao2faAberta(false)} />
        </Suspense>
      )}
      {gerenciarFormasAberto && (
        <Suspense fallback={null}>
          <GerenciarFormasModal
            podeExcluir={user.role === "ADMIN"}
            onFechar={() => setGerenciarFormasAberto(false)}
          />
        </Suspense>
      )}
      <CommandPalette
        aberta={paletaAberta}
        itens={itensPaleta}
        telaAtual={tela}
        onFechar={() => setPaletaAberta(false)}
        onSelecionar={selecionarPaleta}
      />
    </div>
  );
}

const menuItem: CSSProperties = {
  display: "block", width: "100%", textAlign: "left",
  background: "transparent", border: "none", color: C.text,
  padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
};

function NavItem({ icone, label, ativo, destaque, collapsed, onClick }: any) {
  const bg = ativo
    ? (destaque ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : C.accent + "22")
    : "transparent";
  const borda = !ativo && destaque ? `1px solid ${C.accent}55` : "none";
  const corTexto = ativo
    ? C.white
    : (destaque ? C.accent : C.text);

  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      style={{
        display: "flex", alignItems: "center",
        gap: collapsed ? 0 : 12,
        justifyContent: collapsed ? "center" : "flex-start",
        width: "100%",
        padding: collapsed ? "10px 0" : "10px 12px",
        borderRadius: 8, border: borda,
        background: bg, color: corTexto,
        fontWeight: ativo || destaque ? 700 : 500, fontSize: 13,
        cursor: "pointer", marginBottom: 4, textAlign: "left",
        boxShadow: ativo && destaque ? "0 4px 12px rgba(79,142,247,0.25)" : "none",
        transition: "background 0.15s ease",
        overflow: "hidden", whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { if (!ativo) e.currentTarget.style.background = C.card; }}
      onMouseLeave={e => { if (!ativo) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{icone}</span>
      {!collapsed && <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
    </button>
  );
}

function SecaoLabel({ children, collapsed }: any) {
  if (collapsed) {
    return <div style={{ height: 1, background: C.border, margin: "10px 12px 6px" }} />;
  }
  return (
    <div style={{
      color: C.muted, fontSize: 10, fontWeight: 700,
      textTransform: "uppercase", letterSpacing: 1,
      padding: "12px 12px 6px",
    }}>
      {children}
    </div>
  );
}

function PageHeader({ titulo, subtitulo }: any) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ color: C.white, fontSize: 22, fontWeight: 800 }}>{titulo}</div>
      <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{subtitulo}</div>
    </div>
  );
}
