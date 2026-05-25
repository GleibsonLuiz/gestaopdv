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
  const [observacoes, setObservacoes] = useState("");
  const [mesa, setMesa] = useState<string>(() => {
    try { return localStorage.getItem("gestaopro_pdvvol_mesa") || ""; } catch { return ""; }
  });
  const [editandoMesa, setEditandoMesa] = useState(false);
  const [mesaRascunho, setMesaRascunho] = useState("");

  useEffect(() => {
    try {
      if (mesa) localStorage.setItem("gestaopro_pdvvol_mesa", mesa);
      else localStorage.removeItem("gestaopro_pdvvol_mesa");
    } catch {}
  }, [mesa]);

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
        // Fila guarda payloads de COMANDA — sync usa o mesmo endpoint.
        await api.criarComanda(v.payload);
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
      // ETAPA#8b: PDV Volante envia COMANDA (nao venda direto) — o pedido
      // entra no Kanban da Central, onde o vendedor aceita, prepara e
      // fecha (gera Venda real com baixa de estoque no checkout).
      const payload = {
        mesa: mesa.trim() || null,
        observacoes: observacoes.trim() || null,
        itens: carrinho.map(i => ({
          produtoId: i.produtoId,
          quantidade: i.quantidade,
          precoUnitario: i.precoUnitario,
        })),
      };
      const finalizar = (msg: string, ok: boolean) => {
        setCarrinho([]);
        limparCarrinho();
        setObservacoes("");
        // mesa NAO e' limpa de proposito: vendedor de balcao costuma
        // repetir varias comandas no mesmo local.
        if (ok) flashOk(msg); else flashErro(msg);
        setTela("produtos");
      };
      if (online) {
        try {
          await api.criarComanda(payload);
          finalizar(`✓ Comanda enviada — ${fmtBRL(total)}`, true);
          return;
        } catch {
          enfileirarVenda(payload);
          setPendentes(totalPendentesFila());
          finalizar("Servidor offline — comanda salva na fila", false);
          return;
        }
      }
      enfileirarVenda(payload);
      setPendentes(totalPendentesFila());
      finalizar("Comanda enfileirada — envia quando voltar a rede", true);
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
          <button type="button" onClick={() => setTela("produtos")} className="text-slate-400 text-2xl px-2">←</button>
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">Carrinho · {totalItens} {totalItens === 1 ? "item" : "itens"}</div>
            {mesa && <div className="text-[11px] text-emerald-300 truncate">📍 {mesa}</div>}
          </div>
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
          <div className="mb-3">
            <label htmlFor="pdvvol-obs" className="block text-[11px] uppercase tracking-wide text-slate-400 mb-1">
              Observação do pedido <span className="normal-case text-slate-500">({observacoes.length}/500)</span>
            </label>
            <textarea
              id="pdvvol-obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value.slice(0, 500))}
              rows={2}
              placeholder="Ex.: sem cebola · embrulhar pra presente · entregar 14h · fiado pro João"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:border-emerald-500 focus:outline-none resize-none placeholder:text-slate-600"
            />
          </div>
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-slate-400 text-sm">Total</span>
            <span className="text-3xl font-bold text-emerald-400">{fmtBRL(total)}</span>
          </div>
          <button
            type="button"
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
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-400">PDV Volante</div>
            <div className="font-bold text-sm truncate">{getEmpresa()?.nome || "Estabelecimento"}</div>
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
        <div className="mb-2">
          <button
            type="button"
            onClick={() => { setMesaRascunho(mesa); setEditandoMesa(true); }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              mesa
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
            title="Identificar mesa, balcão ou comanda"
          >
            <span className="text-sm leading-none">📍</span>
            {mesa ? <span className="truncate max-w-[180px]">{mesa}</span> : <span>Adicionar mesa / balcão</span>}
            {mesa && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setMesa(""); }}
                className="ml-1 px-1 text-emerald-300/70 hover:text-white"
                aria-label="Remover mesa"
              >×</span>
            )}
          </button>
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
      {editandoMesa && (
        <MesaModal
          valor={mesaRascunho}
          onChange={setMesaRascunho}
          onCancelar={() => setEditandoMesa(false)}
          onSalvar={() => {
            setMesa(mesaRascunho.trim().slice(0, 80));
            setEditandoMesa(false);
          }}
          onLimpar={() => { setMesa(""); setEditandoMesa(false); }}
        />
      )}
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
// MesaModal — identifica mesa/balcao/comanda fisica do pedido.
// Persistido em localStorage para sobreviver entre comandas (vendedor
// de balcao costuma repetir o mesmo "Balcao 3" varias rodadas).
// =====================================================================
function MesaModal({ valor, onChange, onCancelar, onSalvar, onLimpar }: {
  valor: string;
  onChange: (v: string) => void;
  onCancelar: () => void;
  onSalvar: () => void;
  onLimpar: () => void;
}) {
  const sugestoes = ["Balcão", "Mesa 1", "Mesa 2", "Delivery", "Retirada"];
  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
      onClick={onCancelar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl pb-[max(16px,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">📍</span>
          <h2 className="font-bold flex-1">Identificar mesa / balcão</h2>
          <button type="button" onClick={onCancelar} className="text-slate-400 text-2xl px-2" aria-label="Fechar">×</button>
        </div>
        <input
          autoFocus
          value={valor}
          onChange={(e) => onChange(e.target.value.slice(0, 80))}
          onKeyDown={(e) => { if (e.key === "Enter") onSalvar(); }}
          placeholder="Ex.: Mesa 5, Balcão Azul, Comanda 12…"
          className="w-full px-3 py-3 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:border-emerald-500 focus:outline-none mb-3"
        />
        <div className="flex flex-wrap gap-2 mb-4">
          {sugestoes.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className="text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:border-emerald-500/50"
            >{s}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onLimpar}
            className="px-4 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-medium border border-slate-700"
          >Limpar</button>
          <button
            type="button"
            onClick={onSalvar}
            className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm"
          >Salvar</button>
        </div>
      </div>
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
