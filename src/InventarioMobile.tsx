import { useEffect, useState, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { api } from "./lib/api";
import {
  lerContagensLocais,
  salvarContagemLocal,
  removerContagemLocal,
  limparSessaoLocal,
  totalPendentesLocal,
} from "./lib/inventarioOffline";

// =====================================================================
// ETAPA#1 — Tela mobile-first do Inventario com Contagem Cega.
//
// Rota: ?mobile=inventario  (bypass de auth normal seria via login do
// usuario, mas para acesso rapido no celular instalamos como PWA
// — App.tsx detecta o query string e renderiza essa tela em tela cheia).
//
// Fluxo:
//   1. Operador entra com o ID da sessao (numero do inventario aberto
//      pelo gestor no desktop).
//   2. Tela carrega a folha (NAO inclui estoqueLogico — backend filtra).
//   3. Operador escaneia codigo de barras (html5-qrcode) OU busca por
//      nome/codigo. Item selecionado mostra so o nome — sem valor do sistema.
//   4. Digita quantidade e confirma. Contagem salva em localStorage
//      imediatamente (resistente a queda de rede).
//   5. Botao "Sincronizar" envia lote ao backend quando online.
// =====================================================================

interface ItemFolha {
  id: string;
  quantidadeContada: string | number | null;
  contadoEm: string | null;
  produto: {
    id: string;
    codigo: string;
    codigoBarras?: string | null;
    nome: string;
    unidade?: string | null;
  };
}

interface Folha {
  id: string;
  numero: number;
  descricao?: string | null;
  itens: ItemFolha[];
}

type Tela = "entrada" | "lista" | "scanner" | "contar";

export default function InventarioMobile() {
  const [tela, setTela] = useState<Tela>("entrada");
  const [inventarioId, setInventarioId] = useState<string>(() => {
    // Persiste o ultimo inventario aberto pra nao perder ao recarregar.
    try { return localStorage.getItem("gestaopro_mobile_inv_id") || ""; } catch { return ""; }
  });
  const [folha, setFolha] = useState<Folha | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [itemAtivo, setItemAtivo] = useState<ItemFolha | null>(null);
  const [qtd, setQtd] = useState("");
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  const [sincronizando, setSincronizando] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const [flash, setFlash] = useState<{ msg: string; tipo: "ok" | "erro" } | null>(null);

  const inputQtdRef = useRef<HTMLInputElement | null>(null);

  // Monitora estado da rede pra mostrar badge offline e ativar/desativar
  // botao de sincronizar.
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Atualiza contador de pendentes locais sempre que a sessao muda.
  useEffect(() => {
    if (inventarioId) setPendentes(totalPendentesLocal(inventarioId));
  }, [inventarioId]);

  const flashOk = (msg: string) => {
    setFlash({ msg, tipo: "ok" });
    setTimeout(() => setFlash(null), 1800);
  };
  const flashErro = (msg: string) => {
    setFlash({ msg, tipo: "erro" });
    setTimeout(() => setFlash(null), 2400);
  };

  const carregarFolha = useCallback(async (id: string) => {
    setCarregando(true);
    setErro("");
    try {
      const f = await api.folhaInventario(id) as Folha;
      setFolha(f);
      try { localStorage.setItem("gestaopro_mobile_inv_id", id); } catch {}
      setTela("lista");
    } catch (err) {
      setErro((err as Error).message || "Falha ao carregar inventario");
    } finally {
      setCarregando(false);
    }
  }, []);

  function abrirSessao(e: React.FormEvent) {
    e.preventDefault();
    if (!inventarioId.trim()) {
      setErro("Informe o ID do inventario");
      return;
    }
    carregarFolha(inventarioId.trim());
  }

  function escolherItem(item: ItemFolha) {
    setItemAtivo(item);
    // Pre-preenche com contagem local (rascunho) se houver.
    const local = lerContagensLocais(inventarioId)[item.id];
    setQtd(local ? String(local.quantidadeContada) : "");
    setTela("contar");
    setTimeout(() => inputQtdRef.current?.focus(), 80);
  }

  function confirmarContagem() {
    if (!itemAtivo) return;
    const n = Number(qtd.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      flashErro("Quantidade invalida");
      return;
    }
    salvarContagemLocal(inventarioId, itemAtivo.id, n);
    setPendentes(totalPendentesLocal(inventarioId));
    flashOk(`✓ ${itemAtivo.produto.nome} — ${n} ${itemAtivo.produto.unidade || "un"}`);
    setItemAtivo(null);
    setQtd("");
    setTela("lista");
  }

  async function sincronizar() {
    const locais = lerContagensLocais(inventarioId);
    const lote = Object.values(locais).map(c => ({
      inventarioItemId: c.inventarioItemId,
      quantidadeContada: c.quantidadeContada,
    }));
    if (lote.length === 0) {
      flashOk("Nada para sincronizar");
      return;
    }
    setSincronizando(true);
    try {
      await api.salvarContagensInventario(inventarioId, lote);
      // Recarrega a folha pra refletir estado autoritativo do servidor.
      const f = await api.folhaInventario(inventarioId) as Folha;
      setFolha(f);
      // Remove do localStorage apenas o que foi aceito (mantemos todos
      // por simplicidade — backend e idempotente: re-enviar nao quebra).
      lote.forEach(l => removerContagemLocal(inventarioId, l.inventarioItemId));
      if (totalPendentesLocal(inventarioId) === 0) limparSessaoLocal(inventarioId);
      setPendentes(totalPendentesLocal(inventarioId));
      flashOk(`✓ ${lote.length} contagem${lote.length !== 1 ? "s" : ""} sincronizada${lote.length !== 1 ? "s" : ""}`);
    } catch (err) {
      flashErro("Falha: " + ((err as Error).message || "rede"));
    } finally {
      setSincronizando(false);
    }
  }

  // ============ TELA: ENTRADA DE ID ============
  if (tela === "entrada") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-5xl mb-2">📋</div>
            <h1 className="text-2xl font-bold">Inventário Mobile</h1>
            <p className="text-slate-400 text-sm mt-2">Contagem cega — informe o ID da sessão aberta no painel.</p>
          </div>
          <form onSubmit={abrirSessao} className="flex flex-col gap-4">
            <input
              value={inventarioId}
              onChange={(e) => setInventarioId(e.target.value)}
              placeholder="ID do inventário"
              autoFocus
              className="w-full px-4 py-4 text-lg bg-slate-800 border border-slate-700 rounded-xl focus:border-emerald-500 focus:outline-none"
            />
            <button type="submit" disabled={carregando}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 text-white font-bold text-lg rounded-xl">
              {carregando ? "Carregando..." : "Abrir folha de contagem"}
            </button>
            {erro && (
              <div className="px-4 py-3 bg-red-500/20 border border-red-500/40 text-red-300 rounded-xl text-sm">{erro}</div>
            )}
          </form>
          <div className="mt-8 text-center text-xs text-slate-500">
            {online ? "🟢 Online" : "🔴 Offline — abra a sessão antes de perder conexão"}
          </div>
        </div>
      </div>
    );
  }

  // ============ TELA: LISTA DE ITENS + BUSCA ============
  const itensFiltrados = (folha?.itens || []).filter(i => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return i.produto.nome.toLowerCase().includes(q)
        || i.produto.codigo.toLowerCase().includes(q)
        || (i.produto.codigoBarras || "").toLowerCase().includes(q);
  });
  const contagensLocais = inventarioId ? lerContagensLocais(inventarioId) : {};

  if (tela === "lista") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        {/* TOPO FIXO */}
        <header className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 px-3 py-3">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setTela("entrada")} className="text-slate-400 text-2xl px-2" aria-label="Voltar">←</button>
            <div className="flex-1">
              <div className="text-xs text-slate-400">Inventário #{folha?.numero}</div>
              <div className="font-semibold text-sm truncate">{folha?.descricao || "Sem descrição"}</div>
            </div>
            <div className={`text-xs font-bold px-2 py-1 rounded ${online ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
              {online ? "ONLINE" : "OFFLINE"}
            </div>
          </div>
          <div className="flex gap-2">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou código…"
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm focus:border-emerald-500 focus:outline-none"
            />
            <button onClick={() => setTela("scanner")} className="px-3 py-2 bg-emerald-500 text-white font-bold rounded-lg text-lg" title="Escanear código de barras">
              📷
            </button>
          </div>
        </header>

        {/* LISTA */}
        <div className="flex-1 overflow-y-auto">
          {itensFiltrados.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">Nenhum item encontrado.</div>
          ) : (
            itensFiltrados.map(item => {
              const local = contagensLocais[item.id];
              const jaSalvo = item.quantidadeContada !== null && item.quantidadeContada !== undefined;
              const status: "pendente" | "rascunho" | "contado" =
                local ? "rascunho" : jaSalvo ? "contado" : "pendente";
              const corStatus =
                status === "contado" ? "border-emerald-500/40 bg-emerald-500/5"
                : status === "rascunho" ? "border-amber-500/40 bg-amber-500/5"
                : "border-slate-700 bg-slate-900";
              const labelStatus =
                status === "contado" ? "Sincronizado"
                : status === "rascunho" ? "A sincronizar"
                : "Pendente";
              const corLabel =
                status === "contado" ? "text-emerald-300"
                : status === "rascunho" ? "text-amber-300"
                : "text-slate-500";
              return (
                <button key={item.id}
                  onClick={() => escolherItem(item)}
                  className={`w-full text-left px-4 py-4 border-b ${corStatus} active:bg-slate-800`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm leading-tight truncate">{item.produto.nome}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {item.produto.codigo}{item.produto.codigoBarras ? ` · ${item.produto.codigoBarras}` : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${corLabel}`}>
                        {labelStatus}
                      </div>
                      {(local || jaSalvo) && (
                        <div className="text-lg font-bold text-slate-100 mt-1">
                          {local ? local.quantidadeContada : item.quantidadeContada}
                          <span className="text-xs text-slate-500 ml-1">{item.produto.unidade || "un"}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* RODAPÉ FIXO: SINCRONIZAR */}
        <footer className="sticky bottom-0 bg-slate-900 border-t border-slate-800 px-3 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <button
            onClick={sincronizar}
            disabled={!online || sincronizando || pendentes === 0}
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-lg rounded-xl flex items-center justify-center gap-2">
            {sincronizando ? "Enviando..." : pendentes > 0 ? `📤 Sincronizar ${pendentes} contagem${pendentes !== 1 ? "s" : ""}` : "Nada para sincronizar"}
          </button>
        </footer>

        {/* FLASH */}
        {flash && (
          <div className={`fixed bottom-24 left-3 right-3 z-20 px-4 py-3 rounded-xl text-sm font-medium text-center shadow-lg ${
            flash.tipo === "ok" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
          }`}>
            {flash.msg}
          </div>
        )}
      </div>
    );
  }

  // ============ TELA: SCANNER (câmera) ============
  if (tela === "scanner") {
    return <ScannerView
      onCancelar={() => setTela("lista")}
      onLer={(codigo) => {
        // Procura item por codigo de barras ou codigo do produto.
        const enc = (folha?.itens || []).find(i =>
          i.produto.codigoBarras === codigo || i.produto.codigo === codigo
        );
        setTela("lista");
        if (enc) {
          escolherItem(enc);
        } else {
          flashErro("Código não encontrado: " + codigo);
        }
      }}
    />;
  }

  // ============ TELA: CONTAGEM (digitar quantidade) ============
  if (tela === "contar" && itemAtivo) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <header className="px-4 py-4 border-b border-slate-800 flex items-center gap-2">
          <button onClick={() => { setTela("lista"); setItemAtivo(null); }} className="text-slate-400 text-2xl px-2">←</button>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-500">Contagem cega — não vejo o estoque do sistema.</div>
            <div className="font-bold truncate">{itemAtivo.produto.nome}</div>
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Código</div>
          <div className="font-mono text-sm text-slate-400 mb-8">
            {itemAtivo.produto.codigo}{itemAtivo.produto.codigoBarras ? ` · ${itemAtivo.produto.codigoBarras}` : ""}
          </div>

          <label className="text-xs uppercase tracking-widest text-slate-500 mb-2">Quantidade contada</label>
          <input
            ref={inputQtdRef}
            type="number"
            inputMode="decimal"
            pattern="[0-9]*"
            step="0.001"
            min="0"
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            placeholder="0"
            className="w-full max-w-xs px-6 py-6 bg-slate-800 border-2 border-emerald-500/40 rounded-2xl text-center text-5xl font-bold focus:border-emerald-500 focus:outline-none"
            onKeyDown={(e) => { if (e.key === "Enter") confirmarContagem(); }}
          />
          <div className="mt-2 text-sm text-slate-500">{itemAtivo.produto.unidade || "un"}</div>
        </div>

        <footer className="px-4 py-4 pb-[max(16px,env(safe-area-inset-bottom))] border-t border-slate-800 flex gap-3">
          <button onClick={() => { setTela("lista"); setItemAtivo(null); }}
            className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl">
            Cancelar
          </button>
          <button onClick={confirmarContagem}
            className="flex-[2] py-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white font-bold text-lg rounded-xl">
            ✓ Confirmar
          </button>
        </footer>

        {flash && (
          <div className={`fixed bottom-24 left-3 right-3 z-20 px-4 py-3 rounded-xl text-sm font-medium text-center ${
            flash.tipo === "ok" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
          }`}>
            {flash.msg}
          </div>
        )}
      </div>
    );
  }

  return null;
}

