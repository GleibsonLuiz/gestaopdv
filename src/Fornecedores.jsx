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

// Codigos IBGE de UF (tabela oficial). Preenchidos automaticamente quando o
// usuario seleciona o estado. Necessario para futura emissao de NF-e.
const COD_UF_IBGE = {
  AC: "12", AL: "27", AM: "13", AP: "16", BA: "29", CE: "23", DF: "53",
  ES: "32", GO: "52", MA: "21", MG: "31", MS: "50", MT: "51", PA: "15",
  PB: "25", PE: "26", PI: "22", PR: "41", RJ: "33", RN: "24", RO: "11",
  RR: "14", RS: "43", SC: "42", SE: "28", SP: "35", TO: "17",
};

// Indicador de IE do destinatario (SEFAZ).
const OPCOES_IND_IE_DEST = [
  { valor: 1, label: "1 — Contribuinte ICMS" },
  { valor: 2, label: "2 — Isento" },
  { valor: 9, label: "9 — Nao contribuinte" },
];

// Codigo de Regime Tributario (CRT).
const OPCOES_CRT = [
  { valor: 1, label: "1 — Simples Nacional" },
  { valor: 2, label: "2 — Simples Nacional (excesso de sublimite)" },
  { valor: 3, label: "3 — Regime Normal (Lucro Real/Presumido)" },
];

const VAZIO = {
  // Identificacao
  nome: "", nomeFantasia: "", tipoPessoa: "PJ", cnpj: "",
  email: "", telefone: "",
  // Fiscal
  ie: "", ieIsenta: false, im: "",
  indIEDest: "", crt: "",
  emailNFe: "",
  // Endereco
  cep: "", endereco: "", numero: "", complemento: "", bairro: "",
  cidade: "", estado: "",
  codMunicipioIBGE: "", codUFIBGE: "",
  codPais: "1058", nomePais: "BRASIL",
};

// Campos contados para o medidor de preenchimento do FormularioLuxuoso.
const CAMPOS_PROGRESSO = [
  "nome", "cnpj", "email", "telefone",
  "cep", "endereco", "numero", "bairro", "cidade", "estado",
  "ie", "indIEDest", "crt",
];

function mascararCnpj(v) {
  const d = (v || "").replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function mascararCpf(v) {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function mascararDocumento(tipoPessoa, v) {
  return tipoPessoa === "PF" ? mascararCpf(v) : mascararCnpj(v);
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
      // ViaCEP devolve logradouro e bairro separados; tambem expoe o
      // codigo IBGE do municipio em `ibge` — exatamente o que a SEFAZ
      // exige no campo cMun da NF-e.
      logradouro: j.logradouro || "",
      bairro: j.bairro || "",
      cidade: j.localidade || "",
      estado: j.uf || "",
      codMunicipioIBGE: j.ibge || "",
    };
  } catch {
    return null;
  }
}

