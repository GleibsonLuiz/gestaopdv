// KpiCard — indicador-chave no padrão executivo (anatomia fixa do §4 do
// DESIGN_STANDARDS.md): rótulo em caixa-alta + número-herói mono + sparkline
// opcional + rodapé. Theme-aware via tons globais.
//
// Generalizado de src/pages/financeiro/components (Fase 3): ícone agora é um
// ReactNode opcional (desacoplado do set local) e suporta valores não
// monetários (ex.: quantidades, %) omitindo prefix/cents.

import type { ReactNode } from "react";
import Sparkline from "./Sparkline";
import { tone, type Tone } from "./tones";

export type DeltaDir = "up" | "down" | "flat";

export interface KpiCardProps {
  label: string;
  value: string; // parte inteira já formatada (ex: "12.430")
  cents?: string; // centavos; omitir para valores não monetários
  prefix?: string | null; // default "R$"; null/"" para quantidades/percentuais
  tone?: Tone;
  icon?: ReactNode;
  delta?: string;
  deltaDir?: DeltaDir;
  sparkPath?: string; // path SVG p/ viewBox 200×36
  footLeft?: string;
  footPill?: string;
  progress?: number | null; // 0..100
  active?: boolean;
  onClick?: () => void;
  id?: string; // usado p/ id único do gradiente do sparkline
}

export default function KpiCard({
  label,
  value,
  cents,
  prefix = "R$",
  tone: toneName = "iris",
  icon,
  delta,
  deltaDir,
  sparkPath,
  footLeft,
  footPill,
  progress,
  active,
  onClick,
  id = label,
}: KpiCardProps) {
  const t = tone(toneName);
  const interactive = !!onClick;

  const cardBg = active
    ? `radial-gradient(120% 100% at 0% 0%, ${t.bg}, transparent 65%), linear-gradient(180deg, color-mix(in srgb, var(--white) 4%, transparent), transparent), var(--surface-2)`
    : `linear-gradient(180deg, color-mix(in srgb, var(--white) 2.5%, transparent), transparent), var(--surface)`;

  const Tag = interactive ? "button" : "div";

  return (
    <Tag
      type={interactive ? "button" : undefined}
      onClick={onClick}
      aria-pressed={interactive ? !!active : undefined}
      className={[
        "relative w-full text-left rounded-card p-[12px_16px_11px] border shadow-card overflow-hidden isolate transition",
        active ? "border-iris/55" : "border-hairline-soft",
        interactive
          ? "hover:brightness-105 cursor-pointer focus:outline-none focus:ring-2 focus:ring-iris/40"
          : "",
      ].join(" ")}
      style={{ background: cardBg }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[.14em] text-fg-muted font-medium">
          {icon && (
            <span
              className="w-[20px] h-[20px] rounded-[6px] inline-flex items-center justify-center"
              style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.color }}
            >
              {icon}
            </span>
          )}
          {label}
        </div>
        {delta && <DeltaPill delta={delta} dir={deltaDir} />}
      </div>

      <div className="flex items-baseline font-medium tracking-[-0.025em]">
        {prefix && (
          <span className="font-mono text-[11.5px] text-fg-muted mr-1 -translate-y-[5px]">
            {prefix}
          </span>
        )}
        <span
          className="font-mono tabular-nums text-[24px] font-medium leading-none"
          style={{ color: t.color }}
        >
          {value}
        </span>
        {cents != null && (
          <span className="font-mono tabular-nums text-[13px] text-fg-muted font-medium ml-0.5">
            ,{cents}
          </span>
        )}
      </div>

      {sparkPath && <Sparkline d={sparkPath} color={t.color} gradientId={`spark-${id}`} />}

      {(footLeft || footPill || progress != null) && (
        <div className="flex items-center justify-between mt-2 text-[11px] text-fg-faint">
          <div className="flex items-center gap-2 min-w-0">
            {footLeft && <span className="truncate">{footLeft}</span>}
            {footPill && (
              <span className="font-mono text-[10.5px] px-[6px] py-0.5 rounded bg-white/[.04] text-fg-soft">
                {footPill}
              </span>
            )}
          </div>
          {progress != null && (
            <div
              className="w-[64px] h-[3px] rounded-full overflow-hidden bg-white/[.05] relative flex-none ml-2"
              aria-label="progresso"
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${progress}%`, background: t.color }}
              />
            </div>
          )}
        </div>
      )}
    </Tag>
  );
}

function DeltaPill({ delta, dir }: { delta: string; dir?: DeltaDir }) {
  const cls = dir === "up" ? "text-emerald2" : dir === "down" ? "text-coral" : "text-fg-muted";
  const bg =
    dir === "up"
      ? "color-mix(in srgb, var(--emerald) 14%, transparent)"
      : dir === "down"
        ? "color-mix(in srgb, var(--coral) 16%, transparent)"
        : "color-mix(in srgb, var(--white) 3%, transparent)";
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
