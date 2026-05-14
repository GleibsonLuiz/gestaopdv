import { useCallback, useEffect, useState } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";

const CORES_ACAO = {
  CREATE:      { bg: "#22c55e22", fg: "#22c55e", icone: "+" },
  UPDATE:      { bg: "#3b82f622", fg: "#3b82f6", icone: "~" },
  DELETE:      { bg: "#ef444422", fg: "#ef4444", icone: "×" },
  LOGIN:       { bg: "#10b98122", fg: "#10b981", icone: "→" },
  LOGOUT:      { bg: "#64748b22", fg: "#94a3b8", icone: "←" },
  LOGIN_FALHO: { bg: "#f59e0b22", fg: "#f59e0b", icone: "!" },
  TROCA_SENHA: { bg: "#a855f722", fg: "#a855f7", icone: "🔑" },
  OUTRA:       { bg: "#64748b22", fg: "#94a3b8", icone: "•" },
};

function corAcao(acao) { return CORES_ACAO[acao] || CORES_ACAO.OUTRA; }

function formatarData(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function CampoKv({ label, valor }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
      <span style={{ color: C.muted, minWidth: 90 }}>{label}:</span>
      <span style={{ color: C.text, wordBreak: "break-all", flex: 1 }}>{valor || "—"}</span>
    </div>
  );
}

function JsonBox({ titulo, valor }) {
  if (!valor) return null;
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {titulo}
      </div>
      <pre style={{
        margin: 0, padding: 10, background: C.bg, border: `1px solid ${C.border}`,
        borderRadius: 8, color: C.text, fontSize: 11.5, lineHeight: 1.5,
        maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
        fontFamily: "Consolas, Monaco, monospace",
      }}>
        {JSON.stringify(valor, null, 2)}
      </pre>
    </div>
  );
}