// Stub para futura integracao com a Receita Federal / BrasilAPI / SerproIO.
// Ao sair do campo CNPJ com 14 digitos preenchidos, dispara uma consulta
// cadastral que devera retornar razaoSocial, nomeFantasia, endereco, CRT etc.
// TODO: substituir o retorno null por
//   const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`);
//   return r.ok ? await r.json() : null;
// eslint-disable-next-line no-unused-vars
async function consultarCnpjCadastral(cnpjDigits) {
  return null;
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
      if (String(form[k] ?? "").trim()) preenchidos++;
    }
    return Math.round((preenchidos / CAMPOS_PROGRESSO.length) * 100);
  }, [form]);

  // Atualiza codigo IBGE da UF automaticamente quando o estado muda.
  function setEstado(uf) {
    setForm(prev => ({
      ...prev,
      estado: uf,
      codUFIBGE: COD_UF_IBGE[uf] || "",
    }));
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
      endereco: dados.logradouro || prev.endereco,
      bairro: dados.bairro || prev.bairro,
      cidade: dados.cidade || prev.cidade,
      estado: dados.estado || prev.estado,
      codUFIBGE: COD_UF_IBGE[dados.estado] || prev.codUFIBGE,
      codMunicipioIBGE: dados.codMunicipioIBGE || prev.codMunicipioIBGE,
    }));
  }

  async function aplicarCnpj(valor) {
    const masked = mascararCnpj(valor);
    setForm(prev => ({ ...prev, cnpj: masked }));
    const digitos = masked.replace(/\D/g, "");
    if (digitos.length === 14 && form.tipoPessoa === "PJ") {
      // Disparo silencioso da consulta cadastral (stub).
      const cadastro = await consultarCnpjCadastral(digitos);
      if (cadastro) {
        setForm(prev => ({
          ...prev,
          nome: prev.nome || cadastro.razao_social || cadastro.razaoSocial || "",
          nomeFantasia: prev.nomeFantasia || cadastro.nome_fantasia || cadastro.nomeFantasia || "",
        }));
      }
    }
  }

  // Toggle Isento: ao ativar, limpa IE e ajusta indIEDest para 2 se ainda
  // estava como 1 (contribuinte) — evita inconsistencia logica antes do
  // POST chegar no backend.
  function alternarIsento(checado) {
    setForm(prev => ({
      ...prev,
      ieIsenta: checado,
      ie: checado ? "" : prev.ie,
      indIEDest: checado && prev.indIEDest === 1 ? 2 : prev.indIEDest,
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

  function abrirEdicao(f) {
    setEditando(f);
    const tipoPessoa = f.tipoPessoa || "PJ";
    setForm({
      nome: f.nome || "",
      nomeFantasia: f.nomeFantasia || "",
      tipoPessoa,
      cnpj: mascararDocumento(tipoPessoa, f.cnpj || ""),
      email: f.email || "",
      telefone: mascararTelefone(f.telefone || ""),

      ie: f.ie || "",
      ieIsenta: !!f.ieIsenta,
      im: f.im || "",
      indIEDest: f.indIEDest ?? "",
      crt: f.crt ?? "",
      emailNFe: f.emailNFe || "",

      cep: mascararCep(f.cep || ""),
      endereco: f.endereco || "",
      numero: f.numero || "",
      complemento: f.complemento || "",
      bairro: f.bairro || "",
      cidade: f.cidade || "",
      estado: f.estado || "",
      codMunicipioIBGE: f.codMunicipioIBGE || "",
      codUFIBGE: f.codUFIBGE || (f.estado ? COD_UF_IBGE[f.estado] || "" : ""),
      codPais: f.codPais || "1058",
      nomePais: f.nomePais || "BRASIL",
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
      setErroForm("Razao Social / Nome e obrigatorio");
      return;
    }
    // Validacao espelhada do backend: contribuinte exige IE preenchida.
    if (form.indIEDest === 1 && !form.ie.trim() && !form.ieIsenta) {
      setErroForm("Inscricao Estadual e obrigatoria para Contribuinte ICMS (indIEDest=1)");
      return;
    }
    setNomeInvalido(false);
    setSalvando(true);
    // Monta payload normalizando inteiros que estao como string no form.
    const payload = {
      ...form,
      indIEDest: form.indIEDest === "" ? null : Number(form.indIEDest),
      crt: form.crt === "" ? null : Number(form.crt),
    };
    try {
      if (editando) {
        await api.atualizarFornecedor(editando.id, payload);
        flash("Fornecedor atualizado");
      } else {
        await api.criarFornecedor(payload);
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

  async function alternarAtivo(f) {
    try {
      if (f.ativo) {
        if (!confirm(`Inativar "${f.nome}"?`)) return;
        await api.excluirFornecedor(f.id);
        flash("Fornecedor inativado");
      } else {
        await api.atualizarFornecedor(f.id, { ativo: true });
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
          placeholder="Buscar por nome, fantasia, email ou CNPJ..."
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
          <div>CNPJ / CPF</div>
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
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.white, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nome}</div>
              {f.nomeFantasia && (
                <div style={{ color: C.muted, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nomeFantasia}</div>
              )}
            </div>
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
        larguraMax={860}
      >
        {/* ============ SEÇÃO 1: Identificação ============ */}
        <Secao legenda="Dados básicos">
          <Linha cols={1}>
            <Campo
              label="Razão Social / Nome"
              obrigatorio
              hint="Nome juridico que aparece no contrato/CNPJ. E o que vai na NF-e."
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
          <Linha cols={2}>
            <Campo label="Nome Fantasia" hint="Como o fornecedor e conhecido no mercado.">
              <input
                className="lux-input"
                value={form.nomeFantasia}
                onChange={e => setForm({ ...form, nomeFantasia: e.target.value })}
                placeholder="Ex.: Papel & Cia"
              />
            </Campo>
            <Campo label="Tipo de pessoa">
              <select
                className="lux-select"
                value={form.tipoPessoa}
                onChange={e => {
                  const novoTipo = e.target.value;
                  setForm(prev => ({
                    ...prev,
                    tipoPessoa: novoTipo,
                    cnpj: mascararDocumento(novoTipo, prev.cnpj),
                  }));
                }}
              >
                <option value="PJ">Pessoa Jurídica (CNPJ)</option>
                <option value="PF">Pessoa Física (CPF)</option>
              </select>
            </Campo>
          </Linha>
          <Linha style={{ gridTemplateColumns: "185px 160px 1fr" }}>
            <Campo label={form.tipoPessoa === "PF" ? "CPF" : "CNPJ"}>
              <input
                className="lux-input"
                value={form.cnpj}
                onChange={e => aplicarCnpj(e.target.value)}
                placeholder={form.tipoPessoa === "PF" ? "000.000.000-00" : "00.000.000/0000-00"}
                inputMode="numeric"
                maxLength={form.tipoPessoa === "PF" ? 14 : 18}
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

        {/* ============ SEÇÃO 2: Dados Fiscais ============ */}
        <Secao legenda="Dados fiscais / tributários">
          <Linha cols={2}>
            <Campo
              label="Indicador da IE (indIEDest)"
              hint="Define como o fornecedor aparece na NF-e como destinatario."
            >
              <select
                className="lux-select"
                value={form.indIEDest}
                onChange={e => {
                  const valor = e.target.value === "" ? "" : Number(e.target.value);
                  setForm(prev => ({
                    ...prev,
                    indIEDest: valor,
                    // Coerencia: indIEDest=2 (Isento) implica ieIsenta=true.
                    ieIsenta: valor === 2 ? true : (valor === 1 ? false : prev.ieIsenta),
                    ie: valor === 2 ? "" : prev.ie,
                  }));
                }}
              >
                <option value="">Selecione…</option>
                {OPCOES_IND_IE_DEST.map(o => (
                  <option key={o.valor} value={o.valor}>{o.label}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Regime Tributário (CRT)">
              <select
                className="lux-select"
                value={form.crt}
                onChange={e => setForm({ ...form, crt: e.target.value === "" ? "" : Number(e.target.value) })}
              >
                <option value="">Selecione…</option>
                {OPCOES_CRT.map(o => (
                  <option key={o.valor} value={o.valor}>{o.label}</option>
                ))}
              </select>
            </Campo>
          </Linha>
          <Linha cols={2}>
            <Campo
              label="Inscrição Estadual"
              obrigatorio={form.indIEDest === 1}
              hint={form.ieIsenta ? "Isento — campo desabilitado." : null}
            >
              <input
                className="lux-input"
                value={form.ie}
                onChange={e => setForm({ ...form, ie: e.target.value.replace(/\D/g, "") })}
                placeholder="Apenas dígitos"
                inputMode="numeric"
                maxLength={14}
                disabled={form.ieIsenta}
                style={form.ieIsenta ? { opacity: 0.55 } : undefined}
              />
              <label style={{
                display: "flex", alignItems: "center", gap: 8,
                marginTop: 8, fontSize: 12, color: C.muted, cursor: "pointer",
              }}>
                <input
                  type="checkbox"
                  checked={form.ieIsenta}
                  onChange={e => alternarIsento(e.target.checked)}
                  style={{ accentColor: C.accent }}
                />
                Isento de Inscrição Estadual
              </label>
            </Campo>
            <Campo label="Inscrição Municipal">
              <input
                className="lux-input"
                value={form.im}
                onChange={e => setForm({ ...form, im: e.target.value.replace(/\D/g, "") })}
                placeholder="Apenas dígitos (NFS-e)"
                inputMode="numeric"
                maxLength={15}
              />
            </Campo>
          </Linha>
          <Linha cols={1}>
            <Campo
              label="E-mail para XML / NF-e"
              hint="Caixa dedicada para recebimento de notas fiscais. Pode ser diferente do e-mail comercial."
            >
              <input
                className="lux-input"
                type="email"
                value={form.emailNFe}
                onChange={e => setForm({ ...form, emailNFe: e.target.value })}
                placeholder="fiscal@fornecedor.com.br"
              />
            </Campo>
          </Linha>
        </Secao>

        {/* ============ SEÇÃO 3: Endereço ============ */}
        <Secao legenda="Endereço">
          <Linha variant="addr-tilt">
            <Campo
              label="CEP"
              hint={
                buscandoCep
                  ? "Buscando…"
                  : cepNaoEncontrado
                    ? "CEP não encontrado"
                    : "ViaCEP preenche logradouro, bairro, cidade, UF e código IBGE."
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
                onChange={e => setEstado(e.target.value)}
                autoComplete="address-level1"
              >
                <option value="">UF</option>
                {ESTADOS_BR.map(uf => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </Campo>
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
          <Linha style={{ gridTemplateColumns: "1fr 120px" }}>
            <Campo label="Logradouro">
              <input
                className="lux-input"
                value={form.endereco}
                onChange={e => setForm({ ...form, endereco: e.target.value })}
                placeholder="Rua, avenida, travessa…"
                autoComplete="street-address"
              />
            </Campo>
            <Campo label="Número">
              <input
                className="lux-input"
                value={form.numero}
                onChange={e => setForm({ ...form, numero: e.target.value })}
                placeholder="123"
                inputMode="numeric"
                maxLength={10}
              />
            </Campo>
          </Linha>
          <Linha cols={2}>
            <Campo label="Bairro">
              <input
                className="lux-input"
                value={form.bairro}
                onChange={e => setForm({ ...form, bairro: e.target.value })}
                placeholder="Centro"
              />
            </Campo>
            <Campo label="Complemento">
              <input
                className="lux-input"
                value={form.complemento}
                onChange={e => setForm({ ...form, complemento: e.target.value })}
                placeholder="Sala 4, Bloco B…"
              />
            </Campo>
          </Linha>
          <Linha style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            <Campo
              label="Código IBGE Município"
              hint="Auto pelo ViaCEP."
            >
              <input
                className="lux-input"
                value={form.codMunicipioIBGE}
                onChange={e => setForm({ ...form, codMunicipioIBGE: e.target.value.replace(/\D/g, "") })}
                placeholder="0000000"
                inputMode="numeric"
                maxLength={7}
              />
            </Campo>
            <Campo label="Código IBGE UF">
              <input
                className="lux-input"
                value={form.codUFIBGE}
                readOnly
                placeholder="—"
                style={{ opacity: 0.7 }}
              />
            </Campo>
            <Campo label="Código País">
              <input
                className="lux-input"
                value={form.codPais}
                onChange={e => setForm({ ...form, codPais: e.target.value })}
                maxLength={4}
              />
            </Campo>
            <Campo label="Nome País">
              <input
                className="lux-input"
                value={form.nomePais}
                onChange={e => setForm({ ...form, nomePais: e.target.value })}
                maxLength={60}
              />
            </Campo>
          </Linha>
        </Secao>
      </FormularioLuxuoso>
    </div>
  );
}
