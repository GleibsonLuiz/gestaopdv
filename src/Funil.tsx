import { useEffect, useMemo, useState, useCallback, type CSSProperties, type ReactNode, type DragEvent } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser, type Role } from "./lib/api";
import SelectBusca from "./components/SelectBusca";

// ============ TIPOS ============

type EtapaId = "LEAD" | "QUALIFICADO" | "PROPOSTA" | "NEGOCIACAO" | "GANHO" | "PERDIDO";

interface EtapaMeta {
  id: EtapaId;
  label: string;
  cor: string;
  icone: string;
}

const ETAPAS: EtapaMeta[] = [
  { id: "LEAD",        label: "Lead",        cor: C.muted,  icone: "🌱" },
  { id: "QUALIFICADO", label: "Qualificado", cor: C.accent, icone: "✨" },
  { id: "PROPOSTA",    label: "Proposta",    cor: "#7c3aed", icone: "📨" },
  { id: "NEGOCIACAO",  label: "Negociação",  cor: C.yellow, icone: "🤝" },
  { id: "GANHO",       label: "Ganho",       cor: C.green,  icone: "🏆" },
  { id: "PERDIDO",     label: "Perdido",     cor: C.red,    icone: "💔" },
];

const ORIGENS = [
  "INDICACAO", "INSTAGRAM", "FACEBOOK", "GOOGLE",
  "WHATSAPP", "WALK_IN", "SITE", "TELEFONE", "OUTROS",
];

const fmtBRL = (v: number | string | null | undefined): string =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
};

const fmtDataInput = (iso: string | null | undefined): string => {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
};

interface ClienteRef {
  id: string;
  nome: string;
  [extra: string]: unknown;
}

interface VendedorRef {
  id: string;
  nome: string;
  role: Role;
}

interface UserRef {
  nome?: string;
}

interface HistoricoEntry {
  id: string;
  etapaAnterior: EtapaId | null;
  etapaNova: EtapaId;
  user?: UserRef | null;
  createdAt: string;
  observacao?: string | null;
}

interface Oportunidade {
  id: string;
  numero: number;
  titulo: string;
  descricao?: string | null;
  valorEstimado?: number | null;
  probabilidade?: number | null;
  dataFechamentoPrevista?: string | null;
  origem?: string | null;
  clienteId?: string | null;
  responsavelId?: string | null;
  etapa: EtapaId;
  motivoPerda?: string | null;
  cliente?: ClienteRef | null;
  responsavel?: VendedorRef | null;
  criadoPor?: UserRef | null;
  createdAt?: string;
  updatedAt?: string;
  historico?: HistoricoEntry[];
}

interface FormOportunidade {
  id?: string;
  titulo: string;
  descricao: string;
  valorEstimado: string;
  probabilidade: string;
  dataFechamentoPrevista: string;
  origem: string;
  clienteId: string;
  responsavelId: string;
  etapa: EtapaId;
  motivoPerda?: string;
  numero?: number;
  cliente?: ClienteRef | null;
  responsavel?: VendedorRef | null;
  criadoPor?: UserRef | null;
  createdAt?: string;
  updatedAt?: string;
  historico?: HistoricoEntry[];
}

const VAZIO: FormOportunidade = {
  titulo: "", descricao: "", valorEstimado: "", probabilidade: "",
  dataFechamentoPrevista: "", origem: "", clienteId: "", responsavelId: "",
  etapa: "LEAD",
};

interface Filtros {
  responsavelId: string;
  origem: string;
  search: string;
  [extra: string]: string;
}

interface ResumoFunil {
  totalAberto: number;
  valorPonderadoAberto: number;
  totalGanho: number;
  valorGanho: number;
  totalPerdido: number;
  taxaConversao: number;
}

interface ConfirmPerda {
  id: string;
  etapaAntiga: EtapaId;
}

// ============ COMPONENTE PRINCIPAL ============

interface FunilProps {
  user: SessionUser;
}

