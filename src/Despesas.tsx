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

// Conta a pagar JÁ QUITADA no período — entra no ledger unificado como "realizado"
// em modo leitura (não há registro duplicado; a baixa acontece no Financeiro).
interface ContaPaga {
  id: string;
  descricao: string;
  valor: number | string;
  pagamento: string | null;
  planoConta?: { id: string; codigo: string; nome: string } | null;
  fornecedor?: { id: string; nome: string } | null;
}

interface CategoriaPR {
  planoContaId: string | null;
  codigo: string;
  nome: string;
  previsto: number;
  realizado: number;
  realizadoContas: number;
  realizadoDespesas: number;
}

interface RelatorioPR {
  inicio: string;
  fim: string;
  totais: { previsto: number; realizado: number; realizadoContas: number; realizadoDespesas: number };
  porCategoria: CategoriaPR[];
  contasPagas: ContaPaga[];
}

// Linha do ledger unificado: despesa avulsa OU conta a pagar paga.
interface LinhaLedger {
  key: string;
  tipo: "despesa" | "conta";
  data: string;
  categoria: string;
  descricao: string;
  forma: string;
  valor: number;
  origem?: string;
  anexoUrl?: string | null;
  despesa?: Despesa;
}

export default function Despesas({ user }: { user: SessionUser }) {
  const [contas, setContas] = useState<PlanoConta[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [relatorio, setRelatorio] = useState<RelatorioPR | null>(null);
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

  // Previsto x Realizado + contas a pagar pagas no período. O filtro de
  // categoria é aplicado no cliente (o relatório vem com todas as categorias).
  const carregarRelatorio = useCallback(async () => {
    try {
      const r = await api.previstoRealizado({ inicio: fInicio, fim: fFim }) as RelatorioPR;
      setRelatorio(r || null);
    } catch (e) { setErro((e as Error).message); }
  }, [fInicio, fFim]);

  useEffect(() => { carregarContas(); }, [carregarContas]);
  useEffect(() => { carregarDespesas(); }, [carregarDespesas]);
  useEffect(() => { carregarRelatorio(); }, [carregarRelatorio]);

  // Categorias usadas com mais frequencia nas despesas carregadas — viram chips
  // de 1 toque no formulario (atalho para o gasto recorrente).
  const recentes = useMemo(() => {
    const freq = new Map<string, number>();
    for (const d of despesas) {
      if (d.planoConta?.id) freq.set(d.planoConta.id, (freq.get(d.planoConta.id) || 0) + 1);
    }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id);
  }, [despesas]);

  // Contas a pagar pagas no período (filtradas por categoria no cliente).
  const contasPagas = useMemo(() => {
    const lista = relatorio?.contasPagas || [];
    return fCategoria ? lista.filter(c => c.planoConta?.id === fCategoria) : lista;
  }, [relatorio, fCategoria]);

  // Ledger unificado: despesas avulsas + contas a pagar pagas, por data desc.
  const ledger = useMemo<LinhaLedger[]>(() => {
    const linhas: LinhaLedger[] = [];
    for (const d of despesas) {
      linhas.push({
        key: `d-${d.id}`,
        tipo: "despesa",
        data: d.data,
        categoria: d.planoConta?.nome || "—",
        descricao: d.descricao,
        forma: FORMAS.find(f => f.id === d.formaPagamento)?.label || d.formaPagamento,
        valor: Number(d.valor || 0),
        origem: d.origem,
        anexoUrl: d.anexos && d.anexos.length > 0 ? d.anexos[0].url : null,
        despesa: d,
      });
    }
    for (const c of contasPagas) {
      linhas.push({
        key: `c-${c.id}`,
        tipo: "conta",
        data: c.pagamento || "",
        categoria: c.planoConta?.nome || "—",
        descricao: c.fornecedor?.nome ? `${c.descricao} · ${c.fornecedor.nome}` : c.descricao,
        forma: "—",
        valor: Number(c.valor || 0),
        anexoUrl: null,
      });
    }
    return linhas.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [despesas, contasPagas]);

  // Previsto x Realizado por categoria (respeita o filtro de categoria).
  const porCategoria = useMemo<CategoriaPR[]>(() => {
    const lista = relatorio?.porCategoria || [];
    return fCategoria ? lista.filter(c => c.planoContaId === fCategoria) : lista;
  }, [relatorio, fCategoria]);

  const totalDespesas = useMemo(
    () => despesas.reduce((s, d) => s + Number(d.valor || 0), 0),
    [despesas],
  );
  const totalContasPagas = useMemo(
    () => contasPagas.reduce((s, c) => s + Number(c.valor || 0), 0),
    [contasPagas],
  );
  const totalRealizado = totalDespesas + totalContasPagas;
  const totalPrevisto = useMemo(
    () => porCategoria.reduce((s, c) => s + c.previsto, 0),
    [porCategoria],
  );

  async function excluir(d: Despesa) {
    if (!confirm(`Excluir a despesa "${d.descricao}" de ${fmtBRL(d.valor)}? Se ela baixou do caixa, o valor é estornado.`)) return;
    try {
      await api.excluirDespesa(d.id);
      setOk("Despesa excluída.");
      carregarDespesas();
      carregarRelatorio();
    } catch (e) { setErro((e as Error).message); }
  }

  function aposSalvar() {
    setOk("Despesa lançada!");
    setTimeout(() => setOk(""), 2500);
    carregarDespesas();
    carregarContas();
    carregarRelatorio();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {erro && <Aviso cor={C.red} texto={erro} onClose={() => setErro("")} />}
      {ok && <Aviso cor={C.green} texto={ok} onClose={() => setOk("")} />}

      {/* Resumo do periodo: Previsto x Realizado (sem duplicar — a conta paga
          já é o realizado, não há despesa-espelho). */}
      <div style={{ ...card(), display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
        <ResumoKpi
          label="Realizado no período"
          valor={fmtBRL(totalRealizado)}
          cor={C.red}
          sub={`${fmtBRL(totalDespesas)} avulsas · ${fmtBRL(totalContasPagas)} contas pagas`}
        />
        <ResumoKpi
          label="Previsto no período"
          valor={fmtBRL(totalPrevisto)}
          cor={C.muted}
          sub="contas a pagar com vencimento no período"
        />
        <ResumoKpi
          label="Diferença (prev. − real.)"
          valor={fmtBRL(totalPrevisto - totalRealizado)}
          cor={totalRealizado <= totalPrevisto ? C.green : C.red}
          sub={`${despesas.length + contasPagas.length} lançamento(s)`}
        />
      </div>

      {podeEditar && (
        <>
          <LancarDespesa
            contas={analiticas}
            recentes={recentes}
            onSalvo={aposSalvar}
            onErro={setErro}
          />
          <GerenciarCategorias
            contas={analiticas}
            onAtualizado={() => { carregarContas(); carregarDespesas(); }}
            onErro={setErro}
          />
        </>
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

      {/* Previsto x Realizado por categoria */}
      <PrevistoRealizado porCategoria={porCategoria} />

      {/* Ledger unificado: despesas avulsas + contas a pagar pagas (leitura) */}
      <div style={card()}>
        <div style={{ fontWeight: 700, color: C.white, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span>📒</span> Realizado no período
          <span style={{ color: C.muted, fontWeight: 400, fontSize: 12 }}>
            · despesas avulsas + contas a pagar pagas
          </span>
        </div>
        {carregando ? (
          <div style={{ color: C.muted, padding: 24, textAlign: "center" }}>Carregando…</div>
        ) : ledger.length === 0 ? (
          <div style={{ color: C.muted, padding: 24, textAlign: "center" }}>
            Nenhum gasto realizado no período. {podeEditar ? "Lance uma despesa acima 👆" : ""}
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
                {ledger.map(l => (
                  <tr key={l.key} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={td()}>{fmtData(l.data)}</td>
                    <td style={td()}>
                      <span style={{ color: C.text }}>{l.categoria}</span>
                      {l.origem === "OCR" && <span style={tag(C.purple)}>OCR</span>}
                      {l.tipo === "conta" && <span style={tag(C.muted)}>conta a pagar</span>}
                    </td>
                    <td style={td()}>{l.descricao}</td>
                    <td style={{ ...td(), color: C.muted }}>{l.forma}</td>
                    <td style={{ ...td(), textAlign: "right", color: C.red, fontWeight: 600 }}>{fmtBRL(l.valor)}</td>
                    <td style={{ ...td(), textAlign: "center" }}>
                      {l.anexoUrl
                        ? <a href={l.anexoUrl} target="_blank" rel="noreferrer" title="Ver comprovante" style={{ textDecoration: "none" }}>📎</a>
                        : <span style={{ color: C.muted }}>—</span>}
                    </td>
                    {podeEditar && (
                      <td style={{ ...td(), textAlign: "right" }}>
                        {l.tipo === "despesa" && l.despesa
                          ? <button onClick={() => excluir(l.despesa!)} title="Excluir" style={btnIcone(C.red)}>🗑</button>
                          : <span style={{ color: C.muted, fontSize: 11 }} title="Gerencie no Financeiro">↗ Financeiro</span>}
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
    if (!v || v <= 0) { onErro("Informe um valor maior que zero."); return; }
    if (!planoContaId) { onErro("Escolha uma categoria."); return; }
    if (!descricao || !descricao.trim()) { onErro("Informe uma descrição para a despesa."); return; }
    setSalvando(true); onErro("");
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
          onChange={e => setValor(e.target.value.replace(/[^0-9.,]/g, ""))}
          onKeyDown={e => { if (e.key === "Enter") salvar(); }}
          style={{ ...input(), fontSize: 32, fontWeight: 800, color: C.text, padding: "8px 12px", width: 150 }}
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
        <Campo label="Categoria *" flex={1}>
          <select value={planoContaId} onChange={e => setPlanoContaId(e.target.value)} style={input()}>
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
        <Campo label="Descrição *">
          <input value={descricao} onChange={e => setDescricao(e.target.value)}
            placeholder="Ex.: café e açúcar da copa" style={{ ...input(), maxWidth: 400 }} />
        </Campo>
      </div>

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

// ============ GERENCIAR CATEGORIAS ============

function GerenciarCategorias({ contas, onAtualizado, onErro }: {
  contas: PlanoConta[];
  onAtualizado: () => void;
  onErro: (msg: string) => void;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoCodigo, setNovoCodigo] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function adicionarCategoria() {
    const nome = novoNome.trim();
    const codigo = novoCodigo.trim();
    
    if (!nome) { onErro("Informe o nome da categoria."); return; }
    if (!codigo) { onErro("Informe o código da categoria."); return; }
    
    setSalvando(true); onErro("");
    try {
      await api.criarPlanoConta({
        codigo,
        nome,
        natureza: "DESPESA",
        analitica: true,
      });
      setNovoNome("");
      setNovoCodigo("");
      setMostrarForm(false);
      onAtualizado();
    } catch (e) { onErro((e as Error).message); }
    finally { setSalvando(false); }
  }

  // Gerar código automático baseado no último código
  const proximoCodigo = useMemo(() => {
    if (contas.length === 0) return "1.01";
    const ultimo = contas[contas.length - 1];
    const partes = ultimo.codigo.split(".");
    const ultimaParte = parseInt(partes[partes.length - 1] || "0", 10);
    return `${partes.slice(0, -1).join(".")}.${(ultimaParte + 1).toString().padStart(2, "0")}`;
  }, [contas]);

  return (
    <div style={card()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: C.white, display: "flex", alignItems: "center", gap: 8 }}>
          <span>📁</span> Categorias de despesa
        </div>
        <button
          type="button"
          onClick={() => { setMostrarForm(!mostrarForm); setNovoCodigo(proximoCodigo); }}
          style={btnSec()}
        >
          {mostrarForm ? "✕ Cancelar" : "+ Nova categoria"}
        </button>
      </div>

      {mostrarForm && (
        <div style={{ background: C.surface, padding: 12, borderRadius: 8, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <Campo label="Código *" flex={1}>
              <input
                type="text"
                value={novoCodigo}
                onChange={e => setNovoCodigo(e.target.value)}
                placeholder="Ex.: 1.05"
                style={input()}
              />
            </Campo>
            <Campo label="Nome *" flex={2}>
              <input
                type="text"
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                placeholder="Ex.: Manutenção"
                style={input()}
              />
            </Campo>
          </div>
          <button
            type="button"
            onClick={adicionarCategoria}
            disabled={salvando}
            style={btnPri(salvando)}
          >
            {salvando ? "Salvando…" : "Adicionar categoria"}
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {contas.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 13, padding: 8 }}>
            Nenhuma categoria cadastrada. Adicione a primeira acima.
          </div>
        ) : (
          contas.map(c => (
            <span
              key={c.id}
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 12,
                color: C.text,
              }}
            >
              <span style={{ color: C.muted, fontWeight: 600 }}>{c.codigo}</span>
              {" — "}
              {c.nome}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

// ============ RESUMO + PREVISTO x REALIZADO ============

function ResumoKpi({ label, valor, cor, sub }: { label: string; valor: string; cor: string; sub?: string }) {
  return (
    <div>
      <div style={{ color: C.muted, fontSize: 13 }}>{label}</div>
      <div style={{ color: cor, fontSize: 26, fontWeight: 800 }}>{valor}</div>
      {sub && <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Barras comparativas por categoria. Fundo = previsto; frente = realizado
// (vermelho quando o realizado estoura o previsto). "Sobra" = previsto ainda
// não gasto; "estouro" = gastou mais que o previsto.
function PrevistoRealizado({ porCategoria }: { porCategoria: CategoriaPR[] }) {
  if (porCategoria.length === 0) return null;
  const max = Math.max(1, ...porCategoria.map(c => Math.max(c.previsto, c.realizado)));
  return (
    <div style={card()}>
      <div style={{ fontWeight: 700, color: C.white, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span>📊</span> Previsto × Realizado por categoria
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {porCategoria.map(c => {
          const diff = c.previsto - c.realizado;
          const estourou = c.previsto > 0 && c.realizado > c.previsto;
          return (
            <div key={c.planoContaId || "sem"}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, marginBottom: 5, flexWrap: "wrap" }}>
                <span style={{ color: C.text }}>{c.nome}</span>
                <span style={{ color: C.muted }}>
                  prev. <span style={{ color: C.text }}>{fmtBRL(c.previsto)}</span>
                  {"  ·  "}real. <span style={{ color: C.red }}>{fmtBRL(c.realizado)}</span>
                  {"  ·  "}
                  <span style={{ color: estourou ? C.red : C.green }}>
                    {diff >= 0 ? "sobra " : "estouro "}{fmtBRL(Math.abs(diff))}
                  </span>
                </span>
              </div>
              <div style={{ position: "relative", height: 8, background: C.surface, borderRadius: 999 }}>
                <div style={{ position: "absolute", top: 0, left: 0, height: 8, width: `${(c.previsto / max) * 100}%`, background: C.border, borderRadius: 999 }} />
                <div style={{ position: "absolute", top: 0, left: 0, height: 8, width: `${(c.realizado / max) * 100}%`, background: estourou ? C.red : C.accent, borderRadius: 999 }} />
              </div>
            </div>
          );
        })}
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
