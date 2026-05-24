import { useEffect, useState, useCallback, useMemo, memo } from "react";
import { List as VirtualList, type RowComponentProps } from "react-window";
import { Html5Qrcode } from "html5-qrcode";
import { api, getEmpresa, type SegmentoEmpresa } from "./lib/api";
import {
  lerCarrinho, salvarCarrinho, limparCarrinho,
  lerCacheProdutos, salvarCacheProdutos,
  lerFila, enfileirarVenda, removerDaFila, marcarFalha, totalPendentesFila,
  type ItemCarrinhoVol,
} from "./lib/pdvVolanteOffline";

// =====================================================================
// ETAPA#7 — PDV Volante Mobile (PWA)
//
// Rota: ?mobile=pdv-volante
//
// Fluxo:
//   1. Vendedor abre no celular; PWA cacheia tudo + lista de produtos.
//   2. Busca/scan -> adiciona ao carrinho (estado local em localStorage).
//   3. Envia pedido: tenta POST /vendas com 1 retry; falhou -> entra na
//      fila offline e dispara no proximo evento "online".
//   4. Reutiliza o segmento da empresa (ETAPA#6) para mostrar campos
//      extras (OEM/Lote) ao expandir item.
//
// Performance:
//   - react-window virtualiza a lista (suporta 5000+ itens sem lag).
//   - Busca com debounce de 200ms.
//   - React.memo nos cards.
// =====================================================================

interface ProdutoMin {
  id: string;
  codigo: string;
  codigoBarras?: string | null;
  nome: string;
  unidade?: string | null;
  precoVenda: number | string;
  estoque?: number | string;
  tipoItem?: string;
  ativo?: boolean;
  camposSegmento?: {
    codigoOEM?: string;
    marcaPeca?: string;
    lote?: string;
    validade?: string;
  } | null;
}

type Tela = "produtos" | "scanner" | "carrinho" | "envio";

