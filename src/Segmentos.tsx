import { useEffect, useMemo, useState, useCallback, type CSSProperties } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";
import BotoesContatoCliente from "./components/BotoesContatoCliente";
import ModalGerirTemplates from "./components/ModalGerirTemplates";
import type { TipoMensagem } from "./lib/templates";
import { CLASSIFICACOES_SCORE, corDoScore, type ClassificacaoScore } from "./lib/scoring";

// ============ CONFIGURACAO DE SEGMENTOS RFM ============

type SegmentoId = "VIP" | "RECORRENTE" | "NOVO" | "EM_RISCO" | "INATIVO" | "PROSPECT";

interface SegmentoMeta {
  id: SegmentoId;
  label: string;
  cor: string;
  icone: string;
  desc: string;
}

const SEGMENTOS: SegmentoMeta[] = [
  { id: "VIP",        label: "VIP",        cor: "#f59e0b", icone: "👑", desc: "Alto valor + frequência + recente" },
  { id: "RECORRENTE", label: "Recorrente", cor: C.green,   icone: "🔄", desc: "Compra com frequência" },
  { id: "NOVO",       label: "Novo",       cor: C.accent,  icone: "🌟", desc: "1ª compra nos últimos 30 dias" },
  { id: "EM_RISCO",   label: "Em risco",   cor: C.yellow,  icone: "⚠️", desc: "Comprava, mas há 90+ dias" },
  { id: "INATIVO",    label: "Inativo",    cor: C.muted,   icone: "💤", desc: "Sem compras há 180+ dias" },
  { id: "PROSPECT",   label: "Prospect",   cor: C.purple,  icone: "🌱", desc: "Cadastrado, nunca comprou" },
];
const SEG_MAP: Record<string, SegmentoMeta> = Object.fromEntries(SEGMENTOS.map((s) => [s.id, s]));

const fmtBRL = (v: number | string | null | undefined): string =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
};

// ============ TIPOS ============

interface Tag {
  id: string;
  nome: string;
  cor: string;
  totalClientes: number;
}

interface RfmData {
  monetario: number;
  frequencia: number;
  ticketMedio: number;
  ultimaCompra: string | null;
  recenciaDias: number;
  [extra: string]: unknown;
}

interface Template {
  id: string;
  nome: string;
  corpo: string;
  assunto?: string;
  tipo: TipoMensagem;
  ativo: boolean;
}

interface ClienteSegmentado {
  id: string;
  nome: string;
  cidade?: string;
  estado?: string;
  telefone?: string;
  email?: string;
  segmento: SegmentoId;
  score?: number;
  classificacaoScore: ClassificacaoScore;
  tags: Tag[];
  rfm: RfmData;
  [extra: string]: unknown;
}

interface ResumoSegmento {
  quantidade: number;
  monetario: number;
}

interface DadosSegmentos {
  janelaDias: number;
  clientes: ClienteSegmentado[];
  resumo: Record<string, ResumoSegmento>;
}

interface EditandoTag {
  id?: string;
  nome: string;
  cor: string;
}

// ============ COMPONENTE PRINCIPAL ============

interface SegmentosProps {
  user: SessionUser;
}

