import { useEffect, useState, useCallback, useMemo, type CSSProperties, type FormEvent } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";
import ActionsMenu from "./components/ActionsMenu";
import { fmtData, fmtDataInput } from "./lib/format";


// ============ HELPERS ============

function diasRestantes(prazo: string | null | undefined): number | null {
  if (!prazo) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const p = new Date(prazo);
  p.setHours(0, 0, 0, 0);
  return Math.round((p.getTime() - hoje.getTime()) / 86400000);
}

// ============ TIPOS ============

type PrioridadeKey = "URGENTE" | "ALTA" | "MEDIA" | "BAIXA";
type StatusKey = "ABERTA" | "EM_ANDAMENTO" | "CONCLUIDA" | "CANCELADA";
type FiltroStatus = "ativas" | "atrasadas" | "concluidas" | "canceladas";

interface MetaPrioridade {
  label: string;
  cor: string;
  ordem: number;
}

interface MetaStatus {
  label: string;
  cor: string;
}

const PRIORIDADE: Record<PrioridadeKey, MetaPrioridade> = {
  URGENTE: { label: "Urgente", cor: "#ef4444", ordem: 0 },
  ALTA:    { label: "Alta",    cor: "#f97316", ordem: 1 },
  MEDIA:   { label: "Média",   cor: C.yellow,  ordem: 2 },
  BAIXA:   { label: "Baixa",   cor: C.muted,   ordem: 3 },
};

const STATUS: Record<StatusKey, MetaStatus> = {
  ABERTA:       { label: "Aberta",      cor: C.accent },
  EM_ANDAMENTO: { label: "Em andamento", cor: C.yellow },
  CONCLUIDA:    { label: "Concluída",   cor: C.green },
  CANCELADA:    { label: "Cancelada",   cor: C.muted },
};

interface ClienteRef {
  id: string;
  nome: string;
}

interface FuncionarioRef {
  id: string;
  nome: string;
}

interface Tarefa {
  id: string;
  titulo: string;
  descricao?: string | null;
  prazo?: string | null;
  prioridade: PrioridadeKey;
  status: StatusKey;
  responsavelId?: string | null;
  clienteId?: string | null;
  cliente?: ClienteRef | null;
  responsavel?: FuncionarioRef | null;
}

interface FormTarefa {
  titulo: string;
  descricao: string;
  prazo: string;
  prioridade: PrioridadeKey;
  responsavelId: string;
  clienteId: string;
}

const VAZIO: FormTarefa = {
  titulo: "", descricao: "", prazo: "", prioridade: "MEDIA",
  responsavelId: "", clienteId: "",
};

// ============ MODAL ============

interface TarefaModalProps {
  tarefa: Tarefa | null;
  user: SessionUser;
  onFechar: () => void;
  onSalvo: () => void;
}

