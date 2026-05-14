import { useEffect, useMemo, useState, useCallback } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";
import SelectBusca from "./components/SelectBusca.jsx";

// ============ CONFIGURACAO DAS ETAPAS ============

const ETAPAS = [
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

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
};

const fmtDataInput = (iso) => {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
};

const VAZIO = {
  titulo: "", descricao: "", valorEstimado: "", probabilidade: "",
  dataFechamentoPrevista: "", origem: "", clienteId: "", responsavelId: "",
  etapa: "LEAD",
};

// ============ COMPONENTE PRINCIPAL ============

export default function Funil({ user }) {
  const [oportunidades, setOportunidades] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtros, setFiltros] = useState({ responsavelId: "", origem: "", search: "" });
  const [vendedores, setVendedores] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [editando, setEditando] = useState(null); // oportunidade ou {} para nova
  const [arrastando, setArrastando] = useState(null); // id da op arrastada
  const [etapaHover, setEtapaHover] = useState(null);
  const [confirmPerda, setConfirmPerda] = useState(null); // { id, etapaAntiga }

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
      setOportunidades(lista);
      setResumo(res);
    } catch (e) {
      setErro(e.message || "Erro ao carregar funil");
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Carrega vendedores e clientes uma vez
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [funcs, clis] = await Promise.all([
          api.listarFuncionarios({ ativo: "true" }).catch(() => []),
          api.listarClientes({ ativo: "true" }).catch(() => []),
        ]);
        if (!ativo) return;
        setVendedores(funcs || []);
        setClientes(clis || []);
      } catch {
        // ignore
      }
    })();
    return () => { ativo = false; };
  }, []);

  // Agrupa por etapa para o Kanban
  const porEtapa = useMemo(() => {
    const m = {};
    for (const e of ETAPAS) m[e.id] = [];
    for (const op of oportunidades) {
      if (m[op.etapa]) m[op.etapa].push(op);
    }
    return m;
  }, [oportunidades]);

  function abrirNova() {
    if (!podeEditar) return;
    setEditando({ ...VAZIO });
  }

  function abrirEdicao(op) {
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

  async function excluirOp(op) {
    if (!podeExcluir) return;
    if (!confirm(`Excluir oportunidade #${op.numero} - ${op.titulo}?`)) return;
    try {
      await api.excluirOportunidade(op.id);
      await carregar();
    } catch (e) {
      alert(e.message || "Erro ao excluir");
    }
  }

  // ============ DRAG-AND-DROP ============

  function onDragStart(e, op) {
    if (!podeEditar) return;
    setArrastando(op.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", op.id);
  }

  function onDragEnd() {
    setArrastando(null);
    setEtapaHover(null);
  }

  function onDragOver(e, etapaId) {
    if (!podeEditar) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (etapaHover !== etapaId) setEtapaHover(etapaId);
  }

  async function onDrop(e, novaEtapa) {
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

    // Update otimista
    setOportunidades((arr) => arr.map((o) => (o.id === id ? { ...o, etapa: novaEtapa } : o)));
    try {
      await api.moverEtapaOportunidade(id, novaEtapa);
      await carregar();
    } catch (err) {
      alert(err.message || "Erro ao mover");
      await carregar();
    }
  }

  async function confirmarPerda(motivo) {
    if (!confirmPerda || !motivo.trim()) return;
    const { id } = confirmPerda;
    setConfirmPerda(null);
    try {
      await api.moverEtapaOportunidade(id, "PERDIDO", { motivoPerda: motivo.trim() });
      await carregar();
    } catch (err) {
      alert(err.message || "Erro ao mover");
    }
  }

  // ============ RENDER ============

  return (
    <div style={{ padding: 16, color: C.text }}>
      <Cabecalho
        resumo={resumo}
        filtros={filtros}
        onFiltros={setFiltros}
        vendedores={vendedores}
        onNova={abrirNova}
        podeEditar={podeEditar}
      />

      {erro && (
        <div style={{
          background: C.red + "22", color: C.red, padding: "10px 14px",
          borderRadius: 8, marginBottom: 12, fontSize: 13,
        }}>{erro}</div>
      )}

      {carregando ? (
        <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Carregando funil...</div>
      ) : (
        <div className="gp-funil-board" style={{
          display: "grid",
          gridTemplateColumns: `repeat(${ETAPAS.length}, minmax(260px, 1fr))`,
          gap: 12,
          overflowX: "auto",
          paddingBottom: 16,
        }}>
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
                style={{
                  background: ehHover ? etapa.cor + "22" : C.surface,
                  border: `1px solid ${ehHover ? etapa.cor : C.border}`,
                  borderRadius: 10,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 400,
                  transition: "background 0.12s ease, border-color 0.12s ease",
                }}
              >
                {/* Header da coluna */}
                <div style={{
                  padding: "12px 14px",
                  borderBottom: `2px solid ${etapa.cor}`,
                  borderTopLeftRadius: 10, borderTopRightRadius: 10,
                  background: etapa.cor + "11",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 16 }}>{etapa.icone}</span>
                      <span style={{ color: etapa.cor, fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.4 }}>
                        {etapa.label}
                      </span>
                    </div>
                    <span style={{
                      background: etapa.cor + "22", color: etapa.cor,
                      padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                    }}>{cards.length}</span>
                  </div>
                  <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
                    {fmtBRL(totalValor)}
                  </div>
                </div>

                {/* Cards */}
                <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                  {cards.length === 0 && (
                    <div style={{
                      color: C.muted, fontSize: 11, textAlign: "center",
                      padding: "20px 8px", fontStyle: "italic",
                    }}>
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
          onExcluir={editando.id ? () => { excluirOp(editando); setEditando(null); } : null}
          podeExcluir={podeExcluir}
          user={user}
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

function Cabecalho({ resumo, filtros, onFiltros, vendedores, onNova, podeEditar }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, color: C.white, fontSize: 22, fontWeight: 700 }}>
            🎯 Funil de Vendas
          </h2>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
            Acompanhe oportunidades em cada etapa do processo comercial
          </div>
        </div>
        {podeEditar && (
          <button
            onClick={onNova}
            style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              color: C.white, border: "none", padding: "10px 18px",
              borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 13,
              boxShadow: `0 4px 12px ${C.accent}33`,
            }}
          >+ Nova Oportunidade</button>
        )}
      </div>

      {/* KPIs */}
      {resumo && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 10, marginBottom: 12,
        }}>
          <Kpi label="Em aberto" valor={resumo.totalAberto} icone="📋" cor={C.accent} />
          <Kpi label="Forecast ponderado" valor={fmtBRL(resumo.valorPonderadoAberto)} icone="🔮" cor={C.purple || "#7c3aed"} sub="Valor × Probabilidade" />
          <Kpi label="Ganhos" valor={resumo.totalGanho} icone="🏆" cor={C.green} sub={fmtBRL(resumo.valorGanho)} />
          <Kpi label="Perdidos" valor={resumo.totalPerdido} icone="💔" cor={C.red} />
          <Kpi label="Taxa de conversão" valor={`${resumo.taxaConversao.toFixed(1)}%`} icone="📈" cor={C.yellow} sub="Ganhos / fechadas" />
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="🔍 Buscar por título, descrição, cliente..."
          value={filtros.search}
          onChange={(e) => onFiltros({ ...filtros, search: e.target.value })}
          style={inputFiltro(280)}
        />
        <select
          value={filtros.responsavelId}
          onChange={(e) => onFiltros({ ...filtros, responsavelId: e.target.value })}
          style={inputFiltro(200)}
        >
          <option value="">Todos os vendedores</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>{v.nome}</option>
          ))}
        </select>
        <select
          value={filtros.origem}
          onChange={(e) => onFiltros({ ...filtros, origem: e.target.value })}
          style={inputFiltro(160)}
        >
          <option value="">Todas as origens</option>
          {ORIGENS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        {(filtros.search || filtros.responsavelId || filtros.origem) && (
          <button
            onClick={() => onFiltros({ responsavelId: "", origem: "", search: "" })}
            style={{
              background: "transparent", color: C.muted, border: `1px solid ${C.border}`,
              padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
            }}
          >Limpar filtros</button>
        )}
      </div>
    </div>
  );
}