function DetalhesLog({ log }) {
  const temDiff = log.diff && Object.keys(log.diff).length > 0;
  return (
    <div style={{
      padding: "14px 18px", background: C.bg + "88", borderTop: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <CampoKv label="Rota" valor={log.rota} />
          <CampoKv label="Método" valor={log.metodo} />
          <CampoKv label="Status" valor={log.statusCode != null ? log.statusCode : "—"} />
          <CampoKv label="Duração" valor={log.duracaoMs != null ? `${log.duracaoMs} ms` : "—"} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <CampoKv label="Entidade ID" valor={log.entidadeId} />
          <CampoKv label="IP" valor={log.ip} />
          <CampoKv label="User Agent" valor={log.userAgent} />
          {log.mensagem && <CampoKv label="Mensagem" valor={log.mensagem} />}
        </div>
      </div>

      {temDiff && (
        <div>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Campos alterados
          </div>
          <div style={{
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: 10, display: "flex", flexDirection: "column", gap: 6, fontSize: 12,
          }}>
            {Object.entries(log.diff).map(([campo, val]) => (
              <div key={campo} style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr", gap: 10, alignItems: "start" }}>
                <span style={{ color: C.white, fontWeight: 600 }}>{campo}</span>
                <span style={{ color: C.red, fontFamily: "Consolas, monospace", wordBreak: "break-all" }}>
                  {JSON.stringify(val.antes)}
                </span>
                <span style={{ color: C.green, fontFamily: "Consolas, monospace", wordBreak: "break-all" }}>
                  {JSON.stringify(val.depois)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <JsonBox titulo="Dados antes" valor={log.dadosAntes} />
        <JsonBox titulo="Payload da requisição" valor={log.dadosDepois} />
      </div>
    </div>
  );
}

export default function Logs() {
  const [filtros, setFiltros] = useState({
    busca: "", modulo: "", acao: "", usuarioId: "",
    sucesso: "", dataInicio: "", dataFim: "",
  });
  const [paginas, setPaginas] = useState({ pagina: 1, tamanho: 50 });
  const [dados, setDados] = useState({ total: 0, totalPaginas: 1, itens: [] });
  const [opcoesFiltro, setOpcoesFiltro] = useState({ modulos: [], acoes: [], usuarios: [] });
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [expandido, setExpandido] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await api.listarLogs({ ...filtros, ...paginas });
      setDados(r);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [filtros, paginas]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  useEffect(() => {
    api.filtrosLogs().then(setOpcoesFiltro).catch(() => {});
    api.resumoLogs().then(setResumo).catch(() => {});
  }, []);

  function atualizarFiltro(chave, valor) {
    setFiltros(f => ({ ...f, [chave]: valor }));
    setPaginas(p => ({ ...p, pagina: 1 }));
    setExpandido(null);
  }

  function limparFiltros() {
    setFiltros({ busca: "", modulo: "", acao: "", usuarioId: "", sucesso: "", dataInicio: "", dataFim: "" });
    setPaginas({ pagina: 1, tamanho: 50 });
    setExpandido(null);
  }

  const inputStyle = {
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
    padding: "9px 11px", color: C.text, fontSize: 13, outline: "none",
  };

  const totalPaginas = Math.max(1, dados.totalPaginas || 1);

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ color: C.white, margin: 0, fontSize: 22 }}>🛡 Logs do Sistema</h2>
        <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
          Auditoria completa de todas as ações realizadas pelos usuários (apenas administradores).
        </div>
      </div>

      {/* KPIs */}
      {resumo && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
          <Kpi label="Últimas 24h" valor={resumo.total24h} cor={C.accent} />
          <Kpi label="Últimos 7 dias" valor={resumo.total7d} cor={C.purple} />
          <Kpi label="Falhas em 24h" valor={resumo.falhas24h} cor={resumo.falhas24h > 0 ? C.red : C.muted} />
          <Kpi label="Módulo mais ativo (7d)" valor={resumo.porModulo[0]?.modulo || "—"} sub={resumo.porModulo[0]?.total ? `${resumo.porModulo[0].total} eventos` : ""} cor={C.green} />
        </div>
      )}

      {/* Toolbar */}
      <div style={{
        display: "grid", gap: 10, marginBottom: 14,
        gridTemplateColumns: "1.5fr 1fr 1fr 1fr 0.8fr 0.9fr 0.9fr auto",
      }}>
        <input
          placeholder="Buscar em rota, mensagem, nome ou email..."
          value={filtros.busca}
          onChange={e => atualizarFiltro("busca", e.target.value)}
          style={inputStyle}
        />
        <select value={filtros.modulo} onChange={e => atualizarFiltro("modulo", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
          <option value="">Todos os módulos</option>
          {opcoesFiltro.modulos.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filtros.acao} onChange={e => atualizarFiltro("acao", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
          <option value="">Todas as ações</option>
          {opcoesFiltro.acoes.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filtros.usuarioId} onChange={e => atualizarFiltro("usuarioId", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
          <option value="">Todos os usuários</option>
          {opcoesFiltro.usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
        <select value={filtros.sucesso} onChange={e => atualizarFiltro("sucesso", e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
          <option value="">Status</option>
          <option value="true">Sucesso</option>
          <option value="false">Falha</option>
        </select>
        <input type="date" value={filtros.dataInicio} onChange={e => atualizarFiltro("dataInicio", e.target.value)} style={inputStyle} title="Data inicial" />
        <input type="date" value={filtros.dataFim} onChange={e => atualizarFiltro("dataFim", e.target.value)} style={inputStyle} title="Data final" />
        <button onClick={limparFiltros} style={{
          background: C.surface, color: C.muted, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "0 14px", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
        }}>Limpar</button>
      </div>

      {erro && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 8,
          background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
        }}>{erro}</div>
      )}

      {/* Tabela */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "170px 110px 130px 1.6fr 1.2fr 90px 36px",
          padding: "12px 16px", background: C.surface,
          borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700,
          color: C.muted, textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          <div>Data/hora</div>
          <div>Ação</div>
          <div>Módulo</div>
          <div>Usuário</div>
          <div>Rota / Entidade</div>
          <div style={{ textAlign: "center" }}>Status</div>
          <div></div>
        </div>

        {carregando && dados.itens.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>
            Carregando...
          </div>
        ) : dados.itens.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>
            Nenhum log encontrado com esses filtros.
          </div>
        ) : dados.itens.map(log => {
          const cores = corAcao(log.acao);
          const aberto = expandido === log.id;
          return (
            <div key={log.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <div
                onClick={() => setExpandido(aberto ? null : log.id)}
                style={{
                  display: "grid", gridTemplateColumns: "170px 110px 130px 1.6fr 1.2fr 90px 36px",
                  padding: "11px 16px", alignItems: "center", fontSize: 12.5,
                  cursor: "pointer",
                  background: aberto ? C.surface + "88" : "transparent",
                  transition: "background .15s",
                }}
                onMouseEnter={e => { if (!aberto) e.currentTarget.style.background = C.surface + "44"; }}
                onMouseLeave={e => { if (!aberto) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ color: C.text, fontVariantNumeric: "tabular-nums" }}>{formatarData(log.createdAt)}</div>
                <div>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    background: cores.bg, color: cores.fg,
                    padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                    border: `1px solid ${cores.fg}33`,
                  }}>{cores.icone} {log.acao}</span>
                </div>
                <div style={{ color: C.text, fontSize: 11.5 }}>{log.modulo}</div>
                <div>
                  <div style={{ color: C.white, fontWeight: 600 }}>{log.usuarioNome || "—"}</div>
                  {log.usuarioEmail && (
                    <div style={{ color: C.muted, fontSize: 10.5 }}>{log.usuarioEmail}</div>
                  )}
                </div>
                <div style={{ color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ fontFamily: "Consolas, monospace", fontSize: 11.5 }}>
                    {log.metodo && <span style={{ color: C.muted, marginRight: 6 }}>{log.metodo}</span>}
                    {log.rota || (log.entidadeId ? `id: ${log.entidadeId}` : "—")}
                  </span>
                </div>
                <div style={{ textAlign: "center" }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                    background: log.sucesso ? C.green + "22" : C.red + "22",
                    color: log.sucesso ? C.green : C.red,
                    border: `1px solid ${(log.sucesso ? C.green : C.red)}33`,
                  }}>{log.sucesso ? "OK" : "FALHA"}</span>
                </div>
                <div style={{ textAlign: "right", color: C.muted, fontSize: 14, transition: "transform .15s",
                  transform: aberto ? "rotate(90deg)" : "rotate(0)" }}>›</div>
              </div>
              {aberto && <DetalhesLog log={log} />}
            </div>
          );
        })}
      </div>

      {/* Paginação */}
      {dados.total > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: 14, fontSize: 12.5, color: C.muted,
        }}>
          <div>
            Mostrando {((paginas.pagina - 1) * paginas.tamanho) + 1}–
            {Math.min(paginas.pagina * paginas.tamanho, dados.total)} de {dados.total}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select
              value={paginas.tamanho}
              onChange={e => setPaginas(p => ({ pagina: 1, tamanho: Number(e.target.value) }))}
              style={{ ...inputStyle, padding: "6px 8px", fontSize: 12 }}
            >
              {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n} / pág.</option>)}
            </select>
            <button
              disabled={paginas.pagina <= 1}
              onClick={() => setPaginas(p => ({ ...p, pagina: p.pagina - 1 }))}
              style={btnPag(paginas.pagina <= 1)}
            >‹</button>
            <span style={{ color: C.text, padding: "0 8px" }}>
              {paginas.pagina} / {totalPaginas}
            </span>
            <button
              disabled={paginas.pagina >= totalPaginas}
              onClick={() => setPaginas(p => ({ ...p, pagina: p.pagina + 1 }))}
              style={btnPag(paginas.pagina >= totalPaginas)}
            >›</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, valor, sub, cor }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: "12px 14px",
    }}>
      <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ color: cor || C.white, fontSize: 22, fontWeight: 800, marginTop: 4 }}>
        {valor}
      </div>
      {sub && <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function btnPag(desabilitado) {
  return {
    background: C.surface, color: desabilitado ? C.muted : C.text,
    border: `1px solid ${C.border}`, borderRadius: 6,
    width: 28, height: 28, fontSize: 14, cursor: desabilitado ? "not-allowed" : "pointer",
    opacity: desabilitado ? 0.4 : 1,
  };
}
