import { useEffect, type ReactNode } from "react";

interface ModalShellProps {
  titulo: string;
  subtitulo?: string;
  largura?: number;
  bloquearEsc?: boolean;
  onFechar: () => void;
  children: ReactNode;
}

export default function ModalShell({
  titulo, subtitulo, largura = 520, bloquearEsc, onFechar, children,
}: ModalShellProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !bloquearEsc) onFechar();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [bloquearEsc, onFechar]);

  return (
    <div
      onClick={() => !bloquearEsc && onFechar()}
      className="financeiro-bg fixed inset-0 z-[120] flex items-center justify-center p-5"
      style={{ background: "rgba(0, 0, 0, .65)", backdropFilter: "blur(4px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-2 border border-hairline rounded-card shadow-card w-full max-h-[92vh] overflow-y-auto"
        style={{ maxWidth: largura }}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-hairline-soft bg-surface-2/95 backdrop-blur">
          <div className="min-w-0">
            <h2 className="m-0 text-[17px] font-semibold tracking-[-0.015em] text-fg">{titulo}</h2>
            {subtitulo && (
              <p className="m-0 mt-1 text-[12.5px] text-fg-muted">{subtitulo}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={bloquearEsc}
            className="w-8 h-8 -mr-1 inline-flex items-center justify-center rounded-[8px] text-fg-muted hover:text-fg hover:bg-white/[.05] transition disabled:opacity-40"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Campo({
  label, hint, erro, children, span,
}: {
  label: string;
  hint?: string;
  erro?: string;
  span?: 1 | 2 | 3;
  children: ReactNode;
}) {
  return (
    <label className={["block mb-3.5", span === 2 ? "col-span-2" : span === 3 ? "col-span-3" : ""].join(" ")}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[11.5px] font-medium text-fg-muted uppercase tracking-[.1em]">{label}</span>
        {hint && <span className="text-[10.5px] text-fg-faint font-mono">{hint}</span>}
      </div>
      {children}
      {erro && <div className="mt-1 text-[11px] font-mono text-coral">{erro}</div>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full h-10 px-3 rounded-[9px] border border-hairline-soft bg-white/[.02] text-fg text-[13px]",
        "placeholder:text-fg-faint outline-none transition",
        "focus:border-iris focus:bg-white/[.04]",
        props.className || "",
      ].join(" ")}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        "w-full h-10 px-3 rounded-[9px] border border-hairline-soft bg-white/[.02] text-fg text-[13px]",
        "outline-none transition focus:border-iris focus:bg-white/[.04]",
        props.className || "",
      ].join(" ")}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full px-3 py-2.5 rounded-[9px] border border-hairline-soft bg-white/[.02] text-fg text-[13px]",
        "placeholder:text-fg-faint outline-none resize-y font-sans",
        "focus:border-iris focus:bg-white/[.04]",
        props.className || "",
      ].join(" ")}
    />
  );
}

export function BtnPrimario({
  children, disabled, type = "button", onClick, tone = "iris",
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  tone?: "iris" | "emerald" | "coral";
}) {
  // tone padrão ("iris") = ação primária → segue o accent do tema (ouro no
  // modo claro, azul no escuro). emerald/coral permanecem semânticos
  // (Receber/Pagar) — chips saturados com tinta escura, iguais em qualquer tema.
  const grad = tone === "emerald"
    ? "linear-gradient(180deg, oklch(0.80 0.13 158), oklch(0.55 0.14 158))"
    : tone === "coral"
    ? "linear-gradient(180deg, oklch(0.74 0.14 22), oklch(0.55 0.16 22))"
    : "linear-gradient(135deg, var(--accent), var(--purple))";
  const ink = tone === "iris" ? "var(--accent-ink)" : "oklch(0.12 0.02 286)";
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="h-10 px-5 inline-flex items-center gap-2 rounded-[9px] font-semibold text-[13px] transition hover:brightness-105 disabled:opacity-50"
      style={{ background: grad, color: ink }}
    >
      {children}
    </button>
  );
}

export function BtnSecundario({
  children, disabled, type = "button", onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="h-10 px-4 inline-flex items-center gap-2 rounded-[9px] border border-hairline bg-white/[.02] hover:bg-white/[.05] text-fg-soft text-[13px] font-medium transition disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function Alerta({ tipo = "erro", children }: { tipo?: "erro" | "ok"; children: ReactNode }) {
  const cls = tipo === "ok"
    ? "bg-emerald2/15 border-emerald2/40 text-emerald2"
    : "bg-coral/15 border-coral/40 text-coral";
  return (
    <div className={["mt-3 px-3.5 py-2.5 rounded-[8px] border text-[12.5px]", cls].join(" ")}>
      {children}
    </div>
  );
}
