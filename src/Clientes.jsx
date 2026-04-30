import { useEffect, useState, useCallback } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";


const ESTADOS_BR = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO",
  "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
  "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

function mascararCpfCnpj(valor) {
  const d = (valor || "").replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function mascararCep(valor) {
  const d = (valor || "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

async function buscarCepViaCEP(cepMascarado) {
  const d = cepMascarado.replace(/\D/g, "");
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!r.ok) return null;
    const j = await r.json();
    if (j.erro) return null;
    return {
      endereco: [j.logradouro, j.bairro].filter(Boolean).join(", "),
      cidade: j.localidade || "",
      estado: j.uf || "",
    };
  } catch {
    return null;
  }
}

const VAZIO = {
  nome: "", cpfCnpj: "", email: "", telefone: "",
  endereco: "", numero: "", cidade: "", estado: "", cep: "", observacoes: "",
};

function dividirEnderecoNumero(enderecoCompleto) {
  const valor = (enderecoCompleto || "").trim();
  const m = valor.match(/^(.*),\s*([\dA-Za-z/-]+)\s*$/);
  if (m) return { endereco: m[1].trim(), numero: m[2].trim() };
  return { endereco: valor, numero: "" };
}

function juntarEnderecoNumero(endereco, numero) {
  const e = (endereco || "").trim();
  const n = (numero || "").trim();
  if (!e) return n;
  if (!n) return e;
  return `${e}, ${n}`;
}

export default function Clientes({ user }) {
  const [clientes, setClientes] = useState([]);
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
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepNaoEncontrado, setCepNaoEncontrado] = useState(false);
  const [nomeInvalido, setNomeInvalido] = useState(false);

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE";
  const podeExcluir = user.role === "ADMIN";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.listarClientes({ search, ativo: filtroAtivo });
      setClientes(data);
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
    setNomeInvalido(false);
    setCepNaoEncontrado(false);
    setModalAberto(true);
  }

  function abrirEdicao(cliente) {
    setEditando(cliente);
    const { endereco, numero } = dividirEnderecoNumero(cliente.endereco);
    setForm({
      nome: cliente.nome || "",
      cpfCnpj: mascararCpfCnpj(cliente.cpfCnpj || ""),
      email: cliente.email || "",
      telefone: cliente.telefone || "",
      endereco,
      numero,
      cidade: cliente.cidade || "",
      estado: cliente.estado || "",
      cep: mascararCep(cliente.cep || ""),
      observacoes: cliente.observacoes || "",
    });
    setErroForm("");
    setNomeInvalido(false);
    setCepNaoEncontrado(false);
    setModalAberto(true);
  }

  async function aplicarCep(valor) {
    const masked = mascararCep(valor);
    setForm(prev => ({ ...prev, cep: masked }));
    setCepNaoEncontrado(false);
    const digitos = masked.replace(/\D/g, "");
    if (digitos.length !== 8) return;
    setBuscandoCep(true);
    const dados = await buscarCepViaCEP(masked);
    setBuscandoCep(false);
    if (!dados) {
      setCepNaoEncontrado(true);
      return;
    }
    setForm(prev => ({
      ...prev,
      endereco: dados.endereco || prev.endereco,
      cidade: dados.cidade || prev.cidade,
      estado: dados.estado || prev.estado,
    }));
  }

  async function salvar(e) {
    e.preventDefault();
    setErroForm("");
    if (!form.nome.trim()) {
      setNomeInvalido(true);
      setErroForm("Nome é obrigatório");
      return;
    }
    setNomeInvalido(false);
    setSalvando(true);
    try {
      const { numero, ...resto } = form;
      const payload = { ...resto, endereco: juntarEnderecoNumero(form.endereco, numero) };
      if (editando) {
        await api.atualizarCliente(editando.id, payload);
        flash("Cliente atualizado");
      } else {
        await api.criarCliente(payload);
        flash("Cliente criado");
      }
      setModalAberto(false);
      carregar();
    } catch (err) {
      setErroForm(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(cliente) {
    try {
      if (cliente.ativo) {
        if (!confirm(`Inativar "${cliente.nome}"?`)) return;
        await api.excluirCliente(cliente.id);
        flash("Cliente inativado");
      } else {
        await api.atualizarCliente(cliente.id, { ativo: true });
        flash("Cliente reativado");
      }
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  async function excluirPermanente(cliente) {
    if (!confirm(
      `Tem certeza que deseja excluir "${cliente.nome}"?\n\nEsta acao nao pode ser desfeita.`
    )) return;
    try {
      await api.excluirPermanenteCliente(cliente.id);
      flash("Cliente excluido");
      carregar();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <style>{`
        .btn-cliente-primario {
          background: linear-gradient(135deg, ${C.accent}, ${C.purple});
          color: ${C.white};
          border: none;
          border-radius: 8px;
          padding: 10px 22px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: filter 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
        }
        .btn-cliente-primario:hover:not(:disabled) {
          filter: brightness(1.15);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px ${C.accent}55;
        }
        .btn-cliente-primario:active:not(:disabled) {
          transform: translateY(0);
          filter: brightness(0.95);
        }
        .btn-cliente-primario:disabled {
          background: ${C.muted};
          cursor: default;
          opacity: 0.75;
        }
        .btn-cliente-secundario {
          background: transparent;
          border: 1px solid ${C.border};
          color: ${C.muted};
          border-radius: 8px;
          padding: 10px 18px;
          font-weight: 500;
          font-size: 13px;
          cursor: pointer;
          transition: color 0.15s ease, border-color 0.15s ease;
        }
        .btn-cliente-secundario:hover:not(:disabled) {
          color: ${C.text};
          border-color: ${C.accent}88;
        }
        .btn-cliente-secundario:disabled {
          opacity: 0.5;
          cursor: default;
        }
      `}</style>

      {/* Toolbar */}
      <div style={{
        display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center",
      }}>
        <input
          placeholder="Buscar por nome, email ou CPF/CNPJ..."
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
          + Novo Cliente
        </button>
      </div>

      {mensagem && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 8,
          background: C.green + "22", border: `1px solid ${C.green}55`, color: C.green, fontSize: 13,
        }}>
          {mensagem}
        </div>
      )}

      {erro && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 8,
          background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
        }}>
          {erro}
        </div>
      )}

      {/* Tabela */}
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
          <div>CPF/CNPJ</div>
          <div>Email</div>
          <div>Telefone</div>
          <div>Status</div>
          <div style={{ textAlign: "right" }}>Ações</div>
        </div>

        {carregando ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>
            Carregando...
          </div>
        ) : clientes.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.muted, fontSize: 13 }}>
            Nenhum cliente encontrado.
          </div>
        ) : clientes.map(c => (
          <div key={c.id} style={{
            display: "grid", gridTemplateColumns: "2fr 1.2fr 1.5fr 1fr 100px 250px",
            padding: "12px 16px", borderBottom: `1px solid ${C.border}`,
            alignItems: "center", fontSize: 13,
            opacity: c.ativo ? 1 : 0.55,
          }}>
            <div style={{ color: C.white, fontWeight: 600 }}>{c.nome}</div>
            <div style={{ color: C.text }}>{c.cpfCnpj || "—"}</div>
            <div style={{ color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.email || "—"}</div>
            <div style={{ color: C.text }}>{c.telefone || "—"}</div>
            <div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                background: c.ativo ? C.green + "22" : C.muted + "33",
                color: c.ativo ? C.green : C.muted,
                border: `1px solid ${c.ativo ? C.green + "55" : C.muted + "55"}`,
              }}>
                {c.ativo ? "ATIVO" : "INATIVO"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              {podeEditar && (
                <button onClick={() => abrirEdicao(c)} style={btnIcone(C.accent)}>
                  Editar
                </button>
              )}
              {podeExcluir && (
                <button onClick={() => alternarAtivo(c)} style={btnIcone(c.ativo ? C.yellow : C.green)}>
                  {c.ativo ? "Inativar" : "Reativar"}
                </button>
              )}
              {podeExcluir && (
                <button onClick={() => excluirPermanente(c)} style={btnIconeSolido(C.red)} title="Excluir permanentemente">
                  🗑 Excluir
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
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
                {editando ? "Editar Cliente" : "Novo Cliente"}
              </div>
              <button type="button" onClick={() => setModalAberto(false)} style={{
                background: "transparent", border: "none", color: C.muted, fontSize: 20, cursor: "pointer",
              }}>×</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Campo label="Nome *" col2>
                <input
                  value={form.nome}
                  onChange={e => {
                    setForm({ ...form, nome: e.target.value });
                    if (nomeInvalido && e.target.value.trim()) setNomeInvalido(false);
                  }}
                  autoFocus
                  style={{
                    ...inputStyle,
                    border: nomeInvalido ? `1px solid ${C.red}` : `1px solid ${C.border}`,
                    boxShadow: nomeInvalido ? `0 0 0 2px ${C.red}33` : "none",
                  }}
                />
                {nomeInvalido && (
                  <div style={{ color: C.red, fontSize: 11, marginTop: 4, fontWeight: 600 }}>
                    Informe o nome do cliente.
                  </div>
                )}
              </Campo>
              <Campo label="CPF/CNPJ">
                <input
                  value={form.cpfCnpj}
                  onChange={e => setForm({ ...form, cpfCnpj: mascararCpfCnpj(e.target.value) })}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="Telefone">
                <input
                  value={form.telefone}
                  onChange={e => setForm({ ...form, telefone: e.target.value })}
                  placeholder="(00) 00000-0000"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="Email" col2>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle} />
              </Campo>
              <Campo label="CEP">
                <input
                  value={form.cep}
                  onChange={e => aplicarCep(e.target.value)}
                  onBlur={e => aplicarCep(e.target.value)}
                  placeholder="00000-000"
                  inputMode="numeric"
                  style={inputStyle}
                />
                {buscandoCep && (
                  <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
                    Buscando endereço...
                  </div>
                )}
                {cepNaoEncontrado && !buscandoCep && (
                  <div style={{ color: C.yellow, fontSize: 11, marginTop: 4 }}>
                    CEP não encontrado. Preencha manualmente.
                  </div>
                )}
              </Campo>
              <Campo label="Estado">
                <select
                  value={form.estado}
                  onChange={e => setForm({ ...form, estado: e.target.value })}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="">—</option>
                  {ESTADOS_BR.map(uf => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="Endereço" col2>
                <input value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} style={inputStyle} />
              </Campo>
              <Campo label="Número">
                <input
                  value={form.numero}
                  onChange={e => setForm({ ...form, numero: e.target.value })}
                  placeholder="123"
                  inputMode="numeric"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="Cidade">
                <input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} style={inputStyle} />
              </Campo>
              <Campo label="Observações" col2>
                <textarea value={form.observacoes} onChange={e => setForm({ ...form, observacoes: e.target.value })}
                  rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
              </Campo>
            </div>

            {erroForm && (
              <div style={{
                marginTop: 14, padding: "10px 12px", borderRadius: 8,
                background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
              }}>
                {erroForm}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                disabled={salvando}
                className="btn-cliente-secundario"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="btn-cliente-primario"
              >
                {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Criar cliente"}
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
