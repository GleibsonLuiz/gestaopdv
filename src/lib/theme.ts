// Sistema de aparencia via CSS Variables.
//
// Estrategia: cada tema define um conjunto de variaveis CSS aplicadas no
// :root (ex: --bg, --accent). A paleta `C` exportada aqui aponta para essas
// variaveis em vez de literais hex. Como CSS vars sao reativas, basta
// alterar os valores no documentElement e todos os componentes que usam
// `style={{ background: C.bg }}` se atualizam — sem re-render.
//
// Alem do tema, esta camada tambem gerencia:
//   - Cor de destaque (override de --accent independente do tema)
//   - Densidade (data-density no <body>, ajusta CSS vars de espaco)
//   - Tamanho da fonte (font-size no :root, em px)
//   - Raio dos cantos (--radius-md / --radius-lg)
//   - Reduzir movimento, sublinhar links (data-* no <body>)
//   - Modo automatico claro/escuro por horario
//
// Persistencia: localStorage como cache local + PUT /auth/preferencias
// (debounced) para sincronizar entre dispositivos do mesmo usuario.

import { api, getToken } from "./api";

const PREF_TEMA_KEY = "gestao_tema";
const PREF_APARENCIA_KEY = "gestao_aparencia_v1";
export const TEMA_PADRAO = "azul";

export interface TemaCores {
  bg: string;
  surface: string;
  card: string;
  border: string;
  accent: string;
  purple: string;
  green: string;
  red: string;
  yellow: string;
  text: string;
  muted: string;
  white: string;
}

export interface Tema {
  id: string;
  nome: string;
  descricao: string;
  claro: boolean;
  cores: TemaCores;
}

export interface Acento {
  nome: string;
  valor: string | null;
}

export type Densidade = "compacto" | "padrao" | "confortavel";
export type ModoAutomatico = "off" | "sunset" | "custom";

export interface AparenciaEstado {
  tema: string;
  acento: string | null;
  densidade: Densidade;
  fontSize: number;
  radius: number;
  reduzirMovimento: boolean;
  sublinharLinks: boolean;
  sincronizar: boolean;
  modoAutomatico: ModoAutomatico;
}

