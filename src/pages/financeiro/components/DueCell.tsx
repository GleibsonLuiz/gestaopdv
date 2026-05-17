type DueState = "late" | "today" | "soon" | "paid";

const TONE: Record<DueState, string> = {
  late:  "text-coral",
  today: "text-amber2",
  soon:  "text-fg-muted",
  paid:  "text-emerald2",
};

interface DueCellProps {
  date: string;
  rel: string;
  state: DueState;
}

export default function DueCell({ date, rel, state }: DueCellProps) {
  return (
    <div className="flex flex-col gap-px font-mono">
      <span className="text-fg text-[13px]">{date}</span>
      <span className={`text-[11px] ${TONE[state] || "text-fg-faint"}`}>{rel}</span>
    </div>
  );
}
