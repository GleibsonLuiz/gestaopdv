import { useEffect, useMemo, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { C } from "../lib/theme";

// Modal de cadastro com layout "luxuoso": eyebrow, titulo serif com destaque
// em italico, barra de progresso, fieldsets com legenda em monospace,
// rodape com atalhos. Adapta cores ao tema atual via paleta `C`.
//
// Uso minimo:
//   <FormularioLuxuoso aberto={...} onFechar={...} onSubmit={salvar}
//     titulo="Novo" tituloDestaque="Cliente" subtitulo="..."
//     salvando={salvando} textoSalvar="Criar cliente">
//     <Secao legenda="Identificacao">
//       <Linha>
//         <Campo label="Nome" obrigatorio span={2}><input className="lux-input" .../></Campo>
//       </Linha>
//     </Secao>
//   </FormularioLuxuoso>

let estilosInjetados = false;
function injetarEstilos() {
  if (estilosInjetados) return;
  if (typeof document === "undefined") return;
  // Carrega Cormorant Garamond (titulo serif). Falha silenciosa cai no fallback
  // Georgia/Times definido em --lux-font-display.
  if (!document.getElementById("lux-font-link")) {
    const link = document.createElement("link");
    link.id = "lux-font-link";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,500&display=swap";
    document.head.appendChild(link);
  }
  estilosInjetados = true;
}

// Helper: converte hex/var em rgba com alpha. Como o tema usa CSS vars
// (var(--accent)), nao da pra calcular alpha em JS — entao usamos
// color-mix(in srgb, var(--accent) X%, transparent) que e suportado em
// browsers modernos (Chrome 111+, Safari 16.2+, Firefox 113+).
function mix(cor: string, pct: number): string {
  return `color-mix(in srgb, ${cor} ${pct}%, transparent)`;
}

export interface FormularioLuxuosoProps {
  aberto: boolean;
  onFechar?: () => void;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  titulo: string;
  tituloDestaque?: string;
  subtitulo?: string;
  eyebrow?: string;
  numeroLote?: string;           // ex.: "nº 0428"
  data?: string;                  // ex.: "11.05.2026"
  progresso?: number;             // 0..100 — opcional; se undefined, barra fica oculta
  salvando?: boolean;
  textoSalvar?: string;
  textoSalvando?: string;
  editando?: boolean;
  larguraMax?: number;
  erro?: string;
  /** Modo compacto: reduz paddings/gaps/heights internos pra caber em 90vh sem scroll. */
  compacto?: boolean;
  children?: ReactNode;
}

export function FormularioLuxuoso({
  aberto,
  onFechar,
  onSubmit,
  titulo,
  tituloDestaque,
  subtitulo,
  eyebrow,
  numeroLote,
  data,
  progresso,
  salvando,
  textoSalvar = "Salvar",
  textoSalvando = "Salvando...",
  editando,
  larguraMax = 720,
  erro,
  compacto = false,
  children,
}: FormularioLuxuosoProps) {
  useEffect(() => {
    injetarEstilos();
  }, []);

  // Fecha com ESC quando o modal esta aberto
  useEffect(() => {
    if (!aberto) return;
    function aoTecla(e: KeyboardEvent) {
      if (e.key === "Escape" && !salvando) onFechar?.();
    }
    document.addEventListener("keydown", aoTecla);
    return () => document.removeEventListener("keydown", aoTecla);
  }, [aberto, salvando, onFechar]);

  const estiloCard = useMemo<CSSProperties>(() => ({
    background: `linear-gradient(180deg, ${C.card} 0%, ${C.surface} 100%)`,
    border: `1px solid ${C.border}`,
  }), []);

  if (!aberto) return null;

  return (
    <>
      <style>{`
        .lux-overlay {
          position: fixed; inset: 0;
          background: radial-gradient(1200px 700px at 20% -10%, ${mix(C.accent, 8)}, transparent 60%),
                      radial-gradient(900px 600px at 110% 110%, ${mix(C.purple, 8)}, transparent 55%),
                      rgba(0,0,0,0.72);
          display: grid; place-items: center;
          padding: clamp(8px, 1.6vw, 20px);
          z-index: 100;
          overflow: hidden;
          -webkit-font-smoothing: antialiased;
        }
        .lux-stage {
          width: min(${larguraMax}px, 100%);
          position: relative;
          max-height: 100vh;
          height: 100%;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .lux-eyebrow {
          display: flex; align-items: center; gap: 14px;
          font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
          font-size: 11px; letter-spacing: .22em; text-transform: uppercase;
          color: ${C.muted}; margin: 0 6px 8px;
          flex-shrink: 0;
        }
        .lux-eyebrow .dot {
          width: 6px; height: 6px; border-radius: 999px;
          background: ${C.accent};
          box-shadow: 0 0 0 4px ${mix(C.accent, 14)};
        }
        .lux-eyebrow .grow {
          flex: 1; height: 1px;
          background: linear-gradient(90deg, ${C.border} 0%, transparent 100%);
        }
        .lux-card {
          position: relative;
          border-radius: 14px;
          box-shadow: 0 1px 0 rgba(255,255,255,0.03) inset,
                      0 30px 80px -20px rgba(0,0,0,0.55),
                      0 8px 24px -8px rgba(0,0,0,0.45);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .lux-card::before {
          content: ""; position: absolute; inset: 0 0 auto 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
        }
        .lux-head {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 16px; padding: clamp(14px, 2vw, 22px) clamp(18px, 2.8vw, 28px) 0;
          flex-shrink: 0;
        }
        .lux-title {
          margin: 0;
          font-family: 'Cormorant Garamond', 'Iowan Old Style', 'Charter', Georgia, 'Times New Roman', serif;
          font-weight: 500;
          font-size: clamp(22px, 2.8vw, 30px);
          line-height: 1.1;
          letter-spacing: -0.012em;
          color: ${C.white};
        }
        .lux-title em {
          font-style: italic; color: ${C.accent}; font-weight: 500;
        }
        .lux-sub {
          margin: 4px 0 0;
          color: ${C.muted};
          font-size: 12.5px;
          max-width: 52ch;
          line-height: 1.4;
        }
        .lux-close {
          width: 36px; height: 36px; flex: 0 0 auto;
          display: grid; place-items: center;
          background: transparent; border: 1px solid ${C.border};
          border-radius: 999px; color: ${C.muted};
          cursor: pointer; transition: all .18s ease;
        }
        .lux-close:hover {
          color: ${C.white}; border-color: ${C.accent};
          background: ${mix(C.accent, 8)}; transform: rotate(90deg);
        }
        .lux-close svg { width: 14px; height: 14px; }

        .lux-progress {
          margin: 10px clamp(18px, 2.8vw, 28px) 0;
          display: flex; align-items: center; gap: 10px;
          font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
          font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase;
          color: ${C.muted};
          flex-shrink: 0;
        }
        .lux-progress .bar {
          position: relative; flex: 1; height: 2px;
          background: ${C.border}; border-radius: 999px; overflow: hidden;
        }
        .lux-progress .bar i {
          position: absolute; inset: 0 auto 0 0; width: 0%;
          background: linear-gradient(90deg, ${C.purple}, ${C.accent});
          transition: width .35s ease;
        }
        .lux-progress .pct { min-width: 36px; text-align: right; color: ${C.text}; }

        .lux-form {
          display: flex; flex-direction: column;
          flex: 1; min-height: 0;
        }
        .lux-body {
          padding: 14px clamp(18px, 2.8vw, 28px) 14px;
          display: flex; flex-direction: column; gap: 14px;
          overflow-y: auto;
          flex: 1; min-height: 0;
          /* Scroll suave + scrollbar discreto. Conteudo nunca encosta nas
             bordas do card (padding bottom evita ilusao de "cortado"). */
          scrollbar-gutter: stable;
        }

        .lux-fieldset {
          border: none; margin: 0; padding: 0;
          display: flex; flex-direction: column; gap: 10px;
        }
        .lux-legend {
          padding: 0; margin: 0 0 2px;
          font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
          font-size: 10px; letter-spacing: .22em; text-transform: uppercase;
          color: ${C.muted};
          display: flex; align-items: center; gap: 10px; width: 100%;
        }
        .lux-legend::after {
          content: ""; flex: 1; height: 1px; background: ${C.border};
        }

        .lux-row { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }
        .lux-row.cols-1 { grid-template-columns: 1fr; }
        .lux-row.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
        .lux-row.three-tilt { grid-template-columns: 1.2fr 0.6fr 1fr; }
        .lux-row.addr-tilt { grid-template-columns: 130px 1fr 110px; }

        .lux-field {
          display: flex; flex-direction: column; gap: 4px;
          position: relative; min-width: 0;
        }
        .lux-field > label {
          font-size: 12px; font-weight: 500; letter-spacing: .01em;
          color: ${C.muted};
          display: inline-flex; align-items: center; gap: 6px;
        }
        .lux-field .req {
          color: ${C.accent};
          font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
          font-size: 10px;
          transform: translateY(-2px);
        }
        .lux-field .hint {
          position: absolute; right: 0; top: 0;
          font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
          font-size: 10.5px; color: ${C.muted};
        }
        .lux-field .erro {
          color: ${C.red};
          font-size: 11.5px;
          margin-top: 2px;
          font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
          letter-spacing: .01em;
        }

        .lux-input, .lux-select, .lux-textarea {
          width: 100%;
          background: ${C.surface}; color: ${C.text};
          border: 1px solid ${C.border}; border-radius: 8px;
          padding: 8px 12px; font: inherit; font-size: 13.5px; line-height: 1.35;
          transition: border-color .18s ease, background .18s ease, box-shadow .18s ease;
          appearance: none; -webkit-appearance: none;
          box-sizing: border-box;
          font-family: inherit;
        }
        /* Altura controlada — combina com padding 8px + font 13.5/1.35 -> ~36px. */
        .lux-input, .lux-select { height: 36px; }
        .lux-input::placeholder, .lux-textarea::placeholder { color: ${C.muted}; opacity: .7; }
        .lux-input:hover, .lux-select:hover, .lux-textarea:hover {
          background: ${C.card}; border-color: ${mix(C.accent, 40)};
        }
        .lux-input:focus, .lux-select:focus, .lux-textarea:focus {
          outline: none; background: ${C.card};
          border-color: ${C.accent};
          box-shadow: 0 0 0 4px ${mix(C.accent, 14)};
        }
        .lux-input[aria-invalid="true"] {
          border-color: ${C.red};
          box-shadow: 0 0 0 3px ${mix(C.red, 16)};
        }
        .lux-select {
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none'><path d='M3 4.5l3 3 3-3' stroke='%239aa3b2' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/></svg>");
          background-repeat: no-repeat; background-position: right 14px center; background-size: 12px 12px;
          padding-right: 36px;
          cursor: pointer;
        }
        /* Textarea flexivel: encolhe pra caber em telas pequenas; resize
           apenas vertical pra usuario expandir se quiser detalhar. */
        .lux-textarea {
          resize: vertical; min-height: 56px; max-height: 100px;
          height: 72px; line-height: 1.4;
        }

        .lux-foot {
          display: flex; align-items: center; justify-content: space-between;
          gap: 14px;
          padding: 10px clamp(18px, 2.8vw, 28px) 12px;
          border-top: 1px solid ${C.border};
          flex-shrink: 0;
          background: ${C.card};
        }
        .lux-foot__note {
          font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace;
          font-size: 11px; letter-spacing: .12em; text-transform: uppercase;
          color: ${C.muted};
          display: inline-flex; align-items: center; gap: 8px;
        }
        .lux-foot__note .key {
          border: 1px solid ${C.border}; border-radius: 6px;
          padding: 2px 6px; color: ${C.muted}; font-size: 10.5px;
          background: ${C.bg};
        }
        .lux-actions { display: flex; gap: 10px; }

        .lux-btn {
          appearance: none; border: 1px solid transparent; cursor: pointer;
          font: inherit; font-weight: 600;
          padding: 8px 16px; border-radius: 8px; transition: all .18s ease;
          letter-spacing: .005em; font-size: 13px;
          display: inline-flex; align-items: center; gap: 8px;
          height: 36px;
        }
        .lux-btn--ghost {
          background: transparent; color: ${C.muted}; border-color: ${C.border};
        }
        .lux-btn--ghost:hover:not(:disabled) {
          color: ${C.text}; border-color: ${mix(C.accent, 50)};
          background: ${mix(C.accent, 6)};
        }
        .lux-btn--primary {
          background: linear-gradient(135deg, ${C.accent}, ${C.purple});
          color: ${C.white};
          border-color: ${mix(C.accent, 60)};
          box-shadow: 0 1px 0 rgba(255,255,255,0.18) inset,
                      0 10px 24px -10px ${mix(C.accent, 70)};
        }
        .lux-btn--primary:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.08);
          box-shadow: 0 1px 0 rgba(255,255,255,0.22) inset,
                      0 16px 32px -10px ${mix(C.accent, 90)};
        }
        .lux-btn--primary:active:not(:disabled) { transform: translateY(0); filter: brightness(.95); }
        .lux-btn:disabled { opacity: .55; cursor: default; transform: none !important; }

        .lux-alert {
          padding: 10px 14px; border-radius: 10px;
          background: ${mix(C.red, 14)};
          border: 1px solid ${mix(C.red, 40)};
          color: ${C.red};
          font-size: 13px;
          margin-top: -4px;
        }

        @media (max-width: 720px) {
          .lux-row { grid-template-columns: 1fr; }
          .lux-row.cols-3 { grid-template-columns: 1fr 1fr; }
          .lux-row.three-tilt { grid-template-columns: 1fr 1fr; }
          .lux-row.three-tilt .lux-field:first-child { grid-column: 1 / -1; }
          .lux-row.addr-tilt { grid-template-columns: 1fr 1fr; }
          .lux-row.addr-tilt .lux-field:last-child { grid-column: 1 / -1; }
          .lux-head { padding-top: 14px; }
          .lux-foot { flex-direction: column-reverse; align-items: stretch; gap: 8px; padding: 10px 16px 12px; }
          .lux-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
          .lux-btn { justify-content: center; }
          .lux-foot__note { justify-content: center; font-size: 10px; }
          .lux-eyebrow { display: none; }
        }
        /* Modo compacto: solicitado via prop compacto=true (ex: modal Novo Cliente
           — ETAPA#2). Reduz paddings/gaps/heights internos pra caber em ~90vh
           sem scroll vertical. Eyebrow + subtitulo escondidos. */
        .lux-overlay--compact { padding: 4vh clamp(8px, 1.6vw, 16px); }
        .lux-stage--compact { max-height: 92vh; }
        .lux-stage--compact .lux-eyebrow { display: none; }
        .lux-stage--compact .lux-sub { display: none; }
        .lux-stage--compact .lux-head {
          padding-top: 14px; padding-bottom: 0; gap: 12px;
        }
        .lux-stage--compact .lux-title { font-size: clamp(20px, 2.3vw, 26px); }
        .lux-stage--compact .lux-progress { margin-top: 6px; }
        .lux-stage--compact .lux-body {
          padding-top: 10px; padding-bottom: 10px; gap: 10px;
        }
        .lux-stage--compact .lux-fieldset { gap: 6px; }
        .lux-stage--compact .lux-row { gap: 8px; }
        .lux-stage--compact .lux-field { gap: 3px; }
        .lux-stage--compact .lux-input,
        .lux-stage--compact .lux-select { height: 32px; padding: 5px 10px; font-size: 13px; }
        .lux-stage--compact .lux-textarea { min-height: 44px; max-height: 56px; height: 48px; }
        .lux-stage--compact .lux-foot {
          padding: 8px clamp(18px, 2.8vw, 28px) 10px; gap: 10px;
        }
        /* Telas curtas (notebook 13'' / PDV legado): textarea/sub mais
           compactos, eyebrow oculto pra liberar altura. */
        @media (max-height: 720px) {
          .lux-eyebrow { display: none; }
          .lux-sub { display: none; }
          .lux-progress { margin-top: 6px; }
          .lux-body { padding-top: 10px; padding-bottom: 10px; gap: 10px; }
          .lux-textarea { min-height: 48px; max-height: 64px; height: 56px; }
          .lux-head { padding-top: 10px; }
          .lux-title { font-size: clamp(20px, 2.4vw, 26px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .lux-overlay *, .lux-overlay *::before, .lux-overlay *::after {
            transition: none !important; animation: none !important;
          }
        }
      `}</style>

      <div className={`lux-overlay${compacto ? " lux-overlay--compact" : ""}`} onClick={() => !salvando && onFechar?.()}>
        <div className={`lux-stage${compacto ? " lux-stage--compact" : ""}`} onClick={(e) => e.stopPropagation()}>
          {(eyebrow || numeroLote || data) && (
            <div className="lux-eyebrow" aria-hidden="true">
              <span className="dot" />
              <span>{eyebrow || "Painel · Cadastro"}</span>
              <span className="grow" />
              {(numeroLote || data) && (
                <span>{[numeroLote, data].filter(Boolean).join(" — ")}</span>
              )}
            </div>
          )}

          <section className="lux-card" style={estiloCard} role="dialog" aria-modal="true">
            <header className="lux-head">
              <div>
                <h1 className="lux-title">
                  {titulo}{tituloDestaque && <> <em>{tituloDestaque}</em></>}
                </h1>
                {subtitulo && <p className="lux-sub">{subtitulo}</p>}
              </div>
              <button
                type="button"
                className="lux-close"
                aria-label="Fechar"
                onClick={() => !salvando && onFechar?.()}
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            {typeof progresso === "number" && (
              <div className="lux-progress" aria-hidden="true">
                <span>Preenchimento</span>
                <span className="bar"><i style={{ width: `${Math.max(0, Math.min(100, progresso))}%` }} /></span>
                <span className="pct">{Math.round(progresso)}%</span>
              </div>
            )}

            <form className="lux-form" onSubmit={onSubmit} noValidate autoComplete="on">
              <div className="lux-body">
                {children}
                {erro && <div className="lux-alert">{erro}</div>}
              </div>

              <footer className="lux-foot">
                <span className="lux-foot__note">
                  <span className="key">⏎</span> Enviar com Enter
                  <span style={{ opacity: .5, margin: "0 4px" }}>·</span>
                  <span className="key">Esc</span> cancelar
                </span>
                <div className="lux-actions">
                  <button
                    type="button"
                    className="lux-btn lux-btn--ghost"
                    onClick={() => onFechar?.()}
                    disabled={salvando}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="lux-btn lux-btn--primary" disabled={salvando}>
                    <span>{salvando ? textoSalvando : (editando ? "Salvar alterações" : textoSalvar)}</span>
                    {!salvando && (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}

export function Secao({ legenda, children }: { legenda?: string; children: ReactNode }) {
  return (
    <fieldset className="lux-fieldset">
      {legenda && <legend className="lux-legend">{legenda}</legend>}
      {children}
    </fieldset>
  );
}

interface LinhaProps {
  cols?: 1 | 2 | 3;
  tilt?: boolean;
  variant?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function Linha({ cols = 2, tilt = false, variant, style, children }: LinhaProps) {
  const cls = variant
    ? `lux-row ${variant}`
    : tilt
      ? "lux-row three-tilt"
      : `lux-row cols-${cols}`;
  return <div className={cls} style={style}>{children}</div>;
}

interface CampoProps {
  label?: string;
  obrigatorio?: boolean;
  hint?: string;
  erro?: string;
  span?: number;
  children: ReactNode;
}

export function Campo({ label, obrigatorio, hint, erro, span, children }: CampoProps) {
  const style: CSSProperties | undefined = span ? { gridColumn: `1 / span ${span}` } : undefined;
  return (
    <div className="lux-field" style={style}>
      {label && (
        <label>
          {label}
          {obrigatorio && <span className="req" aria-hidden="true">•</span>}
        </label>
      )}
      {hint && <span className="hint">{hint}</span>}
      {children}
      {erro && <div className="erro">{erro}</div>}
    </div>
  );
}
