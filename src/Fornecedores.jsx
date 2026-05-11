import { useEffect, useState, useCallback, useMemo } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";
import ActionsMenu from "./components/ActionsMenu.jsx";
import { FormularioLuxuoso, Secao, Linha, Campo } from "./components/FormularioLuxuoso.jsx";


const ESTADOS_BR = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO",
  "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
  "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

const VAZIO = {
  nome: "", cnpj: "", email: "", telefone: "",
  endereco: "", cidade: "", estado: "", cep: "",
};

const CAMPOS_PROGRESSO = ["nome", "cnpj", "email", "telefone", "cep", "endereco", "cidade", "estado"];

function mascararCnpj(v) {
  const d = (v || "").replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function mascararCep(v) {
  const d = (v || "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function mascararTelefone(v) {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
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
  const [nomeInvalido, setNomeInvalido] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepNaoEncontrado, setCepNaoEncontrado] = useState(false);

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE";
  const podeExcluir = user.role === "ADMIN";

  const progressoForm = useMemo(() => {
    let preenchidos = 0;
    for (const k of CAMPOS_PROGRESSO) {
      if (String(form[k] || "").trim()) preenchidos++;
    }
    return Math.round((preenchidos / CAMPOS_PROGRESSO.length) * 100);
  }, [form]);

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
    setNomeInvalido(false);
    setCepNaoEncontrado(false);
    setModalAberto(true);
  }

  function abrirEdicao(fornecedor) {
    setEditando(fornecedor);
    setForm({
      nome: fornecedor.nome || "",
      cnpj: mascararCnpj(fornecedor.cnpj || ""),
      email: fornecedor.email || "",
      telefone: mascararTelefone(fornecedor.telefone || ""),
      endereco: fornecedor.endereco || "",
      cidade: fornecedor.cidade || "",
      estado: fornecedor.estado || "",
      cep: mascararCep(fornecedor.cep || ""),
    });
    setErroForm("");
    setNomeInvalido(false);
    setCepNaoEncontrado(false);
    setModalAberto(true);
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
          display: "grid", gridTemplateColumns: "2fr 1.2fr 1.5fr 1fr 100px 80px",
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
            display: "grid", gridTemplateColumns: "2fr 1.2fr 1.5fr 1fr 100px 80px",
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
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <ActionsMenu
                items={[
                  {
                    label: "Editar",
                    icon: "✎",
                    color: C.accent,
                    onClick: () => abrirEdicao(f),
                    hidden: !podeEditar,
                  },
                  {
                    label: f.ativo ? "Inativar" : "Reativar",
                    icon: f.ativo ? "⊘" : "↻",
                    color: f.ativo ? C.yellow : C.green,
                    onClick: () => alternarAtivo(f),
                    hidden: !podeExcluir,
                  },
                ]}
              />
            </div>
          </div>
        ))}
      </div>

      <FormularioLuxuoso
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        onSubmit={salvar}
        titulo={editando ? "Editar" : "Novo"}
        tituloDestaque="Fornecedor"
        subtitulo={
          editando
            ? "Atualize os dados deste fornecedor. Campos marcados com • sao obrigatorios."
            : "Cadastre um fornecedor no seu catalogo. Campos marcados com • sao obrigatorios."
        }
        numeroLote={editando ? `#${String(editando.id || "").slice(0, 4).toUpperCase()}` : null}
        data={new Date().toLocaleDateString("pt-BR")}
        progresso={progressoForm}
        salvando={salvando}
        textoSalvar="Criar fornecedor"
        editando={!!editando}
        erro={erroForm}
        larguraMax={760}
      >
        <Secao legenda="Identificação">
          <Linha cols={1}>
            <Campo
              label="Razão social / Nome"
              obrigatorio
              erro={nomeInvalido ? "Informe o nome do fornecedor." : null}
            >
              <input
                className="lux-input"
                value={form.nome}
                onChange={e => {
                  setForm({ ...form, nome: e.target.value });
                  if (nomeInvalido && e.target.value.trim()) setNomeInvalido(false);
                }}
                placeholder="Ex.: Distribuidora Papel & Cia Ltda"
                autoFocus
                aria-invalid={nomeInvalido ? "true" : undefined}
              />
            </Campo>
          </Linha>
          <Linha>
            <Campo label="CNPJ">
              <input
                className="lux-input"
                value={form.cnpj}
                onChange={e => setForm({ ...form, cnpj: mascararCnpj(e.target.value) })}
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
                maxLength={18}
              />
            </Campo>
            <Campo label="Telefone">
              <input
                className="lux-input"
                value={form.telefone}
                onChange={e => setForm({ ...form, telefone: mascararTelefone(e.target.value) })}
                placeholder="(00) 0000-0000"
                inputMode="numeric"
                maxLength={15}
                autoComplete="tel"
              />
            </Campo>
          </Linha>
          <Linha cols={1}>
            <Campo label="E-mail">
              <input
                className="lux-input"
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="contato@fornecedor.com.br"
                autoComplete="email"
              />
            </Campo>
          </Linha>
        </Secao>

        <Secao legenda="Endereço">
          <Linha>
            <Campo
              label="CEP"
              hint={
                buscandoCep
                  ? "Buscando…"
                  : cepNaoEncontrado
                    ? "Não encontrado"
                    : null
              }
            >
              <input
                className="lux-input"
                value={form.cep}
                onChange={e => aplicarCep(e.target.value)}
                onBlur={e => aplicarCep(e.target.value)}
                placeholder="00000-000"
                inputMode="numeric"
                maxLength={9}
                autoComplete="postal-code"
              />
            </Campo>
            <Campo label="Estado">
              <select
                className="lux-select"
                value={form.estado}
                onChange={e => setForm({ ...form, estado: e.target.value })}
                autoComplete="address-level1"
              >
                <option value="">Selecione…</option>
                {ESTADOS_BR.map(uf => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </Campo>
          </Linha>
          <Linha cols={1}>
            <Campo label="Endereço">
              <input
                className="lux-input"
                value={form.endereco}
                onChange={e => setForm({ ...form, endereco: e.target.value })}
                placeholder="Rua, avenida, número e bairro"
                autoComplete="street-address"
              />
            </Campo>
          </Linha>
          <Linha cols={1}>
            <Campo label="Cidade">
              <input
                className="lux-input"
                value={form.cidade}
                onChange={e => setForm({ ...form, cidade: e.target.value })}
                placeholder="São Paulo"
                autoComplete="address-level2"
              />
            </Campo>
          </Linha>
        </Secao>
      </FormularioLuxuoso>
    </div>
  );
}
