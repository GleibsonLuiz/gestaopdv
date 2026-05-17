import Icon, { type IconName } from "./icons";

export interface TabDef {
  id: string;
  label: string;
  icon?: IconName | string;
  count?: number;
}

interface TabsBarProps {
  tabs: TabDef[];
  active: string;
  onChange?: (id: string) => void;
  onNew?: () => void;
  novoLabel?: string;
}

export default function TabsBar({ tabs, active, onChange, onNew, novoLabel = "Nova conta a pagar" }: TabsBarProps) {
  return (
    <div className="flex items-center justify-between gap-6 pt-2 pb-6">
      <div
        className="inline-flex gap-1 p-1 bg-white/[.025] border border-hairline-soft rounded-xl"
        role="tablist"
      >
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => onChange?.(t.id)}
              className={[
                "px-4 py-2 rounded-[9px] text-[13px] font-medium inline-flex items-center gap-2 transition",
                on
                  ? "text-fg bg-surface-2 shadow-[0_0_0_1px_var(--hairline),0_6px_14px_-8px_oklch(0_0_0_/.6)]"
                  : "text-fg-muted hover:text-fg-soft",
              ].join(" ")}
            >
              {t.icon && <Icon name={t.icon} />}
              {t.label}
              {t.count != null && (
                <span
                  className={[
                    "font-mono text-[11px] px-1.5 py-px rounded-full border",
                    on
                      ? "text-iris border-transparent"
                      : "text-fg-faint bg-white/[.04] border-hairline-soft",
                  ].join(" ")}
                  style={on ? { background: "oklch(0.76 0.13 286 / .16)" } : undefined}
                >
                  {String(t.count).padStart(2, "0")}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {onNew && (
        <button
          onClick={onNew}
          className="h-[38px] px-4 inline-flex items-center gap-2 rounded-[10px] font-semibold text-[13px] transition hover:brightness-110"
          style={{
            background: "linear-gradient(180deg, oklch(0.78 0.13 286), oklch(0.62 0.16 286))",
            color: "oklch(0.12 0.02 286)",
            boxShadow:
              "0 1px 0 0 oklch(1 0 0 / .25) inset, 0 8px 22px -10px oklch(0.55 0.16 286 / .8)",
          }}
        >
          <span
            className="w-[18px] h-[18px] rounded-[5px] inline-flex items-center justify-center text-sm leading-none"
            style={{ background: "oklch(0.18 0.04 286)", color: "oklch(0.85 0.10 286)" }}
          >
            +
          </span>
          {novoLabel}
        </button>
      )}
    </div>
  );
}
