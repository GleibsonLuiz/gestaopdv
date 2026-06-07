// Biblioteca de componentes executivos compartilhados (Fase 3 do Guia de Estilo).
// Padrão de relatório estilo Stripe/Salesforce — ver DESIGN_STANDARDS.md.
//
// Uso:
//   import { KpiCard, TabelaExecutiva, ReportHeader } from "@/components/exec";
// (ou caminho relativo: "../components/exec")

export { default as KpiCard } from "./KpiCard";
export type { KpiCardProps, DeltaDir } from "./KpiCard";

export { default as AmountCell } from "./AmountCell";
export { default as StatusPill } from "./StatusPill";
export { default as Sparkline } from "./Sparkline";

export { default as TabelaExecutiva } from "./TabelaExecutiva";
export type { ColunaExec } from "./TabelaExecutiva";

export { default as ReportHeader } from "./ReportHeader";
export type { FiltroAplicado } from "./ReportHeader";

export { tone, TONE_TEXT_CLASS } from "./tones";
export type { Tone, ToneCss } from "./tones";