// =====================================================================
// SCANNER de codigo de barras — usa html5-qrcode (camera nativa).
// Pede permissao na primeira abertura. Encerra a camera no unmount.
// =====================================================================
function ScannerView({ onLer, onCancelar }: { onLer: (codigo: string) => void; onCancelar: () => void }) {
  const containerId = "html5-qrcode-container";
  const [erro, setErro] = useState("");

  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    let ativo = true;
    (async () => {
      try {
        scanner = new Html5Qrcode(containerId, { verbose: false });
        await scanner.start(
          { facingMode: "environment" }, // camera traseira preferida
          { fps: 10, qrbox: { width: 280, height: 180 } },
          (decoded) => {
            if (!ativo) return;
            ativo = false;
            scanner?.stop().catch(() => {});
            onLer(decoded);
          },
          () => { /* frame sem leitura — silencioso */ },
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
        <div className="flex-1 font-semibold">Escanear código</div>
      </header>
      <div id={containerId} className="flex-1 w-full" />
      {erro && (
        <div className="px-4 py-4 bg-red-500/20 text-red-200 text-sm text-center">{erro}</div>
      )}
      <div className="px-4 py-3 text-center text-xs text-slate-400">
        Aproxime o código de barras da câmera traseira.
      </div>
    </div>
  );
}
