// AmountCell — célula de valor monetário no padrão executivo:
// "R$" pequeno e esmaecido · inteiro em mono · centavos menores.
// Alinha à direita por padrão (uso em colunas numéricas de tabela).
// Promovido de src/pages/financeiro/components (Fase 3).

interface AmountCellProps {
  value: string | number; // parte inteira já formatada (ex: "1.234")
  cents: string | number; // centavos (ex: "90")
  dim?: boolean; // valor secundário/esmaecido
  prefix?: string; // default "R$"
  tone?: string; // cor opcional para o inteiro (ex: var(--coral) p/ saída)
}

export default function AmountCell({
  value,
  cents,
  dim = false,
  prefix = "R$",
  tone,
}: AmountCellProps) {
  const intCls = dim ? "text-fg-muted font-normal" : "text-fg font-medium";
  return (
    <div className="inline-flex items-baseline justify-end font-mono tabular-nums">
      <span className="text-[11px] text-fg-faint mr-1">{prefix}</span>
      <span className={`text-sm ${intCls}`} style={tone ? { color: tone } : undefined}>
        {value}
      </span>
      <span className="text-xs text-fg-muted">,{cents}</span>
    </div>
  );
}
