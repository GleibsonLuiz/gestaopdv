const TONE = {
  late:  'text-coral',
  today: 'text-amber2',
  soon:  'text-fg-muted',
  paid:  'text-emerald2',
};

export default function DueCell({ date, rel, state }) {
  return (
    <div className="flex flex-col gap-px font-mono">
      <span className="text-fg text-[13px]">{date}</span>
      <span className={`text-[11px] ${TONE[state] || 'text-fg-faint'}`}>{rel}</span>
    </div>
  );
}
