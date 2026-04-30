import { useEffect, useState, useCallback, useMemo } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";


const fmtBRL = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export default function Compras({ user }) {
  const [compras, setCompras] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [filtroFornecedor, setFiltroFornecedor] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [fornecedores, setFornecedores] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [novoAberto, setNovoAberto] = useState(false);
  const [detalhe, setDetalhe] = useState(null);
  const [mensagem, setMensagem] = useState("");

  const podeCriar = user.role === "ADMIN" || user.role === "GERENTE";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.listarCompras({ fornecedorId: filtroFornecedor, dataInicio, dataFim });
      setCompras(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }, [filtroFornecedor, dataInicio, dataFim]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    api.listarFornecedores({ ativo: "true" }).then(setFornecedores).catch(() => {});
    api.listarProdutos({ ativo: "true" }).then(setProdutos).catch(() => {});
  }, []);

  function flash(t) {
    setMensagem(t);
    setTimeout(() => setMensagem(""), 3000);
  }

  async function abrirDetalhe(id) {
    try {
      const c = await api.obterCompra(id);
      setDetalhe(c);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filtroFornecedor} onChange={e => setFiltroFornecedor(e.target.value)} style={{
          flex: "1 1 240px", background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 13, cursor: "pointer",
        }}>
          <option value="">Todos os fornecedores</option>
          {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={inputCompacto} />
        <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={inputCompacto} />
        {(dataInicio || dataFim || filtroFornecedor) && (
          <button onClick={() => { setDataInicio(""); setDataFim(""); setFiltroFornecedor(""); }} style={{
            background: C.surface, border: `1px solid ${C.border}`, color: C.muted,
            borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer",
          }}>Limpar filtros</button>
        )}
        {podeCriar && (
          <button onClick={() => setNovoAberto(true)} style={{
            marginLeft: "auto",
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, border: "none", borderRadius: 8,
            padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}>
            + Nova Compra
          </button>
        )}
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
          display: "grid", gridTemplateColumns: "150px 90px 2fr 100px 130px 120px",
          padding: "12px 16px", background: C.surface,
          borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700,
          color: C.muted, textTransform: "uppercase", letterSpacing: 0.5,
        }}>
          <div>Data</div>
          <div>Nº</div>
          <div>Fornecedor</div>
          <div style={{ textAlign: "right" }}>Itens</div>
          <div style={{ textAlign: "right" }}>Total</div>
          <div style={{ textAlign: "right" }}>Ações</div>
        </div>

        {carregando ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Carregando...</div>
        ) : compras.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>Nenhuma compra encontrada.</div>
        ) : compras.map(c => (
          <div key={c.id} style={{
            display: "grid", gridTemplateColumns: "150px 90px 2fr 100px 130px 120px",
            padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
            alignItems: "center", fontSize: 13,
          }}>
            <div style={{ color: C.muted, fontSize: 12 }}>{fmtData(c.createdAt)}</div>
            <div style={{ color: C.white, fontFamily: "monospace", fontWeight: 700 }}>#{c.numero}</div>
            <div>
              <div style={{ color: C.white, fontWeight: 600 }}>{c.fornecedor?.nome || "—"}</div>
              {c.fornecedor?.cnpj && (
                <div style={{ color: C.muted, fontSize: 11 }}>{c.fornecedor.cnpj}</div>
              )}
            </div>
            <div style={{ textAlign: "right", color: C.text }}>{c._count?.itens ?? "—"}</div>
            <div style={{ textAlign: "right", color: C.green, fontWeight: 700, fontSize: 14 }}>{fmtBRL(c.total)}</div>
            <div style={{ textAlign: "right" }}>
              <button onClick={() => abrirDetalhe(c.id)} style={btnIcone(C.accent)}>Ver detalhes</button>
            </div>
          </div>
        ))}
      </div>

      {novoAberto && (
        <NovaCompraModal
          fornecedores={fornecedores}
          produtos={produtos}
          onCancelar={() => setNovoAberto(false)}
          onSalvar={(c) => {
            setNovoAberto(false);
            flash(`Compra #${c.numero} registrada — total ${fmtBRL(c.total)}`);
            carregar();
          }}
        />
      )}

      {detalhe && (
        <DetalheCompraModal compra={detalhe} onFechar={() => setDetalhe(null)} />
      )}
    </div>
  );
}

