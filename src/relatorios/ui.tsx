// Componentes de UI compartilhados pelos relatorios (extraidos de
// Relatorios.tsx no fatiamento, Fase 5). Padrao executivo do
// DESIGN_STANDARDS.md §4/§5: KPIs com numero-heroi mono, tabelas com
// hairline e colunas numericas tabulares. APIs legadas preservadas.
import type { CSSProperties, ReactNode } from "react";
import { C } from "../lib/theme";
import SelectBusca from "../components/SelectBusca.jsx";

export const labelStyle: CSSProperties = {
  color: C.muted, fontSize: 10, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4,
};

export const inputStyle: CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 12,
  outline: "none", minWidth: 140,
};

export function BlocoRelatorio({ titulo, cor, filtros, onGerar, onExportar, carregando, erro, dados, children }: any) {
  return (
    <div>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--hairline-soft)",
        boxShadow: "var(--shadow-card)",
        borderRadius: 14, padding: 16, marginBottom: 16,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ color: "var(--fg)", fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em" }}>{titulo}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onGerar} disabled={carregando} style={{
              background: cor, color: C.white, border: "none", borderRadius: 8,
              padding: "8px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer",
              opacity: carregando ? 0.6 : 1,
            }}>{carregando ? "Gerando..." : "🔍 Gerar"}</button>
            <button onClick={onExportar} disabled={!dados || carregando} style={{
              background: dados ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : C.surface,
              color: dados ? C.white : C.muted, border: dados ? "none" : `1px solid ${C.border}`,
              borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 12,
              cursor: dados ? "pointer" : "default", opacity: !dados ? 0.5 : 1,
            }}>📄 Exportar PDF</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {filtros}
        </div>
      </div>

      {erro && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, marginBottom: 12,
          background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
        }}>{erro}</div>
      )}

      {!dados && !carregando && !erro && (
        <div style={{
          background: "var(--surface)", border: "1px dashed var(--hairline)", borderRadius: 14,
          padding: 40, textAlign: "center", color: "var(--fg-muted)", fontSize: 13,
        }}>
          Defina os filtros e clique em <strong style={{ color: "var(--fg)" }}>Gerar</strong> para visualizar o relatório.
        </div>
      )}

      {children}
    </div>
  );
}

// Resumo — faixa de KPIs no padrao executivo (DESIGN_STANDARDS.md §4).
// Mantem a API legada ({ rotulo, valor, cor }); so o visual foi elevado:
// card com hairline + sombra em camadas, rotulo em caixa-alta com tracking,
// e valor em fonte monoespacada tabular (numeros como heroi).
export function Resumo({ cards }: any) {
  return (
    <div style={{
      display: "grid", gap: 10, marginBottom: 16,
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    }}>
      {cards.map((c: any, i: number) => (
        <div key={i} style={{
          background: "linear-gradient(180deg, var(--elev-sheen), transparent), var(--surface)",
          border: "1px solid var(--hairline-soft)", boxShadow: "var(--shadow-card)",
          borderRadius: 14, padding: "12px 16px 11px", position: "relative", overflow: "hidden",
        }}>
          <div style={{ color: "var(--fg-muted)", fontSize: 10.5, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.14em" }}>
            {c.rotulo}
          </div>
          <div className="font-mono tabular-nums" style={{ color: c.cor, fontSize: 22, fontWeight: 500, marginTop: 6, lineHeight: 1.1, letterSpacing: "-0.025em" }}>
            {c.valor}
          </div>
        </div>
      ))}
    </div>
  );
}

// Tabela — tabela no padrao executivo (DESIGN_STANDARDS.md §5). Mantem a API
// legada (titulo/colunas/alinhamentos/linhas). Convencao do arquivo: coluna
// alinhada a direita = numerica, entao ela ganha fonte mono tabular (alinha as
// casas) e cor de texto primaria; demais colunas usam texto suave.
export function Tabela({ titulo, colunas, alinhamentos, linhas, vazioTexto }: any) {
  const ehNumerica = (j: number) => (alinhamentos?.[j] || "left") === "right";
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--hairline-soft)",
      borderRadius: 14, marginBottom: 16, overflow: "hidden", boxShadow: "var(--shadow-card)",
    }}>
      {titulo && (
        <div style={{
          padding: "11px 14px", borderBottom: "1px solid var(--hairline)",
          color: "var(--fg)", fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em",
        }}>{titulo}</div>
      )}
      {linhas.length === 0 ? (
        <div style={{ padding: 32, color: "var(--fg-muted)", fontSize: 13, textAlign: "center" }}>
          {vazioTexto || "Sem dados."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--hairline)" }}>
                {colunas.map((c: any, i: number) => (
                  <th key={i} style={{
                    padding: "9px 12px", textAlign: alinhamentos?.[i] || "left",
                    color: "var(--fg-muted)", fontSize: 10.5, fontWeight: 500,
                    textTransform: "uppercase", letterSpacing: "0.12em",
                  }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--hairline-soft)" }}>
                  {linha.map((celula: any, j: number) => (
                    <td key={j}
                      className={ehNumerica(j) ? "font-mono tabular-nums" : undefined}
                      style={{
                        padding: "9px 12px", textAlign: alinhamentos?.[j] || "left",
                        color: ehNumerica(j) ? "var(--fg)" : "var(--fg-soft)",
                        fontSize: 13, whiteSpace: "nowrap",
                      }}>{celula}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function CampoData({ label, value, onChange }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <label style={labelStyle}>{label}</label>
      <input type="date" value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}

export function CampoSelect({ label, value, onChange, children, minWidth }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: minWidth || 160 }}>
      <label style={labelStyle}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, minWidth: minWidth || inputStyle.minWidth }}>
        {children}
      </select>
    </div>
  );
}

export function CampoSelectBusca({ label, opcoes, value, onChange, labelFn, subLabelFn, placeholder, minWidth }: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: minWidth || 160 }}>
      <label style={labelStyle}>{label}</label>
      <SelectBusca
        opcoes={opcoes}
        value={value}
        onChange={onChange}
        labelFn={labelFn}
        subLabelFn={subLabelFn}
        placeholder={placeholder || "Todos"}
        style={{ ...inputStyle, minWidth: minWidth || inputStyle.minWidth }}
      />
    </div>
  );
}

export function CardPodio({ titulo, cor, itens, vazioTexto }: any) {
  const medalhas = ["🥇", "🥈", "🥉"];
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: 14, position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: cor }} />
      <div style={{ color: C.white, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
        {titulo}
      </div>
      {itens.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "16px 0" }}>
          {vazioTexto}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {itens.map((item: any, i: number) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "6px 8px", background: C.surface, borderRadius: 8,
            }}>
              <span style={{ fontSize: 18 }}>{medalhas[i] || `${i + 1}.`}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.text, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.nome}
                </div>
                <div style={{ color: C.muted, fontSize: 10 }}>{item.detalhe}</div>
              </div>
              <div style={{ color: cor, fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" }}>
                {item.valor}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
