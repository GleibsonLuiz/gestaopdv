import { useEffect, useState, useCallback, useMemo, type CSSProperties } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";
import SelectBusca from "./components/SelectBusca";
import { NovaCompraModal, type CompraResultado } from "./Compras";
import { novoRascunhoId, salvarRascunho, type CompraRascunho } from "./lib/comprasRascunho";

// ============ TIPOS ============

interface SugestaoItem {
  produtoId: string;
  codigo: string;
  nome: string;
  unidade: string;
  estoque: number;
  estoqueMinimo: number;
  precoCusto: number | null;
  abaixoMinimo: boolean;
  origem: "SISTEMA" | "MANUAL";
  quantidadeSugerida: number;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  observacao: string | null;
  temLinhaSalva: boolean;
}

interface SugestoesResposta {
  geradoEm: string;
  total: number;
  contagem: { abaixoMinimo: number; manual: number; sistema: number };
  itens: SugestaoItem[];
}

interface Fornecedor { id: string; nome: string; cnpj?: string | null; [k: string]: unknown }
interface Produto {
  id: string; codigo: string; nome: string; unidade?: string | null;
  precoCusto?: number | string | null; fornecedorId?: string | null;
  [k: string]: unknown;
}

// ============ HELPERS ============

const fmtBRL = (v: number | string | null | undefined): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtQtd = (v: number | string | null | undefined): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
};

function dataDaqui(diasAFrente: number): string {
  const d = new Date();
  d.setDate(d.getDate() + diasAFrente);
  return d.toISOString().slice(0, 10);
}

function hojeLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ============ COMPONENTE PRINCIPAL ============

interface SugestoesProps { user: SessionUser }

