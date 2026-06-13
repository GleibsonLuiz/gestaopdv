// Despesas.tsx — lancamento rapido de despesas operacionais (cafe, agua,
// limpeza, etc.), classificadas pelo Plano de Contas. Pensado para ser tao
// rapido quanto mandar um WhatsApp: valor em destaque, categorias recentes em
// 1 toque, seletor de categoria pesquisavel (com criacao inline da categoria
// quando nao existe), foto do comprovante opcional. Lista as despesas do
// periodo com filtro por categoria. (Modulo DESPESAS — backend /despesas +
// /planos-contas.) A gestao completa do plano de contas vive em Contabilidade;
// aqui a categoria e criada/escolhida no proprio fluxo de lancamento.

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

  // Quem tem o modulo DESPESAS liberado pode lancar/editar/excluir (nao so
  // ADMIN/GERENTE). O acesso a esta tela ja exige a permissao DESPESAS, entao
  // isto alinha o poder de edicao a permissao concedida pelo admin. (Mesma
  // logica de podeAcessar: ADMIN sempre; demais checam a lista de permissoes.)
  const podeEditar = user.role === "ADMIN" || (user.permissoes?.includes("DESPESAS") ?? false);

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
        <LancarDespesa
          contas={analiticas}
          recentes={recentes}
          onSalvo={aposSalvar}
          onErro={setErro}
          onCategoriaCriada={carregarContas}
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

