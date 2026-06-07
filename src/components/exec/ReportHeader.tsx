// ReportHeader — cabeçalho padrão de relatório executivo (§5 do
// DESIGN_STANDARDS.md). Anatomia: (opcional) bloco da empresa → título +
// ações → linha de período/filtros aplicados.
//
// Reusa HeaderRelatorio (bloco da empresa, theme-aware, com modo cupom) em vez
// de duplicá-lo.

import type { ReactNode } from "react";
import HeaderRelatorio from "../../HeaderRelatorio";

export interface FiltroAplicado {
  label: string;
  valor: string;
}

interface ReportHeaderProps {
  titulo: string;
  subtitulo?: string;
  periodo?: string; // ex: "01/05/2026 a 31/05/2026"
  filtros?: FiltroAplicado[];
  acoes?: ReactNode; // botões (exportar PDF, etc.)
  empresa?: boolean; // renderiza o bloco da empresa acima (default false)
  empresaCompacta?: boolean;
}

export default function ReportHeader({
  titulo,
  subtitulo,
  periodo,
  filtros,
  acoes,
  empresa = false,
  empresaCompacta = false,
}: ReportHeaderProps) {
  return (
    <div className="pt-3 pb-5">
      {empresa && (
        <div className="mb-4">
          <HeaderRelatorio compacto={empresaCompacta} />
        </div>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] leading-[1.15] font-semibold tracking-[-0.02em] text-fg">
            {titulo}
          </h1>
          {subtitulo && <p className="m-0 mt-1 text-[13px] text-fg-muted">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex items-center gap-2 shrink-0">{acoes}</div>}
      </div>

      {(periodo || (filtros && filtros.length > 0)) && (
        <div className="flex items-center gap-2 flex-wrap mt-3">
          {periodo && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono tabular-nums text-fg-soft bg-white/[.04] border border-hairline-soft">
              {periodo}
            </span>
          )}
          {filtros?.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] text-fg-muted bg-white/[.03] border border-hairline-soft"
            >
              <span className="uppercase tracking-[.08em] text-[10px] text-fg-faint">{f.label}</span>
              <span className="text-fg-soft">{f.valor}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
