// AdminMasterApp.jsx — UI exclusiva do desenvolvedor do sistema.
//
// Carregada via main.jsx quando window.location.pathname.startsWith("/admin-master").
// Fluxo:
//   1. Se nao logado: mostra Login dedicado
//   2. Apos login, valida que o user e super-admin (token claim sa=true)
//      - Se nao for: mostra mensagem de acesso negado e logout
//      - Se for: mostra dashboard de empresas + criar nova
//   3. Persiste sessao em localStorage (mesmas chaves do app normal — uso
//      controlado pelo backend via claim sa)

import { useEffect, useState } from "react";
import { C } from "./lib/theme.js";
import { api, getToken, getUser, setSession, clearSession } from "./lib/api.js";

const fmtBRL = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v) => Number(v || 0).toLocaleString("pt-BR");
const fmtData = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

function mascararCnpj(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export default function AdminMasterApp() {
  const [user, setUser] = useState(getUser());
  const [carregando, setCarregando] = useState(!!getToken());

  // Valida sessao existente no mount.
  useEffect(() => {
    if (!getToken()) { setCarregando(false); return; }
    api.me()
      .then(u => setUser(u))
      .catch(() => { clearSession(); setUser(null); })
      .finally(() => setCarregando(false));
  }, []);

  function sair() {
    api.logout?.().finally?.(() => {
      clearSession();
      setUser(null);
    });
    clearSession();
    setUser(null);
  }

  if (carregando) {
    return <Tela><div style={{ color: C.muted, textAlign: "center", padding: 60 }}>Carregando...</div></Tela>;
  }

  if (!user) return <Login onSuccess={setUser} />;

  if (!user.superAdmin) {
    return (
      <Tela>
        <div style={{
          background: C.red + "11", border: `1px solid ${C.red}55`,
          borderRadius: 12, padding: 30, textAlign: "center",
          color: C.text, maxWidth: 480, margin: "60px auto",
        }}>
          <div style={{ fontSize: 42 }}>🛡️</div>
          <div style={{ color: C.red, fontWeight: 800, fontSize: 18, marginTop: 10 }}>
            Acesso restrito
          </div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
            Esta área é exclusiva do desenvolvedor do sistema. Sua conta ({user.email}) não tem essa permissão.
          </div>
          <button onClick={sair} style={btnSecundario}>Voltar ao login</button>
          <div style={{ marginTop: 12 }}>
            <a href="/" style={{ color: C.accent, fontSize: 12 }}>Ir para o sistema normal →</a>
          </div>
        </div>
      </Tela>
    );
  }

  return <Painel user={user} onSair={sair} />;
}

// ============ LOGIN (do super-admin) ============
function Login({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setCarregando(true); setErro("");
    try {
      const { token, user, empresa } = await api.login(email, senha);
      setSession(token, user, empresa);
      onSuccess(user);
    } catch (err) {
      setErro(err.message || "Falha no login");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Tela>
      <div style={{
        maxWidth: 380, margin: "80px auto",
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 14, padding: 30,
      }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 38 }}>🛡️</div>
          <h1 style={{
            color: C.white, fontSize: 22, fontWeight: 800,
            margin: "10px 0 4px",
          }}>Admin Master</h1>
          <div style={{ color: C.muted, fontSize: 12 }}>
            Área exclusiva do desenvolvedor do sistema
          </div>
        </div>

        <form onSubmit={submit}>
          <label style={labelStyle}>Email</label>
          <input
            type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            required autoFocus style={inputStyle}
          />
          <label style={{ ...labelStyle, marginTop: 12 }}>Senha</label>
          <input
            type="password" value={senha}
            onChange={e => setSenha(e.target.value)}
            required style={inputStyle}
          />
          {erro && (
            <div style={{
              marginTop: 12, padding: "8px 12px", borderRadius: 8,
              background: C.red + "22", border: `1px solid ${C.red}55`,
              color: C.red, fontSize: 12,
            }}>{erro}</div>
          )}
          <button type="submit" disabled={carregando} style={{
            marginTop: 18, width: "100%",
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, border: "none", borderRadius: 8,
            padding: "11px 20px", fontWeight: 800, fontSize: 13,
            cursor: carregando ? "default" : "pointer",
            opacity: carregando ? 0.6 : 1,
          }}>{carregando ? "Entrando..." : "Entrar →"}</button>
        </form>

        <div style={{
          marginTop: 16, textAlign: "center",
          color: C.muted, fontSize: 11,
        }}>
          <a href="/" style={{ color: C.muted, textDecoration: "none" }}>
            ← Voltar ao sistema normal
          </a>
        </div>
      </div>
    </Tela>
  );
}

// ============ PAINEL PRINCIPAL ============
const TABS = [
  { id: "empresas", label: "🏢 Empresas", cor: C.accent },
  { id: "users", label: "👥 Usuários", cor: C.purple },
  { id: "notificacoes", label: "📢 Notificações", cor: C.red },
  { id: "metricas", label: "📈 Métricas", cor: C.green },
  { id: "logs", label: "📜 Logs", cor: C.yellow },
];

// Cores hex literais (nao var CSS) porque sao usadas em concatenacao com "33"
// pra alpha — `var(--x)33` seria CSS invalido e o botao nao recebia fundo.
const PLANOS_INFO = {
  TRIAL: { cor: "#f59e0b", icone: "🎫", label: "Trial" },
  FREE: { cor: "#64748b", icone: "🆓", label: "Free" },
  STARTER: { cor: "#4f8ef7", icone: "🚀", label: "Starter" },
  PRO: { cor: "#7c3aed", icone: "💎", label: "Pro" },
  ENTERPRISE: { cor: "#22c55e", icone: "🏆", label: "Enterprise" },
};

// Espelho da matriz em backend/src/lib/planoLimites.js — usado pelos chips de
// alerta de saude (≥90% do limite). Se mudar backend, atualizar aqui tambem.
// `vendasMes` omitido porque depende de query do mes corrente que nao vem
// na listagem (a listagem traz so o total absoluto).
const LIMITES_PLANO_UI = {
  TRIAL:      { clientes: 50,   produtos: 100,   usuarios: 3 },
  FREE:       { clientes: 30,   produtos: 50,    usuarios: 1 },
  STARTER:    { clientes: 500,  produtos: 1000,  usuarios: 5 },
  PRO:        { clientes: 5000, produtos: 10000, usuarios: 20 },
  ENTERPRISE: { clientes: null, produtos: null,  usuarios: null },
};

// Avalia se uma empresa esta a >=90% de algum recurso. Retorna { recurso, pct }
// do recurso mais critico, ou null se nenhum.
function recursoMaisCritico(empresa) {
  const limites = LIMITES_PLANO_UI[empresa.plano] || LIMITES_PLANO_UI.TRIAL;
  const uso = {
    clientes: empresa.estatisticas?.clientes ?? 0,
    produtos: empresa.estatisticas?.produtos ?? 0,
    usuarios: empresa.estatisticas?.usuarios ?? 0,
  };
  let pior = null;
  for (const r of ["clientes", "produtos", "usuarios"]) {
    const lim = limites[r];
    if (!lim) continue;
    const pct = uso[r] / lim;
    if (pct >= 0.9 && (!pior || pct > pior.pct)) pior = { recurso: r, pct, atual: uso[r], limite: lim };
  }
  return pior;
}

function Painel({ user, onSair }) {
  const [tab, setTab] = useState("empresas");
  const [estatisticas, setEstatisticas] = useState(null);

  async function carregarKpis() {
    try {
      const est = await api.adminMasterEstatisticas();
      setEstatisticas(est);
    } catch { /* silencioso */ }
  }
  useEffect(() => { carregarKpis(); }, []);

  return (
    <Tela>
      {/* Header */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 16, marginBottom: 14,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🛡️</span>
          <div>
            <div style={{ color: C.white, fontWeight: 800, fontSize: 18, lineHeight: 1.1 }}>
              Admin Master — GestãoPRO
            </div>
            <div style={{ color: C.muted, fontSize: 11 }}>
              Logado como <strong>{user.nome}</strong> ({user.email})
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/" style={{ ...btnSecundario, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            Sistema normal →
          </a>
          <button onClick={onSair} style={btnSecundario}>Sair</button>
        </div>
      </div>

      {/* KPIs globais */}
      {estatisticas && (
        <div style={{
          display: "grid", gap: 8, marginBottom: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        }}>
          {[
            { rotulo: "Empresas", valor: fmtNum(estatisticas.totalEmpresas), cor: C.accent, hint: `${estatisticas.empresasAtivas} ativas` },
            { rotulo: "Usuários", valor: fmtNum(estatisticas.totalUsers), cor: C.purple, hint: `${estatisticas.superAdmins} super-admin` },
            { rotulo: "Clientes", valor: fmtNum(estatisticas.totalClientes), cor: C.green },
            { rotulo: "Produtos", valor: fmtNum(estatisticas.totalProdutos), cor: C.yellow },
            { rotulo: "Vendas", valor: fmtNum(estatisticas.totalVendas), cor: C.accent },
            { rotulo: "Faturamento", valor: fmtBRL(estatisticas.faturamentoGeral), cor: C.green },
          ].map((k, i) => (
            <div key={i} style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "10px 12px", position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: k.cor }} />
              <div style={{ color: C.muted, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {k.rotulo}
              </div>
              <div style={{ color: k.cor, fontSize: 18, fontWeight: 800, marginTop: 2 }}>{k.valor}</div>
              {k.hint && <div style={{ color: C.muted, fontSize: 9, marginTop: 1 }}>{k.hint}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 4, padding: 4, marginBottom: 14,
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 10, width: "fit-content", flexWrap: "wrap",
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 14px", borderRadius: 8, border: "none",
            background: tab === t.id ? t.cor + "22" : "transparent",
            color: tab === t.id ? t.cor : C.muted,
            fontWeight: tab === t.id ? 700 : 600, fontSize: 12, cursor: "pointer",
          }}>{t.label}</button>
        ))}
      </div>

      {tab === "empresas" && <AbaEmpresas onMudou={carregarKpis} />}
      {tab === "users" && <AbaUsers />}
      {tab === "notificacoes" && <AbaNotificacoes />}
      {tab === "metricas" && <AbaMetricas />}
      {tab === "logs" && <AbaLogs />}
    </Tela>
  );
}

// ============ ABA: EMPRESAS ============
function AbaEmpresas({ onMudou }) {
  const [empresas, setEmpresas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [modalCriar, setModalCriar] = useState(false);
  const [modalSuspender, setModalSuspender] = useState(null); // empresa
  const [modalPlano, setModalPlano] = useState(null); // empresa
  const [modalDetalhes, setModalDetalhes] = useState(null); // empresa (com _saude)
  const [resetando, setResetando] = useState(null); // id
  const [busca, setBusca] = useState("");
  const [filtroPlano, setFiltroPlano] = useState("TODOS");
  const [filtroStatus, setFiltroStatus] = useState("TODOS");
  const [filtroAlerta, setFiltroAlerta] = useState(null); // expiradas|expirando|suspensas|limite
  const [ordem, setOrdem] = useState({ campo: "criadaEm", dir: "desc" });

  async function carregar() {
    setCarregando(true); setErro("");
    try {
      const lista = await api.adminMasterListarEmpresas();
      setEmpresas(lista.empresas || []);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); }, []);

  async function ativar(empresa) {
    if (!confirm(`Reativar "${empresa.nome}"?`)) return;
    try {
      await api.adminMasterAlterarStatus(empresa.id, true);
      await carregar();
      onMudou?.();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  }

  async function resetar(empresa) {
    if (!confirm(`⚠️  RESET TOTAL DE "${empresa.nome}"?\nIsso apaga TODOS os dados operacionais e de CRM da empresa.\nFuncionários e configurações são preservados.\n\nIRREVERSÍVEL.`)) return;
    setResetando(empresa.id);
    try {
      await api.adminMasterResetarEmpresa(empresa.id);
      await carregar();
      onMudou?.();
      alert(`Dados de "${empresa.nome}" zerados.`);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      setResetando(null);
    }
  }

  async function impersonar(empresa) {
    if (!confirm(`Entrar como admin de "${empresa.nome}"?\nVocê vai ser redirecionado para o sistema dela. Toda ação é auditada.`)) return;
    try {
      // Pega o primeiro admin (role=ADMIN) dessa empresa
      const lista = await api.adminMasterListarUsers(empresa.id);
      const admin = (lista.users || []).find(u => u.role === "ADMIN" && u.ativo);
      if (!admin) {
        return alert("Empresa não tem admin ativo.");
      }
      const resp = await api.adminMasterImpersonate(admin.id);
      // Sobrescreve sessao com token impersonado e leva pro sistema principal
      setSession(resp.token, resp.user, resp.empresa);
      window.location.href = "/";
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  }

  // Pre-calcula sinais de saude por empresa (1 pass) — reusado nos chips de
  // alerta e no filtroAlerta. diasParaExpirar=null = plano sem expiracao.
  const empresasComSaude = empresas.map(e => {
    const dias = e.expiraEm
      ? Math.ceil((new Date(e.expiraEm).getTime() - Date.now()) / 86400000)
      : null;
    const critico = recursoMaisCritico(e);
    return {
      ...e,
      _saude: {
        diasParaExpirar: dias,
        expirou: dias !== null && dias < 0,
        expirando: dias !== null && dias >= 0 && dias <= 7,
        critico,
      },
    };
  });

  const alertas = {
    expiradas: empresasComSaude.filter(e => e.ativo && e._saude.expirou),
    expirando: empresasComSaude.filter(e => e.ativo && e._saude.expirando),
    suspensas: empresasComSaude.filter(e => !e.ativo),
    limite:    empresasComSaude.filter(e => e.ativo && e._saude.critico),
  };

  // Filtro + ordenacao client-side (escala bem ate ~1000 empresas; acima disso
  // mover pra query do backend com paginacao).
  const empresasFiltradas = (() => {
    const buscaNorm = busca.trim().toLowerCase();
    let lista = empresasComSaude.filter(e => {
      if (filtroPlano !== "TODOS" && e.plano !== filtroPlano) return false;
      if (filtroStatus === "ATIVA" && !e.ativo) return false;
      if (filtroStatus === "SUSPENSA" && e.ativo) return false;
      if (filtroAlerta === "expiradas" && !(e.ativo && e._saude.expirou)) return false;
      if (filtroAlerta === "expirando" && !(e.ativo && e._saude.expirando)) return false;
      if (filtroAlerta === "suspensas" && e.ativo) return false;
      if (filtroAlerta === "limite" && !(e.ativo && e._saude.critico)) return false;
      if (buscaNorm) {
        const nomeOk = e.nome?.toLowerCase().includes(buscaNorm);
        const cnpjOk = (e.cnpj || "").toLowerCase().includes(buscaNorm.replace(/\D/g, ""));
        if (!nomeOk && !cnpjOk) return false;
      }
      return true;
    });
    const dir = ordem.dir === "asc" ? 1 : -1;
    lista = [...lista].sort((a, b) => {
      let va, vb;
      switch (ordem.campo) {
        case "nome": va = a.nome || ""; vb = b.nome || ""; break;
        case "users": va = a.estatisticas.usuarios; vb = b.estatisticas.usuarios; break;
        case "vendas": va = a.estatisticas.vendas; vb = b.estatisticas.vendas; break;
        case "faturamento": va = a.estatisticas.faturamentoTotal; vb = b.estatisticas.faturamentoTotal; break;
        case "plano": va = a.plano || ""; vb = b.plano || ""; break;
        case "criadaEm":
        default: va = new Date(a.criadaEm).getTime(); vb = new Date(b.criadaEm).getTime();
      }
      if (typeof va === "string") return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });
    return lista;
  })();

  function alternarOrdem(campo) {
    setOrdem(o => o.campo === campo
      ? { campo, dir: o.dir === "asc" ? "desc" : "asc" }
      : { campo, dir: campo === "nome" || campo === "plano" ? "asc" : "desc" });
  }

  function setaOrdem(campo) {
    if (ordem.campo !== campo) return null;
    return ordem.dir === "asc" ? " ▲" : " ▼";
  }

  const colunas = [
    { id: "nome", label: "Empresa", align: "left", sort: true },
    { id: "plano", label: "Plano", align: "left", sort: true },
    { id: "status", label: "Status", align: "left", sort: false },
    { id: "users", label: "Users", align: "right", sort: true },
    { id: "vendas", label: "Vendas", align: "right", sort: true },
    { id: "faturamento", label: "Faturamento", align: "right", sort: true },
    { id: "criadaEm", label: "Criada", align: "left", sort: true },
    { id: "acoes", label: "Ações", align: "left", sort: false },
  ];

  const filtrosAtivos = busca || filtroPlano !== "TODOS" || filtroStatus !== "TODOS" || filtroAlerta;

  function limparFiltros() {
    setBusca(""); setFiltroPlano("TODOS"); setFiltroStatus("TODOS"); setFiltroAlerta(null);
  }

  function clicarChip(tipo) {
    setFiltroAlerta(prev => prev === tipo ? null : tipo);
  }

  const CHIPS_ALERTA = [
    { tipo: "expiradas", cor: C.red,    icone: "🔴", label: "expiradas",          lista: alertas.expiradas },
    { tipo: "expirando", cor: C.yellow, icone: "🟡", label: "expirando em 7d",    lista: alertas.expirando },
    { tipo: "suspensas", cor: C.red,    icone: "⏸",  label: "suspensas",          lista: alertas.suspensas },
    { tipo: "limite",    cor: "#fb923c",icone: "🟠", label: "≥90% de algum limite", lista: alertas.limite },
  ].filter(c => c.lista.length > 0);

  return (
    <>
      {erro && (
        <div style={{
          background: C.red + "22", border: `1px solid ${C.red}55`,
          color: C.red, borderRadius: 10, padding: "10px 14px", marginBottom: 14,
        }}>{erro}</div>
      )}

      {CHIPS_ALERTA.length > 0 && (
        <div style={{
          display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap",
          alignItems: "center",
        }}>
          <span style={{ color: C.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
            ⚠ Atenção:
          </span>
          {CHIPS_ALERTA.map(c => {
            const ativo = filtroAlerta === c.tipo;
            return (
              <button
                key={c.tipo}
                type="button"
                onClick={() => clicarChip(c.tipo)}
                title={ativo ? "Clique pra remover filtro" : `Mostrar só ${c.label}`}
                style={{
                  background: ativo ? c.cor + "44" : c.cor + "1f",
                  border: `1px solid ${c.cor}${ativo ? "" : "55"}`,
                  color: c.cor,
                  borderRadius: 999, padding: "5px 12px",
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}
              >
                <span>{c.icone}</span>
                <span style={{ fontSize: 13, fontWeight: 800 }}>{c.lista.length}</span>
                <span>{c.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 12, overflow: "hidden",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
          gap: 8, flexWrap: "wrap",
        }}>
          <div style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>
            Empresas cadastradas ({empresasFiltradas.length}
            {filtrosAtivos && empresasFiltradas.length !== empresas.length && ` de ${empresas.length}`})
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={carregar} disabled={carregando} style={btnSecundario}>
              🔄 {carregando ? "..." : "Atualizar"}
            </button>
            <button onClick={() => setModalCriar(true)} style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              color: C.white, border: "none", borderRadius: 8,
              padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer",
            }}>+ Nova empresa</button>
          </div>
        </div>

        <div style={{
          display: "flex", gap: 8, padding: "10px 16px",
          borderBottom: `1px solid ${C.border}`, background: C.surface + "55",
          flexWrap: "wrap", alignItems: "center",
        }}>
          <input
            type="text"
            placeholder="🔍 Buscar por nome ou CNPJ..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ ...inputStyle, flex: "1 1 220px", minWidth: 180, padding: "7px 12px", fontSize: 12 }}
          />
          <select value={filtroPlano} onChange={e => setFiltroPlano(e.target.value)}
            style={{ ...inputStyle, width: "auto", padding: "7px 28px 7px 12px", fontSize: 12, cursor: "pointer" }}>
            <option value="TODOS">Todos os planos</option>
            {Object.entries(PLANOS_INFO).map(([k, info]) => (
              <option key={k} value={k}>{info.icone} {info.label}</option>
            ))}
          </select>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
            style={{ ...inputStyle, width: "auto", padding: "7px 28px 7px 12px", fontSize: 12, cursor: "pointer" }}>
            <option value="TODOS">Todos status</option>
            <option value="ATIVA">● Ativa</option>
            <option value="SUSPENSA">● Suspensa</option>
          </select>
          {filtrosAtivos && (
            <button
              type="button"
              onClick={limparFiltros}
              style={{
                background: "transparent", border: `1px solid ${C.border}`,
                color: C.muted, borderRadius: 8, padding: "6px 10px",
                fontSize: 11, cursor: "pointer",
              }}
            >✕ Limpar</button>
          )}
        </div>

        {empresasFiltradas.length === 0 && !carregando ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>
            {filtrosAtivos
              ? "Nenhuma empresa corresponde aos filtros."
              : "Nenhuma empresa cadastrada."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.surface }}>
                  {colunas.map(col => (
                    <th key={col.id}
                      onClick={col.sort ? () => alternarOrdem(col.id) : undefined}
                      style={{
                        padding: "9px 10px", textAlign: col.align,
                        color: ordem.campo === col.id ? C.text : C.muted,
                        fontSize: 10, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: 0.5,
                        borderBottom: `1px solid ${C.border}`,
                        cursor: col.sort ? "pointer" : "default",
                        userSelect: "none",
                      }}>{col.label}{setaOrdem(col.id)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {empresasFiltradas.map(e => {
                  const planoInfo = PLANOS_INFO[e.plano] || PLANOS_INFO.TRIAL;
                  const { diasParaExpirar, expirou, expirando } = e._saude;
                  return (
                    <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}55` }}>
                      <td style={{ padding: "9px 10px", color: C.text, fontWeight: 600 }}>
                        <button
                          type="button"
                          onClick={() => setModalDetalhes(e)}
                          title="Ver detalhes"
                          style={{
                            background: "transparent", border: "none", padding: 0,
                            color: C.text, fontWeight: 600, fontSize: 12,
                            cursor: "pointer", textAlign: "left",
                          }}
                        >{e.nome}</button>
                        <div style={{ color: C.muted, fontSize: 10, fontFamily: "monospace", marginTop: 1 }}>
                          {e.cnpj ? mascararCnpj(e.cnpj) : "Sem CNPJ"}
                        </div>
                      </td>
                      <td style={{ padding: "9px 10px" }}>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 10,
                          fontSize: 10, fontWeight: 700,
                          background: planoInfo.cor + "33",
                          color: planoInfo.cor,
                        }}>{planoInfo.icone} {planoInfo.label}</span>
                        {diasParaExpirar !== null && (
                          <div style={{
                            fontSize: 10, marginTop: 2,
                            color: expirou ? C.red : (expirando ? C.yellow : C.muted),
                            fontWeight: expirou || expirando ? 700 : 500,
                          }}>
                            {expirou ? `Expirou ${-diasParaExpirar}d atrás` : `${diasParaExpirar}d restantes`}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "9px 10px" }}>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 10,
                          fontSize: 10, fontWeight: 700,
                          background: e.ativo ? C.green + "33" : C.red + "33",
                          color: e.ativo ? C.green : C.red,
                        }}>{e.ativo ? "● ATIVA" : "● SUSPENSA"}</span>
                      </td>
                      <td style={{ padding: "9px 10px", textAlign: "right", color: C.text }}>{fmtNum(e.estatisticas.usuarios)}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", color: C.text }}>{fmtNum(e.estatisticas.vendas)}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", color: C.green, fontWeight: 600 }}>
                        {fmtBRL(e.estatisticas.faturamentoTotal)}
                      </td>
                      <td style={{ padding: "9px 10px", color: C.muted }}>{fmtData(e.criadaEm)}</td>
                      <td style={{ padding: "9px 10px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <button onClick={() => setModalDetalhes(e)} title="Ver detalhes" style={btnAcao(C.text)}>👁</button>
                          <button onClick={() => impersonar(e)} title="Entrar como admin" style={btnAcao(C.accent)}>👤</button>
                          <button onClick={() => setModalPlano(e)} title="Alterar plano" style={btnAcao(planoInfo.cor)}>🎫</button>
                          <a href={api.adminMasterExportEmpresaUrl(e.id) + "?t=" + Date.now()}
                            title="Baixar JSON com todos os dados"
                            style={{ ...btnAcao(C.purple), textDecoration: "none", display: "inline-flex" }}>📥</a>
                          <button onClick={() => resetar(e)} disabled={resetando === e.id} title="Reset total" style={btnAcao(C.yellow)}>
                            {resetando === e.id ? "..." : "🗑"}
                          </button>
                          {e.ativo ? (
                            <button onClick={() => setModalSuspender(e)} title="Suspender" style={btnAcao(C.red)}>⏸</button>
                          ) : (
                            <button onClick={() => ativar(e)} title="Reativar" style={btnAcao(C.green)}>▶</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalCriar && (
        <ModalCriarEmpresa
          onCancelar={() => setModalCriar(false)}
          onCriada={() => { setModalCriar(false); carregar(); onMudou?.(); }}
        />
      )}
      {modalSuspender && (
        <ModalSuspender
          empresa={modalSuspender}
          onCancelar={() => setModalSuspender(null)}
          onSuspensa={() => { setModalSuspender(null); carregar(); onMudou?.(); }}
        />
      )}
      {modalPlano && (
        <ModalPlano
          empresa={modalPlano}
          onCancelar={() => setModalPlano(null)}
          onSalva={() => { setModalPlano(null); carregar(); onMudou?.(); }}
        />
      )}
      {modalDetalhes && (
        <ModalDetalhesEmpresa
          empresa={modalDetalhes}
          onCancelar={() => setModalDetalhes(null)}
          onAlterarPlano={() => { const e = modalDetalhes; setModalDetalhes(null); setModalPlano(e); }}
          onSuspender={() => { const e = modalDetalhes; setModalDetalhes(null); setModalSuspender(e); }}
          onReativar={async () => { const e = modalDetalhes; setModalDetalhes(null); await ativar(e); }}
          onImpersonar={() => { const e = modalDetalhes; setModalDetalhes(null); impersonar(e); }}
        />
      )}
    </>
  );
}

// ============ ABA: USERS ============
function AbaUsers() {
  const [users, setUsers] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true); setErro("");
    try {
      const r = await api.adminMasterListarUsers();
      setUsers(r.users || []);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); }, []);

  async function toggleSuper(u) {
    const novo = !u.superAdmin;
    if (!confirm(`${novo ? "PROMOVER" : "REBAIXAR"} ${u.email} ${novo ? "a" : "de"} super-admin?`)) return;
    try {
      await api.adminMasterAlterarSuperAdmin(u.id, novo);
      await carregar();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  }

  async function impersonarUser(u) {
    if (!u.ativo) return alert("User inativo");
    if (!confirm(`Entrar como ${u.email}?\nToda ação será auditada como impersonate.`)) return;
    try {
      const resp = await api.adminMasterImpersonate(u.id);
      setSession(resp.token, resp.user, resp.empresa);
      window.location.href = "/";
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  }

  return (
    <>
      {erro && (
        <div style={{ background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>{erro}</div>
      )}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>
            Usuários do sistema ({users.length})
          </div>
          <button onClick={carregar} disabled={carregando} style={btnSecundario}>🔄 {carregando ? "..." : "Atualizar"}</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.surface }}>
                {["Nome", "Email", "Role", "Empresa", "Status", "Super", "Criado", "Ações"].map((h, i) => (
                  <th key={i} style={{
                    padding: "9px 10px", textAlign: "left",
                    color: C.muted, fontSize: 10, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: 0.5,
                    borderBottom: `1px solid ${C.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${C.border}55` }}>
                  <td style={{ padding: "9px 10px", color: C.text, fontWeight: 600 }}>{u.nome}</td>
                  <td style={{ padding: "9px 10px", color: C.muted, fontFamily: "monospace", fontSize: 11 }}>{u.email}</td>
                  <td style={{ padding: "9px 10px", color: C.text }}>
                    <span style={{
                      display: "inline-block", padding: "2px 6px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                      background: C.surface, color: C.muted,
                    }}>{u.role}</span>
                  </td>
                  <td style={{ padding: "9px 10px", color: C.text }}>{u.empresaNome || "—"}</td>
                  <td style={{ padding: "9px 10px" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: u.ativo ? C.green : C.red,
                    }}>{u.ativo ? "● ATIVO" : "● INATIVO"}</span>
                  </td>
                  <td style={{ padding: "9px 10px" }}>
                    {u.superAdmin && (
                      <span style={{
                        background: "#f59e0b33", color: "#f59e0b",
                        padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                      }}>👑 SUPER</span>
                    )}
                  </td>
                  <td style={{ padding: "9px 10px", color: C.muted }}>{fmtData(u.criadoEm)}</td>
                  <td style={{ padding: "9px 10px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => impersonarUser(u)} title="Entrar como" style={btnAcao(C.accent)}>👤</button>
                      <button onClick={() => toggleSuper(u)} title={u.superAdmin ? "Rebaixar" : "Promover a super-admin"} style={btnAcao(u.superAdmin ? C.red : "#f59e0b")}>
                        {u.superAdmin ? "↓" : "👑"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============ ABA: MÉTRICAS ============
function AbaMetricas() {
  const [dados, setDados] = useState(null);
  const [dias, setDias] = useState(30);
  const [carregando, setCarregando] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await api.adminMasterMetricas(dias);
      setDados(r);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); }, [dias]);

  if (!dados) return <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Carregando...</div>;

  const maxFat = Math.max(1, ...dados.ranking.map(r => r.faturamento));

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
        <span style={{ color: C.muted, fontSize: 12 }}>Janela:</span>
        {[7, 30, 90, 180].map(d => (
          <button key={d} onClick={() => setDias(d)} style={{
            background: dias === d ? C.accent + "22" : C.surface,
            color: dias === d ? C.accent : C.muted,
            border: `1px solid ${dias === d ? C.accent : C.border}`,
            borderRadius: 6, padding: "5px 10px", fontWeight: 700, fontSize: 11, cursor: "pointer",
          }}>{d}d</button>
        ))}
        <button onClick={carregar} disabled={carregando} style={{ ...btnSecundario, marginLeft: "auto" }}>
          🔄 {carregando ? "..." : "Atualizar"}
        </button>
      </div>

      {/* Ranking */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <div style={{ color: C.white, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
          🏆 Ranking de faturamento ({dias}d)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {dados.ranking.map((r, i) => {
            const pct = maxFat > 0 ? (r.faturamento / maxFat) * 100 : 0;
            return (
              <div key={r.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                  <div style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>
                    {i + 1}. {r.nome} {!r.ativo && <span style={{ color: C.red, fontSize: 10 }}>(suspensa)</span>}
                  </div>
                  <div style={{ color: C.muted, fontSize: 11 }}>
                    {fmtNum(r.vendasQtd)} vendas · <strong style={{ color: C.green }}>{fmtBRL(r.faturamento)}</strong>
                  </div>
                </div>
                <div style={{ position: "relative", height: 12, background: C.surface, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: C.green, opacity: 0.6 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Empresas inativas */}
      {dados.empresasInativasCount > 0 && (
        <div style={{
          background: C.yellow + "11", border: `1px solid ${C.yellow}55`,
          borderRadius: 12, padding: 16, marginBottom: 14,
        }}>
          <div style={{ color: C.yellow, fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            ⚠️ {dados.empresasInativasCount} empresa{dados.empresasInativasCount === 1 ? "" : "s"} sem login há 30+ dias
          </div>
          <div style={{ color: C.muted, fontSize: 11, marginBottom: 10 }}>
            Risco de churn — vale entrar em contato.
          </div>
          {dados.empresasInativas.map(e => (
            <div key={e.id} style={{
              display: "flex", justifyContent: "space-between",
              padding: "6px 10px", background: C.card, borderRadius: 6, marginBottom: 4, fontSize: 12,
            }}>
              <span style={{ color: C.text }}>{e.nome}</span>
              <span style={{ color: C.muted }}>{e.ultimoLogin ? `Último login: ${fmtData(e.ultimoLogin)}` : "Nunca logou"}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ============ ABA: LOGS ============
function AbaLogs() {
  const [logs, setLogs] = useState([]);
  const [filtros, setFiltros] = useState({ tenantId: "", acao: "", modulo: "" });
  const [empresas, setEmpresas] = useState([]);
  const [carregando, setCarregando] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const [r, emp] = await Promise.all([
        api.adminMasterLogs({
          tenantId: filtros.tenantId || undefined,
          acao: filtros.acao || undefined,
          modulo: filtros.modulo || undefined,
          limit: 200,
        }),
        empresas.length === 0 ? api.adminMasterListarEmpresas() : Promise.resolve({ empresas }),
      ]);
      setLogs(r.logs || []);
      if (empresas.length === 0) setEmpresas(emp.empresas || []);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); }, []);

  function corDaAcao(a) {
    if (a?.startsWith("LOGIN_FALHO")) return C.red;
    if (a?.includes("DELETE") || a?.includes("RESET") || a?.includes("DESATIVADA")) return C.red;
    if (a === "LOGIN" || a?.includes("CREATE") || a?.includes("PROMOVIDO")) return C.green;
    if (a?.includes("IMPERSONOU")) return "#f59e0b";
    return C.accent;
  }

  return (
    <>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 12, marginBottom: 14,
        display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 200 }}>
          <label style={labelStyle}>Empresa</label>
          <select value={filtros.tenantId} onChange={e => setFiltros(f => ({ ...f, tenantId: e.target.value }))} style={inputStyle}>
            <option value="">Todas</option>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 140 }}>
          <label style={labelStyle}>Ação</label>
          <input value={filtros.acao} onChange={e => setFiltros(f => ({ ...f, acao: e.target.value }))} placeholder="ex: LOGIN" style={inputStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 140 }}>
          <label style={labelStyle}>Módulo</label>
          <input value={filtros.modulo} onChange={e => setFiltros(f => ({ ...f, modulo: e.target.value }))} placeholder="ex: AUTH" style={inputStyle} />
        </div>
        <button onClick={carregar} disabled={carregando} style={{
          background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
          color: C.white, border: "none", borderRadius: 8,
          padding: "8px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer",
        }}>🔍 {carregando ? "..." : "Filtrar"}</button>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, color: C.white, fontSize: 13, fontWeight: 700 }}>
          {logs.length} eventos (mais recentes primeiro)
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: C.surface }}>
                {["Quando", "Ação", "Módulo", "Empresa", "Usuário", "Mensagem"].map((h, i) => (
                  <th key={i} style={{
                    padding: "8px 10px", textAlign: "left",
                    color: C.muted, fontSize: 10, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: 0.5,
                    borderBottom: `1px solid ${C.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} style={{ borderBottom: `1px solid ${C.border}55` }}>
                  <td style={{ padding: "7px 10px", color: C.muted, whiteSpace: "nowrap" }}>
                    {l.createdAt ? new Date(l.createdAt).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td style={{ padding: "7px 10px" }}>
                    <span style={{
                      color: corDaAcao(l.acao), fontWeight: 700, fontSize: 10,
                      background: corDaAcao(l.acao) + "22",
                      padding: "2px 6px", borderRadius: 4,
                    }}>{l.acao}</span>
                  </td>
                  <td style={{ padding: "7px 10px", color: C.muted }}>{l.modulo}</td>
                  <td style={{ padding: "7px 10px", color: C.text }}>{l.empresaNome || "—"}</td>
                  <td style={{ padding: "7px 10px", color: C.muted, fontSize: 10 }}>
                    {l.usuarioEmail || l.usuarioNome || "—"}
                  </td>
                  <td style={{ padding: "7px 10px", color: C.text, fontSize: 11 }}>{l.mensagem || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============ MODAL: SUSPENDER COM MOTIVO ============
function ModalSuspender({ empresa, onCancelar, onSuspensa }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSalvando(true); setErro("");
    try {
      await api.adminMasterAlterarStatus(empresa.id, false, motivo.trim());
      onSuspensa();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 200,
    }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} style={{
        background: C.card, border: `2px solid ${C.red}55`, borderRadius: 14,
        width: "100%", maxWidth: 460, padding: 24,
      }}>
        <div style={{ color: C.red, fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
          ⏸ Suspender empresa
        </div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>
          "{empresa.nome}" será suspensa. Todos os users perdem acesso até reativação.
        </div>
        <label style={labelStyle}>Motivo (opcional, mostrado pro user no login)</label>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)}
          rows={3} maxLength={500}
          placeholder="Ex: Pagamento em atraso desde 10/05. Quitar para reativar."
          style={{ ...inputStyle, resize: "vertical", minHeight: 70 }} />
        {erro && (
          <div style={{
            marginTop: 10, padding: "8px 12px", borderRadius: 8,
            background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 12,
          }}>{erro}</div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onCancelar} disabled={salvando} style={{ ...btnSecundario, flex: 1 }}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} style={{
            flex: 1, background: C.red, color: C.white,
            border: "none", borderRadius: 8, padding: "9px 18px",
            fontWeight: 800, fontSize: 12, cursor: salvando ? "default" : "pointer",
            opacity: salvando ? 0.6 : 1,
          }}>{salvando ? "Suspendendo..." : "⏸ Suspender"}</button>
        </div>
      </form>
    </div>
  );
}

// ============ ABA: NOTIFICAÇÕES ============
function AbaNotificacoes() {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [modalCriar, setModalCriar] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await api.adminMasterListarNotificacoes();
      setDados(r);
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); }, []);

  async function toggleAtiva(n) {
    try {
      await api.adminMasterAlterarAtivaNotificacao(n.id, !n.ativa);
      await carregar();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  }

  async function deletar(n) {
    if (!confirm(`Apagar permanentemente a notificação "${n.titulo}"?`)) return;
    try {
      await api.adminMasterDeletarNotificacao(n.id);
      await carregar();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  }

  const ns = dados?.notificacoes || [];
  const totalUsers = dados?.totalUsers || 0;

  return (
    <>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 12, overflow: "hidden",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>
            Notificações broadcast ({ns.length})
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={carregar} disabled={carregando} style={btnSecundario}>
              🔄 {carregando ? "..." : "Atualizar"}
            </button>
            <button onClick={() => setModalCriar(true)} style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              color: C.white, border: "none", borderRadius: 8,
              padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer",
            }}>+ Nova notificação</button>
          </div>
        </div>

        {ns.length === 0 && !carregando ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>
            Nenhuma notificação enviada ainda. Use o botão "+ Nova notificação" para avisar todos os clientes sobre manutenção, novidades, etc.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.surface }}>
                  {["Tipo", "Título", "Mensagem", "Status", "Leituras", "Expira", "Criada", "Ações"].map((h, i) => (
                    <th key={i} style={{
                      padding: "9px 10px", textAlign: "left",
                      color: C.muted, fontSize: 10, fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: 0.5,
                      borderBottom: `1px solid ${C.border}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ns.map(n => {
                  const tipoInfo = {
                    INFO: { cor: C.accent, icone: "📢" },
                    AVISO: { cor: C.yellow, icone: "⚠️" },
                    MANUTENCAO: { cor: C.red, icone: "🛠️" },
                    NOVIDADE: { cor: C.purple, icone: "✨" },
                  }[n.tipo] || { cor: C.accent, icone: "📢" };
                  const expirou = n.expiraEm && new Date(n.expiraEm) < new Date();
                  return (
                    <tr key={n.id} style={{ borderBottom: `1px solid ${C.border}55`, opacity: !n.ativa || expirou ? 0.5 : 1 }}>
                      <td style={{ padding: "9px 10px" }}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 10,
                          fontSize: 10, fontWeight: 700,
                          background: tipoInfo.cor + "33",
                          color: tipoInfo.cor,
                        }}>{tipoInfo.icone} {n.tipo}</span>
                      </td>
                      <td style={{ padding: "9px 10px", color: C.text, fontWeight: 600 }}>{n.titulo}</td>
                      <td style={{ padding: "9px 10px", color: C.muted, maxWidth: 300, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {n.mensagem}
                      </td>
                      <td style={{ padding: "9px 10px" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700,
                          color: n.ativa ? C.green : C.muted,
                        }}>{n.ativa ? "● ATIVA" : "● INATIVA"}</span>
                      </td>
                      <td style={{ padding: "9px 10px", color: C.text, fontSize: 11 }}>
                        {n.leituras}/{totalUsers}
                        <div style={{ height: 3, background: C.surface, borderRadius: 2, marginTop: 2, overflow: "hidden" }}>
                          <div style={{
                            width: `${totalUsers > 0 ? (n.leituras / totalUsers) * 100 : 0}%`,
                            height: "100%", background: C.green,
                          }} />
                        </div>
                      </td>
                      <td style={{ padding: "9px 10px", color: expirou ? C.red : C.muted, fontSize: 11 }}>
                        {n.expiraEm ? fmtData(n.expiraEm) : "—"}
                      </td>
                      <td style={{ padding: "9px 10px", color: C.muted, fontSize: 11 }}>{fmtData(n.createdAt)}</td>
                      <td style={{ padding: "9px 10px" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => toggleAtiva(n)} title={n.ativa ? "Desativar" : "Ativar"} style={btnAcao(n.ativa ? C.yellow : C.green)}>
                            {n.ativa ? "⏸" : "▶"}
                          </button>
                          <button onClick={() => deletar(n)} title="Apagar permanentemente" style={btnAcao(C.red)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalCriar && (
        <ModalCriarNotificacao
          onCancelar={() => setModalCriar(false)}
          onCriada={() => { setModalCriar(false); carregar(); }}
        />
      )}
    </>
  );
}

// ============ MODAL: NOVA NOTIFICAÇÃO ============
function ModalCriarNotificacao({ onCancelar, onCriada }) {
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [tipo, setTipo] = useState("INFO");
  const [expiraEm, setExpiraEm] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSalvando(true); setErro("");
    try {
      await api.adminMasterCriarNotificacao({
        titulo: titulo.trim(),
        mensagem: mensagem.trim(),
        tipo,
        expiraEm: expiraEm || undefined,
      });
      onCriada();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 200,
    }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        width: "100%", maxWidth: 520, padding: 26, maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ color: C.white, fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
          📢 Nova notificação broadcast
        </div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 18 }}>
          Será exibida como banner no topo do app pra TODOS os usuários até cada um marcar como lida.
        </div>

        <label style={labelStyle}>Tipo</label>
        <select value={tipo} onChange={e => setTipo(e.target.value)} style={inputStyle}>
          <option value="INFO">📢 Informativo</option>
          <option value="AVISO">⚠️ Aviso</option>
          <option value="MANUTENCAO">🛠️ Manutenção</option>
          <option value="NOVIDADE">✨ Novidade</option>
        </select>

        <label style={{ ...labelStyle, marginTop: 12 }}>Título *</label>
        <input value={titulo} onChange={e => setTitulo(e.target.value)}
          required maxLength={200} style={inputStyle}
          placeholder="Ex: Manutenção programada amanhã às 02h" />

        <label style={{ ...labelStyle, marginTop: 12 }}>Mensagem *</label>
        <textarea value={mensagem} onChange={e => setMensagem(e.target.value)}
          required rows={4} style={{ ...inputStyle, resize: "vertical", minHeight: 80 }}
          placeholder="Detalhes da mensagem que o usuário vai ler no banner." />

        <label style={{ ...labelStyle, marginTop: 12 }}>Expira em (opcional)</label>
        <input type="datetime-local" value={expiraEm}
          onChange={e => setExpiraEm(e.target.value)} style={inputStyle} />

        {erro && (
          <div style={{
            marginTop: 12, padding: "8px 12px", borderRadius: 8,
            background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 12,
          }}>{erro}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onCancelar} disabled={salvando} style={{ ...btnSecundario, flex: 1 }}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} style={{
            flex: 1,
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, border: "none", borderRadius: 8,
            padding: "9px 18px", fontWeight: 800, fontSize: 12,
            cursor: salvando ? "default" : "pointer",
            opacity: salvando ? 0.6 : 1,
          }}>{salvando ? "Enviando..." : "📢 Enviar para todos"}</button>
        </div>
      </form>
    </div>
  );
}

// ============ MODAL: ALTERAR PLANO ============
function ModalPlano({ empresa, onCancelar, onSalva }) {
  const hoje = new Date();
  const em30 = new Date(hoje); em30.setDate(em30.getDate() + 30);
  const [plano, setPlano] = useState(empresa.plano || "TRIAL");
  const [expiraEm, setExpiraEm] = useState(
    empresa.expiraEm ? empresa.expiraEm.slice(0, 10) : em30.toISOString().slice(0, 10)
  );
  const [observacoes, setObservacoes] = useState(empresa.observacoesPlano || "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSalvando(true); setErro("");
    try {
      await api.adminMasterAlterarPlano(empresa.id, {
        plano,
        expiraEm: expiraEm || null,
        observacoes: observacoes.trim() || null,
      });
      onSalva();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 200,
    }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        width: "100%", maxWidth: 460, padding: 26,
      }}>
        <div style={{ color: C.white, fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
          🎫 Alterar plano
        </div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 18 }}>
          Plano de <strong style={{ color: C.text }}>{empresa.nome}</strong>
        </div>

        <label style={labelStyle}>Plano</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 6, marginBottom: 12 }}>
          {Object.entries(PLANOS_INFO).map(([k, info]) => (
            <button key={k} type="button" onClick={() => setPlano(k)} style={{
              padding: "10px 8px", borderRadius: 8,
              background: plano === k ? info.cor + "33" : C.surface,
              border: `2px solid ${plano === k ? info.cor : C.border}`,
              color: plano === k ? info.cor : C.muted,
              fontWeight: 700, fontSize: 11, cursor: "pointer",
            }}>{info.icone}<br />{info.label}</button>
          ))}
        </div>

        <label style={{ ...labelStyle, marginTop: 10 }}>Expira em</label>
        <input type="date" value={expiraEm}
          onChange={e => setExpiraEm(e.target.value)} style={inputStyle} />
        <div style={{ color: C.muted, fontSize: 10, marginTop: 4 }}>
          Deixe vazio pra plano sem expiração (ex: Enterprise vitalício).
        </div>

        <label style={{ ...labelStyle, marginTop: 12 }}>Observações (interno)</label>
        <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
          rows={3} maxLength={500}
          style={{ ...inputStyle, resize: "vertical", minHeight: 60 }}
          placeholder="Ex: Pagou anual com 10% desconto. Próxima cobrança 10/05/2027." />

        {erro && (
          <div style={{
            marginTop: 10, padding: "8px 12px", borderRadius: 8,
            background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 12,
          }}>{erro}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onCancelar} disabled={salvando} style={{ ...btnSecundario, flex: 1 }}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} style={{
            flex: 1,
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, border: "none", borderRadius: 8,
            padding: "9px 18px", fontWeight: 800, fontSize: 12,
            cursor: salvando ? "default" : "pointer",
            opacity: salvando ? 0.6 : 1,
          }}>{salvando ? "Salvando..." : "💾 Salvar"}</button>
        </div>
      </form>
    </div>
  );
}

// ============ MODAL: DETALHES DA EMPRESA (DRILL-DOWN) ============
// Painel unificado pra investigar uma empresa especifica sem ter que pular
// entre as abas Empresas/Users/Logs. Busca users e logs ao montar.
function ModalDetalhesEmpresa({ empresa, onCancelar, onAlterarPlano, onSuspender, onReativar, onImpersonar }) {
  const [users, setUsers] = useState(null);
  const [logs, setLogs] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [u, l] = await Promise.all([
          api.adminMasterListarUsers(empresa.id),
          api.adminMasterLogs({ tenantId: empresa.id, limit: 20 }),
        ]);
        if (cancelado) return;
        setUsers(u.users || []);
        setLogs(l.logs || []);
      } catch (err) {
        if (!cancelado) setErro(err.message);
      }
    })();
    return () => { cancelado = true; };
  }, [empresa.id]);

  const planoInfo = PLANOS_INFO[empresa.plano] || PLANOS_INFO.TRIAL;
  const limites = LIMITES_PLANO_UI[empresa.plano] || LIMITES_PLANO_UI.TRIAL;
  const diasDesdeCriacao = Math.floor((Date.now() - new Date(empresa.criadaEm).getTime()) / 86400000);
  const { diasParaExpirar, expirou, expirando } = empresa._saude || {};

  const recursos = [
    { id: "usuarios", label: "Usuários",  atual: empresa.estatisticas?.usuarios ?? 0, limite: limites.usuarios },
    { id: "clientes", label: "Clientes",  atual: empresa.estatisticas?.clientes ?? 0, limite: limites.clientes },
    { id: "produtos", label: "Produtos",  atual: empresa.estatisticas?.produtos ?? 0, limite: limites.produtos },
  ];

  return (
    <div onClick={onCancelar} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 200,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        width: "100%", maxWidth: 760, maxHeight: "90vh", overflow: "auto",
        padding: 24,
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: C.white, fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
              {empresa.nome}
            </div>
            <div style={{ color: C.muted, fontSize: 11, fontFamily: "monospace" }}>
              {empresa.cnpj ? mascararCnpj(empresa.cnpj) : "Sem CNPJ"} · ID {empresa.id.slice(0, 8)}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{
                display: "inline-block", padding: "3px 10px", borderRadius: 10,
                fontSize: 10, fontWeight: 700,
                background: planoInfo.cor + "33", color: planoInfo.cor,
              }}>{planoInfo.icone} {planoInfo.label}</span>
              <span style={{
                display: "inline-block", padding: "3px 10px", borderRadius: 10,
                fontSize: 10, fontWeight: 700,
                background: empresa.ativo ? C.green + "33" : C.red + "33",
                color: empresa.ativo ? C.green : C.red,
              }}>{empresa.ativo ? "● ATIVA" : "● SUSPENSA"}</span>
              {diasParaExpirar !== null && diasParaExpirar !== undefined && (
                <span style={{
                  display: "inline-block", padding: "3px 10px", borderRadius: 10,
                  fontSize: 10, fontWeight: 700,
                  background: (expirou ? C.red : expirando ? C.yellow : C.muted) + "22",
                  color: expirou ? C.red : expirando ? C.yellow : C.muted,
                }}>
                  {expirou ? `Expirou ${-diasParaExpirar}d atrás` : `Expira em ${diasParaExpirar}d`}
                </span>
              )}
            </div>
          </div>
          <button onClick={onCancelar} style={{
            background: "transparent", border: "none", color: C.muted,
            fontSize: 20, cursor: "pointer", padding: 4,
          }}>✕</button>
        </div>

        {erro && (
          <div style={{
            background: C.red + "22", border: `1px solid ${C.red}55`,
            color: C.red, borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 12,
          }}>{erro}</div>
        )}

        {/* KPIs operacionais */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 18 }}>
          {[
            { label: "Vendas",          valor: fmtNum(empresa.estatisticas?.vendas ?? 0),         cor: C.accent },
            { label: "Faturamento",     valor: fmtBRL(empresa.estatisticas?.faturamentoTotal ?? 0),cor: C.green },
            { label: "Dias no sistema", valor: fmtNum(diasDesdeCriacao),                           cor: C.purple },
            { label: "Criada em",       valor: fmtData(empresa.criadaEm),                          cor: C.muted },
          ].map((k, i) => (
            <div key={i} style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "8px 10px",
            }}>
              <div style={{ color: C.muted, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{k.label}</div>
              <div style={{ color: k.cor, fontSize: 14, fontWeight: 800, marginTop: 2 }}>{k.valor}</div>
            </div>
          ))}
        </div>

        {/* Uso vs Limite */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Uso vs. Limite do plano
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recursos.map(r => {
              const ilim = r.limite == null;
              const pct = ilim ? 0 : Math.min(100, (r.atual / r.limite) * 100);
              const cor = ilim ? C.muted : pct >= 100 ? C.red : pct >= 90 ? "#fb923c" : pct >= 70 ? C.yellow : C.green;
              return (
                <div key={r.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: C.text, fontWeight: 600 }}>{r.label}</span>
                    <span style={{ color: cor, fontWeight: 700, fontFamily: "monospace" }}>
                      {fmtNum(r.atual)} / {ilim ? "∞" : fmtNum(r.limite)}
                      {!ilim && ` (${pct.toFixed(0)}%)`}
                    </span>
                  </div>
                  <div style={{ height: 6, background: C.surface, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      width: ilim ? "100%" : `${pct}%`,
                      height: "100%", background: cor,
                      opacity: ilim ? 0.3 : 1,
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {empresa.observacoesPlano && (
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.text,
            marginBottom: 18,
          }}>
            <div style={{ color: C.muted, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
              Observações (interno)
            </div>
            {empresa.observacoesPlano}
          </div>
        )}

        {/* Users */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Usuários ({users?.length ?? "..."})
          </div>
          {users === null ? (
            <div style={{ color: C.muted, fontSize: 12 }}>Carregando...</div>
          ) : users.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 12 }}>Nenhum usuário.</div>
          ) : (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              {users.slice(0, 10).map(u => (
                <div key={u.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 10px", borderBottom: `1px solid ${C.border}55`, fontSize: 12,
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: C.text, fontWeight: 600 }}>{u.nome}</div>
                    <div style={{ color: C.muted, fontSize: 10 }}>{u.email}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span style={{
                      padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                      background: C.purple + "22", color: C.purple,
                    }}>{u.role}</span>
                    {!u.ativo && (
                      <span style={{
                        padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                        background: C.red + "22", color: C.red,
                      }}>INATIVO</span>
                    )}
                  </div>
                </div>
              ))}
              {users.length > 10 && (
                <div style={{ padding: "6px 10px", fontSize: 10, color: C.muted, textAlign: "center" }}>
                  +{users.length - 10} usuário(s)
                </div>
              )}
            </div>
          )}
        </div>

        {/* Logs */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Últimos eventos
          </div>
          {logs === null ? (
            <div style={{ color: C.muted, fontSize: 12 }}>Carregando...</div>
          ) : logs.length === 0 ? (
            <div style={{ color: C.muted, fontSize: 12 }}>Sem eventos registrados.</div>
          ) : (
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 8, overflow: "hidden", maxHeight: 220, overflowY: "auto",
            }}>
              {logs.map(l => (
                <div key={l.id} style={{
                  padding: "6px 10px", borderBottom: `1px solid ${C.border}55`, fontSize: 11,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{
                      color: l.sucesso ? C.green : C.red, fontWeight: 700, fontSize: 10,
                    }}>{l.acao}</span>
                    <span style={{ color: C.muted, fontSize: 10, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                      {fmtData(l.createdAt)}
                    </span>
                  </div>
                  {l.mensagem && (
                    <div style={{ color: C.text, fontSize: 11, marginTop: 2 }}>{l.mensagem}</div>
                  )}
                  {l.usuarioNome && (
                    <div style={{ color: C.muted, fontSize: 10, marginTop: 1 }}>por {l.usuarioNome}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Acoes */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
          <button onClick={onAlterarPlano} style={{
            background: planoInfo.cor + "22", color: planoInfo.cor,
            border: `1px solid ${planoInfo.cor}55`, borderRadius: 8,
            padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer",
          }}>🎫 Alterar plano</button>
          <button onClick={onImpersonar} style={{
            background: C.accent + "22", color: C.accent,
            border: `1px solid ${C.accent}55`, borderRadius: 8,
            padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer",
          }}>👤 Entrar como admin</button>
          {empresa.ativo ? (
            <button onClick={onSuspender} style={{
              background: C.red + "22", color: C.red,
              border: `1px solid ${C.red}55`, borderRadius: 8,
              padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer",
            }}>⏸ Suspender</button>
          ) : (
            <button onClick={onReativar} style={{
              background: C.green + "22", color: C.green,
              border: `1px solid ${C.green}55`, borderRadius: 8,
              padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer",
            }}>▶ Reativar</button>
          )}
          <a href={api.adminMasterExportEmpresaUrl(empresa.id) + "?t=" + Date.now()}
            style={{
              background: C.purple + "22", color: C.purple,
              border: `1px solid ${C.purple}55`, borderRadius: 8,
              padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer",
              textDecoration: "none", display: "inline-block",
            }}>📥 Exportar JSON</a>
          <button onClick={onCancelar} style={{ ...btnSecundario, marginLeft: "auto" }}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// Botao de acao compacto (icone)
const btnAcao = (cor) => ({
  background: cor + "22", color: cor,
  border: `1px solid ${cor}55`,
  borderRadius: 6, padding: "4px 8px",
  fontWeight: 700, fontSize: 12, cursor: "pointer",
  minWidth: 28,
});

// ============ MODAL: CRIAR EMPRESA ============
function ModalCriarEmpresa({ onCancelar, onCriada }) {
  const [form, setForm] = useState({
    nomeEmpresa: "", cnpj: "", nomeAdmin: "", email: "", senha: "",
  });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  function up(campo, valor) {
    if (campo === "cnpj") valor = mascararCnpj(valor);
    setForm(f => ({ ...f, [campo]: valor }));
  }

  async function submit(e) {
    e.preventDefault();
    setSalvando(true); setErro("");
    try {
      await api.adminMasterCriarEmpresa({
        nomeEmpresa: form.nomeEmpresa.trim(),
        cnpj: form.cnpj.replace(/\D/g, "") || undefined,
        nomeAdmin: form.nomeAdmin.trim(),
        email: form.email.trim().toLowerCase(),
        senha: form.senha,
      });
      onCriada();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 200,
    }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        width: "100%", maxWidth: 480, padding: 28,
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ color: C.white, fontSize: 18, fontWeight: 800, marginBottom: 16 }}>
          + Nova empresa
        </div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 18 }}>
          Cria o tenant + admin inicial. Você passa as credenciais pro cliente.
        </div>

        <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          Empresa
        </div>
        <label style={labelStyle}>Nome *</label>
        <input value={form.nomeEmpresa} onChange={e => up("nomeEmpresa", e.target.value)}
          required maxLength={120} style={inputStyle} placeholder="Ex: Padaria do João" />

        <label style={{ ...labelStyle, marginTop: 10 }}>CNPJ (opcional)</label>
        <input value={form.cnpj} onChange={e => up("cnpj", e.target.value)}
          inputMode="numeric" style={inputStyle} placeholder="00.000.000/0000-00" />

        <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 18, marginBottom: 6 }}>
          Administrador inicial
        </div>
        <label style={labelStyle}>Nome *</label>
        <input value={form.nomeAdmin} onChange={e => up("nomeAdmin", e.target.value)}
          required maxLength={120} style={inputStyle} placeholder="Ex: João Silva" />

        <label style={{ ...labelStyle, marginTop: 10 }}>Email *</label>
        <input type="email" value={form.email} onChange={e => up("email", e.target.value)}
          required style={inputStyle} placeholder="joao@padaria.com" />

        <label style={{ ...labelStyle, marginTop: 10 }}>Senha inicial * (min 6 chars)</label>
        <input type="text" value={form.senha} onChange={e => up("senha", e.target.value)}
          required minLength={6} style={inputStyle} placeholder="senha-inicial-123" />

        {erro && (
          <div style={{
            marginTop: 12, padding: "8px 12px", borderRadius: 8,
            background: C.red + "22", border: `1px solid ${C.red}55`,
            color: C.red, fontSize: 12,
          }}>{erro}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
          <button type="button" onClick={onCancelar} disabled={salvando} style={{
            ...btnSecundario, flex: 1,
          }}>Cancelar</button>
          <button type="submit" disabled={salvando} style={{
            flex: 1,
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, border: "none", borderRadius: 8,
            padding: "9px 18px", fontWeight: 800, fontSize: 12,
            cursor: salvando ? "default" : "pointer",
            opacity: salvando ? 0.6 : 1,
          }}>{salvando ? "Criando..." : "Criar empresa"}</button>
        </div>
      </form>
    </div>
  );
}

function Tela({ children }) {
  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text,
      padding: 20, fontFamily: "'Segoe UI', sans-serif",
    }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

const labelStyle = {
  display: "block", color: C.muted, fontSize: 10, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4,
};

const inputStyle = {
  background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 13,
  outline: "none", width: "100%", boxSizing: "border-box",
};

const btnSecundario = {
  background: C.surface, border: `1px solid ${C.border}`,
  color: C.text, borderRadius: 8, padding: "8px 14px",
  fontWeight: 600, fontSize: 12, cursor: "pointer",
};