// As 6 paletas. Mesmas chaves em todos os temas — qualquer componente que
// ja usa C continua funcionando, so muda a aparencia.
//
// `white` representa "cor de texto de destaque" (titulos, labels) e nao
// branco literal: em temas claros como pergaminho ele e escuro, para
// preservar contraste contra os fundos claros.
export const TEMAS: Tema[] = [
  {
    id: "azul",
    nome: "Azul Padrão",
    descricao: "Paleta original — azul + roxo sobre dark slate",
    claro: false,
    cores: {
      bg: "#0f1117", surface: "#1a1d27", card: "#21253a",
      border: "#2e3354", accent: "#4f8ef7", purple: "#7c3aed",
      green: "#22c55e", red: "#ef4444", yellow: "#f59e0b",
      text: "#e2e8f0", muted: "#64748b", white: "#ffffff",
    },
  },
  {
    id: "esmeralda",
    nome: "Esmeralda",
    descricao: "Verde + teal — visual mais natural e calmo",
    claro: false,
    cores: {
      bg: "#0c1410", surface: "#142019", card: "#1d2a23",
      border: "#26392f", accent: "#10b981", purple: "#0d9488",
      green: "#22c55e", red: "#ef4444", yellow: "#f59e0b",
      text: "#e2e8f0", muted: "#6b7d77", white: "#ffffff",
    },
  },
  {
    id: "roxo",
    nome: "Roxo",
    descricao: "Roxo + magenta — vibracao mais criativa",
    claro: false,
    cores: {
      bg: "#120c1a", surface: "#1d1429", card: "#2a1d3d",
      border: "#3b2855", accent: "#a855f7", purple: "#d946ef",
      green: "#22c55e", red: "#ef4444", yellow: "#f59e0b",
      text: "#ede9fe", muted: "#7d6c93", white: "#ffffff",
    },
  },
  {
    id: "alto-contraste",
    nome: "Alto Contraste",
    descricao: "Preto + amarelo — maxima legibilidade (acessibilidade)",
    claro: false,
    cores: {
      bg: "#000000", surface: "#0d0d0d", card: "#1a1a1a",
      border: "#404040", accent: "#facc15", purple: "#fbbf24",
      green: "#22c55e", red: "#ff4444", yellow: "#facc15",
      text: "#ffffff", muted: "#a3a3a3", white: "#ffffff",
    },
  },
  {
    id: "claro",
    nome: "Claro",
    descricao: "Off-white com texto grafite — claro neutro e sóbrio",
    claro: true,
    cores: {
      // Modo claro neutro (DESIGN_STANDARDS.md §7): fundo off-white (nao branco
      // puro), superficies brancas para os cards "saltarem", texto grafite
      // (nao preto puro). Cores de status recalibradas para contraste AA sobre
      // fundo claro.
      // Identidade de marca no modo claro: o "lilás" (accent azul + roxo) dá
      // lugar ao OURO do logo GestãoProMax. Dois tons p/ um metal sofisticado,
      // não um bloco pesado: accent = DarkGoldenrod (#B8860B) para detalhes
      // legíveis (foco, bordas, título destaque, texto-accent — passa AA em
      // texto grande/negrito); purple = Metallic Gold (#D4AF37) como par do
      // gradiente e realces "iris". Como --white é escuro nos temas claros, o
      // texto sobre os botões de ouro fica grafite (folha de ouro + tinta
      // escura), de alto contraste e elegante.
      // yellow (status "Pendente"/amber) fica num laranja-âmbar distinto do
      // accent dourado — senão pendente e marca virariam a mesma cor e a
      // semântica de status (§1) se perderia.
      bg: "#f7f7f5", surface: "#ffffff", card: "#ffffff",
      border: "#e6e3da", accent: "#B8860B", purple: "#D4AF37",
      green: "#16a34a", red: "#dc2626", yellow: "#c2740a",
      text: "#26231c", muted: "#6b6657", white: "#1c1709",
    },
  },
  {
    id: "pergaminho",
    nome: "Pergaminho",
    descricao: "Tema claro quente — para leitura prolongada",
    claro: true,
    cores: {
      bg: "#fdf8f1", surface: "#f4ebdb", card: "#ebe0c9",
      border: "#cfbe96", accent: "#c2410c", purple: "#9a3412",
      green: "#15803d", red: "#b91c1c", yellow: "#a16207",
      text: "#2a2118", muted: "#6e5e45", white: "#1a1410",
    },
  },
  {
    id: "grafite",
    nome: "Grafite",
    descricao: "Cinza neutro profundo — foco total, sem preto absoluto",
    claro: false,
    cores: {
      // Sem preto absoluto (DESIGN_STANDARDS.md §7): cinzas profundos em vez
      // de #000/#0a0a0a, para reduzir o contraste agressivo e o "smearing"
      // em telas OLED. Mantem a neutralidade total (sem matiz).
      bg: "#161618", surface: "#1f1f22", card: "#27272b",
      border: "#34343a", accent: "#fafafa", purple: "#d4d4d4",
      green: "#22c55e", red: "#ef4444", yellow: "#f59e0b",
      text: "#fafafa", muted: "#a3a3a3", white: "#ffffff",
    },
  },
  {
    id: "escuro-ouro",
    nome: "Escuro Ouro",
    descricao: "Preto & ouro — a identidade da marca no escuro",
    claro: false,
    cores: {
      // Contraparte escura do tema Claro: fundo quente quase-preto (sem preto
      // absoluto) + acento OURO metálico do logo. Em fundo escuro o ouro brilha
      // (não precisa ser escurecido como no claro), então usamos o ouro vivo
      // #D4AF37 / #E8C766. A tinta dos botões sai escura via inkDoAccent (o tom
      // claro do gradiente manda), dando folha-de-ouro + texto grafite.
      bg: "#141210", surface: "#1e1b16", card: "#27231c",
      border: "#3a3326", accent: "#D4AF37", purple: "#E8C766",
      green: "#22c55e", red: "#ef4444", yellow: "#f59e0b",
      text: "#f3ede0", muted: "#9b927e", white: "#ffffff",
    },
  },
];

// Cores rapidas para o picker de "cor de destaque" (override de --accent).
export const ACENTOS: Acento[] = [
  { nome: "Padrão do tema", valor: null },
  { nome: "Azul",           valor: "#4f8ef7" },
  { nome: "Esmeralda",      valor: "#10b981" },
  { nome: "Roxo",           valor: "#a855f7" },
  { nome: "Âmbar",          valor: "#f59e0b" },
  { nome: "Coral",          valor: "#ff6f61" },
];

