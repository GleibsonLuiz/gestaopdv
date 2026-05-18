// Formatadores compartilhados pelos cupons. Replicam fmtBRL/fmtData do PDV
// para evitar acoplar /components/cupons a PDV.jsx.

export const fmtBRL = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

export const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export const FORMA_LABEL = {
  DINHEIRO: "Dinheiro",
  PIX: "PIX",
  CARTAO_DEBITO: "Débito",
  CARTAO_CREDITO: "Crédito",
  BOLETO: "Boleto",
  CREDIARIO: "Crediário",
};
