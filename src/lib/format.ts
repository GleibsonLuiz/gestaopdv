// Formatadores compartilhados. Centraliza helpers de formatacao de moeda,
// data, quantidade, percentual e tamanho de arquivo que antes eram
// duplicados em dezenas de arquivos do projeto.

/** Moeda BRL. Retorna "—" para valores nao-finitos. */
export function fmtBRL(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Moeda BRL separada em reais/centavos (util para KPI cards). */
export function fmtBRLSplit(v: unknown): { reais: string; centavos: string } {
  const n = Number(v);
  if (!Number.isFinite(n)) return { reais: "—", centavos: "" };
  const fixed = Math.abs(n).toFixed(2);
  const [reais, centavos] = fixed.split(".");
  const reaisFmt = Number(reais).toLocaleString("pt-BR");
  const sinal = n < 0 ? "-" : "";
  return { reais: `${sinal}R$ ${reaisFmt}`, centavos: `,${centavos}` };
}

/** Data curta dd/MM/yyyy. */
export function fmtData(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

/** Data + hora dd/MM/yyyy HH:mm. */
export function fmtDataHora(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Data para <input type="date"> (yyyy-MM-dd). */
export function fmtDataInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return ""; }
}

/** Quantidade fracionaria — ate 3 casas suprimindo zeros. "1.500" → "1,5". */
export function fmtQtd(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/** Numero com separador de milhar. */
export function fmtNum(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR");
}

/** Percentual simples: "12,3%". */
export function fmtPct(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0,0%";
  return `${n.toFixed(1).replace(".", ",")}%`;
}

/** Percentual com sinal: "+12,3%" / "-4,0%". Retorna null se invalido. */
export function fmtPercentual(v: unknown): string | null {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  const sinal = n > 0 ? "+" : "";
  return `${sinal}${n.toFixed(1)}%`;
}

/** Tamanho de arquivo legivel (B / KB / MB). */
export function fmtTamanho(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
