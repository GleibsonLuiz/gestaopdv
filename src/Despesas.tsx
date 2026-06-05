// Despesas.tsx — lancamento rapido de despesas operacionais (cafe, agua,
// limpeza, etc.), classificadas pelo Plano de Contas. Pensado para ser tao
// rapido quanto mandar um WhatsApp: valor em destaque, categorias recentes em
// 1 toque, foto do comprovante opcional. Lista as despesas do periodo com
// filtro por categoria. (Modulo DESPESAS — backend /despesas + /planos-contas.)

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";

const fmtBRL = (v: unknown) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
const hojeISO = () => new Date().toISOString().slice(0, 10);

const FORMAS: Array<{ id: string; label: string }> = [
  { id: "DINHEIRO", label: "Dinheiro" },
  { id: "PIX", label: "Pix" },
  { id: "CARTAO_DEBITO", label: "Débito" },
  { id: "CARTAO_CREDITO", label: "Crédito" },
  { id: "BOLETO", label: "Boleto" },
];

interface PlanoConta {
  id: string;
  codigo: string;
  nome: string;
  natureza: "RECEITA" | "DESPESA";
  analitica: boolean;
  ativo: boolean;
}

interface Anexo { id: string; nomeOriginal: string; url: string; mimeType: string; }

interface Despesa {
  id: string;
  numero: number;
  data: string;
  valor: number | string;
  descricao: string;
  formaPagamento: string;
  origem?: string;
  planoConta?: { id: string; codigo: string; nome: string } | null;
  fornecedor?: { id: string; nome: string } | null;
  anexos?: Anexo[];
}