function LancarDespesa({ contas, recentes, onSalvo, onErro, onCategoriaCriada }: {
  contas: PlanoConta[];
  recentes: string[];
  onSalvo: () => void;
  onErro: (msg: string) => void;
  onCategoriaCriada: () => void;
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
  const [ocrFalhou, setOcrFalhou] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const chips = contas.filter(c => recentes.includes(c.id));

  // OCR: envia o comprovante, a IA le e devolvemos os campos sugeridos para
  // pre-preencher. O usuario confere e confirma — nunca grava sozinho. Falha
  // silenciosa: se a IA nao responder, segue no preenchimento manual.
  async function lerComprovante(file: File) {
    setLendo(true); setOcrFalhou(false); onErro("");
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
    } catch {
      // Best-effort: anexo continua salvo, so a leitura por IA falhou. Avisa
      // discretamente e segue no preenchimento manual (sem toast global).
      setOcrFalhou(true);
    }
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
    <div style={{ ...card(), borderColor: C.accent, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ fontWeight: 700, color: C.white, display: "flex", alignItems: "center", gap: 8 }}>
        <span>⚡</span> Lançar despesa
      </div>

      {/* Linha 1 — valor em destaque + atalhos de categorias recentes lado a lado */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ color: C.muted, fontSize: 12 }}>Valor *</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: C.muted, fontSize: 22, fontWeight: 700 }}>R$</span>
            <input
              type="text" inputMode="decimal" placeholder="0,00" value={valor} autoFocus
              onChange={e => setValor(e.target.value.replace(/[^0-9.,]/g, ""))}
              onKeyDown={e => { if (e.key === "Enter") salvar(); }}
              style={{ ...input(), fontSize: 32, fontWeight: 800, color: C.text, padding: "6px 12px", width: 170 }}
            />
          </div>
        </label>

        {chips.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 220 }}>
            <span style={{ color: C.muted, fontSize: 12 }}>Recentes</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {chips.map(c => (
                <button key={c.id} type="button" onClick={() => setPlanoContaId(c.id)}
                  style={chip(planoContaId === c.id)}>
                  {c.nome}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Linha 2 — grid responsivo: categoria (larga) + data + forma; descricao
          ocupa a faixa inteira embaixo. auto-fit colapsa sozinho no mobile. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <Campo label="Categoria *" style={{ gridColumn: "span 2" }}>
          <SeletorCategoria
            contas={contas}
            value={planoContaId}
            onChange={setPlanoContaId}
            onCriada={onCategoriaCriada}
            onErro={onErro}
          />
        </Campo>
        <Campo label="Data">
          <input type="date" value={data} onChange={e => setData(e.target.value)} style={input()} />
        </Campo>
        <Campo label="Forma">
          <select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} style={input()}>
            {FORMAS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <div style={{ fontSize: 10, marginTop: 4, color: formaPagamento === "DINHEIRO" ? C.green : C.muted }}>
            {formaPagamento === "DINHEIRO"
              ? "💵 Sai do dinheiro do caixa do dia"
              : "Não movimenta o caixa (saída bancária)"}
          </div>
        </Campo>
        <Campo label="Descrição *" style={{ gridColumn: "1 / -1" }}>
          <input value={descricao} onChange={e => setDescricao(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") salvar(); }}
            placeholder="Ex.: café e açúcar da copa" style={input()} />
        </Campo>
      </div>

      {/* Linha 3 — comprovante + acao principal */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={lendo} style={btnSec()}>
          {lendo ? "🔎 Lendo comprovante…" : arquivo ? `📎 ${arquivo.name.slice(0, 24)}` : "📷 Comprovante (lê sozinho)"}
        </button>
        {arquivo && !lendo && (
          <button type="button" onClick={() => { setArquivo(null); setOrigemOcr(false); if (fileRef.current) fileRef.current.value = ""; }}
            style={{ ...btnSec(), color: C.red }}>Remover</button>
        )}
        {origemOcr && !lendo && <span style={tag(C.purple)}>preenchido por IA — confira</span>}
        {ocrFalhou && !lendo && <span style={tag(C.yellow)}>não consegui ler — preencha manualmente</span>}
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

// ============ SELETOR DE CATEGORIA (combobox pesquisavel + criacao inline) ============
//
// Substitui o <select> nativo (sem busca) e o antigo card "Gerenciar
// categorias" (parede de badges). Um unico ponto: busca, seleciona e, se a
// categoria nao existe, cria na hora (sem sair do lancamento). Respeita o tema
// via CSS-vars; fecha ao clicar fora / Esc; navegacao por teclado.
function SeletorCategoria({ contas, value, onChange, onCriada, onErro }: {
  contas: PlanoConta[];
  value: string;
  onChange: (id: string) => void;
  onCriada: () => void;
  onErro: (msg: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  const selecionada = contas.find(c => c.id === value);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return contas;
    return contas.filter(c => c.nome.toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q));
  }, [contas, busca]);

  // Termo digitado nao bate com nenhuma categoria existente (por nome) → oferece
  // criar. >=2 chars evita oferecer criacao a cada tecla.
  const termo = busca.trim();
  const podeCriar = termo.length >= 2 && !contas.some(c => c.nome.toLowerCase() === termo.toLowerCase());

  // Proximo codigo sugerido: incrementa o ultimo segmento do codigo da ultima
  // conta, preservando a largura do segmento (ex.: "3.1.05.001" → "3.1.05.002",
  // nao "3.1.05.02") para manter o padrao do plano de contas.
  const proximoCodigo = useMemo(() => {
    if (contas.length === 0) return "1.01";
    const partes = contas[contas.length - 1].codigo.split(".");
    const ultimoSeg = partes[partes.length - 1] || "0";
    const proximo = (parseInt(ultimoSeg, 10) + 1).toString().padStart(ultimoSeg.length, "0");
    return `${partes.slice(0, -1).join(".")}.${proximo}`;
  }, [contas]);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [aberto]);

  // Foca a busca ao abrir.
  useEffect(() => { if (aberto) buscaRef.current?.focus(); }, [aberto]);

  function escolher(id: string) {
    onChange(id);
    setAberto(false);
    setBusca("");
  }

  async function criarCategoria() {
    if (!termo) return;
    setCriando(true); onErro("");
    try {
      const nova = await api.criarPlanoConta({
        codigo: proximoCodigo, nome: termo, natureza: "DESPESA", analitica: true,
      }) as PlanoConta;
      onCriada();                 // recarrega a lista no pai
      if (nova?.id) onChange(nova.id);
      setAberto(false);
      setBusca("");
    } catch (e) { onErro((e as Error).message); }
    finally { setCriando(false); }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button type="button" onClick={() => setAberto(a => !a)}
        style={{ ...input(), display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", textAlign: "left", gap: 8 }}>
        <span style={{ color: selecionada ? C.text : C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selecionada ? `${selecionada.codigo} — ${selecionada.nome}` : "Selecione a categoria…"}
        </span>
        <span style={{ color: C.muted, transform: aberto ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
      </button>

      {aberto && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,.4)", overflow: "hidden" }}>
          <div style={{ padding: 8, borderBottom: `1px solid ${C.border}` }}>
            <input ref={buscaRef} value={busca} onChange={e => setBusca(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); if (filtradas[0]) escolher(filtradas[0].id); else if (podeCriar) criarCategoria(); }
                else if (e.key === "Escape") setAberto(false);
              }}
              placeholder="Buscar ou criar categoria…" style={input()} />
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {filtradas.map(c => (
              <button key={c.id} type="button" onClick={() => escolher(c.id)}
                style={{ display: "block", width: "100%", textAlign: "left", background: c.id === value ? C.surface : "transparent", border: "none", borderBottom: `1px solid ${C.border}`, padding: "9px 12px", color: C.text, fontSize: 13, cursor: "pointer" }}>
                <span style={{ color: C.muted, fontWeight: 600 }}>{c.codigo}</span> — {c.nome}
              </button>
            ))}
            {filtradas.length === 0 && !podeCriar && (
              <div style={{ padding: 12, color: C.muted, fontSize: 13, textAlign: "center" }}>Nenhuma categoria encontrada.</div>
            )}
            {podeCriar && (
              <button type="button" onClick={criarCategoria} disabled={criando}
                style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "10px 12px", color: C.accent, fontSize: 13, fontWeight: 600, cursor: criando ? "default" : "pointer", opacity: criando ? 0.7 : 1 }}>
                {criando ? "Criando…" : `➕ Criar categoria “${termo}”`}
              </button>
            )}
          </div>
        </div>
      )}
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

function Campo({ label, children, flex, style }: { label: string; children: ReactNode; flex?: number; style?: CSSProperties }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: flex ?? 1, minWidth: 140, ...style }}>
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
