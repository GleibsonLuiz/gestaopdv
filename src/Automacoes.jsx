import { useEffect, useState, useCallback } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";

// ============ CONFIGURACAO DOS TIPOS ============

const TIPOS = [
  {
    id: "CLIENTE_INATIVO",
    label: "Cliente inativo",
    icone: "💤",
    cor: C.yellow,
    descricao: "Dispara para clientes sem compras há X dias",
    parametros: { diasGatilho: { label: "Dias sem compra", default: 90 } },
    variaveis: ["nomeCliente", "recenciaDias"],
    exemplo: {
      nome: "REATIVAR CLIENTES 90 DIAS",
      diasGatilho: 90,
      tituloTarefa: "Reativar {{nomeCliente}} - {{recenciaDias}} dias sem compra",
      descricaoTarefa: "Cliente parou de comprar há {{recenciaDias}} dias. Enviar mensagem de reativação com oferta personalizada.",
    },
  },
  {
    id: "ORCAMENTO_PARADO",
    label: "Orçamento parado",
    icone: "⏳",
    cor: "#7c3aed",
    descricao: "Dispara para orçamentos aguardando aprovação há X dias",
    parametros: { diasGatilho: { label: "Dias sem movimento", default: 7 } },
    variaveis: ["nomeCliente", "numeroOrcamento", "diasParado"],
    exemplo: {
      nome: "FOLLOWUP ORCAMENTO 7 DIAS",
      diasGatilho: 7,
      tituloTarefa: "Follow-up orçamento {{numeroOrcamento}} - {{nomeCliente}}",
      descricaoTarefa: "Orçamento {{numeroOrcamento}} aguarda aprovação há {{diasParado}} dias. Ligar para verificar interesse.",
    },
  },
  {
    id: "POS_VENDA_FOLLOWUP",
    label: "Pós-venda",
    icone: "📞",
    cor: C.green,
    descricao: "Dispara X dias após venda concluída (com valor opcional mínimo)",
    parametros: {
      diasGatilho: { label: "Dias após venda", default: 3 },
      valorMinimo: { label: "Valor mínimo (R$)", default: 0 },
    },
    variaveis: ["nomeCliente", "valorVenda"],
    exemplo: {
      nome: "POSVENDA 3 DIAS",
      diasGatilho: 3,
      valorMinimo: 100,
      tituloTarefa: "Pesquisa pós-venda - {{nomeCliente}} ({{valorVenda}})",
      descricaoTarefa: "Cliente {{nomeCliente}} comprou {{valorVenda}}. Ligar para verificar satisfação e oferecer produtos complementares.",
    },
  },
];

const TIPO_MAP = Object.fromEntries(TIPOS.map((t) => [t.id, t]));

const PRIORIDADES = [
  { id: "BAIXA",   label: "Baixa",   cor: C.muted },
  { id: "MEDIA",   label: "Média",   cor: C.yellow },
  { id: "ALTA",    label: "Alta",    cor: "#f97316" },
  { id: "URGENTE", label: "Urgente", cor: C.red },
];

const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

// ============ COMPONENTE PRINCIPAL ============

