// TabelaExecutiva — tabela no padrão executivo (§5 do DESIGN_STANDARDS.md):
// cabeçalho em caixa-alta esmaecido, linhas separadas por hairline, colunas
// numéricas alinhadas à direita em mono tabular, zebra opcional e linha de
// totais destacada. Genérica por tipo de linha.

import type { ReactNode } from "react";

export interface ColunaExec<T> {
  header: ReactNode;
  // Conteúdo da célula. Para valores, devolva <AmountCell/> ou string.
  render: (row: T, index: number) => ReactNode;
  // numeric=true → alinha à direita + fonte mono tabular (default p/ números).
  numeric?: boolean;
  align?: "left" | "right" | "center";
  width?: string; // ex: "120px" | "20%"
  // célula de totais (rodapé) para esta coluna; omitir = vazio
  total?: ReactNode;
}

interface TabelaExecutivaProps<T> {
  columns: ColunaExec<T>[];
  rows: T[];
  keyOf: (row: T, index: number) => string | number;
  zebra?: boolean;
  hasTotais?: boolean; // mostra linha de totais (usa col.total)
  totalLabel?: string; // rótulo na 1ª coluna da linha de totais (default "Total")
  empty?: ReactNode; // estado vazio
  onRowClick?: (row: T) => void;
  className?: string;
}

function alignClass(c: { align?: "left" | "right" | "center"; numeric?: boolean }): string {
  const a = c.align ?? (c.numeric ? "right" : "left");
  return a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";
}

export default function TabelaExecutiva<T>({
  columns,
  rows,
  keyOf,
  zebra = false,
  hasTotais = false,
  totalLabel = "Total",
  empty,
  onRowClick,
  className = "",
}: TabelaExecutivaProps<T>) {
  return (
    <div className={`rounded-card border border-hairline-soft overflow-hidden shadow-card ${className}`}>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-hairline">
            {columns.map((c, i) => (
              <th
                key={i}
                style={{ width: c.width }}
                className={`px-3 py-2.5 text-[10.5px] uppercase tracking-[.12em] font-medium text-fg-muted ${alignClass(c)}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-fg-muted text-[13px]">
                {empty ?? "Sem dados para o período."}
              </td>
            </tr>
          ) : (
            rows.map((row, ri) => (
              <tr
                key={keyOf(row, ri)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={[
                  "border-b border-hairline-soft last:border-0 transition-colors",
                  zebra && ri % 2 === 1 ? "bg-white/[.015]" : "",
                  onRowClick ? "cursor-pointer hover:bg-white/[.03]" : "",
                ].join(" ")}
              >
                {columns.map((c, ci) => (
                  <td
                    key={ci}
                    className={[
                      "px-3 py-2.5",
                      alignClass(c),
                      c.numeric ? "font-mono tabular-nums text-fg" : "text-fg-soft",
                    ].join(" ")}
                  >
                    {c.render(row, ri)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {hasTotais && rows.length > 0 && (
          <tfoot>
            <tr className="border-t border-hairline bg-white/[.02]">
              {columns.map((c, i) => (
                <td
                  key={i}
                  className={[
                    "px-3 py-2.5 font-semibold text-fg",
                    alignClass(c),
                    c.numeric ? "font-mono tabular-nums" : "",
                  ].join(" ")}
                >
                  {i === 0 && c.total == null ? totalLabel : c.total}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