function NovaCompraModal({ fornecedores, produtos, onCancelar, onSalvar }) {
  const [fornecedorId, setFornecedorId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [itens, setItens] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const total = useMemo(
    () => itens.reduce((acc, it) => {
      const q = parseFloat(it.quantidade) || 0;
      const p = parseFloat(it.precoUnitario) || 0;
      return acc + q * p;
    }, 0),
    [itens]
  );

  function adicionarItem() {
    setItens([...itens, { produtoId: "", quantidade: "1", precoUnitario: "" }]);
  }

  function removerItem(idx) {
    setItens(itens.filter((_, i) => i !== idx));
  }

  function atualizarItem(idx, campo, valor) {
    const novos = [...itens];
    novos[idx] = { ...novos[idx], [campo]: valor };
    if (campo === "produtoId" && valor) {
      const p = produtos.find(x => x.id === valor);
      if (p && !novos[idx].precoUnitario) {
        novos[idx].precoUnitario = p.precoCusto != null ? String(p.precoCusto) : "";
      }
    }
    setItens(novos);
  }

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (!fornecedorId) { setErro("Selecione um fornecedor"); return; }
    if (itens.length === 0) { setErro("Adicione ao menos um item"); return; }
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      if (!it.produtoId) { setErro(`Item ${i + 1}: selecione o produto`); return; }
      const q = parseInt(it.quantidade, 10);
      if (!Number.isFinite(q) || q <= 0) { setErro(`Item ${i + 1}: quantidade inválida`); return; }
      const p = parseFloat(String(it.precoUnitario).replace(",", "."));
      if (!Number.isFinite(p) || p < 0) { setErro(`Item ${i + 1}: preço unitário inválido`); return; }
    }

    setSalvando(true);
    try {
      const c = await api.criarCompra({
        fornecedorId,
        observacoes,
        itens: itens.map(it => ({
          produtoId: it.produtoId,
          quantidade: it.quantidade,
          precoUnitario: it.precoUnitario,
        })),
      });
      onSalvar(c);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={modalOverlay}>
      <form onSubmit={salvar} onClick={e => e.stopPropagation()} style={{
        ...modalCard, maxWidth: 880,
      }}>
        <div style={modalHeader}>
          <div style={{ color: C.white, fontWeight: 700, fontSize: 18 }}>Nova Compra</div>
          <button type="button" onClick={onCancelar} style={btnFechar}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <Campo label="Fornecedor *">
            <select value={fornecedorId} onChange={e => setFornecedorId(e.target.value)} required style={inputStyle}>
              <option value="">— Selecione —</option>
              {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Observações">
            <input value={observacoes} onChange={e => setObservacoes(e.target.value)} style={inputStyle}
              placeholder="Nota fiscal, referência, etc." />
          </Campo>
        </div>

        <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: C.white, fontWeight: 700, fontSize: 14 }}>Itens da compra</div>
          <button type="button" onClick={adicionarItem} style={{
            background: C.accent, color: C.white, border: "none", borderRadius: 6,
            padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>+ Adicionar item</button>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "2.5fr 80px 130px 130px 40px",
            padding: "8px 12px", background: C.bg, borderBottom: `1px solid ${C.border}`,
            fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase",
          }}>
            <div>Produto</div>
            <div style={{ textAlign: "right" }}>Qtd</div>
            <div style={{ textAlign: "right" }}>Preço unit.</div>
            <div style={{ textAlign: "right" }}>Subtotal</div>
            <div></div>
          </div>
          {itens.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: C.muted, fontSize: 12 }}>
              Nenhum item ainda. Clique em "+ Adicionar item".
            </div>
          ) : itens.map((it, idx) => {
            const subtotal = (parseFloat(it.quantidade) || 0) * (parseFloat(it.precoUnitario) || 0);
            return (
              <div key={idx} style={{
                display: "grid", gridTemplateColumns: "2.5fr 80px 130px 130px 40px",
                padding: "8px 12px", borderBottom: `1px solid ${C.border}`,
                alignItems: "center", gap: 8,
              }}>
                <select value={it.produtoId} onChange={e => atualizarItem(idx, "produtoId", e.target.value)}
                  required style={{ ...inputStyle, padding: "6px 8px" }}>
                  <option value="">— Selecione —</option>
                  {produtos.map(p => (
                    <option key={p.id} value={p.id}>{p.codigo} — {p.nome}</option>
                  ))}
                </select>
                <input type="number" min="1" value={it.quantidade}
                  onChange={e => atualizarItem(idx, "quantidade", e.target.value)}
                  required style={{ ...inputStyle, padding: "6px 8px", textAlign: "right" }} />
                <input type="number" step="0.01" min="0" value={it.precoUnitario}
                  onChange={e => atualizarItem(idx, "precoUnitario", e.target.value)}
                  required style={{ ...inputStyle, padding: "6px 8px", textAlign: "right" }} />
                <div style={{ textAlign: "right", color: C.green, fontWeight: 600, fontSize: 13 }}>
                  {fmtBRL(subtotal)}
                </div>
                <button type="button" onClick={() => removerItem(idx)} style={{
                  background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red,
                  borderRadius: 6, padding: "4px 8px", fontSize: 14, cursor: "pointer",
                }} title="Remover">×</button>
              </div>
            );
          })}
        </div>

        <div style={{
          marginTop: 14, padding: "12px 16px", background: C.surface,
          border: `1px solid ${C.border}`, borderRadius: 10,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ color: C.muted, fontSize: 12, fontWeight: 600 }}>TOTAL DA COMPRA</div>
          <div style={{ color: C.green, fontSize: 22, fontWeight: 800 }}>{fmtBRL(total)}</div>
        </div>

        {erro && (
          <div style={{
            marginTop: 14, padding: "10px 12px", borderRadius: 8,
            background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
          }}>{erro}</div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button type="button" onClick={onCancelar} disabled={salvando} style={btnSecundario}>Cancelar</button>
          <button type="submit" disabled={salvando || itens.length === 0} style={{
            ...btnPrimario, opacity: itens.length === 0 ? 0.5 : 1,
          }}>
            {salvando ? "Registrando..." : "Registrar compra"}
          </button>
        </div>
        <div style={{ marginTop: 10, color: C.muted, fontSize: 11, textAlign: "right" }}>
          ⚠ Ao confirmar, o estoque dos produtos será incrementado automaticamente.
        </div>
      </form>
    </div>
  );
}

