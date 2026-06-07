// Tons semânticos do padrão executivo (ver §1 do DESIGN_STANDARDS.md).
//
// Cada tom resolve para um token GLOBAL de status (definidos no :root em
// index.css, derivados das cores do tema). Por isso reagem automaticamente
// aos 6 temas — claro e escuro. As variantes de fundo/borda são geradas com
// color-mix em runtime (translucidez sobre qualquer fundo de tema).

export type Tone = "emerald" | "amber" | "coral" | "iris" | "sky";

const TONE_VAR: Record<Tone, string> = {
  emerald: "--emerald",
  amber: "--amber",
  coral: "--coral",
  iris: "--iris",
  sky: "--sky",
};

export interface ToneCss {
  color: string; // cor cheia (texto/ícone)
  bg: string; // fundo translúcido
  border: string; // borda translúcida
}

// Resolve um tom para as 3 cores CSS (com fallback para iris se inválido).
export function tone(t: Tone | string): ToneCss {
  const v = TONE_VAR[(t as Tone)] || TONE_VAR.iris;
  const base = `var(${v})`;
  return {
    color: base,
    bg: `color-mix(in srgb, ${base} 14%, transparent)`,
    border: `color-mix(in srgb, ${base} 25%, transparent)`,
  };
}

// Classe utilitária Tailwind de texto por tom (para quando se prefere classe a
// style inline). Mapeiam os aliases do tailwind.config.js (emerald2, etc).
export const TONE_TEXT_CLASS: Record<Tone, string> = {
  emerald: "text-emerald2",
  amber: "text-amber2",
  coral: "text-coral",
  iris: "text-iris",
  sky: "text-sky2",
};
