import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";
import { ignorarErro } from "./lib/erroSilencioso";

type AcaoLog =
  | "CREATE" | "UPDATE" | "DELETE"
  | "LOGIN" | "LOGOUT" | "LOGIN_FALHO"
  | "TROCA_SENHA" | "RESET_TOTAL" | "OUTRA"
  | string;

interface DiffEntry { antes: unknown; depois: unknown }

interface Log {
  id: string;
  acao: AcaoLog;
  modulo: string;
  createdAt: string;
  usuarioNome?: string;
  usuarioEmail?: string;
  metodo?: string;
  rota?: string;
  entidadeId?: string;
  statusCode?: number | null;
  duracaoMs?: number | null;
  ip?: string;
  userAgent?: string;
  mensagem?: string;
  sucesso: boolean;
  diff?: Record<string, DiffEntry>;
  dadosAntes?: unknown;
  dadosDepois?: unknown;
}

interface RespostaLogs {
  total: number;
  totalPaginas: number;
  itens: Log[];
}

interface OpcoesFiltro {
  modulos: string[];
  acoes: string[];
  usuarios: { id: string; nome: string }[];
}

interface ResumoLogs {
  total24h: number;
  total7d: number;
  falhas24h: number;
  porModulo: { modulo: string; total: number }[];
}

interface Filtros {
  busca: string;
  modulo: string;
  acao: string;
  usuarioId: string;
  sucesso: string;
  dataInicio: string;
  dataFim: string;
}

interface Paginas {
  pagina: number;
  tamanho: number;
}

interface CoresAcao { bg: string; fg: string; icone: string }

const CORES_ACAO: Record<string, CoresAcao> = {
  CREATE:      { bg: "#22c55e22", fg: "#22c55e", icone: "+" },
  UPDATE:      { bg: "#3b82f622", fg: "#3b82f6", icone: "~" },
  DELETE:      { bg: "#ef444422", fg: "#ef4444", icone: "×" },
  LOGIN:       { bg: "#10b98122", fg: "#10b981", icone: "→" },
  LOGOUT:      { bg: "#64748b22", fg: "#94a3b8", icone: "←" },
  LOGIN_FALHO: { bg: "#f59e0b22", fg: "#f59e0b", icone: "!" },
  TROCA_SENHA: { bg: "#a855f722", fg: "#a855f7", icone: "🔑" },
  RESET_TOTAL: { bg: "#dc262622", fg: "#dc2626", icone: "⚠" },
  OUTRA:       { bg: "#64748b22", fg: "#94a3b8", icone: "•" },
};

function corAcao(acao: string): CoresAcao { return CORES_ACAO[acao] || CORES_ACAO.OUTRA; }

function formatarData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function CampoKv({ label, valor }: { label: string; valor: unknown }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gp-muted min-w-[90px]">{label}:</span>
      <span className="text-gp-text break-all flex-1">{(valor as string) || "—"}</span>
    </div>
  );
}

function JsonBox({ titulo, valor }: { titulo: string; valor: unknown }) {
  if (!valor) return null;
  return (
    <div className="flex-1 min-w-0">
      <div className="text-gp-muted text-[11px] font-bold mb-1 uppercase tracking-[0.5px]">
        {titulo}
      </div>
      <pre className="m-0 p-[10px] bg-gp-bg border border-gp-border rounded-lg text-gp-text text-[11.5px] leading-[1.5] max-h-[220px] overflow-auto whitespace-pre-wrap break-all font-mono">
        {JSON.stringify(valor, null, 2)}
      </pre>
    </div>
  );
}

