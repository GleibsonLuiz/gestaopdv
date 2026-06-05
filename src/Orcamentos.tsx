import { useEffect, useState, useCallback, useMemo, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api, BASE_URL, type SessionUser } from "./lib/api";
import { ignorarErro } from "./lib/erroSilencioso";
import ActionsMenu from "./components/ActionsMenu";
import SelectBusca from "./components/SelectBusca";
import type { ConfiguracaoEmpresa } from "./Configuracoes";

// ============ TIPOS ============

type TipoDocumento = "ORCAMENTO" | "ORDEM_SERVICO";
type TabelaPreco = "AV" | "PZ" | "AT";
type ViaDoc = 1 | 2;
type StatusOrcamento =
  | "RASCUNHO"
  | "AGUARDANDO_APROVACAO"
  | "APROVADO"
  | "REJEITADO"
  | "ENTREGUE"
  | "CANCELADO";
type FormaPagamento =
  | "DINHEIRO"
  | "CARTAO_CREDITO"
  | "CARTAO_DEBITO"
  | "PIX"
  | "BOLETO"
  | "CREDIARIO";

const FATOR_TABELA: Record<TabelaPreco, number> = { AV: 1.0, PZ: 1.10, AT: 0.85 };

const STATUS_LABEL: Record<StatusOrcamento, string> = {
  RASCUNHO: "Rascunho",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  REJEITADO: "Rejeitado",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

function corStatus(status: StatusOrcamento): string {
  switch (status) {
    case "RASCUNHO": return C.muted;
    case "AGUARDANDO_APROVACAO": return C.yellow;
    case "APROVADO": return C.accent;
    case "ENTREGUE": return C.green;
    case "REJEITADO": return C.red;
    case "CANCELADO": return C.red;
    default: return C.text;
  }
}

const FORMAS_PAGAMENTO_LABEL: Record<FormaPagamento, string> = {
  DINHEIRO: "Dinheiro",
  CARTAO_CREDITO: "Cartão de Crédito",
  CARTAO_DEBITO: "Cartão de Débito",
  PIX: "PIX",
  BOLETO: "Boleto",
  CREDIARIO: "Crediário",
};

interface Cliente {
  id: string;
  nome: string;
  cpfCnpj?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  telefone?: string | null;
  [extra: string]: unknown;
}

interface Produto {
  id: string;
  codigo: string;
  nome: string;
  unidade?: string | null;
  precoVenda?: number | string | null;
  tipoItem?: "PRODUTO" | "SERVICO";
  referencia?: string | null;
  [extra: string]: unknown;
}

interface Funcionario {
  id: string;
  nome: string;
  [extra: string]: unknown;
}

interface ProdutoRef {
  codigo?: string;
  unidade?: string;
  tipoItem?: "PRODUTO" | "SERVICO";
  referencia?: string;
}

interface UserRef {
  nome?: string;
}

interface ItemOrcamento {
  id: string;
  produtoId?: string;
  produto?: ProdutoRef | null;
  descricao: string;
  quantidade: number | string;
  valorUnitario: number | string;
  largura?: number | string | null;
  altura?: number | string | null;
  totalEm?: number | string | null;
  acertoTotal?: number | string | null;
  formato?: string;
  vias?: string;
  cores?: string;
  complemento?: string;
  subtotal: number | string;
}

interface VendaRef {
  numero: number | string;
  total: number | string;
}

interface Orcamento {
  id: string;
  numero: number | string;
  tipo: TipoDocumento;
  status: StatusOrcamento;
  tabelaPreco: TabelaPreco;
  via: ViaDoc;
  createdAt: string;
  clienteId?: string | null;
  cliente?: Cliente | null;
  descricaoCliente?: string | null;
  contato?: string | null;
  telefone?: string | null;
  responsavelId?: string | null;
  responsavel?: Funcionario | null;
  user?: UserRef | null;
  formaCondicaoPagamento?: string | null;
  observacoes?: string | null;
  imprimirObservacoes?: boolean;
  rodape?: string | null;
  mostrarValorMetro?: boolean;
  imprimirValores?: boolean;
  deslocamento: number | string;
  desconto: number | string;
  valorProdutos: number | string;
  valorServicos: number | string;
  total: number | string;
  itens?: ItemOrcamento[];
  _count?: { itens: number };
  dataAprovacao?: string | null;
  dataEntrega?: string | null;
  dataRejeicao?: string | null;
  dataCancelamento?: string | null;
  motivoRejeicao?: string | null;
  motivoCancelamento?: string | null;
  vendaId?: string | null;
  venda?: VendaRef | null;
}

interface ItemForm {
  produtoId: string;
  descricao: string;
  quantidade: string;
  valorUnitario: string;
  largura: string;
  altura: string;
  acertoTotal: string;
  formato: string;
  vias: string;
  cores: string;
  complemento: string;
}

interface AcaoDef {
  id: "enviar" | "aprovar" | "rejeitar" | "cancelar" | "voltar" | "entregar";
  label: string;
  cor: string;
  pedeMotivo?: boolean;
  pedeForma?: boolean;
}

interface VendaConvertida {
  venda: VendaRef;
}

// ============ HELPERS ============

function urlLogotipo(logotipo: string | null | undefined): string | null {
  if (!logotipo) return null;
  if (/^https?:\/\//i.test(logotipo)) return logotipo;
  return `${BASE_URL}${logotipo}`;
}

const fmtBRL = (v: number | string | null | undefined): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

function calcularItem(it: ItemForm): { totalEm: number; subtotal: number } {
  const qtd = parseFloat(String(it.quantidade).replace(",", ".")) || 0;
  const valor = parseFloat(String(it.valorUnitario).replace(",", ".")) || 0;
  const largura = parseFloat(String(it.largura).replace(",", ".")) || 0;
  const altura = parseFloat(String(it.altura).replace(",", ".")) || 0;
  const acerto = parseFloat(String(it.acertoTotal).replace(",", ".")) || 0;
  let totalEm = 0;
  let subtotal: number;
  if (largura > 0 && altura > 0) {
    totalEm = largura * altura;
    subtotal = totalEm * valor * qtd + acerto;
  } else {
    subtotal = qtd * valor + acerto;
  }
  return { totalEm, subtotal };
}

// ============ TELA PRINCIPAL ============

interface OrcamentosProps {
  user: SessionUser;
}

export default function Orcamentos({ user }: OrcamentosProps) {
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [busca, setBusca] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [empresa, setEmpresa] = useState<ConfiguracaoEmpresa | null>(null);

  const [novoAberto, setNovoAberto] = useState(false);
  const [editando, setEditando] = useState<Orcamento | null>(null);
  const [detalhe, setDetalhe] = useState<Orcamento | null>(null);
  const [mensagem, setMensagem] = useState("");

  const podeCriar = user.role === "ADMIN" || user.role === "GERENTE" || user.role === "VENDEDOR";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.listarOrcamentos({
        status: filtroStatus, tipo: filtroTipo, search: busca,
        dataInicio, dataFim,
      }) as Orcamento[];
      setOrcamentos(data || []);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [filtroStatus, filtroTipo, busca, dataInicio, dataFim]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    api.listarClientes({ ativo: "true" }).then((r) => setClientes((r as Cliente[]) || [])).catch(ignorarErro("clientes"));
    api.listarProdutos({ ativo: "true" }).then((r) => setProdutos((r as Produto[]) || [])).catch(ignorarErro("produtos"));
    api.obterConfiguracao().then((r) => setEmpresa(r as ConfiguracaoEmpresa)).catch(ignorarErro("configuracao"));
    if (user.role === "ADMIN") {
      api.listarFuncionarios({ ativo: "true" }).then((r) => setFuncionarios((r as Funcionario[]) || [])).catch(ignorarErro("funcionarios"));
    }
  }, [user.role]);

  function flash(t: string) {
    setMensagem(t);
    setTimeout(() => setMensagem(""), 3500);
  }

  async function abrirDetalhe(id: string) {
    try {
      const o = await api.obterOrcamento(id) as Orcamento;
      setDetalhe(o);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function abrirEdicao(id: string) {
    try {
      const o = await api.obterOrcamento(id) as Orcamento;
      setEditando(o);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div>
      <div className="flex gap-2.5 mb-4 flex-wrap items-center">
        <input
          type="text"
          placeholder="Buscar por número, cliente ou contato…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar"
          style={{ ...inputCompactoStyle, flex: "1 1 240px", minWidth: 200 }}
        />
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          aria-label="Filtrar por tipo"
          style={inputCompactoStyle}
        >
          <option value="">Todos os tipos</option>
          <option value="ORCAMENTO">Orçamento</option>
          <option value="ORDEM_SERVICO">Ordem de Serviço</option>
        </select>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          aria-label="Filtrar por status"
          style={inputCompactoStyle}
        >
          <option value="">Todos os status</option>
          {(Object.entries(STATUS_LABEL) as [StatusOrcamento, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          aria-label="Data inicial"
          style={inputCompactoStyle}
        />
        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          aria-label="Data final"
          style={inputCompactoStyle}
        />
        {(busca || filtroStatus || filtroTipo || dataInicio || dataFim) && (
          <button
            type="button"
            onClick={() => {
              setBusca(""); setFiltroStatus(""); setFiltroTipo("");
              setDataInicio(""); setDataFim("");
            }}
            className="bg-gp-surface text-gp-muted rounded-lg text-xs cursor-pointer"
            style={{ border: `1px solid ${C.border}`, padding: "8px 14px" }}
          >
            Limpar filtros
          </button>
        )}
        {podeCriar && (
          <button
            type="button"
            onClick={() => setNovoAberto(true)}
            className="ml-auto text-gp-white border-none rounded-lg text-sm font-bold cursor-pointer"
            style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              padding: "10px 18px",
            }}
          >
            + Novo Orçamento
          </button>
        )}
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
            gridTemplateColumns: "90px 110px 1.6fr 130px 90px 130px 80px",
            padding: "12px 16px",
            borderBottom: `1px solid ${C.border}`,
            letterSpacing: 0.5,
          }}
        >
          <div>Nº</div>
          <div>Tipo</div>
          <div>Cliente</div>
          <div>Status</div>
          <div className="text-right">Itens</div>
          <div className="text-right">Total</div>
          <div className="text-right">Ações</div>
        </div>

        {carregando ? (
          <div className="py-[30px] text-center text-gp-muted text-[13px]">Carregando...</div>
        ) : orcamentos.length === 0 ? (
          <div className="py-10 text-center text-gp-muted text-[13px]">
            Nenhum orçamento encontrado.
          </div>
        ) : orcamentos.map((o) => {
          const cor = corStatus(o.status);
          const nomeCliente = o.cliente?.nome || o.descricaoCliente || "—";
          const corTipo = o.tipo === "ORDEM_SERVICO" ? C.purple : C.accent;
          return (
            <div
              key={o.id}
              className="grid items-center text-[13px]"
              style={{
                gridTemplateColumns: "90px 110px 1.6fr 130px 90px 130px 80px",
                padding: "12px 16px",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <div className="text-gp-white font-mono font-bold">#{o.numero}</div>
              <div>
                <span
                  className="text-[10px] font-bold uppercase rounded-full"
                  style={{
                    background: corTipo + "22",
                    border: `1px solid ${corTipo}55`,
                    color: corTipo,
                    padding: "3px 8px",
                    letterSpacing: 0.4,
                  }}
                >
                  {o.tipo === "ORDEM_SERVICO" ? "O.S." : "Orçam."}
                </span>
              </div>
              <div>
                <div className="text-gp-white font-semibold">{nomeCliente}</div>
                <div className="text-gp-muted text-[11px]">{fmtData(o.createdAt)}</div>
              </div>
              <div>
                <span
                  className="text-[10px] font-bold uppercase rounded-full"
                  style={{
                    background: cor + "22",
                    border: `1px solid ${cor}55`,
                    color: cor,
                    padding: "3px 8px",
                    letterSpacing: 0.4,
                  }}
                >
                  {STATUS_LABEL[o.status]}
                </span>
              </div>
              <div className="text-right text-gp-text">{o._count?.itens ?? "—"}</div>
              <div className="text-right text-gp-green font-bold text-sm">
                {fmtBRL(o.total)}
              </div>
              <div className="flex justify-end">
                <ActionsMenu
                  items={[
                    {
                      label: "Ver detalhes",
                      icon: "👁",
                      color: C.accent,
                      onClick: () => abrirDetalhe(o.id),
                    },
                    {
                      label: "Editar",
                      icon: "✎",
                      color: C.yellow,
                      onClick: () => abrirEdicao(o.id),
                      hidden: !((o.status === "RASCUNHO" || o.status === "AGUARDANDO_APROVACAO") && podeCriar),
                    },
                  ]}
                />
              </div>
            </div>
          );
        })}
      </div>

      {novoAberto && (
        <FormularioOrcamentoModal
          modo="criar"
          clientes={clientes}
          produtos={produtos}
          funcionarios={funcionarios}
          onCancelar={() => setNovoAberto(false)}
          onSalvar={(o) => {
            setNovoAberto(false);
            flash(`${o.tipo === "ORDEM_SERVICO" ? "O.S." : "Orçamento"} #${o.numero} criado — total ${fmtBRL(o.total)}`);
            carregar();
          }}
        />
      )}

      {editando && (
        <FormularioOrcamentoModal
          modo="editar"
          orcamento={editando}
          clientes={clientes}
          produtos={produtos}
          funcionarios={funcionarios}
          onCancelar={() => setEditando(null)}
          onSalvar={(o) => {
            setEditando(null);
            flash(`#${o.numero} atualizado — total ${fmtBRL(o.total)}`);
            carregar();
          }}
        />
      )}

      {detalhe && (
        <DetalheOrcamentoModal
          orcamento={detalhe}
          empresa={empresa}
          podeAgir={podeCriar}
          podeExcluir={user.role === "ADMIN" || user.role === "GERENTE"}
          onFechar={() => setDetalhe(null)}
          onAtualizar={(msg) => {
            api.obterOrcamento(detalhe.id)
              .then((r) => setDetalhe(r as Orcamento))
              .catch(ignorarErro("orcamento", () => setDetalhe(null)));
            carregar();
            if (msg) flash(msg);
          }}
          onExcluir={(msg) => {
            setDetalhe(null);
            carregar();
            flash(msg);
          }}
        />
      )}
    </div>
  );
}

// ============ MODAL FORMULARIO ============

interface FormularioOrcamentoModalProps {
  modo: "criar" | "editar";
  orcamento?: Orcamento;
  clientes: Cliente[];
  produtos: Produto[];
  funcionarios: Funcionario[];
  onCancelar: () => void;
  onSalvar: (o: Orcamento) => void;
}

function FormularioOrcamentoModal({
  modo, orcamento, clientes, produtos, funcionarios, onCancelar, onSalvar,
}: FormularioOrcamentoModalProps) {
  const editando = modo === "editar";

  const [tipo, setTipo] = useState<TipoDocumento>(orcamento?.tipo || "ORCAMENTO");
  const [tabelaPreco, setTabelaPreco] = useState<TabelaPreco>(orcamento?.tabelaPreco || "AV");
  const [via, setVia] = useState<ViaDoc>(orcamento?.via || 1);

  const [clienteId, setClienteId] = useState(orcamento?.clienteId || "");
  const [descricaoCliente, setDescricaoCliente] = useState(orcamento?.descricaoCliente || "");
  const [contato, setContato] = useState(orcamento?.contato || "");
  const [telefone, setTelefone] = useState(orcamento?.telefone || "");

  const [responsavelId, setResponsavelId] = useState(orcamento?.responsavelId || "");
  const [formaCondicaoPagamento, setFormaCondicaoPagamento] = useState(orcamento?.formaCondicaoPagamento || "");

  const [observacoes, setObservacoes] = useState(orcamento?.observacoes || "");
  const [imprimirObservacoes, setImprimirObservacoes] = useState(orcamento?.imprimirObservacoes ?? true);
  const [rodape, setRodape] = useState(orcamento?.rodape || "Sempre guarde esse comprovante como sua garantia de entrega!");
  const [mostrarValorMetro, setMostrarValorMetro] = useState(orcamento?.mostrarValorMetro || false);
  const [imprimirValores, setImprimirValores] = useState(orcamento?.imprimirValores ?? true);

  const [deslocamento, setDeslocamento] = useState(
    orcamento?.deslocamento != null ? String(orcamento.deslocamento) : "0",
  );
  const [desconto, setDesconto] = useState(
    orcamento?.desconto != null ? String(orcamento.desconto) : "0",
  );

  const [itens, setItens] = useState<ItemForm[]>(() => {
    if (orcamento?.itens?.length) {
      return orcamento.itens.map((it) => ({
        produtoId: it.produtoId || "",
        descricao: it.descricao || "",
        quantidade: String(it.quantidade ?? 1),
        valorUnitario: String(it.valorUnitario ?? 0),
        largura: it.largura != null ? String(it.largura) : "",
        altura: it.altura != null ? String(it.altura) : "",
        acertoTotal: it.acertoTotal != null ? String(it.acertoTotal) : "0",
        formato: it.formato || "",
        vias: it.vias || "",
        cores: it.cores || "",
        complemento: it.complemento || "",
      }));
    }
    return [];
  });

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const totais = useMemo(() => {
    let valorProdutos = 0;
    let valorServicos = 0;
    for (const it of itens) {
      const { subtotal } = calcularItem(it);
      const prod = produtos.find((p) => p.id === it.produtoId);
      if (prod?.tipoItem === "SERVICO") valorServicos += subtotal;
      else valorProdutos += subtotal;
    }
    const desl = parseFloat(String(deslocamento).replace(",", ".")) || 0;
    const desc = parseFloat(String(desconto).replace(",", ".")) || 0;
    const total = Math.max(0, valorProdutos + valorServicos + desl - desc);
    return { valorProdutos, valorServicos, total };
  }, [itens, produtos, deslocamento, desconto]);

  function adicionarItem() {
    setItens([...itens, {
      produtoId: "", descricao: "", quantidade: "1",
      valorUnitario: "", largura: "", altura: "",
      acertoTotal: "0", formato: "", vias: "", cores: "", complemento: "",
    }]);
  }

  function removerItem(idx: number) {
    setItens(itens.filter((_, i) => i !== idx));
  }

  function atualizarItem(idx: number, campo: keyof ItemForm, valor: string) {
    const novos = [...itens];
    novos[idx] = { ...novos[idx], [campo]: valor };

    if (campo === "produtoId" && valor) {
      const p = produtos.find((x) => x.id === valor);
      if (p) {
        const fator = FATOR_TABELA[tabelaPreco] ?? 1;
        const precoBase = Number(p.precoVenda) * fator;
        if (!novos[idx].valorUnitario || parseFloat(novos[idx].valorUnitario) === 0) {
          novos[idx].valorUnitario = precoBase.toFixed(2);
        }
        if (!novos[idx].descricao) {
          novos[idx].descricao = p.nome;
        }
      }
    }
    setItens(novos);
  }

  function aplicarTabelaNosItens(novaTabela: TabelaPreco) {
    setTabelaPreco(novaTabela);
    const fatorNovo = FATOR_TABELA[novaTabela] ?? 1;
    const fatorAntigo = FATOR_TABELA[tabelaPreco] ?? 1;
    setItens(itens.map((it) => {
      if (!it.produtoId) return it;
      const p = produtos.find((x) => x.id === it.produtoId);
      if (!p) return it;
      const valorAtual = parseFloat(String(it.valorUnitario).replace(",", ".")) || 0;
      const valorEsperadoAntigo = Number(p.precoVenda) * fatorAntigo;
      if (Math.abs(valorAtual - valorEsperadoAntigo) < 0.02) {
        return { ...it, valorUnitario: (Number(p.precoVenda) * fatorNovo).toFixed(2) };
      }
      return it;
    }));
  }

  function preencherDoCliente(id: string) {
    setClienteId(id);
    if (!id) return;
    const c = clientes.find((x) => x.id === id);
    if (c) {
      if (!descricaoCliente) setDescricaoCliente(c.nome || "");
      if (!telefone && c.telefone) setTelefone(c.telefone);
    }
  }

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");

    if (!descricaoCliente.trim() && !clienteId) {
      setErro("Informe o cliente (selecione um cadastrado ou digite a descrição)");
      return;
    }
    if (itens.length === 0) {
      setErro("Adicione ao menos um item");
      return;
    }
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      if (!it.produtoId) { setErro(`Item ${i + 1}: selecione o produto`); return; }
      const q = parseFloat(String(it.quantidade).replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) { setErro(`Item ${i + 1}: quantidade inválida`); return; }
      const v = parseFloat(String(it.valorUnitario).replace(",", "."));
      if (!Number.isFinite(v) || v < 0) { setErro(`Item ${i + 1}: valor unitário inválido`); return; }
    }

    setSalvando(true);
    try {
      const payload = {
        tipo, tabelaPreco, via,
        clienteId: clienteId || null,
        descricaoCliente, contato, telefone,
        observacoes, imprimirObservacoes, rodape,
        mostrarValorMetro, imprimirValores,
        deslocamento, desconto,
        formaCondicaoPagamento,
        responsavelId: responsavelId || null,
        itens: itens.map((it, idx) => ({
          produtoId: it.produtoId,
          descricao: it.descricao,
          quantidade: it.quantidade,
          valorUnitario: it.valorUnitario,
          largura: it.largura || null,
          altura: it.altura || null,
          acertoTotal: it.acertoTotal || 0,
          formato: it.formato,
          vias: it.vias,
          cores: it.cores,
          complemento: it.complemento,
          ordem: idx,
        })),
      };

      const o = (editando && orcamento
        ? await api.atualizarOrcamento(orcamento.id, payload)
        : await api.criarOrcamento(payload)) as Orcamento;
      onSalvar(o);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={modalOverlayStyle}>
      <form
        onSubmit={salvar}
        onClick={(e) => e.stopPropagation()}
        style={{ ...modalCardStyle, maxWidth: 1100 }}
      >
        <div style={modalHeaderStyle}>
          <div>
            <div className="text-gp-white font-bold text-lg">
              {editando && orcamento ? `Editar #${orcamento.numero}` : "Novo Orçamento / O.S."}
            </div>
            <div className="text-gp-muted text-xs mt-0.5">
              {editando
                ? "Edição livre disponível enquanto o documento estiver em rascunho ou aguardando aprovação."
                : "Preencha os dados do documento e adicione os itens."}
            </div>
          </div>
          <button type="button" onClick={onCancelar} aria-label="Fechar" style={btnFecharStyle}>×</button>
        </div>

        {/* TIPO + TABELA + VIA */}
        <div
          className="bg-gp-surface rounded-[10px] mb-3.5 grid grid-cols-3 gap-3"
          style={{
            border: `1px solid ${C.border}`,
            padding: 14,
          }}
        >
          <Campo label="Tipo do documento *">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoDocumento)}
              aria-label="Tipo do documento"
              style={inputStyle}
            >
              <option value="ORCAMENTO">📝 Orçamento</option>
              <option value="ORDEM_SERVICO">🛠 Ordem de Serviço</option>
            </select>
          </Campo>
          <Campo label="Tabela de preço">
            <select
              value={tabelaPreco}
              onChange={(e) => aplicarTabelaNosItens(e.target.value as TabelaPreco)}
              aria-label="Tabela de preço"
              style={inputStyle}
            >
              <option value="AV">AV — À Vista (preço cheio)</option>
              <option value="PZ">PZ — A Prazo (+10%)</option>
              <option value="AT">AT — Atacado (-15%)</option>
            </select>
          </Campo>
          <Campo label="Via">
            <select
              value={via}
              onChange={(e) => setVia(parseInt(e.target.value, 10) as ViaDoc)}
              aria-label="Via"
              style={inputStyle}
            >
              <option value={1}>1ª Via</option>
              <option value={2}>2ª Via</option>
            </select>
          </Campo>
        </div>

        {/* CLIENTE */}
        <div
          className="bg-gp-surface rounded-[10px] mb-3.5"
          style={{ border: `1px solid ${C.border}`, padding: 14 }}
        >
          <div style={secaoTituloStyle}>👤 Cliente</div>
          <div
            className="grid gap-3 mb-2.5"
            style={{ gridTemplateColumns: "1.6fr 1fr 160px" }}
          >
            <Campo label="Cliente cadastrado">
              <SelectBusca<Cliente>
                opcoes={clientes}
                value={clienteId}
                onChange={preencherDoCliente}
                placeholder="— Sem vínculo (digite manualmente) —"
                style={inputStyle}
              />
            </Campo>
            <Campo label="Nome do contato / outros">
              <input
                value={contato}
                onChange={(e) => setContato(e.target.value)}
                style={inputStyle}
                placeholder="Pessoa que solicitou"
                maxLength={200}
              />
            </Campo>
            <Campo label="Telefone">
              <input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                style={inputStyle}
                placeholder="(00) 00000-0000"
                maxLength={50}
              />
            </Campo>
          </div>
          <Campo label="Descrição do cliente *">
            <input
              value={descricaoCliente}
              onChange={(e) => setDescricaoCliente(e.target.value)}
              style={inputStyle}
              placeholder="Nome ou razão social a aparecer no documento"
              maxLength={200}
              required
            />
          </Campo>
        </div>

        {/* ITENS */}
        <div className="mb-1.5 flex justify-between items-center">
          <div className="text-gp-white font-bold text-sm">
            📦 Produtos e serviços
          </div>
          <button
            type="button"
            onClick={adicionarItem}
            className="text-gp-white border-none rounded-md text-xs font-semibold cursor-pointer"
            style={{ background: C.accent, padding: "6px 14px" }}
          >
            + Adicionar item
          </button>
        </div>
        <div className="text-gp-muted text-[11px] mb-2.5">
          Itens com largura × altura ({">"} 0) calculam automaticamente o total em m². Caso contrário, usa quantidade × valor.
        </div>

        <div
          className="bg-gp-surface rounded-[10px] overflow-hidden mb-3.5"
          style={{ border: `1px solid ${C.border}` }}
        >
          {itens.length === 0 ? (
            <div className="py-6 text-center text-gp-muted text-[13px]">
              Nenhum item ainda. Clique em "+ Adicionar item".
            </div>
          ) : itens.map((it, idx) => (
            <ItemFormulario
              key={idx}
              indice={idx}
              item={it}
              produtos={produtos}
              tabelaPreco={tabelaPreco}
              onAtualizar={(campo, valor) => atualizarItem(idx, campo, valor)}
              onRemover={() => removerItem(idx)}
            />
          ))}
        </div>

        {/* TOTAIS + AJUSTES */}
        <div
          className="grid gap-3.5 mb-3.5"
          style={{ gridTemplateColumns: "1.5fr 1fr" }}
        >
          <div
            className="bg-gp-surface rounded-[10px]"
            style={{ border: `1px solid ${C.border}`, padding: 14 }}
          >
            <div style={secaoTituloStyle}>💰 Pagamento e ajustes</div>
            <div className="grid grid-cols-2 gap-2.5 mb-2.5">
              <Campo label="Deslocamento (R$)">
                <input
                  type="number" step="0.01" min="0" value={deslocamento}
                  onChange={(e) => setDeslocamento(e.target.value)}
                  style={inputStyle}
                />
              </Campo>
              <Campo label="Desconto (R$)">
                <input
                  type="number" step="0.01" min="0" value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                  style={inputStyle}
                />
              </Campo>
            </div>
            <Campo label="Formas e condições de pagamento">
              <textarea
                value={formaCondicaoPagamento}
                onChange={(e) => setFormaCondicaoPagamento(e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                placeholder="Ex.: 50% de entrada via PIX, restante na entrega"
                maxLength={500}
              />
            </Campo>
            {funcionarios.length > 0 && (
              <div className="mt-2.5">
                <Campo label="Responsável (técnico/comercial)">
                  <SelectBusca<Funcionario>
                    opcoes={funcionarios}
                    value={responsavelId}
                    onChange={setResponsavelId}
                    placeholder="— Nenhum —"
                    style={inputStyle}
                  />
                </Campo>
              </div>
            )}
          </div>

          <div
            className="bg-gp-surface rounded-[10px] flex flex-col gap-2"
            style={{ border: `1px solid ${C.border}`, padding: 14 }}
          >
            <div style={secaoTituloStyle}>🧾 Totais</div>
            <LinhaTotal label="Valor produtos" valor={totais.valorProdutos} />
            <LinhaTotal label="Valor serviços" valor={totais.valorServicos} />
            <LinhaTotal label="Deslocamento" valor={parseFloat(String(deslocamento).replace(",", ".")) || 0} />
            <LinhaTotal label="Desconto" valor={-(parseFloat(String(desconto).replace(",", ".")) || 0)} />
            <div
              className="flex justify-between items-center"
              style={{
                borderTop: `1px solid ${C.border}`,
                marginTop: 6,
                paddingTop: 10,
              }}
            >
              <div className="text-gp-muted text-xs font-bold uppercase">Total</div>
              <div className="text-gp-green text-[22px] font-extrabold">{fmtBRL(totais.total)}</div>
            </div>
          </div>
        </div>

        {/* OBSERVACOES + IMPRESSAO */}
        <div
          className="bg-gp-surface rounded-[10px] mb-3.5"
          style={{ border: `1px solid ${C.border}`, padding: 14 }}
        >
          <div style={secaoTituloStyle}>📋 Observações e impressão</div>
          <Campo label="Observações gerais">
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              maxLength={2000}
            />
          </Campo>
          <div className="mt-2.5">
            <Campo label="Texto de rodapé (garantia/aviso)">
              <input
                value={rodape}
                onChange={(e) => setRodape(e.target.value)}
                style={inputStyle}
                maxLength={300}
              />
            </Campo>
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-2.5">
            <CheckboxLinha label="Imprimir observações" checked={imprimirObservacoes}
              onChange={setImprimirObservacoes} />
            <CheckboxLinha label="Mostrar valor por m² na impressão" checked={mostrarValorMetro}
              onChange={setMostrarValorMetro} />
            <CheckboxLinha label="Imprimir valores (totais)" checked={imprimirValores}
              onChange={setImprimirValores} />
          </div>
        </div>

        {erro && (
          <div
            className="mb-3 rounded-lg text-[13px] text-gp-red"
            style={{
              padding: "10px 12px",
              background: C.red + "22",
              border: `1px solid ${C.red}55`,
            }}
          >
            {erro}
          </div>
        )}

        <div className="flex gap-2.5 justify-end">
          <button type="button" onClick={onCancelar} disabled={salvando} style={btnSecundarioStyle}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando || itens.length === 0}
            style={{ ...btnPrimarioStyle, opacity: itens.length === 0 ? 0.5 : 1 }}
          >
            {salvando ? "Salvando..." : (editando ? "Salvar alterações" : "Criar orçamento")}
          </button>
        </div>
      </form>
    </div>
  );
}

// ============ ITEM DO FORMULARIO ============

interface ItemFormularioProps {
  indice: number;
  item: ItemForm;
  produtos: Produto[];
  tabelaPreco: TabelaPreco;
  onAtualizar: (campo: keyof ItemForm, valor: string) => void;
  onRemover: () => void;
}

function ItemFormulario({ indice, item, produtos, tabelaPreco, onAtualizar, onRemover }: ItemFormularioProps) {
  const { totalEm, subtotal } = calcularItem(item);
  const usaArea = (parseFloat(item.largura) || 0) > 0 && (parseFloat(item.altura) || 0) > 0;
  const produto = produtos.find((p) => p.id === item.produtoId);

  return (
    <div
      style={{
        padding: 12,
        borderBottom: `1px solid ${C.border}`,
        background: indice % 2 === 0 ? C.bg : "transparent",
      }}
    >
      <div
        className="grid items-end gap-2"
        style={{ gridTemplateColumns: "30px 2fr 1fr 1fr 1fr 1fr 1fr 130px 36px" }}
      >
        <div
          className="text-gp-muted text-[13px] font-bold text-center"
          style={{ paddingBottom: 10 }}
        >
          {indice + 1}
        </div>
        <Campo label="Produto / Serviço *" noMargin>
          <SelectBusca<Produto>
            opcoes={produtos}
            value={item.produtoId}
            onChange={(v) => onAtualizar("produtoId", v)}
            labelFn={(p) => `${p.codigo} — ${p.nome}${p.tipoItem === "SERVICO" ? " 🔧" : ""} (${p.unidade})`}
            placeholder="Buscar produto..."
            required
            style={{ ...inputStyle, padding: "6px 8px" }}
          />
        </Campo>
        <Campo label="Largura" noMargin>
          <input
            type="number" step="0.001" min="0" value={item.largura}
            onChange={(e) => onAtualizar("largura", e.target.value)}
            aria-label="Largura"
            style={{ ...inputStyle, padding: "6px 8px", textAlign: "right" }}
            placeholder="0,000"
          />
        </Campo>
        <Campo label="Altura" noMargin>
          <input
            type="number" step="0.001" min="0" value={item.altura}
            onChange={(e) => onAtualizar("altura", e.target.value)}
            aria-label="Altura"
            style={{ ...inputStyle, padding: "6px 8px", textAlign: "right" }}
            placeholder="0,000"
          />
        </Campo>
        <Campo label="Total em m²" noMargin>
          <input
            value={totalEm > 0 ? totalEm.toFixed(3) : "—"}
            readOnly
            aria-label="Total em metros quadrados"
            style={{ ...inputStyle, padding: "6px 8px", textAlign: "right", color: C.muted, background: C.bg }}
          />
        </Campo>
        <Campo label="Quantidade *" noMargin>
          <input
            type="number" step="0.001" min="0.001" value={item.quantidade}
            onChange={(e) => onAtualizar("quantidade", e.target.value)}
            required
            aria-label="Quantidade"
            style={{ ...inputStyle, padding: "6px 8px", textAlign: "right" }}
          />
        </Campo>
        <Campo label={usaArea ? `Vlr p/ m² (${tabelaPreco})` : `Vlr unit. (${tabelaPreco})`} noMargin>
          <input
            type="number" step="0.01" min="0" value={item.valorUnitario}
            onChange={(e) => onAtualizar("valorUnitario", e.target.value)}
            required
            aria-label="Valor unitário"
            style={{ ...inputStyle, padding: "6px 8px", textAlign: "right" }}
          />
        </Campo>
        <Campo label="Subtotal" noMargin>
          <input
            value={fmtBRL(subtotal)}
            readOnly
            aria-label="Subtotal"
            style={{
              ...inputStyle,
              padding: "6px 8px",
              textAlign: "right",
              color: C.green,
              fontWeight: 700,
              background: C.bg,
            }}
          />
        </Campo>
        <button
          type="button"
          onClick={onRemover}
          title="Remover item"
          aria-label="Remover item"
          className="rounded-md text-sm cursor-pointer self-end"
          style={{
            background: C.red + "22",
            border: `1px solid ${C.red}55`,
            color: C.red,
            padding: "6px 8px",
          }}
        >
          ×
        </button>
      </div>

      <div className="mt-2 grid grid-cols-5 gap-2">
        <Campo label="Formato" noMargin>
          <input
            value={item.formato}
            onChange={(e) => onAtualizar("formato", e.target.value)}
            style={{ ...inputStyle, padding: "6px 8px" }}
            placeholder="Ex.: A4, 80×120cm"
            maxLength={100}
          />
        </Campo>
        <Campo label="Vias" noMargin>
          <input
            value={item.vias}
            onChange={(e) => onAtualizar("vias", e.target.value)}
            style={{ ...inputStyle, padding: "6px 8px" }}
            placeholder="Ex.: 2 vias"
            maxLength={50}
          />
        </Campo>
        <Campo label="Cores" noMargin>
          <input
            value={item.cores}
            onChange={(e) => onAtualizar("cores", e.target.value)}
            style={{ ...inputStyle, padding: "6px 8px" }}
            placeholder="Ex.: 4×4, P&B"
            maxLength={50}
          />
        </Campo>
        <Campo label="Acerto do total (R$)" noMargin>
          <input
            type="number" step="0.01" value={item.acertoTotal}
            onChange={(e) => onAtualizar("acertoTotal", e.target.value)}
            aria-label="Acerto do total"
            style={{ ...inputStyle, padding: "6px 8px", textAlign: "right" }}
          />
        </Campo>
        <Campo label="Descrição (snapshot)" noMargin>
          <input
            value={item.descricao}
            onChange={(e) => onAtualizar("descricao", e.target.value)}
            style={{ ...inputStyle, padding: "6px 8px" }}
            placeholder={produto?.nome || "Descrição que aparece no documento"}
            maxLength={200}
          />
        </Campo>
      </div>

      <div className="mt-2">
        <Campo label="Complemento do produto" noMargin>
          <input
            value={item.complemento}
            onChange={(e) => onAtualizar("complemento", e.target.value)}
            style={{ ...inputStyle, padding: "6px 8px" }}
            placeholder="Detalhes adicionais (acabamento, material, prazo…)"
            maxLength={500}
          />
        </Campo>
      </div>
    </div>
  );
}

// ============ MODAL DETALHE ============

interface DetalheOrcamentoModalProps {
  orcamento: Orcamento;
  empresa: ConfiguracaoEmpresa | null;
  podeAgir: boolean;
  podeExcluir: boolean;
  onFechar: () => void;
  onAtualizar: (msg: string) => void;
  onExcluir: (msg: string) => void;
}

function DetalheOrcamentoModal({
  orcamento: orc, empresa, podeAgir, podeExcluir, onFechar, onAtualizar, onExcluir,
}: DetalheOrcamentoModalProps) {
  const [acaoAberta, setAcaoAberta] = useState<AcaoDef["id"] | "">("");
  const [motivo, setMotivo] = useState("");
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("DINHEIRO");
  const [executando, setExecutando] = useState(false);
  const [erroAcao, setErroAcao] = useState("");
  // Aceite online: link publico gerado e feedback de copia.
  const [gerandoLink, setGerandoLink] = useState(false);
  const [linkPublico, setLinkPublico] = useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = useState(false);

  const cor = corStatus(orc.status);

  // Gera (ou recupera) o link de aprovacao e copia para a area de
  // transferencia. Disponivel enquanto o orcamento nao foi cancelado/entregue.
  const podeGerarLink = orc.status !== "CANCELADO" && orc.status !== "ENTREGUE" && !orc.vendaId;
  async function gerarECopiarLink() {
    setGerandoLink(true);
    setErroAcao("");
    try {
      const r = await api.gerarLinkPublicoOrcamento(orc.id) as { token: string; status: string };
      const url = `${window.location.origin}/?orc=${r.token}`;
      setLinkPublico(url);
      try {
        await navigator.clipboard.writeText(url);
        setLinkCopiado(true);
        setTimeout(() => setLinkCopiado(false), 2500);
      } catch { /* clipboard pode falhar sem https — link fica visivel para copia manual */ }
      // Se subiu de RASCUNHO para AGUARDANDO_APROVACAO, reflete na tela.
      if (r.status && r.status !== orc.status) {
        onAtualizar(`✓ Link gerado — orçamento agora "${STATUS_LABEL[r.status as StatusOrcamento]}"`);
      }
    } catch (err) {
      setErroAcao((err as Error).message);
    } finally {
      setGerandoLink(false);
    }
  }

  const acoesPossiveis = useMemo<AcaoDef[]>(() => {
    const arr: AcaoDef[] = [];
    if (orc.status === "RASCUNHO") {
      arr.push({ id: "enviar", label: "Enviar para aprovação", cor: C.yellow });
      arr.push({ id: "cancelar", label: "Cancelar", cor: C.red, pedeMotivo: true });
    } else if (orc.status === "AGUARDANDO_APROVACAO") {
      arr.push({ id: "aprovar", label: "Aprovar", cor: C.green });
      arr.push({ id: "rejeitar", label: "Rejeitar", cor: C.red, pedeMotivo: true });
      arr.push({ id: "voltar", label: "Voltar a rascunho", cor: C.muted });
    } else if (orc.status === "APROVADO") {
      arr.push({ id: "entregar", label: "Finalizar (gerar venda)", cor: C.green, pedeForma: true });
      arr.push({ id: "cancelar", label: "Cancelar", cor: C.red, pedeMotivo: true });
    } else if (orc.status === "REJEITADO") {
      arr.push({ id: "voltar", label: "Voltar a rascunho", cor: C.accent });
    }
    return arr;
  }, [orc.status]);

  function abrirAcao(acao: AcaoDef["id"]) {
    setAcaoAberta(acao);
    setErroAcao("");
    setMotivo("");
  }

  async function executarAcao() {
    setErroAcao("");
    const acao = acoesPossiveis.find((a) => a.id === acaoAberta);
    if (!acao) return;

    if (acao.pedeMotivo && !motivo.trim()) {
      setErroAcao("Informe o motivo");
      return;
    }

    setExecutando(true);
    try {
      if (acao.id === "entregar") {
        const r = await api.converterOrcamentoEmVenda(orc.id, formaPagamento) as VendaConvertida;
        onAtualizar(`✓ Orçamento #${orc.numero} entregue — venda #${r.venda.numero} gerada (${fmtBRL(r.venda.total)})`);
      } else {
        const mapaStatus: Record<Exclude<AcaoDef["id"], "entregar">, StatusOrcamento> = {
          enviar: "AGUARDANDO_APROVACAO",
          aprovar: "APROVADO",
          rejeitar: "REJEITADO",
          cancelar: "CANCELADO",
          voltar: "RASCUNHO",
        };
        const novoStatus = mapaStatus[acao.id as Exclude<AcaoDef["id"], "entregar">];
        await api.alterarStatusOrcamento(orc.id, novoStatus, motivo);
        onAtualizar(`✓ Status alterado para "${STATUS_LABEL[novoStatus]}"`);
      }
      setAcaoAberta("");
    } catch (err) {
      setErroAcao((err as Error).message);
    } finally {
      setExecutando(false);
    }
  }

  async function excluir() {
    if (!confirm(`Excluir o orçamento #${orc.numero}? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.excluirOrcamento(orc.id);
      onExcluir(`Orçamento #${orc.numero} excluído`);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  function imprimir() {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      alert("Bloqueio de popup impediu a impressao. Permita popups e tente novamente.");
      return;
    }
    w.document.write(gerarHTMLImpressao(orc, empresa));
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 250);
  }

  return (
    <div onClick={onFechar} style={modalOverlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...modalCardStyle, maxWidth: 880 }}>
        <div style={modalHeaderStyle}>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="text-gp-white font-bold text-xl">
                {orc.tipo === "ORDEM_SERVICO" ? "O.S." : "Orçamento"} #{orc.numero}
              </div>
              <span
                className="text-[11px] font-bold uppercase rounded-full"
                style={{
                  background: cor + "22",
                  border: `1px solid ${cor}55`,
                  color: cor,
                  padding: "3px 10px",
                  letterSpacing: 0.4,
                }}
              >
                {STATUS_LABEL[orc.status]}
              </span>
              <span
                className="text-[11px] font-semibold rounded-full bg-gp-surface text-gp-muted"
                style={{
                  border: `1px solid ${C.border}`,
                  padding: "3px 10px",
                }}
              >
                Tabela {orc.tabelaPreco}
              </span>
            </div>
            <div className="text-gp-muted text-xs mt-1">
              Criado em {fmtData(orc.createdAt)}
              {orc.user?.nome && <> · por {orc.user.nome}</>}
              {orc.responsavel?.nome && <> · responsável {orc.responsavel.nome}</>}
            </div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" style={btnFecharStyle}>×</button>
        </div>

        {(orc.dataAprovacao || orc.dataEntrega || orc.dataRejeicao || orc.dataCancelamento) && (
          <div
            className="mb-3.5 flex flex-wrap gap-4 text-xs text-gp-muted bg-gp-surface rounded-lg"
            style={{
              padding: 10,
              border: `1px solid ${C.border}`,
            }}
          >
            {orc.dataAprovacao && <div><b style={{ color: C.accent }}>Aprovado:</b> {fmtData(orc.dataAprovacao)}</div>}
            {orc.dataEntrega && <div><b style={{ color: C.green }}>Entregue:</b> {fmtData(orc.dataEntrega)}</div>}
            {orc.dataRejeicao && (
              <div>
                <b style={{ color: C.red }}>Rejeitado:</b> {fmtData(orc.dataRejeicao)}
                {orc.motivoRejeicao ? ` — ${orc.motivoRejeicao}` : ""}
              </div>
            )}
            {orc.dataCancelamento && (
              <div>
                <b style={{ color: C.red }}>Cancelado:</b> {fmtData(orc.dataCancelamento)}
                {orc.motivoCancelamento ? ` — ${orc.motivoCancelamento}` : ""}
              </div>
            )}
            {orc.venda && <div><b style={{ color: C.green }}>Venda gerada:</b> #{orc.venda.numero} ({fmtBRL(orc.venda.total)})</div>}
          </div>
        )}

        <div
          className="bg-gp-surface rounded-lg mb-3.5"
          style={{ border: `1px solid ${C.border}`, padding: 12 }}
        >
          <div className="text-gp-muted text-[11px] font-bold mb-1">CLIENTE</div>
          <div className="text-gp-white font-semibold text-[15px]">
            {orc.cliente?.nome || orc.descricaoCliente || "—"}
          </div>
          {orc.contato && <div className="text-gp-text text-xs mt-0.5">Contato: {orc.contato}</div>}
          {orc.telefone && <div className="text-gp-text text-xs">Tel: {orc.telefone}</div>}
          {orc.cliente?.cpfCnpj && <div className="text-gp-muted text-xs">CPF/CNPJ: {orc.cliente.cpfCnpj}</div>}
        </div>

        <div
          className="bg-gp-surface rounded-[10px] overflow-hidden mb-3.5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div
            className="bg-gp-bg text-gp-muted text-[11px] font-bold uppercase"
            style={{
              padding: "10px 14px",
              borderBottom: `1px solid ${C.border}`,
              letterSpacing: 0.5,
            }}
          >
            Itens
          </div>
          {orc.itens?.map((it, idx) => {
            const usaArea = Number(it.largura || 0) > 0 && Number(it.altura || 0) > 0;
            return (
              <div
                key={it.id}
                className="text-[13px]"
                style={{
                  padding: "10px 14px",
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <div className="text-gp-white font-semibold">
                      {idx + 1}. {it.descricao}
                      {it.produto?.tipoItem === "SERVICO" && (
                        <span className="ml-2 text-[11px]" style={{ color: C.purple }}>🔧 SERVIÇO</span>
                      )}
                    </div>
                    <div className="text-gp-muted text-[11px] font-mono">
                      {it.produto?.codigo}{it.produto?.referencia ? ` · ref: ${it.produto.referencia}` : ""}
                    </div>
                    <div className="text-gp-text text-xs mt-1">
                      {usaArea ? (
                        <>
                          {Number(it.largura).toFixed(3)} × {Number(it.altura).toFixed(3)} = {Number(it.totalEm).toFixed(3)} m² ·
                          {" "}{Number(it.quantidade)} × {fmtBRL(it.valorUnitario)}/m²
                        </>
                      ) : (
                        <>
                          {Number(it.quantidade)} {it.produto?.unidade || ""} × {fmtBRL(it.valorUnitario)}
                        </>
                      )}
                      {Number(it.acertoTotal) !== 0 && (
                        <> · acerto {fmtBRL(it.acertoTotal)}</>
                      )}
                    </div>
                    {(it.formato || it.vias || it.cores) && (
                      <div className="text-gp-muted text-[11px] mt-0.5">
                        {it.formato && <>Formato: {it.formato} · </>}
                        {it.vias && <>Vias: {it.vias} · </>}
                        {it.cores && <>Cores: {it.cores}</>}
                      </div>
                    )}
                    {it.complemento && (
                      <div className="text-gp-text text-xs mt-1 italic">
                        {it.complemento}
                      </div>
                    )}
                  </div>
                  <div className="text-gp-green font-bold text-[15px] whitespace-nowrap">
                    {fmtBRL(it.subtotal)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="bg-gp-surface rounded-[10px] mb-3.5"
          style={{ border: `1px solid ${C.border}`, padding: 14 }}
        >
          <LinhaTotal label="Valor produtos" valor={Number(orc.valorProdutos)} />
          <LinhaTotal label="Valor serviços" valor={Number(orc.valorServicos)} />
          <LinhaTotal label="Deslocamento" valor={Number(orc.deslocamento)} />
          <LinhaTotal label="Desconto" valor={-Number(orc.desconto)} />
          <div
            className="flex justify-between items-center"
            style={{
              borderTop: `1px solid ${C.border}`,
              marginTop: 6,
              paddingTop: 10,
            }}
          >
            <div className="text-gp-muted text-xs font-bold uppercase">Total</div>
            <div className="text-gp-green text-[22px] font-extrabold">{fmtBRL(orc.total)}</div>
          </div>
        </div>

        {orc.formaCondicaoPagamento && (
          <div
            className="bg-gp-surface mb-3.5 rounded-lg"
            style={{ border: `1px solid ${C.border}`, padding: 10 }}
          >
            <div className="text-gp-muted text-[11px] font-bold mb-1">FORMAS E CONDIÇÕES DE PAGAMENTO</div>
            <div className="text-gp-text text-[13px] whitespace-pre-wrap">{orc.formaCondicaoPagamento}</div>
          </div>
        )}

        {orc.observacoes && (
          <div
            className="bg-gp-surface mb-3.5 rounded-lg"
            style={{ border: `1px solid ${C.border}`, padding: 10 }}
          >
            <div className="text-gp-muted text-[11px] font-bold mb-1">OBSERVAÇÕES GERAIS</div>
            <div className="text-gp-text text-[13px] whitespace-pre-wrap">{orc.observacoes}</div>
          </div>
        )}

        {acaoAberta && (
          <div
            className="mb-3.5 bg-gp-bg rounded-[10px]"
            style={{
              padding: 14,
              border: `1px solid ${C.border}`,
            }}
          >
            <div className="text-gp-white font-bold text-sm mb-2.5">
              {acoesPossiveis.find((a) => a.id === acaoAberta)?.label}
            </div>
            {acaoAberta === "entregar" && (
              <Campo label="Forma de pagamento da venda *">
                <select
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value as FormaPagamento)}
                  aria-label="Forma de pagamento"
                  style={inputStyle}
                >
                  {(Object.entries(FORMAS_PAGAMENTO_LABEL) as [FormaPagamento, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Campo>
            )}
            {acoesPossiveis.find((a) => a.id === acaoAberta)?.pedeMotivo && (
              <Campo label="Motivo">
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                  maxLength={500}
                />
              </Campo>
            )}
            {erroAcao && (
              <div
                className="mt-2 rounded-md text-xs text-gp-red"
                style={{
                  padding: "8px 12px",
                  background: C.red + "22",
                  border: `1px solid ${C.red}55`,
                }}
              >
                {erroAcao}
              </div>
            )}
            <div className="flex gap-2.5 mt-3 justify-end">
              <button
                type="button"
                onClick={() => setAcaoAberta("")}
                disabled={executando}
                style={btnSecundarioStyle}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executarAcao}
                disabled={executando}
                style={btnPrimarioStyle}
              >
                {executando ? "Processando..." : "Confirmar"}
              </button>
            </div>
          </div>
        )}

        {linkPublico && (
          <div
            className="mb-3 rounded-[10px] flex items-center gap-2 flex-wrap"
            style={{ padding: "10px 12px", background: C.green + "11", border: `1px solid ${C.green}44` }}
          >
            <span className="text-[11px] font-bold uppercase" style={{ color: C.green, letterSpacing: 0.4 }}>
              🔗 Link de aprovação
            </span>
            <input
              readOnly
              value={linkPublico}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Link de aprovação do orçamento"
              className="flex-1 min-w-[180px] bg-gp-bg text-gp-text rounded-md text-xs outline-none"
              style={{ border: `1px solid ${C.border}`, padding: "6px 8px" }}
            />
            {orc.telefone && (
              <a
                href={`https://wa.me/${(() => { const d = String(orc.telefone).replace(/\D/g, ""); return d.length <= 11 ? `55${d}` : d; })()}?text=${encodeURIComponent(`Olá! Segue o orçamento #${orc.numero} para sua aprovação: ${linkPublico}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={btnIconeStyle(C.green)}
              >
                💬 Enviar
              </a>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-between flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={imprimir} style={btnIconeStyle(C.accent)}>🖨 Imprimir</button>
            {podeAgir && podeGerarLink && (
              <button
                type="button"
                onClick={gerarECopiarLink}
                disabled={gerandoLink}
                style={btnIconeStyle(C.green)}
                title="Gera um link para o cliente aprovar ou recusar online"
              >
                {gerandoLink ? "Gerando..." : linkCopiado ? "✓ Link copiado" : "🔗 Link de aprovação"}
              </button>
            )}
            {podeExcluir && !orc.vendaId && (
              <button type="button" onClick={excluir} style={btnIconeStyle(C.red)}>🗑 Excluir</button>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {podeAgir && acoesPossiveis.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => abrirAcao(a.id)}
                disabled={!!acaoAberta}
                className="rounded-lg text-[13px] font-bold"
                style={{
                  background: a.cor + "22",
                  border: `1px solid ${a.cor}55`,
                  color: a.cor,
                  padding: "8px 14px",
                  cursor: acaoAberta ? "not-allowed" : "pointer",
                  opacity: acaoAberta ? 0.5 : 1,
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ HTML PARA IMPRESSAO ============

function escapeHtml(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gerarHTMLImpressao(orc: Orcamento, empresa: ConfiguracaoEmpresa | null): string {
  const tipoLabel = orc.tipo === "ORDEM_SERVICO" ? "ORDEM DE SERVIÇO" : "ORÇAMENTO";
  const data = new Date(orc.createdAt).toLocaleString("pt-BR");
  const cliente = orc.cliente?.nome || orc.descricaoCliente || "—";

  const empresaHTML = empresa ? (() => {
    const nomeExibicao = empresa.nomeFantasia || empresa.razaoSocial || "";
    const logoUrl = urlLogotipo(empresa.logotipo);
    const linhaEnd = [empresa.endereco, empresa.numero, empresa.bairro].filter(Boolean).join(", ");
    const linhaCidade = [empresa.cidade, empresa.estado, empresa.cep].filter(Boolean).join(" - ");
    const linhaContato = [
      empresa.telefone ? `Tel: ${empresa.telefone}` : null,
      empresa.email ? `E-mail: ${empresa.email}` : null,
    ].filter(Boolean).join(" · ");
    const linhaDocs = [
      empresa.cnpj ? `CNPJ: ${empresa.cnpj}` : null,
      empresa.inscEstadual ? `IE: ${empresa.inscEstadual}` : null,
    ].filter(Boolean).join(" · ");
    return `
      <div class="empresa">
        ${logoUrl ? `<div class="empresa-logo"><img src="${escapeHtml(logoUrl)}" alt="logo"></div>` : ""}
        <div class="empresa-dados">
          <div class="empresa-nome">${escapeHtml(nomeExibicao)}</div>
          ${empresa.nomeFantasia && empresa.razaoSocial && empresa.nomeFantasia !== empresa.razaoSocial
            ? `<div class="empresa-razao">${escapeHtml(empresa.razaoSocial)}</div>` : ""}
          ${linhaDocs ? `<div class="empresa-linha">${escapeHtml(linhaDocs)}</div>` : ""}
          ${linhaEnd ? `<div class="empresa-linha">${escapeHtml(linhaEnd)}</div>` : ""}
          ${linhaCidade ? `<div class="empresa-linha">${escapeHtml(linhaCidade)}</div>` : ""}
          ${linhaContato ? `<div class="empresa-linha">${escapeHtml(linhaContato)}</div>` : ""}
        </div>
      </div>
    `;
  })() : "";

  const itens = (orc.itens || []).map((it, i) => {
    const usaArea = Number(it.largura || 0) > 0 && Number(it.altura || 0) > 0;
    const desc = `${it.descricao}${it.complemento ? `<br><small>${it.complemento}</small>` : ""}`;
    const detalhe = usaArea
      ? `${Number(it.largura).toFixed(3)} × ${Number(it.altura).toFixed(3)} m = ${Number(it.totalEm).toFixed(3)} m² · ${Number(it.quantidade)} un`
      : `${Number(it.quantidade)} ${it.produto?.unidade || "un"}`;
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${desc}<br><small style="color:#888">${detalhe}</small></td>
        <td style="text-align:right">${fmtBRL(it.valorUnitario)}</td>
        <td style="text-align:right"><b>${fmtBRL(it.subtotal)}</b></td>
      </tr>
    `;
  }).join("");

  const valoresHTML = orc.imprimirValores ? `
    <table class="totais">
      <tr><td>Valor produtos</td><td>${fmtBRL(orc.valorProdutos)}</td></tr>
      <tr><td>Valor serviços</td><td>${fmtBRL(orc.valorServicos)}</td></tr>
      <tr><td>Deslocamento</td><td>${fmtBRL(orc.deslocamento)}</td></tr>
      <tr><td>Desconto</td><td>- ${fmtBRL(orc.desconto)}</td></tr>
      <tr class="total"><td>TOTAL</td><td>${fmtBRL(orc.total)}</td></tr>
    </table>
  ` : "";

  const obsHTML = orc.observacoes && orc.imprimirObservacoes
    ? `<div class="obs"><b>Observações:</b><br>${orc.observacoes.replace(/\n/g, "<br>")}</div>`
    : "";

  const formaHTML = orc.formaCondicaoPagamento
    ? `<div class="obs"><b>Formas e condições:</b> ${orc.formaCondicaoPagamento}</div>`
    : "";

  const rodapeHTML = orc.rodape ? `<div class="rodape">${orc.rodape}</div>` : "";

  return `
<!doctype html>
<html><head><meta charset="utf-8"><title>${tipoLabel} #${orc.numero}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 760px; margin: 20px auto; color: #222; padding: 0 16px; }
  h1 { font-size: 20px; border-bottom: 2px solid #333; padding-bottom: 6px; margin: 0 0 4px; }
  .meta { font-size: 12px; color: #666; margin-bottom: 16px; }
  .empresa { display: flex; gap: 14px; align-items: center; padding: 12px 14px;
             border: 1px solid #333; border-radius: 6px; margin-bottom: 14px; background: #fafafa; }
  .empresa-logo { flex-shrink: 0; max-width: 110px; }
  .empresa-logo img { max-width: 110px; max-height: 90px; object-fit: contain; display: block; }
  .empresa-dados { flex: 1; font-size: 12px; line-height: 1.4; }
  .empresa-nome { font-size: 16px; font-weight: 700; color: #111; margin-bottom: 2px; }
  .empresa-razao { font-size: 11px; color: #555; margin-bottom: 4px; }
  .empresa-linha { color: #444; font-size: 11px; }
  .box { border: 1px solid #aaa; padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 13px; }
  .box b { color: #333; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #eee; }
  small { color: #666; }
  .totais { width: 320px; margin-left: auto; margin-top: 12px; }
  .totais td { padding: 4px 8px; text-align: right; }
  .totais td:first-child { text-align: left; color: #555; }
  .totais .total td { border-top: 2px solid #333; font-weight: 700; font-size: 14px; padding-top: 8px; }
  .obs { font-size: 12px; padding: 8px; background: #f6f6f6; border-radius: 4px; margin-top: 12px; }
  .rodape { margin-top: 18px; padding: 8px; text-align: center; font-style: italic; color: #b00; font-size: 12px; }
  .status { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background: #eee; }
  @media print {
    @page { margin: 0; }
    body { margin: 0; padding: 12mm; }
    .empresa { background: transparent; }
  }
</style></head><body>
  ${empresaHTML}
  <h1>${tipoLabel} Nº ${orc.numero} ${orc.via === 2 ? "<small>(2ª via)</small>" : ""}</h1>
  <div class="meta">Emitido em ${data} · Tabela ${orc.tabelaPreco} · <span class="status">${orc.status.replace(/_/g, " ")}</span></div>

  <div class="box">
    <b>Cliente:</b> ${cliente}<br>
    ${orc.contato ? `<b>Contato:</b> ${orc.contato}<br>` : ""}
    ${orc.telefone ? `<b>Telefone:</b> ${orc.telefone}<br>` : ""}
    ${orc.cliente?.cpfCnpj ? `<b>CPF/CNPJ:</b> ${orc.cliente.cpfCnpj}<br>` : ""}
    ${orc.cliente?.endereco ? `<b>Endereço:</b> ${orc.cliente.endereco}${orc.cliente.cidade ? ` — ${orc.cliente.cidade}` : ""}<br>` : ""}
  </div>

  <table>
    <thead><tr><th>#</th><th>Descrição</th><th style="text-align:right">Vlr unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
    <tbody>${itens}</tbody>
  </table>

  ${valoresHTML}
  ${formaHTML}
  ${obsHTML}
  ${rodapeHTML}

  <div class="meta" style="margin-top:24px; font-size:11px;">
    ${orc.user?.nome ? `Atendido por: ${orc.user.nome}` : ""}
    ${orc.responsavel?.nome ? ` · Responsável: ${orc.responsavel.nome}` : ""}
  </div>
</body></html>
  `;
}

// ============ HELPERS DE LAYOUT ============

interface CampoProps {
  label: string;
  children: ReactNode;
  noMargin?: boolean;
}

function Campo({ label, children, noMargin }: CampoProps) {
  return (
    <div style={{ marginBottom: noMargin ? 0 : 8 }}>
      <label className="block text-gp-muted text-[11px] mb-1 font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}

interface CheckboxLinhaProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function CheckboxLinha({ label, checked, onChange }: CheckboxLinhaProps) {
  return (
    <label
      className="flex items-center gap-2 cursor-pointer bg-gp-bg text-gp-text text-xs rounded-md"
      style={{
        border: `1px solid ${C.border}`,
        padding: "8px 10px",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: C.accent }}
      />
      {label}
    </label>
  );
}

function LinhaTotal({ label, valor }: { label: string; valor: number }) {
  const negativo = valor < 0;
  return (
    <div className="flex justify-between text-[13px]" style={{ padding: "4px 0" }}>
      <span className="text-gp-muted">{label}</span>
      <span
        className="font-semibold"
        style={{ color: negativo ? C.red : C.text }}
      >
        {negativo ? "- " : ""}{fmtBRL(Math.abs(valor))}
      </span>
    </div>
  );
}

const secaoTituloStyle: CSSProperties = {
  color: C.white,
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 10,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: "8px 10px",
  color: C.text,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

const inputCompactoStyle: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "9px 12px",
  color: C.text,
  fontSize: 13,
  outline: "none",
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 100,
};

const modalCardStyle: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  width: "100%",
  maxHeight: "92vh",
  overflowY: "auto",
  padding: 24,
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 18,
  gap: 12,
};

const btnFecharStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: C.muted,
  fontSize: 22,
  cursor: "pointer",
};

const btnSecundarioStyle: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: 8,
  padding: "10px 18px",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const btnPrimarioStyle: CSSProperties = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: C.white,
  border: "none",
  borderRadius: 8,
  padding: "10px 22px",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

function btnIconeStyle(cor: string): CSSProperties {
  return {
    background: cor + "22",
    border: `1px solid ${cor}55`,
    color: cor,
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };
}
