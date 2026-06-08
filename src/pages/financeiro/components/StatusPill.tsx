type StatusKey = "late" | "pending" | "paid" | "soon" | "canceled";

interface StatusMeta {
  label: string;
  color: string;
  bg: string;
}

// bg derivado da mesma var de status (theme-aware): translúcido sobre o card,
// vira pastel claro nos temas claros e tint escuro nos escuros — sem perder a
// semântica fixa de cor (§1).
const MAP: Record<StatusKey, StatusMeta> = {
  late:     { label: "Atrasada",  color: "var(--coral)",    bg: "color-mix(in srgb, var(--coral) 15%, transparent)"   },
  pending:  { label: "Pendente",  color: "var(--amber)",    bg: "color-mix(in srgb, var(--amber) 14%, transparent)"   },
  paid:     { label: "Paga",      color: "var(--emerald)",  bg: "color-mix(in srgb, var(--emerald) 14%, transparent)" },
  soon:     { label: "Em breve",  color: "var(--sky)",      bg: "color-mix(in srgb, var(--sky) 14%, transparent)"     },
  canceled: { label: "Cancelada", color: "var(--fg-muted)", bg: "color-mix(in srgb, var(--fg-muted) 12%, transparent)" },
};

interface StatusPillProps {
  status: StatusKey | string;
  paidLabel?: string;
}

export default function StatusPill({ status, paidLabel }: StatusPillProps) {
  const s = MAP[status as StatusKey] || MAP.pending;
  const label = status === "paid" && paidLabel ? paidLabel : s.label;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-[9px] py-1 rounded-full font-mono text-[10.5px] uppercase tracking-[.08em]"
      style={{ color: s.color, background: s.bg }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full bg-current"
        style={{ boxShadow: "0 0 0 3px color-mix(in oklch, currentColor 22%, transparent)" }}
      />
      {label}
    </span>
  );
}
