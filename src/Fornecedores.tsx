import { useEffect, useState, useCallback, useMemo, type FormEvent } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";
import ActionsMenu from "./components/ActionsMenu";
import { FormularioLuxuoso, Secao, Linha, Campo } from "./components/FormularioLuxuoso";
import { consultarCnpj } from "./lib/cnpj";
import { mascararCep, mascararCnpj, mascararCpf, mascararDocumento, mascararTelefone } from "./lib/masks";
import { buscarCepViaCEP } from "./lib/viaCep";


// ============ CONSTANTES ============

const ESTADOS_BR = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO",
  "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
  "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

// Codigos IBGE de UF (tabela oficial).
const COD_UF_IBGE: Record<string, string> = {
  AC: "12", AL: "27", AM: "13", AP: "16", BA: "29", CE: "23", DF: "53",
  ES: "32", GO: "52", MA: "21", MG: "31", MS: "50", MT: "51", PA: "15",
  PB: "25", PE: "26", PI: "22", PR: "41", RJ: "33", RN: "24", RO: "11",
  RR: "14", RS: "43", SC: "42", SE: "28", SP: "35", TO: "17",
};

// Indicador de IE do destinatario (SEFAZ).
type IndIEDest = 1 | 2 | 9;
type CRT = 1 | 2 | 3;

interface OpcaoNum<T extends number> {
  valor: T;
  label: string;
}

const OPCOES_IND_IE_DEST: OpcaoNum<IndIEDest>[] = [
  { valor: 1, label: "1 — Contribuinte ICMS" },
  { valor: 2, label: "2 — Isento" },
  { valor: 9, label: "9 — Nao contribuinte" },
];

const OPCOES_CRT: OpcaoNum<CRT>[] = [
  { valor: 1, label: "1 — Simples Nacional" },
  { valor: 2, label: "2 — Simples Nacional (excesso de sublimite)" },
  { valor: 3, label: "3 — Regime Normal (Lucro Real/Presumido)" },
];

// ============ TIPOS ============

type TipoPessoa = "PF" | "PJ";

interface Fornecedor {
  id: string;
  nome: string;
  nomeFantasia?: string | null;
  tipoPessoa?: TipoPessoa;
  cnpj?: string | null;
  email?: string | null;
  telefone?: string | null;
  ie?: string | null;
  ieIsenta?: boolean;
  im?: string | null;
  indIEDest?: IndIEDest | null;
  crt?: CRT | null;
  emailNFe?: string | null;
  cep?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  codMunicipioIBGE?: string | null;
  codUFIBGE?: string | null;
  codPais?: string | null;
  nomePais?: string | null;
  ativo: boolean;
}

interface FormFornecedor {
  nome: string;
  nomeFantasia: string;
  tipoPessoa: TipoPessoa;
  cnpj: string;
  email: string;
  telefone: string;
  ie: string;
  ieIsenta: boolean;
  im: string;
  indIEDest: IndIEDest | "";
  crt: CRT | "";
  emailNFe: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  codMunicipioIBGE: string;
  codUFIBGE: string;
  codPais: string;
  nomePais: string;
}

const VAZIO: FormFornecedor = {
  nome: "", nomeFantasia: "", tipoPessoa: "PJ", cnpj: "",
  email: "", telefone: "",
  ie: "", ieIsenta: false, im: "",
  indIEDest: "", crt: "",
  emailNFe: "",
  cep: "", endereco: "", numero: "", complemento: "", bairro: "",
  cidade: "", estado: "",
  codMunicipioIBGE: "", codUFIBGE: "",
  codPais: "1058", nomePais: "BRASIL",
};

const CAMPOS_PROGRESSO: (keyof FormFornecedor)[] = [
  "nome", "cnpj", "email", "telefone",
  "cep", "endereco", "numero", "bairro", "cidade", "estado",
  "ie", "indIEDest", "crt",
];

// ============ HELPERS ============

// ============ COMPONENTE PRINCIPAL ============

interface FornecedoresProps {
  user: SessionUser;
}