export default function Segmentos({ user }: SegmentosProps) {
  const [dados, setDados] = useState<DadosSegmentos | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroSeg, setFiltroSeg] = useState<SegmentoId | "">("");
  const [filtroTagId, setFiltroTagId] = useState("");
  const [filtroScore, setFiltroScore] = useState<ClassificacaoScore | "">("");
  const [search, setSearch] = useState("");
  const [janela, setJanela] = useState(365);
  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [modalTag, setModalTag] = useState<ClienteSegmentado | null>(null);
  const [modalGerirTags, setModalGerirTags] = useState(false);
  const [modalTemplates, setModalTemplates] = useState(false);

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE" || user.role === "VENDEDOR";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [seg, tagsRes, templatesRes] = await Promise.all([
        api.segmentosClientes({ dias: String(janela) }),
        api.listarTags().catch(() => []),
        api.listarTemplates({ ativo: "true" }).catch(() => []),
      ]);
      setDados(seg as DadosSegmentos);
      setTags((tagsRes as Tag[]) || []);
      setTemplates((templatesRes as Template[]) || []);
    } catch (e) {
      setErro((e as Error).message || "Erro ao carregar segmentos");
    } finally {
      setCarregando(false);
    }
  }, [janela]);

  useEffect(() => { carregar(); }, [carregar]);

  const clientesFiltrados = useMemo(() => {
    if (!dados) return [];
    let lista = dados.clientes;
    if (filtroSeg) lista = lista.filter((c) => c.segmento === filtroSeg);
    if (filtroTagId) lista = lista.filter((c) => c.tags.some((t) => t.id === filtroTagId));
    if (filtroScore) lista = lista.filter((c) => c.classificacaoScore === filtroScore);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      lista = lista.filter((c) => c.nome.toLowerCase().includes(q));
    }
    return [...lista].sort((a, b) => b.rfm.monetario - a.rfm.monetario);
  }, [dados, filtroSeg, filtroTagId, filtroScore, search]);

  async function toggleTag(clienteId: string, tagId: string, ativa: boolean) {
    try {
      if (ativa) await api.removerTagCliente(clienteId, tagId);
      else await api.atribuirTagCliente(clienteId, tagId);
      await carregar();
      if (modalTag && modalTag.id === clienteId) {
        const resp = await api.segmentosClientes({ dias: String(janela) }) as DadosSegmentos;
        const atualizado = resp.clientes.find((c) => c.id === clienteId);
        if (atualizado) setModalTag(atualizado);
      }
    } catch (e) {
      alert((e as Error).message || "Erro ao atualizar tag");
    }
  }

  return (
    <div className="p-4 text-gp-text">
      <Cabecalho
        dados={dados}
        janela={janela}
        onJanela={setJanela}
        onGerirTags={() => setModalGerirTags(true)}
        onGerirTemplates={() => setModalTemplates(true)}
        podeEditar={podeEditar && (user.role === "ADMIN" || user.role === "GERENTE")}
      />

      {erro && (
        <div
          className="px-[14px] py-[10px] rounded-lg mb-3 text-[13px] text-gp-red"
          style={{ background: C.red + "22" }}
        >
          {erro}
        </div>
      )}

      {/* Cards de segmento */}
      {dados && (
        <div
          className="grid gap-[10px] mb-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
        >
          {SEGMENTOS.map((s) => {
            const r = dados.resumo[s.id] || { quantidade: 0, monetario: 0 };
            const ativo = filtroSeg === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setFiltroSeg(ativo ? "" : s.id)}
                className="text-left rounded-[10px] cursor-pointer"
                style={{
                  background: ativo ? s.cor + "22" : C.surface,
                  border: `2px solid ${ativo ? s.cor : C.border}`,
                  padding: "12px 14px",
                  transition: "all 0.12s ease",
                }}
              >
                <div
                  className="flex items-center gap-1.5 text-[11px] font-bold uppercase"
                  style={{ color: s.cor, letterSpacing: 0.4 }}
                >
                  <span className="text-sm">{s.icone}</span> {s.label}
                </div>
                <div className="text-gp-white text-[22px] font-extrabold mt-1.5 leading-none">
                  {r.quantidade}
                </div>
                <div className="text-gp-muted text-[11px] mt-1">
                  {fmtBRL(r.monetario)}
                </div>
                <div className="text-gp-muted text-[10px] mt-1.5 italic">
                  {s.desc}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap items-center mb-3">
        <input
          type="text"
          placeholder="🔍 Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar cliente"
          style={inputFiltroStyle(260)}
        />
        <select
          value={filtroTagId}
          onChange={(e) => setFiltroTagId(e.target.value)}
          aria-label="Filtrar por tag"
          style={inputFiltroStyle(220)}
        >
          <option value="">Todas as tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.nome} ({t.totalClientes})</option>
          ))}
        </select>
        <select
          value={filtroScore}
          onChange={(e) => setFiltroScore(e.target.value as ClassificacaoScore | "")}
          aria-label="Filtrar por score"
          style={inputFiltroStyle(160)}
        >
          <option value="">Todos scores</option>
          {(Object.entries(CLASSIFICACOES_SCORE) as [ClassificacaoScore, typeof CLASSIFICACOES_SCORE[ClassificacaoScore]][]).map(([id, c]) => (
            <option key={id} value={id}>{c.icone} {c.label}</option>
          ))}
        </select>
        {(filtroSeg || filtroTagId || filtroScore || search) && (
          <button
            type="button"
            onClick={() => { setFiltroSeg(""); setFiltroTagId(""); setFiltroScore(""); setSearch(""); }}
            className="bg-transparent text-gp-muted rounded-md cursor-pointer text-xs"
            style={{
              border: `1px solid ${C.border}`,
              padding: "8px 12px",
            }}
          >
            Limpar filtros
          </button>
        )}
        <div className="ml-auto text-gp-muted text-xs">
          {clientesFiltrados.length} {clientesFiltrados.length === 1 ? "cliente" : "clientes"}
        </div>
      </div>

      {/* Tabela */}
      {carregando ? (
        <div className="text-gp-muted py-10 text-center">Calculando segmentação RFM...</div>
      ) : clientesFiltrados.length === 0 ? (
        <div className="text-gp-muted text-center py-10 bg-gp-surface rounded-lg">
          Nenhum cliente nessa combinação de filtros.
        </div>
      ) : (
        <TabelaClientes
          clientes={clientesFiltrados}
          templates={templates}
          onAbrirTags={(c) => setModalTag(c)}
          podeEditar={podeEditar}
        />
      )}

      {modalTag && (
        <ModalGerenciarTagsCliente
          cliente={modalTag}
          tags={tags}
          onToggleTag={(tagId, ativa) => toggleTag(modalTag.id, tagId, ativa)}
          onFechar={() => setModalTag(null)}
          onNovaTag={() => { setModalGerirTags(true); }}
          podeEditar={podeEditar}
        />
      )}

      {modalGerirTags && (
        <ModalGerirTags
          tags={tags}
          onFechar={() => setModalGerirTags(false)}
          onMudou={carregar}
          podeEditar={podeEditar && (user.role === "ADMIN" || user.role === "GERENTE")}
          podeExcluir={user.role === "ADMIN"}
        />
      )}

      {modalTemplates && (
        <ModalGerirTemplates
          onFechar={() => { setModalTemplates(false); carregar(); }}
          podeEditar={user.role === "ADMIN" || user.role === "GERENTE"}
          podeExcluir={user.role === "ADMIN"}
        />
      )}
    </div>
  );
}

