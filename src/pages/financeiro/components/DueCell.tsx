type DueState = "late" | "today" | "soon" | "paid";

interface DueCellProps {
  date: string;
  rel: string;
  state: DueState;
}

export default function DueCell({ date, rel, state }: DueCellProps) {
  const isPaid = state === "paid";
  return (
    <div className="flex flex-col gap-px font-mono">
      <span className={isPaid ? "text-fg-muted text-[13px]" : "text-fg text-[13px]"}>
        {date}
      </span>
      <span className="text-[11px] text-fg-faint font-normal">{rel}</span>
    </div>
  );
}