export default function Funil({ user }: FunilProps) {
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([]);
  const [resumo, setResumo] = useState<ResumoFunil | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtros, setFiltros] = useState<Filtros>({ responsavelId: "", origem: "", search: "" });
  const [vendedores, setVendedores] = useState<VendedorRef[]>([]);
  const [clientes, setClientes] = useState<ClienteRef[]>([]);
  const [editando, setEditando] = useState<FormOportunidade | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [etapaHover, setEtapaHover] = useState<EtapaId | null>(null);
  const [confirmPerda, setConfirmPerda] = useState<ConfirmPerda | null>(null);

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE" || user.role === "VENDEDOR";
  const podeExcluir = user.role === "ADMIN" || user.role === "GERENTE";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [lista, res] = await Promise.all([
        api.listarOportunidades(filtros),
        api.resumoFunilOportunidades(filtros.responsavelId ? { responsavelId: filtros.responsavelId } : {}),
      ]);
      setOportunidades((lista as Oportunidade[]) || []);
      setResumo(res as ResumoFunil);
    } catch (e) {
      setErro((e as Error).message || "Erro ao carregar funil");
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [funcs, clis] = await Promise.all([
          api.listarResponsaveis().catch(() => []),
          api.listarClientes({ ativo: "true" }).catch(() => []),
        ]);
        if (!ativo) return;
        setVendedores((funcs as VendedorRef[]) || []);
        setClientes((clis as ClienteRef[]) || []);
      } catch {
        // ignore
      }
    })();
    return () => { ativo = false; };
  }, []);

  const porEtapa = useMemo(() => {
    const m: Record<EtapaId, Oportunidade[]> = {
      LEAD: [], QUALIFICADO: [], PROPOSTA: [], NEGOCIACAO: [], GANHO: [], PERDIDO: [],
    };
    for (const op of oportunidades) {
      if (m[op.etapa]) m[op.etapa].push(op);
    }
    return m;
  }, [oportunidades]);

  function abrirNova() {
    if (!podeEditar) return;
    setEditando({ ...VAZIO });
  }

  function abrirEdicao(op: Oportunidade) {
    if (!podeEditar) return;
    setEditando({
      id: op.id,
      titulo: op.titulo,
      descricao: op.descricao || "",
      valorEstimado: op.valorEstimado != null ? String(op.valorEstimado) : "",
      probabilidade: op.probabilidade != null ? String(op.probabilidade) : "",
      dataFechamentoPrevista: fmtDataInput(op.dataFechamentoPrevista),
      origem: op.origem || "",
      clienteId: op.clienteId || "",
      responsavelId: op.responsavelId || "",
      etapa: op.etapa,
      motivoPerda: op.motivoPerda || "",
      numero: op.numero,
      cliente: op.cliente,
      responsavel: op.responsavel,
      criadoPor: op.criadoPor,
      createdAt: op.createdAt,
      updatedAt: op.updatedAt,
      historico: op.historico,
    });
  }

  async function excluirOp(op: { id: string; numero: number; titulo: string }) {
    if (!podeExcluir) return;
    if (!confirm(`Excluir oportunidade #${op.numero} - ${op.titulo}?`)) return;
    try {
      await api.excluirOportunidade(op.id);
      await carregar();
    } catch (e) {
      alert((e as Error).message || "Erro ao excluir");
    }
  }

  // ============ DRAG-AND-DROP ============

  function onDragStart(e: DragEvent<HTMLDivElement>, op: Oportunidade) {
    if (!podeEditar) return;
    setArrastando(op.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", op.id);
  }

  function onDragEnd() {
    setArrastando(null);
    setEtapaHover(null);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>, etapaId: EtapaId) {
    if (!podeEditar) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (etapaHover !== etapaId) setEtapaHover(etapaId);
  }

  async function onDrop(e: DragEvent<HTMLDivElement>, novaEtapa: EtapaId) {
    e.preventDefault();
    setEtapaHover(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const op = oportunidades.find((o) => o.id === id);
    if (!op || op.etapa === novaEtapa) return;

    if (novaEtapa === "PERDIDO") {
      setConfirmPerda({ id, etapaAntiga: op.etapa });
      return;
    }

    setOportunidades((arr) => arr.map((o) => (o.id === id ? { ...o, etapa: novaEtapa } : o)));
    try {
      await api.moverEtapaOportunidade(id, novaEtapa);
      await carregar();
    } catch (err) {
      alert((err as Error).message || "Erro ao mover");
      await carregar();
    }
  }

  async function confirmarPerda(motivo: string) {
    if (!confirmPerda || !motivo.trim()) return;
    const { id } = confirmPerda;
    setConfirmPerda(null);
    try {
      await api.moverEtapaOportunidade(id, "PERDIDO", { motivoPerda: motivo.trim() });
      await carregar();
    } catch (err) {
      alert((err as Error).message || "Erro ao mover");
    }
  }

  return (
    <div className="p-4 text-gp-text">
      <Cabecalho
        resumo={resumo}
        filtros={filtros}
        onFiltros={setFiltros}
        vendedores={vendedores}
        onNova={abrirNova}
        podeEditar={podeEditar}
      />

      {erro && (
        <div
          className="px-[14px] py-[10px] rounded-lg mb-3 text-[13px] text-gp-red"
          style={{ background: C.red + "22" }}
        >
          {erro}
        </div>
      )}

      {carregando ? (
        <div className="text-gp-muted py-10 text-center">Carregando funil...</div>
      ) : (
        <div
          className="gp-funil-board grid gap-3 overflow-x-auto pb-4"
          style={{ gridTemplateColumns: `repeat(${ETAPAS.length}, minmax(260px, 1fr))` }}
        >
          {ETAPAS.map((etapa) => {
            const cards = porEtapa[etapa.id] || [];
            const totalValor = cards.reduce((acc, op) => acc + Number(op.valorEstimado || 0), 0);
            const ehHover = etapaHover === etapa.id;
            return (
              <div
                key={etapa.id}
                onDragOver={(e) => onDragOver(e, etapa.id)}
                onDragLeave={() => setEtapaHover((cur) => (cur === etapa.id ? null : cur))}
                onDrop={(e) => onDrop(e, etapa.id)}
                className="rounded-[10px] flex flex-col"
                style={{
                  background: ehHover ? etapa.cor + "22" : C.surface,
                  border: `1px solid ${ehHover ? etapa.cor : C.border}`,
                  minHeight: 400,
                  transition: "background 0.12s ease, border-color 0.12s ease",
                }}
              >
                <div
                  className="px-[14px] py-3"
                  style={{
                    borderBottom: `2px solid ${etapa.cor}`,
                    borderTopLeftRadius: 10,
                    borderTopRightRadius: 10,
                    background: etapa.cor + "11",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base">{etapa.icone}</span>
                      <span
                        className="font-bold text-[13px] uppercase"
                        style={{ color: etapa.cor, letterSpacing: 0.4 }}
                      >
                        {etapa.label}
                      </span>
                    </div>
                    <span
                      className="text-[11px] font-bold"
                      style={{
                        background: etapa.cor + "22",
                        color: etapa.cor,
                        padding: "2px 8px",
                        borderRadius: 10,
                      }}
                    >
                      {cards.length}
                    </span>
                  </div>
                  <div className="text-gp-muted text-[11px] mt-1">
                    {fmtBRL(totalValor)}
                  </div>
                </div>

                <div className="p-2 flex flex-col gap-2 flex-1">
                  {cards.length === 0 && (
                    <div className="text-gp-muted text-[11px] text-center italic" style={{ padding: "20px 8px" }}>
                      Arraste aqui
                    </div>
                  )}
                  {cards.map((op) => (
                    <CardOportunidade
                      key={op.id}
                      op={op}
                      etapa={etapa}
                      arrastando={arrastando === op.id}
                      onDragStart={(e) => onDragStart(e, op)}
                      onDragEnd={onDragEnd}
                      onClick={() => abrirEdicao(op)}
                      podeEditar={podeEditar}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editando && (
        <ModalOportunidade
          oportunidade={editando}
          vendedores={vendedores}
          clientes={clientes}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar(); }}
          onExcluir={editando.id
            ? () => { excluirOp({ id: editando.id!, numero: editando.numero!, titulo: editando.titulo }); setEditando(null); }
            : null}
          podeExcluir={podeExcluir}
        />
      )}

      {confirmPerda && (
        <ModalMotivoPerda
          onFechar={() => setConfirmPerda(null)}
          onConfirmar={confirmarPerda}
        />
      )}
    </div>
  );
}

// ============ CABECALHO COM KPIS + FILTROS ============

interface CabecalhoProps {
  resumo: ResumoFunil | null;
  filtros: Filtros;
  onFiltros: (f: Filtros) => void;
  vendedores: VendedorRef[];
  onNova: () => void;
  podeEditar: boolean;
}

function Cabecalho({ resumo, filtros, onFiltros, vendedores, onNova, podeEditar }: CabecalhoProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="m-0 text-gp-white text-[22px] font-bold">
            🎯 Funil de Vendas
          </h2>
          <div className="text-gp-muted text-[13px] mt-0.5">
            Acompanhe oportunidades em cada etapa do processo comercial
          </div>
        </div>
        {podeEditar && (
          <button
            type="button"
            onClick={onNova}
            className="text-gp-white border-none rounded-lg font-bold cursor-pointer text-[13px]"
            style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              padding: "10px 18px",
              boxShadow: `0 4px 12px ${C.accent}33`,
            }}
          >
            + Nova Oportunidade
          </button>
        )}
      </div>

      {resumo && (
        <div
          className="grid gap-[10px] mb-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
        >
          <Kpi label="Em aberto" valor={String(resumo.totalAberto)} icone="📋" cor={C.accent} />
          <Kpi label="Forecast ponderado" valor={fmtBRL(resumo.valorPonderadoAberto)} icone="🔮" cor={C.purple || "#7c3aed"} sub="Valor × Probabilidade" />
          <Kpi label="Ganhos" valor={String(resumo.totalGanho)} icone="🏆" cor={C.green} sub={fmtBRL(resumo.valorGanho)} />
          <Kpi label="Perdidos" valor={String(resumo.totalPerdido)} icone="💔" cor={C.red} />
          <Kpi label="Taxa de conversão" valor={`${resumo.taxaConversao.toFixed(1)}%`} icone="📈" cor={C.yellow} sub="Ganhos / fechadas" />
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        <input
          type="text"
          placeholder="🔍 Buscar por título, descrição, cliente..."
          value={filtros.search}
          onChange={(e) => onFiltros({ ...filtros, search: e.target.value })}
          aria-label="Buscar"
          style={inputFiltroStyle(280)}
        />
        <select
          value={filtros.responsavelId}
          onChange={(e) => onFiltros({ ...filtros, responsavelId: e.target.value })}
          aria-label="Filtrar por vendedor"
          style={inputFiltroStyle(200)}
        >
          <option value="">Todos os vendedores</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>{v.nome}</option>
          ))}
        </select>
        <select
          value={filtros.origem}
          onChange={(e) => onFiltros({ ...filtros, origem: e.target.value })}
          aria-label="Filtrar por origem"
          style={inputFiltroStyle(160)}
        >
          <option value="">Todas as origens</option>
          {ORIGENS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        {(filtros.search || filtros.responsavelId || filtros.origem) && (
          <button
            type="button"
            onClick={() => onFiltros({ responsavelId: "", origem: "", search: "" })}
            className="bg-transparent text-gp-muted rounded-md cursor-pointer text-xs"
            style={{
              border: `1px solid ${C.border}`,
              padding: "8px 12px",
            }}
          >
            Limpar filtros
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

interface KpiProps {
  label: string;
  valor: string;
  icone: string;
  cor: string;
  sub?: string;
}

function Kpi({ label, valor, icone, cor, sub }: KpiProps) {
  return (
    <div
      className="bg-gp-surface rounded-lg"
      style={{
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${cor}`,
        padding: "10px 14px",
      }}
    >
      <div
        className="flex items-center gap-1.5 text-gp-muted text-[11px] uppercase font-semibold"
        style={{ letterSpacing: 0.5 }}
      >
        <span>{icone}</span> {label}
      </div>
      <div className="text-gp-white text-xl font-bold mt-1">{valor}</div>
      {sub && <div className="text-gp-muted text-[11px] mt-0.5">{sub}</div>}
    </div>
  );
}

// ============ CARD DA OPORTUNIDADE ============

interface CardOportunidadeProps {
  op: Oportunidade;
  etapa: EtapaMeta;
  arrastando: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onClick: () => void;
  podeEditar: boolean;
}

function CardOportunidade({ op, etapa, arrastando, onDragStart, onDragEnd, onClick, podeEditar }: CardOportunidadeProps) {
  const valor = Number(op.valorEstimado || 0);
  const ponderado = valor * (Number(op.probabilidade || 0) / 100);
  const diasFechar = op.dataFechamentoPrevista
    ? Math.round((new Date(op.dataFechamentoPrevista).getTime() - new Date().getTime()) / 86400000)
    : null;
  const atrasado = diasFechar !== null && diasFechar < 0 && etapa.id !== "GANHO" && etapa.id !== "PERDIDO";

  return (
    <div
      draggable={podeEditar}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className="bg-gp-card rounded-lg p-2.5"
      style={{
        border: `1px solid ${atrasado ? C.red : C.border}`,
        borderLeft: `3px solid ${etapa.cor}`,
        cursor: podeEditar ? "grab" : "pointer",
        opacity: arrastando ? 0.4 : 1,
        transition: "opacity 0.12s",
        boxShadow: arrastando ? "none" : "0 1px 2px rgba(0,0,0,0.1)",
      }}
    >
      <div className="flex justify-between items-start gap-1.5">
        <div
          className="text-gp-white font-semibold text-[13px] flex-1 min-w-0"
          style={{ lineHeight: 1.3 }}
        >
          {op.titulo}
        </div>
        <div className="text-gp-muted text-[10px] flex-shrink-0">#{op.numero}</div>
      </div>

      {op.cliente && (
        <div className="text-gp-muted text-[11px] mt-1 flex items-center gap-1">
          <span>👤</span> {op.cliente.nome}
        </div>
      )}

      {valor > 0 && (
        <div className="mt-1.5 flex items-baseline justify-between gap-1.5">
          <div className="text-gp-green font-bold text-[13px]">{fmtBRL(valor)}</div>
          {op.probabilidade != null && op.probabilidade > 0 && etapa.id !== "GANHO" && etapa.id !== "PERDIDO" && (
            <div className="text-gp-muted text-[10px]">
              {op.probabilidade}% · {fmtBRL(ponderado)}
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex justify-between items-center text-[10px] text-gp-muted gap-1.5">
        <div className="flex items-center gap-1">
          {op.responsavel && <span>🧑 {op.responsavel.nome.split(" ")[0]}</span>}
        </div>
        {diasFechar !== null && (
          <div style={{ color: atrasado ? C.red : C.muted }}>
            {atrasado ? `⚠ ${Math.abs(diasFechar)}d atrasado` : `📅 ${fmtData(op.dataFechamentoPrevista)}`}
          </div>
        )}
      </div>

      {op.origem && (
        <div
          className="mt-1.5 inline-block bg-gp-bg text-gp-muted text-[10px] rounded"
          style={{
            padding: "2px 6px",
            border: `1px solid ${C.border}`,
          }}
        >
          {op.origem}
        </div>
      )}

      {etapa.id === "PERDIDO" && op.motivoPerda && (
        <div className="mt-1.5 text-[10px] text-gp-red italic">
          ✗ {op.motivoPerda}
        </div>
      )}
    </div>
  );
}

// ============ MODAL DE CRIAR/EDITAR ============

interface ModalOportunidadeProps {
  oportunidade: FormOportunidade;
  vendedores: VendedorRef[];
  clientes: ClienteRef[];
  onFechar: () => void;
  onSalvo: () => void;
  onExcluir: (() => void) | null;
  podeExcluir: boolean;
}

function ModalOportunidade({ oportunidade, vendedores, clientes, onFechar, onSalvo, onExcluir, podeExcluir }: ModalOportunidadeProps) {
  const ehNova = !oportunidade.id;
  const [form, setForm] = useState<FormOportunidade>(oportunidade);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !salvando) onFechar(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar, salvando]);

  function set<K extends keyof FormOportunidade>(k: K, v: FormOportunidade[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function salvar() {
    if (!form.titulo.trim()) {
      setErro("Título é obrigatório");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const payload: Record<string, unknown> = {
        titulo: form.titulo.trim(),
        descricao: form.descricao || null,
        valorEstimado: form.valorEstimado === "" ? null : Number(form.valorEstimado),
        probabilidade: form.probabilidade === "" ? null : Number(form.probabilidade),
        dataFechamentoPrevista: form.dataFechamentoPrevista || null,
        origem: form.origem || null,
        clienteId: form.clienteId || null,
        responsavelId: form.responsavelId || null,
      };
      if (ehNova) {
        payload.etapa = form.etapa || "LEAD";
        await api.criarOportunidade(payload);
      } else {
        await api.atualizarOportunidade(form.id!, payload);
      }
      onSalvo();
    } catch (e) {
      setErro((e as Error).message || "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !salvando) onFechar(); }}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(2px)",
        zIndex: 1000,
      }}
    >
      <div
        className="bg-gp-surface w-full overflow-y-auto"
        style={{
          borderRadius: 12,
          border: `1px solid ${C.border}`,
          maxWidth: 640,
          maxHeight: "92vh",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div
          className="flex justify-between items-center"
          style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}
        >
          <div>
            <div className="text-gp-white text-lg font-bold">
              {ehNova ? "Nova Oportunidade" : `Oportunidade #${form.numero}`}
            </div>
            {!ehNova && (
              <div className="text-gp-muted text-[11px] mt-0.5">
                Criada em {fmtData(form.createdAt)} por {form.criadoPor?.nome || "—"}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            aria-label="Fechar"
            className="bg-transparent text-gp-muted border-none cursor-pointer"
            style={{ fontSize: 22, padding: 4, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div className="p-5 flex flex-col gap-[14px]">
          <Campo label="Título *">
            <input
              autoFocus
              value={form.titulo}
              onChange={(e) => set("titulo", e.target.value)}
              placeholder="Ex: Proposta de papelaria para escola X"
              style={inputModalStyle}
            />
          </Campo>

          <Campo label="Descrição">
            <textarea
              value={form.descricao}
              onChange={(e) => set("descricao", e.target.value)}
              rows={3}
              placeholder="Detalhes da oportunidade, requisitos, próximos passos..."
              style={{ ...inputModalStyle, resize: "vertical", minHeight: 70 }}
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Valor estimado (R$)">
              <input
                type="number" min="0" step="0.01"
                value={form.valorEstimado}
                onChange={(e) => set("valorEstimado", e.target.value)}
                placeholder="0,00"
                style={inputModalStyle}
              />
            </Campo>
            <Campo label="Probabilidade (%)">
              <input
                type="number" min="0" max="100" step="5"
                value={form.probabilidade}
                onChange={(e) => set("probabilidade", e.target.value)}
                placeholder="0"
                style={inputModalStyle}
              />
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Previsão de fechamento">
              <input
                type="date"
                value={form.dataFechamentoPrevista}
                onChange={(e) => set("dataFechamentoPrevista", e.target.value)}
                aria-label="Previsão de fechamento"
                style={inputModalStyle}
              />
            </Campo>
            <Campo label="Origem">
              <select
                value={form.origem}
                onChange={(e) => set("origem", e.target.value)}
                aria-label="Origem"
                style={inputModalStyle}
              >
                <option value="">— Selecione —</option>
                {ORIGENS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </Campo>
          </div>

          <Campo label="Cliente">
            <SelectBusca<ClienteRef>
              value={form.clienteId}
              onChange={(v) => set("clienteId", v)}
              opcoes={clientes}
              placeholder="Buscar cliente..."
            />
          </Campo>

          <Campo label="Responsável (vendedor)">
            <select
              value={form.responsavelId}
              onChange={(e) => set("responsavelId", e.target.value)}
              aria-label="Responsável"
              style={inputModalStyle}
            >
              <option value="">— Sem responsável —</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nome} ({v.role})</option>
              ))}
            </select>
          </Campo>

          {ehNova && (
            <Campo label="Etapa inicial">
              <select
                value={form.etapa}
                onChange={(e) => set("etapa", e.target.value as EtapaId)}
                aria-label="Etapa inicial"
                style={inputModalStyle}
              >
                {ETAPAS.filter((e) => e.id !== "GANHO" && e.id !== "PERDIDO").map((e) => (
                  <option key={e.id} value={e.id}>{e.icone} {e.label}</option>
                ))}
              </select>
            </Campo>
          )}

          {!ehNova && form.historico && form.historico.length > 0 && (
            <div>
              <div
                className="text-gp-muted text-[11px] uppercase mb-1.5"
                style={{ letterSpacing: 0.5 }}
              >
                Histórico
              </div>
              <div
                className="bg-gp-bg overflow-y-auto"
                style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  padding: 10,
                  maxHeight: 180,
                }}
              >
                {form.historico.slice(0, 10).map((h) => (
                  <div
                    key={h.id}
                    className="text-[11px] text-gp-muted"
                    style={{ padding: "4px 0", borderBottom: `1px solid ${C.border}` }}
                  >
                    <strong className="text-gp-text">
                      {h.etapaAnterior ? `${h.etapaAnterior} → ${h.etapaNova}` : h.etapaNova}
                    </strong>
                    {" · "}{h.user?.nome || "—"}{" · "}{fmtData(h.createdAt)}
                    {h.observacao && <div className="italic">{h.observacao}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {erro && (
            <div
              className="px-3 py-2 rounded text-xs text-gp-red"
              style={{ background: C.red + "22" }}
            >
              {erro}
            </div>
          )}
        </div>

        <div
          className="flex justify-between gap-2"
          style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}` }}
        >
          <div>
            {!ehNova && podeExcluir && onExcluir && (
              <button
                type="button"
                onClick={onExcluir}
                disabled={salvando}
                className="bg-transparent rounded-md cursor-pointer text-xs"
                style={{
                  color: C.red,
                  border: `1px solid ${C.red}44`,
                  padding: "8px 14px",
                }}
              >
                🗑 Excluir
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="bg-transparent text-gp-muted rounded-md cursor-pointer text-[13px]"
              style={{
                border: `1px solid ${C.border}`,
                padding: "8px 16px",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="text-gp-white border-none rounded-md cursor-pointer font-bold text-[13px]"
              style={{
                background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                padding: "8px 22px",
              }}
            >
              {salvando ? "Salvando..." : (ehNova ? "Criar" : "Salvar")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CampoProps {
  label: string;
  children: ReactNode;
}

function Campo({ label, children }: CampoProps) {
  return (
    <div>
      <div
        className="text-gp-muted text-[11px] uppercase mb-1 font-semibold"
        style={{ letterSpacing: 0.5 }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

const inputModalStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: C.bg,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

// ============ MODAL MOTIVO DE PERDA ============

interface ModalMotivoPerdaProps {
  onFechar: () => void;
  onConfirmar: (motivo: string) => void;
}

function ModalMotivoPerda({ onFechar, onConfirmar }: ModalMotivoPerdaProps) {
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onFechar(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", zIndex: 1001 }}
    >
      <div
        className="bg-gp-surface w-full p-5"
        style={{
          borderRadius: 10,
          border: `1px solid ${C.red}44`,
          maxWidth: 440,
        }}
      >
        <div className="text-base font-bold mb-1" style={{ color: C.red }}>
          💔 Marcar como Perdido
        </div>
        <div className="text-gp-muted text-xs mb-3.5">
          Informe o motivo da perda para análise futura.
        </div>
        <textarea
          autoFocus
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          placeholder="Ex: Cliente escolheu concorrente, preço alto, sem orçamento..."
          style={{ ...inputModalStyle, resize: "vertical", minHeight: 80, marginBottom: 14 }}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="bg-transparent text-gp-muted rounded-md cursor-pointer text-[13px]"
            style={{
              border: `1px solid ${C.border}`,
              padding: "8px 16px",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirmar(motivo)}
            disabled={!motivo.trim()}
            className="text-gp-white border-none rounded-md font-bold text-[13px]"
            style={{
              background: motivo.trim() ? C.red : C.red + "55",
              padding: "8px 22px",
              cursor: motivo.trim() ? "pointer" : "not-allowed",
            }}
          >
            Confirmar perda
          </button>
        </div>
      </div>
    </div>
  );
}
