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
      <div className="inline-flex gap-1 p-1 bg-surface border border-hairline rounded-xl">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => onChange?.(t.id)}
              className={[
                "px-4 py-2 rounded-[9px] text-[13px] font-medium inline-flex items-center gap-2 transition",
                // Inativo: texto fg-soft (legível em TODOS os temas, ao contrário
                // do fg-muted que sumia no Roxo/Esmeralda) + realce no hover.
                // Ativo: anel na cor de marca (accent — ouro no claro, azul no
                // escuro) + elevação surface-3, inconfundível em qualquer tema.
                on
                  ? "text-fg bg-surface-3"
                  : "text-fg-soft hover:text-fg hover:bg-surface-2",
              ].join(" ")}
              style={on ? {
                boxShadow:
                  "0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent), 0 6px 14px -8px rgba(0,0,0,.5)",
              } : undefined}
            >
              {t.icon && <Icon name={t.icon} />}
              {t.label}
              {t.count != null && (
                <span
                  className={[
                    "font-mono text-[11px] px-1.5 py-px rounded-full border",
                    on
                      ? "text-iris border-transparent"
                      : "text-fg-muted bg-surface-2 border-hairline-soft",
                  ].join(" ")}
                  style={on ? { background: "color-mix(in srgb, var(--iris) 16%, transparent)" } : undefined}
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
          className="h-[38px] px-4 inline-flex items-center gap-2 rounded-[10px] font-semibold text-[13px] transition hover:brightness-[1.04]"
          style={{
            background: "linear-gradient(135deg, var(--accent), var(--purple))",
            color: "var(--accent-ink)",
            boxShadow:
              "0 1px 0 0 oklch(1 0 0 / .28) inset, 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent), 0 6px 16px -10px color-mix(in srgb, var(--accent) 50%, transparent)",
          }}
        >
          <span
            className="w-[18px] h-[18px] rounded-[5px] inline-flex items-center justify-center text-sm leading-none"
            style={{ background: "color-mix(in srgb, var(--accent-ink) 14%, transparent)", color: "var(--accent-ink)" }}
          >
            +
          </span>
          {novoLabel}
        </button>
      )}
    </div>
  );
}
