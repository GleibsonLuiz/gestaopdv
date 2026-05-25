import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { api } from "./lib/api";
import { C } from "./lib/theme";
import type { SessionUser } from "./lib/api";

// =====================================================================
// ETAPA#8b — Central de Comandas (Kanban /painel-comandas)
//
// Fluxo: NOVO  ->  EM_PREPARACAO  ->  CONCLUIDA
//
// Timer persistente: calculado a cada segundo a partir de comanda.criadoEm
// (ou comanda.aceitoEm para "tempo em preparacao"). Resiste a F5 porque
// nasce do timestamp do banco, nao do mount do componente.
//
// Polling: GET /comandas a cada 5s mantem o Kanban sincronizado entre
// abas/dispositivos sem WebSocket. ETAPA futura pode trocar pra SSE.
// =====================================================================

type StatusComanda = "NOVO" | "EM_PREPARACAO" | "CONCLUIDA" | "CANCELADA";

interface ItemComanda {
  id: string;
  quantidade: number | string;
  precoUnitario: number | string;
  subtotal: number | string;
  observacoes?: string | null;
  produto?: {
    id: string;
    codigo: string;
    nome: string;
    unidade?: string | null;
    camposSegmento?: {
      codigoOEM?: string;
      marcaPeca?: string;
      lote?: string;
      validade?: string;
    } | null;
  } | null;
}

interface Comanda {
  id: string;
  numero: number;
  status: StatusComanda;
  mesa?: string | null;
  observacoes?: string | null;
  total: number | string;
  criadoEm: string;
  aceitoEm?: string | null;
  concluidoEm?: string | null;
  cliente?: { id: string; nome: string } | null;
  user?: { id: string; nome: string } | null;
  itens?: ItemComanda[];
  _count?: { itens: number };
}

// Polling adaptativo: rapido quando tem fila, devagar quando vazio.
const POLL_MS_OCUPADO = 3000;
const POLL_MS_VAZIO = 10000;
const LIMITE_GARGALO_MIN = 10;
// Janela de destaque visual de "comanda recem-chegada" (badge NOVA + flash).
const REALCE_NOVA_MS = 12000;

interface Toast { id: number; msg: string; tipo: "ok" | "erro" | "info"; }

