interface TopbarProps {
  user?: string;
  initials?: string;
}

export default function Topbar({ user = "", initials = "" }: TopbarProps) {
  const nome = user || "Usuário";
  const ini = initials || (nome.charAt(0) || "?").toUpperCase();
  return (
    <div className="flex items-center justify-between gap-6 pb-4 border-b border-hairline-soft">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-fg-muted">
        <span
          className="w-1.5 h-1.5 rounded-full bg-emerald2"
          style={{ boxShadow: "0 0 0 4px oklch(0.80 0.13 158 / .12)" }}
          aria-hidden="true"
        />
        <span className="text-fg-soft">{nome}</span>
      </div>

      <div
        className="w-7 h-7 rounded-full inline-flex items-center justify-center text-white text-[11px] font-semibold border border-white/10"
        style={{ background: "linear-gradient(135deg, oklch(0.55 0.14 286), oklch(0.55 0.13 200))" }}
      >
        {ini}
      </div>
    </div>
  );
}
