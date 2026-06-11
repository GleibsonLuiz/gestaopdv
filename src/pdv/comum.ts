import { C } from "../lib/theme";

// ============ CONSTANTES E FORMATADORES COMPARTILHADOS DO PDV ============
// Extraidos de PDV.tsx no fatiamento (Fase 5): usados por NovaVenda,
// ReciboModal, Historico e modais. Sem estado — apenas dados e funcoes puras.

export const FORMAS = [
  { id: "DINHEIRO",        label: "Dinheiro",       icone: "💵", atalho: "F1" },
  { id: "PIX",             label: "PIX",            icone: "⚡", atalho: "F2" },
  { id: "CARTAO_DEBITO",   label: "Débito",         icone: "💳", atalho: "F3" },
  { id: "CARTAO_CREDITO",  label: "Crédito",        icone: "💳", atalho: "F4" },
  { id: "BOLETO",          label: "Boleto",         icone: "🧾", atalho: "F5" },
  { id: "CREDIARIO",       label: "Crediário",      icone: "📒", atalho: "F6" },
] as const;

export const FORMA_LABEL: Record<string, string> =
  Object.fromEntries(FORMAS.map(f => [f.id, f.label]));

// Formas que representam venda a prazo: o cliente (ou operadora) ainda nao
// pagou no ato. O modal de pagamento exibe vencimento + parcelas para
// gerar ContaReceber automatica.
export const FORMAS_GERA_RECEBER = new Set(["CARTAO_CREDITO", "BOLETO", "CREDIARIO"]);

export const FORMA_COR_VAR: Record<string, string> = {
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
export const FORMA_COR_CLASSE: Record<string, string> = {
  DINHEIRO: "pdv-pay-c-emerald",
  PIX: "pdv-pay-c-cyan",
  CARTAO_DEBITO: "pdv-pay-c-sky",
  CARTAO_CREDITO: "pdv-pay-c-amber",
  BOLETO: "pdv-pay-c-violet",
  CREDIARIO: "pdv-pay-c-rose",
};

export const fmtBRL = (v: unknown): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

// Formata quantidade exibindo decimais apenas quando existem (1.5 -> "1,5",
// 2 -> "2"). Bate com Decimal(12,3) do schema (ate 3 casas).
export const fmtQtd = (v: unknown): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
};

export const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export const STATUS_INFO: Record<string, { label: string; cor: string }> = {
  CONCLUIDA: { label: "Concluída", cor: C.green },
  CANCELADA: { label: "Cancelada", cor: C.red },
  PENDENTE:  { label: "Pendente",  cor: C.yellow },
  EM_EDICAO: { label: "Em edição", cor: C.yellow },
};

// Hoje + N dias no formato YYYY-MM-DD usando o fuso LOCAL (toISOString usa
// UTC e pode voltar um dia em fusos negativos como BRT).
export function dataDaqui(diasAFrente: number): string {
  const d = new Date();
  d.setDate(d.getDate() + diasAFrente);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}
