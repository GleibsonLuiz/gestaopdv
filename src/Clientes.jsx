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
  endereco: "", numero: "", complemento: "", cidade: "", estado: "", cep: "", observacoes: "",
};

const CAMPOS_PROGRESSO = ["nome", "cpfCnpj", "email", "telefone", "cep", "endereco", "numero", "cidade", "estado", "observacoes"];

function dividirEnderecoCompleto(enderecoCompleto) {
  const valor = (enderecoCompleto || "").trim();
  if (!valor) return { endereco: "", numero: "", complemento: "" };
  // Formato esperado: "Logradouro, numero - complemento" (todos opcionais).
  // O complemento e separado por " - " para coexistir com virgulas no logradouro.
  let endereco = valor;
  let complemento = "";
  const idxTraco = endereco.indexOf(" - ");
  if (idxTraco >= 0) {
    complemento = endereco.slice(idxTraco + 3).trim();
    endereco = endereco.slice(0, idxTraco).trim();
  }
  let numero = "";
  const m = endereco.match(/^(.*),\s*([\dA-Za-z/-]+)\s*$/);
  if (m) {
    endereco = m[1].trim();
    numero = m[2].trim();
  }
  return { endereco, numero, complemento };
}

function juntarEnderecoCompleto(endereco, numero, complemento) {
  const e = (endereco || "").trim();
  const n = (numero || "").trim();
  const c = (complemento || "").trim();
  let base = e;
  if (e && n) base = `${e}, ${n}`;
  else if (!e && n) base = n;
  if (c) return base ? `${base} - ${c}` : c;
  return base;
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

  const progressoForm = useMemo(() => {
    let preenchidos = 0;
    for (const k of CAMPOS_PROGRESSO) {
      if (String(form[k] || "").trim()) preenchidos++;
    }
    return Math.round((preenchidos / CAMPOS_PROGRESSO.length) * 100);
  }, [form]);

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
    const { endereco, numero, complemento } = dividirEnderecoCompleto(cliente.endereco);
    setForm({
      nome: cliente.nome || "",
      cpfCnpj: mascararCpfCnpj(cliente.cpfCnpj || ""),
      email: cliente.email || "",
      telefone: cliente.telefone || "",
      endereco,
      numero,
      complemento,
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
      const { numero, complemento, ...resto } = form;
      const payload = { ...resto, endereco: juntarEnderecoCompleto(form.endereco, numero, complemento) };
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

  return (
    <div>
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
          display: "grid", gridTemplateColumns: "2fr 1.2fr 1.5fr 1fr 100px 80px",
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
            display: "grid", gridTemplateColumns: "2fr 1.2fr 1.5fr 1fr 100px 80px",
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
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <ActionsMenu
                items={[
                  {
                    label: "Editar",
                    icon: "✎",
                    color: C.accent,
                    onClick: () => abrirEdicao(c),
                    hidden: !podeEditar,
                  },
                  {
                    label: c.ativo ? "Inativar" : "Reativar",
                    icon: c.ativo ? "⊘" : "↻",
                    color: c.ativo ? C.yellow : C.green,
                    onClick: () => alternarAtivo(c),
                    hidden: !podeExcluir,
                  },
                ]}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Modal — layout luxuoso */}
      <FormularioLuxuoso
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        onSubmit={salvar}
        titulo={editando ? "Editar" : "Novo"}
        tituloDestaque="Cliente"
        subtitulo={
          editando
            ? "Atualize as informacoes deste cliente. Campos marcados com • sao obrigatorios."
            : "Cadastre um cliente na sua carteira. Campos marcados com • sao obrigatorios."
        }
        numeroLote={editando ? `#${String(editando.id || "").slice(0, 4).toUpperCase()}` : null}
        data={new Date().toLocaleDateString("pt-BR")}
        progresso={progressoForm}
        salvando={salvando}
        textoSalvar="Criar cliente"
        editando={!!editando}
        erro={erroForm}
        larguraMax={760}
      >
        <Secao legenda="Identificação">
          <Linha cols={1}>
            <Campo
              label="Nome completo"
              obrigatorio
              erro={nomeInvalido ? "Informe o nome do cliente." : null}
            >
              <input
                className="lux-input"
                value={form.nome}
                onChange={e => {
                  setForm({ ...form, nome: e.target.value });
                  if (nomeInvalido && e.target.value.trim()) setNomeInvalido(false);
                }}
                placeholder="Ex.: Helena Aparecida Martins"
                autoFocus
                autoComplete="name"
                aria-invalid={nomeInvalido ? "true" : undefined}
              />
            </Campo>
          </Linha>
          <Linha>
            <Campo label="CPF / CNPJ">
              <input
                className="lux-input"
                value={form.cpfCnpj}
                onChange={e => setForm({ ...form, cpfCnpj: mascararCpfCnpj(e.target.value) })}
                placeholder="000.000.000-00"
                inputMode="numeric"
                maxLength={18}
              />
            </Campo>
            <Campo label="Telefone">
              <input
                className="lux-input"
                value={form.telefone}
                onChange={e => setForm({ ...form, telefone: e.target.value })}
                placeholder="(00) 00000-0000"
                inputMode="numeric"
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
                placeholder="cliente@empresa.com.br"
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
            <Campo label="Logradouro">
              <input
                className="lux-input"
                value={form.endereco}
                onChange={e => setForm({ ...form, endereco: e.target.value })}
                placeholder="Rua, avenida ou alameda"
                autoComplete="street-address"
              />
            </Campo>
          </Linha>
          <Linha tilt>
            <Campo label="Cidade">
              <input
                className="lux-input"
                value={form.cidade}
                onChange={e => setForm({ ...form, cidade: e.target.value })}
                placeholder="São Paulo"
                autoComplete="address-level2"
              />
            </Campo>
            <Campo label="Número">
              <input
                className="lux-input"
                value={form.numero}
                onChange={e => setForm({ ...form, numero: e.target.value })}
                placeholder="123"
                inputMode="numeric"
              />
            </Campo>
            <Campo label="Complemento">
              <input
                className="lux-input"
                value={form.complemento || ""}
                onChange={e => setForm({ ...form, complemento: e.target.value })}
                placeholder="Apto, sala, bloco"
              />
            </Campo>
          </Linha>
        </Secao>

        <Secao legenda="Observações">
          <Linha cols={1}>
            <Campo
              label="Notas internas"
              hint={`${(form.observacoes || "").length} / 500`}
            >
              <textarea
                className="lux-textarea"
                value={form.observacoes}
                onChange={e => setForm({ ...form, observacoes: e.target.value.slice(0, 500) })}
                maxLength={500}
                placeholder="Preferências de contato, segmento, histórico relevante…"
                rows={3}
              />
            </Campo>
          </Linha>
        </Secao>
      </FormularioLuxuoso>
    </div>
  );
}