export default function Sugestoes({ user }: SugestoesProps) {
  const [itens, setItens] = useState<SugestaoItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [soAbaixoMinimo, setSoAbaixoMinimo] = useState(false);
  // Quantidades editadas localmente (produtoId -> string), persistidas no blur.
  const [qtdEditada, setQtdEditada] = useState<Record<string, string>>({});

  // Adicao manual
  const [addProdutoId, setAddProdutoId] = useState("");
  const [addQtd, setAddQtd] = useState("");
  const [adicionando, setAdicionando] = useState(false);

  // Geracao de pedido
  const [pedidoAberto, setPedidoAberto] = useState(false);
  const [rascunhoPedido, setRascunhoPedido] = useState<CompraRascunho | null>(null);
  const [idsGerados, setIdsGerados] = useState<string[]>([]);
  const [dialogoLimpar, setDialogoLimpar] = useState<CompraResultado | null>(null);

  const podeEditar = user.role === "ADMIN" || user.role === "GERENTE";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await api.listarSugestoesCompra() as SugestoesResposta;
      setItens(r.itens || []);
      setQtdEditada({});
      // Remove da selecao itens que sairam da lista (ex: estoque reposto).
      setSelecionados((sel) => {
        const ids = new Set((r.itens || []).map((i) => i.produtoId));
        const nova = new Set<string>();
        sel.forEach((id) => { if (ids.has(id)) nova.add(id); });
        return nova;
      });
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    api.listarFornecedores({ ativo: "true" }).then((r) => setFornecedores((r as Fornecedor[]) || [])).catch(() => {});
    api.listarProdutos({ ativo: "true" }).then((r) => setProdutos((r as Produto[]) || [])).catch(() => {});
  }, []);

  function flash(t: string) {
    setMensagem(t);
    setTimeout(() => setMensagem(""), 3500);
  }

  const visiveis = useMemo(
    () => (soAbaixoMinimo ? itens.filter((i) => i.abaixoMinimo) : itens),
    [itens, soAbaixoMinimo],
  );

  // Produtos que ainda nao estao na lista (para a busca de adicao manual).
  const idsNaLista = useMemo(() => new Set(itens.map((i) => i.produtoId)), [itens]);

  const contagem = useMemo(() => ({
    abaixoMinimo: itens.filter((i) => i.abaixoMinimo).length,
    manual: itens.filter((i) => i.origem === "MANUAL").length,
  }), [itens]);

  function qtdDe(i: SugestaoItem): string {
    return qtdEditada[i.produtoId] ?? String(i.quantidadeSugerida);
  }

  function toggleSel(produtoId: string) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(produtoId)) n.delete(produtoId); else n.add(produtoId);
      return n;
    });
  }

  function toggleTodos() {
    setSelecionados((s) => {
      if (s.size >= visiveis.length && visiveis.length > 0) return new Set();
      return new Set(visiveis.map((i) => i.produtoId));
    });
  }

  async function persistirQtd(i: SugestaoItem) {
    const valor = qtdEditada[i.produtoId];
    if (valor === undefined) return;
    const n = parseFloat(valor.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) { flash("Quantidade inválida — mantida a anterior."); return; }
    if (n === i.quantidadeSugerida) return;
    try {
      await api.atualizarSugestaoCompra(i.produtoId, { quantidadeSugerida: n });
      setItens((arr) => arr.map((x) => x.produtoId === i.produtoId
        ? { ...x, quantidadeSugerida: Math.round(n * 1000) / 1000, temLinhaSalva: true }
        : x));
    } catch (err) {
      flash((err as Error).message);
    }
  }

  async function adicionarManual() {
    if (!addProdutoId) return;
    setAdicionando(true);
    setErro("");
    try {
      const body: Record<string, unknown> = { produtoId: addProdutoId };
      const q = parseFloat(addQtd.replace(",", "."));
      if (Number.isFinite(q) && q > 0) body.quantidadeSugerida = q;
      await api.adicionarSugestaoCompra(body);
      setAddProdutoId("");
      setAddQtd("");
      await carregar();
      flash("Produto adicionado à lista de compras.");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setAdicionando(false);
    }
  }

  async function descartar(i: SugestaoItem) {
    try {
      if (i.abaixoMinimo) {
        // Sugestao do sistema: descartar (esconde até repor estoque).
        await api.descartarSugestaoCompra(i.produtoId);
      } else {
        // Item manual acima do mínimo: remover de vez.
        await api.removerSugestaoCompra(i.produtoId);
      }
      setItens((arr) => arr.filter((x) => x.produtoId !== i.produtoId));
      setSelecionados((s) => { const n = new Set(s); n.delete(i.produtoId); return n; });
    } catch (err) {
      flash((err as Error).message);
    }
  }

  // Monta o rascunho de compra a partir dos itens selecionados e abre a modal
  // de Nova Compra (mesmo fluxo testado: estoque + conta a pagar).
  function gerarPedido() {
    const selItens = itens.filter((i) => selecionados.has(i.produtoId));
    if (selItens.length === 0) return;

    // Fornecedor inicial: se todos os itens compartilham um fornecedor
    // preferido, ja vem selecionado. Senão, fica em branco (usuário escolhe).
    const fornIds = new Set(selItens.map((i) => i.fornecedorId).filter(Boolean));
    const fornId = fornIds.size === 1 ? (selItens[0].fornecedorId || "") : "";
    const forn = fornecedores.find((f) => f.id === fornId);

    const rascunho: CompraRascunho = {
      id: novoRascunhoId(),
      ts: Date.now(),
      fornecedorId: fornId,
      fornecedorNome: forn?.nome ?? "",
      observacoes: "Gerado a partir das Sugestões de Compra",
      dataCompra: hojeLocalISO(),
      itens: selItens.map((i) => ({
        produtoId: i.produtoId,
        quantidade: String(parseFloat(qtdDe(i).replace(",", ".")) || i.quantidadeSugerida),
        precoUnitario: i.precoCusto != null ? String(i.precoCusto) : "",
      })),
      desconto: "",
      gerarConta: true,
      vencimento: dataDaqui(30),
      parcelas: 1,
    };
    setIdsGerados(selItens.map((i) => i.produtoId));
    setRascunhoPedido(rascunho);
    setPedidoAberto(true);
  }

  async function aplicarLimpeza(limpar: boolean) {
    const ids = idsGerados;
    setDialogoLimpar(null);
    if (limpar && ids.length > 0) {
      try { await api.limparSugestoesCompra(ids); } catch { /* best-effort */ }
    }
    setSelecionados(new Set());
    setIdsGerados([]);
    await carregar();
  }

  const valorEstimado = useMemo(() => {
    return itens
      .filter((i) => selecionados.has(i.produtoId))
      .reduce((acc, i) => {
        const q = parseFloat(qtdDe(i).replace(",", ".")) || i.quantidadeSugerida;
        return acc + q * (Number(i.precoCusto) || 0);
      }, 0);
  }, [itens, selecionados, qtdEditada]);

  return (
    <div>
      {/* Barra de adicao manual + filtro */}
      <div
        className="mb-4 rounded-xl"
        style={{ border: `1px solid ${C.border}`, background: C.surface, padding: "14px 16px" }}
      >
        <div className="flex gap-2.5 flex-wrap items-end">
          <div style={{ flex: "1 1 320px" }}>
            <label className="block text-gp-muted text-xs mb-1.5 font-semibold">
              Adicionar produto manualmente (antecipar compra)
            </label>
            <SelectBusca<Produto>
              opcoes={produtos}
              value={addProdutoId}
              onChange={setAddProdutoId}
              labelFn={(p) => `${p.codigo} — ${p.nome}`}
              filtroOpcoes={(p) => !idsNaLista.has(p.id)}
              placeholder="Buscar produto por código ou nome..."
              style={inputStyle}
              disabled={!podeEditar}
            />
          </div>
          <div style={{ width: 110 }}>
            <label className="block text-gp-muted text-xs mb-1.5 font-semibold">Qtd</label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={addQtd}
              onChange={(e) => setAddQtd(e.target.value)}
              placeholder="auto"
              aria-label="Quantidade a adicionar"
              style={{ ...inputStyle, textAlign: "right" }}
              disabled={!podeEditar}
            />
          </div>
          <button
            type="button"
            onClick={adicionarManual}
            disabled={!podeEditar || !addProdutoId || adicionando}
            className="text-gp-white border-none rounded-lg text-sm font-bold cursor-pointer"
            style={{
              background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
              padding: "10px 18px",
              opacity: (!podeEditar || !addProdutoId || adicionando) ? 0.5 : 1,
            }}
          >
            {adicionando ? "Adicionando..." : "+ Adicionar"}
          </button>
          <label className="flex items-center gap-2 cursor-pointer text-gp-muted text-[13px] ml-auto select-none">
            <input
              type="checkbox"
              checked={soAbaixoMinimo}
              onChange={(e) => setSoAbaixoMinimo(e.target.checked)}
              style={{ transform: "scale(1.1)", accentColor: C.accent }}
            />
            Só abaixo do mínimo
          </label>
        </div>
      </div>

      {/* Resumo */}
      <div className="flex gap-2.5 mb-4 flex-wrap">
        <Chip cor={C.red} label="Abaixo do mínimo" valor={contagem.abaixoMinimo} />
        <Chip cor={C.purple} label="Adicionados manualmente" valor={contagem.manual} />
        <Chip cor={C.accent} label="Total na lista" valor={itens.length} />
      </div>

      {mensagem && (
        <div className="mb-3 px-[14px] py-[10px] rounded-lg text-[13px] text-gp-green"
          style={{ background: C.green + "22", border: `1px solid ${C.green}55` }}>
          {mensagem}
        </div>
      )}
      {erro && (
        <div className="mb-3 px-[14px] py-[10px] rounded-lg text-[13px] text-gp-red"
          style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}>
          {erro}
        </div>
      )}

      {/* Tabela */}
      <div className="bg-gp-card rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
        <div
          className="grid bg-gp-surface text-gp-muted text-xs font-bold uppercase items-center"
          style={{
            gridTemplateColumns: "38px 2.2fr 130px 120px 1.3fr 90px 70px",
            padding: "12px 16px",
            borderBottom: `1px solid ${C.border}`,
            letterSpacing: 0.5,
          }}
        >
          <div>
            <input
              type="checkbox"
              checked={selecionados.size > 0 && selecionados.size >= visiveis.length}
              onChange={toggleTodos}
              aria-label="Selecionar todos"
              style={{ transform: "scale(1.1)", accentColor: C.accent, cursor: "pointer" }}
              disabled={!podeEditar || visiveis.length === 0}
            />
          </div>
          <div>Produto</div>
          <div className="text-right">Estoque / Mín.</div>
          <div className="text-right">Qtd a comprar</div>
          <div>Fornecedor</div>
          <div className="text-center">Origem</div>
          <div className="text-right">Ações</div>
        </div>

        {carregando ? (
          <div className="py-[34px] text-center text-gp-muted text-[13px]">Carregando...</div>
        ) : visiveis.length === 0 ? (
          <div className="py-[34px] text-center text-gp-muted text-[13px]">
            {itens.length === 0
              ? "Nenhuma sugestão no momento. Produtos abaixo do estoque mínimo aparecem aqui automaticamente — configure o estoque mínimo no cadastro do produto, ou adicione um item manualmente acima."
              : "Nenhum item abaixo do mínimo. Desmarque o filtro para ver os itens manuais."}
          </div>
        ) : visiveis.map((i) => {
          const sel = selecionados.has(i.produtoId);
          const corOrigem = i.origem === "MANUAL" ? C.purple : C.accent;
          return (
            <div
              key={i.produtoId}
              className="grid items-center text-[13px]"
              style={{
                gridTemplateColumns: "38px 2.2fr 130px 120px 1.3fr 90px 70px",
                padding: "10px 16px",
                borderBottom: `1px solid ${C.border}`,
                // Faixa lateral vermelha sinaliza urgência (abaixo do mínimo).
                borderLeft: `3px solid ${i.abaixoMinimo ? C.red : "transparent"}`,
                background: sel ? C.accent + "0d" : "transparent",
              }}
            >
              <div>
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => toggleSel(i.produtoId)}
                  aria-label={`Selecionar ${i.nome}`}
                  style={{ transform: "scale(1.1)", accentColor: C.accent, cursor: "pointer" }}
                  disabled={!podeEditar}
                />
              </div>
              <div>
                <div className="text-gp-white font-semibold">{i.nome}</div>
                <div className="text-gp-muted font-mono text-[11px]">{i.codigo}</div>
              </div>
              <div className="text-right">
                <span style={{ color: i.abaixoMinimo ? C.red : C.text, fontWeight: 700 }}>
                  {fmtQtd(i.estoque)}
                </span>
                <span className="text-gp-muted"> / {fmtQtd(i.estoqueMinimo)} {i.unidade}</span>
              </div>
              <div className="text-right">
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={qtdDe(i)}
                  onChange={(e) => setQtdEditada((m) => ({ ...m, [i.produtoId]: e.target.value }))}
                  onBlur={() => persistirQtd(i)}
                  aria-label={`Quantidade a comprar de ${i.nome}`}
                  disabled={!podeEditar}
                  style={{ ...inputStyle, padding: "6px 8px", textAlign: "right", width: 100 }}
                />
              </div>
              <div className="text-gp-text overflow-hidden text-ellipsis whitespace-nowrap pr-2">
                {i.fornecedorNome || <span className="text-gp-muted">—</span>}
              </div>
              <div className="text-center">
                <span
                  className="text-[10px] font-bold uppercase rounded-full"
                  style={{
                    background: corOrigem + "22",
                    border: `1px solid ${corOrigem}55`,
                    color: corOrigem,
                    padding: "3px 8px",
                    letterSpacing: 0.5,
                  }}
                  title={i.origem === "MANUAL" ? "Adicionado manualmente" : "Sugestão automática do sistema (estoque baixo)"}
                >
                  {i.origem === "MANUAL" ? "Manual" : "Sistema"}
                </span>
              </div>
              <div className="flex justify-end">
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => descartar(i)}
                    title={i.abaixoMinimo ? "Dispensar esta sugestão" : "Remover da lista"}
                    aria-label="Remover item"
                    className="rounded-md text-sm cursor-pointer"
                    style={{ background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, padding: "4px 9px" }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Barra de acao (gerar pedido) */}
      {podeEditar && selecionados.size > 0 && (
        <div
          className="mt-4 rounded-xl flex items-center justify-between gap-3 flex-wrap"
          style={{
            border: `1px solid ${C.accent}55`,
            background: C.accent + "11",
            padding: "12px 16px",
            position: "sticky",
            bottom: 12,
          }}
        >
          <div className="text-[13px] text-gp-text">
            <b className="text-gp-white">{selecionados.size}</b> {selecionados.size === 1 ? "item selecionado" : "itens selecionados"}
            {valorEstimado > 0 && (
              <span className="text-gp-muted"> · estimativa <b style={{ color: C.green }}>{fmtBRL(valorEstimado)}</b></span>
            )}
          </div>
          <button
            type="button"
            onClick={gerarPedido}
            className="text-gp-white border-none rounded-lg text-sm font-bold cursor-pointer"
            style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`, padding: "10px 20px" }}
          >
            🛍️ Gerar Pedido de Compra
          </button>
        </div>
      )}

      <div className="mt-2.5 text-gp-muted text-[11px]">
        ℹ️ Sugestões automáticas aparecem quando <b>estoque ≤ mínimo</b> (configure o mínimo no cadastro do produto).
        Ao gerar o pedido, você poderá manter ou limpar os itens da lista.
      </div>

      {/* Modal Nova Compra (reaproveitada) pré-preenchida */}
      {pedidoAberto && rascunhoPedido && (
        <NovaCompraModal
          fornecedores={fornecedores}
          produtos={produtos}
          rascunhoInicial={rascunhoPedido}
          onCancelar={() => { setPedidoAberto(false); setRascunhoPedido(null); }}
          onSalvarRascunho={(r) => {
            // Salva nos rascunhos de Compras para retomar lá depois.
            salvarRascunho(r);
            setPedidoAberto(false);
            setRascunhoPedido(null);
            flash("Rascunho salvo — retome em Compras → Compras em rascunho.");
          }}
          onSalvar={(c) => {
            setPedidoAberto(false);
            setRascunhoPedido(null);
            setDialogoLimpar(c); // pergunta limpar/manter
          }}
        />
      )}

      {/* Dialogo limpar/manter após gerar o pedido */}
      {dialogoLimpar && (
        <div style={modalOverlayStyle} onClick={() => aplicarLimpeza(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...modalCardStyle, maxWidth: 440 }}>
            <div className="text-gp-white font-bold text-lg mb-1">
              ✓ Compra #{dialogoLimpar.numero} registrada
            </div>
            <div className="text-gp-muted text-[13px] mb-4">
              O estoque dos produtos foi atualizado. O que fazer com os {idsGerados.length} {idsGerados.length === 1 ? "item" : "itens"} na lista de sugestões?
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => aplicarLimpeza(true)}
                className="text-gp-white border-none rounded-lg text-sm font-bold cursor-pointer text-left"
                style={{ background: C.green, padding: "12px 16px" }}
              >
                🧹 Limpar da lista
                <div className="text-[11px] font-normal opacity-90 mt-0.5">
                  Remove os itens manuais; os do sistema somem quando o estoque repõe.
                </div>
              </button>
              <button
                type="button"
                onClick={() => aplicarLimpeza(false)}
                className="rounded-lg text-sm font-bold cursor-pointer text-left text-gp-text"
                style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "12px 16px" }}
              >
                📌 Manter na lista
                <div className="text-[11px] font-normal text-gp-muted mt-0.5">
                  Útil se você vai comprar de mais de um fornecedor.
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ SUBCOMPONENTES ============

function Chip({ cor, label, valor }: { cor: string; label: string; valor: number }) {
  return (
    <div
      className="rounded-lg flex items-center gap-2"
      style={{ background: cor + "14", border: `1px solid ${cor}44`, padding: "8px 14px" }}
    >
      <span className="font-extrabold text-lg" style={{ color: cor }}>{valor}</span>
      <span className="text-gp-muted text-xs font-semibold">{label}</span>
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

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 110,
};

const modalCardStyle: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  width: "100%",
  padding: 24,
};