function fmtBRL(n: number | string): string {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Timer persistente — recalcula segundo a segundo. Devolve "Mm Ss" para
// mostrar no card. Usa "agora" do client mas baseia em data do servidor.
function useTimerPersistente(desde: string | null | undefined): { minutos: number; texto: string } {
  const [, force] = useState(0);
  useEffect(() => {
    if (!desde) return;
    const i = setInterval(() => force(v => v + 1), 1000);
    return () => clearInterval(i);
  }, [desde]);
  return useMemo(() => {
    if (!desde) return { minutos: 0, texto: "—" };
    const diff = Math.max(0, Date.now() - new Date(desde).getTime());
    const totalSec = Math.floor(diff / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return { minutos: min, texto: `${min}m ${String(sec).padStart(2, "0")}s` };
  }, [desde, /* re-render por setInterval acima */ Math.floor(Date.now() / 1000)]);
}

interface Props { user: SessionUser }

export default function PainelComandas({ user }: Props) {
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [acao, setAcao] = useState<string | null>(null); // id em acao (loading)
  const [detalhe, setDetalhe] = useState<Comanda | null>(null);
  const [checkout, setCheckout] = useState<Comanda | null>(null);
  const [cancelando, setCancelando] = useState<Comanda | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [idsRealce, setIdsRealce] = useState<Set<string>>(() => new Set());
  const idsConhecidosRef = useRef<Set<string>>(new Set());
  const primeiroLoadRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<{ ctx?: AudioContext }>({});
  const totalAbertasRef = useRef(0);

  // Beep curto via Web Audio (singleton AudioContext).
  const beep = useCallback((freq: number, dur: number) => {
    try {
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Ctor = w.AudioContext || w.webkitAudioContext;
      if (!Ctor) return;
      const ctx = audioRef.current.ctx || (audioRef.current.ctx = new Ctor());
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.12;
      osc.connect(gain).connect(ctx.destination);
      const t = ctx.currentTime;
      osc.start(t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur / 1000);
      osc.stop(t + dur / 1000);
    } catch {}
  }, []);

  const toast = useCallback((msg: string, tipo: Toast["tipo"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, tipo }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tipo === "erro" ? 4500 : 2500);
  }, []);

  const carregar = useCallback(async () => {
    try {
      const r = await api.listarComandas({ status: "NOVO,EM_PREPARACAO" });
      const lista = Array.isArray(r) ? r as Comanda[] : [];
      setComandas(lista);
      totalAbertasRef.current = lista.length;
      setErro("");

      // Detecta novidades: comandas com id que nao conheciamos antes.
      // No primeiro load nao avisa nada (todas seriam "novas").
      const idsAtuais = new Set(lista.map(c => c.id));
      if (!primeiroLoadRef.current) {
        const novas = lista.filter(c => c.status === "NOVO" && !idsConhecidosRef.current.has(c.id));
        if (novas.length > 0) {
          beep(880, 120);
          setTimeout(() => beep(1175, 140), 130); // 2 tons subindo
          setIdsRealce(prev => {
            const s = new Set(prev);
            novas.forEach(c => s.add(c.id));
            return s;
          });
          // Remove realce apos a janela.
          novas.forEach(c => {
            setTimeout(() => {
              setIdsRealce(prev => {
                const s = new Set(prev);
                s.delete(c.id);
                return s;
              });
            }, REALCE_NOVA_MS);
          });
        }
      }
      idsConhecidosRef.current = idsAtuais;
      primeiroLoadRef.current = false;
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [beep]);

  // Polling adaptativo: timeout encadeado, reage a comandas.length sem
  // depender de variavel mutavel num setInterval estatico.
  useEffect(() => {
    let cancelado = false;
    async function tick() {
      if (cancelado) return;
      await carregar();
      if (cancelado) return;
      const delay = totalAbertasRef.current > 0 ? POLL_MS_OCUPADO : POLL_MS_VAZIO;
      pollRef.current = setTimeout(tick, delay);
    }
    tick();
    return () => {
      cancelado = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregar]);

  const novos = comandas.filter(c => c.status === "NOVO");
  const emPrep = comandas.filter(c => c.status === "EM_PREPARACAO");

  async function aceitar(c: Comanda) {
    setAcao(c.id);
    try {
      await api.aceitarComanda(c.id);
      toast(`Comanda #${c.numero} aceita`, "ok");
      await carregar();
    } catch (err) {
      toast("Erro: " + (err as Error).message, "erro");
    } finally { setAcao(null); }
  }

  async function confirmarCancelar(c: Comanda, motivo: string) {
    setAcao(c.id);
    setCancelando(null);
    try {
      await api.cancelarComanda(c.id, motivo.trim() || undefined);
      toast(`Comanda #${c.numero} cancelada`, "info");
      await carregar();
    } catch (err) {
      toast("Erro: " + (err as Error).message, "erro");
    } finally { setAcao(null); }
  }

  function abrirCheckout(c: Comanda) {
    setCheckout(c);
  }

  async function imprimirTicket(c: Comanda) {
    // Reusa o caminho de impressao do navegador via janela escondida —
    // pra ESC/POS Bluetooth direto, ver lib/escposPedido + webBluetoothPrint
    // (a feature ja esta disponivel no PDV principal). Aqui usamos
    // window.print() apenas como atalho rapido enquanto a tela de checkout
    // (ETAPA#9a) e desenvolvida.
    try {
      const completa = await api.obterComanda(c.id) as Comanda;
      setDetalhe(completa);
      setTimeout(() => window.print(), 300);
    } catch (err) {
      toast("Erro ao carregar comanda: " + (err as Error).message, "erro");
    }
  }

  return (
    <div style={{ padding: "0 6px" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 14, padding: "12px 14px",
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
      }}>
        <div>
          <div style={{ color: C.white, fontSize: 16, fontWeight: 700 }}>🍽️ Central de Comandas</div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
            Atualiza a cada {POLL_MS_OCUPADO / 1000}s com fila / {POLL_MS_VAZIO / 1000}s vazio · timer persistente (resiste a F5) · som ao chegar pedido
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <KpiMini titulo="Novos" valor={novos.length} cor={C.yellow} />
          <KpiMini titulo="Em preparação" valor={emPrep.length} cor={C.accent} />
        </div>
      </div>

      {erro && (
        <div style={{
          padding: "10px 14px", marginBottom: 12, borderRadius: 8,
          background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
        }}>{erro}</div>
      )}

      {carregando && comandas.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: C.muted }}>Carregando comandas...</div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}>
          <ColunaKanban
            titulo="📥 Novos pedidos"
            cor={C.yellow}
            comandas={novos}
            onAceitar={aceitar}
            onCancelar={(c) => setCancelando(c)}
            onImprimir={imprimirTicket}
            onCheckout={null}
            onAbrir={(c) => setDetalhe(c)}
            acaoAtual={acao}
            idsRealce={idsRealce}
          />
          <ColunaKanban
            titulo="🍳 Em preparação"
            cor={C.accent}
            comandas={emPrep}
            onAceitar={null}
            onCancelar={(c) => setCancelando(c)}
            onImprimir={imprimirTicket}
            onCheckout={abrirCheckout}
            onAbrir={(c) => setDetalhe(c)}
            acaoAtual={acao}
            idsRealce={idsRealce}
          />
        </div>
      )}

      {detalhe && (
        <ModalDetalheComanda comanda={detalhe} onFechar={() => setDetalhe(null)} />
      )}
      {checkout && (
        <ModalCheckoutComanda
          comanda={checkout}
          onCancelar={() => setCheckout(null)}
          onConcluido={async () => {
            setCheckout(null);
            toast("Venda finalizada com sucesso", "ok");
            await carregar();
          }}
        />
      )}
      {cancelando && (
        <CancelarComandaModal
          comanda={cancelando}
          onFechar={() => setCancelando(null)}
          onConfirmar={(motivo) => confirmarCancelar(cancelando, motivo)}
        />
      )}
      <ToastHost toasts={toasts} />
    </div>
  );
}