function DetalhesLog({ log }: { log: Log }) {
  const temDiff = log.diff && Object.keys(log.diff).length > 0;
  return (
    <div
      className="px-[18px] py-[14px] border-t border-gp-border flex flex-col gap-3"
      style={{ background: C.bg + "88" }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <CampoKv label="Rota" valor={log.rota} />
          <CampoKv label="Método" valor={log.metodo} />
          <CampoKv label="Status" valor={log.statusCode != null ? log.statusCode : "—"} />
          <CampoKv label="Duração" valor={log.duracaoMs != null ? `${log.duracaoMs} ms` : "—"} />
        </div>
        <div className="flex flex-col gap-1">
          <CampoKv label="Entidade ID" valor={log.entidadeId} />
          <CampoKv label="IP" valor={log.ip} />
          <CampoKv label="User Agent" valor={log.userAgent} />
          {log.mensagem && <CampoKv label="Mensagem" valor={log.mensagem} />}
        </div>
      </div>

      {temDiff && (
        <div>
          <div className="text-gp-muted text-[11px] font-bold mb-[6px] uppercase tracking-[0.5px]">
            Campos alterados
          </div>
          <div className="bg-gp-bg border border-gp-border rounded-lg p-[10px] flex flex-col gap-[6px] text-xs">
            {Object.entries(log.diff!).map(([campo, val]) => (
              <div
                key={campo}
                className="grid gap-[10px] items-start"
                style={{ gridTemplateColumns: "140px 1fr 1fr" }}
              >
                <span className="text-gp-white font-semibold">{campo}</span>
                <span className="text-gp-red font-mono break-all">
                  {JSON.stringify(val.antes)}
                </span>
                <span className="text-gp-green font-mono break-all">
                  {JSON.stringify(val.depois)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <JsonBox titulo="Dados antes" valor={log.dadosAntes} />
        <JsonBox titulo="Payload da requisição" valor={log.dadosDepois} />
      </div>
    </div>
  );
}

const GRID_LINHAS = "170px 110px 130px 1.6fr 1.2fr 90px 36px";

export default function Logs() {
  const [filtros, setFiltros] = useState<Filtros>({
    busca: "", modulo: "", acao: "", usuarioId: "",
    sucesso: "", dataInicio: "", dataFim: "",
  });
  const [paginas, setPaginas] = useState<Paginas>({ pagina: 1, tamanho: 50 });
  const [dados, setDados] = useState<RespostaLogs>({ total: 0, totalPaginas: 1, itens: [] });
  const [opcoesFiltro, setOpcoesFiltro] = useState<OpcoesFiltro>({ modulos: [], acoes: [], usuarios: [] });
  const [resumo, setResumo] = useState<ResumoLogs | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await api.listarLogs({ ...filtros, ...paginas }) as RespostaLogs;
      setDados(r);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [filtros, paginas]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  useEffect(() => {
    api.filtrosLogs().then((r) => setOpcoesFiltro(r as OpcoesFiltro)).catch(ignorarErro("logs"));
    api.resumoLogs().then((r) => setResumo(r as ResumoLogs)).catch(ignorarErro("logs"));
  }, []);

  function atualizarFiltro<K extends keyof Filtros>(chave: K, valor: Filtros[K]) {
    setFiltros((f) => ({ ...f, [chave]: valor }));
    setPaginas((p) => ({ ...p, pagina: 1 }));
    setExpandido(null);
  }

  function limparFiltros() {
    setFiltros({ busca: "", modulo: "", acao: "", usuarioId: "", sucesso: "", dataInicio: "", dataFim: "" });
    setPaginas({ pagina: 1, tamanho: 50 });
    setExpandido(null);
  }

  const inputCls = "bg-gp-surface border border-gp-border rounded-lg px-[11px] py-[9px] text-gp-text text-[13px] outline-none";
  const totalPaginas = Math.max(1, dados.totalPaginas || 1);

  return (
    <div>
      {/* Cabeçalho */}
      <div className="mb-4">
        <h2 className="text-gp-white m-0 text-[22px]">🛡 Logs do Sistema</h2>
        <div className="text-gp-muted text-[13px] mt-1">
          Auditoria completa de todas as ações realizadas pelos usuários (apenas administradores).
        </div>
      </div>

      {/* KPIs */}
      {resumo && (
        <div
          className="grid gap-3 mb-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
        >
          <Kpi label="Últimas 24h" valor={resumo.total24h} cor={C.accent} />
          <Kpi label="Últimos 7 dias" valor={resumo.total7d} cor={C.purple} />
          <Kpi label="Falhas em 24h" valor={resumo.falhas24h} cor={resumo.falhas24h > 0 ? C.red : C.muted} />
          <Kpi
            label="Módulo mais ativo (7d)"
            valor={resumo.porModulo[0]?.modulo || "—"}
            sub={resumo.porModulo[0]?.total ? `${resumo.porModulo[0].total} eventos` : ""}
            cor={C.green}
          />
        </div>
      )}

      {/* Toolbar */}
      <div
        className="grid gap-[10px] mb-[14px]"
        style={{ gridTemplateColumns: "1.5fr 1fr 1fr 1fr 0.8fr 0.9fr 0.9fr auto" }}
      >
        <input
          placeholder="Buscar em rota, mensagem, nome ou email..."
          value={filtros.busca}
          onChange={(e) => atualizarFiltro("busca", e.target.value)}
          className={inputCls}
        />
        <select value={filtros.modulo} onChange={(e) => atualizarFiltro("modulo", e.target.value)} className={`${inputCls} cursor-pointer`}>
          <option value="">Todos os módulos</option>
          {opcoesFiltro.modulos.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filtros.acao} onChange={(e) => atualizarFiltro("acao", e.target.value)} className={`${inputCls} cursor-pointer`}>
          <option value="">Todas as ações</option>
          {opcoesFiltro.acoes.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filtros.usuarioId} onChange={(e) => atualizarFiltro("usuarioId", e.target.value)} className={`${inputCls} cursor-pointer`}>
          <option value="">Todos os usuários</option>
          {opcoesFiltro.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
        <select value={filtros.sucesso} onChange={(e) => atualizarFiltro("sucesso", e.target.value)} className={`${inputCls} cursor-pointer`}>
          <option value="">Status</option>
          <option value="true">Sucesso</option>
          <option value="false">Falha</option>
        </select>
        <input type="date" value={filtros.dataInicio} onChange={(e) => atualizarFiltro("dataInicio", e.target.value)} className={inputCls} title="Data inicial" />
        <input type="date" value={filtros.dataFim} onChange={(e) => atualizarFiltro("dataFim", e.target.value)} className={inputCls} title="Data final" />
        <button
          onClick={limparFiltros}
          className="bg-gp-surface text-gp-muted border border-gp-border rounded-lg px-[14px] text-[13px] cursor-pointer whitespace-nowrap"
        >
          Limpar
        </button>
      </div>

      {erro && (
        <div
          className="mb-3 px-[14px] py-[10px] rounded-lg text-gp-red text-[13px]"
          style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}
        >
          {erro}
        </div>
      )}

      {/* Tabela */}
      <div className="bg-gp-card border border-gp-border rounded-xl overflow-hidden">
        <div
          className="grid px-4 py-3 bg-gp-surface border-b border-gp-border text-xs font-bold text-gp-muted uppercase tracking-[0.5px]"
          style={{ gridTemplateColumns: GRID_LINHAS }}
        >
          <div>Data/hora</div>
          <div>Ação</div>
          <div>Módulo</div>
          <div>Usuário</div>
          <div>Rota / Entidade</div>
          <div className="text-center">Status</div>
          <div></div>
        </div>

        {carregando && dados.itens.length === 0 ? (
          <div className="px-5 py-[30px] text-center text-gp-muted text-[13px]">
            Carregando...
          </div>
        ) : dados.itens.length === 0 ? (
          <div className="px-5 py-[30px] text-center text-gp-muted text-[13px]">
            Nenhum log encontrado com esses filtros.
          </div>
        ) : dados.itens.map((log) => {
          const cores = corAcao(log.acao);
          const aberto = expandido === log.id;
          return (
            <div key={log.id} className="border-b border-gp-border">
              <div
                onClick={() => setExpandido(aberto ? null : log.id)}
                className="grid items-center px-4 py-[11px] text-[12.5px] cursor-pointer transition-colors"
                style={{
                  gridTemplateColumns: GRID_LINHAS,
                  background: aberto ? C.surface + "88" : "transparent",
                }}
                onMouseEnter={(e) => { if (!aberto) e.currentTarget.style.background = C.surface + "44"; }}
                onMouseLeave={(e) => { if (!aberto) e.currentTarget.style.background = "transparent"; }}
              >
                <div className="text-gp-text tabular-nums">{formatarData(log.createdAt)}</div>
                <div>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-[2px] rounded text-[11px] font-bold"
                    style={{ background: cores.bg, color: cores.fg, border: `1px solid ${cores.fg}33` }}
                  >
                    {cores.icone} {log.acao}
                  </span>
                </div>
                <div className="text-gp-text text-[11.5px]">{log.modulo}</div>
                <div>
                  <div className="text-gp-white font-semibold">{log.usuarioNome || "—"}</div>
                  {log.usuarioEmail && (
                    <div className="text-gp-muted text-[10.5px]">{log.usuarioEmail}</div>
                  )}
                </div>
                <div className="text-gp-text overflow-hidden text-ellipsis whitespace-nowrap">
                  <span className="font-mono text-[11.5px]">
                    {log.metodo && <span className="text-gp-muted mr-[6px]">{log.metodo}</span>}
                    {log.rota || (log.entidadeId ? `id: ${log.entidadeId}` : "—")}
                  </span>
                </div>
                <div className="text-center">
                  <span
                    className="text-[11px] font-bold px-2 py-[2px] rounded"
                    style={{
                      background: log.sucesso ? C.green + "22" : C.red + "22",
                      color: log.sucesso ? C.green : C.red,
                      border: `1px solid ${(log.sucesso ? C.green : C.red)}33`,
                    }}
                  >
                    {log.sucesso ? "OK" : "FALHA"}
                  </span>
                </div>
                <div
                  className="text-right text-gp-muted text-sm transition-transform"
                  style={{ transform: aberto ? "rotate(90deg)" : "rotate(0)" }}
                >
                  ›
                </div>
              </div>
              {aberto && <DetalhesLog log={log} />}
            </div>
          );
        })}
      </div>

      {/* Paginação */}
      {dados.total > 0 && (
        <div className="flex items-center justify-between mt-[14px] text-[12.5px] text-gp-muted">
          <div>
            Mostrando {((paginas.pagina - 1) * paginas.tamanho) + 1}–
            {Math.min(paginas.pagina * paginas.tamanho, dados.total)} de {dados.total}
          </div>
          <div className="flex gap-[6px] items-center">
            <select
              value={paginas.tamanho}
              onChange={(e) => setPaginas({ pagina: 1, tamanho: Number(e.target.value) })}
              className={`${inputCls} px-2 py-[6px] text-xs`}
            >
              {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} / pág.</option>)}
            </select>
            <button
              disabled={paginas.pagina <= 1}
              onClick={() => setPaginas((p) => ({ ...p, pagina: p.pagina - 1 }))}
              style={btnPag(paginas.pagina <= 1)}
            >‹</button>
            <span className="text-gp-text px-2">
              {paginas.pagina} / {totalPaginas}
            </span>
            <button
              disabled={paginas.pagina >= totalPaginas}
              onClick={() => setPaginas((p) => ({ ...p, pagina: p.pagina + 1 }))}
              style={btnPag(paginas.pagina >= totalPaginas)}
            >›</button>
          </div>
        </div>
      )}
    </div>
  );
}

interface KpiProps {
  label: string;
  valor: number | string;
  sub?: string;
  cor?: string;
}

function Kpi({ label, valor, sub, cor }: KpiProps) {
  return (
    <div className="bg-gp-card border border-gp-border rounded-[10px] px-[14px] py-3">
      <div className="text-gp-muted text-[11px] font-bold uppercase tracking-[0.5px]">
        {label}
      </div>
      <div className="text-[22px] font-extrabold mt-1" style={{ color: cor || C.white }}>
        {valor}
      </div>
      {sub && <div className="text-gp-muted text-[11px] mt-[2px]">{sub}</div>}
    </div>
  );
}

function btnPag(desabilitado: boolean): CSSProperties {
  return {
    background: C.surface,
    color: desabilitado ? C.muted : C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    width: 28,
    height: 28,
    fontSize: 14,
    cursor: desabilitado ? "not-allowed" : "pointer",
    opacity: desabilitado ? 0.4 : 1,
  };
}
