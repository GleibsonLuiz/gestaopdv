// Formatadores compartilhados pelos cupons.
// Agora re-exporta do modulo centralizado em src/lib/format.ts.

export { fmtBRL, fmtQtd, fmtDataHora as fmtData } from "../../lib/format";

export type FormaPagamento =
  | "DINHEIRO"
  | "PIX"
  | "CARTAO_DEBITO"
  | "CARTAO_CREDITO"
  | "BOLETO"
  | "CREDIARIO";

export const FORMA_LABEL: Record<FormaPagamento, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "PIX",
  CARTAO_DEBITO: "Débito",
  CARTAO_CREDITO: "Crédito",
  BOLETO: "Boleto",
  CREDIARIO: "Crediário",
};
