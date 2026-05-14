import { useEffect, useState, useMemo } from "react";
import { C } from "../lib/theme.js";
import { api } from "../lib/api.js";
import { VARIAVEIS_DISPONIVEIS, aplicarVariaveis } from "../lib/templates.js";

const TIPOS = [
  { id: "WHATSAPP", label: "WhatsApp", icone: "💬", cor: "#22c55e" },
  { id: "EMAIL",    label: "Email",    icone: "✉️", cor: "#7c3aed" },
  { id: "SMS",      label: "SMS",      icone: "📱", cor: "#4f8ef7" },
];

const CLIENTE_PREVIEW = {
  nome: "MARIA SILVA SANTOS",
  telefone: "(11) 99999-9999",
  email: "maria@exemplo.com.br",
  cidade: "SAO PAULO",
  estado: "SP",
  rfm: { ultimaCompra: "2026-04-10", monetario: 1850.50, recenciaDias: 34 },
  kpis: { valorInadimplente: 0 },
};

export default function ModalGerirTemplates({ onFechar, podeEditar, podeExcluir }) {
  const [templates, setTemplates] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(null);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      setTemplates(await api.listarTemplates());
    } catch (e) {
      setErro(e.message || "Erro ao carregar templates");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape" && !editando) onFechar(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar, editando]);

  async function excluir(t) {
    if (!confirm(`Excluir template "${t.nome}"?`)) return;
    try {
      await api.excluirTemplate(t.id);
      await carregar();
    } catch (e) {
      alert(e.message || "Erro ao excluir");
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !editando) onFechar(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
      }}
    >
      <div style={{
        background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`,
        width: "100%", maxWidth: 760, maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: C.white, fontSize: 16, fontWeight: 700 }}>📨 Templates de Mensagem</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
              Modelos prontos para WhatsApp, Email e SMS com variáveis automáticas
            </div>
          </div>
          <button onClick={onFechar} style={{
            background: "transparent", color: C.muted, border: "none",
            fontSize: 22, cursor: "pointer", padding: 4,
          }}>×</button>
        </div>

        {editando ? (
          <EditorTemplate
            template={editando}
            onCancelar={() => setEditando(null)}
            onSalvo={async () => { setEditando(null); await carregar(); }}
          />
        ) : (
          <>
            <div style={{ padding: 20 }}>
              {erro && (
                <div style={{ background: C.red + "22", color: C.red, padding: "8px 12px", borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
                  {erro}
                </div>
              )}

              {podeEditar && (
                <button
                  onClick={() => setEditando({ nome: "", tipo: "WHATSAPP", assunto: "", corpo: "", ativo: true, ordem: 0 })}
                  style={{
                    background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                    color: C.white, border: "none", padding: "8px 18px",
                    borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700, marginBottom: 16,
                  }}
                >+ Novo template</button>
              )}

              {carregando ? (
                <div style={{ color: C.muted, padding: 20, textAlign: "center" }}>Carregando...</div>
              ) : templates.length === 0 ? (
                <div style={{ color: C.muted, padding: 30, textAlign: "center", fontSize: 13 }}>
                  Nenhum template cadastrado. Crie o primeiro para usar mensagens rápidas no WhatsApp e Email.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {templates.map((t) => {
                    const tipo = TIPOS.find((x) => x.id === t.tipo);
                    return (
                      <div key={t.id} style={{
                        background: C.bg, border: `1px solid ${C.border}`,
                        borderLeft: `3px solid ${tipo.cor}`,
                        borderRadius: 6, padding: "10px 14px",
                        display: "flex", alignItems: "center", gap: 12, opacity: t.ativo ? 1 : 0.5,
                      }}>
                        <span style={{
                          background: tipo.cor + "22", color: tipo.cor,
                          padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                          display: "inline-flex", alignItems: "center", gap: 4,
                        }}>{tipo.icone} {tipo.label}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ color: C.white, fontWeight: 600, fontSize: 13 }}>
                            {t.nome} {!t.ativo && <span style={{ color: C.muted, fontSize: 10 }}>(inativo)</span>}
                          </div>
                          <div style={{ color: C.muted, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t.corpo}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          {podeEditar && (
                            <button
                              onClick={() => setEditando(t)}
                              style={btnAcao(C.accent)}
                            >Editar</button>
                          )}
                          {podeExcluir && (
                            <button
                              onClick={() => excluir(t)}
                              style={btnAcao(C.red)}
                            >🗑</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={onFechar}
                style={{
                  background: C.accent, color: C.white, border: "none",
                  padding: "8px 22px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700,
                }}
              >Fechar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============ EDITOR DE TEMPLATE ============

function EditorTemplate({ template, onCancelar, onSalvo }) {
  const ehNovo = !template.id;
  const [form, setForm] = useState(template);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function inserirVariavel(chave) {
    const placeholder = `{{${chave}}}`;
    setForm((f) => ({ ...f, corpo: (f.corpo || "") + placeholder }));
  }

  const preview = useMemo(() => {
    return {
      assunto: aplicarVariaveis(form.assunto || "", CLIENTE_PREVIEW),
      corpo: aplicarVariaveis(form.corpo || "", CLIENTE_PREVIEW),
    };
  }, [form.assunto, form.corpo]);

  async function salvar() {
    setErro("");
    if (!form.nome.trim()) return setErro("Nome é obrigatório");
    if (!form.corpo.trim()) return setErro("Corpo é obrigatório");
    if (form.tipo === "EMAIL" && !(form.assunto || "").trim()) return setErro("Assunto é obrigatório para Email");

    setSalvando(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        tipo: form.tipo,
        assunto: form.assunto || null,
        corpo: form.corpo.trim(),
        ativo: form.ativo,
        ordem: form.ordem || 0,
      };
      if (ehNovo) await api.criarTemplate(payload);
      else await api.atualizarTemplate(form.id, payload);
      await onSalvo();
    } catch (e) {
      setErro(e.message || "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  const tipoCfg = TIPOS.find((t) => t.id === form.tipo);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, fontWeight: 600 }}>
        {ehNovo ? "Novo template" : `Editando: ${template.nome}`}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <Campo label="Nome *">
          <input
            value={form.nome}
            onChange={(e) => set("nome", e.target.value)}
            placeholder="Ex: Cobranca amigavel"
            style={inputModal()}
            autoFocus
          />
        </Campo>
        <Campo label="Canal *">
          <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)} style={inputModal()}>
            {TIPOS.map((t) => (
              <option key={t.id} value={t.id}>{t.icone} {t.label}</option>
            ))}
          </select>
        </Campo>
      </div>

      {form.tipo === "EMAIL" && (
        <Campo label="Assunto *">
          <input
            value={form.assunto || ""}
            onChange={(e) => set("assunto", e.target.value)}
            placeholder="Ex: Olá {{primeiroNome}}, sentimos sua falta!"
            style={inputModal()}
          />
        </Campo>
      )}

      <Campo label="Corpo da mensagem *">
        <textarea
          value={form.corpo}
          onChange={(e) => set("corpo", e.target.value)}
          rows={6}
          placeholder={`Olá {{primeiroNome}}, tudo bem?\nNotamos que sua última compra foi em {{ultimaCompra}}. Que tal aproveitar nossa promoção?`}
          style={{ ...inputModal(), resize: "vertical", minHeight: 120, fontFamily: "monospace", fontSize: 12 }}
        />
      </Campo>

      <div style={{ marginBottom: 14 }}>
        <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          Variáveis disponíveis (clique para inserir)
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {VARIAVEIS_DISPONIVEIS.map((v) => (
            <button
              key={v.chave}
              type="button"
              onClick={() => inserirVariavel(v.chave)}
              title={v.desc}
              style={{
                background: C.bg, color: C.accent, border: `1px solid ${C.border}`,
                padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontSize: 10,
                fontFamily: "monospace",
              }}
            >{`{{${v.chave}}}`}</button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          Preview (com cliente exemplo)
        </div>
        <div style={{ background: C.bg, border: `1px dashed ${tipoCfg.cor}66`, borderRadius: 6, padding: 12 }}>
          {form.tipo === "EMAIL" && preview.assunto && (
            <div style={{ color: C.white, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
              {preview.assunto}
            </div>
          )}
          <div style={{ color: C.text, fontSize: 12, whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
            {preview.corpo || <em style={{ color: C.muted }}>(vazio)</em>}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: C.text, fontSize: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.ativo}
            onChange={(e) => set("ativo", e.target.checked)}
            style={{ accentColor: C.accent }}
          />
          Template ativo
        </label>
        <Campo label="Ordem">
          <input
            type="number"
            value={form.ordem || 0}
            onChange={(e) => set("ordem", parseInt(e.target.value, 10) || 0)}
            style={{ ...inputModal(), width: 80 }}
          />
        </Campo>
      </div>

      {erro && (
        <div style={{ background: C.red + "22", color: C.red, padding: "8px 12px", borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
          {erro}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          onClick={onCancelar}
          disabled={salvando}
          style={{
            background: "transparent", color: C.muted, border: `1px solid ${C.border}`,
            padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 13,
          }}
        >Cancelar</button>
        <button
          onClick={salvar}
          disabled={salvando}
          style={{
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, border: "none", padding: "8px 22px",
            borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700,
          }}
        >{salvando ? "Salvando..." : (ehNovo ? "Criar" : "Salvar")}</button>
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div>
      <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 600 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function inputModal() {
  return {
    width: "100%", boxSizing: "border-box",
    background: C.bg, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
    outline: "none",
  };
}

function btnAcao(cor) {
  return {
    background: "transparent", color: cor, border: `1px solid ${cor}44`,
    padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11,
  };
}