function TarefaModal({ tarefa, onFechar, onSalvo }: TarefaModalProps) {
  const [form, setForm] = useState<FormTarefa>(tarefa ? {
    titulo: tarefa.titulo || "",
    descricao: tarefa.descricao || "",
    prazo: fmtDataInput(tarefa.prazo),
    prioridade: tarefa.prioridade || "MEDIA",
    responsavelId: tarefa.responsavelId || "",
    clienteId: tarefa.clienteId || "",
  } : VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [funcionarios, setFuncionarios] = useState<FuncionarioRef[]>([]);
  const [clientes, setClientes] = useState<ClienteRef[]>([]);

  useEffect(() => {
    // Cada chamada tem seu proprio .catch para que uma falha
    // (ex: cliente sem permissao) nao zere a outra lista.
    api.listarResponsaveis()
      .then((r) => setFuncionarios((r as FuncionarioRef[]) || []))
      .catch(() => setFuncionarios([]));
    api.listarClientes({ ativo: "true" })
      .then((r) => setClientes((r as ClienteRef[]) || []))
      .catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onFechar(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form.titulo.trim()) { setErro("Título é obrigatório"); return; }
    setSalvando(true);
    setErro("");
    try {
      const payload = {
        titulo: form.titulo.trim(),
        descricao: form.descricao || null,
        prazo: form.prazo || null,
        prioridade: form.prioridade,
        responsavelId: form.responsavelId || null,
        clienteId: form.clienteId || null,
      };
      if (tarefa) {
        await api.atualizarTarefa(tarefa.id, payload);
      } else {
        await api.criarTarefa(payload);
      }
      onSalvo();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const inputStyle: CSSProperties = {
    width: "100%", boxSizing: "border-box",
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
    padding: "9px 12px", color: C.text, fontSize: 13, outline: "none",
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", zIndex: 200 }}
    >
      <div
        className="w-full overflow-hidden"
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          maxWidth: 540,
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        <div
          className="px-[22px] pt-[18px] pb-[14px]"
          style={{ borderBottom: `1px solid ${C.border}` }}
        >
          <p
            className="m-0 text-[10px] text-gp-muted uppercase font-semibold"
            style={{ letterSpacing: "0.08em" }}
          >
            {tarefa ? "Editar" : "Nova"} Tarefa
          </p>
          <h2 className="mt-0.5 mb-0 text-lg font-bold text-gp-text">
            {tarefa ? tarefa.titulo : "Criar follow-up"}
          </h2>
        </div>

        <form onSubmit={salvar} className="px-[22px] py-[18px] flex flex-col gap-[14px]">
          <div>
            <label className="block text-[11px] text-gp-muted font-semibold uppercase mb-1">
              Título <span className="text-gp-red">•</span>
            </label>
            <input
              value={form.titulo}
              onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
              placeholder="O que precisa ser feito?"
              style={inputStyle}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-gp-muted font-semibold uppercase mb-1">
                Prioridade
              </label>
              <select
                value={form.prioridade}
                onChange={(e) => setForm((p) => ({ ...p, prioridade: e.target.value as PrioridadeKey }))}
                aria-label="Prioridade"
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA">Média</option>
                <option value="ALTA">Alta</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gp-muted font-semibold uppercase mb-1">
                Prazo
              </label>
              <input
                type="date"
                value={form.prazo}
                onChange={(e) => setForm((p) => ({ ...p, prazo: e.target.value }))}
                aria-label="Prazo"
                style={inputStyle}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-gp-muted font-semibold uppercase mb-1">
                Responsável
              </label>
              <select
                value={form.responsavelId}
                onChange={(e) => setForm((p) => ({ ...p, responsavelId: e.target.value }))}
                aria-label="Responsável"
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">— Sem responsável</option>
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gp-muted font-semibold uppercase mb-1">
                Cliente
              </label>
              <select
                value={form.clienteId}
                onChange={(e) => setForm((p) => ({ ...p, clienteId: e.target.value }))}
                aria-label="Cliente"
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">— Sem cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-gp-muted font-semibold uppercase mb-1">
              Descrição / Anotações
            </label>
            <textarea
              value={form.descricao}
              onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
              rows={3}
              placeholder="Detalhes, próximos passos, contexto..."
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
            />
          </div>

          {erro && (
            <p className="m-0 text-xs text-gp-red">{erro}</p>
          )}

          <div className="flex justify-end gap-[10px] mt-1">
            <button
              type="button"
              onClick={onFechar}
              className="px-[18px] py-2 rounded-lg text-[13px] cursor-pointer text-gp-text bg-gp-card"
              style={{ border: `1px solid ${C.border}` }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="px-[22px] py-2 rounded-lg text-[13px] font-bold cursor-pointer text-gp-white border-none"
              style={{
                background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                opacity: salvando ? 0.7 : 1,
              }}
            >
              {salvando ? "Salvando..." : tarefa ? "Salvar alterações" : "Criar tarefa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============ CARD DE TAREFA ============

interface TarefaCardProps {
  tarefa: Tarefa;
  onEditar: (t: Tarefa) => void;
  onConcluir: (t: Tarefa) => void;
  onReabrir: (t: Tarefa) => void;
  onExcluir: (t: Tarefa) => void;
  podeGerenciar: boolean;
}

function TarefaCard({ tarefa, onEditar, onConcluir, onReabrir, onExcluir, podeGerenciar }: TarefaCardProps) {
  const dias = diasRestantes(tarefa.prazo);
  const atrasada = dias !== null && dias < 0 && tarefa.status !== "CONCLUIDA" && tarefa.status !== "CANCELADA";
  const concluida = tarefa.status === "CONCLUIDA";
  const cancelada = tarefa.status === "CANCELADA";
  const inativa = concluida || cancelada;

  const infoPrioridade = PRIORIDADE[tarefa.prioridade] || PRIORIDADE.MEDIA;
  const infoStatus = STATUS[tarefa.status] || STATUS.ABERTA;

  return (
    <div
      className="flex flex-col gap-2 rounded-[10px] px-4 py-[14px]"
      style={{
        background: C.card,
        border: `1px solid ${atrasada ? C.red + "66" : C.border}`,
        borderLeft: `3px solid ${infoPrioridade.cor}`,
        opacity: inativa ? 0.65 : 1,
      }}
    >
      {/* Linha superior */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* checkbox de conclusão rápida */}
          <button
            type="button"
            onClick={() => concluida ? onReabrir(tarefa) : onConcluir(tarefa)}
            title={concluida ? "Reabrir tarefa" : "Marcar como concluída"}
            className="flex-shrink-0 flex items-center justify-center text-gp-white text-[11px] cursor-pointer rounded-full"
            style={{
              width: 20,
              height: 20,
              border: `2px solid ${concluida ? C.green : C.border}`,
              background: concluida ? C.green : "transparent",
            }}
          >
            {concluida ? "✓" : ""}
          </button>
          <span
            className="text-sm font-semibold text-gp-text overflow-hidden whitespace-nowrap text-ellipsis"
            style={{ textDecoration: inativa ? "line-through" : "none" }}
          >
            {tarefa.titulo}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="text-[10px] font-bold rounded-full"
            style={{
              padding: "2px 7px",
              background: `${infoPrioridade.cor}22`,
              color: infoPrioridade.cor,
              border: `1px solid ${infoPrioridade.cor}44`,
            }}
          >
            {infoPrioridade.label.toUpperCase()}
          </span>
          <ActionsMenu
            items={[
              { label: "Editar", icon: "✎", color: C.accent, onClick: () => onEditar(tarefa), hidden: inativa || !podeGerenciar },
              { label: concluida ? "Reabrir" : "Concluir", icon: concluida ? "↻" : "✓", color: C.green, onClick: () => concluida ? onReabrir(tarefa) : onConcluir(tarefa), hidden: cancelada },
              { label: "Excluir", icon: "✕", color: C.red, onClick: () => onExcluir(tarefa), hidden: !podeGerenciar },
            ]}
          />
        </div>
      </div>

      {/* Descrição */}
      {tarefa.descricao && (
        <p className="m-0 text-gp-muted" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
          {tarefa.descricao}
        </p>
      )}

      {/* Meta: prazo, cliente, responsável, status */}
      <div className="flex flex-wrap gap-[10px] items-center">
        {tarefa.prazo && (
          <span
            className="text-[11px]"
            style={{
              color: atrasada ? C.red : dias === 0 ? C.yellow : C.muted,
              fontWeight: atrasada || dias === 0 ? 700 : 400,
            }}
          >
            📅 {atrasada
              ? `Atrasada ${Math.abs(dias!)} dia${Math.abs(dias!) === 1 ? "" : "s"}`
              : dias === 0 ? "Vence hoje"
              : `${fmtData(tarefa.prazo)} (${dias} dia${dias === 1 ? "" : "s"})`}
          </span>
        )}
        {tarefa.cliente && (
          <span className="text-[11px] text-gp-muted">
            👤 {tarefa.cliente.nome}
          </span>
        )}
        {tarefa.responsavel && (
          <span className="text-[11px] text-gp-muted">
            🔖 {tarefa.responsavel.nome}
          </span>
        )}
        <span
          className="ml-auto text-[10px] font-bold rounded-full"
          style={{
            padding: "1px 7px",
            background: `${infoStatus.cor}22`,
            color: infoStatus.cor,
            border: `1px solid ${infoStatus.cor}33`,
          }}
        >
          {infoStatus.label}
        </span>
      </div>
    </div>
  );
}

// ============ PÁGINA PRINCIPAL ============

interface TarefasProps {
  user: SessionUser;
}

export default function Tarefas({ user }: TarefasProps) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("ativas");
  const [filtroPrioridade, setFiltroPrioridade] = useState<"" | PrioridadeKey>("");
  const [filtroMinhas, setFiltroMinhas] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Tarefa | null>(null);

  const podeGerenciar = user.role === "ADMIN" || user.role === "GERENTE";

  function flash(txt: string) {
    setMensagem(txt);
    setTimeout(() => setMensagem(""), 2500);
  }

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const params: Record<string, string> = {};
      if (filtroStatus === "concluidas") {
        params.status = "CONCLUIDA";
      } else if (filtroStatus === "canceladas") {
        params.status = "CANCELADA";
      } else if (filtroStatus === "atrasadas") {
        params.atrasadas = "true";
      }
      // "ativas": passamos vazio e filtramos no front
      if (filtroPrioridade) params.prioridade = filtroPrioridade;
      if (filtroMinhas) params.minhas = "true";

      let data = await api.listarTarefas(params) as Tarefa[];

      // filtro "ativas" no frontend (ABERTA + EM_ANDAMENTO)
      if (filtroStatus === "ativas") {
        data = data.filter((t) => t.status === "ABERTA" || t.status === "EM_ANDAMENTO");
      }

      setTarefas(data);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [filtroStatus, filtroPrioridade, filtroMinhas]);

  useEffect(() => { carregar(); }, [carregar]);

  async function concluir(tarefa: Tarefa) {
    try {
      await api.concluirTarefa(tarefa.id);
      flash(`"${tarefa.titulo}" concluída`);
      carregar();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function reabrir(tarefa: Tarefa) {
    try {
      await api.reabrirTarefa(tarefa.id);
      flash(`"${tarefa.titulo}" reaberta`);
      carregar();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function excluir(tarefa: Tarefa) {
    if (!confirm(`Excluir "${tarefa.titulo}"?`)) return;
    try {
      await api.excluirTarefa(tarefa.id);
      flash("Tarefa excluída");
      carregar();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  // Agrupa por status para exibição na lista ativa
  const grupos = useMemo(() => {
    if (filtroStatus !== "ativas") return null;
    const urgentes = tarefas.filter((t) => t.prioridade === "URGENTE" && t.status !== "CONCLUIDA" && t.status !== "CANCELADA");
    const emAndamento = tarefas.filter((t) => t.status === "EM_ANDAMENTO" && t.prioridade !== "URGENTE");
    const abertas = tarefas.filter((t) => t.status === "ABERTA" && t.prioridade !== "URGENTE");
    return { urgentes, emAndamento, abertas };
  }, [tarefas, filtroStatus]);

  const countAtrasadas = tarefas.filter((t) => {
    const dias = diasRestantes(t.prazo);
    return dias !== null && dias < 0 && t.status !== "CONCLUIDA" && t.status !== "CANCELADA";
  }).length;

  const filtrosStatus: { id: FiltroStatus; label: string }[] = [
    { id: "ativas",     label: "Ativas" },
    { id: "atrasadas",  label: `Atrasadas${countAtrasadas > 0 ? ` (${countAtrasadas})` : ""}` },
    { id: "concluidas", label: "Concluídas" },
    { id: "canceladas", label: "Canceladas" },
  ];

  return (
    <div>
      {/* Toolbar */}
      <div className="flex gap-[10px] mb-4 flex-wrap items-center">
        <div className="flex gap-1 flex-wrap flex-1">
          {filtrosStatus.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltroStatus(f.id)}
              className="rounded-lg text-[13px] cursor-pointer px-[14px] py-2"
              style={{
                fontWeight: filtroStatus === f.id ? 700 : 500,
                background: filtroStatus === f.id ? `${C.accent}22` : C.surface,
                color: filtroStatus === f.id ? C.accent : C.muted,
                border: `1px solid ${filtroStatus === f.id ? C.accent + "66" : C.border}`,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={filtroPrioridade}
          onChange={(e) => setFiltroPrioridade(e.target.value as "" | PrioridadeKey)}
          aria-label="Filtrar por prioridade"
          className="rounded-lg text-[13px] cursor-pointer px-3 py-2 text-gp-text bg-gp-surface"
          style={{ border: `1px solid ${C.border}` }}
        >
          <option value="">Todas prioridades</option>
          <option value="URGENTE">Urgente</option>
          <option value="ALTA">Alta</option>
          <option value="MEDIA">Média</option>
          <option value="BAIXA">Baixa</option>
        </select>

        <button
          type="button"
          onClick={() => setFiltroMinhas(!filtroMinhas)}
          className="rounded-lg text-[13px] cursor-pointer px-[14px] py-2 font-medium"
          style={{
            background: filtroMinhas ? `${C.purple}22` : C.surface,
            color: filtroMinhas ? C.purple : C.muted,
            border: `1px solid ${filtroMinhas ? C.purple + "66" : C.border}`,
          }}
        >
          Minhas tarefas
        </button>

        <button
          type="button"
          onClick={() => { setEditando(null); setModalAberto(true); }}
          className="rounded-lg text-sm cursor-pointer px-[18px] py-2 font-bold text-gp-white border-none"
          style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.purple})` }}
        >
          + Nova Tarefa
        </button>
      </div>

      {mensagem && (
        <div
          className="mb-3 px-[14px] py-[10px] rounded-lg text-[13px] text-gp-green"
          style={{ background: `${C.green}22`, border: `1px solid ${C.green}55` }}
        >
          {mensagem}
        </div>
      )}
      {erro && (
        <div
          className="mb-3 px-[14px] py-[10px] rounded-lg text-[13px] text-gp-red"
          style={{ background: `${C.red}22`, border: `1px solid ${C.red}55` }}
        >
          {erro}
        </div>
      )}

      {/* Lista */}
      {carregando ? (
        <div className="text-center py-10 text-gp-muted">Carregando tarefas...</div>
      ) : tarefas.length === 0 ? (
        <div
          className="text-center text-gp-muted bg-gp-card rounded-xl"
          style={{ padding: "60px 20px", border: `1px solid ${C.border}` }}
        >
          <div className="text-4xl mb-3">✓</div>
          <p className="m-0 text-sm">
            {filtroStatus === "ativas" ? "Nenhuma tarefa ativa. Crie uma!" : "Nenhuma tarefa encontrada."}
          </p>
        </div>
      ) : grupos ? (
        /* Visão agrupada para "ativas" */
        <div className="flex flex-col gap-6">
          {grupos.urgentes.length > 0 && (
            <Grupo titulo="🚨 Urgentes" cor="#ef4444" tarefas={grupos.urgentes}
              onEditar={(t) => { setEditando(t); setModalAberto(true); }}
              onConcluir={concluir} onReabrir={reabrir} onExcluir={excluir}
              podeGerenciar={podeGerenciar} />
          )}
          {grupos.emAndamento.length > 0 && (
            <Grupo titulo="⚡ Em andamento" cor={C.yellow} tarefas={grupos.emAndamento}
              onEditar={(t) => { setEditando(t); setModalAberto(true); }}
              onConcluir={concluir} onReabrir={reabrir} onExcluir={excluir}
              podeGerenciar={podeGerenciar} />
          )}
          {grupos.abertas.length > 0 && (
            <Grupo titulo="📋 Abertas" cor={C.accent} tarefas={grupos.abertas}
              onEditar={(t) => { setEditando(t); setModalAberto(true); }}
              onConcluir={concluir} onReabrir={reabrir} onExcluir={excluir}
              podeGerenciar={podeGerenciar} />
          )}
        </div>
      ) : (
        /* Lista plana para filtros específicos */
        <div className="flex flex-col gap-[10px]">
          {tarefas.map((t) => (
            <TarefaCard
              key={t.id}
              tarefa={t}
              onEditar={(tarefa) => { setEditando(tarefa); setModalAberto(true); }}
              onConcluir={concluir}
              onReabrir={reabrir}
              onExcluir={excluir}
              podeGerenciar={podeGerenciar}
            />
          ))}
        </div>
      )}

      {modalAberto && (
        <TarefaModal
          tarefa={editando}
          user={user}
          onFechar={() => { setModalAberto(false); setEditando(null); }}
          onSalvo={() => { setModalAberto(false); setEditando(null); carregar(); flash(editando ? "Tarefa atualizada" : "Tarefa criada"); }}
        />
      )}
    </div>
  );
}

interface GrupoProps {
  titulo: string;
  cor: string;
  tarefas: Tarefa[];
  onEditar: (t: Tarefa) => void;
  onConcluir: (t: Tarefa) => void;
  onReabrir: (t: Tarefa) => void;
  onExcluir: (t: Tarefa) => void;
  podeGerenciar: boolean;
}

function Grupo({ titulo, cor, tarefas, onEditar, onConcluir, onReabrir, onExcluir, podeGerenciar }: GrupoProps) {
  return (
    <div>
      <h3
        className="text-[13px] font-bold uppercase mb-[10px] mt-0"
        style={{ color: cor, letterSpacing: "0.05em" }}
      >
        {titulo} <span className="font-normal text-gp-muted">({tarefas.length})</span>
      </h3>
      <div className="flex flex-col gap-2">
        {tarefas.map((t) => (
          <TarefaCard
            key={t.id}
            tarefa={t}
            onEditar={onEditar}
            onConcluir={onConcluir}
            onReabrir={onReabrir}
            onExcluir={onExcluir}
            podeGerenciar={podeGerenciar}
          />
        ))}
      </div>
    </div>
  );
}
