interface AmountCellProps {
  value: string | number;
  cents: string | number;
  dim?: boolean;
}

export default function AmountCell({ value, cents, dim = false }: AmountCellProps) {
  const intCls = dim ? "text-fg-muted font-normal" : "text-fg font-medium";
  return (
    <div className="inline-flex items-baseline justify-end font-mono">
      <span className="text-[11px] text-fg-faint mr-1">R$</span>
      <span className={`text-sm ${intCls}`}>{value}</span>
      <span className="text-xs text-fg-muted">,{cents}</span>
    </div>
  );
}
