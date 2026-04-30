import { useEffect, useState, useCallback } from "react";
import { api } from "./lib/api.js";

const C = {
  bg: "#0f1117", surface: "#1a1d27", card: "#21253a",
  border: "#2e3354", accent: "#4f8ef7", text: "#e2e8f0",
  muted: "#64748b", white: "#ffffff", green: "#22c55e",
  yellow: "#f59e0b", red: "#ef4444", purple: "#7c3aed",
};

const VAZIO = {
  nome: "", cnpj: "", email: "", telefone: "",
  endereco: "", cidade: "", estado: "", cep: "",
};

export default function Fornecedores({ user }) {
  const [fornecedores, setFornecedores] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [search, setSearch] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState("");
  const [mensagem, setMensagem] = useState("");

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE";
  const podeExcluir = user.role === "ADMIN";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.listarFornecedores({ search, ativo: filtroAtivo });
      setFornecedores(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [search, filtroAtivo]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  function flash(texto) {
    setMensagem(texto);
    setTimeout(() => setMensagem(""), 2500);
  }

  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    setErroForm("");
    setModalAberto(true);
  }

  function abrirEdicao(fornecedor) {
    setEditando(fornecedor);
    setForm({
      nome: fornecedor.nome || "",
      cnpj: fornecedor.cnpj || "",
      email: fornecedor.email || "",
      telefone: fornecedor.telefone || "",
      endereco: fornecedor.endereco || "",
      cidade: fornecedor.cidade || "",
      estado: fornecedor.estado || "",
      cep: fornecedor.cep || "",
    });
    setErroForm("");
    setModalAberto(true);
  }

  async function salvar(e) {
    e.preventDefault();
    setErroForm("");
    if (!form.nome.trim()) {
      setErroForm("Nome é obrigatório");
      return;
    }
    setSalvando(true);
    try {
      if (editando) {
        await api.atualizarFornecedor(editando.id, form);
        flash("Fornecedor atualizado");
      } else {
        await api.criarFornecedor(form);
        flash("Fornecedor criado");
      }
      setModalAberto(false);
      carregar();
    } catch (err) {
      setErroForm(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(fornecedor) {
    try {
      if (fornecedor.ativo) {
        if (!confirm(`Inativar "${fornecedor.nome}"?`)) return;
        await api.excluirFornecedor(fornecedor.id);
        flash("Fornecedor inativado");
      } else {
        await api.atualizarFornecedor(fornecedor.id, { ativo: true });
        flash("Fornecedor reativado");
      }
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  async function excluirPermanente(fornecedor) {
    if (!confirm(
      `Tem certeza que deseja excluir "${fornecedor.nome}"?\n\nEsta acao nao pode ser desfeita.`
    )) return;
    try {
      await api.excluirPermanenteFornecedor(fornecedor.id);
      flash("Fornecedor excluido");
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={{
        display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center",
      }}>
        <input
          placeholder="Buscar por nome, email ou CNPJ..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: "1 1 280px", background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14, outline: "none",
          }}
        />
        <select value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value)} style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: "10px 12px", color: C.text, fontSize: 13, cursor: "pointer",
        }}>
          <option value="">Todos</option>
          <option value="true">Apenas ativos</option>
          <option value="false">Apenas inativos</option>
        </select>
        <button onClick={abrirNovo} style={{
          background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
          color: C.white, border: "none", borderRadius: 8,
          padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
        }}>
          + Novo Fornecedor
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

      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 1.2fr 1.5fr 1fr 100px 250px",
          padding: "12px 16px", background: C.surface,
          borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700,
          color: C.muted, textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          <div>Nome</div>
          <div>CNPJ</div>
          <div>Email</div>
          <div>Telefone</div>
          <div>Status</div>
          <div style={{ textAlign: "right" }}>Ações</div>
        </div>

        {carregando ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Carregando...</div>
        ) : fornecedores.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Nenhum fornecedor encontrado.</div>
        ) : fornecedores.map(f => (
          <div key={f.id} style={{
            display: "grid", gridTemplateColumns: "2fr 1.2fr 1.5fr 1fr 100px 250px",
            padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
            alignItems: "center", fontSize: 13,
            opacity: f.ativo ? 1 : 0.55,
          }}>
            <div style={{ color: C.white, fontWeight: 600 }}>{f.nome}</div>
            <div style={{ color: C.text }}>{f.cnpj || "—"}</div>
            <div style={{ color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.email || "—"}</div>
            <div style={{ color: C.text }}>{f.telefone || "—"}</div>
            <div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                background: f.ativo ? C.green + "22" : C.muted + "33",
                color: f.ativo ? C.green : C.muted,
                border: `1px solid ${f.ativo ? C.green + "55" : C.muted + "55"}`,
              }}>{f.ativo ? "ATIVO" : "INATIVO"}</span>
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              {podeEditar && (
                <button onClick={() => abrirEdicao(f)} style={btnIcone(C.accent)}>Editar</button>
              )}
              {podeExcluir && (
                <button onClick={() => alternarAtivo(f)} style={btnIcone(f.ativo ? C.yellow : C.green)}>
                  {f.ativo ? "Inativar" : "Reativar"}
                </button>
              )}
              {podeExcluir && (
                <button onClick={() => excluirPermanente(f)} style={btnIconeSolido(C.red)} title="Excluir permanentemente">
                  🗑 Excluir
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {modalAberto && (
        <div onClick={() => !salvando && setModalAberto(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20, zIndex: 100,
        }}>
          <form onSubmit={salvar} onClick={e => e.stopPropagation()} style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
            width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto",
            padding: 24,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ color: C.white, fontWeight: 700, fontSize: 18 }}>
                {editando ? "Editar Fornecedor" : "Novo Fornecedor"}
              </div>
              <button type="button" onClick={() => setModalAberto(false)} style={{
                background: "transparent", border: "none", color: C.muted, fontSize: 20, cursor: "pointer",
              }}>×</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Campo label="Nome *" col2>
                <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                  required style={inputStyle} autoFocus />
              </Campo>
              <Campo label="CNPJ">
                <input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} style={inputStyle} />
              </Campo>
              <Campo label="Telefone">
                <input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} style={inputStyle} />
              </Campo>
              <Campo label="Email" col2>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle} />
              </Campo>
              <Campo label="Endereço" col2>
                <input value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} style={inputStyle} />
              </Campo>
              <Campo label="Cidade">
                <input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} style={inputStyle} />
              </Campo>
              <Campo label="Estado">
                <input value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value.toUpperCase().slice(0, 2) })}
                  maxLength={2} style={inputStyle} />
              </Campo>
              <Campo label="CEP" col2>
                <input value={form.cep} onChange={e => setForm({ ...form, cep: e.target.value })} style={inputStyle} />
              </Campo>
            </div>

            {erroForm && (
              <div style={{
                marginTop: 14, padding: "10px 12px", borderRadius: 8,
                background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
              }}>{erroForm}</div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" onClick={() => setModalAberto(false)} disabled={salvando} style={{
                background: C.surface, border: `1px solid ${C.border}`, color: C.text,
                borderRadius: 8, padding: "10px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}>Cancelar</button>
              <button type="submit" disabled={salvando} style={{
                background: salvando ? C.muted : `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                color: C.white, border: "none", borderRadius: 8,
                padding: "10px 22px", fontWeight: 700, fontSize: 13,
                cursor: salvando ? "default" : "pointer",
              }}>
                {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Criar fornecedor"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Campo({ label, col2, children }) {
  return (
    <div style={{ gridColumn: col2 ? "1 / -1" : "auto" }}>
      <label style={{ display: "block", color: "#64748b", fontSize: 12, marginBottom: 6, fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", background: "#1a1d27", border: "1px solid #2e3354",
  borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 13,
  outline: "none", boxSizing: "border-box",
};

function btnIcone(cor) {
  return {
    background: cor + "22", border: `1px solid ${cor}55`, color: cor,
    borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600,
    cursor: "pointer",
  };
}

function btnIconeSolido(cor) {
  return {
    background: cor, border: `1px solid ${cor}`, color: "#ffffff",
    borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 700,
    cursor: "pointer",
  };
}
