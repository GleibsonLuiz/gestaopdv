// Metadados dos segmentos de negócio (Empresa.segmento).
//
// O segmento adapta a INTERFACE — quais abas/campos extras o cadastro de
// produto mostra e quais atalhos ganham destaque — sem nunca bloquear dados:
// trocar de segmento apenas esconde campos, o que foi gravado permanece.
// Quem libera/bloqueia módulo de verdade é o entitlement do plano
// (modulosHabilitados), não o segmento.
//
// PADARIA / DELICATESSEN / LANCHONETE compartilham o mesmo "kit alimentação"
// (ficha técnica/receita, produção própria, venda por peso, validade) — o
// cliente escolhe o nome que descreve o negócio; o código trata os três
// igual via ehSegmentoAlimentacao().

import type { SegmentoEmpresa } from "./api";

export interface SegmentoInfo {
  label: string;
  icone: string;
  /** Resumo exibido no admin-master / tela Empresa. */
  descricao: string;
}

export const SEGMENTO_INFO: Record<SegmentoEmpresa, SegmentoInfo> = {
  GERAL:        { label: "Geral",        icone: "🏬", descricao: "Sem campos extras de segmento" },
  AUTO_PECAS:   { label: "Auto-Peças",   icone: "🔧", descricao: "Código OEM, marca e compatibilidade no produto" },
  FARMACIA:     { label: "Farmácia",     icone: "💊", descricao: "Lote, validade, registro Anvisa e PMC no produto" },
  PAPELARIA:    { label: "Papelaria",    icone: "📚", descricao: "Sem campos extras de segmento" },
  PADARIA:      { label: "Padaria",      icone: "🥖", descricao: "Receita/ficha técnica, produção própria e validade em dias" },
  DELICATESSEN: { label: "Delicatessen", icone: "🧀", descricao: "Receita/ficha técnica, validade e venda por peso" },
  LANCHONETE:   { label: "Lanchonete",   icone: "🍔", descricao: "Receita/ficha técnica dos lanches e produção própria" },
};

/** Segmentos que ativam o kit alimentação no cadastro de produto. */
export const SEGMENTOS_ALIMENTACAO: ReadonlySet<string> = new Set([
  "PADARIA", "DELICATESSEN", "LANCHONETE",
]);

export function ehSegmentoAlimentacao(segmento?: string | null): boolean {
  return !!segmento && SEGMENTOS_ALIMENTACAO.has(segmento);
}

export function rotuloSegmento(segmento?: string | null): string {
  if (!segmento) return "Geral";
  return SEGMENTO_INFO[segmento as SegmentoEmpresa]?.label || segmento;
}
