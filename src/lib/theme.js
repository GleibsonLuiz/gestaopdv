// Sistema de temas via CSS Variables.
//
// Estrategia: cada tema define um conjunto de variaveis CSS aplicadas no
// :root (ex: --bg, --accent). A paleta `C` exportada aqui aponta para essas
// variaveis em vez de literais hex. Como CSS vars sao reativas, basta
// alterar os valores no documentElement e todos os componentes que usam
// `style={{ background: C.bg }}` se atualizam — sem re-render.
//
// Para mudar de tema: aplicarTema(id). A escolha persiste em localStorage
// e (TODO) deve ser sincronizada com o backend via PUT /auth/preferencias.

const PREF_TEMA_KEY = "gestao_tema";
export const TEMA_PADRAO = "azul";

// As 4 paletas. Mesmas chaves em todos os temas — qualquer componente que
// ja usa C continua funcionando, so muda a aparencia.
export const TEMAS = [
  {
    id: "azul",
    nome: "Azul Padrão",
    descricao: "Paleta original — azul + roxo sobre dark slate",
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
    cores: {
      bg: "#000000", surface: "#0d0d0d", card: "#1a1a1a",
      border: "#404040", accent: "#facc15", purple: "#fbbf24",
      green: "#22c55e", red: "#ff4444", yellow: "#facc15",
      text: "#ffffff", muted: "#a3a3a3", white: "#ffffff",
    },
  },
];

// Paleta canonica usada em toda a UI. Cada chave resolve para uma var CSS
// definida no :root e sobrescrita pelo tema atual.
export const C = {
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

export function getTema(id) {
  return TEMAS.find(t => t.id === id) || TEMAS[0];
}

// Aplica o tema escrevendo as variaveis CSS no :root. O browser repinta
// automaticamente todos os componentes que usam var(--*).
export function aplicarTema(id) {
  const tema = getTema(id);
  const root = document.documentElement;
  for (const [chave, valor] of Object.entries(tema.cores)) {
    root.style.setProperty(`--${chave}`, valor);
  }
  root.dataset.tema = tema.id;
}

export function lerTemaSalvo() {
  try { return localStorage.getItem(PREF_TEMA_KEY) || TEMA_PADRAO; }
  catch { return TEMA_PADRAO; }
}

// Persiste em localStorage. Quando o backend tiver PUT /auth/preferencias,
// plugar abaixo (manter localStorage como cache de leitura otimista).
export function salvarTema(id) {
  try { localStorage.setItem(PREF_TEMA_KEY, id); } catch {}
  // TODO(sync-db): sincronizar com Postgres via Prisma:
  //   1. schema.prisma: User.preferencias Json @default("{}")
  //   2. backend: PUT /auth/preferencias { tema: id }
  //   3. api.salvarPreferencia({ tema: id }).catch(() => {});
}

// Chamado no boot do app (main.jsx) para hidratar o tema antes do primeiro
// render — evita flash de tema padrao quando o usuario salvou outro.
export function inicializarTema() {
  aplicarTema(lerTemaSalvo());
}
