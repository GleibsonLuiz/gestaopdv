import { useEffect, useRef, useState } from "react";
import { C } from "./lib/theme.js";
import { api, BASE_URL } from "./lib/api.js";

const VAZIO = {
  razaoSocial: "",
  nomeFantasia: "",
  cnpj: "",
  inscEstadual: "",
  telefone: "",
  email: "",
  endereco: "",
  numero: "",
  bairro: "",
  cidade: "",
  estado: "",
  cep: "",
  observacoes: "",
};

export function urlLogotipo(logotipo) {
  if (!logotipo) return null;
  if (/^https?:\/\//i.test(logotipo)) return logotipo;
  return `${BASE_URL}${logotipo}`;
}

export default function Configuracoes({ user }) {
  const [form, setForm] = useState(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [logotipoAtual, setLogotipoAtual] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const inputLogoRef = useRef(null);

  const ehAdmin = user.role === "ADMIN";

  useEffect(() => {
    let ativo = true;
    api.obterConfiguracao()
      .then(cfg => {
        if (!ativo || !cfg) return;
        setForm({
          razaoSocial: cfg.razaoSocial || "",
          nomeFantasia: cfg.nomeFantasia || "",
          cnpj: cfg.cnpj || "",
          inscEstadual: cfg.inscEstadual || "",
          telefone: cfg.telefone || "",
          email: cfg.email || "",
          endereco: cfg.endereco || "",
          numero: cfg.numero || "",
          bairro: cfg.bairro || "",
          cidade: cfg.cidade || "",
          estado: cfg.estado || "",
          cep: cfg.cep || "",
          observacoes: cfg.observacoes || "",
        });
        setLogotipoAtual(cfg.logotipo || null);
        setLogoPreview(cfg.logotipo ? urlLogotipo(cfg.logotipo) : null);
      })
      .catch(err => setErro(err.message))
      .finally(() => setCarregando(false));
    return () => { ativo = false; };
  }, []);

  function flash(t) {
    setMensagem(t);
    setTimeout(() => setMensagem(""), 2500);
  }

  function escolherLogo(file) {
    if (!file) return;
    if (!/^image\/(jpe?g|png|webp|svg\+xml)$/i.test(file.type)) {
      setErro("Apenas JPG, PNG, WEBP ou SVG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErro("Logotipo maior que 2MB.");
      return;
    }
    setErro("");
    setLogoFile(file);
    setLogoPreview(prev => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  async function removerLogoAtual() {
    if (!logotipoAtual) {
      // Apenas limpa o preview local sem chamar backend.
      if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
      setLogoFile(null);
      setLogoPreview(null);
      return;
    }
    if (!confirm("Remover logotipo atual?")) return;
    try {
      await api.excluirLogotipo();
      setLogotipoAtual(null);
      setLogoFile(null);
      if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
      setLogoPreview(null);
      if (inputLogoRef.current) inputLogoRef.current.value = "";
      flash("Logotipo removido");
    } catch (err) {
      setErro(err.message);
    }
  }

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (!form.razaoSocial.trim()) { setErro("Razão social é obrigatória"); return; }
    setSalvando(true);
    try {
      await api.salvarConfiguracao(form);
      // Logo: upload separado se houver arquivo selecionado.
      if (logoFile) {
        try {
          const cfg = await api.enviarLogotipo(logoFile);
          setLogotipoAtual(cfg.logotipo);
          setLogoFile(null);
          if (inputLogoRef.current) inputLogoRef.current.value = "";
        } catch (errLogo) {
          flash(`Dados salvos, mas o logotipo falhou: ${errLogo.message}`);
          setSalvando(false);
          return;
        }
      }
      flash("Configurações salvas");
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <div style={{ padding: 30, textAlign: "center", color: C.muted }}>Carregando…</div>;
  }

  return (
    <div>
      {mensagem && <div style={alertStyle(C.green)}>{mensagem}</div>}
      {erro && <div style={alertStyle(C.red)}>{erro}</div>}

      {!ehAdmin && (
        <div style={alertStyle(C.yellow)}>
          🔒 Apenas o administrador pode editar os dados da empresa. Você está vendo em modo leitura.
        </div>
      )}

      <form onSubmit={salvar}>
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 20 }}>
          {/* COLUNA ESQUERDA: LOGO */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: 16, display: "flex", flexDirection: "column", gap: 10,
            alignItems: "center",
          }}>
            <div style={{ color: C.muted, fontSize: 11, fontWeight: 700, letterSpacing: 0.4 }}>
              LOGOTIPO
            </div>
            <div
              onClick={() => ehAdmin && inputLogoRef.current?.click()}
              style={{
                width: 168, height: 168, borderRadius: 12,
                background: C.surface, border: `2px dashed ${C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: ehAdmin ? "pointer" : "default",
                overflow: "hidden",
              }}>
              {logoPreview ? (
                <img src={logoPreview} alt="logo"
                  style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: 10 }}>
                  <div style={{ fontSize: 32 }}>🖼️</div>
                  {ehAdmin ? "Clique para enviar" : "Sem logotipo"}
                </div>
              )}
            </div>
            {ehAdmin && (
              <>
                <input ref={inputLogoRef} type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  onChange={e => escolherLogo(e.target.files?.[0])}
                  style={{ display: "none" }} />
                <button type="button" onClick={() => inputLogoRef.current?.click()}
                  style={btnSecundario}>
                  {logoPreview ? "Trocar" : "Escolher arquivo"}
                </button>
                {logoPreview && (
                  <button type="button" onClick={removerLogoAtual} style={btnPerigo}>
                    Remover
                  </button>
                )}
                <div style={{ color: C.muted, fontSize: 10, textAlign: "center", lineHeight: 1.4 }}>
                  PNG / JPG / WEBP / SVG<br/>max 2 MB
                </div>
              </>
            )}
          </div>

          {/* COLUNA DIREITA: FORMULARIO */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20,
          }}>
            <Secao titulo="Identificação">
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <Campo label="Razão social *">
                  <input value={form.razaoSocial}
                    onChange={e => setForm(f => ({ ...f, razaoSocial: e.target.value.toUpperCase() }))}
                    disabled={!ehAdmin} required style={input(ehAdmin)} />
                </Campo>
                <Campo label="CNPJ">
                  <input value={form.cnpj}
                    onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))}
                    disabled={!ehAdmin} placeholder="00.000.000/0000-00"
                    style={input(ehAdmin)} />
                </Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <Campo label="Nome fantasia">
                  <input value={form.nomeFantasia}
                    onChange={e => setForm(f => ({ ...f, nomeFantasia: e.target.value.toUpperCase() }))}
                    disabled={!ehAdmin} style={input(ehAdmin)} />
                </Campo>
                <Campo label="Inscrição estadual">
                  <input value={form.inscEstadual}
                    onChange={e => setForm(f => ({ ...f, inscEstadual: e.target.value }))}
                    disabled={!ehAdmin} placeholder="Opcional" style={input(ehAdmin)} />
                </Campo>
              </div>
            </Secao>

            <Secao titulo="Contato">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
                <Campo label="Telefone">
                  <input value={form.telefone}
                    onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                    disabled={!ehAdmin} placeholder="(00) 00000-0000"
                    style={input(ehAdmin)} />
                </Campo>
                <Campo label="E-mail">
                  <input type="email" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    disabled={!ehAdmin} style={input(ehAdmin)} />
                </Campo>
              </div>
            </Secao>

            <Secao titulo="Endereço">
              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr 2fr", gap: 12 }}>
                <Campo label="Logradouro">
                  <input value={form.endereco}
                    onChange={e => setForm(f => ({ ...f, endereco: e.target.value.toUpperCase() }))}
                    disabled={!ehAdmin} style={input(ehAdmin)} />
                </Campo>
                <Campo label="Número">
                  <input value={form.numero}
                    onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
                    disabled={!ehAdmin} style={input(ehAdmin)} />
                </Campo>
                <Campo label="Bairro">
                  <input value={form.bairro}
                    onChange={e => setForm(f => ({ ...f, bairro: e.target.value.toUpperCase() }))}
                    disabled={!ehAdmin} style={input(ehAdmin)} />
                </Campo>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
                <Campo label="Cidade">
                  <input value={form.cidade}
                    onChange={e => setForm(f => ({ ...f, cidade: e.target.value.toUpperCase() }))}
                    disabled={!ehAdmin} style={input(ehAdmin)} />
                </Campo>
                <Campo label="UF">
                  <input value={form.estado}
                    onChange={e => setForm(f => ({ ...f, estado: e.target.value.toUpperCase().slice(0, 2) }))}
                    disabled={!ehAdmin} maxLength={2} style={input(ehAdmin)} />
                </Campo>
                <Campo label="CEP">
                  <input value={form.cep}
                    onChange={e => setForm(f => ({ ...f, cep: e.target.value }))}
                    disabled={!ehAdmin} placeholder="00.000-000" style={input(ehAdmin)} />
                </Campo>
              </div>
            </Secao>

            <Secao titulo="Observações">
              <Campo>
                <textarea value={form.observacoes}
                  onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  disabled={!ehAdmin}
                  rows={2}
                  placeholder="Texto adicional para aparecer no rodapé de impressões (opcional)"
                  style={{ ...input(ehAdmin), resize: "vertical", fontFamily: "inherit" }} />
              </Campo>
            </Secao>

            {ehAdmin && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <button type="submit" disabled={salvando}
                  style={{
                    background: salvando ? C.muted : `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                    color: C.white, border: "none", borderRadius: 8,
                    padding: "12px 24px", fontWeight: 700, fontSize: 14,
                    cursor: salvando ? "default" : "pointer",
                    boxShadow: salvando ? "none" : `0 2px 10px ${C.accent}55`,
                  }}>
                  {salvando ? "Salvando…" : "💾 Salvar configurações"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* CARD INFORMATIVO: PROPRIETARIO */}
        <div style={{
          marginTop: 20, padding: 16,
          background: C.purple + "22", border: `1px solid ${C.purple}55`,
          borderRadius: 10, display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ fontSize: 28 }}>👑</div>
          <div>
            <div style={{ color: C.purple, fontWeight: 800, fontSize: 13 }}>
              PROPRIETÁRIO E ADMINISTRADOR MESTRE
            </div>
            <div style={{ color: C.text, fontSize: 13, marginTop: 2 }}>
              <b>{form.razaoSocial || "—"}</b>
              {form.cnpj && <span style={{ color: C.muted }}> · CNPJ {form.cnpj}</span>}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function Secao({ titulo, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        color: C.muted, fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
        marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${C.border}`,
      }}>
        {titulo.toUpperCase()}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div>
      {label && (
        <label style={{ display: "block", color: C.muted, fontSize: 11, marginBottom: 4, fontWeight: 600 }}>
          {label}
        </label>
      )}
      {children}
    </div>
  );
}

function input(habilitado = true) {
  return {
    width: "100%",
    background: habilitado ? C.surface : C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8, padding: "9px 12px",
    color: habilitado ? C.text : C.muted,
    fontSize: 13, outline: "none", boxSizing: "border-box",
    cursor: habilitado ? "text" : "not-allowed",
  };
}

function alertStyle(cor) {
  return {
    marginBottom: 12, padding: "10px 14px", borderRadius: 8,
    background: cor + "22", border: `1px solid ${cor}55`, color: cor, fontSize: 13,
  };
}

const btnSecundario = {
  background: C.surface, border: `1px solid ${C.border}`, color: C.text,
  borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
};

const btnPerigo = {
  background: "transparent", border: `1px solid ${C.red}55`, color: C.red,
  borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer",
};
