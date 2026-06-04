// Contabilidade.tsx — portal de fechamento para o contador (read-only).
// Consolida despesas + contas a pagar quitadas + notas fiscais autorizadas no
// periodo (backend /contabilidade/lancamentos) e exporta dois arquivos gerados
// no proprio navegador (como os relatorios em PDF):
//   1. Planilha (CSV) — detalhe completo, para conferencia.
//   2. CSV Contabil (Dominio/Alterdata) — lancamento enxuto usando o codigo
//      contabil externo (de-para) quando houver, pronto para importar.
//
// Acesso: modulo CONTABILIDADE. Um usuario "contador" tem so esta permissao,
// entao ve apenas esta tela — sem PDV, sem configuracoes, sem botoes de escrita.

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";

const fmtBRL = (v: unknown) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
const hojeISO = () => new Date().toISOString().slice(0, 10);

const ROTULO_TIPO: Record<string, string> = {
  DESPESA: "Despesa", CONTA_PAGAR: "Conta paga", NOTA_FISCAL: "Receita (NF)",
};

interface Linha {
  tipo: string;
  fluxo: "SAIDA" | "ENTRADA";
  data: string;
  valor: number;
  historico: string;
  documento: string;
  contaCodigo: string | null;
  contaNome: string | null;
  contaExterna: string | null;
  contraparte: string | null;
  contraparteDoc: string | null;
  formaPagamento: string | null;
  comprovanteUrl: string | null;
}

interface Resumo {
  totalSaidas: number;
  totalEntradas: number;
  saldo: number;
  qtd: number;
  porCategoria: Array<{ nome: string; valor: number }>;
}

interface Payload { inicio: string; fim: string; resumo: Resumo; linhas: Linha[]; }

