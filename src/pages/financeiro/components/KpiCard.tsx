import Icon, { type IconName } from "./icons";
import Sparkline from "./Sparkline";

export type KpiTone = "amber" | "coral" | "iris" | "emerald";
export type DeltaDir = "up" | "down" | "flat";

export interface KpiData {
  id: string;
  label: string;
  icon: IconName | string;
  tone: KpiTone | string;
  value: string;
  cents: string;
  delta?: string;
  deltaDir?: DeltaDir;
  sparkPath?: string;
  footLeft?: string;
  footPill?: string;
  progress?: number | null;
}

interface ToneMeta {
  color: string;
  intClass: string;
  bg: string;
  border: string;
  bar: string;
}

const TONES: Record<KpiTone, ToneMeta> = {
  amber:   { color: "oklch(0.82 0.13 78)",  intClass: "text-amber2",   bg: "oklch(0.82 0.13 78 / .14)",  border: "oklch(0.82 0.13 78 / .25)",  bar: "linear-gradient(90deg, var(--amber), oklch(0.84 0.12 100))" },
  coral:   { color: "oklch(0.74 0.14 22)",  intClass: "text-coral",    bg: "oklch(0.74 0.14 22 / .16)",  border: "oklch(0.74 0.14 22 / .25)",  bar: "linear-gradient(90deg, var(--coral), oklch(0.80 0.12 50))" },
  iris:    { color: "oklch(0.74 0.13 286)", intClass: "text-fg",       bg: "oklch(0.74 0.13 286 / .16)", border: "oklch(0.74 0.13 286 / .25)", bar: "linear-gradient(90deg, var(--iris), oklch(0.78 0.12 235))" },
  emerald: { color: "oklch(0.80 0.13 158)", intClass: "text-emerald2", bg: "oklch(0.80 0.13 158 / .14)", border: "oklch(0.80 0.13 158 / .25)", bar: "linear-gradient(90deg, var(--emerald), oklch(0.84 0.12 180))" },
};

interface KpiCardProps {
  kpi: KpiData;
  active?: boolean;
  onClick?: () => void;
}

export default function KpiCard({ kpi, active, onClick }: KpiCardProps) {
  const tone = TONES[kpi.tone as KpiTone] || TONES.iris;
  const interactive = !!onClick;

  const cardBg = active
    ? `radial-gradient(120% 100% at 0% 0%, ${tone.bg}, transparent 65%), linear-gradient(180deg, oklch(1 0 0 / .04), oklch(1 0 0 / 0)), var(--surface-2)`
    : kpi.tone === "coral"
      ? "radial-gradient(120% 100% at 0% 0%, oklch(0.32 0.10 22 / .22), transparent 55%), linear-gradient(180deg, oklch(1 0 0 / .035), oklch(1 0 0 / 0)), var(--surface)"
      : "linear-gradient(180deg, oklch(1 0 0 / .025), oklch(1 0 0 / 0)), var(--surface)";

  const Tag = interactive ? "button" : "div";

  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={onClick}
      aria-pressed={interactive ? !!active : undefined}
      className={[
        "relative w-full text-left rounded-card p-[12px_16px_11px] border shadow-card overflow-hidden isolate transition",
        active ? "border-iris/55" : "border-hairline-soft",
        interactive ? "hover:border-iris/40 hover:brightness-105 cursor-pointer focus:outline-none focus:ring-2 focus:ring-iris/40" : "",
      ].join(" ")}
      style={{ background: cardBg }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[.14em] text-fg-muted font-medium">
          <span
            className="w-[20px] h-[20px] rounded-[6px] inline-flex items-center justify-center"
            style={{ background: tone.bg, border: `1px solid ${tone.border}`, color: tone.color }}
          >
            <Icon name={kpi.icon} className="w-3 h-3" />
          </span>
          {kpi.label}
        </div>
        {kpi.delta && <DeltaPill delta={kpi.delta} dir={kpi.deltaDir} />}
      </div>

      <div className="flex items-baseline font-medium tracking-[-0.025em]">
        <span className="font-mono text-[11.5px] text-fg-muted mr-1 -translate-y-[5px]">R$</span>
        <span className={`font-mono text-[24px] font-medium leading-none ${tone.intClass}`}>{kpi.value}</span>
        <span className="font-mono text-[13px] text-fg-muted font-medium ml-0.5">,{kpi.cents}</span>
      </div>

      {kpi.sparkPath && (
        <Sparkline d={kpi.sparkPath} color={tone.color} gradientId={`g-${kpi.id}`} />
      )}

      <div className="flex items-center justify-between mt-2 text-[11px] text-fg-faint">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate">{kpi.footLeft}</span>
          {kpi.footPill && (
            <span className="font-mono text-[10.5px] px-[6px] py-0.5 rounded bg-white/[.04] text-fg-soft">
              {kpi.footPill}
            </span>
          )}
        </div>
        {kpi.progress != null && (
          <div
            className="w-[64px] h-[3px] rounded-full overflow-hidden bg-white/[.05] relative flex-none ml-2"
            aria-label="cobertura"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${kpi.progress}%`, background: tone.bar }}
            />
          </div>
        )}
      </div>
    </Tag>
  );
}

function DeltaPill({ delta, dir }: { delta: string; dir?: DeltaDir }) {
  const cls =
    dir === "up"
      ? "text-emerald2"
      : dir === "down"
      ? "text-coral"
      : "text-fg-muted";
  const bg =
    dir === "up"
      ? "oklch(0.80 0.13 158 / .14)"
      : dir === "down"
      ? "oklch(0.74 0.14 22 / .16)"
      : "oklch(1 0 0 / .03)";
  const border = dir === "flat" ? "1px solid var(--hairline-soft)" : "none";
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[11px] px-[7px] py-[3px] rounded-full ${cls}`}
      style={{ background: bg, border }}
    >
      {delta}
    </span>
  );
}