function DetalheCompraModal({ compra, onFechar }) {
  return (
    <div onClick={onFechar} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 720 }}>
        <div style={modalHeader}>
          <div>
            <div style={{ color: C.white, fontWeight: 700, fontSize: 18 }}>
              Compra #{compra.numero}
            </div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
              {fmtData(compra.createdAt)}
            </div>
          </div>
          <button type="button" onClick={onFechar} style={btnFechar}>×</button>
        </div>

        <div style={{
          padding: "12px 14px", background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 10, marginBottom: 16,
        }}>
          <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>FORNECEDOR</div>
          <div style={{ color: C.white, fontSize: 14, fontWeight: 600 }}>{compra.fornecedor?.nome}</div>
          {compra.fornecedor?.cnpj && (
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>CNPJ: {compra.fornecedor.cnpj}</div>
          )}
          {compra.observacoes && (
            <div style={{ color: C.text, fontSize: 12, marginTop: 8 }}>
              <span style={{ color: C.muted }}>Obs: </span>{compra.observacoes}
            </div>
          )}
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{
            display: "grid", gridTemplateColumns: "2.5fr 80px 130px 130px",
            padding: "10px 14px", background: C.bg, borderBottom: `1px solid ${C.border}`,
            fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase",
          }}>
            <div>Produto</div>
            <div style={{ textAlign: "right" }}>Qtd</div>
            <div style={{ textAlign: "right" }}>Preço unit.</div>
            <div style={{ textAlign: "right" }}>Subtotal</div>
          </div>
          {compra.itens?.map(it => (
            <div key={it.id} style={{
              display: "grid", gridTemplateColumns: "2.5fr 80px 130px 130px",
              padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
              alignItems: "center", fontSize: 13,
            }}>
              <div>
                <div style={{ color: C.white, fontWeight: 600 }}>{it.produto?.nome}</div>
                <div style={{ color: C.muted, fontFamily: "monospace", fontSize: 11 }}>{it.produto?.codigo}</div>
              </div>
              <div style={{ textAlign: "right", color: C.text }}>{it.quantidade} {it.produto?.unidade || ""}</div>
              <div style={{ textAlign: "right", color: C.text }}>{fmtBRL(it.precoUnitario)}</div>
              <div style={{ textAlign: "right", color: C.green, fontWeight: 600 }}>{fmtBRL(it.subtotal)}</div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 14, padding: "14px 16px", background: C.surface,
          border: `1px solid ${C.border}`, borderRadius: 10,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ color: C.muted, fontSize: 12, fontWeight: 600 }}>TOTAL</div>
          <div style={{ color: C.green, fontSize: 22, fontWeight: 800 }}>{fmtBRL(compra.total)}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onFechar} style={btnSecundario}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div>
      <label style={{ display: "block", color: "#64748b", fontSize: 12, marginBottom: 6, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", background: "#1a1d27", border: "1px solid #2e3354",
  borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 13,
  outline: "none", boxSizing: "border-box",
};

const inputCompacto = {
  background: "#1a1d27", border: "1px solid #2e3354", borderRadius: 8,
  padding: "9px 12px", color: "#e2e8f0", fontSize: 13, outline: "none",
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
