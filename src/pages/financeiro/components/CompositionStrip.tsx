function fmtBRL(v: unknown): string {
  const n = Number(v) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface CompositionStripProps {
  pendente?: number;
  atrasado?: number;
  pago?: number;
  vencendo?: number;
  vencendoQtd?: number;
  ehPagar?: boolean;
}

interface Segmento {
  id: "atrasado" | "pendente" | "pago";
  label: string;
  color: string;
  value: number;
  p: number;
}

export default function CompositionStrip({
  pendente = 0,
  atrasado = 0,
  pago = 0,
  vencendo = 0,
  vencendoQtd = 0,
  ehPagar = true,
}: CompositionStripProps) {
  const total = pendente + atrasado + pago;
  const pct = (n: number): number => (total > 0 ? (n / total) * 100 : 0);

  const segs: Segmento[] = ([
    { id: "atrasado", label: "Atrasado",                  color: "var(--coral)",   value: atrasado, p: pct(atrasado) },
    { id: "pendente", label: "Pendente",                  color: "var(--amber)",   value: pendente, p: pct(pendente) },
    { id: "pago",     label: ehPagar ? "Pago" : "Recebido", color: "var(--emerald)", value: pago,     p: pct(pago) },
  ] as Segmento[]).filter((s) => s.value > 0);

  return (
    <div className="bg-surface border border-hairline-soft rounded-card shadow-card p-[14px_18px] mb-6">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[.14em] text-fg-muted font-medium">
          Composição do total
          <span className="font-mono text-[11px] tnum px-1.5 py-0.5 rounded-full bg-white/[.04] text-fg-soft border border-hairline-soft normal-case tracking-normal">
            {fmtBRL(total)}
          </span>
        </div>
        {vencendo > 0 && (
          <div className="flex items-center gap-1.5 text-[11.5px] text-iris font-mono">
            <span
              className="w-1.5 h-1.5 rounded-full bg-iris"
              style={{ boxShadow: "0 0 0 3px oklch(0.74 0.13 286 / .22)" }}
            />
            {vencendoQtd} {vencendoQtd === 1 ? "vence" : "vencem"} em 7 d · {fmtBRL(vencendo)}
          </div>
        )}
      </div>

      <div
        className="h-2 rounded-full overflow-hidden flex gap-px"
        style={{ background: "oklch(1 0 0 / .04)" }}
        role="img"
        aria-label="Composição do total"
      >
        {total === 0 ? (
          <div className="w-full" />
        ) : segs.map((s) => (
          <span
            key={s.id}
            className="h-full transition-all"
            style={{
              width: `${s.p}%`,
              background: `linear-gradient(180deg, ${s.color}, color-mix(in oklch, ${s.color} 70%, black))`,
            }}
            title={`${s.label}: ${fmtBRL(s.value)} (${s.p.toFixed(1)}%)`}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-2.5 text-[11.5px]">
        {segs.length === 0 ? (
          <span className="text-fg-faint">Nenhum lançamento ativo no período.</span>
        ) : segs.map((s) => (
          <div key={s.id} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
            <span className="text-fg-soft">{s.label}</span>
            <span className="font-mono text-fg tnum">{fmtBRL(s.value)}</span>
            <span className="font-mono text-fg-faint tnum">· {s.p.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
