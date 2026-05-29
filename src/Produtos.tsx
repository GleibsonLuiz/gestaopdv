import { useEffect, useState, useCallback, useRef, useMemo, type CSSProperties, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api, BASE_URL, getEmpresa, type SessionUser, type SegmentoEmpresa } from "./lib/api";
import MovimentarEstoqueModal from "./MovimentarEstoqueModal";
import HistoricoComprasModal from "./HistoricoComprasModal";
import FabricanteModal from "./FabricanteModal";
import ActionsMenu from "./components/ActionsMenu";
import EtiquetaPrecoModal from "./components/EtiquetaPrecoModal";
import { FormularioLuxuoso, Secao, Linha, Campo as CampoLux } from "./components/FormularioLuxuoso";
import SelectBusca from "./components/SelectBusca";
import { Abas } from "./components/AbasFormulario";

// ============ TIPOS ============

type TipoItem = "PRODUTO" | "SERVICO";
type OrigemMercadoria =
  | "NACIONAL"
  | "ESTRANGEIRA_IMP_DIRETA"
  | "ESTRANGEIRA_ADQUIRIDA_BR"
  | "NACIONAL_IMP_SUP_40"
  | "NACIONAL_PROC_BAS"
  | "NACIONAL_IMP_INF_40"
  | "ESTRANGEIRA_IMP_SEM_SIM"
  | "ESTRANGEIRA_ADQ_SEM_SIM"
  | "NACIONAL_IMP_SUP_70";
type RegimeTributario = "SIMPLES_NACIONAL" | "SIMPLES_EXCESSO_SUBLIMITE" | "REGIME_NORMAL";

interface Categoria {
  id: string;
  nome: string;
  [extra: string]: unknown;
}

interface Fornecedor {
  id: string;
  nome: string;
  cnpj?: string | null;
  [extra: string]: unknown;
}

interface Fabricante {
  id: string;
  nome: string;
  [extra: string]: unknown;
}

interface CategoriaRef { nome: string; }
interface FornecedorRef { nome: string; }

interface Produto {
  id: string;
  codigo: string;
  codigoBarras?: string | null;
  referencia?: string | null;
  nome: string;
  descricao?: string | null;
  fabricanteId?: string | null;
  fabricante?: { nome: string } | null;
  tipoItem?: TipoItem;
  precoVenda?: number | string | null;
  precoCusto?: number | string | null;
  estoque: number;
  estoqueMinimo: number;
  unidade?: string | null;
  categoriaId?: string | null;
  fornecedorId?: string | null;
  categoria?: CategoriaRef | null;
  fornecedor?: FornecedorRef | null;
  imagem?: string | null;
  ativo: boolean;
  // Bloco fiscal
  ncm?: string | null;
  cest?: string | null;
  cfopPadrao?: string | null;
  origem?: OrigemMercadoria;
  unidadeTributavel?: string | null;
  regimeTributario?: RegimeTributario;
  cstIcms?: string | null;
  csosnIcms?: string | null;
  aliquotaIcms?: number | string | null;
  cstPis?: string | null;
  aliquotaPis?: number | string | null;
  cstCofins?: string | null;
  aliquotaCofins?: number | string | null;
  codBeneficioFiscal?: string | null;
  pesoLiquido?: number | string | null;
  pesoBruto?: number | string | null;
  [extra: string]: unknown;
}

interface FormProduto {
  codigo: string;
  codigoBarras: string;
  referencia: string;
  nome: string;
  descricao: string;
  fabricanteId: string;
  tipoItem: TipoItem;
  precoVenda: string;
  precoCusto: string;
  estoque: string;
  estoqueMinimo: string;
  unidade: string;
  categoriaId: string;
  fornecedorId: string;
  ncm: string;
  cest: string;
  cfopPadrao: string;
  origem: OrigemMercadoria;
  unidadeTributavel: string;
  regimeTributario: RegimeTributario;
  cstIcms: string;
  csosnIcms: string;
  aliquotaIcms: string;
  cstPis: string;
  aliquotaPis: string;
  cstCofins: string;
  aliquotaCofins: string;
  codBeneficioFiscal: string;
  pesoLiquido: string;
  pesoBruto: string;
  // ETAPA#6: campos extras por segmento de empresa (renderizados condicionalmente)
  codigoOEM: string;       // AUTO_PECAS
  marcaPeca: string;       // AUTO_PECAS
  compatibilidade: string; // AUTO_PECAS (textarea: 1 modelo por linha)
  lote: string;            // FARMACIA
  validade: string;        // FARMACIA (YYYY-MM-DD)
  registroAnvisa: string;  // FARMACIA
  pmc: string;             // FARMACIA (Preco Maximo ao Consumidor)
}

interface Markup {
  impostos: string;
  taxasCartao: string;
  margemLucro: string;
}

const VAZIO: FormProduto = {
  codigo: "", codigoBarras: "", referencia: "",
  nome: "", descricao: "", fabricanteId: "",
  tipoItem: "PRODUTO",
  precoVenda: "", precoCusto: "",
  estoque: "0", estoqueMinimo: "0", unidade: "UN",
  categoriaId: "", fornecedorId: "",
  ncm: "", cest: "", cfopPadrao: "", origem: "NACIONAL",
  unidadeTributavel: "",
  regimeTributario: "SIMPLES_NACIONAL",
  cstIcms: "", csosnIcms: "",
  aliquotaIcms: "",
  cstPis: "", aliquotaPis: "",
  cstCofins: "", aliquotaCofins: "",
  codBeneficioFiscal: "",
  pesoLiquido: "", pesoBruto: "",
  codigoOEM: "", marcaPeca: "", compatibilidade: "",
  lote: "", validade: "", registroAnvisa: "", pmc: "",
};

const MARKUP_VAZIO: Markup = { impostos: "", taxasCartao: "", margemLucro: "" };

const CAMPOS_PROGRESSO: (keyof FormProduto)[] = [
  "codigo", "nome", "codigoBarras", "referencia", "descricao",
  "precoCusto", "precoVenda", "estoque", "unidade", "categoriaId", "fornecedorId",
];

// ============ HELPERS ============

export function urlImagem(imagem: string | null | undefined): string | null {
  if (!imagem) return null;
  if (/^https?:\/\//i.test(imagem)) return imagem;
  return `${BASE_URL}${imagem}`;
}

const fmtBRL = (v: number | string | null | undefined): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

// Estoque agora aceita decimal (Decimal(12,3)) — exibe ate 3 casas suprimindo
// zeros a direita. "1.500" -> "1,5", "2.000" -> "2".
const fmtQtd = (v: number | string | null | undefined): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
};

