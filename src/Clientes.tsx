import { useEffect, useState, useCallback, useMemo, type FormEvent } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";
import ActionsMenu from "./components/ActionsMenu";
import { FormularioLuxuoso, Secao, Linha, Campo } from "./components/FormularioLuxuoso";
import PerfilClienteModal from "./components/PerfilClienteModal";

// ============ CONSTANTES ============

const ESTADOS_BR = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO",
  "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
  "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];

type StatusFunil = "LEAD" | "CLIENTE_ATIVO" | "CLIENTE_INATIVO" | "PERDIDO";

interface StatusFunilMeta {
  id: StatusFunil;
  label: string;
  cor: string;
  icone: string;
}

const STATUS_FUNIL: StatusFunilMeta[] = [
  { id: "LEAD",            label: "Lead",            cor: "#7c3aed", icone: "🌱" },
  { id: "CLIENTE_ATIVO",   label: "Cliente ativo",   cor: "#22c55e", icone: "✅" },
  { id: "CLIENTE_INATIVO", label: "Cliente inativo", cor: "#64748b", icone: "💤" },
  { id: "PERDIDO",         label: "Perdido",         cor: "#ef4444", icone: "💔" },
];
const STATUS_MAP: Record<string, StatusFunilMeta> =
  Object.fromEntries(STATUS_FUNIL.map((s) => [s.id, s]));

const ORIGENS = [
  "INDICACAO", "INSTAGRAM", "FACEBOOK", "GOOGLE",
  "WHATSAPP", "WALK_IN", "SITE", "TELEFONE", "OUTROS",
];

const CAMPOS_PROGRESSO: (keyof FormCliente)[] = [
  "nome", "cpfCnpj", "email", "telefone",
  "cep", "endereco", "numero", "cidade", "estado", "observacoes",
];

// ============ TIPOS ============

interface TagCliente {
  id: string;
  nome: string;
  cor: string;
}

interface Cliente {
  id: string;
  nome: string;
  cpfCnpj?: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  observacoes?: string | null;
  origem?: string | null;
  statusFunil?: StatusFunil | null;
  dataNascimento?: string | null;
  tags?: TagCliente[];
  ativo: boolean;
}

interface FormCliente {
  nome: string;
  cpfCnpj: string;
  email: string;
  telefone: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  observacoes: string;
  origem: string;
  statusFunil: StatusFunil;
  dataNascimento: string;
}

interface ViaCepDados {
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
}

const VAZIO: FormCliente = {
  nome: "", cpfCnpj: "", email: "", telefone: "",
  endereco: "", numero: "", complemento: "", bairro: "",
  cidade: "", estado: "", cep: "", observacoes: "",
  origem: "", statusFunil: "LEAD", dataNascimento: "",
};

// ============ HELPERS ============

