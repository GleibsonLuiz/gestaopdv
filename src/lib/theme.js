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
// Para mudar de tema: aplicarTema(id). A escolha persiste em localStorage
// e (TODO) deve ser sincronizada com o backend via PUT /auth/preferencias.

const PREF_TEMA_KEY = "gestao_tema";
const PREF_APARENCIA_KEY = "gestao_aparencia_v1";
export const TEMA_PADRAO = "azul";

// As 6 paletas. Mesmas chaves em todos os temas — qualquer componente que
// ja usa C continua funcionando, so muda a aparencia.
//
// `white` representa "cor de texto de destaque" (titulos, labels) e nao
// branco literal: em temas claros como pergaminho ele e escuro, para
// preservar contraste contra os fundos claros.
export const TEMAS = [
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
    descricao: "Neutro absoluto — foco e neutralidade total",
    claro: false,
    cores: {
      bg: "#0a0a0a", surface: "#171717", card: "#1f1f1f",
      border: "#2a2a2a", accent: "#fafafa", purple: "#d4d4d4",
      green: "#22c55e", red: "#ef4444", yellow: "#f59e0b",
      text: "#fafafa", muted: "#a3a3a3", white: "#ffffff",
    },
  },
];

// Cores rapidas para o picker de "cor de destaque" (override de --accent).
export const ACENTOS = [
  { nome: "Padrão do tema", valor: null },
  { nome: "Azul",           valor: "#4f8ef7" },
  { nome: "Esmeralda",      valor: "#10b981" },
  { nome: "Roxo",           valor: "#a855f7" },
  { nome: "Âmbar",          valor: "#f59e0b" },
  { nome: "Coral",          valor: "#ff6f61" },
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

// Estado completo de aparencia (tema + ajustes finos).
export const APARENCIA_PADRAO = {
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

export function getTema(id) {
  return TEMAS.find(t => t.id === id) || TEMAS[0];
}

// Converte hex em luminancia relativa para escolher cor de texto contrastante.
function luma(hex) {
  if (!hex || typeof hex !== "string") return 0;
  const c = hex.replace("#", "");
  if (c.length < 6) return 0;
  const r = parseInt(c.substr(0, 2), 16) / 255;
  const g = parseInt(c.substr(2, 2), 16) / 255;
  const b = parseInt(c.substr(4, 2), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
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
  root.dataset.brilho = tema.claro ? "claro" : "escuro";
}

// Sobrescreve --accent com uma cor escolhida pelo usuario, ou volta para a
// cor do tema atual se acento for null.
export function aplicarAcento(temaId, acento) {
  const root = document.documentElement;
  if (acento) {
    root.style.setProperty("--accent", acento);
    // Para botoes primarios (gradient accent->purple) tambem ajustamos purple
    // para combinar — usuario percebe o override como "cor unica".
    root.style.setProperty("--purple", acento);
  } else {
    const tema = getTema(temaId);
    root.style.setProperty("--accent", tema.cores.accent);
    root.style.setProperty("--purple", tema.cores.purple);
  }
}

export function aplicarDensidade(densidade) {
  document.body.dataset.densidade = densidade || "padrao";
}

export function aplicarFontSize(px) {
  const valor = Math.min(18, Math.max(13, Number(px) || 14));
  document.documentElement.style.setProperty("--font-base", valor + "px");
  document.body.style.fontSize = valor + "px";
}

export function aplicarRadius(px) {
  const valor = [6, 10, 16].includes(Number(px)) ? Number(px) : 10;
  const root = document.documentElement;
  root.style.setProperty("--radius-md", valor + "px");
  root.style.setProperty("--radius-lg", (valor + 4) + "px");
  root.style.setProperty("--radius-sm", Math.max(4, valor - 4) + "px");
}

export function aplicarMovimento(reduzido) {
  document.body.dataset.movimento = reduzido ? "reduzido" : "normal";
}

export function aplicarSublinhado(ativo) {
  document.body.dataset.sublinhar = ativo ? "true" : "false";
}

// Aplica o estado de aparencia completo (chama todas as funcoes acima).
export function aplicarAparencia(estado) {
  const e = { ...APARENCIA_PADRAO, ...(estado || {}) };
  aplicarTema(e.tema);
  aplicarAcento(e.tema, e.acento);
  aplicarDensidade(e.densidade);
  aplicarFontSize(e.fontSize);
  aplicarRadius(e.radius);
  aplicarMovimento(e.reduzirMovimento);
  aplicarSublinhado(e.sublinharLinks);
}

// --- Persistencia ---------------------------------------------------------

export function lerAparencia() {
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
  } catch {}
  return { ...APARENCIA_PADRAO };
}

export function salvarAparencia(estado) {
  try { localStorage.setItem(PREF_APARENCIA_KEY, JSON.stringify(estado)); } catch {}
  try { localStorage.setItem(PREF_TEMA_KEY, estado.tema); } catch {}
  // TODO(sync-db): se estado.sincronizar e backend tiver PUT /auth/preferencias,
  //   api.salvarPreferencia({ aparencia: estado }).catch(() => {});
}

// API legada — mantida porque AparenciaModal e outros locais ainda chamam.
export function lerTemaSalvo() {
  return lerAparencia().tema;
}

export function salvarTema(id) {
  const atual = lerAparencia();
  salvarAparencia({ ...atual, tema: id });
}

// Chamado no boot do app (main.jsx) para hidratar a aparencia antes do
// primeiro render — evita flash de tema padrao quando o usuario salvou outro.
export function inicializarTema() {
  aplicarAparencia(lerAparencia());
}