// =====================================================================
function KpiMini({ titulo, valor, cor }: { titulo: string; valor: number; cor: string }) {
  return (
    <div style={{
      padding: "6px 12px", borderRadius: 8, minWidth: 100,
      background: cor + "18", border: `1px solid ${cor}55`,
    }}>
      <div style={{ color: cor, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{titulo}</div>
      <div style={{ color: C.white, fontSize: 22, fontWeight: 700 }}>{valor}</div>
    </div>
  );
}

// =====================================================================
interface ColunaProps {
  titulo: string;
  cor: string;
  comandas: Comanda[];
  onAceitar: ((c: Comanda) => void) | null;
  onCancelar: ((c: Comanda) => void) | null;
  onImprimir: (c: Comanda) => void;
  onCheckout: ((c: Comanda) => void) | null;
  onAbrir: (c: Comanda) => void;
  acaoAtual: string | null;
  idsRealce: Set<string>;
}
function ColunaKanban({ titulo, cor, comandas, onAceitar, onCancelar, onImprimir, onCheckout, onAbrir, acaoAtual, idsRealce }: ColunaProps) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: 10, minHeight: 200,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 10, paddingBottom: 8, borderBottom: `2px solid ${cor}55`,
      }}>
        <div style={{ color: cor, fontSize: 13, fontWeight: 700 }}>{titulo}</div>
        <div style={{
          background: cor + "22", color: cor,
          padding: "2px 10px", borderRadius: 999,
          fontSize: 11, fontWeight: 700,
        }}>{comandas.length}</div>
      </div>
      {comandas.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: 24 }}>
          Sem pedidos nesta etapa.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {comandas.map(c => (
            <CardComanda key={c.id}
              comanda={c}
              cor={cor}
              onAceitar={onAceitar}
              onCancelar={onCancelar}
              onImprimir={onImprimir}
              onCheckout={onCheckout}
              onAbrir={onAbrir}
              acaoAtual={acaoAtual}
              realce={idsRealce.has(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
interface CardProps extends Omit<ColunaProps, "titulo" | "comandas" | "idsRealce"> {
  comanda: Comanda;
  realce: boolean;
}
function CardComanda({ comanda, cor, onAceitar, onCancelar, onImprimir, onCheckout, onAbrir, acaoAtual, realce }: CardProps) {
  // Timer ancorado no instante real do servidor — resiste a F5.
  const desde = comanda.status === "EM_PREPARACAO" && comanda.aceitoEm
    ? comanda.aceitoEm
    : comanda.criadoEm;
  const { minutos, texto } = useTimerPersistente(desde);
  const gargalo = minutos >= LIMITE_GARGALO_MIN;
  const itens = comanda._count?.itens ?? comanda.itens?.length ?? 0;
  const ocupado = acaoAtual === comanda.id;

  // Preview dos 2 primeiros itens (precisa que o controller inclua itens
  // no listar — ja ajustado em backend/src/controllers/comandaController.js).
  const previewItens = (comanda.itens || []).slice(0, 2);
  const sobraItens = (comanda.itens?.length || 0) - previewItens.length;

  // Borda/animacao depende da prioridade: gargalo > realce-nova > normal.
  const corBorda = gargalo ? C.red + "88" : realce ? C.yellow : cor + "55";
  const corFundo = gargalo ? C.red + "12" : realce ? C.yellow + "10" : C.card;
  const anim = gargalo
    ? "pulse-card-red 1.6s ease-in-out infinite"
    : realce
      ? "pulse-card-new 1.2s ease-out 3"
      : "none";

  return (
    <div style={{
      background: corFundo,
      border: `1px solid ${corBorda}`,
      borderRadius: 8,
      padding: 10,
      animation: anim,
      position: "relative",
    }}>
      <style>{`
        @keyframes pulse-card-red {
          0%, 100% { box-shadow: 0 0 0 0 ${C.red}44; }
          50% { box-shadow: 0 0 0 6px ${C.red}11; }
        }
        @keyframes pulse-card-new {
          0% { box-shadow: 0 0 0 0 ${C.yellow}66; }
          100% { box-shadow: 0 0 0 10px ${C.yellow}00; }
        }
      `}</style>

      {realce && (
        <div style={{
          position: "absolute", top: -6, right: 8,
          padding: "2px 8px", borderRadius: 999,
          background: C.yellow, color: "#000",
          fontSize: 9, fontWeight: 800, letterSpacing: 0.5,
          boxShadow: `0 2px 6px ${C.yellow}55`,
        }}>NOVA</div>
      )}

      <button type="button" onClick={() => onAbrir(comanda)} style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        width: "100%", background: "transparent", border: "none",
        color: C.white, fontWeight: 700, fontSize: 13, cursor: "pointer",
        padding: 0, marginBottom: 4, textAlign: "left",
      }}>
        <span>#{comanda.numero}{comanda.mesa ? ` · 📍 ${comanda.mesa}` : ""}</span>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: gargalo ? C.red : cor,
          fontVariantNumeric: "tabular-nums",
        }}>{texto}{gargalo ? " ⚠" : ""}</span>
      </button>

      <div style={{ color: C.muted, fontSize: 11, marginBottom: 6 }}>
        {itens} {itens === 1 ? "item" : "itens"} ·{" "}
        <span style={{ color: C.white, fontWeight: 600 }}>{fmtBRL(comanda.total)}</span>
        {comanda.cliente?.nome && (
          <>{" · "}<span style={{ color: C.accent }}>👤 {comanda.cliente.nome}</span></>
        )}
      </div>

      {previewItens.length > 0 && (
        <div style={{
          padding: "6px 8px", marginBottom: 8,
          background: C.surface, borderRadius: 6,
          fontSize: 11, color: C.text,
          borderLeft: `2px solid ${cor}77`,
        }}>
          {previewItens.map((it) => (
            <div key={it.id} style={{
              display: "flex", justifyContent: "space-between", gap: 6,
              lineHeight: 1.4,
            }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ color: cor, fontWeight: 700 }}>{Number(it.quantidade)}×</span>{" "}
                {it.produto?.nome || "Item"}
                {it.observacoes ? <span style={{ color: C.yellow }}> · 💬</span> : null}
              </span>
            </div>
          ))}
          {sobraItens > 0 && (
            <div style={{ color: C.muted, fontSize: 10, marginTop: 2, fontStyle: "italic" }}>
              +{sobraItens} {sobraItens === 1 ? "item" : "itens"} — toque pra ver
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {onAceitar && (
          <button type="button" onClick={() => onAceitar(comanda)} disabled={ocupado}
            style={btnAcao(C.accent, ocupado)}>
            {ocupado ? "..." : "✓ Aceitar"}
          </button>
        )}
        {onCheckout && (
          <button type="button" onClick={() => onCheckout(comanda)} disabled={ocupado}
            style={btnAcao(C.green, ocupado)}>
            💰 Fechar venda
          </button>
        )}
        <button type="button" onClick={() => onImprimir(comanda)} disabled={ocupado}
          aria-label="Imprimir comanda"
          style={btnAcao(C.muted, ocupado, true)}>
          🖨️
        </button>
        {onCancelar && (
          <button type="button" onClick={() => onCancelar(comanda)} disabled={ocupado}
            aria-label="Cancelar comanda"
            style={btnAcao(C.red, ocupado, true)}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function btnAcao(cor: string, ocupado: boolean, ghost = false): React.CSSProperties {
  return {
    padding: "5px 10px", borderRadius: 6,
    background: ghost ? "transparent" : cor + "33",
    border: `1px solid ${cor}55`,
    color: cor,
    fontSize: 11, fontWeight: 700, cursor: ocupado ? "wait" : "pointer",
    opacity: ocupado ? 0.6 : 1,
  };
}

// =====================================================================
function ModalDetalheComanda({ comanda, onFechar }: { comanda: Comanda; onFechar: () => void }) {
  const [completa, setCompleta] = useState<Comanda>(comanda);
  useEffect(() => {
    if (!comanda.itens) {
      api.obterComanda(comanda.id).then(c => setCompleta(c as Comanda)).catch(() => {});
    }
  }, [comanda]);
  return (
    <div onClick={onFechar} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 200,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto",
        padding: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ color: C.white, fontSize: 17, fontWeight: 700 }}>
              Comanda #{completa.numero}{completa.mesa ? ` · ${completa.mesa}` : ""}
            </div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
              {new Date(completa.criadoEm).toLocaleString("pt-BR")}
              {completa.user?.nome ? ` · ${completa.user.nome}` : ""}
            </div>
          </div>
          <button type="button" onClick={onFechar} style={{
            background: "transparent", border: "none", color: C.muted, fontSize: 24, cursor: "pointer",
          }}>×</button>
        </div>

        {completa.cliente?.nome && (
          <div style={{
            padding: 8, borderRadius: 6, background: C.surface,
            color: C.white, fontSize: 12, marginBottom: 10,
          }}>Cliente: {completa.cliente.nome}</div>
        )}

        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: 10, marginBottom: 14,
        }}>
          {(completa.itens || []).map(it => (
            <div key={it.id} style={{
              padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12,
              display: "flex", justifyContent: "space-between", gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C.white, fontWeight: 600 }}>
                  {Number(it.quantidade)} {it.produto?.unidade || "un"} · {it.produto?.nome}
                </div>
                {it.produto?.camposSegmento?.codigoOEM && (
                  <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>OEM: {it.produto.camposSegmento.codigoOEM}</div>
                )}
                {it.produto?.camposSegmento?.lote && (
                  <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>
                    Lote {it.produto.camposSegmento.lote}{it.produto.camposSegmento.validade ? ` · Val. ${it.produto.camposSegmento.validade}` : ""}
                  </div>
                )}
              </div>
              <div style={{ color: C.white, fontWeight: 600 }}>{fmtBRL(it.subtotal)}</div>
            </div>
          ))}
          <div style={{
            display: "flex", justifyContent: "space-between",
            paddingTop: 8, marginTop: 4, borderTop: `2px solid ${C.border}`,
            color: C.white, fontWeight: 700, fontSize: 14,
          }}>
            <span>Total</span>
            <span style={{ color: C.accent }}>{fmtBRL(completa.total)}</span>
          </div>
        </div>

        {completa.observacoes && (
          <div style={{
            padding: 10, borderRadius: 6, background: C.surface,
            color: C.muted, fontSize: 12, fontStyle: "italic",
          }}>Obs: {completa.observacoes}</div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// ETAPA#9a: checkout simplificado de comanda
// Forma manual (vendedor cobra na maquininha externa, depois registra
// aqui o codigo da transacao para conciliacao).
// =====================================================================
function ModalCheckoutComanda({ comanda, onCancelar, onConcluido }: {
  comanda: Comanda; onCancelar: () => void; onConcluido: () => void;
}) {
  const [forma, setForma] = useState<string>("DINHEIRO");
  const [idTransacao, setIdTransacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    setSalvando(true); setErro("");
    try {
      await api.finalizarComanda(comanda.id, {
        formaPagamento: forma,
        idTransacao: idTransacao.trim() || undefined,
      });
      onConcluido();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div onClick={() => !salvando && onCancelar()} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 200,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        width: "100%", maxWidth: 420, padding: 22,
      }}>
        <div style={{ color: C.white, fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
          💰 Fechar venda · Comanda #{comanda.numero}
        </div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>
          Registra a forma de pagamento, gera a venda real (com baixa de estoque)
          e dispara a impressão do comprovante para assinatura do vendedor.
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 14, textAlign: "center" }}>
          <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Total a pagar</div>
          <div style={{ color: C.accent, fontSize: 28, fontWeight: 700 }}>{fmtBRL(comanda.total)}</div>
        </div>

        <label style={labelStyle}>Forma de pagamento</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 14 }}>
          {[
            { id: "DINHEIRO", label: "Dinheiro", icone: "💵" },
            { id: "PIX", label: "PIX", icone: "⚡" },
            { id: "CARTAO_CREDITO", label: "Cartão", icone: "💳" },
          ].map(opt => (
            <button key={opt.id} type="button" onClick={() => setForma(opt.id)} style={{
              padding: "10px 6px", borderRadius: 8,
              background: forma === opt.id ? C.accent + "33" : C.surface,
              border: `2px solid ${forma === opt.id ? C.accent : C.border}`,
              color: forma === opt.id ? C.accent : C.muted,
              fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}>{opt.icone}<br />{opt.label}</button>
          ))}
        </div>

        <label style={labelStyle}>ID da transação (opcional)</label>
        <input value={idTransacao} onChange={e => setIdTransacao(e.target.value)}
          placeholder="Ex: código de autorização da maquininha"
          style={inputStyle} />

        {erro && (
          <div style={{
            padding: "8px 12px", marginTop: 10, borderRadius: 8,
            background: C.red + "22", border: `1px solid ${C.red}55`,
            color: C.red, fontSize: 12,
          }}>{erro}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onCancelar} disabled={salvando}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, cursor: salvando ? "wait" : "pointer" }}>
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={salvando}
            style={{ flex: 2, padding: "10px 14px", borderRadius: 8, background: `linear-gradient(135deg, ${C.green}, ${C.accent})`, border: "none", color: "white", fontWeight: 800, cursor: salvando ? "wait" : "pointer" }}>
            {salvando ? "Confirmando..." : "✓ Confirmar e finalizar"}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", color: C.muted, fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  background: C.surface, border: `1px solid ${C.border}`,
  color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit",
  boxSizing: "border-box",
};

// =====================================================================
// CancelarComandaModal — substitui o prompt() do navegador.
// Motivo e' opcional; lista de motivos comuns acelera o cancelamento.
// =====================================================================
function CancelarComandaModal({ comanda, onFechar, onConfirmar }: {
  comanda: Comanda;
  onFechar: () => void;
  onConfirmar: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const sugestoes = ["Cliente desistiu", "Erro no pedido", "Sem estoque", "Demora"];
  return (
    <div onClick={onFechar} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 250,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card, border: `1px solid ${C.red}55`, borderRadius: 12,
        width: "100%", maxWidth: 420, padding: 20,
      }}>
        <div style={{ color: C.white, fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
          Cancelar comanda #{comanda.numero}?
        </div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 14 }}>
          {Number(comanda._count?.itens ?? comanda.itens?.length ?? 0)} itens · {fmtBRL(comanda.total)}
          {comanda.mesa ? ` · 📍 ${comanda.mesa}` : ""}
        </div>

        <label htmlFor="cancelar-motivo" style={labelStyle}>Motivo (opcional)</label>
        <textarea
          id="cancelar-motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value.slice(0, 200))}
          rows={2}
          placeholder="Ex.: cliente desistiu"
          style={{ ...inputStyle, resize: "none", minHeight: 60 }}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, marginBottom: 14 }}>
          {sugestoes.map(s => (
            <button key={s} type="button" onClick={() => setMotivo(s)} style={{
              padding: "4px 10px", borderRadius: 999,
              background: C.surface, border: `1px solid ${C.border}`,
              color: C.muted, fontSize: 11, cursor: "pointer",
            }}>{s}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onFechar} style={{
            flex: 1, padding: "10px 14px", borderRadius: 8,
            background: C.surface, border: `1px solid ${C.border}`,
            color: C.muted, fontWeight: 700, cursor: "pointer",
          }}>Voltar</button>
          <button type="button" onClick={() => onConfirmar(motivo)} style={{
            flex: 2, padding: "10px 14px", borderRadius: 8,
            background: C.red, border: "none",
            color: "white", fontWeight: 800, cursor: "pointer",
          }}>✕ Confirmar cancelamento</button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// ToastHost — empilha toasts no canto inferior direito. Cada toast tem
// auto-dismiss controlado pelo dono via setTimeout (ja feito em toast()).
// =====================================================================
function ToastHost({ toasts }: { toasts: Toast[] }) {
  const corPorTipo = (t: Toast["tipo"]) =>
    t === "ok" ? C.green : t === "erro" ? C.red : C.accent;
  return (
    <div style={{
      position: "fixed", right: 16, bottom: 16, zIndex: 300,
      display: "flex", flexDirection: "column", gap: 8,
      pointerEvents: "none",
      maxWidth: 360,
    }}>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(10px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      {toasts.map(t => {
        const cor = corPorTipo(t.tipo);
        return (
          <div key={t.id} style={{
            padding: "10px 14px", borderRadius: 8,
            background: C.card, border: `1px solid ${cor}66`,
            color: C.white, fontSize: 13, fontWeight: 600,
            boxShadow: `0 6px 18px rgba(0,0,0,0.4), inset 3px 0 0 ${cor}`,
            animation: "toast-in 180ms ease-out",
            pointerEvents: "auto",
          }}>{t.msg}</div>
        );
      })}
    </div>
  );
}