function inputFiltro(width) {
  return {
    background: C.card, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: "8px 12px", fontSize: 13, width,
  };
}

function Kpi({ label, valor, icone, cor, sub }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${cor}`,
      borderRadius: 8, padding: "10px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
        <span>{icone}</span> {label}
      </div>
      <div style={{ color: C.white, fontSize: 20, fontWeight: 700, marginTop: 4 }}>{valor}</div>
      {sub && <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ============ CARD DA OPORTUNIDADE ============

function CardOportunidade({ op, etapa, arrastando, onDragStart, onDragEnd, onClick, podeEditar }) {
  const valor = Number(op.valorEstimado || 0);
  const ponderado = valor * (Number(op.probabilidade || 0) / 100);
  const diasFechar = op.dataFechamentoPrevista
    ? Math.round((new Date(op.dataFechamentoPrevista) - new Date()) / 86400000)
    : null;
  const atrasado = diasFechar !== null && diasFechar < 0 && etapa.id !== "GANHO" && etapa.id !== "PERDIDO";

  return (
    <div
      draggable={podeEditar}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        background: C.card,
        border: `1px solid ${atrasado ? C.red : C.border}`,
        borderLeft: `3px solid ${etapa.cor}`,
        borderRadius: 8,
        padding: 10,
        cursor: podeEditar ? "grab" : "pointer",
        opacity: arrastando ? 0.4 : 1,
        transition: "opacity 0.12s",
        boxShadow: arrastando ? "none" : `0 1px 2px rgba(0,0,0,0.1)`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        <div style={{ color: C.white, fontWeight: 600, fontSize: 13, lineHeight: 1.3, flex: 1, minWidth: 0 }}>
          {op.titulo}
        </div>
        <div style={{ color: C.muted, fontSize: 10, flexShrink: 0 }}>#{op.numero}</div>
      </div>

      {op.cliente && (
        <div style={{ color: C.muted, fontSize: 11, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
          <span>👤</span> {op.cliente.nome}
        </div>
      )}

      {valor > 0 && (
        <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
          <div style={{ color: C.green, fontWeight: 700, fontSize: 13 }}>{fmtBRL(valor)}</div>
          {op.probabilidade > 0 && etapa.id !== "GANHO" && etapa.id !== "PERDIDO" && (
            <div style={{ color: C.muted, fontSize: 10 }}>
              {op.probabilidade}% · {fmtBRL(ponderado)}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: C.muted, gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {op.responsavel && <span>🧑 {op.responsavel.nome.split(" ")[0]}</span>}
        </div>
        {diasFechar !== null && (
          <div style={{ color: atrasado ? C.red : C.muted }}>
            {atrasado ? `⚠ ${Math.abs(diasFechar)}d atrasado` : `📅 ${fmtData(op.dataFechamentoPrevista)}`}
          </div>
        )}
      </div>

      {op.origem && (
        <div style={{
          marginTop: 6, display: "inline-block",
          background: C.bg, color: C.muted, fontSize: 10,
          padding: "2px 6px", borderRadius: 4, border: `1px solid ${C.border}`,
        }}>{op.origem}</div>
      )}

      {etapa.id === "PERDIDO" && op.motivoPerda && (
        <div style={{ marginTop: 6, fontSize: 10, color: C.red, fontStyle: "italic" }}>
          ✗ {op.motivoPerda}
        </div>
      )}
    </div>
  );
}

// ============ MODAL DE CRIAR/EDITAR ============

function ModalOportunidade({ oportunidade, vendedores, clientes, onFechar, onSalvo, onExcluir, podeExcluir, user }) {
  const ehNova = !oportunidade.id;
  const [form, setForm] = useState(oportunidade);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape" && !salvando) onFechar(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar, salvando]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function salvar() {
    if (!form.titulo.trim()) {
      setErro("Título é obrigatório");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const payload = {
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
        await api.atualizarOportunidade(form.id, payload);
      }
      onSalvo();
    } catch (e) {
      setErro(e.message || "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !salvando) onFechar(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
      }}
    >
      <div style={{
        background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
        width: "100%", maxWidth: 640, maxHeight: "92vh", overflowY: "auto",
        boxShadow: `0 20px 60px rgba(0,0,0,0.5)`,
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: C.white, fontSize: 18, fontWeight: 700 }}>
              {ehNova ? "Nova Oportunidade" : `Oportunidade #${form.numero}`}
            </div>
            {!ehNova && (
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                Criada em {fmtData(form.createdAt)} por {form.criadoPor?.nome || "—"}
              </div>
            )}
          </div>
          <button onClick={onFechar} disabled={salvando} style={{
            background: "transparent", color: C.muted, border: "none",
            fontSize: 22, cursor: "pointer", padding: 4, lineHeight: 1,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <Campo label="Título *">
            <input
              autoFocus
              value={form.titulo}
              onChange={(e) => set("titulo", e.target.value)}
              placeholder="Ex: Proposta de papelaria para escola X"
              style={inputModal()}
            />
          </Campo>

          <Campo label="Descrição">
            <textarea
              value={form.descricao}
              onChange={(e) => set("descricao", e.target.value)}
              rows={3}
              placeholder="Detalhes da oportunidade, requisitos, próximos passos..."
              style={{ ...inputModal(), resize: "vertical", minHeight: 70 }}
            />
          </Campo>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Campo label="Valor estimado (R$)">
              <input
                type="number" min="0" step="0.01"
                value={form.valorEstimado}
                onChange={(e) => set("valorEstimado", e.target.value)}
                placeholder="0,00"
                style={inputModal()}
              />
            </Campo>
            <Campo label="Probabilidade (%)">
              <input
                type="number" min="0" max="100" step="5"
                value={form.probabilidade}
                onChange={(e) => set("probabilidade", e.target.value)}
                placeholder="0"
                style={inputModal()}
              />
            </Campo>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Campo label="Previsão de fechamento">
              <input
                type="date"
                value={form.dataFechamentoPrevista}
                onChange={(e) => set("dataFechamentoPrevista", e.target.value)}
                style={inputModal()}
              />
            </Campo>
            <Campo label="Origem">
              <select
                value={form.origem}
                onChange={(e) => set("origem", e.target.value)}
                style={inputModal()}
              >
                <option value="">— Selecione —</option>
                {ORIGENS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </Campo>
          </div>

          <Campo label="Cliente">
            <SelectBusca
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
              style={inputModal()}
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
                onChange={(e) => set("etapa", e.target.value)}
                style={inputModal()}
              >
                {ETAPAS.filter((e) => e.id !== "GANHO" && e.id !== "PERDIDO").map((e) => (
                  <option key={e.id} value={e.id}>{e.icone} {e.label}</option>
                ))}
              </select>
            </Campo>
          )}

          {!ehNova && form.historico && form.historico.length > 0 && (
            <div>
              <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                Histórico
              </div>
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, maxHeight: 180, overflowY: "auto" }}>
                {form.historico.slice(0, 10).map((h) => (
                  <div key={h.id} style={{ fontSize: 11, color: C.muted, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
                    <strong style={{ color: C.text }}>
                      {h.etapaAnterior ? `${h.etapaAnterior} → ${h.etapaNova}` : h.etapaNova}
                    </strong>
                    {" · "}{h.user?.nome || "—"}{" · "}{fmtData(h.createdAt)}
                    {h.observacao && <div style={{ fontStyle: "italic" }}>{h.observacao}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {erro && (
            <div style={{ background: C.red + "22", color: C.red, padding: "8px 12px", borderRadius: 6, fontSize: 12 }}>
              {erro}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div>
            {!ehNova && podeExcluir && onExcluir && (
              <button
                onClick={onExcluir}
                disabled={salvando}
                style={{
                  background: "transparent", color: C.red, border: `1px solid ${C.red}44`,
                  padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                }}
              >🗑 Excluir</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onFechar}
              disabled={salvando}
              style={{
                background: "transparent", color: C.muted, border: `1px solid ${C.border}`,
                padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13,
              }}
            >Cancelar</button>
            <button
              onClick={salvar}
              disabled={salvando}
              style={{
                background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                color: C.white, border: "none", padding: "8px 22px",
                borderRadius: 6, cursor: "pointer", fontWeight: 700, fontSize: 13,
              }}
            >{salvando ? "Salvando..." : (ehNova ? "Criar" : "Salvar")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div>
      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 600 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function inputModal() {
  return {
    width: "100%", boxSizing: "border-box",
    background: C.bg, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: "9px 12px", fontSize: 13, fontFamily: "inherit",
    outline: "none",
  };
}

// ============ MODAL MOTIVO DE PERDA ============

function ModalMotivoPerda({ onFechar, onConfirmar }) {
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onFechar(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1001, padding: 16,
      }}
    >
      <div style={{
        background: C.surface, borderRadius: 10, border: `1px solid ${C.red}44`,
        width: "100%", maxWidth: 440, padding: 20,
      }}>
        <div style={{ color: C.red, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          💔 Marcar como Perdido
        </div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 14 }}>
          Informe o motivo da perda para análise futura.
        </div>
        <textarea
          autoFocus
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          placeholder="Ex: Cliente escolheu concorrente, preço alto, sem orçamento..."
          style={{ ...inputModal(), resize: "vertical", minHeight: 80, marginBottom: 14 }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onFechar}
            style={{
              background: "transparent", color: C.muted, border: `1px solid ${C.border}`,
              padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13,
            }}
          >Cancelar</button>
          <button
            onClick={() => onConfirmar(motivo)}
            disabled={!motivo.trim()}
            style={{
              background: motivo.trim() ? C.red : C.red + "55",
              color: C.white, border: "none",
              padding: "8px 22px", borderRadius: 6,
              cursor: motivo.trim() ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 13,
            }}
          >Confirmar perda</button>
        </div>
      </div>
    </div>
  );
}
