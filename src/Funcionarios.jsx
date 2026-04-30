import { useEffect, useState, useCallback } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";
import { MODULOS, permissoesPadrao, IDS_MODULOS } from "./lib/permissoes.js";


const ROLE_INFO = {
  ADMIN:    { label: "Admin",    cor: C.purple, icone: "★" },
  GERENTE:  { label: "Gerente",  cor: C.accent, icone: "♦" },
  VENDEDOR: { label: "Vendedor", cor: C.green,  icone: "●" },
};

const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
};

export default function Funcionarios({ user }) {
  const [funcionarios, setFuncionarios] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroRole, setFiltroRole] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState("");
  const [editando, setEditando] = useState(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const podeGerenciar = user.role === "ADMIN";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.listarFuncionarios({ search: busca, ativo: filtroAtivo, role: filtroRole });
      setFuncionarios(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [busca, filtroAtivo, filtroRole]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  function flash(msg) {
    setMensagem(msg);
    setTimeout(() => setMensagem(""), 2500);
  }

  async function excluir(f) {
    if (!confirm(`Desativar funcionário "${f.nome}"?`)) return;
    try {
      await api.excluirFuncionario(f.id);
      flash(`Funcionário "${f.nome}" desativado.`);
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  if (!podeGerenciar) {
    return (
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: 30, textAlign: "center", color: C.muted, fontSize: 14,
      }}>
        🔒 Apenas administradores podem gerenciar funcionários.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Buscar por nome ou email..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{
            flex: "1 1 240px", background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 13, outline: "none",
          }}
        />
        <select value={filtroRole} onChange={e => setFiltroRole(e.target.value)} style={selectCompacto}>
          <option value="">Todos os perfis</option>
          <option value="ADMIN">Admin</option>
          <option value="GERENTE">Gerente</option>
          <option value="VENDEDOR">Vendedor</option>
        </select>
        <select value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value)} style={selectCompacto}>
          <option value="">Todos os status</option>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
        </select>
        <button onClick={() => setNovoAberto(true)} style={{
          marginLeft: "auto",
          background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
          color: C.white, border: "none", borderRadius: 8,
          padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
        }}>
          + Novo Funcionário
        </button>
      </div>

      {mensagem && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 8,
          background: C.green + "22", border: `1px solid ${C.green}55`, color: C.green, fontSize: 13,
        }}>{mensagem}</div>
      )}
      {erro && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 8,
          background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
        }}>{erro}</div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 2fr 130px 110px 130px 160px",
          padding: "12px 16px", background: C.surface,
          borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700,
          color: C.muted, textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          <div>Nome</div>
          <div>Email</div>
          <div>Perfil</div>
          <div>Status</div>
          <div>Cadastrado em</div>
          <div style={{ textAlign: "right" }}>Ações</div>
        </div>

        {carregando ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Carregando...</div>
        ) : funcionarios.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Nenhum funcionário encontrado.</div>
        ) : funcionarios.map(f => {
          const r = ROLE_INFO[f.role] || ROLE_INFO.VENDEDOR;
          const ehVoce = f.id === user.id;
          return (
            <div key={f.id} style={{
              display: "grid", gridTemplateColumns: "2fr 2fr 130px 110px 130px 160px",
              padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
              alignItems: "center", fontSize: 13,
            }}>
              <div>
                <div style={{ color: C.white, fontWeight: 600 }}>
                  {f.nome}
                  {ehVoce && (
                    <span style={{
                      marginLeft: 8, fontSize: 10, fontWeight: 700,
                      background: C.accent + "22", color: C.accent, border: `1px solid ${C.accent}55`,
                      borderRadius: 4, padding: "2px 6px",
                    }}>VOCÊ</span>
                  )}
                </div>
              </div>
              <div style={{ color: C.muted, fontSize: 12 }}>{f.email}</div>
              <div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                  background: r.cor + "22", color: r.cor, border: `1px solid ${r.cor}55`,
                }}>{r.icone} {r.label}</span>
              </div>
              <div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                  background: f.ativo ? C.green + "22" : C.muted + "22",
                  color: f.ativo ? C.green : C.muted,
                  border: `1px solid ${(f.ativo ? C.green : C.muted)}55`,
                }}>{f.ativo ? "Ativo" : "Inativo"}</span>
              </div>
              <div style={{ color: C.muted, fontSize: 12 }}>{fmtData(f.createdAt)}</div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => setEditando(f)} style={btnIcone(C.accent)}>Editar</button>
                {!ehVoce && f.ativo && (
                  <button onClick={() => excluir(f)} style={btnIcone(C.red)}>Desativar</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(novoAberto || editando) && (
        <FuncionarioModal
          funcionario={editando}
          usuarioLogadoId={user.id}
          onCancelar={() => { setNovoAberto(false); setEditando(null); }}
          onSalvar={(f, criou) => {
            setNovoAberto(false);
            setEditando(null);
            flash(criou ? `Funcionário "${f.nome}" criado.` : `Funcionário "${f.nome}" atualizado.`);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function FuncionarioModal({ funcionario, usuarioLogadoId, onCancelar, onSalvar }) {
  const editando = !!funcionario;
  const [nome, setNome] = useState(funcionario?.nome || "");
  const [email, setEmail] = useState(funcionario?.email || "");
  const [senha, setSenha] = useState("");
  const [role, setRole] = useState(funcionario?.role || "VENDEDOR");
  const [ativo, setAtivo] = useState(funcionario?.ativo ?? true);
  const [permissoes, setPermissoes] = useState(() => {
    if (funcionario?.permissoes && Array.isArray(funcionario.permissoes)) {
      return new Set(funcionario.permissoes);
    }
    return new Set(permissoesPadrao(funcionario?.role || "VENDEDOR"));
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const ehVoce = funcionario?.id === usuarioLogadoId;
  const ehAdminEscolhido = role === "ADMIN";

  function alternarPermissao(id) {
    setPermissoes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function aplicarPreset(preset) {
    if (preset === "todos") setPermissoes(new Set(IDS_MODULOS));
    else if (preset === "nenhum") setPermissoes(new Set());
    else setPermissoes(new Set(permissoesPadrao(role)));
  }

  async function salvar(e) {
    e.preventDefault();
    setErro("");

    if (!nome.trim()) { setErro("Nome é obrigatório"); return; }
    if (!email.trim()) { setErro("Email é obrigatório"); return; }
    if (!editando && !senha) { setErro("Senha é obrigatória"); return; }
    if (senha && senha.length < 6) { setErro("Senha deve ter ao menos 6 caracteres"); return; }

    setSalvando(true);
    try {
      const payload = {
        nome: nome.trim().toUpperCase(),
        email: email.trim().toLowerCase(),
        role,
        ativo,
        permissoes: ehAdminEscolhido ? IDS_MODULOS : Array.from(permissoes),
      };
      if (senha) payload.senha = senha;

      let f;
      if (editando) {
        f = await api.atualizarFuncionario(funcionario.id, payload);
      } else {
        f = await api.criarFuncionario(payload);
      }
      onSalvar(f, !editando);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={modalOverlay}>
      <form onSubmit={salvar} onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 540 }}>
        <div style={modalHeader}>
          <div style={{ color: C.white, fontWeight: 700, fontSize: 18 }}>
            {editando ? `Editar funcionário` : "Novo funcionário"}
          </div>
          <button type="button" onClick={onCancelar} style={btnFechar}>×</button>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <Campo label="Nome *">
            <input value={nome} onChange={e => setNome(e.target.value)} required maxLength={100} style={inputStyle} />
          </Campo>
          <Campo label="Email *">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
          </Campo>
          <Campo label={editando ? "Nova senha (deixe em branco para manter)" : "Senha *"}>
            <input
              type="password" value={senha} onChange={e => setSenha(e.target.value)}
              minLength={editando ? undefined : 6}
              required={!editando}
              placeholder={editando ? "Não alterar" : "Mínimo 6 caracteres"}
              style={inputStyle}
            />
          </Campo>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Campo label="Perfil *">
              <select value={role} onChange={e => setRole(e.target.value)} style={inputStyle}
                disabled={ehVoce && funcionario?.role === "ADMIN"}>
                <option value="VENDEDOR">Vendedor</option>
                <option value="GERENTE">Gerente</option>
                <option value="ADMIN">Admin</option>
              </select>
              {ehVoce && funcionario?.role === "ADMIN" && (
                <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
                  Você não pode rebaixar seu próprio acesso
                </div>
              )}
            </Campo>
            <Campo label="Status">
              <select value={ativo ? "true" : "false"} onChange={e => setAtivo(e.target.value === "true")} style={inputStyle}
                disabled={ehVoce}>
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
              {ehVoce && (
                <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
                  Você não pode desativar a si mesmo
                </div>
              )}
            </Campo>
          </div>

          <PermissoesSecao
            permissoes={permissoes}
            ehAdmin={ehAdminEscolhido}
            onToggle={alternarPermissao}
            onPreset={aplicarPreset}
            role={role}
          />
        </div>

        {erro && (
          <div style={{
            marginTop: 14, padding: "10px 12px", borderRadius: 8,
            background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
          }}>{erro}</div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button type="button" onClick={onCancelar} disabled={salvando} style={btnSecundario}>Cancelar</button>
          <button type="submit" disabled={salvando} style={btnPrimario}>
            {salvando ? "Salvando..." : (editando ? "Salvar alterações" : "Criar funcionário")}
          </button>
        </div>
      </form>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", color: C.muted, fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

function PermissoesSecao({ permissoes, ehAdmin, onToggle, onPreset, role }) {
  const total = MODULOS.length;
  const marcadas = ehAdmin ? total : permissoes.size;

  return (
    <div style={{
      marginTop: 6, padding: 14, borderRadius: 10,
      background: C.surface, border: `1px solid ${C.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ color: C.white, fontSize: 13, fontWeight: 700 }}>
            🔐 Permissões de Acesso
          </div>
          <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
            {ehAdmin
              ? "Admin tem acesso a todos os módulos automaticamente."
              : `${marcadas} de ${total} módulos liberados.`}
          </div>
        </div>
        {!ehAdmin && (
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => onPreset("padrao")} style={btnPreset}>
              Padrão {role === "GERENTE" ? "gerente" : "vendedor"}
            </button>
            <button type="button" onClick={() => onPreset("todos")} style={btnPreset}>
              Marcar tudo
            </button>
            <button type="button" onClick={() => onPreset("nenhum")} style={btnPreset}>
              Limpar
            </button>
          </div>
        )}
      </div>

      <div style={{
        display: "grid", gap: 8,
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        opacity: ehAdmin ? 0.55 : 1,
        pointerEvents: ehAdmin ? "none" : "auto",
      }}>
        {MODULOS.map(m => {
          const ativa = ehAdmin || permissoes.has(m.id);
          const bloqueada = m.id === "FUNCIONARIOS" && !ehAdmin;
          return (
            <button
              type="button"
              key={m.id}
              onClick={() => !bloqueada && onToggle(m.id)}
              disabled={bloqueada}
              title={bloqueada ? "Funcionários é restrito a Admin" : ""}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 8, cursor: bloqueada ? "not-allowed" : "pointer",
                background: ativa ? C.accent + "1a" : C.card,
                border: `1px solid ${ativa ? C.accent + "66" : C.border}`,
                color: bloqueada ? C.muted : (ativa ? C.white : C.text),
                fontSize: 12, fontWeight: 600, textAlign: "left",
                transition: "background 0.15s ease, border-color 0.15s ease",
                opacity: bloqueada ? 0.5 : 1,
              }}
            >
              <SwitchVisual ativa={ativa} />
              <span style={{ fontSize: 14 }}>{m.icone}</span>
              <span style={{ flex: 1 }}>{m.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SwitchVisual({ ativa }) {
  return (
    <span style={{
      width: 30, height: 16, borderRadius: 999, position: "relative",
      background: ativa ? C.accent : C.border,
      transition: "background 0.15s ease", flexShrink: 0,
    }}>
      <span style={{
        position: "absolute", top: 2, left: ativa ? 16 : 2,
        width: 12, height: 12, borderRadius: "50%",
        background: C.white, transition: "left 0.15s ease",
      }} />
    </span>
  );
}

const btnPreset = {
  background: C.card, border: `1px solid ${C.border}`, color: C.muted,
  borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600,
  cursor: "pointer",
};

const inputStyle = {
  width: "100%", background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 13,
  outline: "none", boxSizing: "border-box",
};

const selectCompacto = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: "10px 12px", color: C.text, fontSize: 13, cursor: "pointer", outline: "none",
};

const modalOverlay = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 20, zIndex: 100,
};

const modalCard = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
  width: "100%", maxHeight: "92vh", overflowY: "auto", padding: 24,
};

const modalHeader = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  marginBottom: 18,
};

const btnFechar = {
  background: "transparent", border: "none", color: C.muted, fontSize: 22, cursor: "pointer",
};

const btnSecundario = {
  background: C.surface, border: `1px solid ${C.border}`, color: C.text,
  borderRadius: 8, padding: "10px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer",
};

const btnPrimario = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: C.white, border: "none", borderRadius: 8,
  padding: "10px 22px", fontWeight: 700, fontSize: 13, cursor: "pointer",
};

function btnIcone(cor) {
  return {
    background: cor + "22", border: `1px solid ${cor}55`, color: cor,
    borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600,
    cursor: "pointer",
  };
}
