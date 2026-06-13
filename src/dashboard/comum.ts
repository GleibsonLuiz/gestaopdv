// ============ HELPERS DO DASHBOARD ============
// Extraidos de Dashboard.tsx no fatiamento (Fase 5). Puros, sem estado.

export const FONT_SANS = `"Manrope", "Segoe UI", system-ui, sans-serif`;
export const FONT_MONO = `"JetBrains Mono", ui-monospace, "Courier New", monospace`;

export const fmtBRL = (v: unknown): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

export const fmtBRLSplit = (v: unknown): { reais: string; centavos: string } => {
  const n = Number(v);
  if (!Number.isFinite(n)) return { reais: "—", centavos: "" };
  const fixed = Math.abs(n).toFixed(2);
  const [reais, centavos] = fixed.split(".");
  const reaisFmt = Number(reais).toLocaleString("pt-BR");
  const sinal = n < 0 ? "-" : "";
  return { reais: `${sinal}R$ ${reaisFmt}`, centavos: `,${centavos}` };
};

export const fmtNumero = (v: unknown): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR");
};

export const fmtDataHora = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export const fmtDiaCurto = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

export const fmtDiaSemana = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").toUpperCase();
};

// ---- Serie do grafico de vendas (granularidade variavel: hora/dia/mes) ----
const MESES_CURTOS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

// Rotulo de topo de cada barra (linha em destaque do eixo X).
export function fmtSerieTopo(chave: string, gran: string): string {
  if (gran === "hora") return `${chave}h`;
  if (gran === "mes") {
    const m = Number(String(chave).slice(5, 7)) - 1;
    return MESES_CURTOS[m] || "";
  }
  return fmtDiaSemana(chave);
}

// Rotulo secundario (linha mono abaixo). Para hora fica vazio (poluiria o eixo).
export function fmtSerieBase(chave: string, gran: string): string {
  if (gran === "hora") return "";
  if (gran === "mes") return String(chave).slice(0, 4);
  return fmtDiaCurto(chave);
}

// Rotulo completo usado no tooltip da barra.
export function fmtSerieTooltip(chave: string, gran: string): string {
  if (gran === "hora") return `${String(chave).padStart(2, "0")}:00 — ${String(chave).padStart(2, "0")}:59`;
  if (gran === "mes") {
    const m = Number(String(chave).slice(5, 7)) - 1;
    return `${MESES_CURTOS[m] || ""}/${String(chave).slice(0, 4)}`;
  }
  return `${fmtDiaSemana(chave)} · ${fmtDiaCurto(chave)}`;
}

export function saudacao(nome: string | null | undefined): string {
  const agora = new Date();
  const h = agora.getHours();
  const periodo = h < 12 ? "bom dia" : h < 18 ? "boa tarde" : "boa noite";
  const primeiro = (nome || "").split(" ")[0] || "";
  return primeiro
    ? `Olá, ${primeiro} — ${periodo}.`
    : `Olá — ${periodo}.`;
}

export const ROTULO_PAGAMENTO: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  CARTAO_CREDITO: "Cartão de crédito",
  CARTAO_DEBITO: "Cartão de débito",
  PIX: "Pix",
  BOLETO: "Boleto",
  CREDIARIO: "Crediário",
};

export const fmtPercentual = (v: unknown): string | null => {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  const sinal = n > 0 ? "+" : "";
  return `${sinal}${n.toFixed(1)}%`;
};

// Arredonda o teto de um eixo de grafico para um "numero bonito" (1/2/2.5/5/10 × 10^n).
export function niceMax(v: unknown): number {
  const n = Math.max(1, Number(v) || 1);
  const exp = Math.floor(Math.log10(n));
  const base = Math.pow(10, exp);
  const ratio = n / base;
  let mult;
  if (ratio <= 1) mult = 1;
  else if (ratio <= 2) mult = 2;
  else if (ratio <= 2.5) mult = 2.5;
  else if (ratio <= 5) mult = 5;
  else mult = 10;
  return mult * base;
}
