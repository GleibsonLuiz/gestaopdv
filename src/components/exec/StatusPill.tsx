// StatusPill — selo de estado no padrão executivo (ponto + rótulo em caixa-alta).
// Theme-aware: usa os tons globais (color-mix), funciona em qualquer tela/tema.
// Promovido e generalizado de src/pages/financeiro/components (Fase 3).

import { tone, type Tone } from "./tones";

export interface StatusMeta {
  label: string;
  tone: Tone;
}

// Estados financeiros prontos (compatível com o uso original do financeiro).
const PRESETS: Record<string, StatusMeta> = {
  late: { label: "Atrasada", tone: "coral" },
  pending: { label: "Pendente", tone: "amber" },
  paid: { label: "Paga", tone: "emerald" },
  soon: { label: "Em breve", tone: "sky" },
  canceled: { label: "Cancelada", tone: "iris" },
};

interface StatusPillProps {
  // Use um preset ("late"|"pending"|"paid"|"soon"|"canceled") OU passe
  // label+tone explicitamente para estados de outros domínios.
  status?: string;
  label?: string;
  tone?: Tone;
}

export default function StatusPill({ status, label, tone: toneProp }: StatusPillProps) {
  const meta: StatusMeta =
    (status && PRESETS[status]) ||
    ({ label: label ?? status ?? "—", tone: toneProp ?? "amber" } as StatusMeta);
  const finalLabel = label ?? meta.label;
  const t = tone(toneProp ?? meta.tone);

  return (
    <span
      className="inline-flex items-center gap-1.5 px-[9px] py-1 rounded-full font-mono text-[10.5px] uppercase tracking-[.08em]"
      style={{ color: t.color, background: t.bg }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full bg-current"
        style={{ boxShadow: "0 0 0 3px color-mix(in srgb, currentColor 22%, transparent)" }}
      />
      {finalLabel}
    </span>
  );
}
