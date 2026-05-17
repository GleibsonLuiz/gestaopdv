import { useEffect, useState, useCallback, type CSSProperties, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";

// ============ TIPOS ============

type TipoId = "CLIENTE_INATIVO" | "ORCAMENTO_PARADO" | "POS_VENDA_FOLLOWUP";
type PrioridadeId = "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";

interface ParametroDef {
  label: string;
  default: number;
}

interface TipoExemplo {
  nome: string;
  diasGatilho?: number;
  valorMinimo?: number;
  tituloTarefa: string;
  descricaoTarefa: string;
}

interface TipoCfg {
  id: TipoId;
  label: string;
  icone: string;
  cor: string;
  descricao: string;
  parametros: {
    diasGatilho?: ParametroDef;
    valorMinimo?: ParametroDef;
  };
  variaveis: string[];
  exemplo: TipoExemplo;
}

interface PrioridadeCfg {
  id: PrioridadeId;
  label: string;
  cor: string;
}

const TIPOS: TipoCfg[] = [
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

const TIPO_MAP: Record<string, TipoCfg> = Object.fromEntries(TIPOS.map((t) => [t.id, t]));

const PRIORIDADES: PrioridadeCfg[] = [
  { id: "BAIXA",   label: "Baixa",   cor: C.muted },
  { id: "MEDIA",   label: "Média",   cor: C.yellow },
  { id: "ALTA",    label: "Alta",    cor: "#f97316" },
  { id: "URGENTE", label: "Urgente", cor: C.red },
];

const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

interface VendedorRef {
  id: string;
  nome: string;
}

interface RegraResumo {
  regraId: string;
  nome: string;
  erro?: string;
  criadas: number;
  skips?: number;
  candidatos: number;
}

interface ResultadoExec {
  totalCriadas: number;
  resultados?: RegraResumo[];
}

interface Regra {
  id: string;
  nome: string;
  tipo: TipoId;
  ativo: boolean;
  diasGatilho?: number | null;
  valorMinimo?: number | null;
  tituloTarefa: string;
  descricaoTarefa?: string | null;
  prioridadeTarefa: PrioridadeId;
  prazoEmDias: number;
  responsavelId?: string | null;
  totalDisparos?: number;
  ultimaExecucao?: string | null;
}

interface LogExecucao {
  id: string;
  createdAt: string;
  resultado: string;
  regra?: { tipo: TipoId; nome: string };
}

interface FormRegra {
  id?: string;
  nome: string;
  tipo: TipoId;
  ativo: boolean;
  diasGatilho: number | string;
  valorMinimo: number | string;
  tituloTarefa: string;
  descricaoTarefa: string;
  prioridadeTarefa: PrioridadeId;
  prazoEmDias: number | string;
  responsavelId: string;
  ultimaExecucao?: string | null;
  totalDisparos?: number;
}

// ============ COMPONENTE PRINCIPAL ============

interface AutomacoesProps {
  user: SessionUser;
}

export default function Automacoes({ user }: AutomacoesProps) {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [logs, setLogs] = useState<LogExecucao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<FormRegra | null>(null);
  const [vendedores, setVendedores] = useState<VendedorRef[]>([]);
  const [executando, setExecutando] = useState(false);
  const [resultadoExec, setResultadoExec] = useState<ResultadoExec | null>(null);

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE";
  const podeExcluir = user.role === "ADMIN";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [rs, ls, funcs] = await Promise.all([
        api.listarAutomacoes(),
        api.listarLogsAutomacao({ limite: "50" }),
        api.listarFuncionarios({ ativo: "true" }).catch(() => []),
      ]);
      setRegras((rs as Regra[]) || []);
      setLogs((ls as LogExecucao[]) || []);
      setVendedores((funcs as VendedorRef[]) || []);
    } catch (e) {
      setErro((e as Error).message || "Erro ao carregar");
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
      const r = await api.executarTodasAutomacoes() as ResultadoExec;
      setResultadoExec(r);
      await carregar();
    } catch (e) {
      alert((e as Error).message || "Erro ao executar");
    } finally {
      setExecutando(false);
    }
  }

  async function executarUma(regra: Regra) {
    setExecutando(true);
    setResultadoExec(null);
    try {
      const r = await api.executarAutomacao(regra.id) as RegraResumo;
      setResultadoExec({ totalCriadas: r.criadas, resultados: [r] });
      await carregar();
    } catch (e) {
      alert((e as Error).message || "Erro ao executar");
    } finally {
      setExecutando(false);
    }
  }

  async function alternarAtivo(regra: Regra) {
    try {
      await api.atualizarAutomacao(regra.id, { ativo: !regra.ativo });
      await carregar();
    } catch (e) {
      alert((e as Error).message || "Erro");
    }
  }

  async function excluir(regra: Regra) {
    if (!confirm(`Excluir regra "${regra.nome}"?`)) return;
    try {
      await api.excluirAutomacao(regra.id);
      await carregar();
    } catch (e) {
      alert((e as Error).message || "Erro ao excluir");
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

  function abrirEdicao(r: Regra) {
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
    <div className="p-4 text-gp-text">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="m-0 text-gp-white text-[22px] font-bold">
            ⚡ Automações
          </h2>
          <div className="text-gp-muted text-[13px] mt-0.5">
            Regras que geram tarefas automaticamente — clientes inativos, orçamentos parados, pós-venda
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={executarTodas}
            disabled={executando || regras.filter((r) => r.ativo).length === 0}
            className="bg-gp-card text-gp-text rounded-md text-[13px]"
            style={{
              border: `1px solid ${C.border}`,
              padding: "8px 14px",
              cursor: executando ? "not-allowed" : "pointer",
              opacity: executando ? 0.6 : 1,
            }}
          >
            {executando ? "⏳ Executando..." : "▶ Executar todas agora"}
          </button>
          {podeEditar && (
            <button
              type="button"
              onClick={abrirNova}
              className="text-gp-white border-none rounded-md cursor-pointer text-[13px] font-bold"
              style={{
                background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                padding: "8px 18px",
              }}
            >
              + Nova regra
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div
          className="px-[14px] py-[10px] rounded-lg mb-3 text-[13px] text-gp-red"
          style={{ background: C.red + "22" }}
        >
          {erro}
        </div>
      )}

      {resultadoExec && (
        <div
          className="px-[14px] py-[10px] rounded-lg mb-3 text-[13px] text-gp-green"
          style={{
            background: C.green + "11",
            border: `1px solid ${C.green}55`,
          }}
        >
          ✓ Execução concluída — <strong>{resultadoExec.totalCriadas}</strong> tarefa(s) criada(s).
          {resultadoExec.resultados && resultadoExec.resultados.length > 0 && (
            <ul className="mt-1.5 pl-5 text-xs" style={{ margin: "6px 0 0 0" }}>
              {resultadoExec.resultados.map((r) => (
                <li key={r.regraId} className="text-gp-text">
                  <strong>{r.nome}</strong>:{" "}
                  {r.erro
                    ? <span className="text-gp-red">erro — {r.erro}</span>
                    : `${r.criadas} criada(s), ${r.skips || 0} pulada(s) de ${r.candidatos} candidato(s)`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Regras */}
      <div className="mb-5">
        <h3
          className="text-gp-muted text-[11px] uppercase font-bold mb-2"
          style={{ letterSpacing: 0.5 }}
        >
          Regras configuradas
        </h3>
        {carregando ? (
          <div className="text-gp-muted py-[30px] text-center">Carregando...</div>
        ) : regras.length === 0 ? (
          <div
            className="text-gp-muted py-10 text-center bg-gp-surface rounded-lg"
            style={{ border: `1px dashed ${C.border}` }}
          >
            Nenhuma regra cadastrada ainda.
            {podeEditar && <>{" "}Crie a primeira para começar a automatizar follow-ups.</>}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {regras.map((r) => {
              const tipo = TIPO_MAP[r.tipo];
              if (!tipo) return null;
              return (
                <div
                  key={r.id}
                  className="bg-gp-surface rounded-lg flex items-center gap-3 flex-wrap"
                  style={{
                    border: `1px solid ${C.border}`,
                    borderLeft: `3px solid ${tipo.cor}`,
                    padding: "12px 16px",
                    opacity: r.ativo ? 1 : 0.55,
                  }}
                >
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-bold rounded"
                    style={{
                      background: tipo.cor + "22",
                      color: tipo.cor,
                      padding: "3px 8px",
                    }}
                  >
                    {tipo.icone} {tipo.label}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="text-gp-white font-semibold text-sm">
                      {r.nome} {!r.ativo && <span className="text-gp-muted text-[11px] font-normal">(inativa)</span>}
                    </div>
                    <div className="text-gp-muted text-[11px] mt-0.5">
                      {r.diasGatilho && `${r.diasGatilho} dias · `}
                      {r.valorMinimo && `≥ R$ ${Number(r.valorMinimo).toFixed(2)} · `}
                      Prazo da tarefa: {r.prazoEmDias}d ·{" "}
                      {r.totalDisparos || 0} disparo{r.totalDisparos === 1 ? "" : "s"}
                      {r.ultimaExecucao && ` · última: ${fmtData(r.ultimaExecucao)}`}
                    </div>
                  </div>

                  <div className="flex gap-1.5 items-center">
                    {podeEditar && (
                      <button
                        type="button"
                        onClick={() => alternarAtivo(r)}
                        title={r.ativo ? "Desativar" : "Ativar"}
                        className="rounded cursor-pointer text-[11px] font-bold"
                        style={{
                          background: r.ativo ? C.green + "22" : C.muted + "22",
                          color: r.ativo ? C.green : C.muted,
                          border: `1px solid ${r.ativo ? C.green : C.muted}44`,
                          padding: "5px 10px",
                        }}
                      >
                        {r.ativo ? "ATIVA" : "INATIVA"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => executarUma(r)}
                      disabled={!r.ativo || executando}
                      title="Executar essa regra agora"
                      className="rounded text-[11px] font-bold"
                      style={{
                        background: C.accent + "22",
                        color: C.accent,
                        border: `1px solid ${C.accent}44`,
                        padding: "5px 10px",
                        cursor: (!r.ativo || executando) ? "not-allowed" : "pointer",
                        opacity: (!r.ativo || executando) ? 0.4 : 1,
                      }}
                    >
                      ▶ Executar
                    </button>
                    {podeEditar && (
                      <button
                        type="button"
                        onClick={() => abrirEdicao(r)}
                        className="bg-transparent text-gp-muted rounded cursor-pointer text-[11px]"
                        style={{
                          border: `1px solid ${C.border}`,
                          padding: "5px 12px",
                        }}
                      >
                        Editar
                      </button>
                    )}
                    {podeExcluir && (
                      <button
                        type="button"
                        onClick={() => excluir(r)}
                        aria-label={`Excluir ${r.nome}`}
                        className="bg-transparent rounded cursor-pointer text-[11px]"
                        style={{
                          color: C.red,
                          border: `1px solid ${C.red}44`,
                          padding: "5px 10px",
                        }}
                      >
                        🗑
                      </button>
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
        <h3
          className="text-gp-muted text-[11px] uppercase font-bold mb-2"
          style={{ letterSpacing: 0.5 }}
        >
          Histórico de execuções (últimas 50)
        </h3>
        {logs.length === 0 ? (
          <div className="text-gp-muted py-5 text-center bg-gp-surface rounded-lg text-[13px]">
            Nenhuma execução registrada.
          </div>
        ) : (
          <div
            className="bg-gp-surface rounded-lg overflow-hidden"
            style={{ border: `1px solid ${C.border}` }}
          >
            {logs.map((l) => {
              const tipo = l.regra ? TIPO_MAP[l.regra.tipo] : null;
              return (
                <div
                  key={l.id}
                  className="flex items-center gap-2.5 text-xs"
                  style={{
                    padding: "8px 14px",
                    borderTop: `1px solid ${C.border}`,
                  }}
                >
                  <span className="text-gp-muted text-[11px]" style={{ minWidth: 130 }}>
                    {fmtData(l.createdAt)}
                  </span>
                  {tipo && l.regra && (
                    <span
                      className="text-[10px] font-bold rounded"
                      style={{
                        background: tipo.cor + "22",
                        color: tipo.cor,
                        padding: "1px 6px",
                      }}
                    >
                      {tipo.icone} {l.regra.nome}
                    </span>
                  )}
                  <span
                    className="text-[11px]"
                    style={{ color: l.resultado === "CRIADA" ? C.green : C.muted }}
                  >
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

interface ModalRegraProps {
  regra: FormRegra;
  vendedores: VendedorRef[];
  onFechar: () => void;
  onSalvo: () => void;
}

function ModalRegra({ regra, vendedores, onFechar, onSalvo }: ModalRegraProps) {
  const ehNova = !regra.id;
  const [form, setForm] = useState<FormRegra>(regra);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !salvando) onFechar(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar, salvando]);

  const tipoCfg: TipoCfg | undefined = TIPO_MAP[form.tipo];

  function set<K extends keyof FormRegra>(k: K, v: FormRegra[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

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

  function inserirVariavel(chave: string, alvo: "tituloTarefa" | "descricaoTarefa") {
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
      else await api.atualizarAutomacao(form.id!, payload);
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
      style={{ background: "rgba(0,0,0,0.6)", zIndex: 1000 }}
    >
      <div
        className="bg-gp-surface w-full overflow-y-auto"
        style={{
          borderRadius: 12,
          border: `1px solid ${C.border}`,
          maxWidth: 680,
          maxHeight: "92vh",
        }}
      >
        <div
          className="flex justify-between items-center"
          style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}
        >
          <div>
            <div className="text-gp-white text-lg font-bold">
              {ehNova ? "Nova regra de automação" : "Editar regra"}
            </div>
            {!ehNova && (
              <div className="text-gp-muted text-[11px] mt-0.5">
                {form.totalDisparos || 0} disparo(s) · última execução: {fmtData(form.ultimaExecucao)}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            aria-label="Fechar"
            className="bg-transparent text-gp-muted border-none cursor-pointer"
            style={{ fontSize: 22, padding: 4 }}
          >
            ×
          </button>
        </div>

        <div className="p-5 flex flex-col gap-[14px]">
          {/* Tipo */}
          <div>
            <Label>Tipo de gatilho *</Label>
            <div
              className="grid gap-2 mt-1"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
            >
              {TIPOS.map((t) => {
                const sel = form.tipo === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => set("tipo", t.id)}
                    disabled={!ehNova}
                    className="rounded-lg text-left"
                    style={{
                      background: sel ? t.cor + "22" : C.bg,
                      border: `2px solid ${sel ? t.cor : C.border}`,
                      padding: "10px 12px",
                      cursor: ehNova ? "pointer" : "not-allowed",
                      opacity: ehNova ? 1 : 0.7,
                    }}
                  >
                    <div
                      className="flex items-center gap-1.5 text-xs font-bold"
                      style={{ color: t.cor }}
                    >
                      <span className="text-base">{t.icone}</span> {t.label}
                    </div>
                    <div className="text-gp-muted text-[11px] mt-1">
                      {t.descricao}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nome */}
          <div>
            <div className="flex justify-between items-center">
              <Label>Nome da regra *</Label>
              {ehNova && (
                <button
                  type="button"
                  onClick={aplicarExemplo}
                  className="bg-transparent rounded cursor-pointer text-[10px]"
                  style={{
                    color: C.accent,
                    border: `1px solid ${C.accent}55`,
                    padding: "2px 10px",
                  }}
                >
                  ✨ Usar exemplo
                </button>
              )}
            </div>
            <input
              autoFocus
              value={form.nome}
              onChange={(e) => set("nome", e.target.value.toUpperCase())}
              placeholder="Ex: REATIVAR CLIENTES 90 DIAS"
              style={inputModalStyle}
            />
          </div>

          {/* Parametros do tipo */}
          <div className="grid grid-cols-2 gap-3">
            {tipoCfg?.parametros?.diasGatilho && (
              <div>
                <Label>{tipoCfg.parametros.diasGatilho.label}</Label>
                <input
                  type="number" min="1"
                  value={form.diasGatilho}
                  onChange={(e) => set("diasGatilho", e.target.value)}
                  placeholder={String(tipoCfg.parametros.diasGatilho.default)}
                  style={inputModalStyle}
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
                  style={inputModalStyle}
                />
              </div>
            )}
          </div>

          {/* Acao: tarefa */}
          <div
            className="mt-1 pt-3"
            style={{ borderTop: `1px dashed ${C.border}` }}
          >
            <div
              className="text-xs font-bold mb-2 uppercase"
              style={{ color: C.accent, letterSpacing: 0.5 }}
            >
              Tarefa a criar
            </div>

            <Label>Título *</Label>
            <input
              value={form.tituloTarefa}
              onChange={(e) => set("tituloTarefa", e.target.value)}
              placeholder="Use {{nomeCliente}} para o nome..."
              style={inputModalStyle}
            />

            <div className="flex flex-wrap gap-1 mt-1">
              {tipoCfg?.variaveis.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => inserirVariavel(v, "tituloTarefa")}
                  title="Inserir variável no título"
                  style={chipVarStyle}
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>

            <div className="mt-2.5">
              <Label>Descrição</Label>
              <textarea
                value={form.descricaoTarefa}
                onChange={(e) => set("descricaoTarefa", e.target.value)}
                rows={3}
                placeholder="Detalhes da tarefa..."
                style={{
                  ...inputModalStyle,
                  resize: "vertical",
                  minHeight: 70,
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
              />
              <div className="flex flex-wrap gap-1 mt-1">
                {tipoCfg?.variaveis.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => inserirVariavel(v, "descricaoTarefa")}
                    style={chipVarStyle}
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-2.5">
              <div>
                <Label>Prioridade</Label>
                <select
                  value={form.prioridadeTarefa}
                  onChange={(e) => set("prioridadeTarefa", e.target.value as PrioridadeId)}
                  aria-label="Prioridade"
                  style={inputModalStyle}
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
                  aria-label="Prazo em dias"
                  style={inputModalStyle}
                />
              </div>
              <div>
                <Label>Responsável</Label>
                <select
                  value={form.responsavelId}
                  onChange={(e) => set("responsavelId", e.target.value)}
                  aria-label="Responsável"
                  style={inputModalStyle}
                >
                  <option value="">— Vendedor envolvido —</option>
                  {vendedores.map((v) => (
                    <option key={v.id} value={v.id}>{v.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-gp-text text-[13px] cursor-pointer">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => set("ativo", e.target.checked)}
              style={{ accentColor: C.accent }}
            />
            Regra ativa (será executada nas próximas rodadas)
          </label>

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
          className="flex justify-end gap-2"
          style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}` }}
        >
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
            className="text-gp-white border-none rounded-md cursor-pointer text-[13px] font-bold"
            style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              padding: "8px 22px",
            }}
          >
            {salvando ? "Salvando..." : (ehNova ? "Criar regra" : "Salvar")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-gp-muted text-[11px] uppercase mb-1 font-semibold"
      style={{ letterSpacing: 0.5 }}
    >
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
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

const chipVarStyle: CSSProperties = {
  background: C.bg,
  color: C.accent,
  border: `1px solid ${C.border}`,
  padding: "3px 8px",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 10,
  fontFamily: "monospace",
};