// ============ CABECALHO ============

interface CabecalhoProps {
  dados: DadosSegmentos | null;
  janela: number;
  onJanela: (v: number) => void;
  onGerirTags: () => void;
  onGerirTemplates: () => void;
  podeEditar: boolean;
}

function Cabecalho({ dados, janela, onJanela, onGerirTags, onGerirTemplates, podeEditar }: CabecalhoProps) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <div>
        <h2 className="m-0 text-gp-white text-[22px] font-bold">
          📊 Segmentação de Clientes (RFM)
        </h2>
        <div className="text-gp-muted text-[13px] mt-0.5">
          Classificação automática por Recência, Frequência e Valor monetário
          {dados && ` · janela de ${dados.janelaDias} dias · base de ${dados.clientes.length} clientes ativos`}
        </div>
      </div>
      <div className="flex gap-2 items-center">
        <select
          value={janela}
          onChange={(e) => onJanela(parseInt(e.target.value, 10))}
          aria-label="Janela de análise"
          style={inputFiltroStyle(180)}
        >
          <option value={90}>Últimos 90 dias</option>
          <option value={180}>Últimos 180 dias</option>
          <option value={365}>Últimos 365 dias</option>
          <option value={730}>Últimos 2 anos</option>
        </select>
        {podeEditar && (
          <button
            type="button"
            onClick={onGerirTags}
            className="bg-gp-card text-gp-text rounded-md cursor-pointer text-[13px]"
            style={{ border: `1px solid ${C.border}`, padding: "8px 14px" }}
          >
            🏷️ Gerir Tags
          </button>
        )}
        {podeEditar && (
          <button
            type="button"
            onClick={onGerirTemplates}
            className="bg-gp-card text-gp-text rounded-md cursor-pointer text-[13px]"
            style={{ border: `1px solid ${C.border}`, padding: "8px 14px" }}
          >
            📨 Templates
          </button>
        )}
      </div>
    </div>
  );
}

function inputFiltroStyle(width: number): CSSProperties {
  return {
    background: C.card,
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 13,
    width,
  };
}

// ============ TABELA ============

interface TabelaClientesProps {
  clientes: ClienteSegmentado[];
  templates: Template[];
  onAbrirTags: (c: ClienteSegmentado) => void;
  podeEditar: boolean;
}

