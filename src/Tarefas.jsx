import { useEffect, useState, useCallback, useMemo } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";
import ActionsMenu from "./components/ActionsMenu.jsx";
import SelectBusca from "./components/SelectBusca.jsx";

// ============ HELPERS ============

const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
};

const fmtDataInput = (iso) => {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
};

function diasRestantes(prazo) {
  if (!prazo) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const p = new Date(prazo);
  p.setHours(0, 0, 0, 0);
  return Math.round((p - hoje) / 86400000);
}

const PRIORIDADE = {
  URGENTE: { label: "Urgente", cor: "#ef4444", ordem: 0 },
  ALTA:    { label: "Alta",    cor: "#f97316", ordem: 1 },
  MEDIA:   { label: "Média",   cor: C.yellow,  ordem: 2 },
  BAIXA:   { label: "Baixa",   cor: C.muted,   ordem: 3 },
};

const STATUS = {
  ABERTA:       { label: "Aberta",      cor: C.accent },
  EM_ANDAMENTO: { label: "Em andamento", cor: C.yellow },
  CONCLUIDA:    { label: "Concluída",   cor: C.green },
  CANCELADA:    { label: "Cancelada",   cor: C.muted },
};

const VAZIO = {
  titulo: "", descricao: "", prazo: "", prioridade: "MEDIA",
  responsavelId: "", clienteId: "",
};

// ============ MODAL ============

function TarefaModal({ tarefa, onFechar, onSalvo, user }) {
  const [form, setForm] = useState(tarefa ? {
    titulo: tarefa.titulo || "",
    descricao: tarefa.descricao || "",
    prazo: fmtDataInput(tarefa.prazo),
    prioridade: tarefa.prioridade || "MEDIA",
    responsavelId: tarefa.responsavelId || "",
    clienteId: tarefa.clienteId || "",
  } : VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [funcionarios, setFuncionarios] = useState([]);
  const [clientes, setClientes] = useState([]);

  useEffect(() => {
    // Cada chamada tem seu proprio .catch para que uma falha
    // (ex: cliente sem permissao) nao zere a outra lista.
    api.listarResponsaveis()
      .then(setFuncionarios)
      .catch(() => setFuncionarios([]));
    api.listarClientes({ ativo: "true" })
      .then(setClientes)
      .catch(() => setClientes([]));
  }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onFechar(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar]);

  async function salvar(e) {
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
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
    padding: "9px 12px", color: C.text, fontSize: 13, outline: "none",
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onFechar(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16,
        width: "100%", maxWidth: 540, boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        overflow: "hidden",
      }}>
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${C.border}` }}>
          <p style={{ margin: 0, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
            {tarefa ? "Editar" : "Nova"} Tarefa
          </p>
          <h2 style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 700, color: C.text }}>
            {tarefa ? tarefa.titulo : "Criar follow-up"}
          </h2>
        </div>

        <form onSubmit={salvar} style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
              Título <span style={{ color: C.red }}>•</span>
            </label>
            <input
              value={form.titulo}
              onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
              placeholder="O que precisa ser feito?"
              style={inputStyle}
              autoFocus
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                Prioridade
              </label>
              <select
                value={form.prioridade}
                onChange={e => setForm(p => ({ ...p, prioridade: e.target.value }))}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA">Média</option>
                <option value="ALTA">Alta</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                Prazo
              </label>
              <input
                type="date"
                value={form.prazo}
                onChange={e => setForm(p => ({ ...p, prazo: e.target.value }))}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                Responsável
              </label>
              <select
                value={form.responsavelId}
                onChange={e => setForm(p => ({ ...p, responsavelId: e.target.value }))}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">— Sem responsável</option>
                {funcionarios.map(f => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
                Cliente
              </label>
              <select
                value={form.clienteId}
                onChange={e => setForm(p => ({ ...p, clienteId: e.target.value }))}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">— Sem cliente</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
              Descrição / Anotações
            </label>
            <textarea
              value={form.descricao}
              onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
              rows={3}
              placeholder="Detalhes, próximos passos, contexto..."
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
            />
          </div>

          {erro && (
            <p style={{ margin: 0, fontSize: 12, color: C.red }}>{erro}</p>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
            <button type="button" onClick={onFechar} style={{
              padding: "8px 18px", background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 8, color: C.text, fontSize: 13, cursor: "pointer",
            }}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando} style={{
              padding: "8px 22px",
              background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              border: "none", borderRadius: 8, color: C.white,
              fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: salvando ? 0.7 : 1,
            }}>
              {salvando ? "Salvando..." : tarefa ? "Salvar alterações" : "Criar tarefa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============ CARD DE TAREFA ============

function TarefaCard({ tarefa, onEditar, onConcluir, onReabrir, onExcluir, podeGerenciar }) {
  const dias = diasRestantes(tarefa.prazo);
  const atrasada = dias !== null && dias < 0 && tarefa.status !== "CONCLUIDA" && tarefa.status !== "CANCELADA";
  const concluida = tarefa.status === "CONCLUIDA";
  const cancelada = tarefa.status === "CANCELADA";
  const inativa = concluida || cancelada;

  const infoPrioridade = PRIORIDADE[tarefa.prioridade] || PRIORIDADE.MEDIA;
  const infoStatus = STATUS[tarefa.status] || STATUS.ABERTA;

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${atrasada ? C.red + "66" : C.border}`,
      borderLeft: `3px solid ${infoPrioridade.cor}`,
      borderRadius: 10,
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      opacity: inativa ? 0.65 : 1,
    }}>
      {/* Linha superior */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          {/* checkbox de conclusão rápida */}
          <button
            onClick={() => concluida ? onReabrir(tarefa) : onConcluir(tarefa)}
            title={concluida ? "Reabrir tarefa" : "Marcar como concluída"}
            style={{
              width: 20, height: 20, flexShrink: 0,
              borderRadius: "50%",
              border: `2px solid ${concluida ? C.green : C.border}`,
              background: concluida ? C.green : "transparent",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: C.white, fontSize: 11,
            }}
          >
            {concluida ? "✓" : ""}
          </button>
          <span style={{
            fontSize: 14, fontWeight: 600, color: C.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            textDecoration: inativa ? "line-through" : "none",
          }}>
            {tarefa.titulo}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
            background: `${infoPrioridade.cor}22`, color: infoPrioridade.cor,
            border: `1px solid ${infoPrioridade.cor}44`,
          }}>
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
        <p style={{ margin: 0, fontSize: 12.5, color: C.muted, lineHeight: 1.4 }}>
          {tarefa.descricao}
        </p>
      )}

      {/* Meta: prazo, cliente, responsável, status */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        {tarefa.prazo && (
          <span style={{
            fontSize: 11, color: atrasada ? C.red : dias === 0 ? C.yellow : C.muted,
            fontWeight: atrasada || dias === 0 ? 700 : 400,
          }}>
            📅 {atrasada
              ? `Atrasada ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"}`
              : dias === 0 ? "Vence hoje"
              : `${fmtData(tarefa.prazo)} (${dias} dia${dias === 1 ? "" : "s"})`}
          </span>
        )}
        {tarefa.cliente && (
          <span style={{ fontSize: 11, color: C.muted }}>
            👤 {tarefa.cliente.nome}
          </span>
        )}
        {tarefa.responsavel && (
          <span style={{ fontSize: 11, color: C.muted }}>
            🔖 {tarefa.responsavel.nome}
          </span>
        )}
        <span style={{
          marginLeft: "auto",
          fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
          background: `${infoStatus.cor}22`, color: infoStatus.cor,
          border: `1px solid ${infoStatus.cor}33`,
        }}>
          {infoStatus.label}
        </span>
      </div>
    </div>
  );
}