function fmtBRL(n: number | string): string {
  const v = Number(n) || 0;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PdvVolante() {
  const [produtos, setProdutos] = useState<ProdutoMin[]>(() => {
    const c = lerCacheProdutos<ProdutoMin>();
    return c?.produtos || [];
  });
  const [carrinho, setCarrinho] = useState<ItemCarrinhoVol[]>(() => lerCarrinho());
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState(""); // debounced
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [tela, setTela] = useState<Tela>("produtos");
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendentes, setPendentes] = useState(() => totalPendentesFila());
  const [flash, setFlash] = useState<{ msg: string; tipo: "ok" | "erro" } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const segmento: SegmentoEmpresa = (getEmpresa()?.segmento as SegmentoEmpresa) || "GERAL";

  // ====== monitorar rede ======
  useEffect(() => {
    const on = () => { setOnline(true); tentarSyncFila(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== carregar produtos do servidor (ativos) ======
  const carregarProdutos = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const resp: any = await api.listarProdutos({ ativo: "true" });
      const lista: ProdutoMin[] = Array.isArray(resp) ? resp : (resp?.produtos || []);
      setProdutos(lista);
      salvarCacheProdutos(lista);
    } catch (err) {
      setErro("Sem rede — usando cache local. " + (err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregarProdutos(); }, [carregarProdutos]);

  // ====== debounce de busca (200ms) ======
  useEffect(() => {
    const t = setTimeout(() => setBuscaAtiva(busca), 200);
    return () => clearTimeout(t);
  }, [busca]);

  // ====== persistir carrinho a cada mudanca ======
  useEffect(() => { salvarCarrinho(carrinho); }, [carrinho]);

  // ====== flash visual ======
  const flashOk = useCallback((msg: string) => {
    setFlash({ msg, tipo: "ok" });
    setTimeout(() => setFlash(null), 1500);
  }, []);
  const flashErro = useCallback((msg: string) => {
    setFlash({ msg, tipo: "erro" });
    setTimeout(() => setFlash(null), 2400);
  }, []);

  // ====== adicionar/remover do carrinho ======
  const adicionar = useCallback((p: ProdutoMin) => {
    const preco = Number(p.precoVenda) || 0;
    const estoque = Number(p.estoque) || 0;
    setCarrinho(prev => {
      const idx = prev.findIndex(i => i.produtoId === p.id);
      if (idx >= 0) {
        const novo = prev.slice();
        novo[idx] = { ...novo[idx], quantidade: novo[idx].quantidade + 1 };
        return novo;
      }
      return [...prev, {
        produtoId: p.id,
        codigo: p.codigo,
        nome: p.nome,
        unidade: p.unidade,
        precoUnitario: preco,
        quantidade: 1,
        estoque,
      }];
    });
    flashOk(`+ ${p.nome}`);
  }, [flashOk]);

  const ajustarQtd = useCallback((produtoId: string, delta: number) => {
    setCarrinho(prev => {
      const idx = prev.findIndex(i => i.produtoId === produtoId);
      if (idx < 0) return prev;
      const nova = Math.max(0, prev[idx].quantidade + delta);
      if (nova === 0) return prev.filter((_, i) => i !== idx);
      const novo = prev.slice();
      novo[idx] = { ...novo[idx], quantidade: nova };
      return novo;
    });
  }, []);

  const removerDoCarrinho = useCallback((produtoId: string) => {
    setCarrinho(prev => prev.filter(i => i.produtoId !== produtoId));
  }, []);

  // ====== filtro de busca (memoized) ======
  const produtosFiltrados = useMemo(() => {
    const q = buscaAtiva.trim().toLowerCase();
    if (!q) return produtos;
    return produtos.filter(p =>
      p.nome.toLowerCase().includes(q)
      || p.codigo.toLowerCase().includes(q)
      || (p.codigoBarras || "").toLowerCase().includes(q)
    );
  }, [produtos, buscaAtiva]);

  // ====== total do carrinho ======
  const total = useMemo(
    () => carrinho.reduce((a, i) => a + i.precoUnitario * i.quantidade, 0),
    [carrinho]
  );
  const totalItens = useMemo(
    () => carrinho.reduce((a, i) => a + i.quantidade, 0),
    [carrinho]
  );

  // ====== envio do pedido ======
  async function tentarSyncFila() {
    const fila = lerFila();
    if (fila.length === 0) return;
    for (const v of fila) {
      try {
        await api.criarVenda(v.payload);
        removerDaFila(v.idLocal);
      } catch (err) {
        marcarFalha(v.idLocal, (err as Error).message);
        break; // se 1 falhou, pula os proximos para nao queimar todos
      }
    }
    setPendentes(totalPendentesFila());
  }

  async function enviarPedido() {
    if (carrinho.length === 0) {
      flashErro("Carrinho vazio");
      return;
    }
    setEnviando(true);
    try {
      const payload = {
        formaPagamento: "DINHEIRO", // PDV volante simplificado: vendedor confirma no balcao
        pagamentos: [{ forma: "DINHEIRO", valor: total }],
        observacoes: null,
        itens: carrinho.map(i => ({
          produtoId: i.produtoId,
          quantidade: i.quantidade,
          precoUnitario: i.precoUnitario,
        })),
      };
      if (online) {
        try {
          await api.criarVenda(payload);
          setCarrinho([]);
          limparCarrinho();
          flashOk(`✓ Pedido enviado — ${fmtBRL(total)}`);
          setTela("produtos");
          return;
        } catch (err) {
          // falhou online — cai pra fila
          enfileirarVenda(payload);
          setPendentes(totalPendentesFila());
          setCarrinho([]);
          limparCarrinho();
          flashErro("Servidor offline — pedido salvo na fila");
          setTela("produtos");
          return;
        }
      }
      // offline
      enfileirarVenda(payload);
      setPendentes(totalPendentesFila());
      setCarrinho([]);
      limparCarrinho();
      flashOk("Pedido enfileirado — envia quando voltar a rede");
      setTela("produtos");
    } finally {
      setEnviando(false);
    }
  }

  // ====== tela: scanner ======
  if (tela === "scanner") {
    return <ScannerView
      onCancelar={() => setTela("produtos")}
      onLer={(codigo) => {
        setTela("produtos");
        const p = produtos.find(x => x.codigoBarras === codigo || x.codigo === codigo);
        if (p) adicionar(p);
        else flashErro("Código não encontrado: " + codigo);
      }}
    />;
  }

  // ====== tela: carrinho ======
  if (tela === "carrinho") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <header className="sticky top-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-2">
          <button onClick={() => setTela("produtos")} className="text-slate-400 text-2xl px-2">←</button>
          <div className="flex-1 font-bold">Carrinho · {totalItens} {totalItens === 1 ? "item" : "itens"}</div>
        </header>
        <div className="flex-1 overflow-y-auto">
          {carrinho.length === 0 ? (
            <div className="text-center text-slate-500 p-12">Carrinho vazio.</div>
          ) : carrinho.map(it => (
            <div key={it.produtoId} className="px-4 py-3 border-b border-slate-800 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{it.nome}</div>
                <div className="text-xs text-slate-500 mt-1">{fmtBRL(it.precoUnitario)} cada</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => ajustarQtd(it.produtoId, -1)}
                  className="w-10 h-10 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg text-lg font-bold">−</button>
                <div className="min-w-[40px] text-center font-bold">{it.quantidade}</div>
                <button onClick={() => ajustarQtd(it.produtoId, 1)}
                  className="w-10 h-10 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-lg text-lg font-bold">+</button>
                <button onClick={() => removerDoCarrinho(it.produtoId)}
                  className="w-10 h-10 bg-red-700/40 text-red-300 hover:bg-red-700/60 rounded-lg text-lg">×</button>
              </div>
            </div>
          ))}
        </div>
        <footer className="sticky bottom-0 bg-slate-900 border-t border-slate-800 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-slate-400 text-sm">Total</span>
            <span className="text-3xl font-bold text-emerald-400">{fmtBRL(total)}</span>
          </div>
          <button
            onClick={enviarPedido}
            disabled={enviando || carrinho.length === 0}
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 text-white font-bold text-lg rounded-xl">
            {enviando ? "Enviando..." : online ? "✓ Enviar Pedido" : "📥 Enfileirar (offline)"}
          </button>
        </footer>
        {flash && <FlashView {...flash} />}
      </div>
    );
  }

  // ====== tela principal: lista de produtos ======
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 px-3 py-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-2xl">🛍️</div>
          <div className="flex-1">
            <div className="text-xs text-slate-400">PDV Volante</div>
            <div className="font-bold text-sm">{getEmpresa()?.nome || "Estabelecimento"}</div>
          </div>
          <div className={`text-[10px] font-bold px-2 py-1 rounded ${online ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
            {online ? "ONLINE" : "OFFLINE"}
          </div>
          {pendentes > 0 && (
            <div className="text-[10px] font-bold px-2 py-1 rounded bg-amber-500/20 text-amber-300">
              FILA: {pendentes}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome / código / barras…"
            inputMode="search"
            className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:border-emerald-500 focus:outline-none"
          />
          <button onClick={() => setTela("scanner")}
            className="px-3 py-2 bg-emerald-500 text-white font-bold rounded-lg text-lg"
            title="Escanear">
            📷
          </button>
        </div>
      </header>

      {carregando && produtos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Carregando produtos…</div>
      ) : erro && produtos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6 text-red-300 text-sm text-center">{erro}</div>
      ) : produtosFiltrados.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Nenhum produto encontrado.</div>
      ) : (
        // react-window v2 virtualiza — 5000 itens sem lag perceptivel.
        // API nova: rowComponent + rowProps em vez de itemData/itemSize.
        <div style={{ flex: 1, minHeight: 0 }}>
          <VirtualList
            rowCount={produtosFiltrados.length}
            rowHeight={84}
            // Cast: o slot da v2 espera funcao concreta com ReactElement|null;
            // como nosso component sempre retorna JSX, e seguro forcar o tipo.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rowComponent={LinhaProduto as any}
            rowProps={{ lista: produtosFiltrados, onAdd: adicionar, segmento }}
          />
        </div>
      )}

      {/* Footer fixo com total e botao Enviar Pedido */}
      <footer className="sticky bottom-0 bg-slate-900 border-t border-slate-800 px-3 py-3 pb-[max(12px,env(safe-area-inset-bottom))] flex items-center gap-3">
        <button onClick={() => setTela("carrinho")} disabled={carrinho.length === 0}
          className="flex-1 flex items-center justify-between gap-2 py-3 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl">
          <span className="text-lg">🛒 {totalItens}</span>
          <span className="font-bold text-emerald-400">{fmtBRL(total)}</span>
        </button>
        <button onClick={enviarPedido} disabled={enviando || carrinho.length === 0}
          className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold rounded-xl">
          {enviando ? "..." : "Enviar"}
        </button>
      </footer>

      {flash && <FlashView {...flash} />}
    </div>
  );
}

// =====================================================================
// LinhaProduto — memo'd, usado pelo react-window v2.
// API nova: o componente recebe { index, style, ...rowProps } via
// RowComponentProps<T> onde T = formato dos rowProps.
// =====================================================================
interface LinhaRowProps {
  lista: ProdutoMin[];
  onAdd: (p: ProdutoMin) => void;
  segmento: SegmentoEmpresa;
}
const LinhaProduto = memo(function LinhaProduto({
  index, style, lista, onAdd, segmento: seg,
}: RowComponentProps<LinhaRowProps>) {
  const p = lista[index];
  const camposSeg = p.camposSegmento;
  const semEstoque = p.tipoItem !== "SERVICO" && Number(p.estoque) <= 0;
  return (
    <div style={style} className="px-3">
      <button
        type="button"
        onClick={() => onAdd(p)}
        disabled={semEstoque}
        className={`w-full h-[78px] flex items-center gap-3 px-3 rounded-xl border ${
          semEstoque
            ? "border-slate-800 bg-slate-900/50 opacity-50"
            : "border-slate-800 bg-slate-900 active:bg-slate-800 hover:border-emerald-500/50"
        }`}
      >
        <div className="flex-1 min-w-0 text-left">
          <div className="font-semibold text-sm truncate">{p.nome}</div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">
            {p.codigo}{p.codigoBarras ? ` · ${p.codigoBarras}` : ""}
            {seg === "AUTO_PECAS" && camposSeg?.codigoOEM ? ` · OEM ${camposSeg.codigoOEM}` : ""}
            {seg === "FARMACIA" && camposSeg?.lote ? ` · Lote ${camposSeg.lote}` : ""}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-emerald-400 font-bold text-lg">{fmtBRL(p.precoVenda)}</div>
          {semEstoque ? (
            <div className="text-[10px] text-red-400 font-bold">SEM ESTOQUE</div>
          ) : (
            <div className="text-[10px] text-slate-500">Est. {Number(p.estoque) || 0} {p.unidade || ""}</div>
          )}
        </div>
      </button>
    </div>
  );
});

// =====================================================================
// FlashView — toast inferior compartilhado
// =====================================================================
function FlashView({ msg, tipo }: { msg: string; tipo: "ok" | "erro" }) {
  return (
    <div className={`fixed bottom-24 left-3 right-3 z-30 px-4 py-3 rounded-xl text-sm font-medium text-center shadow-lg ${
      tipo === "ok" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
    }`}>
      {msg}
    </div>
  );
}

// =====================================================================
// Scanner — copia simplificada do usado em InventarioMobile
// =====================================================================
function ScannerView({ onLer, onCancelar }: { onLer: (codigo: string) => void; onCancelar: () => void }) {
  const containerId = "html5-qrcode-pdvvol";
  const [erro, setErro] = useState("");
  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    let ativo = true;
    (async () => {
      try {
        scanner = new Html5Qrcode(containerId, { verbose: false });
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 180 } },
          (decoded) => {
            if (!ativo) return;
            ativo = false;
            scanner?.stop().catch(() => {});
            onLer(decoded);
          },
          () => {},
        );
      } catch (err) {
        setErro((err as Error).message || "Não foi possível acessar a câmera");
      }
    })();
    return () => {
      ativo = false;
      try { scanner?.stop().catch(() => {}); } catch {}
      try { scanner?.clear(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="px-4 py-3 flex items-center gap-2 bg-slate-900/80">
        <button onClick={onCancelar} className="text-slate-300 text-2xl px-2">←</button>
        <div className="flex-1 font-semibold">Escanear</div>
      </header>
      <div id={containerId} className="flex-1 w-full" />
      {erro && <div className="px-4 py-4 bg-red-500/20 text-red-200 text-sm text-center">{erro}</div>}
    </div>
  );
}
