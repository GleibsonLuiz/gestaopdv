import { useEffect, useState, useCallback, useMemo, memo } from "react";
import { List as VirtualList, type RowComponentProps } from "react-window";
import { Html5Qrcode } from "html5-qrcode";
import { api, getEmpresa, type SegmentoEmpresa } from "./lib/api";
import {
  lerCarrinho, salvarCarrinho, limparCarrinho,
  lerCacheProdutos, salvarCacheProdutos,
  lerFila, enfileirarVenda, removerDaFila, marcarFalha, totalPendentesFila,
  lerHistorico, registrarHistorico, limparHistorico,
  type ItemCarrinhoVol, type ComandaHistorico,
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

  const [filtroTipo, setFiltroTipo] = useState<"TODOS" | "PRODUTOS" | "SERVICOS">("TODOS");

  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(() => {
    try {
      const raw = localStorage.getItem("gestaopro_pdvvol_cliente");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [buscandoCliente, setBuscandoCliente] = useState(false);

  // Observacao por item: id do produto sendo editado + texto temporario
  const [obsItemAlvo, setObsItemAlvo] = useState<string | null>(null);
  const [obsItemRascunho, setObsItemRascunho] = useState("");

  // Edicao direta de quantidade (teclado numerico).
  const [qtdAlvo, setQtdAlvo] = useState<string | null>(null);
  const [qtdRascunho, setQtdRascunho] = useState("");

  // Desconto geral em R$ (string pra suportar virgula no input). 0 ou vazio = sem desconto.
  const [descontoStr, setDescontoStr] = useState("");

  // Confirmacao pra esvaziar o carrinho.
  const [confirmandoLimpar, setConfirmandoLimpar] = useState(false);

  // Historico das ultimas comandas deste dispositivo.
  const [mostrandoHistorico, setMostrandoHistorico] = useState(false);
  const [historico, setHistorico] = useState<ComandaHistorico[]>(() => lerHistorico());

  useEffect(() => {
    try {
      if (mesa) localStorage.setItem("gestaopro_pdvvol_mesa", mesa);
      else localStorage.removeItem("gestaopro_pdvvol_mesa");
    } catch {}
  }, [mesa]);

  useEffect(() => {
    try {
      if (cliente) localStorage.setItem("gestaopro_pdvvol_cliente", JSON.stringify(cliente));
      else localStorage.removeItem("gestaopro_pdvvol_cliente");
    } catch {}
  }, [cliente]);

  // Feedback tatil curto — silenciosamente ignorado em navegadores sem suporte (iOS Safari).
  const vibrar = useCallback((ms: number) => {
    try { if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms); } catch {}
  }, []);

  // Beep curto via Web Audio. Frequencia em Hz, duracao em ms.
  // AudioContext fica em ref pra reusar entre toques (criar 1 por toque
  // estoura em iOS depois de algumas dezenas de scans).
  const beep = useCallback((freq: number, dur: number) => {
    try {
      const w = window as unknown as {
        __pdvvolAC?: AudioContext;
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctor = w.AudioContext || w.webkitAudioContext;
      if (!Ctor) return;
      const ctx = w.__pdvvolAC || (w.__pdvvolAC = new Ctor());
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      const t = ctx.currentTime;
      osc.start(t);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur / 1000);
      osc.stop(t + dur / 1000);
    } catch {}
  }, []);

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
    vibrar(30);
    beep(880, 60);
  }, [flashOk, vibrar, beep]);

  // Edita observacao de um item ja no carrinho.
  const definirObsItem = useCallback((produtoId: string, texto: string) => {
    setCarrinho(prev => prev.map(i =>
      i.produtoId === produtoId ? { ...i, observacoes: texto.trim() || undefined } : i
    ));
  }, []);

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

  const definirQtd = useCallback((produtoId: string, nova: number) => {
    setCarrinho(prev => {
      const idx = prev.findIndex(i => i.produtoId === produtoId);
      if (idx < 0) return prev;
      const segura = Math.max(0, Math.min(99999, Number(nova) || 0));
      if (segura === 0) return prev.filter((_, i) => i !== idx);
      const novo = prev.slice();
      novo[idx] = { ...novo[idx], quantidade: segura };
      return novo;
    });
  }, []);

  const removerDoCarrinho = useCallback((produtoId: string) => {
    setCarrinho(prev => prev.filter(i => i.produtoId !== produtoId));
  }, []);

  // ====== filtro de busca + tipo (memoized) ======
  const produtosFiltrados = useMemo(() => {
    const q = buscaAtiva.trim().toLowerCase();
    let base = produtos;
    if (filtroTipo === "PRODUTOS") base = base.filter(p => p.tipoItem !== "SERVICO");
    else if (filtroTipo === "SERVICOS") base = base.filter(p => p.tipoItem === "SERVICO");
    if (!q) return base;
    return base.filter(p =>
      p.nome.toLowerCase().includes(q)
      || p.codigo.toLowerCase().includes(q)
      || (p.codigoBarras || "").toLowerCase().includes(q)
    );
  }, [produtos, buscaAtiva, filtroTipo]);

  // Contagem por tipo (pra mostrar nos chips de filtro).
  const contagemTipos = useMemo(() => {
    let prod = 0, serv = 0;
    for (const p of produtos) {
      if (p.tipoItem === "SERVICO") serv++; else prod++;
    }
    return { todos: produtos.length, produtos: prod, servicos: serv };
  }, [produtos]);

  // ====== total do carrinho ======
  const subtotal = useMemo(
    () => carrinho.reduce((a, i) => a + i.precoUnitario * i.quantidade, 0),
    [carrinho]
  );
  const desconto = useMemo(() => {
    const n = Number((descontoStr || "0").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, subtotal); // nunca desconta mais que o proprio total
  }, [descontoStr, subtotal]);
  const total = useMemo(() => Math.max(0, subtotal - desconto), [subtotal, desconto]);
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
        clienteId: cliente?.id || null,
        desconto: desconto > 0 ? Number(desconto.toFixed(2)) : null,
        itens: carrinho.map(i => ({
          produtoId: i.produtoId,
          quantidade: i.quantidade,
          precoUnitario: i.precoUnitario,
          observacoes: i.observacoes || null,
        })),
      };
      const totalSnapshot = total;
      const qtdSnapshot = carrinho.length;
      const mesaSnapshot = mesa.trim();
      const clienteSnapshot = cliente?.nome || null;
      const finalizar = (msg: string, ok: boolean, numero: number | null, origem: "enviada" | "fila") => {
        setCarrinho([]);
        limparCarrinho();
        setObservacoes("");
        setDescontoStr("");
        // mesa NAO e' limpa de proposito: vendedor de balcao costuma
        // repetir varias comandas no mesmo local.
        registrarHistorico({
          numero,
          total: totalSnapshot,
          qtdItens: qtdSnapshot,
          mesa: mesaSnapshot || null,
          cliente: clienteSnapshot,
          ts: Date.now(),
          origem,
        });
        setHistorico(lerHistorico());
        if (ok) flashOk(msg); else flashErro(msg);
        setTela("produtos");
      };
      if (online) {
        try {
          const resp: any = await api.criarComanda(payload);
          finalizar(`✓ Comanda #${resp?.numero ?? ""} enviada — ${fmtBRL(totalSnapshot)}`, true, resp?.numero ?? null, "enviada");
          return;
        } catch {
          enfileirarVenda(payload);
          setPendentes(totalPendentesFila());
          finalizar("Servidor offline — comanda salva na fila", false, null, "fila");
          return;
        }
      }
      enfileirarVenda(payload);
      setPendentes(totalPendentesFila());
      finalizar("Comanda enfileirada — envia quando voltar a rede", true, null, "fila");
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
        vibrar(50);
        const p = produtos.find(x => x.codigoBarras === codigo || x.codigo === codigo);
        if (p) {
          adicionar(p); // beep ok ja vem do adicionar
        } else {
          beep(220, 180); // erro: tom grave e mais longo
          flashErro("Código não encontrado: " + codigo);
        }
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
          {carrinho.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmandoLimpar(true)}
              className="px-2 py-1 text-red-300 hover:bg-red-500/10 rounded-lg text-xl"
              title="Limpar carrinho"
              aria-label="Limpar carrinho"
            >🗑️</button>
          )}
        </header>
        <div className="flex-1 overflow-y-auto">
          {carrinho.length === 0 ? (
            <div className="text-center text-slate-500 p-12">Carrinho vazio.</div>
          ) : carrinho.map(it => (
            <div key={it.produtoId} className="px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{it.nome}</div>
                  <div className="text-xs text-slate-500 mt-1">{fmtBRL(it.precoUnitario)} cada · subtotal {fmtBRL(it.precoUnitario * it.quantidade)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => ajustarQtd(it.produtoId, -1)}
                    className="w-10 h-10 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg text-lg font-bold">−</button>
                  <button
                    type="button"
                    onClick={() => {
                      setQtdRascunho(String(it.quantidade).replace(".", ","));
                      setQtdAlvo(it.produtoId);
                    }}
                    className="min-w-[44px] h-10 px-2 text-center font-bold rounded-lg bg-slate-800/60 hover:bg-slate-700 active:bg-slate-600 border border-slate-700"
                    title="Editar quantidade"
                  >{it.quantidade}</button>
                  <button type="button" onClick={() => ajustarQtd(it.produtoId, 1)}
                    className="w-10 h-10 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-lg text-lg font-bold">+</button>
                  <button type="button" onClick={() => removerDoCarrinho(it.produtoId)}
                    className="w-10 h-10 bg-red-700/40 text-red-300 hover:bg-red-700/60 rounded-lg text-lg">×</button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setObsItemRascunho(it.observacoes || ""); setObsItemAlvo(it.produtoId); }}
                className={`mt-2 w-full text-left text-xs px-2.5 py-1.5 rounded-lg border ${
                  it.observacoes
                    ? "bg-amber-500/10 border-amber-500/40 text-amber-200"
                    : "bg-slate-800/50 border-slate-700 text-slate-500 hover:text-slate-300"
                }`}
              >
                💬 {it.observacoes ? it.observacoes : "Adicionar observação no item (sem cebola, mal-passado, etc.)"}
              </button>
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
          <div className="mb-3 flex items-center gap-3">
            <label htmlFor="pdvvol-desc" className="text-[11px] uppercase tracking-wide text-slate-400 shrink-0">
              Desconto (R$)
            </label>
            <input
              id="pdvvol-desc"
              value={descontoStr}
              onChange={(e) => setDescontoStr(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 8))}
              inputMode="decimal"
              placeholder="0,00"
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-right font-mono focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="mb-3 space-y-1">
            {desconto > 0 && (
              <>
                <div className="flex items-baseline justify-between text-xs text-slate-500">
                  <span>Subtotal</span>
                  <span>{fmtBRL(subtotal)}</span>
                </div>
                <div className="flex items-baseline justify-between text-xs text-amber-300">
                  <span>Desconto</span>
                  <span>− {fmtBRL(desconto)}</span>
                </div>
              </>
            )}
            <div className="flex items-baseline justify-between">
              <span className="text-slate-400 text-sm">Total</span>
              <span className="text-3xl font-bold text-emerald-400">{fmtBRL(total)}</span>
            </div>
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
        {obsItemAlvo && (
          <ObsItemModal
            valor={obsItemRascunho}
            onChange={setObsItemRascunho}
            onCancelar={() => setObsItemAlvo(null)}
            onSalvar={() => {
              definirObsItem(obsItemAlvo, obsItemRascunho);
              setObsItemAlvo(null);
            }}
          />
        )}
        {qtdAlvo && (
          <QtdModal
            valor={qtdRascunho}
            onChange={setQtdRascunho}
            onCancelar={() => setQtdAlvo(null)}
            onSalvar={() => {
              const n = Number(qtdRascunho.replace(",", ".").trim());
              if (!Number.isNaN(n)) definirQtd(qtdAlvo, n);
              setQtdAlvo(null);
            }}
          />
        )}
        {confirmandoLimpar && (
          <ConfirmModal
            titulo="Limpar carrinho?"
            mensagem={`Vai remover ${totalItens} ${totalItens === 1 ? "item" : "itens"} (${fmtBRL(subtotal)}). Essa ação não pode ser desfeita.`}
            textoConfirma="Sim, limpar"
            cor="red"
            onCancelar={() => setConfirmandoLimpar(false)}
            onConfirmar={() => {
              setCarrinho([]);
              limparCarrinho();
              setObservacoes("");
              setDescontoStr("");
              setConfirmandoLimpar(false);
              setTela("produtos");
            }}
          />
        )}
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
          {historico.length > 0 && (
            <button
              type="button"
              onClick={() => setMostrandoHistorico(true)}
              className="text-[10px] font-bold px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              title="Últimas comandas enviadas deste dispositivo"
            >📜 {historico.length}</button>
          )}
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
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
            {mesa ? <span className="truncate max-w-[140px]">{mesa}</span> : <span>Mesa / balcão</span>}
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
          <button
            type="button"
            onClick={() => setBuscandoCliente(true)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              cliente
                ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
            title="Vincular cliente"
          >
            <span className="text-sm leading-none">👤</span>
            {cliente ? <span className="truncate max-w-[140px]">{cliente.nome}</span> : <span>Cliente</span>}
            {cliente && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setCliente(null); }}
                className="ml-1 px-1 text-cyan-300/70 hover:text-white"
                aria-label="Remover cliente"
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
        <div className="mt-2 flex gap-1.5 text-xs">
          {([
            ["TODOS", "Tudo", contagemTipos.todos],
            ["PRODUTOS", "Produtos", contagemTipos.produtos],
            ["SERVICOS", "Serviços", contagemTipos.servicos],
          ] as const).map(([k, label, n]) => {
            const ativo = filtroTipo === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFiltroTipo(k)}
                className={`flex-1 px-2 py-1.5 rounded-lg font-semibold border transition-colors ${
                  ativo
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                }`}
              >
                {label} <span className={ativo ? "text-emerald-100" : "text-slate-500"}>· {n}</span>
              </button>
            );
          })}
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
      {buscandoCliente && (
        <ClienteModal
          atual={cliente}
          onCancelar={() => setBuscandoCliente(false)}
          onSelecionar={(c) => { setCliente(c); setBuscandoCliente(false); }}
          onLimpar={() => { setCliente(null); setBuscandoCliente(false); }}
        />
      )}
      {mostrandoHistorico && (
        <HistoricoModal
          itens={historico}
          onFechar={() => setMostrandoHistorico(false)}
          onLimpar={() => { limparHistorico(); setHistorico([]); setMostrandoHistorico(false); }}
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
// ClienteModal — busca cliente no CRM e vincula a comanda.
// Faz busca server-side com debounce de 300ms para evitar martelar a API.
// =====================================================================
interface ClienteMin { id: string; nome: string; cpfCnpj?: string | null; telefone?: string | null; }
function ClienteModal({ atual, onCancelar, onSelecionar, onLimpar }: {
  atual: { id: string; nome: string } | null;
  onCancelar: () => void;
  onSelecionar: (c: { id: string; nome: string }) => void;
  onLimpar: () => void;
}) {
  const [termo, setTermo] = useState("");
  const [lista, setLista] = useState<ClienteMin[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelado = false;
    const t = setTimeout(async () => {
      setCarregando(true);
      setErro("");
      try {
        const resp: any = await api.listarClientes(termo ? { search: termo, ativo: "true" } : { ativo: "true" });
        if (cancelado) return;
        const arr: ClienteMin[] = Array.isArray(resp) ? resp : (resp?.clientes || []);
        setLista(arr.slice(0, 50));
      } catch (err) {
        if (!cancelado) setErro((err as Error).message || "Falha ao buscar clientes");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }, 300);
    return () => { cancelado = true; clearTimeout(t); };
  }, [termo]);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
      onClick={onCancelar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl pb-[max(16px,env(safe-area-inset-bottom))] max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">👤</span>
          <h2 className="font-bold flex-1">Vincular cliente</h2>
          <button type="button" onClick={onCancelar} className="text-slate-400 text-2xl px-2" aria-label="Fechar">×</button>
        </div>
        <input
          autoFocus
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar nome, CPF/CNPJ ou telefone…"
          className="w-full px-3 py-3 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:border-cyan-500 focus:outline-none mb-3"
        />
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {carregando && lista.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-6">Buscando…</div>
          ) : erro ? (
            <div className="text-red-300 text-sm py-4 text-center">{erro}</div>
          ) : lista.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-6">Nenhum cliente encontrado.</div>
          ) : (
            <div className="flex flex-col gap-1">
              {lista.map(c => {
                const selecionado = atual?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelecionar({ id: c.id, nome: c.nome })}
                    className={`text-left px-3 py-2 rounded-lg border ${
                      selecionado
                        ? "bg-cyan-500/15 border-cyan-500/40"
                        : "bg-slate-800 border-slate-700 hover:border-slate-600"
                    }`}
                  >
                    <div className="font-semibold text-sm truncate">{c.nome}</div>
                    {(c.cpfCnpj || c.telefone) && (
                      <div className="text-[11px] text-slate-500 truncate">
                        {[c.cpfCnpj, c.telefone].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {atual && (
          <button
            type="button"
            onClick={onLimpar}
            className="mt-3 px-4 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-medium border border-slate-700"
          >Desvincular cliente atual ({atual.nome})</button>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// ConfirmModal — confirmacao generica destrutiva (limpar carrinho etc).
// =====================================================================
function ConfirmModal({ titulo, mensagem, textoConfirma, cor = "red", onCancelar, onConfirmar }: {
  titulo: string;
  mensagem: string;
  textoConfirma: string;
  cor?: "red" | "emerald";
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const classeBotao = cor === "red"
    ? "bg-red-500 hover:bg-red-400"
    : "bg-emerald-500 hover:bg-emerald-400";
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
      onClick={onCancelar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl pb-[max(16px,env(safe-area-inset-bottom))]"
      >
        <h2 className="font-bold text-base mb-2">{titulo}</h2>
        <p className="text-sm text-slate-400 mb-4">{mensagem}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-medium border border-slate-700"
          >Cancelar</button>
          <button
            type="button"
            onClick={onConfirmar}
            className={`flex-1 px-4 py-2.5 rounded-lg ${classeBotao} text-white font-bold text-sm`}
          >{textoConfirma}</button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// HistoricoModal — ultimas 20 comandas enviadas por este dispositivo.
// =====================================================================
function HistoricoModal({ itens, onFechar, onLimpar }: {
  itens: ComandaHistorico[];
  onFechar: () => void;
  onLimpar: () => void;
}) {
  const fmtHora = (ts: number) => new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
      onClick={onFechar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl pb-[max(16px,env(safe-area-inset-bottom))] max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">📜</span>
          <h2 className="font-bold flex-1">Últimas comandas deste dispositivo</h2>
          <button type="button" onClick={onFechar} className="text-slate-400 text-2xl px-2" aria-label="Fechar">×</button>
        </div>
        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {itens.length === 0 ? (
            <div className="text-center text-slate-500 text-sm py-6">Nenhuma comanda enviada ainda.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {itens.map((c, i) => (
                <div
                  key={c.ts + "-" + i}
                  className={`px-3 py-2 rounded-lg border ${
                    c.origem === "fila"
                      ? "bg-amber-500/10 border-amber-500/30"
                      : "bg-slate-800 border-slate-700"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-semibold text-sm">
                      {c.numero != null ? `#${c.numero}` : "—"}
                      <span className="text-slate-500 font-normal text-xs ml-2">{fmtHora(c.ts)}</span>
                    </div>
                    <div className="text-emerald-400 font-bold text-sm">{(c.total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {c.qtdItens} {c.qtdItens === 1 ? "item" : "itens"}
                    {c.mesa ? ` · 📍 ${c.mesa}` : ""}
                    {c.cliente ? ` · 👤 ${c.cliente}` : ""}
                    {c.origem === "fila" ? " · (na fila)" : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {itens.length > 0 && (
          <button
            type="button"
            onClick={onLimpar}
            className="mt-3 px-4 py-2.5 rounded-lg bg-slate-800 text-slate-400 text-xs font-medium border border-slate-700"
          >Limpar histórico</button>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// QtdModal — entrada direta de quantidade no carrinho.
// Aceita decimal (kg/litros) via virgula ou ponto. 0 ou vazio = remove.
// =====================================================================
function QtdModal({ valor, onChange, onCancelar, onSalvar }: {
  valor: string;
  onChange: (v: string) => void;
  onCancelar: () => void;
  onSalvar: () => void;
}) {
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
          <span className="text-xl">#️⃣</span>
          <h2 className="font-bold flex-1">Quantidade</h2>
          <button type="button" onClick={onCancelar} className="text-slate-400 text-2xl px-2" aria-label="Fechar">×</button>
        </div>
        <input
          autoFocus
          value={valor}
          onChange={(e) => {
            // Aceita digitos, virgula ou ponto. Bloqueia o resto.
            const limpo = e.target.value.replace(/[^0-9.,]/g, "").slice(0, 8);
            onChange(limpo);
          }}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => { if (e.key === "Enter") onSalvar(); }}
          inputMode="decimal"
          placeholder="Ex.: 12 · 2,5 · 0,750"
          className="w-full px-3 py-4 bg-slate-800 border border-slate-700 rounded-lg text-3xl font-bold text-center focus:border-emerald-500 focus:outline-none mb-3"
        />
        <div className="text-[11px] text-slate-500 mb-4 text-center">
          Use vírgula para decimais (peso, metragem etc.). Zero remove o item.
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="px-4 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-medium border border-slate-700"
          >Cancelar</button>
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
// ObsItemModal — observacao por item (vai em itens[i].observacoes).
// =====================================================================
function ObsItemModal({ valor, onChange, onCancelar, onSalvar }: {
  valor: string;
  onChange: (v: string) => void;
  onCancelar: () => void;
  onSalvar: () => void;
}) {
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
          <span className="text-xl">💬</span>
          <h2 className="font-bold flex-1">Observação do item</h2>
          <button type="button" onClick={onCancelar} className="text-slate-400 text-2xl px-2" aria-label="Fechar">×</button>
        </div>
        <textarea
          autoFocus
          value={valor}
          onChange={(e) => onChange(e.target.value.slice(0, 300))}
          rows={3}
          placeholder="Ex.: sem cebola · mal-passado · embrulhar separado"
          className="w-full px-3 py-3 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:border-amber-500 focus:outline-none resize-none mb-1"
        />
        <div className="text-[11px] text-slate-500 mb-3 text-right">{valor.length}/300</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { onChange(""); onSalvar(); }}
            className="px-4 py-2.5 rounded-lg bg-slate-800 text-slate-300 text-sm font-medium border border-slate-700"
          >Limpar</button>
          <button
            type="button"
            onClick={onSalvar}
            className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm"
          >Salvar</button>
        </div>
      </div>
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
        <button type="button" onClick={onCancelar} className="text-slate-300 text-2xl px-2">←</button>
        <div className="flex-1 font-semibold">Escanear</div>
      </header>
      <div id={containerId} className="flex-1 w-full" />
      {erro && <div className="px-4 py-4 bg-red-500/20 text-red-200 text-sm text-center">{erro}</div>}
    </div>
  );
}
