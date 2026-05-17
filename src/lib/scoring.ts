// Helpers para Lead Scoring (CRM).
//
// O score numerico (0-100) e calculado no backend em /clientes/segmentos.
// Aqui apenas mapeamos para visualizacao (cor, icone, label).

export type ClassificacaoScore = "FRIO" | "MORNO" | "QUENTE" | "VIP";

export interface ClassificacaoMeta {
  label: string;
  cor: string;
  icone: string;
  desc: string;
}

export const CLASSIFICACOES_SCORE: Record<ClassificacaoScore, ClassificacaoMeta> = {
  FRIO:   { label: "Frio",   cor: "#64748b", icone: "🥶", desc: "Pouco engajado — baixa prioridade" },
  MORNO:  { label: "Morno",  cor: "#4f8ef7", icone: "😐", desc: "Engajamento medio — vale follow-up" },
  QUENTE: { label: "Quente", cor: "#f97316", icone: "🔥", desc: "Alto engajamento — priorize abordagem" },
  VIP:    { label: "VIP",    cor: "#f59e0b", icone: "🌟", desc: "Cliente premium — atencao especial" },
};

export function classificacaoDoScore(score: number): ClassificacaoScore {
  if (score >= 76) return "VIP";
  if (score >= 51) return "QUENTE";
  if (score >= 26) return "MORNO";
  return "FRIO";
}

// Para mostrar a barra visual: cor que progride conforme o score.
export function corDoScore(score: number): string {
  const cls = classificacaoDoScore(score);
  return CLASSIFICACOES_SCORE[cls].cor;
}
