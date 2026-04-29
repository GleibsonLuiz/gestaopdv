import { useEffect, useState, useCallback } from "react";
import { api } from "./lib/api.js";
import MovimentarEstoqueModal from "./MovimentarEstoqueModal.jsx";

const C = {
  bg: "#0f1117", surface: "#1a1d27", card: "#21253a",
  border: "#2e3354", accent: "#4f8ef7", text: "#e2e8f0",
  muted: "#64748b", white: "#ffffff", green: "#22c55e",
  yellow: "#f59e0b", red: "#ef4444", purple: "#7c3aed",
};

const VAZIO = {
  codigo: "", nome: "", descricao: "",
  precoVenda: "", precoCusto: "",
  estoque: "0", estoqueMinimo: "0", unidade: "UN",
  categoriaId: "", fornecedorId: "",
};

const fmtBRL = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

export default function Produtos({ user }) {
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [search, setSearch] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroFornecedor, setFiltroFornecedor] = useState("");
  const [estoqueBaixo, setEstoqueBaixo] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [novaCategoria, setNovaCategoria] = useState("");
  const [modalEstoqueProduto, setModalEstoqueProduto] = useState(null);

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE";
  const podeExcluir = user.role === "ADMIN";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.listarProdutos({
        search,
        ativo: filtroAtivo,
        categoriaId: filtroCategoria,
        fornecedorId: filtroFornecedor,
        estoqueBaixo: estoqueBaixo ? "true" : "",
      });
      setProdutos(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [search, filtroAtivo, filtroCategoria, filtroFornecedor, estoqueBaixo]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  useEffect(() => {
    api.listarCategorias().then(setCategorias).catch(() => {});
    api.listarFornecedores({ ativo: "true" }).then(setFornecedores).catch(() => {});
  }, []);

  function flash(texto) {
    setMensagem(texto);
    setTimeout(() => setMensagem(""), 2500);
  }

  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    setErroForm("");
    setNovaCategoria("");
    setModalAberto(true);
  }

  function abrirEdicao(p) {
    setEditando(p);
    setForm({
      codigo: p.codigo || "",
      nome: p.nome || "",
      descricao: p.descricao || "",
      precoVenda: p.precoVenda != null ? String(p.precoVenda) : "",
      precoCusto: p.precoCusto != null ? String(p.precoCusto) : "",
      estoque: String(p.estoque ?? 0),
      estoqueMinimo: String(p.estoqueMinimo ?? 0),
      unidade: p.unidade || "UN",
      categoriaId: p.categoriaId || "",
      fornecedorId: p.fornecedorId || "",
    });
    setErroForm("");
    setNovaCategoria("");
    setModalAberto(true);
  }

  async function criarCategoriaInline() {
    const nome = novaCategoria.trim();
    if (!nome) return;
    try {
      const cat = await api.criarCategoria({ nome });
      setCategorias(prev => [...prev, cat].sort((a, b) => a.nome.localeCompare(b.nome)));
      setForm(f => ({ ...f, categoriaId: cat.id }));
      setNovaCategoria("");
    } catch (err) {
      alert(err.message);
    }
  }

  async function salvar(e) {
    e.preventDefault();
    setErroForm("");
    if (!form.codigo.trim()) { setErroForm("Código é obrigatório"); return; }
    if (!form.nome.trim()) { setErroForm("Nome é obrigatório"); return; }
    if (form.precoVenda === "" || Number.isNaN(Number(form.precoVenda))) {
      setErroForm("Preço de venda inválido"); return;
    }

    setSalvando(true);
    try {
      const payload = {
        codigo: form.codigo,
        nome: form.nome,
        descricao: form.descricao,
        precoVenda: form.precoVenda,
        precoCusto: form.precoCusto === "" ? null : form.precoCusto,
        estoque: form.estoque,
        estoqueMinimo: form.estoqueMinimo,
        unidade: form.unidade,
        categoriaId: form.categoriaId || null,
        fornecedorId: form.fornecedorId || null,
      };
      if (editando) {
        await api.atualizarProduto(editando.id, payload);
        flash("Produto atualizado");
      } else {
        await api.criarProduto(payload);
        flash("Produto criado");
      }
      setModalAberto(false);
      carregar();
    } catch (err) {
      setErroForm(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(p) {
    try {
      if (p.ativo) {
        if (!confirm(`Inativar "${p.nome}"?`)) return;
        await api.excluirProduto(p.id);
        flash("Produto inativado");
      } else {
        await api.atualizarProduto(p.id, { ativo: true });
        flash("Produto reativado");
      }
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Buscar por código ou nome..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            flex: "1 1 240px", background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14, outline: "none",
          }}
        />
        <select value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value)} style={selectStyle}>
          <option value="">Todos status</option>
          <option value="true">Apenas ativos</option>
          <option value="false">Apenas inativos</option>
        </select>
        <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={selectStyle}>
          <option value="">Todas categorias</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select value={filtroFornecedor} onChange={e => setFiltroFornecedor(e.target.value)} style={selectStyle}>
          <option value="">Todos fornecedores</option>
          {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <label style={{ color: C.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={estoqueBaixo} onChange={e => setEstoqueBaixo(e.target.checked)} />
          Estoque baixo
        </label>
        {podeEditar && (
          <button onClick={abrirNovo} style={{
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, border: "none", borderRadius: 8,
            padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>
            + Novo Produto
          </button>
        )}
      </div>

      {mensagem && (
        <div style={alertStyle(C.green)}>{mensagem}</div>
      )}
      {erro && (
        <div style={alertStyle(C.red)}>{erro}</div>
      )}

      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "100px 1.6fr 1.2fr 110px 110px 90px 100px 160px",
          padding: "12px 16px", background: C.surface,
          borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700,
          color: C.muted, textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          <div>Código</div>
          <div>Nome</div>
          <div>Categoria / Fornecedor</div>
          <div style={{ textAlign: "right" }}>Preço Venda</div>
          <div style={{ textAlign: "right" }}>Estoque</div>
          <div>Unid</div>
          <div>Status</div>
          <div style={{ textAlign: "right" }}>Ações</div>
        </div>

        {carregando ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Carregando...</div>
        ) : produtos.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Nenhum produto encontrado.</div>
        ) : produtos.map(p => {
          const baixo = p.estoque <= p.estoqueMinimo;
          return (
            <div key={p.id} style={{
              display: "grid", gridTemplateColumns: "100px 1.6fr 1.2fr 110px 110px 90px 100px 160px",
              padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
              alignItems: "center", fontSize: 13, opacity: p.ativo ? 1 : 0.55,
            }}>
              <div style={{ color: C.muted, fontFamily: "monospace", fontSize: 12 }}>{p.codigo}</div>
              <div>
                <div style={{ color: C.white, fontWeight: 600 }}>{p.nome}</div>
                {p.descricao && (
                  <div style={{ color: C.muted, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.descricao}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12 }}>
                <div style={{ color: C.text }}>{p.categoria?.nome || <span style={{ color: C.muted }}>—</span>}</div>
                <div style={{ color: C.muted, marginTop: 2 }}>{p.fornecedor?.nome || "—"}</div>
              </div>
              <div style={{ textAlign: "right", color: C.green, fontWeight: 600 }}>
                {fmtBRL(p.precoVenda)}
              </div>
              <div style={{ textAlign: "right", color: baixo ? C.red : C.text, fontWeight: baixo ? 700 : 500 }}>
                {p.estoque}
                {baixo && <span style={{ fontSize: 10, marginLeft: 6 }}>⚠</span>}
              </div>
              <div style={{ color: C.muted, fontSize: 12 }}>{p.unidade}</div>
              <div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                  background: p.ativo ? C.green + "22" : C.muted + "33",
                  color: p.ativo ? C.green : C.muted,
                  border: `1px solid ${p.ativo ? C.green + "55" : C.muted + "55"}`,
                }}>{p.ativo ? "ATIVO" : "INATIVO"}</span>
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                {podeEditar && (
                  <button onClick={() => setModalEstoqueProduto(p)} style={btnIcone(C.yellow)} title="Movimentar estoque">📊</button>
                )}
                {podeEditar && (
                  <button onClick={() => abrirEdicao(p)} style={btnIcone(C.accent)}>Editar</button>
                )}
                {podeExcluir && (
                  <button onClick={() => alternarAtivo(p)} style={btnIcone(p.ativo ? C.red : C.green)}>
                    {p.ativo ? "Inativar" : "Reativar"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modalEstoqueProduto && (
        <MovimentarEstoqueModal
          produtos={produtos}
          produtoInicial={modalEstoqueProduto}
          onCancelar={() => setModalEstoqueProduto(null)}
          onSalvar={(mov) => {
            setModalEstoqueProduto(null);
            flash(`Estoque atualizado: ${mov.estoqueAntes} → ${mov.estoqueDepois}`);
            carregar();
          }}
        />
      )}

      {modalAberto && (
        <div onClick={() => !salvando && setModalAberto(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20, zIndex: 100,
        }}>
          <form onSubmit={salvar} onClick={e => e.stopPropagation()} style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
            width: "100%", maxWidth: 720, maxHeight: "92vh", overflowY: "auto", padding: 24,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ color: C.white, fontWeight: 700, fontSize: 18 }}>
                {editando ? "Editar Produto" : "Novo Produto"}
              </div>
              <button type="button" onClick={() => setModalAberto(false)} style={{
                background: "transparent", border: "none", color: C.muted, fontSize: 20, cursor: "pointer",
              }}>×</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Campo label="Código *">
                <input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })}
                  required style={inputStyle} autoFocus />
              </Campo>
              <Campo label="Nome *" span={2}>
                <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })}
                  required style={inputStyle} />
              </Campo>
              <Campo label="Descrição" span={3}>
                <textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })}
                  rows={2} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
              </Campo>
              <Campo label="Preço de Venda *">
                <input type="number" step="0.01" min="0" value={form.precoVenda}
                  onChange={e => setForm({ ...form, precoVenda: e.target.value })}
                  required style={inputStyle} />
              </Campo>
              <Campo label="Preço de Custo">
                <input type="number" step="0.01" min="0" value={form.precoCusto}
                  onChange={e => setForm({ ...form, precoCusto: e.target.value })}
                  style={inputStyle} />
              </Campo>
              <Campo label="Unidade">
                <input value={form.unidade}
                  onChange={e => setForm({ ...form, unidade: e.target.value.toUpperCase().slice(0, 6) })}
                  style={inputStyle} placeholder="UN, KG, LT..." />
              </Campo>
              <Campo label="Estoque atual">
                <input type="number" min="0" value={form.estoque}
                  onChange={e => setForm({ ...form, estoque: e.target.value })}
                  style={inputStyle} />
              </Campo>
              <Campo label="Estoque mínimo">
                <input type="number" min="0" value={form.estoqueMinimo}
                  onChange={e => setForm({ ...form, estoqueMinimo: e.target.value })}
                  style={inputStyle} />
              </Campo>
              <div />
              <Campo label="Fornecedor" span={3}>
                <select value={form.fornecedorId}
                  onChange={e => setForm({ ...form, fornecedorId: e.target.value })}
                  style={inputStyle}>
                  <option value="">— Sem fornecedor —</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </Campo>
              <Campo label="Categoria" span={3}>
                <div style={{ display: "flex", gap: 8 }}>
                  <select value={form.categoriaId}
                    onChange={e => setForm({ ...form, categoriaId: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }}>
                    <option value="">— Sem categoria —</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input value={novaCategoria}
                    onChange={e => setNovaCategoria(e.target.value)}
                    placeholder="Nome da nova categoria"
                    style={{ ...inputStyle, flex: 1 }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); criarCategoriaInline(); } }}
                  />
                  <button type="button" onClick={criarCategoriaInline} disabled={!novaCategoria.trim()} style={{
                    background: novaCategoria.trim() ? C.accent : C.muted, color: C.white, border: "none",
                    borderRadius: 8, padding: "0 14px", fontWeight: 600, fontSize: 12,
                    cursor: novaCategoria.trim() ? "pointer" : "default",
                  }}>+ Adicionar</button>
                </div>
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
                {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Criar produto"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Campo({ label, span = 1, children }) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
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

const selectStyle = {
  background: "#1a1d27", border: "1px solid #2e3354", borderRadius: 8,
  padding: "10px 12px", color: "#e2e8f0", fontSize: 13, cursor: "pointer",
};

function btnIcone(cor) {
  return {
    background: cor + "22", border: `1px solid ${cor}55`, color: cor,
    borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600,
    cursor: "pointer",
  };
}

function alertStyle(cor) {
  return {
    marginBottom: 12, padding: "10px 14px", borderRadius: 8,
    background: cor + "22", border: `1px solid ${cor}55`, color: cor, fontSize: 13,
  };
}
