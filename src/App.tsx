import { useState, useEffect, useRef, lazy, Suspense, type CSSProperties } from "react";
import { C } from "./lib/theme";
import Alertas from "./Alertas";
import { getUser, getToken, clearSession, api } from "./lib/api";
import { podeAcessar } from "./lib/permissoes";

// Todas as telas sao lazy — cada uma vira um chunk separado e so e baixada
// quando o usuario navegar para ela. Login fica lazy tambem (so carrega
// quando nao ha sessao). Alertas continua eager por ser parte do shell.
const Login = lazy(() => import("./Login"));
const Clientes = lazy(() => import("./Clientes"));
const Fornecedores = lazy(() => import("./Fornecedores"));
const Produtos = lazy(() => import("./Produtos"));
const Etiquetas = lazy(() => import("./Etiquetas"));
const Estoque = lazy(() => import("./Estoque"));
const Compras = lazy(() => import("./Compras"));
const Orcamentos = lazy(() => import("./Orcamentos"));
const Funcionarios = lazy(() => import("./Funcionarios"));
const Comissoes = lazy(() => import("./Comissoes"));
const FinanceiroPage = lazy(() => import("./pages/financeiro/FinanceiroPage"));
const Caixa = lazy(() => import("./Caixa"));
const PDV = lazy(() => import("./PDV"));
const Dashboard = lazy(() => import("./Dashboard"));
const Relatorios = lazy(() => import("./Relatorios"));
const Projeto = lazy(() => import("./Projeto"));
const Sistema = lazy(() => import("./Sistema"));
const ConfiguracoesImpressora = lazy(() => import("./ConfiguracoesImpressora"));
const Empresa = lazy(() => import("./Empresa"));
const TrocarSenhaModal = lazy(() => import("./TrocarSenhaModal"));
const Aparencia = lazy(() => import("./Aparencia"));
const Tarefas = lazy(() => import("./Tarefas"));
const Fidelidade = lazy(() => import("./Fidelidade"));
const Funil = lazy(() => import("./Funil"));
const Segmentos = lazy(() => import("./Segmentos"));
const Automacoes = lazy(() => import("./Automacoes"));
const DashboardCrm = lazy(() => import("./DashboardCrm"));
const Reativacao = lazy(() => import("./Reativacao"));
const Nps = lazy(() => import("./Nps"));
const PesquisaPublicaNps = lazy(() => import("./PesquisaPublicaNps"));
const Logs = lazy(() => import("./Logs"));


const SIDEBAR_W_EXPANDIDA = 240;
const SIDEBAR_W_RECOLHIDA = 72;
const PREF_SIDEBAR_KEY = "gestao_sidebar_collapsed";

// Helper de persistencia. Hoje grava em localStorage. Quando houver
// PUT /auth/preferencias no backend, plugar aqui — manter localStorage como
// cache local (escrita otimista) e disparar o request em paralelo.
function salvarPreferenciaSidebar(collapsed: boolean) {
  try { localStorage.setItem(PREF_SIDEBAR_KEY, collapsed ? "1" : "0"); } catch {}
  // TODO(sync-db): quando o endpoint existir, descomentar:
  // api.salvarPreferencia({ sidebarCollapsed: collapsed }).catch(() => {});
}

function lerPreferenciaSidebar() {
  try { return localStorage.getItem(PREF_SIDEBAR_KEY) === "1"; } catch { return false; }
}

const ESTILO_RESPONSIVO = `
.gp-sidebar {
  position: fixed; top: 0; left: 0; height: 100vh;
  background: ${C.surface}; border-right: 1px solid ${C.border};
  display: flex; flex-direction: column; z-index: 60;
  transition: transform 0.25s ease, width 0.25s ease;
}
.gp-content { min-height: 100vh; transition: margin-left 0.25s ease; }
.gp-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.55);
  z-index: 55; opacity: 0; pointer-events: none;
  transition: opacity 0.2s ease;
}
.gp-mobile-bar { display: none; }
.gp-nav-section { flex: 1; overflow-y: auto; overflow-x: hidden; }
.gp-nav-section::-webkit-scrollbar { width: 6px; }
.gp-nav-section::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
@media (max-width: 900px) {
  .gp-sidebar { transform: translateX(-100%); box-shadow: 8px 0 30px rgba(0,0,0,0.5); width: 240px !important; }
  .gp-sidebar.open { transform: translateX(0); }
  .gp-content { margin-left: 0 !important; }
  .gp-overlay.open { opacity: 1; pointer-events: auto; }
  .gp-mobile-bar { display: flex; }
  .gp-toggle-desktop { display: none !important; }
}
`;

