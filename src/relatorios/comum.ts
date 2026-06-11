// ============ FORMATADORES E ROTULOS DOS RELATORIOS ============
// Extraidos de Relatorios.tsx no fatiamento (Fase 5). Puros, sem estado.

export const fmtBRL = (v: unknown): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

export const fmtNum = (v: unknown): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR");
};

export const fmtData = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

export const fmtDataHora = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("pt-BR") : "—";

export const fmtPct = (v: unknown): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0,0%";
  return `${n.toFixed(1).replace(".", ",")}%`;
};

export const ROTULO_PAGAMENTO: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  CARTAO_CREDITO: "Cartão crédito",
  CARTAO_DEBITO: "Cartão débito",
  PIX: "Pix",
  BOLETO: "Boleto",
  CREDIARIO: "Crediário",
};

export const ROTULO_STATUS: Record<string, string> = {
  PENDENTE: "Pendente", PAGA: "Paga",
  ATRASADA: "Atrasada", CANCELADA: "Cancelada",
};

// Data de hoje em YYYY-MM-DD no fuso local (para filtros default).
export function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
