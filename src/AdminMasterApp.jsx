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
function Painel({ user, onSair }) {
  const [estatisticas, setEstatisticas] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [modalCriar, setModalCriar] = useState(false);

  async function carregar() {
    setCarregando(true); setErro("");
    try {
      const [est, lista] = await Promise.all([
        api.adminMasterEstatisticas(),
        api.adminMasterListarEmpresas(),
      ]);
      setEstatisticas(est);
      setEmpresas(lista.empresas || []);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function toggleAtivo(empresa) {
    if (!confirm(`${empresa.ativo ? "Desativar" : "Ativar"} a empresa "${empresa.nome}"?\n${empresa.ativo ? "Users dela ficam sem login." : ""}`)) return;
    try {
      await api.adminMasterAlterarStatus(empresa.id, !empresa.ativo);
      await carregar();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  }

  return (
    <Tela>
      {/* Header */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 16, marginBottom: 18,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 10,
      }}>
        <div>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
          }}>
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
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={carregar} disabled={carregando} style={btnSecundario}>
            🔄 {carregando ? "Atualizando..." : "Atualizar"}
          </button>
          <a href="/" style={{ ...btnSecundario, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            Sistema normal →
          </a>
          <button onClick={onSair} style={btnSecundario}>Sair</button>
        </div>
      </div>

      {erro && (
        <div style={{
          background: C.red + "22", border: `1px solid ${C.red}55`,
          color: C.red, borderRadius: 10, padding: "10px 14px", marginBottom: 16,
        }}>{erro}</div>
      )}

      {/* KPIs */}
      {estatisticas && (
        <div style={{
          display: "grid", gap: 10, marginBottom: 18,
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
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
              borderRadius: 10, padding: "12px 14px", position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: k.cor }} />
              <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {k.rotulo}
              </div>
              <div style={{ color: k.cor, fontSize: 20, fontWeight: 800, marginTop: 4 }}>
                {k.valor}
              </div>
              {k.hint && (
                <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>{k.hint}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lista de empresas */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 12, overflow: "hidden",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>
            Empresas cadastradas ({empresas.length})
          </div>
          <button onClick={() => setModalCriar(true)} style={{
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, border: "none", borderRadius: 8,
            padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer",
          }}>+ Nova empresa</button>
        </div>

        {empresas.length === 0 && !carregando ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>
            Nenhuma empresa cadastrada ainda.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.surface }}>
                  {["Empresa", "CNPJ", "Status", "Users", "Clientes", "Produtos", "Vendas", "Faturamento", "Criada em", "Ações"].map((h, i) => (
                    <th key={i} style={{
                      padding: "9px 12px", textAlign: i >= 3 && i <= 7 ? "right" : "left",
                      color: C.muted, fontSize: 10, fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: 0.5,
                      borderBottom: `1px solid ${C.border}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {empresas.map(e => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}55` }}>
                    <td style={{ padding: "9px 12px", color: C.text, fontWeight: 600 }}>{e.nome}</td>
                    <td style={{ padding: "9px 12px", color: C.muted, fontFamily: "monospace", fontSize: 11 }}>
                      {e.cnpj ? mascararCnpj(e.cnpj) : "—"}
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: 10,
                        fontSize: 10, fontWeight: 700,
                        background: e.ativo ? C.green + "33" : C.red + "33",
                        color: e.ativo ? C.green : C.red,
                      }}>{e.ativo ? "● ATIVA" : "● INATIVA"}</span>
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "right", color: C.text }}>{fmtNum(e.estatisticas.usuarios)}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", color: C.text }}>{fmtNum(e.estatisticas.clientes)}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", color: C.text }}>{fmtNum(e.estatisticas.produtos)}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", color: C.text }}>{fmtNum(e.estatisticas.vendas)}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", color: C.green, fontWeight: 600 }}>
                      {fmtBRL(e.estatisticas.faturamentoTotal)}
                    </td>
                    <td style={{ padding: "9px 12px", color: C.muted }}>{fmtData(e.criadaEm)}</td>
                    <td style={{ padding: "9px 12px" }}>
                      <button onClick={() => toggleAtivo(e)} style={{
                        background: e.ativo ? C.red + "22" : C.green + "22",
                        color: e.ativo ? C.red : C.green,
                        border: `1px solid ${e.ativo ? C.red : C.green}55`,
                        borderRadius: 6, padding: "4px 10px", fontWeight: 700, fontSize: 11,
                        cursor: "pointer", whiteSpace: "nowrap",
                      }}>{e.ativo ? "Desativar" : "Ativar"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalCriar && (
        <ModalCriarEmpresa
          onCancelar={() => setModalCriar(false)}
          onCriada={() => { setModalCriar(false); carregar(); }}
        />
      )}
    </Tela>
  );
}

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