export default function Despesas({ user }: { user: SessionUser }) {
  const [contas, setContas] = useState<PlanoConta[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");

  // Filtros da lista (default: mes corrente).
  const inicioMes = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); }, []);
  const [fInicio, setFInicio] = useState(inicioMes);
  const [fFim, setFFim] = useState(hojeISO());
  const [fCategoria, setFCategoria] = useState("");

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE";

  const analiticas = useMemo(
    () => contas.filter(c => c.analitica && c.ativo && c.natureza === "DESPESA"),
    [contas],
  );

  const carregarContas = useCallback(async () => {
    try {
      const r = await api.listarPlanosContas({ natureza: "DESPESA", analitica: true, ativo: true }) as PlanoConta[];
      setContas(r || []);
    } catch (e) { setErro((e as Error).message); }
  }, []);

  const carregarDespesas = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.listarDespesas({ dataInicio: fInicio, dataFim: fFim, planoContaId: fCategoria }) as Despesa[];
      setDespesas(r || []);
    } catch (e) { setErro((e as Error).message); }
    finally { setCarregando(false); }
  }, [fInicio, fFim, fCategoria]);

  useEffect(() => { carregarContas(); }, [carregarContas]);
  useEffect(() => { carregarDespesas(); }, [carregarDespesas]);

  // Categorias usadas com mais frequencia nas despesas carregadas — viram chips
  // de 1 toque no formulario (atalho para o gasto recorrente).
  const recentes = useMemo(() => {
    const freq = new Map<string, number>();
    for (const d of despesas) {
      if (d.planoConta?.id) freq.set(d.planoConta.id, (freq.get(d.planoConta.id) || 0) + 1);
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id);
  }, [despesas]);

  const totalPeriodo = useMemo(
    () => despesas.reduce((s, d) => s + Number(d.valor || 0), 0),
    [despesas],
  );

  async function excluir(d: Despesa) {
    if (!confirm(`Excluir a despesa "${d.descricao}" de ${fmtBRL(d.valor)}? Se ela baixou do caixa, o valor é estornado.`)) return;
    try {
      await api.excluirDespesa(d.id);
      setOk("Despesa excluída.");
      carregarDespesas();
    } catch (e) { setErro((e as Error).message); }
  }

  function aposSalvar() {
    setOk("Despesa lançada!");
    setTimeout(() => setOk(""), 2500);
    carregarDespesas();
    carregarContas();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {erro && <Aviso cor={C.red} texto={erro} onClose={() => setErro("")} />}
      {ok && <Aviso cor={C.green} texto={ok} onClose={() => setOk("")} />}

      {/* Resumo do periodo */}
      <div style={card()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ color: C.muted, fontSize: 13 }}>Total de despesas no período</div>
            <div style={{ color: C.red, fontSize: 28, fontWeight: 800 }}>{fmtBRL(totalPeriodo)}</div>
          </div>
          <div style={{ color: C.muted, fontSize: 13 }}>{despesas.length} lançamento(s)</div>
        </div>
      </div>

      {podeEditar && (
        <LancarDespesa
          contas={analiticas}
          recentes={recentes}
          onSalvo={aposSalvar}
          onErro={setErro}
        />
      )}

      {/* Filtros */}
      <div style={{ ...card(), display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Campo label="De">
          <input type="date" value={fInicio} onChange={e => setFInicio(e.target.value)} style={input()} />
        </Campo>
        <Campo label="Até">
          <input type="date" value={fFim} onChange={e => setFFim(e.target.value)} style={input()} />
        </Campo>
        <Campo label="Categoria">
          <select value={fCategoria} onChange={e => setFCategoria(e.target.value)} style={input()}>
            <option value="">Todas</option>
            {analiticas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
      </div>

      {/* Lista */}
      <div style={card()}>
        {carregando ? (
          <div style={{ color: C.muted, padding: 24, textAlign: "center" }}>Carregando…</div>
        ) : despesas.length === 0 ? (
          <div style={{ color: C.muted, padding: 24, textAlign: "center" }}>
            Nenhuma despesa no período. {podeEditar ? "Lance a primeira acima 👆" : ""}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: "left" }}>
                  <th style={th()}>Data</th>
                  <th style={th()}>Categoria</th>
                  <th style={th()}>Descrição</th>
                  <th style={th()}>Forma</th>
                  <th style={{ ...th(), textAlign: "right" }}>Valor</th>
                  <th style={{ ...th(), textAlign: "center" }}>Comprov.</th>
                  {podeEditar && <th style={th()}></th>}
                </tr>
              </thead>
              <tbody>
                {despesas.map(d => (
                  <tr key={d.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td()}>{fmtData(d.data)}</td>
                    <td style={td()}>
                      <span style={{ color: C.text }}>{d.planoConta?.nome || "—"}</span>
                      {d.origem === "OCR" && <span style={tag(C.purple)}>OCR</span>}
                    </td>
                    <td style={td()}>{d.descricao}</td>
                    <td style={{ ...td(), color: C.muted }}>{FORMAS.find(f => f.id === d.formaPagamento)?.label || d.formaPagamento}</td>
                    <td style={{ ...td(), textAlign: "right", color: C.red, fontWeight: 600 }}>{fmtBRL(d.valor)}</td>
                    <td style={{ ...td(), textAlign: "center" }}>
                      {d.anexos && d.anexos.length > 0
                        ? <a href={d.anexos[0].url} target="_blank" rel="noreferrer" title="Ver comprovante" style={{ textDecoration: "none" }}>📎</a>
                        : <span style={{ color: C.muted }}>—</span>}
                    </td>
                    {podeEditar && (
                      <td style={{ ...td(), textAlign: "right" }}>
                        <button onClick={() => excluir(d)} title="Excluir" style={btnIcone(C.red)}>🗑</button>
                      </td>
                    )}
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

// ============ FORMULARIO DE LANCAMENTO RAPIDO ============

function LancarDespesa({ contas, recentes, onSalvo, onErro }: {
  contas: PlanoConta[];
  recentes: string[];
  onSalvo: () => void;
  onErro: (msg: string) => void;
}) {
  const [valor, setValor] = useState("");
  const [planoContaId, setPlanoContaId] = useState("");
  const [data, setData] = useState(hojeISO());
  const [descricao, setDescricao] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("DINHEIRO");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [origemOcr, setOrigemOcr] = useState(false);
  const [erroLocal, setErroLocal] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const chips = contas.filter(c => recentes.includes(c.id));

  // OCR: envia o comprovante, a IA le e devolvemos os campos sugeridos para
  // pre-preencher. O usuario confere e confirma — nunca grava sozinho. Falha
  // silenciosa: se a IA nao responder, segue no preenchimento manual.
  async function lerComprovante(file: File) {
    setLendo(true); onErro("");
    try {
      const r = await api.lerComprovanteOCR(file) as {
        valor?: number | null; data?: string | null; descricao?: string | null;
        planoContaSugeridaId?: string | null;
      };
      if (r.valor != null) setValor(String(r.valor));
      if (r.data) setData(r.data);
      if (r.descricao) setDescricao(r.descricao);
      if (r.planoContaSugeridaId && contas.some(c => c.id === r.planoContaSugeridaId)) {
        setPlanoContaId(r.planoContaSugeridaId);
      }
      setOrigemOcr(true);
    } catch { /* segue manual */ }
    finally { setLendo(false); }
  }

  function aoEscolherArquivo(f: File | null) {
    setArquivo(f);
    // Foto dispara OCR automatico; PDF tambem (a IA aceita documento).
    if (f) lerComprovante(f);
  }

  async function salvar() {
    const v = Number(String(valor).replace(",", "."));
    if (!v || v <= 0) { setErroLocal("Informe um valor maior que zero."); return; }
    if (!planoContaId) { setErroLocal("Escolha uma categoria."); return; }
    setSalvando(true); setErroLocal(""); onErro("");
    try {
      await api.criarDespesa(
        { valor: v, planoContaId, data, descricao, formaPagamento, origem: origemOcr ? "OCR" : "MANUAL" },
        arquivo,
      );
      setValor(""); setDescricao(""); setArquivo(null); setPlanoContaId("");
      setData(hojeISO()); setFormaPagamento("DINHEIRO"); setOrigemOcr(false);
      if (fileRef.current) fileRef.current.value = "";
      onSalvo();
    } catch (e) { onErro((e as Error).message); }
    finally { setSalvando(false); }
  }

  return (
    <div style={{ ...card(), borderColor: C.accent }}>
      <div style={{ fontWeight: 700, color: C.white, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span>⚡</span> Lançar despesa
      </div>

      {/* Valor em destaque */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ color: C.muted, fontSize: 22, fontWeight: 700 }}>R$</span>
        <input
          type="text" inputMode="decimal" placeholder="0,00" value={valor} autoFocus
          onChange={e => { setValor(e.target.value.replace(/[^0-9.,]/g, "")); setErroLocal(""); }}
          onKeyDown={e => { if (e.key === "Enter") salvar(); }}
          style={{ ...input(), fontSize: 32, fontWeight: 800, color: C.text, padding: "8px 12px", width: 220 }}
        />
      </div>

      {/* Chips de categorias recentes */}
      {chips.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {chips.map(c => (
            <button key={c.id} type="button" onClick={() => setPlanoContaId(c.id)}
              style={chip(planoContaId === c.id)}>
              {c.nome}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Campo label="Categoria *" flex={2}>
          <select value={planoContaId} onChange={e => { setPlanoContaId(e.target.value); setErroLocal(""); }} style={input()}>
            <option value="">Selecione…</option>
            {contas.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>)}
          </select>
        </Campo>
        <Campo label="Data">
          <input type="date" value={data} onChange={e => setData(e.target.value)} style={input()} />
        </Campo>
        <Campo label="Forma">
          <select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} style={input()}>
            {FORMAS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </Campo>
      </div>

      <div style={{ marginTop: 12 }}>
        <Campo label="Descrição (opcional)">
          <input value={descricao} onChange={e => setDescricao(e.target.value)}
            placeholder="Ex.: café e açúcar da copa" style={input()} />
        </Campo>
      </div>

      {erroLocal && (
        <div style={{ marginTop: 8, color: C.red, fontSize: 13, fontWeight: 600 }}>{erroLocal}</div>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={lendo} style={btnSec()}>
          {lendo ? "🔎 Lendo comprovante…" : arquivo ? `📎 ${arquivo.name.slice(0, 24)}` : "📷 Comprovante (lê sozinho)"}
        </button>
        {arquivo && !lendo && (
          <button type="button" onClick={() => { setArquivo(null); setOrigemOcr(false); if (fileRef.current) fileRef.current.value = ""; }}
            style={{ ...btnSec(), color: C.red }}>Remover</button>
        )}
        {origemOcr && !lendo && <span style={tag(C.purple)}>preenchido por IA — confira</span>}
        <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" hidden
          onChange={e => aoEscolherArquivo(e.target.files?.[0] ?? null)} />

        <div style={{ flex: 1 }} />
        <button type="button" onClick={salvar} disabled={salvando || lendo} style={btnPri(salvando)}>
          {salvando ? "Salvando…" : "Lançar despesa"}
        </button>
      </div>
    </div>
  );
}

// ============ UI helpers ============

function Campo({ label, children, flex }: { label: string; children: React.ReactNode; flex?: number }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: flex ?? 1, minWidth: 140 }}>
      <span style={{ color: C.muted, fontSize: 12 }}>{label}</span>
      {children}
    </label>
  );
}

function Aviso({ cor, texto, onClose }: { cor: string; texto: string; onClose: () => void }) {
  return (
    <div style={{ background: cor + "22", border: `1px solid ${cor}`, color: C.text, padding: "10px 14px", borderRadius: 10, display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span>{texto}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}>✕</button>
    </div>
  );
}

const card = (): CSSProperties => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 });
const input = (): CSSProperties => ({ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: "8px 10px", fontSize: 14, width: "100%", boxSizing: "border-box" });
const th = (): CSSProperties => ({ padding: "8px 10px", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 });
const td = (): CSSProperties => ({ padding: "10px", color: C.text, verticalAlign: "middle" });
const chip = (ativo: boolean): CSSProperties => ({ background: ativo ? C.accent : C.surface, color: ativo ? "var(--accent-ink, #fff)" : C.text, border: `1px solid ${ativo ? C.accent : C.border}`, borderRadius: 999, padding: "6px 12px", fontSize: 13, cursor: "pointer" });
const tag = (cor: string): CSSProperties => ({ marginLeft: 6, background: cor + "22", color: cor, border: `1px solid ${cor}`, borderRadius: 6, padding: "1px 6px", fontSize: 10, fontWeight: 700 });
const btnPri = (loading: boolean): CSSProperties => ({ background: C.accent, color: "var(--accent-ink, #fff)", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1 });
const btnSec = (): CSSProperties => ({ background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 14px", fontSize: 13, cursor: "pointer" });
const btnIcone = (cor: string): CSSProperties => ({ background: "none", border: `1px solid ${C.border}`, color: cor, borderRadius: 8, padding: "4px 8px", cursor: "pointer" });