export default function Contabilidade({ user }: { user: SessionUser }) {
  void user;
  const inicioMes = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }, []);
  const [inicio, setInicio] = useState(inicioMes);
  const [fim, setFim] = useState(hojeISO());
  const [dados, setDados] = useState<Payload | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.contabilidadeLancamentos({ inicio, fim }) as Payload;
      setDados(r);
    } catch (e) { setErro((e as Error).message); }
    finally { setCarregando(false); }
  }, [inicio, fim]);

  useEffect(() => { carregar(); }, [carregar]);

  const periodoLabel = `${fmtData(inicio)}_a_${fmtData(fim)}`.replace(/\//g, "-");

  function exportarPlanilha() {
    if (!dados) return;
    const cab = ["Data", "Tipo", "Documento", "Categoria", "Codigo", "Historico", "Contraparte", "CNPJ/CPF", "Forma", "Fluxo", "Valor"];
    const linhas = dados.linhas.map(l => [
      fmtData(l.data), ROTULO_TIPO[l.tipo] || l.tipo, l.documento,
      l.contaNome || "", l.contaCodigo || "", l.historico,
      l.contraparte || "", l.contraparteDoc || "", l.formaPagamento || "",
      l.fluxo === "SAIDA" ? "Saida" : "Entrada", brl(l.valor),
    ]);
    baixarCsv(`contabilidade_${periodoLabel}.csv`, [cab, ...linhas]);
  }

  // Layout enxuto para importacao contabil: Data; Conta (externa se houver,
  // senao o codigo do plano); Historico; Valor; D/C (D=saida, C=entrada).
  function exportarDominio() {
    if (!dados) return;
    const cab = ["Data", "Conta", "Historico", "Valor", "D/C"];
    const linhas = dados.linhas.map(l => [
      fmtData(l.data), l.contaExterna || l.contaCodigo || "",
      l.historico, brl(l.valor), l.fluxo === "SAIDA" ? "D" : "C",
    ]);
    baixarCsv(`lancamentos_contabil_${periodoLabel}.csv`, [cab, ...linhas]);
  }

  const r = dados?.resumo;
  const maxCat = useMemo(() => Math.max(1, ...(r?.porCategoria.map(c => c.valor) || [1])), [r]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {erro && (
        <div style={{ background: C.red + "22", border: `1px solid ${C.red}`, color: C.text, padding: "10px 14px", borderRadius: 10 }}>{erro}</div>
      )}

      {/* Filtro de periodo + exportacao */}
      <div style={{ ...card(), display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={campo()}><span style={lbl()}>De</span>
          <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} style={input()} /></label>
        <label style={campo()}><span style={lbl()}>Até</span>
          <input type="date" value={fim} onChange={e => setFim(e.target.value)} style={input()} /></label>
        <div style={{ flex: 1 }} />
        <button onClick={exportarPlanilha} disabled={!dados || dados.linhas.length === 0} style={btnSec()}>⬇ Planilha (CSV)</button>
        <button onClick={exportarDominio} disabled={!dados || dados.linhas.length === 0} style={btnPri()}>⬇ CSV Contábil (Domínio/Alterdata)</button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Kpi titulo="Entradas (receitas)" valor={fmtBRL(r?.totalEntradas)} cor={C.green} />
        <Kpi titulo="Saídas (despesas/contas)" valor={fmtBRL(r?.totalSaidas)} cor={C.red} />
        <Kpi titulo="Resultado do período" valor={fmtBRL(r?.saldo)} cor={(r?.saldo ?? 0) >= 0 ? C.green : C.red} />
        <Kpi titulo="Lançamentos" valor={String(r?.qtd ?? 0)} cor={C.accent} />
      </div>

      {/* Resumo por categoria */}
      {r && r.porCategoria.length > 0 && (
        <div style={card()}>
          <div style={{ fontWeight: 700, color: C.white, marginBottom: 12 }}>Despesas por categoria</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {r.porCategoria.map(cat => (
              <div key={cat.nome} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 180, color: C.text, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cat.nome}</div>
                <div style={{ flex: 1, background: C.surface, borderRadius: 6, height: 14, overflow: "hidden" }}>
                  <div style={{ width: `${(cat.valor / maxCat) * 100}%`, background: C.red, height: "100%" }} />
                </div>
                <div style={{ width: 110, textAlign: "right", color: C.text, fontSize: 13, fontWeight: 600 }}>{fmtBRL(cat.valor)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de lancamentos */}
      <div style={card()}>
        {carregando ? (
          <div style={{ color: C.muted, padding: 24, textAlign: "center" }}>Carregando…</div>
        ) : !dados || dados.linhas.length === 0 ? (
          <div style={{ color: C.muted, padding: 24, textAlign: "center" }}>Nenhum lançamento no período.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: "left" }}>
                  <th style={th()}>Data</th>
                  <th style={th()}>Tipo</th>
                  <th style={th()}>Categoria</th>
                  <th style={th()}>Histórico</th>
                  <th style={th()}>Contraparte</th>
                  <th style={{ ...th(), textAlign: "right" }}>Valor</th>
                  <th style={{ ...th(), textAlign: "center" }}>Doc.</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td()}>{fmtData(l.data)}</td>
                    <td style={td()}><span style={badge(l.fluxo === "ENTRADA" ? C.green : C.red)}>{ROTULO_TIPO[l.tipo] || l.tipo}</span></td>
                    <td style={td()}>{l.contaNome || "—"}</td>
                    <td style={td()}>{l.historico}</td>
                    <td style={{ ...td(), color: C.muted }}>{l.contraparte || "—"}</td>
                    <td style={{ ...td(), textAlign: "right", color: l.fluxo === "ENTRADA" ? C.green : C.red, fontWeight: 600 }}>
                      {l.fluxo === "ENTRADA" ? "+" : "−"} {fmtBRL(l.valor)}
                    </td>
                    <td style={{ ...td(), textAlign: "center" }}>
                      {l.comprovanteUrl
                        ? <a href={l.comprovanteUrl} target="_blank" rel="noreferrer" title="Comprovante" style={{ textDecoration: "none" }}>📎</a>
                        : <span style={{ color: C.muted }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Export CSV (client-side) ============

// Valor numerico com virgula decimal (formato BR para Excel/contador).
function brl(v: number): string {
  return Number(v || 0).toFixed(2).replace(".", ",");
}

// Escapa um campo CSV (aspas duplas se contiver ; " ou quebra de linha).
function csvCampo(v: string): string {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Monta o CSV (separador ';', com BOM UTF-8 para acentos no Excel) e baixa.
function baixarCsv(nome: string, linhas: string[][]) {
  const conteudo = "﻿" + linhas.map(l => l.map(csvCampo).join(";")).join("\r\n");
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============ UI helpers ============

function Kpi({ titulo, valor, cor }: { titulo: string; valor: string; cor: string }) {
  return (
    <div style={card()}>
      <div style={{ color: C.muted, fontSize: 12 }}>{titulo}</div>
      <div style={{ color: cor, fontSize: 22, fontWeight: 800, marginTop: 4 }}>{valor}</div>
    </div>
  );
}

const card = (): CSSProperties => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 });
const campo = (): CSSProperties => ({ display: "flex", flexDirection: "column", gap: 4, minWidth: 140 });
const lbl = (): CSSProperties => ({ color: C.muted, fontSize: 12 });
const input = (): CSSProperties => ({ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "8px 10px", fontSize: 14 });
const th = (): CSSProperties => ({ padding: "8px 10px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 });
const td = (): CSSProperties => ({ padding: "9px 10px", color: C.text, verticalAlign: "middle" });
const badge = (cor: string): CSSProperties => ({ background: cor + "22", color: cor, border: `1px solid ${cor}`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" });
const btnPri = (): CSSProperties => ({ background: C.accent, color: "var(--accent-ink, #fff)", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" });
const btnSec = (): CSSProperties => ({ background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 14px", fontSize: 13, cursor: "pointer" });