// ============ PÁGINA PRINCIPAL ============

export default function Tarefas({ user }) {
  const [tarefas, setTarefas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [filtroStatus, setFiltroStatus] = useState("ativas");
  const [filtroPrioridade, setFiltroPrioridade] = useState("");
  const [filtroMinhas, setFiltroMinhas] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);

  const podeGerenciar = user.role === "ADMIN" || user.role === "GERENTE";

  function flash(txt) {
    setMensagem(txt);
    setTimeout(() => setMensagem(""), 2500);
  }

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const params = {};
      if (filtroStatus === "ativas") {
        // listar ABERTA + EM_ANDAMENTO via dois campos — passamos vazio e filtramos no front
      } else if (filtroStatus === "concluidas") {
        params.status = "CONCLUIDA";
      } else if (filtroStatus === "canceladas") {
        params.status = "CANCELADA";
      } else if (filtroStatus === "atrasadas") {
        params.atrasadas = "true";
      }
      if (filtroPrioridade) params.prioridade = filtroPrioridade;
      if (filtroMinhas) params.minhas = "true";

      let data = await api.listarTarefas(params);

      // filtro "ativas" no frontend (ABERTA + EM_ANDAMENTO)
      if (filtroStatus === "ativas") {
        data = data.filter(t => t.status === "ABERTA" || t.status === "EM_ANDAMENTO");
      }

      setTarefas(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [filtroStatus, filtroPrioridade, filtroMinhas]);

  useEffect(() => { carregar(); }, [carregar]);

  async function concluir(tarefa) {
    try {
      await api.concluirTarefa(tarefa.id);
      flash(`"${tarefa.titulo}" concluída`);
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  async function reabrir(tarefa) {
    try {
      await api.reabrirTarefa(tarefa.id);
      flash(`"${tarefa.titulo}" reaberta`);
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  async function excluir(tarefa) {
    if (!confirm(`Excluir "${tarefa.titulo}"?`)) return;
    try {
      await api.excluirTarefa(tarefa.id);
      flash("Tarefa excluída");
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  // Agrupa por status para exibição na lista ativa
  const grupos = useMemo(() => {
    if (filtroStatus !== "ativas") return null;
    const urgentes = tarefas.filter(t => t.prioridade === "URGENTE" && t.status !== "CONCLUIDA" && t.status !== "CANCELADA");
    const emAndamento = tarefas.filter(t => t.status === "EM_ANDAMENTO" && t.prioridade !== "URGENTE");
    const abertas = tarefas.filter(t => t.status === "ABERTA" && t.prioridade !== "URGENTE");
    return { urgentes, emAndamento, abertas };
  }, [tarefas, filtroStatus]);

  const countAtivas = tarefas.filter(t => t.status === "ABERTA" || t.status === "EM_ANDAMENTO").length;
  const countAtrasadas = tarefas.filter(t => {
    const dias = diasRestantes(t.prazo);
    return dias !== null && dias < 0 && t.status !== "CONCLUIDA" && t.status !== "CANCELADA";
  }).length;

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
          {[
            { id: "ativas", label: "Ativas" },
            { id: "atrasadas", label: `Atrasadas${countAtrasadas > 0 ? ` (${countAtrasadas})` : ""}` },
            { id: "concluidas", label: "Concluídas" },
            { id: "canceladas", label: "Canceladas" },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFiltroStatus(f.id)}
              style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer",
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
          onChange={e => setFiltroPrioridade(e.target.value)}
          style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "8px 12px", color: C.text, fontSize: 13, cursor: "pointer",
          }}
        >
          <option value="">Todas prioridades</option>
          <option value="URGENTE">Urgente</option>
          <option value="ALTA">Alta</option>
          <option value="MEDIA">Média</option>
          <option value="BAIXA">Baixa</option>
        </select>

        <button
          onClick={() => setFiltroMinhas(!filtroMinhas)}
          style={{
            padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 500,
            background: filtroMinhas ? `${C.purple}22` : C.surface,
            color: filtroMinhas ? C.purple : C.muted,
            border: `1px solid ${filtroMinhas ? C.purple + "66" : C.border}`,
          }}
        >
          Minhas tarefas
        </button>

        <button
          onClick={() => { setEditando(null); setModalAberto(true); }}
          style={{
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, border: "none", borderRadius: 8,
            padding: "8px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}
        >
          + Nova Tarefa
        </button>
      </div>

      {mensagem && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: `${C.green}22`, border: `1px solid ${C.green}55`, color: C.green, fontSize: 13 }}>
          {mensagem}
        </div>
      )}
      {erro && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8, background: `${C.red}22`, border: `1px solid ${C.red}55`, color: C.red, fontSize: 13 }}>
          {erro}
        </div>
      )}

      {/* Lista */}
      {carregando ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.muted }}>Carregando tarefas...</div>
      ) : tarefas.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 20px", color: C.muted,
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
          <p style={{ margin: 0, fontSize: 14 }}>
            {filtroStatus === "ativas" ? "Nenhuma tarefa ativa. Crie uma!" : "Nenhuma tarefa encontrada."}
          </p>
        </div>
      ) : grupos ? (
        /* Visão agrupada para "ativas" */
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {grupos.urgentes.length > 0 && (
            <Grupo titulo="🚨 Urgentes" cor="#ef4444" tarefas={grupos.urgentes}
              onEditar={t => { setEditando(t); setModalAberto(true); }}
              onConcluir={concluir} onReabrir={reabrir} onExcluir={excluir}
              user={user} podeGerenciar={podeGerenciar} />
          )}
          {grupos.emAndamento.length > 0 && (
            <Grupo titulo="⚡ Em andamento" cor={C.yellow} tarefas={grupos.emAndamento}
              onEditar={t => { setEditando(t); setModalAberto(true); }}
              onConcluir={concluir} onReabrir={reabrir} onExcluir={excluir}
              user={user} podeGerenciar={podeGerenciar} />
          )}
          {grupos.abertas.length > 0 && (
            <Grupo titulo="📋 Abertas" cor={C.accent} tarefas={grupos.abertas}
              onEditar={t => { setEditando(t); setModalAberto(true); }}
              onConcluir={concluir} onReabrir={reabrir} onExcluir={excluir}
              user={user} podeGerenciar={podeGerenciar} />
          )}
        </div>
      ) : (
        /* Lista plana para filtros específicos */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tarefas.map(t => (
            <TarefaCard
              key={t.id}
              tarefa={t}
              onEditar={tarefa => { setEditando(tarefa); setModalAberto(true); }}
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

function Grupo({ titulo, cor, tarefas, onEditar, onConcluir, onReabrir, onExcluir, podeGerenciar }) {
  return (
    <div>
      <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: cor, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {titulo} <span style={{ fontWeight: 400, color: C.muted }}>({tarefas.length})</span>
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tarefas.map(t => (
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
