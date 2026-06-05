import { useEffect, useState, useCallback, useMemo, useRef, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";
import ActionsMenu from "./components/ActionsMenu";
import SelectBusca from "./components/SelectBusca";
import { fmtBRL, fmtData, fmtQtd } from "./lib/format";

import {
  listarRascunhos,
  salvarRascunho,
  removerRascunho,
  novoRascunhoId,
  type CompraRascunho,
} from "./lib/comprasRascunho";

// ============ TIPOS ============

type StatusConta = "PENDENTE" | "PAGA" | "ATRASADA" | "CANCELADA";

interface Fornecedor {
  id: string;
  nome: string;
  cnpj?: string | null;
  [extra: string]: unknown;
}

interface Produto {
  id: string;
  codigo: string;
  nome: string;
  unidade?: string | null;
  precoCusto?: number | string | null;
  [extra: string]: unknown;
}

interface FornecedorRef {
  nome: string;
  cnpj?: string | null;
}

interface ProdutoRef {
  nome: string;
  codigo: string;
  unidade?: string | null;
}

interface ItemCompra {
  id: string;
  quantidade: number;
  precoUnitario: number | string;
  subtotal: number | string;
  produto?: ProdutoRef | null;
}

interface ContaPagar {
  id: string;
  parcelaAtual: number;
  parcelaTotal: number;
  descricao: string;
  valor: number | string;
  status: StatusConta;
}

interface Compra {
  id: string;
  numero: number;
  createdAt: string;
  total: number | string;
  desconto?: number | string;
  cancelada?: boolean;
  canceladaEm?: string | null;
  motivoCancelamento?: string | null;
  observacoes?: string | null;
  fornecedor?: FornecedorRef | null;
  _count?: { itens: number };
  itens?: ItemCompra[];
  contasPagar?: ContaPagar[];
}

interface CompraResultado extends Compra {
  contasGeradas?: unknown[];
}

interface EstornoResultado {
  compra?: { numero: number };
  itensEstornados?: number;
  contasCanceladas?: number;
}

interface ItemForm {
  produtoId: string;
  quantidade: string;
  precoUnitario: string;
}

// ============ HELPERS ============

function dataDaqui(diasAFrente: number): string {
  const d = new Date();
  d.setDate(d.getDate() + diasAFrente);
  return d.toISOString().slice(0, 10);
}

function hojeLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

// ============ COMPONENTE PRINCIPAL ============

interface ComprasProps {
  user: SessionUser;
}

export default function Compras({ user }: ComprasProps) {
  const [compras, setCompras] = useState<Compra[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [filtroFornecedor, setFiltroFornecedor] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [novoAberto, setNovoAberto] = useState(false);
  const [detalhe, setDetalhe] = useState<Compra | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [rascunhos, setRascunhos] = useState<CompraRascunho[]>([]);
  const [rascunhoEditando, setRascunhoEditando] = useState<CompraRascunho | null>(null);

  const podeCriar = user.role === "ADMIN" || user.role === "GERENTE";

  useEffect(() => { setRascunhos(listarRascunhos()); }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const data = await api.listarCompras({
        fornecedorId: filtroFornecedor,
        dataInicio,
        dataFim,
      }) as Compra[];
      setCompras(data || []);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [filtroFornecedor, dataInicio, dataFim]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    api.listarFornecedores({ ativo: "true" }).then((r) => setFornecedores((r as Fornecedor[]) || [])).catch(() => {});
    api.listarProdutos({ ativo: "true" }).then((r) => setProdutos((r as Produto[]) || [])).catch(() => {});
  }, []);

  function flash(t: string) {
    setMensagem(t);
    setTimeout(() => setMensagem(""), 3000);
  }

  async function abrirDetalhe(id: string) {
    try {
      const c = await api.obterCompra(id) as Compra;
      setDetalhe(c);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function recarregarDetalhe(id: string) {
    try {
      const c = await api.obterCompra(id) as Compra;
      setDetalhe(c);
    } catch { /* mantem o detalhe atual */ }
  }

  return (
    <div>
      <div className="flex gap-2.5 mb-4 flex-wrap items-center">
        <div style={{ flex: "1 1 240px" }}>
          <SelectBusca<Fornecedor>
            opcoes={fornecedores}
            value={filtroFornecedor}
            onChange={setFiltroFornecedor}
            subLabelFn={(f) => f.cnpj}
            placeholder="Todos os fornecedores"
            style={{
              width: "100%",
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: "10px 12px",
              color: C.text,
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
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
        {(dataInicio || dataFim || filtroFornecedor) && (
          <button
            type="button"
            onClick={() => { setDataInicio(""); setDataFim(""); setFiltroFornecedor(""); }}
            className="bg-gp-surface text-gp-muted rounded-lg text-xs cursor-pointer"
            style={{
              border: `1px solid ${C.border}`,
              padding: "8px 14px",
            }}
          >
            Limpar filtros
          </button>
        )}
        {podeCriar && (
          <button
            type="button"
            onClick={() => { setRascunhoEditando(null); setNovoAberto(true); }}
            className="ml-auto text-gp-white border-none rounded-lg text-sm font-bold cursor-pointer"
            style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              padding: "10px 18px",
            }}
          >
            + Nova Compra
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

      {podeCriar && rascunhos.length > 0 && (
        <div
          className="mb-4 rounded-xl overflow-hidden"
          style={{ border: `1px solid ${C.accent}55`, background: C.accent + "0d" }}
        >
          <div
            className="text-gp-muted text-[11px] font-bold uppercase"
            style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, letterSpacing: 0.5 }}
          >
            📝 Compras em rascunho ({rascunhos.length}) — salvas neste dispositivo
          </div>
          {rascunhos.map((r) => {
            const totalRasc = r.itens.reduce((acc, it) => {
              const q = parseFloat(it.quantidade) || 0;
              const p = parseFloat(it.precoUnitario) || 0;
              return acc + q * p;
            }, 0) - (parseFloat(r.desconto) || 0);
            return (
              <div
                key={r.id}
                className="grid items-center gap-2 text-[13px]"
                style={{
                  gridTemplateColumns: "1fr 90px 120px 180px",
                  padding: "10px 16px",
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <div>
                  <div className="text-gp-white font-semibold">{r.fornecedorNome || "Sem fornecedor"}</div>
                  <div className="text-gp-muted text-[11px]">Salvo em {fmtData(new Date(r.ts).toISOString())}</div>
                </div>
                <div className="text-right text-gp-text">{r.itens.length} {r.itens.length === 1 ? "item" : "itens"}</div>
                <div className="text-right text-gp-green font-semibold">{fmtBRL(totalRasc)}</div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setRascunhoEditando(r); setNovoAberto(true); }}
                    className="rounded-md text-xs font-semibold cursor-pointer text-gp-white border-none"
                    style={{ background: C.accent, padding: "6px 12px" }}
                  >
                    Retomar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Descartar este rascunho de compra?")) {
                        setRascunhos(removerRascunho(r.id));
                      }
                    }}
                    className="rounded-md text-xs cursor-pointer"
                    style={{ background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, padding: "6px 10px" }}
                  >
                    Descartar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        className="bg-gp-card rounded-xl overflow-hidden"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div
          className="grid bg-gp-surface text-gp-muted text-xs font-bold uppercase"
          style={{
            gridTemplateColumns: "150px 90px 2fr 100px 130px 80px",
            padding: "12px 16px",
            borderBottom: `1px solid ${C.border}`,
            letterSpacing: 0.5,
          }}
        >
          <div>Data</div>
          <div>Nº</div>
          <div>Fornecedor</div>
          <div className="text-right">Itens</div>
          <div className="text-right">Total</div>
          <div className="text-right">Ações</div>
        </div>

        {carregando ? (
          <div className="py-[30px] text-center text-gp-muted text-[13px]">Carregando...</div>
        ) : compras.length === 0 ? (
          <div className="py-[30px] text-center text-gp-muted text-[13px]">Nenhuma compra encontrada.</div>
        ) : compras.map((c) => (
          <div
            key={c.id}
            className="grid items-center text-[13px]"
            style={{
              gridTemplateColumns: "150px 90px 2fr 100px 130px 80px",
              padding: "12px 16px",
              borderBottom: `1px solid ${C.border}`,
              opacity: c.cancelada ? 0.55 : 1,
            }}
          >
            <div className="text-gp-muted text-xs">{fmtData(c.createdAt)}</div>
            <div className="text-gp-white font-mono font-bold">#{c.numero}</div>
            <div>
              <div className="flex items-center gap-2">
                <div className="text-gp-white font-semibold">{c.fornecedor?.nome || "—"}</div>
                {c.cancelada && (
                  <span
                    className="text-[10px] font-bold uppercase rounded-full"
                    style={{
                      background: C.red + "22",
                      border: `1px solid ${C.red}55`,
                      color: C.red,
                      padding: "2px 8px",
                      letterSpacing: 0.5,
                    }}
                  >
                    Estornada
                  </span>
                )}
              </div>
              {c.fornecedor?.cnpj && (
                <div className="text-gp-muted text-[11px]">{c.fornecedor.cnpj}</div>
              )}
            </div>
            <div className="text-right text-gp-text">{c._count?.itens ?? "—"}</div>
            <div
              className="text-right font-bold text-sm"
              style={{
                color: c.cancelada ? C.muted : C.green,
                textDecoration: c.cancelada ? "line-through" : "none",
              }}
            >
              {fmtBRL(c.total)}
            </div>
            <div className="flex justify-end">
              <ActionsMenu
                items={[
                  {
                    label: "Ver detalhes",
                    icon: "👁",
                    color: C.accent,
                    onClick: () => abrirDetalhe(c.id),
                  },
                ]}
              />
            </div>
          </div>
        ))}
      </div>

      {novoAberto && (
        <NovaCompraModal
          fornecedores={fornecedores}
          produtos={produtos}
          rascunhoInicial={rascunhoEditando}
          onCancelar={() => { setNovoAberto(false); setRascunhoEditando(null); }}
          onSalvarRascunho={(r) => {
            setRascunhos(salvarRascunho(r));
            setNovoAberto(false);
            setRascunhoEditando(null);
            flash("Rascunho de compra salvo — retome quando quiser pela lista acima.");
          }}
          onSalvar={(c) => {
            setNovoAberto(false);
            // Concluiu a compra — se veio de um rascunho, descarta o rascunho.
            if (rascunhoEditando) setRascunhos(removerRascunho(rascunhoEditando.id));
            setRascunhoEditando(null);
            const qtdContas = c.contasGeradas?.length || 0;
            const sufixo = qtdContas > 0
              ? ` · ${qtdContas} conta${qtdContas > 1 ? "s" : ""} a pagar gerada${qtdContas > 1 ? "s" : ""}`
              : "";
            flash(`Compra #${c.numero} registrada — total ${fmtBRL(c.total)}${sufixo}`);
            carregar();
          }}
        />
      )}

      {detalhe && (
        <DetalheCompraModal
          compra={detalhe}
          podeEstornar={podeCriar}
          onFechar={() => setDetalhe(null)}
          onEstornado={(msg) => {
            recarregarDetalhe(detalhe.id);
            carregar();
            flash(msg);
          }}
        />
      )}
    </div>
  );
}

// ============ MODAL NOVA COMPRA ============

interface NovaCompraModalProps {
  fornecedores: Fornecedor[];
  produtos: Produto[];
  rascunhoInicial?: CompraRascunho | null;
  onCancelar: () => void;
  onSalvar: (c: CompraResultado) => void;
  onSalvarRascunho: (r: CompraRascunho) => void;
}

function NovaCompraModal({ fornecedores, produtos, rascunhoInicial, onCancelar, onSalvar, onSalvarRascunho }: NovaCompraModalProps) {
  const [fornecedorId, setFornecedorId] = useState(rascunhoInicial?.fornecedorId ?? "");
  const [observacoes, setObservacoes] = useState(rascunhoInicial?.observacoes ?? "");
  const [dataCompra, setDataCompra] = useState<string>(() => rascunhoInicial?.dataCompra || hojeLocalISO());
  const [itens, setItens] = useState<ItemForm[]>(() => rascunhoInicial?.itens ?? []);
  const [desconto, setDesconto] = useState(rascunhoInicial?.desconto ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  // Id estavel deste rascunho: reusa o do rascunho retomado ou cria um novo,
  // pra "Salvar rascunho" varias vezes atualizar o mesmo registro.
  const rascunhoIdRef = useRef<string>(rascunhoInicial?.id ?? novoRascunhoId());
  // Indice da linha que deve receber foco (nova linha criada via Tab/botao).
  const [focarIdx, setFocarIdx] = useState<number | null>(null);

  const [gerarConta, setGerarConta] = useState(rascunhoInicial?.gerarConta ?? true);
  const [vencimento, setVencimento] = useState<string>(() => rascunhoInicial?.vencimento || dataDaqui(30));
  const [parcelas, setParcelas] = useState(rascunhoInicial?.parcelas ?? 1);

  const subtotal = useMemo(
    () => itens.reduce((acc, it) => {
      const q = parseFloat(it.quantidade) || 0;
      const p = parseFloat(it.precoUnitario) || 0;
      return acc + q * p;
    }, 0),
    [itens],
  );

  const descontoNum = Math.max(0, parseFloat(String(desconto).replace(",", ".")) || 0);
  const total = Math.max(0, subtotal - descontoNum);

  function adicionarItem() {
    setFocarIdx(itens.length); // foca a linha recem-criada
    setItens([...itens, { produtoId: "", quantidade: "1", precoUnitario: "" }]);
  }

  function removerItem(idx: number) {
    setItens(itens.filter((_, i) => i !== idx));
  }

  function atualizarItem(idx: number, campo: keyof ItemForm, valor: string) {
    const novos = [...itens];
    novos[idx] = { ...novos[idx], [campo]: valor };
    if (campo === "produtoId" && valor) {
      const p = produtos.find((x) => x.id === valor);
      if (p && !novos[idx].precoUnitario) {
        novos[idx].precoUnitario = p.precoCusto != null ? String(p.precoCusto) : "";
      }
    }
    setItens(novos);
  }

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    if (!fornecedorId) { setErro("Selecione um fornecedor"); return; }
    if (itens.length === 0) { setErro("Adicione ao menos um item"); return; }
    if (!dataCompra) { setErro("Informe a data da compra"); return; }
    if (dataCompra > hojeLocalISO()) { setErro("Data da compra nao pode ser futura"); return; }
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      if (!it.produtoId) { setErro(`Item ${i + 1}: selecione o produto`); return; }
      const q = parseFloat(String(it.quantidade).replace(",", "."));
      if (!Number.isFinite(q) || q <= 0) { setErro(`Item ${i + 1}: quantidade inválida`); return; }
      const p = parseFloat(String(it.precoUnitario).replace(",", "."));
      if (!Number.isFinite(p) || p < 0) { setErro(`Item ${i + 1}: preço unitário inválido`); return; }
    }

    if (descontoNum > subtotal) { setErro("Desconto não pode ser maior que o subtotal da compra"); return; }

    if (gerarConta) {
      if (!vencimento) { setErro("Informe o vencimento da conta a pagar"); return; }
      const p = parcelas;
      if (!Number.isFinite(p) || p < 1 || p > 60) {
        setErro("Numero de parcelas deve estar entre 1 e 60"); return;
      }
    }

    setSalvando(true);
    try {
      const payload: Record<string, unknown> = {
        fornecedorId,
        observacoes,
        desconto: descontoNum,
        itens: itens.map((it) => ({
          produtoId: it.produtoId,
          quantidade: it.quantidade,
          precoUnitario: it.precoUnitario,
        })),
      };
      if (dataCompra && dataCompra < hojeLocalISO()) {
        payload.dataCompra = dataCompra;
      }
      if (gerarConta) {
        payload.gerarContaPagar = {
          vencimento,
          parcelas: parcelas || 1,
        };
      }
      const c = await api.criarCompra(payload) as CompraResultado;
      onSalvar(c);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  function salvarComoRascunho() {
    setErro("");
    if (!fornecedorId && itens.length === 0) {
      setErro("Selecione um fornecedor ou adicione um item para salvar o rascunho");
      return;
    }
    const forn = fornecedores.find((f) => f.id === fornecedorId);
    onSalvarRascunho({
      id: rascunhoIdRef.current,
      ts: Date.now(),
      fornecedorId,
      fornecedorNome: forn?.nome ?? "",
      observacoes,
      dataCompra,
      itens,
      desconto: String(desconto),
      gerarConta,
      vencimento,
      parcelas,
    });
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={modalOverlayStyle}>
      <form
        onSubmit={salvar}
        onClick={(e) => e.stopPropagation()}
        style={{ ...modalCardStyle, maxWidth: 880 }}
      >
        <div style={modalHeaderStyle}>
          <div className="text-gp-white font-bold text-lg">Nova Compra</div>
          <button
            type="button"
            onClick={onCancelar}
            aria-label="Fechar"
            style={btnFecharStyle}
          >
            ×
          </button>
        </div>

        <div
          className="grid gap-3 mb-4"
          style={{ gridTemplateColumns: "170px 1.5fr 1fr" }}
        >
          <Campo label="Data da compra *">
            <input
              type="date"
              value={dataCompra}
              max={hojeLocalISO()}
              onChange={(e) => setDataCompra(e.target.value)}
              required
              style={inputStyle}
              title="Use uma data anterior para lancar compras retroativas"
              aria-label="Data da compra"
            />
          </Campo>
          <Campo label="Fornecedor *">
            <SelectBusca<Fornecedor>
              opcoes={fornecedores}
              value={fornecedorId}
              onChange={setFornecedorId}
              subLabelFn={(f) => f.cnpj}
              placeholder="Buscar fornecedor..."
              required
              style={inputStyle}
            />
          </Campo>
          <Campo label="Observações">
            <input
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              style={inputStyle}
              placeholder="Nota fiscal, referência, etc."
            />
          </Campo>
        </div>

        <div className="mb-2 flex justify-between items-center">
          <div className="text-gp-white font-bold text-sm">Itens da compra</div>
          <button
            type="button"
            onClick={adicionarItem}
            className="text-gp-white border-none rounded-md text-xs font-semibold cursor-pointer"
            style={{ background: C.accent, padding: "6px 14px" }}
          >
            + Adicionar item
          </button>
        </div>

        <div
          className="bg-gp-surface rounded-[10px] overflow-visible"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div
            className="grid bg-gp-bg text-gp-muted text-[11px] font-bold uppercase"
            style={{
              gridTemplateColumns: "2.5fr 80px 130px 130px 40px",
              padding: "8px 12px",
              borderBottom: `1px solid ${C.border}`,
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
            }}
          >
            <div>Produto</div>
            <div className="text-right">Qtd</div>
            <div className="text-right">Preço unit.</div>
            <div className="text-right">Subtotal</div>
            <div></div>
          </div>
          {itens.length === 0 ? (
            <div className="py-5 text-center text-gp-muted text-xs">
              Nenhum item ainda. Clique em "+ Adicionar item".
            </div>
          ) : itens.map((it, idx) => {
            const subtotal = (parseFloat(it.quantidade) || 0) * (parseFloat(it.precoUnitario) || 0);
            return (
              <div
                key={idx}
                className="grid items-center gap-2"
                style={{
                  gridTemplateColumns: "2.5fr 80px 130px 130px 40px",
                  padding: "8px 12px",
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <SelectBusca<Produto>
                  opcoes={produtos}
                  value={it.produtoId}
                  onChange={(v) => atualizarItem(idx, "produtoId", v)}
                  labelFn={(p) => `${p.codigo} — ${p.nome}`}
                  placeholder="Buscar produto..."
                  required
                  autoFocus={focarIdx === idx}
                  style={{ ...inputStyle, padding: "6px 8px" }}
                />
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={it.quantidade}
                  onChange={(e) => atualizarItem(idx, "quantidade", e.target.value)}
                  required
                  aria-label="Quantidade"
                  style={{ ...inputStyle, padding: "6px 8px", textAlign: "right" }}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={it.precoUnitario}
                  onChange={(e) => atualizarItem(idx, "precoUnitario", e.target.value)}
                  onKeyDown={(e) => {
                    // Tab no preco da ULTIMA linha (ja com produto escolhido)
                    // cria a proxima linha e foca o campo de produto dela —
                    // assim da pra lancar varios itens so com o teclado, sem
                    // precisar caçar o botao "+ Adicionar item".
                    if (e.key === "Tab" && !e.shiftKey && idx === itens.length - 1 && it.produtoId) {
                      e.preventDefault();
                      adicionarItem();
                    }
                  }}
                  required
                  aria-label="Preço unitário"
                  style={{ ...inputStyle, padding: "6px 8px", textAlign: "right" }}
                />
                <div className="text-right text-gp-green font-semibold text-[13px]">
                  {fmtBRL(subtotal)}
                </div>
                <button
                  type="button"
                  onClick={() => removerItem(idx)}
                  title="Remover"
                  aria-label="Remover item"
                  className="rounded-md text-sm cursor-pointer"
                  style={{
                    background: C.red + "22",
                    border: `1px solid ${C.red}55`,
                    color: C.red,
                    padding: "4px 8px",
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        <div
          className="mt-3.5 bg-gp-surface"
          style={{
            padding: "12px 16px",
            border: `1px solid ${C.border}`,
            borderRadius: 10,
          }}
        >
          <div className="flex justify-between items-center text-[13px]">
            <div className="text-gp-muted">Subtotal dos itens</div>
            <div className="text-gp-text font-semibold">{fmtBRL(subtotal)}</div>
          </div>
          <div className="flex justify-between items-center mt-2.5 gap-3">
            <label className="text-gp-muted text-[13px] whitespace-nowrap" htmlFor="desconto-ajuste">
              Desconto de ajuste
            </label>
            <div className="flex items-center gap-1.5" style={{ width: 160 }}>
              <span className="text-gp-muted text-[13px]">R$</span>
              <input
                id="desconto-ajuste"
                type="number"
                step="0.01"
                min="0"
                max={subtotal || undefined}
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                placeholder="0,00"
                aria-label="Desconto de ajuste"
                style={{ ...inputStyle, padding: "6px 8px", textAlign: "right" }}
              />
            </div>
          </div>
          <div
            className="flex justify-between items-center mt-3 pt-3"
            style={{ borderTop: `1px solid ${C.border}` }}
          >
            <div className="text-gp-muted text-xs font-semibold">TOTAL DA COMPRA</div>
            <div className="text-gp-green text-[22px] font-extrabold">{fmtBRL(total)}</div>
          </div>
        </div>

        {/* BLOCO FINANCEIRO */}
        <div
          className="mt-3.5 p-4"
          style={{
            background: gerarConta ? C.green + "11" : C.surface,
            border: `1px solid ${gerarConta ? C.green + "55" : C.border}`,
            borderRadius: 10,
          }}
        >
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={gerarConta}
              onChange={(e) => setGerarConta(e.target.checked)}
              style={{ marginTop: 3, transform: "scale(1.2)", accentColor: C.green }}
            />
            <div className="flex-1">
              <div
                className="font-bold text-sm"
                style={{ color: gerarConta ? C.green : C.text }}
              >
                💰 Gerar conta a pagar no Financeiro
              </div>
              <div className="text-gp-muted text-[11px] mt-0.5">
                {gerarConta
                  ? "Será criada uma conta a pagar vinculada a esta compra para cobrança futura."
                  : "Marque para registrar esta compra também como conta a pagar (cobrança a prazo)."}
              </div>
            </div>
          </label>

          {gerarConta && (
            <div className="mt-3.5 grid grid-cols-2 gap-3">
              <Campo label={parcelas > 1 ? "Vencimento da 1ª parcela *" : "Vencimento *"}>
                <input
                  type="date"
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                  required={gerarConta}
                  aria-label="Vencimento"
                  style={inputStyle}
                />
              </Campo>
              <Campo label="Parcelas">
                <select
                  value={parcelas}
                  onChange={(e) => setParcelas(parseInt(e.target.value, 10))}
                  aria-label="Parcelas"
                  style={inputStyle}
                >
                  <option value={1}>1× à vista</option>
                  {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                    <option key={n} value={n}>{n}× ({fmtBRL(total / n)} cada)</option>
                  ))}
                </select>
              </Campo>
              <div
                className="text-gp-muted text-[11px] italic bg-gp-bg rounded-lg"
                style={{
                  gridColumn: "span 2",
                  padding: "8px 12px",
                }}
              >
                ✓ Será criado: <b style={{ color: C.green }}>{parcelas}× {fmtBRL(total / parcelas)}</b>
                {parcelas > 1 && (
                  <> — vencendo no dia {new Date(vencimento + "T12:00:00").getDate()} de cada mês a partir de {new Date(vencimento + "T12:00:00").toLocaleDateString("pt-BR")}</>
                )}
                {parcelas === 1 && vencimento && (
                  <> — vencimento em {new Date(vencimento + "T12:00:00").toLocaleDateString("pt-BR")}</>
                )}
              </div>
            </div>
          )}
        </div>

        {erro && (
          <div
            className="mt-3.5 rounded-lg text-[13px] text-gp-red"
            style={{
              padding: "10px 12px",
              background: C.red + "22",
              border: `1px solid ${C.red}55`,
            }}
          >
            {erro}
          </div>
        )}

        <div className="flex gap-2.5 justify-between items-center mt-5 flex-wrap">
          <button
            type="button"
            onClick={salvarComoRascunho}
            disabled={salvando}
            title="Salva esta compra pela metade neste dispositivo para retomar depois"
            className="rounded-lg font-semibold text-[13px] cursor-pointer"
            style={{
              background: C.accent + "22",
              border: `1px solid ${C.accent}55`,
              color: C.accent,
              padding: "10px 16px",
            }}
          >
            💾 Salvar rascunho
          </button>
          <div className="flex gap-2.5 justify-end">
            <button type="button" onClick={onCancelar} disabled={salvando} style={btnSecundarioStyle}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || itens.length === 0}
              style={{ ...btnPrimarioStyle, opacity: itens.length === 0 ? 0.5 : 1 }}
            >
              {salvando ? "Registrando..." : "Registrar compra"}
            </button>
          </div>
        </div>
        <div className="mt-2.5 text-gp-muted text-[11px] text-right">
          ⚠ Ao confirmar, o estoque dos produtos será incrementado automaticamente.
        </div>
      </form>
    </div>
  );
}

// ============ MODAL DETALHE ============

interface DetalheCompraModalProps {
  compra: Compra;
  podeEstornar: boolean;
  onFechar: () => void;
  onEstornado: (msg: string) => void;
}

function DetalheCompraModal({ compra, podeEstornar, onFechar, onEstornado }: DetalheCompraModalProps) {
  const [estornoAberto, setEstornoAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [estornando, setEstornando] = useState(false);
  const [erroEstorno, setErroEstorno] = useState("");

  const contas = compra.contasPagar || [];
  const contasPagas = contas.filter((c) => c.status === "PAGA").length;
  const podeAcionarEstorno = podeEstornar && !compra.cancelada;

  async function confirmarEstorno() {
    setErroEstorno("");
    const m = motivo.trim();
    if (!m) { setErroEstorno("Informe o motivo do estorno"); return; }
    setEstornando(true);
    try {
      const r = await api.estornarCompra(compra.id, m) as EstornoResultado;
      const itens = r.itensEstornados || 0;
      const ccs = r.contasCanceladas || 0;
      const partes = [`Compra #${r.compra?.numero ?? compra.numero} estornada`];
      if (itens) partes.push(`${itens} item${itens > 1 ? "s" : ""} devolvido${itens > 1 ? "s" : ""} ao estoque`);
      if (ccs) partes.push(`${ccs} conta${ccs > 1 ? "s" : ""} a pagar cancelada${ccs > 1 ? "s" : ""}`);
      onEstornado(partes.join(" · "));
      setEstornoAberto(false);
      setMotivo("");
    } catch (err) {
      setErroEstorno((err as Error).message);
    } finally {
      setEstornando(false);
    }
  }

  return (
    <div onClick={onFechar} style={modalOverlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...modalCardStyle, maxWidth: 720 }}>
        <div style={modalHeaderStyle}>
          <div>
            <div className="flex items-center gap-2.5">
              <div className="text-gp-white font-bold text-lg">
                Compra #{compra.numero}
              </div>
              {compra.cancelada && (
                <span
                  className="text-[11px] font-bold uppercase rounded-full"
                  style={{
                    background: C.red + "22",
                    border: `1px solid ${C.red}55`,
                    color: C.red,
                    padding: "3px 10px",
                    letterSpacing: 0.5,
                  }}
                >
                  Estornada
                </span>
              )}
            </div>
            <div className="text-gp-muted text-xs mt-0.5">
              {fmtData(compra.createdAt)}
            </div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" style={btnFecharStyle}>×</button>
        </div>

        {compra.cancelada && (
          <div
            className="mb-3.5 rounded-[10px] text-xs text-gp-text"
            style={{
              padding: "10px 14px",
              background: C.red + "11",
              border: `1px solid ${C.red}44`,
            }}
          >
            <div className="font-bold mb-1" style={{ color: C.red }}>
              Compra estornada em {fmtData(compra.canceladaEm)}
            </div>
            {compra.motivoCancelamento && (
              <div><span className="text-gp-muted">Motivo: </span>{compra.motivoCancelamento}</div>
            )}
          </div>
        )}

        <div
          className="bg-gp-surface mb-4"
          style={{
            padding: "12px 14px",
            border: `1px solid ${C.border}`,
            borderRadius: 10,
          }}
        >
          <div className="text-gp-muted text-[11px] font-bold mb-1">FORNECEDOR</div>
          <div className="text-gp-white text-sm font-semibold">{compra.fornecedor?.nome}</div>
          {compra.fornecedor?.cnpj && (
            <div className="text-gp-muted text-xs mt-0.5">CNPJ: {compra.fornecedor.cnpj}</div>
          )}
          {compra.observacoes && (
            <div className="text-gp-text text-xs mt-2">
              <span className="text-gp-muted">Obs: </span>{compra.observacoes}
            </div>
          )}
        </div>

        <div
          className="bg-gp-surface rounded-[10px] overflow-hidden"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div
            className="grid bg-gp-bg text-gp-muted text-[11px] font-bold uppercase"
            style={{
              gridTemplateColumns: "2.5fr 80px 130px 130px",
              padding: "10px 14px",
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <div>Produto</div>
            <div className="text-right">Qtd</div>
            <div className="text-right">Preço unit.</div>
            <div className="text-right">Subtotal</div>
          </div>
          {compra.itens?.map((it) => (
            <div
              key={it.id}
              className="grid items-center text-[13px]"
              style={{
                gridTemplateColumns: "2.5fr 80px 130px 130px",
                padding: "10px 14px",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <div>
                <div className="text-gp-white font-semibold">{it.produto?.nome}</div>
                <div className="text-gp-muted font-mono text-[11px]">{it.produto?.codigo}</div>
              </div>
              <div className="text-right text-gp-text">{fmtQtd(it.quantidade)} {it.produto?.unidade || ""}</div>
              <div className="text-right text-gp-text">{fmtBRL(it.precoUnitario)}</div>
              <div className="text-right text-gp-green font-semibold">{fmtBRL(it.subtotal)}</div>
            </div>
          ))}
        </div>

        <div
          className="mt-3.5 bg-gp-surface"
          style={{
            padding: "14px 16px",
            border: `1px solid ${C.border}`,
            borderRadius: 10,
          }}
        >
          {Number(compra.desconto) > 0 && (
            <>
              <div className="flex justify-between items-center text-[13px]">
                <div className="text-gp-muted">Subtotal dos itens</div>
                <div className="text-gp-text">{fmtBRL(Number(compra.total) + Number(compra.desconto))}</div>
              </div>
              <div className="flex justify-between items-center text-[13px] mt-1.5 mb-2.5 pb-2.5" style={{ borderBottom: `1px solid ${C.border}` }}>
                <div className="text-gp-muted">Desconto de ajuste</div>
                <div style={{ color: C.red }}>− {fmtBRL(compra.desconto)}</div>
              </div>
            </>
          )}
          <div className="flex justify-between items-center">
            <div className="text-gp-muted text-xs font-semibold">TOTAL</div>
            <div
              className="text-[22px] font-extrabold"
              style={{
                color: compra.cancelada ? C.muted : C.green,
                textDecoration: compra.cancelada ? "line-through" : "none",
              }}
            >
              {fmtBRL(compra.total)}
            </div>
          </div>
        </div>

        {contas.length > 0 && (
          <div className="mt-3.5">
            <div
              className="text-gp-muted text-[11px] font-bold mb-1.5 uppercase"
              style={{ letterSpacing: 0.5 }}
            >
              Contas a pagar vinculadas
            </div>
            <div
              className="bg-gp-surface rounded-[10px] overflow-hidden"
              style={{ border: `1px solid ${C.border}` }}
            >
              {contas.map((cp) => {
                const cor = cp.status === "PAGA" ? C.green
                  : cp.status === "CANCELADA" ? C.muted
                  : cp.status === "ATRASADA" ? C.red
                  : C.accent;
                return (
                  <div
                    key={cp.id}
                    className="grid items-center text-xs gap-2"
                    style={{
                      gridTemplateColumns: "60px 1fr 110px 100px",
                      padding: "8px 14px",
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    <div className="text-gp-muted font-mono">
                      {cp.parcelaTotal > 1 ? `${cp.parcelaAtual}/${cp.parcelaTotal}` : "—"}
                    </div>
                    <div className="text-gp-text overflow-hidden text-ellipsis whitespace-nowrap">
                      {cp.descricao}
                    </div>
                    <div className="text-right text-gp-text">{fmtBRL(cp.valor)}</div>
                    <div className="text-right">
                      <span
                        className="text-[10px] font-bold rounded-full"
                        style={{
                          background: cor + "22",
                          border: `1px solid ${cor}55`,
                          color: cor,
                          padding: "2px 8px",
                        }}
                      >
                        {cp.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {estornoAberto && (
          <div
            className="mt-4 p-3.5 rounded-[10px]"
            style={{
              background: C.red + "11",
              border: `1px solid ${C.red}55`,
            }}
          >
            <div className="font-bold text-[13px] mb-2" style={{ color: C.red }}>
              Confirmar estorno da compra #{compra.numero}
            </div>
            <div className="text-gp-muted text-xs mb-2.5">
              Esta ação vai criar uma SAÍDA de estoque para cada item (revertendo a entrada original)
              {contas.length > 0 ? ` e cancelar ${contas.length - contasPagas} conta(s) a pagar pendente(s).` : "."}
              {contasPagas > 0 && ` Há ${contasPagas} conta(s) já paga(s) — reabra-as no Financeiro antes de prosseguir.`}
            </div>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={500}
              autoFocus
              placeholder="Motivo do estorno (obrigatório)"
              aria-label="Motivo do estorno"
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
            {erroEstorno && (
              <div
                className="mt-2 rounded-lg text-xs text-gp-red"
                style={{
                  padding: "8px 12px",
                  background: C.red + "22",
                  border: `1px solid ${C.red}55`,
                }}
              >
                {erroEstorno}
              </div>
            )}
            <div className="flex gap-2 justify-end mt-2.5">
              <button
                type="button"
                onClick={() => { setEstornoAberto(false); setErroEstorno(""); setMotivo(""); }}
                disabled={estornando}
                style={btnSecundarioStyle}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarEstorno}
                disabled={estornando}
                className="text-gp-white border-none rounded-lg font-bold text-[13px] cursor-pointer"
                style={{
                  background: C.red,
                  padding: "10px 22px",
                  opacity: estornando ? 0.6 : 1,
                }}
              >
                {estornando ? "Estornando..." : "Confirmar estorno"}
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mt-5">
          <div>
            {podeAcionarEstorno && !estornoAberto && (
              <button
                type="button"
                onClick={() => setEstornoAberto(true)}
                className="rounded-lg font-semibold text-[13px] cursor-pointer"
                style={{
                  background: C.red + "22",
                  border: `1px solid ${C.red}55`,
                  color: C.red,
                  padding: "10px 16px",
                }}
              >
                ↩ Estornar compra
              </button>
            )}
          </div>
          <button type="button" onClick={onFechar} style={btnSecundarioStyle}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ============ HELPERS DE LAYOUT ============

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-gp-muted text-xs mb-1.5 font-semibold">{label}</label>
      {children}
    </div>
  );
}

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
