import { useState, useEffect, useRef } from "react";
import { C } from "./lib/theme.js";
import Login from "./Login.jsx";
import Clientes from "./Clientes.jsx";
import Fornecedores from "./Fornecedores.jsx";
import Produtos from "./Produtos.jsx";
import Estoque from "./Estoque.jsx";
import Compras from "./Compras.jsx";
import Funcionarios from "./Funcionarios.jsx";
import Financeiro from "./Financeiro.jsx";
import Caixa from "./Caixa.jsx";
import PDV from "./PDV.jsx";
import Dashboard from "./Dashboard.jsx";
import Relatorios from "./Relatorios.jsx";
import Projeto from "./Projeto.jsx";
import Sistema from "./Sistema.jsx";
import TrocarSenhaModal from "./TrocarSenhaModal.jsx";
import AparenciaModal from "./AparenciaModal.jsx";
import Alertas from "./Alertas.jsx";
import { getUser, getToken, clearSession, api } from "./lib/api.js";
import { podeAcessar } from "./lib/permissoes.js";


const SIDEBAR_W_EXPANDIDA = 240;
const SIDEBAR_W_RECOLHIDA = 72;
const PREF_SIDEBAR_KEY = "gestao_sidebar_collapsed";

// Helper de persistencia. Hoje grava em localStorage. Quando houver
// PUT /auth/preferencias no backend, plugar aqui — manter localStorage como
// cache local (escrita otimista) e disparar o request em paralelo.
function salvarPreferenciaSidebar(collapsed) {
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

export default function App() {
  const [user, setUser] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [tela, setTela] = useState("pdv");
  const [menuUsuario, setMenuUsuario] = useState(false);
  const [trocarSenhaAberto, setTrocarSenhaAberto] = useState(false);
  const [aparenciaAberta, setAparenciaAberta] = useState(false);
  const [sidebarAberta, setSidebarAberta] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => lerPreferenciaSidebar());
  const menuRef = useRef(null);

  function alternarColapso() {
    setSidebarCollapsed((v) => {
      const novo = !v;
      salvarPreferenciaSidebar(novo);
      return novo;
    });
  }

  const sidebarLargura = sidebarCollapsed ? SIDEBAR_W_RECOLHIDA : SIDEBAR_W_EXPANDIDA;

  // Wrappers para injetar collapsed em todos os itens da sidebar.
  const Item = (props) => <NavItem {...props} collapsed={sidebarCollapsed} />;
  const Secao = (props) => <SecaoLabel {...props} collapsed={sidebarCollapsed} />;

  useEffect(() => {
    function onClickFora(e) {
      if (menuUsuario && menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuUsuario(false);
      }
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, [menuUsuario]);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") setSidebarAberta(false); }
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
    clearSession();
    setUser(null);
  }

  function navegar(t) {
    setTela(t);
    setSidebarAberta(false);
  }

  // Mapeia cada tela do app para o modulo de permissao correspondente.
  // "projeto" e ferramenta interna, fica liberada.
  const TELA_MODULO = {
    pdv: "PDV", dashboard: "DASHBOARD", caixa: "CAIXA", clientes: "CLIENTES",
    fornecedores: "FORNECEDORES", produtos: "PRODUTOS", estoque: "ESTOQUE",
    compras: "COMPRAS", financeiro: "FINANCEIRO", relatorios: "RELATORIOS",
    funcionarios: "FUNCIONARIOS",
  };

  function podeVer(t) {
    if (t === "projeto") return true;
    if (t === "sistema") return user?.role === "ADMIN";
    return podeAcessar(user, TELA_MODULO[t]);
  }

  // Se o usuario abriu uma tela sem permissao (ex: cache), redireciona para a primeira disponivel.
  useEffect(() => {
    if (!user) return;
    if (!podeVer(tela)) {
      const primeira = ["pdv","dashboard","caixa","clientes","fornecedores","produtos",
        "estoque","compras","financeiro","relatorios","funcionarios","projeto","sistema"].find(podeVer);
      if (primeira && primeira !== tela) setTela(primeira);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tela]);

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

  if (!user) return <Login onSuccess={setUser} />;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "'Segoe UI', sans-serif", color: C.text }}>
      <style>{ESTILO_RESPONSIVO}</style>

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
          {(podeAcessar(user, "CLIENTES") || podeAcessar(user, "FORNECEDORES") || podeAcessar(user, "PRODUTOS")) && (
            <Secao>Cadastros</Secao>
          )}
          {podeAcessar(user, "CLIENTES") && (
            <Item icone="👥" label="Clientes" ativo={tela === "clientes"} onClick={() => navegar("clientes")} />
          )}
          {podeAcessar(user, "FORNECEDORES") && (
            <Item icone="🏭" label="Fornecedores" ativo={tela === "fornecedores"} onClick={() => navegar("fornecedores")} />
          )}
          {podeAcessar(user, "PRODUTOS") && (
            <Item icone="📦" label="Produtos" ativo={tela === "produtos"} onClick={() => navegar("produtos")} />
          )}
          {(podeAcessar(user, "CAIXA") || podeAcessar(user, "ESTOQUE") || podeAcessar(user, "COMPRAS") || podeAcessar(user, "FINANCEIRO") || podeAcessar(user, "RELATORIOS")) && (
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
          {podeAcessar(user, "FINANCEIRO") && (
            <Item icone="💰" label="Financeiro" ativo={tela === "financeiro"} onClick={() => navegar("financeiro")} />
          )}
          {podeAcessar(user, "RELATORIOS") && (
            <Item icone="📑" label="Relatórios" ativo={tela === "relatorios"} onClick={() => navegar("relatorios")} />
          )}
          <Secao>Sistema</Secao>
          {user.role === "ADMIN" && (
            <Item icone="🧑‍💼" label="Funcionários" ativo={tela === "funcionarios"} onClick={() => navegar("funcionarios")} />
          )}
          <Item icone="📋" label="Projeto" ativo={tela === "projeto"} onClick={() => navegar("projeto")} />
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
              <button onClick={() => { setMenuUsuario(false); setAparenciaAberta(true); }} style={menuItem}>
                🎨 Aparência
              </button>
              <button onClick={() => { setMenuUsuario(false); setTrocarSenhaAberto(true); }} style={menuItem}>
                🔐 Trocar senha
              </button>
              <button onClick={() => { setMenuUsuario(false); sair(); }} style={{ ...menuItem, color: C.text }}>
                <span style={{ color: "#ef4444" }}>↩ Sair</span>
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
          {tela === "pdv" && (
            <>
              <PageHeader titulo="Ponto de Venda" subtitulo="Registro de vendas com baixa automática de estoque" />
              <PDV user={user} />
            </>
          )}
          {tela === "dashboard" && (
            <>
              <PageHeader titulo="Dashboard" subtitulo="Visão geral do negócio — vendas, estoque e financeiro" />
              <Dashboard user={user} />
            </>
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
          {tela === "financeiro" && (
            <>
              <PageHeader titulo="Financeiro" subtitulo="Contas a pagar e a receber — fluxo de caixa do negócio" />
              <Financeiro user={user} />
            </>
          )}
          {tela === "caixa" && (
            <>
              <PageHeader titulo="Caixa" subtitulo="Abertura, fechamento e extrato — controle do dinheiro físico no PDV" />
              <Caixa user={user} />
            </>
          )}
          {tela === "relatorios" && (
            <>
              <PageHeader titulo="Relatórios" subtitulo="Relatórios analíticos com exportação em PDF" />
              <Relatorios user={user} />
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
          {tela === "sistema" && user.role === "ADMIN" && (
            <>
              <PageHeader titulo="Sistema" subtitulo="Operações administrativas e zona de perigo" />
              <Sistema
                user={user}
                onResetar={(resumo) => {
                  const total = Object.values(resumo?.removidos || {}).reduce((a, b) => a + b, 0);
                  alert(`✓ Sistema resetado com sucesso.\n\n${total} registros removidos em ${Object.keys(resumo?.removidos || {}).length} tabelas.\n\nRedirecionando para o Dashboard...`);
                  navegar(podeAcessar(user, "DASHBOARD") ? "dashboard" : "pdv");
                }}
              />
            </>
          )}
        </div>
      </main>

      {trocarSenhaAberto && (
        <TrocarSenhaModal onFechar={() => setTrocarSenhaAberto(false)} />
      )}

      {aparenciaAberta && (
        <AparenciaModal onFechar={() => setAparenciaAberta(false)} />
      )}
    </div>
  );
}

const menuItem = {
  display: "block", width: "100%", textAlign: "left",
  background: "transparent", border: "none", color: C.text,
  padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
};

function NavItem({ icone, label, ativo, destaque, collapsed, onClick }) {
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

function SecaoLabel({ children, collapsed }) {
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

function PageHeader({ titulo, subtitulo }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ color: C.white, fontSize: 22, fontWeight: 800 }}>{titulo}</div>
      <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{subtitulo}</div>
    </div>
  );
}