// Paleta canonica usada em toda a UI. Cada chave resolve para uma var CSS
// definida no :root e sobrescrita pelo tema atual.
export const C: Record<keyof TemaCores, string> = {
  bg: "var(--bg)",
  surface: "var(--surface)",
  card: "var(--card)",
  border: "var(--border)",
  accent: "var(--accent)",
  purple: "var(--purple)",
  green: "var(--green)",
  red: "var(--red)",
  yellow: "var(--yellow)",
  text: "var(--text)",
  muted: "var(--muted)",
  white: "var(--white)",
};

// Estado completo de aparencia (tema + ajustes finos).
export const APARENCIA_PADRAO: AparenciaEstado = {
  tema: TEMA_PADRAO,
  acento: null,                 // override de cor (hex) ou null = usar do tema
  densidade: "padrao",          // compacto | padrao | confortavel
  fontSize: 14,                 // 13..18
  radius: 10,                   // 6 | 10 | 16
  reduzirMovimento: false,
  sublinharLinks: false,
  sincronizar: true,
  modoAutomatico: "off",        // off | sunset | custom
};

export function getTema(id: string | undefined | null): Tema {
  return TEMAS.find((t) => t.id === id) || TEMAS[0];
}

// Converte hex em luminancia relativa para escolher cor de texto contrastante.
function luma(hex: string | undefined | null): number {
  if (!hex || typeof hex !== "string") return 0;
  const c = hex.replace("#", "");
  if (c.length < 6) return 0;
  const r = parseInt(c.substr(0, 2), 16) / 255;
  const g = parseInt(c.substr(2, 2), 16) / 255;
  const b = parseInt(c.substr(4, 2), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Cor de texto contrastante para uso sobre o accent (botao primario, badges).
// Usada em pdv.css e em qualquer componente que pinte com var(--accent-ink).
function corDeContraste(hex: string): string {
  return luma(hex) > 0.55 ? "#06291e" : "#ffffff";
}

// Tinta do texto sobre os botoes primarios. Eles usam um gradiente
// accent -> purple, entao o ponto mais CLARO do gradiente e quem decide a
// legibilidade: calculamos o contraste a partir do tom mais claro dos dois.
// Isso conserta casos como Grafite (accent #fafafa quase branco) e os temas
// ouro (gradiente dourado claro), onde tinta branca ficava ilegivel.
function inkDoAccent(accent: string, purple: string): string {
  const base = luma(purple) > luma(accent) ? purple : accent;
  return corDeContraste(base);
}

// Aplica o tema escrevendo as variaveis CSS no :root. O browser repinta
// automaticamente todos os componentes que usam var(--*).
export function aplicarTema(id: string): void {
  const tema = getTema(id);
  const root = document.documentElement;
  for (const [chave, valor] of Object.entries(tema.cores)) {
    root.style.setProperty(`--${chave}`, valor);
  }
  root.style.setProperty("--accent-ink", inkDoAccent(tema.cores.accent, tema.cores.purple));
  root.dataset.tema = tema.id;
  root.dataset.brilho = tema.claro ? "claro" : "escuro";
}

// Sobrescreve --accent com uma cor escolhida pelo usuario, ou volta para a
// cor do tema atual se acento for null.
export function aplicarAcento(temaId: string, acento: string | null): void {
  const root = document.documentElement;
  if (acento) {
    root.style.setProperty("--accent", acento);
    // Para botoes primarios (gradient accent->purple) tambem ajustamos purple
    // para combinar — usuario percebe o override como "cor unica".
    root.style.setProperty("--purple", acento);
    root.style.setProperty("--accent-ink", corDeContraste(acento));
  } else {
    const tema = getTema(temaId);
    root.style.setProperty("--accent", tema.cores.accent);
    root.style.setProperty("--purple", tema.cores.purple);
    root.style.setProperty("--accent-ink", inkDoAccent(tema.cores.accent, tema.cores.purple));
  }
}

export function aplicarDensidade(densidade: string | null | undefined): void {
  document.body.dataset.densidade = densidade || "padrao";
}

export function aplicarFontSize(px: number | string): void {
  const valor = Math.min(18, Math.max(13, Number(px) || 14));
  document.documentElement.style.setProperty("--font-base", valor + "px");
  document.body.style.fontSize = valor + "px";
}

export function aplicarRadius(px: number | string): void {
  const valor = [6, 10, 16].includes(Number(px)) ? Number(px) : 10;
  const root = document.documentElement;
  root.style.setProperty("--radius-md", valor + "px");
  root.style.setProperty("--radius-lg", (valor + 4) + "px");
  root.style.setProperty("--radius-sm", Math.max(4, valor - 4) + "px");
}

export function aplicarMovimento(reduzido: boolean): void {
  document.body.dataset.movimento = reduzido ? "reduzido" : "normal";
}

export function aplicarSublinhado(ativo: boolean): void {
  document.body.dataset.sublinhar = ativo ? "true" : "false";
}

// Aplica o estado de aparencia completo (chama todas as funcoes acima).
export function aplicarAparencia(estado: Partial<AparenciaEstado> | null | undefined): void {
  const e: AparenciaEstado = { ...APARENCIA_PADRAO, ...(estado || {}) };
  aplicarTema(e.tema);
  aplicarAcento(e.tema, e.acento);
  aplicarDensidade(e.densidade);
  aplicarFontSize(e.fontSize);
  aplicarRadius(e.radius);
  aplicarMovimento(e.reduzirMovimento);
  aplicarSublinhado(e.sublinharLinks);
}

// --- Persistencia ---------------------------------------------------------

export function lerAparencia(): AparenciaEstado {
  // Compatibilidade: se ainda existir gestao_tema antigo, migra para v1.
  try {
    const raw = localStorage.getItem(PREF_APARENCIA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...APARENCIA_PADRAO, ...parsed };
    }
    const temaLegado = localStorage.getItem(PREF_TEMA_KEY);
    if (temaLegado) {
      return { ...APARENCIA_PADRAO, tema: temaLegado };
    }
  } catch {
    /* localStorage indisponivel */
  }
  return { ...APARENCIA_PADRAO };
}

// Debounce do PUT remoto: o usuario pode arrastar sliders (fontSize, radius)
// e disparar dezenas de salvarAparencia em 1 segundo. Acumulamos e enviamos
// 500ms depois do ultimo evento. localStorage continua sincrono — UI nao
// espera a rede.
let timerSyncAparencia: ReturnType<typeof setTimeout> | null = null;
function syncAparenciaRemoto(estado: AparenciaEstado): void {
  if (!getToken()) return; // sem sessao, sem sync remoto
  if (timerSyncAparencia) clearTimeout(timerSyncAparencia);
  timerSyncAparencia = setTimeout(() => {
    api.salvarPreferencias({ aparencia: estado }).catch(() => {
      /* best-effort: localStorage ja tem o valor */
    });
  }, 500);
}

export function salvarAparencia(estado: AparenciaEstado): void {
  try { localStorage.setItem(PREF_APARENCIA_KEY, JSON.stringify(estado)); } catch { /* ignore */ }
  try { localStorage.setItem(PREF_TEMA_KEY, estado.tema); } catch { /* ignore */ }
  if (estado.sincronizar !== false) syncAparenciaRemoto(estado);
}

// Aplica aparencia vinda do backend (login/me) sobre o que estava em
// localStorage. Usado uma vez no boot apos carregar a sessao — garante que
// trocar de maquina/navegador recupera as preferencias do usuario.
// Importante: nao re-dispara PUT para o backend (caso contrario, multiplas
// abas/dispositivos ficariam em loop de sync).
export function hidratarAparenciaDoUser(remoto: Partial<AparenciaEstado> | null | undefined): void {
  if (!remoto || typeof remoto !== "object") return;
  const atual = lerAparencia();
  const mesclada: AparenciaEstado = { ...atual, ...remoto };
  try { localStorage.setItem(PREF_APARENCIA_KEY, JSON.stringify(mesclada)); } catch { /* ignore */ }
  try { localStorage.setItem(PREF_TEMA_KEY, mesclada.tema); } catch { /* ignore */ }
  aplicarAparencia(mesclada);
}

// API legada — mantida porque AparenciaModal e outros locais ainda chamam.
export function lerTemaSalvo(): string {
  return lerAparencia().tema;
}

export function salvarTema(id: string): void {
  const atual = lerAparencia();
  salvarAparencia({ ...atual, tema: id });
}

// Chamado no boot do app (main.jsx) para hidratar a aparencia antes do
// primeiro render — evita flash de tema padrao quando o usuario salvou outro.
export function inicializarTema(): void {
  aplicarAparencia(lerAparencia());
}