function mascararCpfCnpj(valor: string): string {
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

function mascararCep(valor: string): string {
  const d = (valor || "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

async function buscarCepViaCEP(cepMascarado: string): Promise<ViaCepDados | null> {
  const d = cepMascarado.replace(/\D/g, "");
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!r.ok) return null;
    const j = await r.json();
    if (j.erro) return null;
    return {
      endereco: j.logradouro || "",
      bairro: j.bairro || "",
      cidade: j.localidade || "",
      estado: j.uf || "",
    };
  } catch {
    return null;
  }
}

function dividirEnderecoCompleto(enderecoCompleto: string | null | undefined): {
  endereco: string;
  numero: string;
  complemento: string;
} {
  const valor = (enderecoCompleto || "").trim();
  if (!valor) return { endereco: "", numero: "", complemento: "" };
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

function juntarEnderecoCompleto(endereco: string, numero: string, complemento: string): string {
  const e = (endereco || "").trim();
  const n = (numero || "").trim();
  const c = (complemento || "").trim();
  let base = e;
  if (e && n) base = `${e}, ${n}`;
  else if (!e && n) base = n;
  if (c) return base ? `${base} - ${c}` : c;
  return base;
}

// ============ COMPONENTE PRINCIPAL ============

interface ClientesProps {
  user: SessionUser;
}

export default function Clientes({ user }: ClientesProps) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [search, setSearch] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState("");
  const [filtroStatusFunil, setFiltroStatusFunil] = useState("");
  const [filtroOrigem, setFiltroOrigem] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [form, setForm] = useState<FormCliente>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [cepNaoEncontrado, setCepNaoEncontrado] = useState(false);
  const [nomeInvalido, setNomeInvalido] = useState(false);
  const [perfilClienteId, setPerfilClienteId] = useState<string | null>(null);

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
      const data = await api.listarClientes({
        search, ativo: filtroAtivo,
        statusFunil: filtroStatusFunil,
        origem: filtroOrigem,
      }) as Cliente[];
      setClientes(data || []);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [search, filtroAtivo, filtroStatusFunil, filtroOrigem]);

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
    setModalAberto(true);
  }

  function abrirEdicao(cliente: Cliente) {
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
      bairro: cliente.bairro || "",
      cidade: cliente.cidade || "",
      estado: cliente.estado || "",
      cep: mascararCep(cliente.cep || ""),
      observacoes: cliente.observacoes || "",
      origem: cliente.origem || "",
      statusFunil: cliente.statusFunil || "LEAD",
      dataNascimento: cliente.dataNascimento
        ? new Date(cliente.dataNascimento).toISOString().slice(0, 10)
        : "",
    });
    setErroForm("");
    setNomeInvalido(false);
    setCepNaoEncontrado(false);
    setModalAberto(true);
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
      endereco: dados.endereco || prev.endereco,
      bairro: dados.bairro || prev.bairro,
      cidade: dados.cidade || prev.cidade,
      estado: dados.estado || prev.estado,
    }));
  }

  async function salvar(e: FormEvent<HTMLFormElement>) {
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
      const payload = {
        ...resto,
        endereco: juntarEnderecoCompleto(form.endereco, numero, complemento),
      };
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
      setErroForm((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(cliente: Cliente) {
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
      alert((err as Error).message);
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex gap-2.5 mb-4 flex-wrap items-center">
        <input
          placeholder="Buscar por nome, email ou CPF/CNPJ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar clientes"
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
          style={{ border: `1px solid ${C.border}`, padding: "10px 12px" }}
        >
          <option value="">Todos</option>
          <option value="true">Apenas ativos</option>
          <option value="false">Apenas inativos</option>
        </select>
        <select
          value={filtroStatusFunil}
          onChange={(e) => setFiltroStatusFunil(e.target.value)}
          aria-label="Filtrar por funil"
          className="bg-gp-surface text-gp-text rounded-lg text-[13px] cursor-pointer"
          style={{ border: `1px solid ${C.border}`, padding: "10px 12px" }}
        >
          <option value="">Todos os status</option>
          {STATUS_FUNIL.map((s) => (
            <option key={s.id} value={s.id}>{s.icone} {s.label}</option>
          ))}
        </select>
        <select
          value={filtroOrigem}
          onChange={(e) => setFiltroOrigem(e.target.value)}
          aria-label="Filtrar por origem"
          className="bg-gp-surface text-gp-text rounded-lg text-[13px] cursor-pointer"
          style={{ border: `1px solid ${C.border}`, padding: "10px 12px" }}
        >
          <option value="">Todas as origens</option>
          {ORIGENS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
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
          + Novo Cliente
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

      {/* Tabela */}
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
          <div>CPF/CNPJ</div>
          <div>Email</div>
          <div>Telefone</div>
          <div>Status</div>
          <div className="text-right">Ações</div>
        </div>

        {carregando ? (
          <div className="py-[30px] text-center text-gp-muted text-[13px]">Carregando...</div>
        ) : clientes.length === 0 ? (
          <div className="py-[30px] text-center text-gp-muted text-[13px]">Nenhum cliente encontrado.</div>
        ) : clientes.map((c) => (
          <div
            key={c.id}
            className="grid items-center text-[13px]"
            style={{
              gridTemplateColumns: "2fr 1.2fr 1.5fr 1fr 100px 80px",
              padding: "12px 16px",
              borderBottom: `1px solid ${C.border}`,
              opacity: c.ativo ? 1 : 0.55,
            }}
          >
            <div>
              <div className="text-gp-white font-semibold">{c.nome}</div>
              <div className="flex gap-1 flex-wrap mt-1">
                {c.statusFunil && STATUS_MAP[c.statusFunil] && (() => {
                  const s = STATUS_MAP[c.statusFunil!];
                  return (
                    <span
                      className="text-[10px] font-bold rounded inline-flex items-center gap-[3px]"
                      style={{
                        background: s.cor + "22",
                        color: s.cor,
                        padding: "1px 6px",
                        border: `1px solid ${s.cor}55`,
                      }}
                    >
                      {s.icone} {s.label}
                    </span>
                  );
                })()}
                {c.origem && (
                  <span
                    className="text-[10px] font-semibold rounded text-gp-muted"
                    style={{
                      background: C.bg,
                      padding: "1px 6px",
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    📍 {c.origem}
                  </span>
                )}
                {c.tags && c.tags.map((t) => (
                  <span
                    key={t.id}
                    className="text-[10px] font-bold rounded"
                    style={{
                      background: t.cor + "22",
                      color: t.cor,
                      padding: "1px 6px",
                      border: `1px solid ${t.cor}55`,
                    }}
                  >
                    {t.nome}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-gp-text">{c.cpfCnpj || "—"}</div>
            <div className="text-gp-text overflow-hidden text-ellipsis whitespace-nowrap">{c.email || "—"}</div>
            <div className="text-gp-text">{c.telefone || "—"}</div>
            <div>
              <span
                className="text-[11px] font-bold rounded-md"
                style={{
                  padding: "3px 10px",
                  background: c.ativo ? C.green + "22" : C.muted + "33",
                  color: c.ativo ? C.green : C.muted,
                  border: `1px solid ${c.ativo ? C.green + "55" : C.muted + "55"}`,
                }}
              >
                {c.ativo ? "ATIVO" : "INATIVO"}
              </span>
            </div>
            <div className="flex justify-end">
              <ActionsMenu
                items={[
                  {
                    label: "Ver Perfil",
                    icon: "◉",
                    color: C.accent,
                    onClick: () => setPerfilClienteId(c.id),
                  },
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
        numeroLote={editando ? `#${String(editando.id || "").slice(0, 4).toUpperCase()}` : undefined}
        data={new Date().toLocaleDateString("pt-BR")}
        progresso={progressoForm}
        salvando={salvando}
        textoSalvar="Criar cliente"
        editando={!!editando}
        erro={erroForm}
        larguraMax={760}
        compacto
      >
        <Secao legenda="Identificação">
          <Linha cols={1}>
            <Campo
              label="Nome completo"
              obrigatorio
              erro={nomeInvalido ? "Informe o nome do cliente." : undefined}
            >
              <input
                className="lux-input"
                value={form.nome}
                onChange={(e) => {
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
          <Linha style={{ gridTemplateColumns: "185px 160px 1fr" }}>
            <Campo label="CPF / CNPJ">
              <input
                className="lux-input"
                value={form.cpfCnpj}
                onChange={(e) => setForm({ ...form, cpfCnpj: mascararCpfCnpj(e.target.value) })}
                placeholder="000.000.000-00"
                inputMode="numeric"
                maxLength={18}
              />
            </Campo>
            <Campo label="Telefone">
              <input
                className="lux-input"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                placeholder="(00) 00000-0000"
                inputMode="numeric"
                autoComplete="tel"
              />
            </Campo>
            <Campo label="E-mail">
              <input
                className="lux-input"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="cliente@empresa.com.br"
                autoComplete="email"
              />
            </Campo>
          </Linha>
        </Secao>

        <Secao legenda="Endereço">
          <Linha variant="addr-tilt">
            <Campo
              label="CEP"
              hint={
                buscandoCep
                  ? "Buscando…"
                  : cepNaoEncontrado
                    ? "Não encontrado"
                    : undefined
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
            <Campo label="Cidade">
              <input
                className="lux-input"
                value={form.cidade}
                onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                placeholder="São Paulo"
                autoComplete="address-level2"
              />
            </Campo>
            <Campo label="Estado">
              <select
                className="lux-select"
                value={form.estado}
                onChange={(e) => setForm({ ...form, estado: e.target.value })}
                autoComplete="address-level1"
              >
                <option value="">UF</option>
                {ESTADOS_BR.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </Campo>
          </Linha>
          <Linha style={{ gridTemplateColumns: "1fr 120px" }}>
            <Campo label="Logradouro">
              <input
                className="lux-input"
                value={form.endereco}
                onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                placeholder="Rua, avenida ou alameda"
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
              />
            </Campo>
          </Linha>
          <Linha cols={2}>
            <Campo label="Bairro">
              <input
                className="lux-input"
                value={form.bairro || ""}
                onChange={(e) => setForm({ ...form, bairro: e.target.value })}
                placeholder="Centro, Jardim das Flores…"
                autoComplete="address-level3"
              />
            </Campo>
            <Campo label="Complemento">
              <input
                className="lux-input"
                value={form.complemento || ""}
                onChange={(e) => setForm({ ...form, complemento: e.target.value })}
                placeholder="Apto, sala, bloco"
              />
            </Campo>
          </Linha>
        </Secao>

        <Secao legenda="CRM / Funil">
          <Linha cols={2}>
            <Campo label="Status no funil">
              <select
                className="lux-select"
                value={form.statusFunil}
                onChange={(e) => setForm({ ...form, statusFunil: e.target.value as StatusFunil })}
              >
                {STATUS_FUNIL.map((s) => (
                  <option key={s.id} value={s.id}>{s.icone} {s.label}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Origem (como nos conheceu)">
              <select
                className="lux-select"
                value={form.origem}
                onChange={(e) => setForm({ ...form, origem: e.target.value })}
              >
                <option value="">— Não informado —</option>
                {ORIGENS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </Campo>
          </Linha>
          <Linha cols={1}>
            <Campo label="Data de nascimento / fundação" hint="Usada na tela de Aniversariantes">
              <input
                type="date"
                className="lux-input"
                value={form.dataNascimento}
                onChange={(e) => setForm({ ...form, dataNascimento: e.target.value })}
                aria-label="Data de nascimento"
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
                onChange={(e) => setForm({ ...form, observacoes: e.target.value.slice(0, 500) })}
                maxLength={500}
                placeholder="Preferências de contato, segmento, histórico relevante…"
                rows={3}
              />
            </Campo>
          </Linha>
        </Secao>
      </FormularioLuxuoso>

      {perfilClienteId && (
        <PerfilClienteModal
          clienteId={perfilClienteId}
          onFechar={() => setPerfilClienteId(null)}
          user={user}
        />
      )}
    </div>
  );
}
