type StatusKey = "late" | "pending" | "paid" | "soon" | "canceled";

interface StatusMeta {
  label: string;
  color: string;
  bg: string;
}

const MAP: Record<StatusKey, StatusMeta> = {
  late:     { label: "Atrasada",  color: "var(--coral)",   bg: "oklch(0.74 0.14 22 / .16)" },
  pending:  { label: "Pendente",  color: "var(--amber)",   bg: "oklch(0.82 0.13 78 / .14)" },
  paid:     { label: "Paga",      color: "var(--emerald)", bg: "oklch(0.80 0.13 158 / .14)" },
  soon:     { label: "Em breve",  color: "var(--sky)",     bg: "oklch(0.55 0.11 235 / .14)" },
  canceled: { label: "Cancelada", color: "var(--fg-muted)", bg: "oklch(1 0 0 / .04)"       },
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
