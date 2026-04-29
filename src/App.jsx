import { useState, useEffect } from "react";
import Login from "./Login.jsx";
import Clientes from "./Clientes.jsx";
import Fornecedores from "./Fornecedores.jsx";
import Produtos from "./Produtos.jsx";
import Estoque from "./Estoque.jsx";
import Compras from "./Compras.jsx";
import Funcionarios from "./Funcionarios.jsx";
import PDV from "./PDV.jsx";
import Projeto from "./Projeto.jsx";
import { getUser, getToken, clearSession, api } from "./lib/api.js";

const C = {
  bg: "#0f1117", surface: "#1a1d27", card: "#21253a",
  border: "#2e3354", accent: "#4f8ef7", text: "#e2e8f0",
  muted: "#64748b", white: "#ffffff", purple: "#7c3aed",
};

export default function App() {
  const [user, setUser] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [tela, setTela] = useState("pdv");

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
      {/* Header */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: "14px 24px", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 22 }}>🏪</div>
          <div>
            <div style={{ color: C.white, fontWeight: 800, fontSize: 16 }}>GestãoPRO</div>
            <div style={{ color: C.muted, fontSize: 11 }}>Sistema de Gestão + PDV</div>
          </div>
        </div>

        <nav style={{ display: "flex", gap: 6, marginLeft: 12, flexWrap: "wrap" }}>
          <NavBtn ativo={tela === "pdv"} destaque onClick={() => setTela("pdv")}>🛒 PDV</NavBtn>
          <NavBtn ativo={tela === "clientes"} onClick={() => setTela("clientes")}>👥 Clientes</NavBtn>
          <NavBtn ativo={tela === "fornecedores"} onClick={() => setTela("fornecedores")}>🏭 Fornecedores</NavBtn>
          <NavBtn ativo={tela === "produtos"} onClick={() => setTela("produtos")}>📦 Produtos</NavBtn>
          <NavBtn ativo={tela === "estoque"} onClick={() => setTela("estoque")}>🗃️ Estoque</NavBtn>
          <NavBtn ativo={tela === "compras"} onClick={() => setTela("compras")}>🛍️ Compras</NavBtn>
          {user.role === "ADMIN" && (
            <NavBtn ativo={tela === "funcionarios"} onClick={() => setTela("funcionarios")}>🧑‍💼 Funcionários</NavBtn>
          )}
          <NavBtn ativo={tela === "projeto"} onClick={() => setTela("projeto")}>📋 Projeto</NavBtn>
        </nav>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: C.white, fontSize: 13, fontWeight: 600 }}>{user.nome}</div>
            <div style={{ color: C.muted, fontSize: 11 }}>{user.role}</div>
          </div>
          <button onClick={sair} style={{
            background: C.card, border: `1px solid ${C.border}`, color: C.text,
            borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            Sair
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ padding: "24px" }}>
        {tela === "pdv" && (
          <>
            <PageHeader titulo="Ponto de Venda" subtitulo="Registro de vendas com baixa automática de estoque" />
            <PDV user={user} />
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
      </div>
    </div>
  );
}

function NavBtn({ ativo, destaque, onClick, children }) {
  const bg = ativo
    ? (destaque ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : C.accent)
    : (destaque ? C.surface : "transparent");
  return (
    <button onClick={onClick} style={{
      padding: "8px 16px", borderRadius: 8, border: destaque && !ativo ? `1px solid ${C.accent}55` : "none",
      cursor: "pointer", fontWeight: destaque ? 800 : 600, fontSize: 13,
      background: bg,
      color: ativo ? C.white : (destaque ? C.accent : C.muted),
    }}>
      {children}
    </button>
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