// Detecta token NPS na URL antes mesmo de instanciar App, para que o
// usuario externo (cliente) nunca veja a tela de login.
function getNpsToken() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("nps") || null;
  } catch { return null; }
}

// Fallback de Suspense usado em todos os pontos onde uma tela lazy entra
// em cena. Mantem aparencia consistente com a tela inicial de carregamento.
function TelaCarregando({ alturaMin = "100vh" }: { alturaMin?: string }) {
  return (
    <div style={{
      minHeight: alturaMin, display: "flex",
      alignItems: "center", justifyContent: "center",
      color: C.muted, fontFamily: "'Segoe UI', sans-serif",
      padding: 24, fontSize: 13,
    }}>
      Carregando...
    </div>
  );
}

export default function App() {
  // Bypass de auth para pesquisa publica de NPS. Calculado uma vez via
  // useState para nao re-renderizar a cada update.
  const [npsToken] = useState(() => getNpsToken());

  const [user, setUser] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [tela, setTela] = useState("pdv");
  const [menuUsuario, setMenuUsuario] = useState(false);
  const [trocarSenhaAberto, setTrocarSenhaAberto] = useState(false);
  const [sidebarAberta, setSidebarAberta] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => lerPreferenciaSidebar());
  const menuRef = useRef<HTMLDivElement | null>(null);

  function alternarColapso() {
    setSidebarCollapsed((v) => {
      const novo = !v;
      salvarPreferenciaSidebar(novo);
      return novo;
    });
  }

  const sidebarLargura = sidebarCollapsed ? SIDEBAR_W_RECOLHIDA : SIDEBAR_W_EXPANDIDA;

  // Wrappers para injetar collapsed em todos os itens da sidebar.
  const Item = (props: any) => <NavItem {...props} collapsed={sidebarCollapsed} />;
  const Secao = (props: any) => <SecaoLabel {...props} collapsed={sidebarCollapsed} />;

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (menuUsuario && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuUsuario(false);
      }
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, [menuUsuario]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setSidebarAberta(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let ativo = true;
    async function init() {
      const token = getToken();
      const cached = getUser();
      if (!token) { setCarregando(false); return; }
      try {
        const u = await api.me();
        if (ativo) setUser(u);
      } catch {
        clearSession();
        if (ativo && cached) setUser(null);
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    init();

    function onLogout() { setUser(null); }
    window.addEventListener("auth:logout", onLogout);
    return () => {
      ativo = false;
      window.removeEventListener("auth:logout", onLogout);
    };
  }, []);

  function sair() {
    // Best-effort: avisa o backend para registrar o evento de logout no
    // log de auditoria; em seguida limpa sessao local independentemente.
    api.logout().finally(() => {
      clearSession();
      setUser(null);
    });
  }

  // ETAPA 12: banner de notificacoes broadcast (super-admin -> todos clientes).
  // Carrega ao logar e a cada 5 minutos. User dismissa via X (marcar-lida).
  const [notificacoes, setNotificacoes] = useState<any[]>([]);
  useEffect(() => {
    if (!user) { setNotificacoes([]); return; }
    let ativo = true;
    async function buscar() {
      try {
        const r = await api.notificacoesMinhas() as { notificacoes?: any[] };
        if (ativo) setNotificacoes(r.notificacoes || []);
      } catch { /* silencioso */ }
    }
    buscar();
    const id = setInterval(buscar, 5 * 60 * 1000);
    return () => { ativo = false; clearInterval(id); };
  }, [user]);

  async function fecharNotificacao(notifId: string) {
    setNotificacoes(ns => ns.filter(n => n.id !== notifId));
    try { await api.notificacoesMarcarLida(notifId); } catch { /* silencioso */ }
  }

  function navegar(t: string) {
    setTela(t);
    setSidebarAberta(false);
  }

  // Mapeia cada tela do app para o modulo de permissao correspondente.
  // "projeto" e ferramenta interna, fica liberada.
  const TELA_MODULO: Record<string, string> = {
    pdv: "PDV", dashboard: "DASHBOARD", dashboardcrm: "DASHBOARD", caixa: "CAIXA", clientes: "CLIENTES",
    fornecedores: "FORNECEDORES", produtos: "PRODUTOS", etiquetas: "PRODUTOS", estoque: "ESTOQUE",
    compras: "COMPRAS", orcamentos: "ORCAMENTOS",
    funil: "OPORTUNIDADES",
    automacoes: "AUTOMACOES",
    nps: "NPS",
    financeiro: "FINANCEIRO", relatorios: "RELATORIOS",
    comissoes: "COMISSOES",
    funcionarios: "FUNCIONARIOS",
    tarefas: "CLIENTES",
    fidelidade: "CLIENTES",
    segmentos: "CLIENTES",
    reativacao: "CLIENTES",
  };

  function podeVer(t: string) {
    if (t === "projeto" || t === "aparencia") return true;
    if (t === "sistema" || t === "logs") return user?.role === "ADMIN";
    if (t === "empresa") return user?.role === "ADMIN" || user?.role === "GERENTE";
    if (t === "impressora") return user?.role === "ADMIN" || user?.role === "GERENTE";
    return podeAcessar(user, TELA_MODULO[t] as any);
  }

  // Se o usuario abriu uma tela sem permissao (ex: cache), redireciona para a primeira disponivel.
  useEffect(() => {
    if (!user) return;
    if (!podeVer(tela)) {
      const primeira = ["pdv","dashboard","dashboardcrm","caixa","clientes","segmentos","reativacao","tarefas","fidelidade","funil","automacoes","nps","fornecedores","produtos","etiquetas",
        "estoque","compras","orcamentos","financeiro","relatorios","comissoes","funcionarios","projeto","sistema","empresa","impressora"].find(podeVer);
      if (primeira && primeira !== tela) setTela(primeira);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tela]);

  // Pesquisa publica NPS: cliente externo acessa sem login.
  if (npsToken) return (
    <Suspense fallback={<TelaCarregando />}>
      <PesquisaPublicaNps token={npsToken} />
    </Suspense>
  );

  if (carregando) {
    return (
      <div style={{
        background: C.bg, minHeight: "100vh", display: "flex",
        alignItems: "center", justifyContent: "center",
        color: C.muted, fontFamily: "sans-serif",
      }}>
        Carregando...
      </div>
    );
  }

  if (!user) return (
    <Suspense fallback={<TelaCarregando />}>
      <Login onSuccess={setUser} />
    </Suspense>
  );

  // ETAPA 11: banner global quando sessao foi gerada via impersonate.
  // O JWT do super-admin "fingindo ser" outro user carrega claim `imp`
  // com o id do super-admin original. Tudo que ele fizer fica auditado
  // como esse user (com claim imp registrado).
  const impersonado = (() => {
    const token = getToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload?.imp) return { porId: payload.imp, porNome: payload.impNome };
      return null;
    } catch { return null; }
  })();

  // Modo focado do PDV: ocupa 100% da tela, sem sidebar/topbar/header de
  // pagina. PDV gerencia seu proprio header com logo, tabs, status do
  // caixa e botao "Menu" para sair do modo focado.
  if (tela === "pdv") {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Segoe UI', sans-serif", color: C.text }}>
        <style>{ESTILO_RESPONSIVO}</style>
        <Suspense fallback={<TelaCarregando />}>
          <PDV user={user} onSair={() => setTela("dashboard")} sair={sair} />
        </Suspense>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Segoe UI', sans-serif", color: C.text }}>
      <style>{ESTILO_RESPONSIVO}</style>
      {impersonado && (
        <div style={{
          background: "#f59e0b", color: "#0a0c14",
          padding: "8px 16px", textAlign: "center",
          fontSize: 12, fontWeight: 700,
          display: "flex", justifyContent: "center", alignItems: "center", gap: 12,
        }}>
          <span>👤 Você está impersonando como <strong>{user.nome}</strong> ({user.email}) — supervisão: {impersonado.porNome || "super-admin"}</span>
          <a href="/admin-master" style={{
            background: "#0a0c14", color: "#f59e0b",
            padding: "3px 10px", borderRadius: 4, textDecoration: "none",
            fontSize: 11, fontWeight: 800,
          }}>← Voltar ao Admin Master</a>
        </div>
      )}
      {/* ETAPA 12: banner de notificacoes broadcast — uma por vez, mais recente */}
      {notificacoes.length > 0 && (() => {
        const n = notificacoes[0];
        const cor = n.tipo === "MANUTENCAO" ? "#ef4444"
          : n.tipo === "AVISO" ? "#f59e0b"
          : n.tipo === "NOVIDADE" ? "#7c3aed"
          : "#4f8ef7";
        const icone = n.tipo === "MANUTENCAO" ? "🛠️"
          : n.tipo === "AVISO" ? "⚠️"
          : n.tipo === "NOVIDADE" ? "✨"
          : "📢";
        return (
          <div style={{
            background: cor, color: "#ffffff",
            padding: "10px 16px",
            display: "flex", alignItems: "center", gap: 12,
            fontSize: 13,
          }}>
            <span style={{ fontSize: 18 }}>{icone}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, lineHeight: 1.2 }}>{n.titulo}</div>
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>{n.mensagem}</div>
            </div>
            {notificacoes.length > 1 && (
              <span style={{
                background: "rgba(0,0,0,0.25)", padding: "3px 8px",
                borderRadius: 10, fontSize: 11, fontWeight: 700,
              }}>+{notificacoes.length - 1}</span>
            )}
            <button
              onClick={() => fecharNotificacao(n.id)}
              style={{
                background: "rgba(0,0,0,0.25)", color: "#ffffff",
                border: "none", borderRadius: 4,
                padding: "4px 10px", cursor: "pointer",
                fontSize: 12, fontWeight: 700,
              }}
              title="Marcar como lida"
            >✓ OK</button>
          </div>
        );
      })()}

      {/* Sidebar */}
      <aside
        className={`gp-sidebar ${sidebarAberta ? "open" : ""}`}
        style={{ width: sidebarLargura }}
      >
        <div style={{
          padding: sidebarCollapsed ? "18px 12px 16px" : "18px 18px 16px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex", alignItems: "center",
          gap: sidebarCollapsed ? 0 : 10,
          justifyContent: sidebarCollapsed ? "center" : "flex-start",
        }}>
          <div style={{ fontSize: 24 }}>🏪</div>
          {!sidebarCollapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.white, fontWeight: 800, fontSize: 16, lineHeight: 1.1 }}>GestãoPRO</div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Gestão + PDV</div>
            </div>
          )}
          <button
            onClick={() => setSidebarAberta(false)}
            className="gp-mobile-bar"
            aria-label="Fechar menu"
            style={{
              background: "transparent", border: "none", color: C.muted,
              fontSize: 22, cursor: "pointer", padding: 4, lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* Botao de toggle (so desktop) */}
        <button
          onClick={alternarColapso}
          aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
          style={{
            display: "block", margin: sidebarCollapsed ? "10px auto 0" : "10px 12px 0 auto",
            background: C.card, border: `1px solid ${C.border}`, color: C.muted,
            borderRadius: 6, width: 28, height: 28, cursor: "pointer",
            fontSize: 14, lineHeight: 1, padding: 0,
            transition: "background 0.15s ease, color 0.15s ease",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = C.accent + "22"; e.currentTarget.style.color = C.accent; }}
          onMouseLeave={e => { e.currentTarget.style.background = C.card; e.currentTarget.style.color = C.muted; }}
          className="gp-toggle-desktop"
        >{sidebarCollapsed ? "›" : "‹"}</button>

        <nav className="gp-nav-section" style={{ padding: "12px 10px" }}>
          {podeAcessar(user, "PDV") && (
            <Item icone="🛒" label="PDV" destaque ativo={tela === "pdv"} onClick={() => navegar("pdv")} />
          )}
          {podeAcessar(user, "DASHBOARD") && (
            <Item icone="📊" label="Dashboard" ativo={tela === "dashboard"} onClick={() => navegar("dashboard")} />
          )}
          {podeAcessar(user, "DASHBOARD") && (
            <Item icone="🎯" label="Dashboard CRM" ativo={tela === "dashboardcrm"} onClick={() => navegar("dashboardcrm")} />
          )}
          {(podeAcessar(user, "CLIENTES") || podeAcessar(user, "FORNECEDORES") || podeAcessar(user, "PRODUTOS")) && (
            <Secao>Cadastros</Secao>
          )}
          {podeAcessar(user, "CLIENTES") && (
            <Item icone="👥" label="Clientes" ativo={tela === "clientes"} onClick={() => navegar("clientes")} />
          )}
          {podeAcessar(user, "CLIENTES") && (
            <Item icone="📊" label="Segmentos" ativo={tela === "segmentos"} onClick={() => navegar("segmentos")} />
          )}
          {podeAcessar(user, "CLIENTES") && (
            <Item icone="🎂" label="Aniversários" ativo={tela === "reativacao"} onClick={() => navegar("reativacao")} />
          )}
          {podeAcessar(user, "CLIENTES") && (
            <Item icone="✅" label="Tarefas" ativo={tela === "tarefas"} onClick={() => navegar("tarefas")} />
          )}
          {podeAcessar(user, "CLIENTES") && (
            <Item icone="⭐" label="Fidelidade" ativo={tela === "fidelidade"} onClick={() => navegar("fidelidade")} />
          )}
          {podeAcessar(user, "FORNECEDORES") && (
            <Item icone="🏭" label="Fornecedores" ativo={tela === "fornecedores"} onClick={() => navegar("fornecedores")} />
          )}
          {podeAcessar(user, "PRODUTOS") && (
            <Item icone="📦" label="Produtos" ativo={tela === "produtos"} onClick={() => navegar("produtos")} />
          )}
          {podeAcessar(user, "PRODUTOS") && (
            <Item icone="🏷️" label="Etiquetas" ativo={tela === "etiquetas"} onClick={() => navegar("etiquetas")} />
          )}
          {(podeAcessar(user, "CAIXA") || podeAcessar(user, "ESTOQUE") || podeAcessar(user, "COMPRAS") || podeAcessar(user, "ORCAMENTOS") || podeAcessar(user, "FINANCEIRO") || podeAcessar(user, "RELATORIOS")) && (
            <Secao>Operação</Secao>
          )}
          {podeAcessar(user, "CAIXA") && (
            <Item icone="💵" label="Caixa" ativo={tela === "caixa"} onClick={() => navegar("caixa")} />
          )}
          {podeAcessar(user, "ESTOQUE") && (
            <Item icone="🗃️" label="Estoque" ativo={tela === "estoque"} onClick={() => navegar("estoque")} />
          )}
          {podeAcessar(user, "COMPRAS") && (
            <Item icone="🛍️" label="Compras" ativo={tela === "compras"} onClick={() => navegar("compras")} />
          )}
          {podeAcessar(user, "ORCAMENTOS") && (
            <Item icone="📝" label="Orçamentos" ativo={tela === "orcamentos"} onClick={() => navegar("orcamentos")} />
          )}
          {podeAcessar(user, "OPORTUNIDADES") && (
            <Item icone="🎯" label="Funil de Vendas" ativo={tela === "funil"} onClick={() => navegar("funil")} />
          )}
          {podeAcessar(user, "AUTOMACOES") && (
            <Item icone="⚡" label="Automações" ativo={tela === "automacoes"} onClick={() => navegar("automacoes")} />
          )}
          {podeAcessar(user, "NPS") && (
            <Item icone="⭐" label="NPS" ativo={tela === "nps"} onClick={() => navegar("nps")} />
          )}
          {podeAcessar(user, "FINANCEIRO") && (
            <Item icone="💰" label="Financeiro" ativo={tela === "financeiro"} onClick={() => navegar("financeiro")} />
          )}
          {podeAcessar(user, "RELATORIOS") && (
            <Item icone="📑" label="Relatórios" ativo={tela === "relatorios"} onClick={() => navegar("relatorios")} />
          )}
          {podeAcessar(user, "COMISSOES") && (
            <Item icone="🏆" label="Comissões" ativo={tela === "comissoes"} onClick={() => navegar("comissoes")} />
          )}
          <Secao>Sistema</Secao>
          {user.role === "ADMIN" && (
            <Item icone="🧑‍💼" label="Funcionários" ativo={tela === "funcionarios"} onClick={() => navegar("funcionarios")} />
          )}
          {(user.role === "ADMIN" || user.role === "GERENTE") && (
            <Item icone="🏢" label="Empresa" ativo={tela === "empresa"} onClick={() => navegar("empresa")} />
          )}
          {(user.role === "ADMIN" || user.role === "GERENTE") && (
            <Item icone="🖨️" label="Impressora" ativo={tela === "impressora"} onClick={() => navegar("impressora")} />
          )}
          <Item icone="📋" label="Projeto" ativo={tela === "projeto"} onClick={() => navegar("projeto")} />
          {user.role === "ADMIN" && (
            <Item icone="📜" label="Logs" ativo={tela === "logs"} onClick={() => navegar("logs")} />
          )}
          {user.role === "ADMIN" && (
            <Item icone="🛡" label="Sistema" ativo={tela === "sistema"} onClick={() => navegar("sistema")} />
          )}
        </nav>

        {/* Card de usuário no rodapé */}
        <div ref={menuRef} style={{
          borderTop: `1px solid ${C.border}`, padding: 10, position: "relative",
        }}>
          <button
            onClick={() => setMenuUsuario(v => !v)}
            title={sidebarCollapsed ? `${user.nome} (${user.role})` : undefined}
            style={{
              background: C.card, border: `1px solid ${C.border}`, color: C.text,
              borderRadius: 10,
              padding: sidebarCollapsed ? "8px 0" : "8px 10px",
              display: "flex", alignItems: "center",
              justifyContent: sidebarCollapsed ? "center" : "flex-start",
              gap: sidebarCollapsed ? 0 : 10, cursor: "pointer", width: "100%",
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
              background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              color: C.white, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800,
            }}>
              {(user.nome || "?").charAt(0).toUpperCase()}
            </div>
            {!sidebarCollapsed && (
              <>
                <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                  <div style={{
                    color: C.white, fontSize: 13, fontWeight: 600, lineHeight: 1.1,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{user.nome}</div>
                  <div style={{ color: C.muted, fontSize: 11 }}>{user.role}</div>
                </div>
                <div style={{ color: C.muted, fontSize: 11 }}>▴</div>
              </>
            )}
          </button>

          {menuUsuario && (
            <div style={{
              position: "absolute", bottom: "calc(100% + 4px)", left: 10, right: 10,
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 70, overflow: "hidden",
            }}>
              <div style={{
                padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
                color: C.muted, fontSize: 11,
              }}>
                Logado como
                <div style={{
                  color: C.text, fontSize: 12, marginTop: 2, fontWeight: 600,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{user.email || user.nome}</div>
              </div>
              <button onClick={() => { setMenuUsuario(false); navegar("aparencia"); }} style={menuItem}>
                🎨 Aparência
              </button>
              <button onClick={() => { setMenuUsuario(false); setTrocarSenhaAberto(true); }} style={menuItem}>
                🔐 Trocar senha
              </button>
              {user.superAdmin && (
                <a
                  href="/admin-master"
                  style={{
                    ...menuItem,
                    display: "block", textDecoration: "none",
                    borderTop: `1px solid ${C.border}`,
                    color: C.yellow, fontWeight: 700,
                  }}
                >
                  👑 Admin Master
                </a>
              )}
              <button onClick={() => { setMenuUsuario(false); sair(); }} style={{ ...menuItem, color: C.text }}>
                <span style={{ color: C.red }}>↩ Sair</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Overlay clicável (mobile) */}
      <div
        className={`gp-overlay ${sidebarAberta ? "open" : ""}`}
        onClick={() => setSidebarAberta(false)}
      />

      {/* Conteúdo principal */}
      <main className="gp-content" style={{ marginLeft: sidebarLargura }}>
        {/* Top bar (mobile + alertas) */}
        <div style={{
          background: C.surface, borderBottom: `1px solid ${C.border}`,
          padding: "10px 18px", display: "flex", alignItems: "center", gap: 12,
          position: "sticky", top: 0, zIndex: 40,
        }}>
          <button
            className="gp-mobile-bar"
            onClick={() => setSidebarAberta(true)}
            aria-label="Abrir menu"
            style={{
              background: C.card, border: `1px solid ${C.border}`, color: C.text,
              borderRadius: 8, padding: "6px 10px", fontSize: 18, cursor: "pointer", lineHeight: 1,
            }}
          >☰</button>
          <div style={{ flex: 1, color: C.muted, fontSize: 12 }}>
            <span className="gp-mobile-bar" style={{ color: C.white, fontWeight: 700, fontSize: 14 }}>
              GestãoPRO
            </span>
          </div>
          <Alertas onNavegar={navegar} />
        </div>

        <div style={{ padding: "24px" }}>
          <Suspense fallback={<TelaCarregando alturaMin="60vh" />}>
          {tela === "dashboard" && (
            <Dashboard user={user} />
          )}
          {tela === "clientes" && (
            <>
              <PageHeader titulo="Clientes" subtitulo="Cadastro e gerenciamento de clientes" />
              <Clientes user={user} />
            </>
          )}
          {tela === "fornecedores" && (
            <>
              <PageHeader titulo="Fornecedores" subtitulo="Cadastro e gerenciamento de fornecedores" />
              <Fornecedores user={user} />
            </>
          )}
          {tela === "produtos" && (
            <>
              <PageHeader titulo="Produtos" subtitulo="Cadastro de produtos com preço, estoque e categorização" />
              <Produtos user={user} />
            </>
          )}
          {tela === "etiquetas" && (
            <>
              <PageHeader titulo="Etiquetas de Preço" subtitulo="Impressão em lote — selecione produtos por categoria e quantidade de cópias" />
              <Etiquetas />
            </>
          )}
          {tela === "estoque" && (
            <>
              <PageHeader titulo="Controle de Estoque" subtitulo="Histórico e movimentações (entrada, saída, ajuste)" />
              <Estoque user={user} />
            </>
          )}
          {tela === "compras" && (
            <>
              <PageHeader titulo="Compras" subtitulo="Registro de compras (gera entrada de estoque automaticamente)" />
              <Compras user={user} />
            </>
          )}
          {tela === "orcamentos" && (
            <>
              <PageHeader titulo="Orçamentos / Ordens de Serviço" subtitulo="Documento comercial pré-venda — vira venda quando aprovado e finalizado" />
              <Orcamentos user={user} />
            </>
          )}
          {tela === "funil" && (
            <Funil user={user} />
          )}
          {tela === "segmentos" && (
            <Segmentos user={user} />
          )}
          {tela === "automacoes" && (
            <Automacoes user={user} />
          )}
          {tela === "dashboardcrm" && (
            <DashboardCrm />
          )}
          {tela === "reativacao" && (
            <Reativacao user={user} />
          )}
          {tela === "nps" && (
            <Nps />
          )}
          {tela === "financeiro" && (
            <FinanceiroPage user={user} />
          )}
          {tela === "caixa" && (
            <>
              <PageHeader titulo="Caixa" subtitulo="Abertura, fechamento e extrato — controle do dinheiro físico no PDV" />
              <Caixa user={user} />
            </>
          )}
          {tela === "empresa" && (user.role === "ADMIN" || user.role === "GERENTE") && (
            <>
              <PageHeader titulo="Empresa" subtitulo="Identidade do tenant, dados fiscais e estatísticas" />
              <Empresa user={user} />
            </>
          )}
          {tela === "impressora" && (user.role === "ADMIN" || user.role === "GERENTE") && (
            <>
              <PageHeader titulo="Impressora" subtitulo="Configurações de impressão não-fiscal — cupons, recibos, sangrias e fechamento" />
              <ConfiguracoesImpressora user={user} />
            </>
          )}
          {tela === "relatorios" && (
            <>
              <PageHeader titulo="Relatórios" subtitulo="Relatórios analíticos com exportação em PDF" />
              <Relatorios />
            </>
          )}
          {tela === "tarefas" && (
            <>
              <PageHeader titulo="Tarefas" subtitulo="Follow-ups, lembretes e ações vinculadas a clientes" />
              <Tarefas user={user} />
            </>
          )}
          {tela === "fidelidade" && (
            <>
              <PageHeader titulo="Fidelidade" subtitulo="Programa de pontos — configuração e consulta por cliente" />
              <Fidelidade user={user} />
            </>
          )}
          {tela === "comissoes" && (
            <>
              <PageHeader titulo="Comissões" subtitulo="Configure como cada vendedor é remunerado por venda e meta" />
              <Comissoes user={user} />
            </>
          )}
          {tela === "funcionarios" && user.role === "ADMIN" && (
            <>
              <PageHeader titulo="Funcionários" subtitulo="Cadastro de funcionários e controle de acesso (Admin/Gerente/Vendedor)" />
              <Funcionarios user={user} />
            </>
          )}
          {tela === "projeto" && (
            <>
              <PageHeader titulo="Rastreador do Projeto" subtitulo="Acompanhe o progresso das etapas" />
              <Projeto />
            </>
          )}
          {tela === "aparencia" && (
            <Aparencia />
          )}
          {tela === "logs" && user.role === "ADMIN" && (
            <Logs />
          )}
          {tela === "sistema" && user.role === "ADMIN" && (
            <>
              <PageHeader titulo="Sistema" subtitulo="Operações administrativas e zona de perigo" />
              <Sistema
                user={user}
                onResetar={(resumo: any) => {
                  const total = Object.values(resumo?.removidos || {}).reduce((a: any, b: any) => a + b, 0);
                  alert(`✓ Sistema resetado com sucesso.\n\n${total} registros removidos em ${Object.keys(resumo?.removidos || {}).length} tabelas.\n\nRedirecionando para o Dashboard...`);
                  navegar(podeAcessar(user, "DASHBOARD") ? "dashboard" : "pdv");
                }}
              />
            </>
          )}
          </Suspense>
        </div>
      </main>

      {trocarSenhaAberto && (
        <Suspense fallback={null}>
          <TrocarSenhaModal onFechar={() => setTrocarSenhaAberto(false)} />
        </Suspense>
      )}
    </div>
  );
}

const menuItem: CSSProperties = {
  display: "block", width: "100%", textAlign: "left",
  background: "transparent", border: "none", color: C.text,
  padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
};

function NavItem({ icone, label, ativo, destaque, collapsed, onClick }: any) {
  const bg = ativo
    ? (destaque ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : C.accent + "22")
    : "transparent";
  const borda = !ativo && destaque ? `1px solid ${C.accent}55` : "none";
  const corTexto = ativo
    ? C.white
    : (destaque ? C.accent : C.text);

  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      style={{
        display: "flex", alignItems: "center",
        gap: collapsed ? 0 : 12,
        justifyContent: collapsed ? "center" : "flex-start",
        width: "100%",
        padding: collapsed ? "10px 0" : "10px 12px",
        borderRadius: 8, border: borda,
        background: bg, color: corTexto,
        fontWeight: ativo || destaque ? 700 : 500, fontSize: 13,
        cursor: "pointer", marginBottom: 4, textAlign: "left",
        boxShadow: ativo && destaque ? "0 4px 12px rgba(79,142,247,0.25)" : "none",
        transition: "background 0.15s ease",
        overflow: "hidden", whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { if (!ativo) e.currentTarget.style.background = C.card; }}
      onMouseLeave={e => { if (!ativo) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{icone}</span>
      {!collapsed && <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
    </button>
  );
}

function SecaoLabel({ children, collapsed }: any) {
  if (collapsed) {
    return <div style={{ height: 1, background: C.border, margin: "10px 12px 6px" }} />;
  }
  return (
    <div style={{
      color: C.muted, fontSize: 10, fontWeight: 700,
      textTransform: "uppercase", letterSpacing: 1,
      padding: "12px 12px 6px",
    }}>
      {children}
    </div>
  );
}

function PageHeader({ titulo, subtitulo }: any) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ color: C.white, fontSize: 22, fontWeight: 800 }}>{titulo}</div>
      <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{subtitulo}</div>
    </div>
  );
}