export default function Fornecedores({ user }: FornecedoresProps) {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [search, setSearch] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Fornecedor | null>(null);
  const [form, setForm] = useState<FormFornecedor>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [nomeInvalido, setNomeInvalido] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepNaoEncontrado, setCepNaoEncontrado] = useState(false);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [cnpjErro, setCnpjErro] = useState("");

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE";
  const podeExcluir = user.role === "ADMIN";

  const progressoForm = useMemo(() => {
    let preenchidos = 0;
    for (const k of CAMPOS_PROGRESSO) {
      if (String(form[k] ?? "").trim()) preenchidos++;
    }
    return Math.round((preenchidos / CAMPOS_PROGRESSO.length) * 100);
  }, [form]);

  function setEstado(uf: string) {
    setForm((prev) => ({
      ...prev,
      estado: uf,
      codUFIBGE: COD_UF_IBGE[uf] || "",
    }));
  }

  async function aplicarCep(valor: string) {
    const masked = mascararCep(valor);
    setForm((prev) => ({ ...prev, cep: masked }));
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
    setForm((prev) => ({
      ...prev,
      endereco: dados.logradouro || prev.endereco,
      bairro: dados.bairro || prev.bairro,
      cidade: dados.cidade || prev.cidade,
      estado: dados.estado || prev.estado,
      codUFIBGE: COD_UF_IBGE[dados.estado] || prev.codUFIBGE,
      codMunicipioIBGE: dados.codMunicipioIBGE || prev.codMunicipioIBGE,
    }));
  }

  // Auto-preenchimento por CNPJ (BrasilAPI). Dispara ao completar os 14 digitos
  // de um fornecedor PJ; preenche razao social, nome fantasia e endereco.
  async function aplicarCnpj(valor: string) {
    const masked = mascararCnpj(valor);
    setForm((prev) => ({ ...prev, cnpj: masked }));
    setCnpjErro("");
    const digitos = masked.replace(/\D/g, "");
    if (digitos.length !== 14 || form.tipoPessoa !== "PJ") return;
    setBuscandoCnpj(true);
    try {
      const d = await consultarCnpj(digitos);
      setForm((prev) => ({
        ...prev,
        nome: d.razaoSocial || prev.nome,
        nomeFantasia: d.nomeFantasia || prev.nomeFantasia,
        endereco: d.logradouro || prev.endereco,
        numero: d.numero || prev.numero,
        complemento: d.complemento || prev.complemento,
        bairro: d.bairro || prev.bairro,
        cidade: d.cidade || prev.cidade,
        estado: d.estado || prev.estado,
        codUFIBGE: d.estado ? (COD_UF_IBGE[d.estado] || prev.codUFIBGE) : prev.codUFIBGE,
        cep: d.cep ? mascararCep(d.cep) : prev.cep,
      }));
      if (nomeInvalido && (d.razaoSocial || "").trim()) setNomeInvalido(false);
    } catch (e) {
      setCnpjErro((e as Error).message);
    } finally {
      setBuscandoCnpj(false);
    }
  }

  function alternarIsento(checado: boolean) {
    setForm((prev) => ({
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
      const data = await api.listarFornecedores({ search, ativo: filtroAtivo }) as Fornecedor[];
      setFornecedores(data || []);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [search, filtroAtivo]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  function flash(texto: string) {
    setMensagem(texto);
    setTimeout(() => setMensagem(""), 2500);
  }

  function abrirNovo() {
    setEditando(null);
    setForm(VAZIO);
    setErroForm("");
    setNomeInvalido(false);
    setCepNaoEncontrado(false);
    setCnpjErro("");
    setModalAberto(true);
  }

  function abrirEdicao(f: Fornecedor) {
    setEditando(f);
    const tipoPessoa: TipoPessoa = f.tipoPessoa || "PJ";
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
    setCnpjErro("");
    setModalAberto(true);
  }

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErroForm("");
    if (!form.nome.trim()) {
      setNomeInvalido(true);
      setErroForm("Razao Social / Nome e obrigatorio");
      return;
    }
    if (form.indIEDest === 1 && !form.ie.trim() && !form.ieIsenta) {
      setErroForm("Inscricao Estadual e obrigatoria para Contribuinte ICMS (indIEDest=1)");
      return;
    }
    setNomeInvalido(false);
    setSalvando(true);
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
      setErroForm((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(f: Fornecedor) {
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
      alert((err as Error).message);
    }
  }

  return (
    <div>
      <div className="flex gap-2.5 mb-4 flex-wrap items-center">
        <input
          placeholder="Buscar por nome, fantasia, email ou CNPJ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar fornecedores"
          className="bg-gp-surface text-gp-text rounded-lg text-sm"
          style={{
            flex: "1 1 280px",
            border: `1px solid ${C.border}`,
            padding: "10px 12px",
            outline: "none",
          }}
        />
        <select
          value={filtroAtivo}
          onChange={(e) => setFiltroAtivo(e.target.value)}
          aria-label="Filtrar por status"
          className="bg-gp-surface text-gp-text rounded-lg text-[13px] cursor-pointer"
          style={{
            border: `1px solid ${C.border}`,
            padding: "10px 12px",
          }}
        >
          <option value="">Todos</option>
          <option value="true">Apenas ativos</option>
          <option value="false">Apenas inativos</option>
        </select>
        <button
          type="button"
          onClick={abrirNovo}
          className="text-gp-white border-none rounded-lg text-sm font-bold cursor-pointer"
          style={{
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            padding: "10px 18px",
          }}
        >
          + Novo Fornecedor
        </button>
      </div>

      {mensagem && (
        <div
          className="mb-3 px-[14px] py-[10px] rounded-lg text-[13px] text-gp-green"
          style={{ background: C.green + "22", border: `1px solid ${C.green}55` }}
        >
          {mensagem}
        </div>
      )}

      {erro && (
        <div
          className="mb-3 px-[14px] py-[10px] rounded-lg text-[13px] text-gp-red"
          style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}
        >
          {erro}
        </div>
      )}

      <div
        className="bg-gp-card rounded-xl overflow-hidden"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div
          className="grid bg-gp-surface text-gp-muted text-xs font-bold uppercase"
          style={{
            gridTemplateColumns: "2fr 1.2fr 1.5fr 1fr 100px 80px",
            padding: "12px 16px",
            borderBottom: `1px solid ${C.border}`,
            letterSpacing: 0.5,
          }}
        >
          <div>Nome</div>
          <div>CNPJ / CPF</div>
          <div>Email</div>
          <div>Telefone</div>
          <div>Status</div>
          <div className="text-right">Ações</div>
        </div>

        {carregando ? (
          <div className="py-[30px] text-center text-gp-muted text-[13px]">Carregando...</div>
        ) : fornecedores.length === 0 ? (
          <div className="py-[30px] text-center text-gp-muted text-[13px]">Nenhum fornecedor encontrado.</div>
        ) : fornecedores.map((f) => (
          <div
            key={f.id}
            className="grid items-center text-[13px]"
            style={{
              gridTemplateColumns: "2fr 1.2fr 1.5fr 1fr 100px 80px",
              padding: "12px 16px",
              borderBottom: `1px solid ${C.border}`,
              opacity: f.ativo ? 1 : 0.55,
            }}
          >
            <div className="min-w-0">
              <div className="text-gp-white font-semibold overflow-hidden text-ellipsis whitespace-nowrap">{f.nome}</div>
              {f.nomeFantasia && (
                <div className="text-gp-muted text-[11px] mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap">{f.nomeFantasia}</div>
              )}
            </div>
            <div className="text-gp-text">{f.cnpj || "—"}</div>
            <div className="text-gp-text overflow-hidden text-ellipsis whitespace-nowrap">{f.email || "—"}</div>
            <div className="text-gp-text">{f.telefone || "—"}</div>
            <div>
              <span
                className="text-[11px] font-bold rounded-md"
                style={{
                  padding: "3px 10px",
                  background: f.ativo ? C.green + "22" : C.muted + "33",
                  color: f.ativo ? C.green : C.muted,
                  border: `1px solid ${f.ativo ? C.green + "55" : C.muted + "55"}`,
                }}
              >
                {f.ativo ? "ATIVO" : "INATIVO"}
              </span>
            </div>
            <div className="flex justify-end">
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
        numeroLote={editando ? `#${String(editando.id || "").slice(0, 4).toUpperCase()}` : undefined}
        data={new Date().toLocaleDateString("pt-BR")}
        progresso={progressoForm}
        salvando={salvando}
        textoSalvar="Criar fornecedor"
        editando={!!editando}
        erro={erroForm}
        larguraMax={860}
      >
        {/* SEÇÃO 1: Identificação */}
        <Secao legenda="Dados básicos">
          <Linha cols={1}>
            <Campo
              label="Razão Social / Nome"
              obrigatorio
              hint="Nome juridico que aparece no contrato/CNPJ. E o que vai na NF-e."
              erro={nomeInvalido ? "Informe o nome do fornecedor." : undefined}
            >
              <input
                className="lux-input"
                value={form.nome}
                onChange={(e) => {
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
                onChange={(e) => setForm({ ...form, nomeFantasia: e.target.value })}
                placeholder="Ex.: Papel & Cia"
              />
            </Campo>
            <Campo label="Tipo de pessoa">
              <select
                className="lux-select"
                value={form.tipoPessoa}
                onChange={(e) => {
                  const novoTipo = e.target.value as TipoPessoa;
                  setCnpjErro("");
                  setForm((prev) => ({
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
            <Campo
              label={form.tipoPessoa === "PF" ? "CPF" : "CNPJ"}
              hint={
                form.tipoPessoa !== "PJ"
                  ? undefined
                  : buscandoCnpj
                    ? "Buscando dados na Receita…"
                    : "Preenche nome e endereço automaticamente."
              }
              erro={cnpjErro || undefined}
            >
              <input
                className="lux-input"
                value={form.cnpj}
                onChange={(e) => aplicarCnpj(e.target.value)}
                onBlur={(e) => aplicarCnpj(e.target.value)}
                placeholder={form.tipoPessoa === "PF" ? "000.000.000-00" : "00.000.000/0000-00"}
                inputMode="numeric"
                maxLength={form.tipoPessoa === "PF" ? 14 : 18}
                disabled={buscandoCnpj}
              />
            </Campo>
            <Campo label="Telefone">
              <input
                className="lux-input"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: mascararTelefone(e.target.value) })}
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
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="contato@fornecedor.com.br"
                autoComplete="email"
              />
            </Campo>
          </Linha>
        </Secao>

        {/* SEÇÃO 2: Dados Fiscais */}
        <Secao legenda="Dados fiscais / tributários">
          <Linha cols={2}>
            <Campo
              label="Indicador da IE (indIEDest)"
              hint="Define como o fornecedor aparece na NF-e como destinatario."
            >
              <select
                className="lux-select"
                value={form.indIEDest}
                onChange={(e) => {
                  const valor = e.target.value === "" ? "" : Number(e.target.value) as IndIEDest;
                  setForm((prev) => ({
                    ...prev,
                    indIEDest: valor,
                    ieIsenta: valor === 2 ? true : (valor === 1 ? false : prev.ieIsenta),
                    ie: valor === 2 ? "" : prev.ie,
                  }));
                }}
              >
                <option value="">Selecione…</option>
                {OPCOES_IND_IE_DEST.map((o) => (
                  <option key={o.valor} value={o.valor}>{o.label}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Regime Tributário (CRT)">
              <select
                className="lux-select"
                value={form.crt}
                onChange={(e) => setForm({ ...form, crt: e.target.value === "" ? "" : Number(e.target.value) as CRT })}
              >
                <option value="">Selecione…</option>
                {OPCOES_CRT.map((o) => (
                  <option key={o.valor} value={o.valor}>{o.label}</option>
                ))}
              </select>
            </Campo>
          </Linha>
          <Linha cols={2}>
            <Campo
              label="Inscrição Estadual"
              obrigatorio={form.indIEDest === 1}
              hint={form.ieIsenta ? "Isento — campo desabilitado." : undefined}
            >
              <input
                className="lux-input"
                value={form.ie}
                onChange={(e) => setForm({ ...form, ie: e.target.value.replace(/\D/g, "") })}
                placeholder="Apenas dígitos"
                inputMode="numeric"
                maxLength={14}
                disabled={form.ieIsenta}
                style={form.ieIsenta ? { opacity: 0.55 } : undefined}
              />
              <label
                className="flex items-center gap-2 mt-2 text-xs text-gp-muted cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={form.ieIsenta}
                  onChange={(e) => alternarIsento(e.target.checked)}
                  style={{ accentColor: C.accent }}
                />
                Isento de Inscrição Estadual
              </label>
            </Campo>
            <Campo label="Inscrição Municipal">
              <input
                className="lux-input"
                value={form.im}
                onChange={(e) => setForm({ ...form, im: e.target.value.replace(/\D/g, "") })}
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
                onChange={(e) => setForm({ ...form, emailNFe: e.target.value })}
                placeholder="fiscal@fornecedor.com.br"
              />
            </Campo>
          </Linha>
        </Secao>

        {/* SEÇÃO 3: Endereço */}
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
                onChange={(e) => aplicarCep(e.target.value)}
                onBlur={(e) => aplicarCep(e.target.value)}
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
                onChange={(e) => setEstado(e.target.value)}
                autoComplete="address-level1"
              >
                <option value="">UF</option>
                {ESTADOS_BR.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Cidade">
              <input
                className="lux-input"
                value={form.cidade}
                onChange={(e) => setForm({ ...form, cidade: e.target.value })}
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
                onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                placeholder="Rua, avenida, travessa…"
                autoComplete="street-address"
              />
            </Campo>
            <Campo label="Número">
              <input
                className="lux-input"
                value={form.numero}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
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
                onChange={(e) => setForm({ ...form, bairro: e.target.value })}
                placeholder="Centro"
              />
            </Campo>
            <Campo label="Complemento">
              <input
                className="lux-input"
                value={form.complemento}
                onChange={(e) => setForm({ ...form, complemento: e.target.value })}
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
                onChange={(e) => setForm({ ...form, codMunicipioIBGE: e.target.value.replace(/\D/g, "") })}
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
                onChange={(e) => setForm({ ...form, codPais: e.target.value })}
                maxLength={4}
              />
            </Campo>
            <Campo label="Nome País">
              <input
                className="lux-input"
                value={form.nomePais}
                onChange={(e) => setForm({ ...form, nomePais: e.target.value })}
                maxLength={60}
              />
            </Campo>
          </Linha>
        </Secao>
      </FormularioLuxuoso>
    </div>
  );
}