function proximoCodigoSugerido(produtos: Produto[]): string {
  const numericos = produtos
    .map((p) => String(p.codigo || "").match(/^(\d+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => parseInt(m[1], 10))
    .filter((n) => Number.isFinite(n));
  const proximo = numericos.length === 0 ? 1 : Math.max(...numericos) + 1;
  const len = Math.max(4, String(proximo).length);
  return String(proximo).padStart(len, "0");
}

// ETAPA#6: monta o objeto camposSegmento conforme segmento da empresa.
// Retorna null se nao houver nenhum campo extra preenchido (backend grava NULL).
function montarCamposSegmento(form: FormProduto, segmento: SegmentoEmpresa | undefined): Record<string, unknown> | null {
  if (!segmento || segmento === "GERAL" || segmento === "PAPELARIA") return null;
  const out: Record<string, unknown> = {};
  if (segmento === "AUTO_PECAS") {
    if (form.codigoOEM.trim()) out.codigoOEM = form.codigoOEM.trim();
    if (form.marcaPeca.trim()) out.marcaPeca = form.marcaPeca.trim();
    const compat = form.compatibilidade
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 50);
    if (compat.length) out.compatibilidade = compat;
  }
  if (segmento === "FARMACIA") {
    if (form.lote.trim()) out.lote = form.lote.trim();
    if (form.validade.trim()) out.validade = form.validade.trim();
    if (form.registroAnvisa.trim()) out.registroAnvisa = form.registroAnvisa.trim();
    if (form.pmc.trim()) {
      const n = Number(form.pmc.replace(",", "."));
      if (Number.isFinite(n) && n >= 0) out.pmc = n;
    }
  }
  return Object.keys(out).length ? out : null;
}

// ============ COMPONENTE PRINCIPAL ============

interface ProdutosProps {
  user: SessionUser;
}

export default function Produtos({ user }: ProdutosProps) {
  // ETAPA#6: segmento da empresa (vem do localStorage, populado no login/me).
  // Default GERAL se nao definido (compatibilidade com sessoes antigas).
  const segmentoEmpresa: SegmentoEmpresa = (getEmpresa()?.segmento as SegmentoEmpresa) || "GERAL";
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [fabricantes, setFabricantes] = useState<Fabricante[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [search, setSearch] = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroFornecedor, setFiltroFornecedor] = useState("");
  const [estoqueBaixo, setEstoqueBaixo] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [form, setForm] = useState<FormProduto>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [novaCategoria, setNovaCategoria] = useState("");
  const [modalFabricante, setModalFabricante] = useState(false);
  const [modalEstoqueProduto, setModalEstoqueProduto] = useState<Produto | null>(null);
  const [modalEtiquetaProduto, setModalEtiquetaProduto] = useState<Produto | null>(null);
  const [modalHistoricoProduto, setModalHistoricoProduto] = useState<Produto | null>(null);

  const [markup, setMarkup] = useState<Markup>(MARKUP_VAZIO);

  const [imagemArquivo, setImagemArquivo] = useState<File | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [removerImagem, setRemoverImagem] = useState(false);
  const inputImagemRef = useRef<HTMLInputElement | null>(null);

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE";

  const progressoForm = useMemo(() => {
    let preenchidos = 0;
    for (const k of CAMPOS_PROGRESSO) {
      if (String(form[k] || "").trim()) preenchidos++;
    }
    if (imagemPreview) preenchidos++;
    const total = CAMPOS_PROGRESSO.length + 1;
    return Math.round((preenchidos / total) * 100);
  }, [form, imagemPreview]);

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
      }) as Produto[];
      setProdutos(data || []);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [search, filtroAtivo, filtroCategoria, filtroFornecedor, estoqueBaixo]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  useEffect(() => {
    api.listarCategorias().then((r) => setCategorias((r as Categoria[]) || [])).catch(() => {});
    api.listarFornecedores({ ativo: "true" }).then((r) => setFornecedores((r as Fornecedor[]) || [])).catch(() => {});
    api.listarFabricantes().then((r) => setFabricantes((r as Fabricante[]) || [])).catch(() => {});
  }, []);

  function flash(texto: string) {
    setMensagem(texto);
    setTimeout(() => setMensagem(""), 2500);
  }

  function resetarImagem() {
    setImagemArquivo(null);
    setImagemPreview(null);
    setRemoverImagem(false);
    if (inputImagemRef.current) inputImagemRef.current.value = "";
  }

  async function abrirNovo() {
    setEditando(null);
    setErroForm("");
    setNovaCategoria("");
    setMarkup(MARKUP_VAZIO);
    resetarImagem();
    let codigo = "";
    try {
      const todos = await api.listarProdutos({}) as Produto[];
      codigo = proximoCodigoSugerido(todos);
    } catch {
      codigo = proximoCodigoSugerido(produtos);
    }
    setForm({ ...VAZIO, codigo });
    setModalAberto(true);
  }

  async function sugerirCodigo() {
    try {
      const todos = await api.listarProdutos({}) as Produto[];
      setForm((f) => ({ ...f, codigo: proximoCodigoSugerido(todos) }));
    } catch {
      setForm((f) => ({ ...f, codigo: proximoCodigoSugerido(produtos) }));
    }
  }

  function abrirEdicao(p: Produto) {
    setEditando(p);
    setForm({
      codigo: p.codigo || "",
      codigoBarras: p.codigoBarras || "",
      referencia: p.referencia || "",
      nome: p.nome || "",
      descricao: p.descricao || "",
      fabricanteId: p.fabricanteId || "",
      tipoItem: p.tipoItem || "PRODUTO",
      precoVenda: p.precoVenda != null ? String(p.precoVenda) : "",
      precoCusto: p.precoCusto != null ? String(p.precoCusto) : "",
      estoque: String(p.estoque ?? 0),
      estoqueMinimo: String(p.estoqueMinimo ?? 0),
      unidade: p.unidade || "UN",
      categoriaId: p.categoriaId || "",
      fornecedorId: p.fornecedorId || "",
      ncm: p.ncm || "",
      cest: p.cest || "",
      cfopPadrao: p.cfopPadrao || "",
      origem: p.origem || "NACIONAL",
      unidadeTributavel: p.unidadeTributavel || "",
      regimeTributario: p.regimeTributario || "SIMPLES_NACIONAL",
      cstIcms: p.cstIcms || "",
      csosnIcms: p.csosnIcms || "",
      aliquotaIcms: p.aliquotaIcms != null ? String(p.aliquotaIcms) : "",
      cstPis: p.cstPis || "",
      aliquotaPis: p.aliquotaPis != null ? String(p.aliquotaPis) : "",
      cstCofins: p.cstCofins || "",
      aliquotaCofins: p.aliquotaCofins != null ? String(p.aliquotaCofins) : "",
      codBeneficioFiscal: p.codBeneficioFiscal || "",
      pesoLiquido: p.pesoLiquido != null ? String(p.pesoLiquido) : "",
      pesoBruto: p.pesoBruto != null ? String(p.pesoBruto) : "",
      // ETAPA#6: campos extras por segmento (vem do JSON camposSegmento)
      codigoOEM: (p as any).camposSegmento?.codigoOEM || "",
      marcaPeca: (p as any).camposSegmento?.marcaPeca || "",
      compatibilidade: Array.isArray((p as any).camposSegmento?.compatibilidade)
        ? (p as any).camposSegmento.compatibilidade.join("\n") : "",
      lote: (p as any).camposSegmento?.lote || "",
      validade: (p as any).camposSegmento?.validade || "",
      registroAnvisa: (p as any).camposSegmento?.registroAnvisa || "",
      pmc: (p as any).camposSegmento?.pmc != null ? String((p as any).camposSegmento.pmc) : "",
    });
    setErroForm("");
    setNovaCategoria("");
    setMarkup(MARKUP_VAZIO);
    setImagemArquivo(null);
    setImagemPreview(p.imagem ? urlImagem(p.imagem) : null);
    setRemoverImagem(false);
    if (inputImagemRef.current) inputImagemRef.current.value = "";
    setModalAberto(true);
  }

  function escolherImagem(file: File | null | undefined) {
    if (!file) return;
    if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) {
      setErroForm("Apenas JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErroForm("Imagem maior que 2MB.");
      return;
    }
    setErroForm("");
    setImagemArquivo(file);
    setRemoverImagem(false);
    setImagemPreview((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function limparImagem() {
    if (imagemPreview && imagemPreview.startsWith("blob:")) {
      URL.revokeObjectURL(imagemPreview);
    }
    setImagemArquivo(null);
    setImagemPreview(null);
    if (inputImagemRef.current) inputImagemRef.current.value = "";
    setRemoverImagem(!!editando?.imagem);
  }

  async function criarCategoriaInline() {
    const nome = novaCategoria.trim();
    if (!nome) return;
    try {
      const cat = await api.criarCategoria({ nome }) as Categoria;
      setCategorias((prev) => [...prev, cat].sort((a, b) => a.nome.localeCompare(b.nome)));
      setForm((f) => ({ ...f, categoriaId: cat.id }));
      setNovaCategoria("");
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErroForm("");
    if (!form.codigo.trim()) { setErroForm("Código é obrigatório"); return; }
    if (!form.nome.trim()) { setErroForm("Nome é obrigatório"); return; }
    if (form.precoVenda === "" || Number.isNaN(Number(form.precoVenda))) {
      setErroForm("Preço de venda inválido"); return;
    }

    setSalvando(true);
    try {
      const ehServico = form.tipoItem === "SERVICO";
      const payload = {
        codigo: form.codigo,
        codigoBarras: form.codigoBarras || null,
        referencia: form.referencia || null,
        nome: form.nome,
        descricao: form.descricao,
        fabricanteId: form.fabricanteId || null,
        tipoItem: form.tipoItem,
        precoVenda: form.precoVenda,
        precoCusto: form.precoCusto === "" ? null : form.precoCusto,
        estoque: ehServico ? "0" : form.estoque,
        estoqueMinimo: ehServico ? "0" : form.estoqueMinimo,
        unidade: form.unidade,
        categoriaId: form.categoriaId || null,
        fornecedorId: form.fornecedorId || null,
        ncm: form.ncm || null,
        cest: form.cest || null,
        cfopPadrao: form.cfopPadrao || null,
        origem: form.origem,
        unidadeTributavel: form.unidadeTributavel || null,
        regimeTributario: form.regimeTributario,
        cstIcms: form.cstIcms || null,
        csosnIcms: form.csosnIcms || null,
        aliquotaIcms: form.aliquotaIcms === "" ? null : form.aliquotaIcms,
        cstPis: form.cstPis || null,
        aliquotaPis: form.aliquotaPis === "" ? null : form.aliquotaPis,
        cstCofins: form.cstCofins || null,
        aliquotaCofins: form.aliquotaCofins === "" ? null : form.aliquotaCofins,
        codBeneficioFiscal: form.codBeneficioFiscal || null,
        pesoLiquido: form.pesoLiquido === "" ? null : form.pesoLiquido,
        pesoBruto: form.pesoBruto === "" ? null : form.pesoBruto,
        // ETAPA#6: monta camposSegmento conforme o segmento da empresa.
        // O backend sanitiza/descarta chaves que nao baterem com a whitelist.
        camposSegmento: montarCamposSegmento(form, segmentoEmpresa),
      };
      const produtoSalvo = (editando
        ? await api.atualizarProduto(editando.id, payload)
        : await api.criarProduto(payload)) as Produto;

      try {
        if (imagemArquivo) {
          await api.enviarImagemProduto(produtoSalvo.id, imagemArquivo);
        } else if (removerImagem && editando?.imagem) {
          await api.excluirImagemProduto(produtoSalvo.id);
        }
      } catch (errImg) {
        flash(`Produto salvo, mas a imagem falhou: ${(errImg as Error).message}`);
        setModalAberto(false);
        carregar();
        return;
      }

      flash(editando ? "Produto atualizado" : "Produto criado");
      setModalAberto(false);
      carregar();
    } catch (err) {
      setErroForm((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(p: Produto): Promise<boolean> {
    try {
      if (p.ativo) {
        if (!confirm(`Inativar "${p.nome}"?`)) return false;
        await api.excluirProduto(p.id);
        flash("Produto inativado");
      } else {
        await api.atualizarProduto(p.id, { ativo: true });
        flash("Produto reativado");
      }
      carregar();
      return true;
    } catch (err) {
      alert((err as Error).message);
      return false;
    }
  }

  return (
    <div>
      <div className="flex gap-2.5 mb-2.5 flex-wrap items-center">
        <input
          placeholder="Buscar por código, código de barras, referência ou nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar produtos"
          className="bg-gp-surface text-gp-text rounded-lg text-sm"
          style={{
            flex: "1 1 240px",
            border: `1px solid ${C.border}`,
            padding: "10px 12px",
            outline: "none",
          }}
        />
        <select
          value={filtroAtivo}
          onChange={(e) => setFiltroAtivo(e.target.value)}
          aria-label="Filtrar por status"
          style={selectStyle}
        >
          <option value="">Todos status</option>
          <option value="true">Apenas ativos</option>
          <option value="false">Apenas inativos</option>
        </select>
        <SelectBusca<Categoria>
          opcoes={categorias}
          value={filtroCategoria}
          onChange={setFiltroCategoria}
          placeholder="Todas categorias"
          style={{ ...selectStyle, minWidth: 160 }}
        />
        <SelectBusca<Fornecedor>
          opcoes={fornecedores}
          value={filtroFornecedor}
          onChange={setFiltroFornecedor}
          subLabelFn={(f) => f.cnpj}
          placeholder="Todos fornecedores"
          style={{ ...selectStyle, minWidth: 160 }}
        />
        <label className="text-gp-muted text-[13px] flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={estoqueBaixo}
            onChange={(e) => setEstoqueBaixo(e.target.checked)}
          />
          Estoque baixo
        </label>
        {podeEditar && (
          <button
            type="button"
            onClick={abrirNovo}
            className="text-gp-white border-none rounded-lg text-sm font-bold cursor-pointer"
            style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              padding: "10px 18px",
            }}
          >
            + Novo Produto
          </button>
        )}
      </div>

      {mensagem && <div style={alertStyle(C.green)}>{mensagem}</div>}
      {erro && <div style={alertStyle(C.red)}>{erro}</div>}

      <div
        className="bg-gp-card rounded-xl overflow-hidden"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div
          className="grid bg-gp-surface text-gp-muted text-xs font-bold uppercase"
          style={{
            gridTemplateColumns: "100px 1.6fr 1.2fr 110px 110px 90px 100px 80px",
            padding: "12px 16px",
            borderBottom: `1px solid ${C.border}`,
            letterSpacing: 0.5,
          }}
        >
          <div>Código</div>
          <div>Nome</div>
          <div>Categoria / Fornecedor</div>
          <div className="text-right">Preço Venda</div>
          <div className="text-right">Estoque</div>
          <div>Unid</div>
          <div>Status</div>
          <div className="text-right">Ações</div>
        </div>

        {carregando ? (
          <div className="py-[30px] text-center text-gp-muted text-[13px]">Carregando...</div>
        ) : produtos.length === 0 ? (
          <div className="py-[30px] text-center text-gp-muted text-[13px]">Nenhum produto encontrado.</div>
        ) : produtos.map((p) => {
          const ehServico = p.tipoItem === "SERVICO";
          // estoque/estoqueMinimo agora sao Decimal(12,3) — convertem para
          // Number antes de comparar (vem como string da API JSON).
          const baixo = !ehServico && Number(p.estoque) <= Number(p.estoqueMinimo);
          return (
            <div
              key={p.id}
              className="grid items-center text-[13px]"
              style={{
                gridTemplateColumns: "100px 1.6fr 1.2fr 110px 110px 90px 100px 80px",
                padding: "12px 16px",
                borderBottom: `1px solid ${C.border}`,
                opacity: p.ativo ? 1 : 0.55,
              }}
            >
              <div className="text-gp-muted font-mono text-xs">
                <div>{p.codigo}</div>
                {p.codigoBarras && (
                  <div className="text-[10px] mt-0.5 text-gp-accent" title="Código de barras">
                    📊 {p.codigoBarras}
                  </div>
                )}
                {p.referencia && (
                  <div className="text-[10px] mt-px" style={{ color: C.purple }} title="Referência">
                    🏷 {p.referencia}
                  </div>
                )}
              </div>
              <div className="flex gap-2.5 items-center min-w-0">
                <Miniatura url={p.imagem} nome={p.nome} servico={ehServico} />
                <div className="min-w-0">
                  <div className="text-gp-white font-semibold overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-1.5">
                    {p.nome}
                    {ehServico && (
                      <span
                        className="text-[9px] font-extrabold rounded"
                        style={{
                          padding: "2px 6px",
                          background: C.purple + "22",
                          color: C.purple,
                          border: `1px solid ${C.purple}55`,
                          letterSpacing: 0.4,
                        }}
                      >
                        SERVIÇO
                      </span>
                    )}
                  </div>
                  {p.descricao && (
                    <div className="text-gp-muted text-[11px] mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap">
                      {p.descricao}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-xs">
                <div className="text-gp-text">{p.categoria?.nome || <span className="text-gp-muted">—</span>}</div>
                <div className="text-gp-muted mt-0.5">{p.fornecedor?.nome || "—"}</div>
              </div>
              <div className="text-right text-gp-green font-semibold">
                {fmtBRL(p.precoVenda)}
              </div>
              <div className="text-right">
                {ehServico ? (
                  <span
                    title="Serviço — sem controle de estoque"
                    className="font-bold text-base"
                    style={{ color: C.purple, letterSpacing: 0.5 }}
                  >
                    ♾
                  </span>
                ) : (
                  <span style={{ color: baixo ? C.red : C.text, fontWeight: baixo ? 700 : 500 }}>
                    {fmtQtd(p.estoque)}
                    {baixo && <span className="text-[10px] ml-1.5">⚠</span>}
                  </span>
                )}
              </div>
              <div className="text-gp-muted text-xs">{ehServico ? "—" : p.unidade}</div>
              <div>
                <span
                  className="text-[11px] font-bold rounded-md"
                  style={{
                    padding: "3px 10px",
                    background: p.ativo ? C.green + "22" : C.muted + "33",
                    color: p.ativo ? C.green : C.muted,
                    border: `1px solid ${p.ativo ? C.green + "55" : C.muted + "55"}`,
                  }}
                >
                  {p.ativo ? "ATIVO" : "INATIVO"}
                </span>
              </div>
              <div className="flex justify-end">
                <ActionsMenu
                  items={[
                    {
                      label: "Movimentar estoque",
                      icon: "📊",
                      color: C.yellow,
                      onClick: () => setModalEstoqueProduto(p),
                      hidden: !podeEditar || ehServico,
                    },
                    {
                      label: "Imprimir etiqueta",
                      icon: "🏷️",
                      color: C.purple,
                      onClick: () => setModalEtiquetaProduto(p),
                      hidden: ehServico,
                    },
                    {
                      label: "Editar",
                      icon: "✎",
                      color: C.accent,
                      onClick: () => abrirEdicao(p),
                      hidden: !podeEditar,
                    },
                    {
                      label: p.ativo ? "Inativar" : "Reativar",
                      icon: p.ativo ? "⊘" : "↻",
                      color: p.ativo ? C.yellow : C.green,
                      onClick: () => alternarAtivo(p),
                      hidden: !podeEditar,
                    },
                  ]}
                />
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
            const m = mov as { estoqueAntes: number; estoqueDepois: number };
            setModalEstoqueProduto(null);
            flash(`Estoque atualizado: ${m.estoqueAntes} → ${m.estoqueDepois}`);
            carregar();
          }}
        />
      )}

      {modalEtiquetaProduto && (
        <EtiquetaPrecoModal
          produto={modalEtiquetaProduto}
          onFechar={() => setModalEtiquetaProduto(null)}
        />
      )}

      {modalHistoricoProduto && (
        <HistoricoComprasModal
          produtoId={modalHistoricoProduto.id}
          produtoNome={`${modalHistoricoProduto.codigo} — ${modalHistoricoProduto.nome}`}
          onFechar={() => setModalHistoricoProduto(null)}
        />
      )}

      {modalFabricante && (
        <FabricanteModal
          onFechar={() => setModalFabricante(false)}
          onCriado={(fab) => {
            setFabricantes((prev) =>
              [...prev, fab].sort((a, b) => a.nome.localeCompare(b.nome)));
            setForm((f) => ({ ...f, fabricanteId: fab.id }));
            setModalFabricante(false);
          }}
        />
      )}

      <FormularioLuxuoso
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        onSubmit={salvar}
        titulo={editando ? "Editar" : "Novo"}
        tituloDestaque="Produto"
        subtitulo={
          editando
            ? "Atualize as informacoes deste produto. Campos marcados com • sao obrigatorios."
            : "Cadastre um produto no seu catalogo. Campos marcados com • sao obrigatorios."
        }
        numeroLote={editando ? `#${form.codigo || ""}` : undefined}
        data={new Date().toLocaleDateString("pt-BR")}
        progresso={progressoForm}
        salvando={salvando}
        textoSalvar="Criar produto"
        editando={!!editando}
        erro={erroForm}
        larguraMax={920}
        compacto
        acaoSecundaria={editando ? (
          <div className="flex gap-2.5 flex-wrap">
            <button
              type="button"
              className="lux-btn lux-btn--ghost"
              disabled={salvando}
              onClick={async () => {
                const mudou = await alternarAtivo(editando);
                if (mudou) setModalAberto(false);
              }}
              style={{
                color: editando.ativo ? C.yellow : C.green,
                borderColor: (editando.ativo ? C.yellow : C.green) + "55",
              }}
              title={editando.ativo
                ? "Inativar este produto (some do PDV; histórico preservado)"
                : "Reativar este produto (volta a aparecer no PDV)"}
            >
              {editando.ativo ? "⊘ Inativar produto" : "↻ Reativar produto"}
            </button>
            {editando.tipoItem !== "SERVICO" && (
              <button
                type="button"
                className="lux-btn lux-btn--ghost"
                disabled={salvando}
                onClick={() => setModalHistoricoProduto(editando)}
                style={{ color: C.accent, borderColor: C.accent + "55" }}
                title="Ver todas as compras deste produto por fornecedor"
              >
                🚚 Histórico de compras
              </button>
            )}
          </div>
        ) : null}
      >
        <Abas
          abas={[
            { id: "gerais",  icone: "📋", label: "Dados Gerais" },
            { id: "classif", icone: "🏷️", label: "Classificacao" },
            ...(segmentoEmpresa === "AUTO_PECAS"
              ? [{ id: "segmento", icone: "🔧", label: "Auto-Peças" }]
              : segmentoEmpresa === "FARMACIA"
                ? [{ id: "segmento", icone: "💊", label: "Farmácia" }]
                : []),
            { id: "fiscal",  icone: "📊", label: "Tributacao / NF-e" },
          ]}
        >
          {(ativa: number) => {
            const temAbaSegmento = segmentoEmpresa === "AUTO_PECAS" || segmentoEmpresa === "FARMACIA";
            const idxSegmento = temAbaSegmento ? 2 : -1;
            const idxFiscal = temAbaSegmento ? 3 : 2;
            return (
            <>
              {ativa === 0 && (
                <>
                  <Secao legenda="Identificação">
                    <Linha style={{ gridTemplateColumns: "150px 1fr 80px" }}>
                      <CampoLux label="Código" obrigatorio>
                        <div className="flex gap-1.5">
                          <input
                            className="lux-input"
                            value={form.codigo}
                            onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                            style={{ flex: 1 }}
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={sugerirCodigo}
                            title="Sugerir próximo código"
                            aria-label="Sugerir próximo código"
                            className="rounded-[10px] font-semibold cursor-pointer text-base text-gp-accent bg-gp-surface"
                            style={{
                              border: `1px solid ${C.border}`,
                              padding: "0 12px",
                            }}
                          >
                            ↻
                          </button>
                        </div>
                      </CampoLux>
                      <CampoLux label="Nome" obrigatorio>
                        <input
                          className="lux-input"
                          value={form.nome}
                          onChange={(e) => setForm({ ...form, nome: e.target.value })}
                          placeholder="Ex.: Caneta esferográfica azul BIC"
                        />
                      </CampoLux>
                      <CampoLux label="Unidade">
                        <input
                          className="lux-input"
                          value={form.unidade}
                          onChange={(e) => setForm({ ...form, unidade: e.target.value.toUpperCase().slice(0, 6) })}
                          placeholder="UN, KG, LT..."
                        />
                      </CampoLux>
                    </Linha>
                    <Linha style={{ gridTemplateColumns: "1fr 2fr", alignItems: "stretch" }}>
                      <div className="flex flex-col gap-3">
                        <CampoLux label="Código de barras">
                          <input
                            className="lux-input"
                            value={form.codigoBarras}
                            onChange={(e) => setForm({ ...form, codigoBarras: e.target.value.replace(/\s/g, "") })}
                            placeholder="EAN-13, EAN-8, GTIN…"
                            inputMode="numeric"
                            style={{ fontFamily: "ui-monospace, monospace" }}
                          />
                        </CampoLux>
                        <CampoLux label="Referência">
                          <input
                            className="lux-input"
                            value={form.referencia}
                            onChange={(e) => setForm({ ...form, referencia: e.target.value.toUpperCase() })}
                            placeholder="Código do fabricante / fornecedor"
                          />
                        </CampoLux>
                      </div>
                      <CampoLux label="Descrição">
                        <textarea
                          className="lux-textarea"
                          value={form.descricao}
                          onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                          rows={4}
                          placeholder="Detalhes complementares do produto…"
                          style={{ height: "100%", minHeight: 90, resize: "vertical" }}
                        />
                      </CampoLux>
                    </Linha>
                    <Linha cols={1}>
                      <CampoLux label="Fabricante / Marca" hint="Cadastre uma vez e reutilize nos próximos produtos — clique no + para adicionar">
                        <div className="flex gap-2">
                          <SelectBusca<Fabricante>
                            opcoes={fabricantes}
                            value={form.fabricanteId}
                            onChange={(v) => setForm({ ...form, fabricanteId: v })}
                            placeholder="— Sem fabricante —"
                            className="lux-input"
                            containerStyle={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            onClick={() => setModalFabricante(true)}
                            title="Cadastrar novo fabricante"
                            aria-label="Cadastrar novo fabricante"
                            className="rounded-[10px] font-bold cursor-pointer text-gp-white flex items-center gap-1.5"
                            style={{
                              border: "none",
                              background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                              padding: "0 16px",
                              fontSize: 13,
                              flexShrink: 0,
                            }}
                          >
                            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Novo
                          </button>
                        </div>
                      </CampoLux>
                    </Linha>
                  </Secao>

                  <Secao legenda="Imagem e tipo do item">
                    <Linha style={{ gridTemplateColumns: "1fr 1fr", alignItems: "stretch" }}>
                      <CampoLux label="Foto do produto" hint="JPG, PNG ou WEBP · máx 2 MB">
                        <DropzoneImagem
                          preview={imagemPreview}
                          onSelecionar={escolherImagem}
                          onLimpar={limparImagem}
                          inputRef={inputImagemRef}
                        />
                      </CampoLux>
                      <CampoLux label="Tipo do item">
                        <SeletorTipoItem
                          valor={form.tipoItem}
                          onMudar={(t) => setForm((f) => ({ ...f, tipoItem: t }))}
                        />
                      </CampoLux>
                    </Linha>
                  </Secao>

                  <Secao legenda="Preços e estoque">
                    <Linha style={{ gridTemplateColumns: "80px 80px 1fr 1fr", alignItems: "end" }}>
                      <CampoLux label={form.tipoItem === "SERVICO" ? "Estoque (n/a)" : "Estoque atual"}>
                        <input
                          className="lux-input"
                          type="number" step="0.001" min="0"
                          value={form.tipoItem === "SERVICO" ? "" : form.estoque}
                          onChange={(e) => setForm({ ...form, estoque: e.target.value })}
                          disabled={form.tipoItem === "SERVICO"}
                          placeholder={form.tipoItem === "SERVICO" ? "♾" : "0"}
                          style={form.tipoItem === "SERVICO" ? { background: C.bg, color: C.muted, borderStyle: "dashed", cursor: "not-allowed" } : undefined}
                        />
                      </CampoLux>
                      <CampoLux label={form.tipoItem === "SERVICO" ? "Mínimo (n/a)" : "Estoque mínimo"}>
                        <input
                          className="lux-input"
                          type="number" step="0.001" min="0"
                          value={form.tipoItem === "SERVICO" ? "" : form.estoqueMinimo}
                          onChange={(e) => setForm({ ...form, estoqueMinimo: e.target.value })}
                          disabled={form.tipoItem === "SERVICO"}
                          placeholder={form.tipoItem === "SERVICO" ? "—" : "0"}
                          style={form.tipoItem === "SERVICO" ? { background: C.bg, color: C.muted, borderStyle: "dashed", cursor: "not-allowed" } : undefined}
                        />
                      </CampoLux>
                      <CampoLux label="Preço de custo (R$)">
                        <input
                          className="lux-input"
                          type="number" step="0.01" min="0"
                          value={form.precoCusto}
                          onChange={(e) => setForm({ ...form, precoCusto: e.target.value })}
                          placeholder="0,00"
                        />
                      </CampoLux>
                      <CampoLux label="Preço de venda" obrigatorio>
                        <input
                          className="lux-input"
                          type="number" step="0.01" min="0"
                          value={form.precoVenda}
                          onChange={(e) => setForm({ ...form, precoVenda: e.target.value })}
                          placeholder="0,00"
                        />
                      </CampoLux>
                    </Linha>
                    <Linha cols={1}>
                      <details className="lux-field mk-toggle">
                        <summary
                          className="cursor-pointer select-none text-[12px] font-medium flex items-center gap-1.5"
                          style={{ color: C.muted }}
                        >
                          <span className="mk-toggle__chevron" style={{ fontSize: 11 }}>▸</span>
                          🧮 Calculadora de markup / formação de preço
                        </summary>
                        <div style={{ marginTop: 8 }}>
                          <CalculoMarkup
                            precoCusto={form.precoCusto}
                            precoVenda={form.precoVenda}
                            markup={markup}
                            onChange={setMarkup}
                            onAplicar={(valor) => setForm((f) => ({ ...f, precoVenda: valor }))}
                          />
                        </div>
                      </details>
                    </Linha>
                  </Secao>
                </>
              )}

              {ativa === 1 && (
                <Secao legenda="Categoria e fornecedor">
                  <Linha cols={2}>
                    <CampoLux label="Fornecedor">
                      <SelectBusca<Fornecedor>
                        opcoes={fornecedores}
                        value={form.fornecedorId}
                        onChange={(v) => setForm({ ...form, fornecedorId: v })}
                        subLabelFn={(f) => f.cnpj}
                        placeholder="— Sem fornecedor —"
                        className="lux-input"
                      />
                    </CampoLux>
                    <CampoLux label="Categoria">
                      <SelectBusca<Categoria>
                        opcoes={categorias}
                        value={form.categoriaId}
                        onChange={(v) => setForm({ ...form, categoriaId: v })}
                        placeholder="— Sem categoria —"
                        className="lux-input"
                      />
                    </CampoLux>
                  </Linha>
                  <Linha cols={1}>
                    <CampoLux label="Nova categoria">
                      <div className="flex gap-2">
                        <input
                          className="lux-input"
                          value={novaCategoria}
                          onChange={(e) => setNovaCategoria(e.target.value)}
                          placeholder="Nome da nova categoria"
                          style={{ flex: 1 }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); criarCategoriaInline(); } }}
                        />
                        <button
                          type="button"
                          onClick={criarCategoriaInline}
                          disabled={!novaCategoria.trim()}
                          className="text-gp-white border-none rounded-[10px] font-bold text-xs"
                          style={{
                            background: novaCategoria.trim() ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : C.muted,
                            padding: "0 16px",
                            cursor: novaCategoria.trim() ? "pointer" : "default",
                          }}
                        >
                          + Adicionar
                        </button>
                      </div>
                    </CampoLux>
                  </Linha>
                </Secao>
              )}

              {/* ETAPA#6: aba do segmento renderizada condicionalmente */}
              {ativa === idxSegmento && segmentoEmpresa === "AUTO_PECAS" && (
                <Secao legenda="Dados de auto-peca">
                  <Linha cols={2}>
                    <CampoLux label="Código OEM" hint="Numero original do fabricante">
                      <input className="lux-input" value={form.codigoOEM}
                        onChange={(e) => setForm({ ...form, codigoOEM: e.target.value.toUpperCase().slice(0, 60) })}
                        placeholder="Ex: 90919-01184" />
                    </CampoLux>
                    <CampoLux label="Marca da peça">
                      <input className="lux-input" value={form.marcaPeca}
                        onChange={(e) => setForm({ ...form, marcaPeca: e.target.value.slice(0, 60) })}
                        placeholder="Bosch, NGK, Mahle…" />
                    </CampoLux>
                  </Linha>
                  <Linha cols={1}>
                    <CampoLux label="Compatibilidade" hint="Um modelo/aplicação por linha (até 50)">
                      <textarea className="lux-textarea" value={form.compatibilidade}
                        onChange={(e) => setForm({ ...form, compatibilidade: e.target.value.slice(0, 2000) })}
                        placeholder={"Toyota Corolla 2014-2019\nHonda Civic 2016-2020"}
                        rows={5} />
                    </CampoLux>
                  </Linha>
                </Secao>
              )}
              {ativa === idxSegmento && segmentoEmpresa === "FARMACIA" && (
                <Secao legenda="Dados de medicamento">
                  <Linha cols={2}>
                    <CampoLux label="Lote">
                      <input className="lux-input" value={form.lote}
                        onChange={(e) => setForm({ ...form, lote: e.target.value.toUpperCase().slice(0, 30) })}
                        placeholder="L20260512A" />
                    </CampoLux>
                    <CampoLux label="Validade">
                      <input className="lux-input" type="date" value={form.validade}
                        onChange={(e) => setForm({ ...form, validade: e.target.value })} />
                    </CampoLux>
                  </Linha>
                  <Linha cols={2}>
                    <CampoLux label="Registro Anvisa" hint="13 digitos sem formatacao">
                      <input className="lux-input" value={form.registroAnvisa}
                        onChange={(e) => setForm({ ...form, registroAnvisa: e.target.value.replace(/\D/g, "").slice(0, 13) })}
                        placeholder="1234567890123" inputMode="numeric" />
                    </CampoLux>
                    <CampoLux label="PMC (R$)" hint="Preço Máximo ao Consumidor">
                      <input className="lux-input" type="number" step="0.01" min="0"
                        value={form.pmc}
                        onChange={(e) => setForm({ ...form, pmc: e.target.value })}
                        placeholder="0,00" />
                    </CampoLux>
                  </Linha>
                </Secao>
              )}
              {ativa === idxFiscal && <AbaFiscal form={form} setForm={setForm} />}
            </>
            );
          }}
        </Abas>
      </FormularioLuxuoso>
    </div>
  );
}

// ============ ESTILOS ============

const inputStyle: CSSProperties = {
  width: "100%",
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "9px 12px",
  color: C.text,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "10px 12px",
  color: C.text,
  fontSize: 13,
  cursor: "pointer",
};

function alertStyle(cor: string): CSSProperties {
  return {
    marginBottom: 12,
    padding: "10px 14px",
    borderRadius: 8,
    background: cor + "22",
    border: `1px solid ${cor}55`,
    color: cor,
    fontSize: 13,
  };
}

// ============ SUBCOMPONENTES ============

interface MiniaturaProps {
  url: string | null | undefined;
  nome: string;
  servico?: boolean;
}

function Miniatura({ url, nome, servico = false }: MiniaturaProps) {
  const src = urlImagem(url);
  if (src) {
    return (
      <img
        src={src}
        alt={nome || ""}
        loading="lazy"
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          objectFit: "cover",
          border: `1px solid ${C.border}`,
          background: C.surface,
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        background: servico ? C.purple + "22" : C.surface,
        border: `1px solid ${servico ? C.purple + "55" : C.border}`,
        color: servico ? C.purple : C.muted,
        fontSize: 18,
      }}
    >
      {servico ? "🛠" : "📦"}
    </div>
  );
}

interface SeletorTipoItemProps {
  valor: TipoItem;
  onMudar: (t: TipoItem) => void;
}

function SeletorTipoItem({ valor, onMudar }: SeletorTipoItemProps) {
  const opcoes: { id: TipoItem; icone: string; label: string; desc: string }[] = [
    { id: "PRODUTO", icone: "📦", label: "Produto físico", desc: "Controla estoque, gera entradas/saídas, alerta quando baixo." },
    { id: "SERVICO", icone: "🛠", label: "Serviço / digital", desc: "Sem estoque. Sempre disponível para venda (impressão, 2ª via...)." },
  ];
  return (
    <div className="grid grid-cols-1 gap-2.5">
      {opcoes.map((opt) => {
        const ativo = valor === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onMudar(opt.id)}
            className="cursor-pointer text-left rounded-[10px]"
            style={{
              padding: "12px 14px",
              background: ativo ? (opt.id === "SERVICO" ? C.purple + "22" : C.accent + "22") : C.surface,
              border: `1px solid ${ativo ? (opt.id === "SERVICO" ? C.purple : C.accent) : C.border}`,
              color: ativo ? C.white : C.text,
              transition: "all 0.15s ease",
            }}
          >
            <div className="flex items-center gap-2 font-bold text-[13px]">
              <span className="text-lg">{opt.icone}</span>
              {opt.label}
            </div>
            <div className="text-gp-muted text-[11px] mt-1">{opt.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

interface CalculoMarkupProps {
  precoCusto: string;
  precoVenda: string;
  markup: Markup;
  onChange: (m: Markup) => void;
  onAplicar: (valor: string) => void;
}

function CalculoMarkup({ precoCusto, precoVenda, markup, onChange, onAplicar }: CalculoMarkupProps) {
  const custo = Number(precoCusto) || 0;
  const impostos = Number(markup.impostos) || 0;
  const taxas = Number(markup.taxasCartao) || 0;
  const margem = Number(markup.margemLucro) || 0;
  const totalPct = impostos + taxas + margem;

  const valido = custo > 0 && totalPct > 0 && totalPct < 100;
  const sugerido = valido ? custo / (1 - totalPct / 100) : 0;

  const set = (campo: keyof Markup) => (e: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...markup, [campo]: e.target.value });

  // Margem sobre o custo (markup "por fora"), com vínculo bidirecional ao preço de venda.
  const venda = Number(precoVenda) || 0;
  const [margemCustoFocada, setMargemCustoFocada] = useState(false);
  const [margemCustoLocal, setMargemCustoLocal] = useState("");
  const margemDerivada = custo > 0 && venda > 0 ? (venda / custo - 1) * 100 : null;
  // Enquanto o campo está em foco usa o texto digitado; fora de foco deriva do preço de venda.
  const margemCustoValor = margemCustoFocada
    ? margemCustoLocal
    : margemDerivada != null ? margemDerivada.toFixed(2) : "";

  const onChangeMargemCusto = (e: ChangeEvent<HTMLInputElement>) => {
    const txt = e.target.value;
    setMargemCustoLocal(txt);
    const m = Number(txt);
    if (custo > 0 && txt !== "" && !Number.isNaN(m)) {
      onAplicar((custo * (1 + m / 100)).toFixed(2));
    }
  };

  return (
    <div
      className="bg-gp-surface rounded-[10px]"
      style={{ border: `1px solid ${C.border}`, padding: 14 }}
    >
      <div className="text-gp-muted text-[11px] font-semibold mb-2">
        Margem sobre o custo (preço = custo + margem)
      </div>
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <SubCampo label="Margem de Lucro sobre o Custo (%)">
          <input type="number" step="0.01" min="0" value={margemCustoValor}
            onChange={onChangeMargemCusto}
            onFocus={() => { setMargemCustoLocal(margemCustoValor); setMargemCustoFocada(true); }}
            onBlur={() => setMargemCustoFocada(false)}
            style={inputStyle} placeholder="0,00" aria-label="Margem de lucro sobre o custo" />
        </SubCampo>
        <SubCampo label="Preço de Venda resultante">
          <div
            className="text-base font-extrabold flex items-center"
            style={{ color: custo > 0 && venda > 0 ? C.green : C.muted, minHeight: 38 }}
          >
            {custo > 0 && venda > 0 ? fmtBRL(venda) : "—"}
          </div>
        </SubCampo>
      </div>
      {custo === 0 && (
        <div className="text-gp-muted text-[11px] mb-3">
          ℹ Informe o Preço de Custo para usar a margem sobre o custo.
        </div>
      )}

      <div className="text-gp-muted text-[11px] font-semibold mb-2 mt-1">
        Formação de preço (margem sobre a venda)
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <SubCampo label="Impostos sobre Venda (%)">
          <input type="number" step="0.01" min="0" value={markup.impostos}
            onChange={set("impostos")} style={inputStyle} placeholder="0,00" aria-label="Impostos sobre venda" />
        </SubCampo>
        <SubCampo label="Taxas de Cartão (%)">
          <input type="number" step="0.01" min="0" value={markup.taxasCartao}
            onChange={set("taxasCartao")} style={inputStyle} placeholder="0,00" aria-label="Taxas de cartão" />
        </SubCampo>
        <SubCampo label="Margem de Lucro Desejada (%)">
          <input type="number" step="0.01" min="0" value={markup.margemLucro}
            onChange={set("margemLucro")} style={inputStyle} placeholder="0,00" aria-label="Margem de lucro desejada" />
        </SubCampo>
      </div>

      <div
        className="mt-3 rounded-lg bg-gp-bg flex items-center gap-3 flex-wrap"
        style={{
          padding: "10px 12px",
          border: `1px solid ${C.border}`,
        }}
      >
        <div className="flex-1 min-w-[180px]">
          <div className="text-gp-muted text-[11px] font-semibold mb-0.5">
            Preço Sugerido (somatório: {totalPct.toFixed(2)}%)
          </div>
          <div
            className="text-lg font-extrabold"
            style={{
              color: valido ? C.green : C.muted,
              letterSpacing: 0.3,
            }}
          >
            {valido ? fmtBRL(sugerido) : "—"}
          </div>
        </div>
        <button
          type="button"
          disabled={!valido}
          onClick={() => onAplicar(sugerido.toFixed(2))}
          className="text-gp-white border-none rounded-lg font-bold text-xs"
          style={{
            background: valido ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : C.muted,
            padding: "10px 16px",
            cursor: valido ? "pointer" : "not-allowed",
          }}
        >
          Aplicar ao preço de venda
        </button>
      </div>

      {custo > 0 && totalPct >= 100 && (
        <div
          className="mt-2.5 rounded-lg text-xs text-gp-red"
          style={{
            padding: "8px 12px",
            background: C.red + "22",
            border: `1px solid ${C.red}55`,
          }}
        >
          ⚠ A soma dos percentuais ({totalPct.toFixed(2)}%) deve ser menor que 100%.
        </div>
      )}
      {custo === 0 && totalPct > 0 && (
        <div className="mt-2.5 text-gp-muted text-xs">
          ℹ Informe o Preço de Custo para calcular a sugestão.
        </div>
      )}
    </div>
  );
}

function SubCampo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-gp-muted text-[11px] mb-1.5 font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}

// ============ ABA FISCAL ============

interface AbaFiscalProps {
  form: FormProduto;
  setForm: React.Dispatch<React.SetStateAction<FormProduto>>;
}

function AbaFiscal({ form, setForm }: AbaFiscalProps) {
  const set = (k: keyof FormProduto) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const ehSimples = form.regimeTributario !== "REGIME_NORMAL";
  return (
    <>
      <Secao legenda="Identificação fiscal">
        <Linha cols={3}>
          <CampoLux label="NCM" hint="8 dígitos (Nomenclatura Comum do Mercosul)">
            <input
              className="lux-input"
              value={form.ncm}
              onChange={(e) => setForm({ ...form, ncm: e.target.value.replace(/\D/g, "").slice(0, 8) })}
              placeholder="00000000"
              inputMode="numeric"
              maxLength={8}
              style={{ fontFamily: "ui-monospace, monospace" }}
            />
          </CampoLux>
          <CampoLux label="CEST" hint="Só p/ produtos com ST (Conv. 92/2015)">
            <input
              className="lux-input"
              value={form.cest}
              onChange={(e) => setForm({ ...form, cest: e.target.value.replace(/\D/g, "").slice(0, 7) })}
              placeholder="0000000"
              inputMode="numeric"
              maxLength={7}
              style={{ fontFamily: "ui-monospace, monospace" }}
            />
          </CampoLux>
          <CampoLux label="CFOP padrão de saída" hint="Inicia com 5, 6 ou 7">
            <input
              className="lux-input"
              value={form.cfopPadrao}
              onChange={(e) => setForm({ ...form, cfopPadrao: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              placeholder="5102"
              inputMode="numeric"
              maxLength={4}
              style={{ fontFamily: "ui-monospace, monospace" }}
            />
          </CampoLux>
        </Linha>
        <Linha cols={2}>
          <CampoLux label="Origem da mercadoria">
            <select className="lux-input lux-select" value={form.origem} onChange={set("origem")}>
              <option value="NACIONAL">0 — Nacional</option>
              <option value="ESTRANGEIRA_IMP_DIRETA">1 — Estrangeira (importação direta)</option>
              <option value="ESTRANGEIRA_ADQUIRIDA_BR">2 — Estrangeira (mercado interno)</option>
              <option value="NACIONAL_IMP_SUP_40">3 — Nacional, CI &gt; 40% e ≤ 70%</option>
              <option value="NACIONAL_PROC_BAS">4 — Nacional, proc. produtivo básico</option>
              <option value="NACIONAL_IMP_INF_40">5 — Nacional, CI ≤ 40%</option>
              <option value="ESTRANGEIRA_IMP_SEM_SIM">6 — Estrangeira direta sem similar</option>
              <option value="ESTRANGEIRA_ADQ_SEM_SIM">7 — Estrangeira interna sem similar</option>
              <option value="NACIONAL_IMP_SUP_70">8 — Nacional, CI &gt; 70%</option>
            </select>
          </CampoLux>
          <CampoLux label="Regime tributário do item">
            <select className="lux-input lux-select" value={form.regimeTributario} onChange={set("regimeTributario")}>
              <option value="SIMPLES_NACIONAL">Simples Nacional</option>
              <option value="SIMPLES_EXCESSO_SUBLIMITE">Simples — excesso sublimite</option>
              <option value="REGIME_NORMAL">Regime Normal (Presumido/Real)</option>
            </select>
          </CampoLux>
        </Linha>
      </Secao>

      <Secao legenda="ICMS">
        <Linha cols={2}>
          {ehSimples ? (
            <CampoLux label="CSOSN" hint="Código de Situação no Simples (3 ou 4 dígitos)">
              <input
                className="lux-input"
                value={form.csosnIcms}
                onChange={(e) => setForm({ ...form, csosnIcms: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                placeholder="102"
                maxLength={4}
                inputMode="numeric"
                style={{ fontFamily: "ui-monospace, monospace" }}
              />
            </CampoLux>
          ) : (
            <CampoLux label="CST ICMS" hint="3 dígitos — Tabela B SEFAZ">
              <input
                className="lux-input"
                value={form.cstIcms}
                onChange={(e) => setForm({ ...form, cstIcms: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                placeholder="000"
                maxLength={3}
                inputMode="numeric"
                style={{ fontFamily: "ui-monospace, monospace" }}
              />
            </CampoLux>
          )}
          <CampoLux label="Alíquota ICMS (%)">
            <input
              className="lux-input"
              type="number" step="0.01" min="0" max="100"
              value={form.aliquotaIcms}
              onChange={set("aliquotaIcms")}
              placeholder="0,00"
            />
          </CampoLux>
        </Linha>
      </Secao>

      <Secao legenda="PIS / COFINS">
        <Linha style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
          <CampoLux label="CST PIS">
            <input
              className="lux-input"
              value={form.cstPis}
              onChange={(e) => setForm({ ...form, cstPis: e.target.value.replace(/\D/g, "").slice(0, 2) })}
              placeholder="01"
              maxLength={2}
              inputMode="numeric"
              style={{ fontFamily: "ui-monospace, monospace" }}
            />
          </CampoLux>
          <CampoLux label="Alíq. PIS (%)">
            <input
              className="lux-input"
              type="number" step="0.0001" min="0" max="100"
              value={form.aliquotaPis}
              onChange={set("aliquotaPis")}
              placeholder="1,65"
            />
          </CampoLux>
          <CampoLux label="CST COFINS">
            <input
              className="lux-input"
              value={form.cstCofins}
              onChange={(e) => setForm({ ...form, cstCofins: e.target.value.replace(/\D/g, "").slice(0, 2) })}
              placeholder="01"
              maxLength={2}
              inputMode="numeric"
              style={{ fontFamily: "ui-monospace, monospace" }}
            />
          </CampoLux>
          <CampoLux label="Alíq. COFINS (%)">
            <input
              className="lux-input"
              type="number" step="0.0001" min="0" max="100"
              value={form.aliquotaCofins}
              onChange={set("aliquotaCofins")}
              placeholder="7,60"
            />
          </CampoLux>
        </Linha>
      </Secao>

      <Secao legenda="Complementares">
        <Linha cols={3}>
          <CampoLux label="cBenef" hint="Código de Benefício Fiscal (UF)">
            <input
              className="lux-input"
              value={form.codBeneficioFiscal}
              onChange={(e) => setForm({ ...form, codBeneficioFiscal: e.target.value.toUpperCase().slice(0, 10) })}
              placeholder="—"
              maxLength={10}
            />
          </CampoLux>
          <CampoLux label="Unidade tributável" hint="Vazio = usa comercial">
            <input
              className="lux-input"
              value={form.unidadeTributavel}
              onChange={(e) => setForm({ ...form, unidadeTributavel: e.target.value.toUpperCase().slice(0, 6) })}
              placeholder="UN, KG..."
            />
          </CampoLux>
          <CampoLux label="Peso (líquido / bruto kg)">
            <div className="flex gap-1.5">
              <input
                className="lux-input"
                type="number" step="0.001" min="0"
                value={form.pesoLiquido}
                onChange={set("pesoLiquido")}
                placeholder="0,000"
                aria-label="Peso líquido"
              />
              <input
                className="lux-input"
                type="number" step="0.001" min="0"
                value={form.pesoBruto}
                onChange={set("pesoBruto")}
                placeholder="0,000"
                aria-label="Peso bruto"
              />
            </div>
          </CampoLux>
        </Linha>
      </Secao>
    </>
  );
}

// ============ DROPZONE DE IMAGEM ============

interface DropzoneImagemProps {
  preview: string | null;
  onSelecionar: (f: File | null | undefined) => void;
  onLimpar: () => void;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
}

function DropzoneImagem({ preview, onSelecionar, onLimpar, inputRef }: DropzoneImagemProps) {
  const [arrastando, setArrastando] = useState(false);

  function aoArrastar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setArrastando(e.type === "dragenter" || e.type === "dragover");
  }
  function aoSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setArrastando(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onSelecionar(f);
  }

  return (
    <div className="flex gap-3 items-stretch flex-1">
      <div
        onDragEnter={aoArrastar}
        onDragOver={aoArrastar}
        onDragLeave={aoArrastar}
        onDrop={aoSoltar}
        onClick={() => inputRef.current?.click()}
        className="flex-1 flex flex-col items-center justify-center rounded-[10px] text-center cursor-pointer text-gp-muted text-[13px]"
        style={{
          background: arrastando ? C.accent + "22" : C.surface,
          border: `2px dashed ${arrastando ? C.accent : C.border}`,
          padding: "10px 14px",
          transition: "all 0.15s ease",
        }}
      >
        <div className="text-2xl mb-0.5">🖼️</div>
        <div className="text-gp-text font-semibold">
          {preview ? "Trocar imagem" : "Clique ou arraste uma imagem"}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => onSelecionar(e.target.files?.[0])}
          className="hidden"
          aria-label="Selecionar imagem"
        />
      </div>
      {preview && (
        <div className="relative flex-shrink-0">
          <img
            src={preview}
            alt="Preview"
            style={{
              width: 120,
              height: 120,
              objectFit: "cover",
              borderRadius: 10,
              border: `1px solid ${C.border}`,
              background: C.surface,
            }}
          />
          <button
            type="button"
            onClick={onLimpar}
            title="Remover imagem"
            aria-label="Remover imagem"
            className="absolute rounded-full text-gp-white font-extrabold cursor-pointer"
            style={{
              top: -8,
              right: -8,
              width: 26,
              height: 26,
              background: C.red,
              border: `2px solid ${C.card}`,
              fontSize: 14,
              lineHeight: 1,
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
