interface TopbarProps {
  user?: string;
  initials?: string;
}

export default function Topbar({ user = "", initials = "" }: TopbarProps) {
  const nome = user || "Usuário";
  const ini = initials || (nome.charAt(0) || "?").toUpperCase();
  return (
    <div className="flex items-center justify-between gap-6 pb-[22px] border-b border-hairline-soft">
      <div className="flex items-center gap-2.5 text-[12.5px] font-medium text-fg-muted">
        <span
          className="w-1.5 h-1.5 rounded-full bg-emerald2 mr-1"
          style={{ boxShadow: "0 0 0 4px oklch(0.80 0.13 158 / .12)" }}
          aria-hidden="true"
        />
        <span>{nome}</span>
        <span className="text-fg-dim">/</span>
        <span>Operações</span>
        <span className="text-fg-dim">/</span>
        <span className="text-fg-soft">Financeiro</span>
      </div>

      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-full inline-flex items-center justify-center text-white text-xs font-semibold border border-white/10"
          style={{ background: "linear-gradient(135deg, oklch(0.55 0.14 286), oklch(0.55 0.13 200))" }}
        >
          {ini}
        </div>
      </div>
    </div>
  );
}