function TabelaClientes({ clientes, templates, onAbrirTags, podeEditar }: TabelaClientesProps) {
  return (
    <div
      className="bg-gp-surface rounded-lg overflow-hidden"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr
              className="text-gp-muted text-[11px] uppercase"
              style={{ background: C.bg, letterSpacing: 0.5 }}
            >
              <th style={thStyle}>Cliente</th>
              <th style={{ ...thStyle, minWidth: 110 }}>Score</th>
              <th style={thStyle}>Segmento</th>
              <th style={thStyle}>Tags</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Total gasto</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Compras</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Ticket médio</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Última compra</th>
              <th style={thStyle}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => {
              const seg = SEG_MAP[c.segmento] || SEGMENTOS[0];
              return (
                <tr key={c.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={tdStyle}>
                    <div className="text-gp-white font-semibold">{c.nome}</div>
                    <div className="text-gp-muted text-[11px]">
                      {[c.cidade, c.estado].filter(Boolean).join("/")}
                      {c.telefone && ` · ${c.telefone}`}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <ScoreBar score={c.score ?? 0} classificacao={c.classificacaoScore} />
                  </td>
                  <td style={tdStyle}>
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-bold rounded"
                      style={{
                        background: seg.cor + "22",
                        color: seg.cor,
                        padding: "3px 8px",
                      }}
                    >
                      <span>{seg.icone}</span> {seg.label}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div className="flex gap-1 flex-wrap" style={{ maxWidth: 200 }}>
                      {c.tags.length === 0 && <span className="text-gp-muted text-[11px]">—</span>}
                      {c.tags.map((t) => (
                        <span
                          key={t.id}
                          className="text-[10px] font-bold rounded"
                          style={{
                            background: t.cor + "22",
                            color: t.cor,
                            padding: "2px 6px",
                            border: `1px solid ${t.cor}66`,
                          }}
                        >
                          {t.nome}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }} className="text-gp-green font-bold">
                    {fmtBRL(c.rfm.monetario)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }} className="text-gp-text">{c.rfm.frequencia}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }} className="text-gp-muted">
                    {c.rfm.frequencia > 0 ? fmtBRL(c.rfm.ticketMedio) : "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }} className="text-gp-muted text-xs">
                    {c.rfm.ultimaCompra ? (
                      <>
                        {fmtData(c.rfm.ultimaCompra)}
                        <div
                          className="text-[10px]"
                          style={{ color: c.rfm.recenciaDias > 90 ? C.red : C.muted }}
                        >
                          {c.rfm.recenciaDias}d atrás
                        </div>
                      </>
                    ) : "Nunca"}
                  </td>
                  <td style={tdStyle}>
                    <div className="flex gap-1">
                      <BotoesContatoCliente cliente={c} templates={templates} />
                      {podeEditar && (
                        <button
                          type="button"
                          onClick={() => onAbrirTags(c)}
                          title="Gerenciar tags"
                          className="bg-transparent text-gp-muted rounded text-[13px] cursor-pointer"
                          style={{
                            border: `1px solid ${C.border}`,
                            padding: "4px 8px",
                          }}
                        >
                          🏷️
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface ScoreBarProps {
  score: number;
  classificacao: ClassificacaoScore;
}

function ScoreBar({ score, classificacao }: ScoreBarProps) {
  const cls = CLASSIFICACOES_SCORE[classificacao] || CLASSIFICACOES_SCORE.FRIO;
  const cor = corDoScore(score);
  return (
    <div title={`${cls.icone} ${cls.label} · ${cls.desc}`}>
      <div className="flex items-center justify-between mb-[3px] gap-1">
        <span
          className="text-[11px] font-bold inline-flex items-center gap-[3px]"
          style={{ color: cor }}
        >
          {cls.icone} {cls.label}
        </span>
        <span className="text-xs font-extrabold" style={{ color: cor }}>{score}</span>
      </div>
      <div
        className="w-full overflow-hidden rounded-[3px]"
        style={{
          height: 5,
          background: C.bg,
          border: `1px solid ${C.border}`,
        }}
      >
        <div
          className="h-full"
          style={{
            width: `${score}%`,
            background: cor,
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

const thStyle: CSSProperties = { padding: "10px 12px", textAlign: "left", fontWeight: 700 };
const tdStyle: CSSProperties = { padding: "10px 12px", verticalAlign: "middle" };

// ============ MODAL GERENCIAR TAGS DE UM CLIENTE ============

interface ModalGerenciarTagsClienteProps {
  cliente: ClienteSegmentado;
  tags: Tag[];
  onToggleTag: (tagId: string, ativa: boolean) => void;
  onFechar: () => void;
  onNovaTag: () => void;
  podeEditar: boolean;
}

function ModalGerenciarTagsCliente({ cliente, tags, onToggleTag, onFechar, onNovaTag, podeEditar }: ModalGerenciarTagsClienteProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onFechar(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar]);

  const tagsAtivasIds = new Set(cliente.tags.map((t) => t.id));

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", zIndex: 1000 }}
    >
      <div
        className="bg-gp-surface w-full overflow-y-auto"
        style={{
          borderRadius: 12,
          border: `1px solid ${C.border}`,
          maxWidth: 480,
          maxHeight: "85vh",
        }}
      >
        <div
          className="flex justify-between items-center"
          style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}
        >
          <div>
            <div className="text-gp-white text-base font-bold">🏷️ Tags do cliente</div>
            <div className="text-gp-muted text-xs mt-0.5">{cliente.nome}</div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="bg-transparent text-gp-muted border-none cursor-pointer"
            style={{ fontSize: 22, padding: 4 }}
          >
            ×
          </button>
        </div>
        <div className="p-5 flex flex-col gap-1.5">
          {tags.length === 0 && (
            <div className="text-gp-muted text-[13px] text-center p-5">
              Nenhuma tag cadastrada ainda.
              {podeEditar && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={onNovaTag}
                    className="border-none rounded-md cursor-pointer text-xs"
                    style={{
                      background: C.accent,
                      color: "var(--accent-ink)",
                      padding: "6px 14px",
                    }}
                  >
                    + Criar primeira tag
                  </button>
                </div>
              )}
            </div>
          )}
          {tags.map((t) => {
            const ativa = tagsAtivasIds.has(t.id);
            return (
              <label
                key={t.id}
                className="flex items-center gap-2.5 rounded-md"
                style={{
                  padding: "8px 10px",
                  cursor: podeEditar ? "pointer" : "default",
                  background: ativa ? t.cor + "11" : "transparent",
                  border: `1px solid ${ativa ? t.cor + "55" : C.border}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={ativa}
                  disabled={!podeEditar}
                  onChange={() => onToggleTag(t.id, ativa)}
                  aria-label={`Tag ${t.nome}`}
                  style={{ accentColor: t.cor }}
                />
                <span
                  className="text-[11px] font-bold rounded"
                  style={{
                    background: t.cor + "22",
                    color: t.cor,
                    padding: "2px 8px",
                  }}
                >
                  {t.nome}
                </span>
                <span className="text-gp-muted text-[11px] ml-auto">
                  {t.totalClientes} {t.totalClientes === 1 ? "cliente" : "clientes"}
                </span>
              </label>
            );
          })}
        </div>
        <div
          className="flex justify-end gap-2"
          style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}` }}
        >
          {podeEditar && tags.length > 0 && (
            <button
              type="button"
              onClick={onNovaTag}
              className="bg-transparent rounded-md cursor-pointer text-[13px]"
              style={{
                color: C.accent,
                border: `1px solid ${C.accent}`,
                padding: "8px 14px",
              }}
            >
              + Nova tag
            </button>
          )}
          <button
            type="button"
            onClick={onFechar}
            className="border-none rounded-md cursor-pointer text-[13px] font-bold"
            style={{
              background: C.accent,
              color: "var(--accent-ink)",
              padding: "8px 22px",
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ MODAL CRUD DE TAGS ============

interface ModalGerirTagsProps {
  tags: Tag[];
  onFechar: () => void;
  onMudou: () => Promise<void> | void;
  podeEditar: boolean;
  podeExcluir: boolean;
}

function ModalGerirTags({ tags, onFechar, onMudou, podeEditar, podeExcluir }: ModalGerirTagsProps) {
  const [editando, setEditando] = useState<EditandoTag | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !editando) onFechar(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar, editando]);

  async function salvar() {
    if (!editando || !editando.nome.trim()) return;
    setSalvando(true);
    try {
      if (editando.id) {
        await api.atualizarTag(editando.id, { nome: editando.nome.trim(), cor: editando.cor });
      } else {
        await api.criarTag({ nome: editando.nome.trim(), cor: editando.cor });
      }
      setEditando(null);
      await onMudou();
    } catch (e) {
      alert((e as Error).message || "Erro ao salvar tag");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(tag: Tag) {
    if (!confirm(`Excluir tag "${tag.nome}"? Sera removida de ${tag.totalClientes} cliente(s).`)) return;
    try {
      await api.excluirTag(tag.id);
      await onMudou();
    } catch (e) {
      alert((e as Error).message || "Erro ao excluir tag");
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !editando) onFechar(); }}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", zIndex: 1000 }}
    >
      <div
        className="bg-gp-surface w-full overflow-y-auto"
        style={{
          borderRadius: 12,
          border: `1px solid ${C.border}`,
          maxWidth: 560,
          maxHeight: "85vh",
        }}
      >
        <div
          className="flex justify-between items-center"
          style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}
        >
          <div className="text-gp-white text-base font-bold">🏷️ Gerir Tags</div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="bg-transparent text-gp-muted border-none cursor-pointer"
            style={{ fontSize: 22, padding: 4 }}
          >
            ×
          </button>
        </div>

        <div className="p-5">
          {podeEditar && !editando && (
            <button
              type="button"
              onClick={() => setEditando({ nome: "", cor: "#4f8ef7" })}
              className="text-gp-white border-none rounded-md cursor-pointer text-[13px] font-bold mb-3.5"
              style={{
                background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                padding: "8px 18px",
              }}
            >
              + Nova tag
            </button>
          )}

          {editando && (
            <div
              className="bg-gp-bg rounded-lg p-3.5 mb-3.5"
              style={{ border: `1px solid ${C.border}` }}
            >
              <div
                className="text-gp-muted text-[11px] uppercase mb-1"
                style={{ letterSpacing: 0.5 }}
              >
                {editando.id ? "Editando tag" : "Nova tag"}
              </div>
              <div className="flex gap-2 items-center flex-wrap">
                <input
                  autoFocus
                  value={editando.nome}
                  onChange={(e) => setEditando({ ...editando, nome: e.target.value.toUpperCase() })}
                  placeholder="VIP, ATACADO, B2B..."
                  maxLength={30}
                  aria-label="Nome da tag"
                  style={{ ...inputFiltroStyle(220), background: C.surface }}
                />
                <input
                  type="color"
                  value={editando.cor}
                  onChange={(e) => setEditando({ ...editando, cor: e.target.value })}
                  aria-label="Cor da tag"
                  className="cursor-pointer bg-transparent"
                  style={{
                    width: 48,
                    height: 34,
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    padding: 2,
                  }}
                />
                <span
                  className="text-[11px] font-bold rounded"
                  style={{
                    background: editando.cor + "22",
                    color: editando.cor,
                    padding: "3px 10px",
                  }}
                >
                  {editando.nome || "PREVIEW"}
                </span>
                <button
                  type="button"
                  onClick={salvar}
                  disabled={salvando || !editando.nome.trim()}
                  className="border-none rounded-md cursor-pointer text-xs font-bold"
                  style={{
                    background: C.accent,
                    color: "var(--accent-ink)",
                    padding: "7px 14px",
                  }}
                >
                  {salvando ? "..." : "Salvar"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditando(null)}
                  disabled={salvando}
                  className="bg-transparent text-gp-muted rounded-md cursor-pointer text-xs"
                  style={{
                    border: `1px solid ${C.border}`,
                    padding: "7px 14px",
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {tags.length === 0 ? (
            <div className="text-gp-muted text-[13px] text-center" style={{ padding: 30 }}>
              Nenhuma tag cadastrada.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {tags.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2.5 rounded-md"
                  style={{
                    padding: "8px 10px",
                    border: `1px solid ${C.border}`,
                  }}
                >
                  <span
                    className="text-[11px] font-bold rounded"
                    style={{
                      background: t.cor + "22",
                      color: t.cor,
                      padding: "3px 10px",
                    }}
                  >
                    {t.nome}
                  </span>
                  <span className="text-gp-muted text-[11px]">
                    {t.totalClientes} {t.totalClientes === 1 ? "cliente" : "clientes"}
                  </span>
                  <div className="ml-auto flex gap-1">
                    {podeEditar && (
                      <button
                        type="button"
                        onClick={() => setEditando({ id: t.id, nome: t.nome, cor: t.cor })}
                        className="bg-transparent text-gp-muted rounded cursor-pointer text-[11px]"
                        style={{
                          border: `1px solid ${C.border}`,
                          padding: "4px 10px",
                        }}
                      >
                        Editar
                      </button>
                    )}
                    {podeExcluir && (
                      <button
                        type="button"
                        onClick={() => excluir(t)}
                        aria-label={`Excluir tag ${t.nome}`}
                        className="bg-transparent rounded cursor-pointer text-[11px]"
                        style={{
                          color: C.red,
                          border: `1px solid ${C.red}44`,
                          padding: "4px 10px",
                        }}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