export default function Automacoes({ user }) {
  const [regras, setRegras] = useState([]);
  const [logs, setLogs] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(null);
  const [vendedores, setVendedores] = useState([]);
  const [executando, setExecutando] = useState(false);
  const [resultadoExec, setResultadoExec] = useState(null);

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE";
  const podeExcluir = user.role === "ADMIN";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [rs, ls, funcs] = await Promise.all([
        api.listarAutomacoes(),
        api.listarLogsAutomacao({ limite: 50 }),
        api.listarFuncionarios({ ativo: "true" }).catch(() => []),
      ]);
      setRegras(rs);
      setLogs(ls);
      setVendedores(funcs);
    } catch (e) {
      setErro(e.message || "Erro ao carregar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function executarTodas() {
    if (!confirm("Executar todas as regras ativas agora?")) return;
    setExecutando(true);
    setResultadoExec(null);
    try {
      const r = await api.executarTodasAutomacoes();
      setResultadoExec(r);
      await carregar();
    } catch (e) {
      alert(e.message || "Erro ao executar");
    } finally {
      setExecutando(false);
    }
  }

  async function executarUma(regra) {
    setExecutando(true);
    setResultadoExec(null);
    try {
      const r = await api.executarAutomacao(regra.id);
      setResultadoExec({ totalCriadas: r.criadas, resultados: [r] });
      await carregar();
    } catch (e) {
      alert(e.message || "Erro ao executar");
    } finally {
      setExecutando(false);
    }
  }

  async function alternarAtivo(regra) {
    try {
      await api.atualizarAutomacao(regra.id, { ativo: !regra.ativo });
      await carregar();
    } catch (e) {
      alert(e.message || "Erro");
    }
  }

  async function excluir(regra) {
    if (!confirm(`Excluir regra "${regra.nome}"?`)) return;
    try {
      await api.excluirAutomacao(regra.id);
      await carregar();
    } catch (e) {
      alert(e.message || "Erro ao excluir");
    }
  }

  function abrirNova() {
    setEditando({
      nome: "", tipo: "CLIENTE_INATIVO", ativo: true,
      diasGatilho: 90, valorMinimo: "",
      tituloTarefa: "", descricaoTarefa: "",
      prioridadeTarefa: "MEDIA", prazoEmDias: 7, responsavelId: "",
    });
  }

  function abrirEdicao(r) {
    setEditando({
      id: r.id,
      nome: r.nome,
      tipo: r.tipo,
      ativo: r.ativo,
      diasGatilho: r.diasGatilho ?? "",
      valorMinimo: r.valorMinimo ?? "",
      tituloTarefa: r.tituloTarefa,
      descricaoTarefa: r.descricaoTarefa || "",
      prioridadeTarefa: r.prioridadeTarefa,
      prazoEmDias: r.prazoEmDias,
      responsavelId: r.responsavelId || "",
      ultimaExecucao: r.ultimaExecucao,
      totalDisparos: r.totalDisparos,
    });
  }

  return (
    <div style={{ padding: 16, color: C.text }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, color: C.white, fontSize: 22, fontWeight: 700 }}>
            ⚡ Automações
          </h2>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
            Regras que geram tarefas automaticamente — clientes inativos, orçamentos parados, pós-venda
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={executarTodas}
            disabled={executando || regras.filter((r) => r.ativo).length === 0}
            style={{
              background: C.card, color: C.text, border: `1px solid ${C.border}`,
              padding: "8px 14px", borderRadius: 6,
              cursor: executando ? "not-allowed" : "pointer", fontSize: 13,
              opacity: executando ? 0.6 : 1,
            }}
          >
            {executando ? "⏳ Executando..." : "▶ Executar todas agora"}
          </button>
          {podeEditar && (
            <button
              onClick={abrirNova}
              style={{
                background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                color: C.white, border: "none", padding: "8px 18px",
                borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700,
              }}
            >+ Nova regra</button>
          )}
        </div>
      </div>

      {erro && (
        <div style={{ background: C.red + "22", color: C.red, padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {erro}
        </div>
      )}

      {resultadoExec && (
        <div style={{
          background: C.green + "11", color: C.green, padding: "10px 14px",
          border: `1px solid ${C.green}55`, borderRadius: 8, marginBottom: 12, fontSize: 13,
        }}>
          ✓ Execução concluída — <strong>{resultadoExec.totalCriadas}</strong> tarefa(s) criada(s).
          {resultadoExec.resultados && resultadoExec.resultados.length > 0 && (
            <ul style={{ margin: "6px 0 0 0", paddingLeft: 20, fontSize: 12 }}>
              {resultadoExec.resultados.map((r) => (
                <li key={r.regraId} style={{ color: C.text }}>
                  <strong>{r.nome}</strong>:{" "}
                  {r.erro
                    ? <span style={{ color: C.red }}>erro — {r.erro}</span>
                    : `${r.criadas} criada(s), ${r.skips || 0} pulada(s) de ${r.candidatos} candidato(s)`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Regras */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, marginBottom: 8 }}>
          Regras configuradas
        </h3>
        {carregando ? (
          <div style={{ color: C.muted, padding: 30, textAlign: "center" }}>Carregando...</div>
        ) : regras.length === 0 ? (
          <div style={{ color: C.muted, padding: 40, textAlign: "center", background: C.surface, borderRadius: 8, border: `1px dashed ${C.border}` }}>
            Nenhuma regra cadastrada ainda.
            {podeEditar && <>{" "}Crie a primeira para começar a automatizar follow-ups.</>}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {regras.map((r) => {
              const tipo = TIPO_MAP[r.tipo];
              return (
                <div key={r.id} style={{
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${tipo.cor}`,
                  borderRadius: 8,
                  padding: "12px 16px",
                  opacity: r.ativo ? 1 : 0.55,
                  display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                }}>
                  <span style={{
                    background: tipo.cor + "22", color: tipo.cor,
                    padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}>{tipo.icone} {tipo.label}</span>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: C.white, fontWeight: 600, fontSize: 14 }}>
                      {r.nome} {!r.ativo && <span style={{ color: C.muted, fontSize: 11, fontWeight: 400 }}>(inativa)</span>}
                    </div>
                    <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                      {r.diasGatilho && `${r.diasGatilho} dias · `}
                      {r.valorMinimo && `≥ R$ ${Number(r.valorMinimo).toFixed(2)} · `}
                      Prazo da tarefa: {r.prazoEmDias}d ·{" "}
                      {r.totalDisparos || 0} disparo{r.totalDisparos === 1 ? "" : "s"}
                      {r.ultimaExecucao && ` · última: ${fmtData(r.ultimaExecucao)}`}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {podeEditar && (
                      <button
                        onClick={() => alternarAtivo(r)}
                        title={r.ativo ? "Desativar" : "Ativar"}
                        style={{
                          background: r.ativo ? C.green + "22" : C.muted + "22",
                          color: r.ativo ? C.green : C.muted,
                          border: `1px solid ${r.ativo ? C.green : C.muted}44`,
                          padding: "5px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 700,
                        }}
                      >{r.ativo ? "ATIVA" : "INATIVA"}</button>
                    )}
                    <button
                      onClick={() => executarUma(r)}
                      disabled={!r.ativo || executando}
                      title="Executar essa regra agora"
                      style={{
                        background: C.accent + "22", color: C.accent,
                        border: `1px solid ${C.accent}44`,
                        padding: "5px 10px", borderRadius: 4,
                        cursor: (!r.ativo || executando) ? "not-allowed" : "pointer",
                        fontSize: 11, fontWeight: 700,
                        opacity: (!r.ativo || executando) ? 0.4 : 1,
                      }}
                    >▶ Executar</button>
                    {podeEditar && (
                      <button
                        onClick={() => abrirEdicao(r)}
                        style={{
                          background: "transparent", color: C.muted,
                          border: `1px solid ${C.border}`,
                          padding: "5px 12px", borderRadius: 4, cursor: "pointer", fontSize: 11,
                        }}
                      >Editar</button>
                    )}
                    {podeExcluir && (
                      <button
                        onClick={() => excluir(r)}
                        style={{
                          background: "transparent", color: C.red,
                          border: `1px solid ${C.red}44`,
                          padding: "5px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11,
                        }}
                      >🗑</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Logs */}
      <div>
        <h3 style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700, marginBottom: 8 }}>
          Histórico de execuções (últimas 50)
        </h3>
        {logs.length === 0 ? (
          <div style={{ color: C.muted, padding: 20, textAlign: "center", background: C.surface, borderRadius: 8, fontSize: 13 }}>
            Nenhuma execução registrada.
          </div>
        ) : (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            {logs.map((l) => {
              const tipo = l.regra ? TIPO_MAP[l.regra.tipo] : null;
              return (
                <div key={l.id} style={{
                  padding: "8px 14px",
                  borderTop: `1px solid ${C.border}`,
                  display: "flex", alignItems: "center", gap: 10, fontSize: 12,
                }}>
                  <span style={{ color: C.muted, fontSize: 11, minWidth: 130 }}>
                    {fmtData(l.createdAt)}
                  </span>
                  {tipo && (
                    <span style={{
                      background: tipo.cor + "22", color: tipo.cor,
                      padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                    }}>{tipo.icone} {l.regra.nome}</span>
                  )}
                  <span style={{ color: l.resultado === "CRIADA" ? C.green : C.muted, fontSize: 11 }}>
                    {l.resultado === "CRIADA" ? "✓ Tarefa criada" : l.resultado}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editando && (
        <ModalRegra
          regra={editando}
          vendedores={vendedores}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar(); }}
        />
      )}
    </div>
  );
}

// ============ MODAL REGRA ============

function ModalRegra({ regra, vendedores, onFechar, onSalvo }) {
  const ehNova = !regra.id;
  const [form, setForm] = useState(regra);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape" && !salvando) onFechar(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar, salvando]);

  const tipoCfg = TIPO_MAP[form.tipo];

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function aplicarExemplo() {
    if (!tipoCfg?.exemplo) return;
    const ex = tipoCfg.exemplo;
    setForm((f) => ({
      ...f,
      nome: ex.nome,
      diasGatilho: ex.diasGatilho ?? f.diasGatilho,
      valorMinimo: ex.valorMinimo ?? f.valorMinimo,
      tituloTarefa: ex.tituloTarefa,
      descricaoTarefa: ex.descricaoTarefa,
    }));
  }

  function inserirVariavel(chave, alvo) {
    const placeholder = `{{${chave}}}`;
    setForm((f) => ({ ...f, [alvo]: (f[alvo] || "") + placeholder }));
  }

  async function salvar() {
    setErro("");
    if (!form.nome.trim()) return setErro("Nome é obrigatório");
    if (!form.tituloTarefa.trim()) return setErro("Título da tarefa é obrigatório");

    setSalvando(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        tipo: form.tipo,
        ativo: form.ativo,
        diasGatilho: form.diasGatilho || null,
        valorMinimo: form.valorMinimo || null,
        tituloTarefa: form.tituloTarefa.trim(),
        descricaoTarefa: form.descricaoTarefa || null,
        prioridadeTarefa: form.prioridadeTarefa,
        prazoEmDias: form.prazoEmDias || 7,
        responsavelId: form.responsavelId || null,
      };
      if (ehNova) await api.criarAutomacao(payload);
      else await api.atualizarAutomacao(form.id, payload);
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
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
      }}
    >
      <div style={{
        background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
        width: "100%", maxWidth: 680, maxHeight: "92vh", overflowY: "auto",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: C.white, fontSize: 18, fontWeight: 700 }}>
              {ehNova ? "Nova regra de automação" : "Editar regra"}
            </div>
            {!ehNova && (
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                {form.totalDisparos || 0} disparo(s) · última execução: {fmtData(form.ultimaExecucao)}
              </div>
            )}
          </div>
          <button onClick={onFechar} disabled={salvando} style={{
            background: "transparent", color: C.muted, border: "none",
            fontSize: 22, cursor: "pointer", padding: 4,
          }}>×</button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Tipo */}
          <div>
            <Label>Tipo de gatilho *</Label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 4 }}>
              {TIPOS.map((t) => {
                const sel = form.tipo === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => set("tipo", t.id)}
                    disabled={!ehNova}
                    style={{
                      background: sel ? t.cor + "22" : C.bg,
                      border: `2px solid ${sel ? t.cor : C.border}`,
                      borderRadius: 8, padding: "10px 12px",
                      cursor: ehNova ? "pointer" : "not-allowed",
                      textAlign: "left", opacity: ehNova ? 1 : 0.7,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: t.cor, fontSize: 12, fontWeight: 700 }}>
                      <span style={{ fontSize: 16 }}>{t.icone}</span> {t.label}
                    </div>
                    <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
                      {t.descricao}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nome */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Label>Nome da regra *</Label>
              {ehNova && (
                <button
                  type="button"
                  onClick={aplicarExemplo}
                  style={{
                    background: "transparent", color: C.accent, border: `1px solid ${C.accent}55`,
                    padding: "2px 10px", borderRadius: 4, cursor: "pointer", fontSize: 10,
                  }}
                >✨ Usar exemplo</button>
              )}
            </div>
            <input
              autoFocus
              value={form.nome}
              onChange={(e) => set("nome", e.target.value.toUpperCase())}
              placeholder="Ex: REATIVAR CLIENTES 90 DIAS"
              style={inputModal()}
            />
          </div>

          {/* Parametros do tipo */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {tipoCfg?.parametros?.diasGatilho && (
              <div>
                <Label>{tipoCfg.parametros.diasGatilho.label}</Label>
                <input
                  type="number" min="1"
                  value={form.diasGatilho}
                  onChange={(e) => set("diasGatilho", e.target.value)}
                  placeholder={String(tipoCfg.parametros.diasGatilho.default)}
                  style={inputModal()}
                />
              </div>
            )}
            {tipoCfg?.parametros?.valorMinimo && (
              <div>
                <Label>{tipoCfg.parametros.valorMinimo.label}</Label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.valorMinimo}
                  onChange={(e) => set("valorMinimo", e.target.value)}
                  placeholder="0,00"
                  style={inputModal()}
                />
              </div>
            )}
          </div>

          {/* Acao: tarefa */}
          <div style={{ marginTop: 4, paddingTop: 12, borderTop: `1px dashed ${C.border}` }}>
            <div style={{ color: C.accent, fontSize: 12, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Tarefa a criar
            </div>

            <Label>Título *</Label>
            <input
              value={form.tituloTarefa}
              onChange={(e) => set("tituloTarefa", e.target.value)}
              placeholder="Use {{nomeCliente}} para o nome..."
              style={inputModal()}
            />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
              {tipoCfg?.variaveis.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => inserirVariavel(v, "tituloTarefa")}
                  title="Inserir variável no título"
                  style={chipVar()}
                >{`{{${v}}}`}</button>
              ))}
            </div>

            <div style={{ marginTop: 10 }}>
              <Label>Descrição</Label>
              <textarea
                value={form.descricaoTarefa}
                onChange={(e) => set("descricaoTarefa", e.target.value)}
                rows={3}
                placeholder="Detalhes da tarefa..."
                style={{ ...inputModal(), resize: "vertical", minHeight: 70, fontFamily: "monospace", fontSize: 12 }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {tipoCfg?.variaveis.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => inserirVariavel(v, "descricaoTarefa")}
                    style={chipVar()}
                  >{`{{${v}}}`}</button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 10 }}>
              <div>
                <Label>Prioridade</Label>
                <select
                  value={form.prioridadeTarefa}
                  onChange={(e) => set("prioridadeTarefa", e.target.value)}
                  style={inputModal()}
                >
                  {PRIORIDADES.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Prazo (dias)</Label>
                <input
                  type="number" min="1"
                  value={form.prazoEmDias}
                  onChange={(e) => set("prazoEmDias", e.target.value)}
                  style={inputModal()}
                />
              </div>
              <div>
                <Label>Responsável</Label>
                <select
                  value={form.responsavelId}
                  onChange={(e) => set("responsavelId", e.target.value)}
                  style={inputModal()}
                >
                  <option value="">— Vendedor envolvido —</option>
                  {vendedores.map((v) => (
                    <option key={v.id} value={v.id}>{v.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, color: C.text, fontSize: 13, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => set("ativo", e.target.checked)}
              style={{ accentColor: C.accent }}
            />
            Regra ativa (será executada nas próximas rodadas)
          </label>

          {erro && (
            <div style={{ background: C.red + "22", color: C.red, padding: "8px 12px", borderRadius: 6, fontSize: 12 }}>
              {erro}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
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
              borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700,
            }}
          >{salvando ? "Salvando..." : (ehNova ? "Criar regra" : "Salvar")}</button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 600 }}>
      {children}
    </div>
  );
}

function inputModal() {
  return {
    width: "100%", boxSizing: "border-box",
    background: C.bg, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
    outline: "none",
  };
}

function chipVar() {
  return {
    background: C.bg, color: C.accent, border: `1px solid ${C.border}`,
    padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10,
    fontFamily: "monospace",
  };
}
