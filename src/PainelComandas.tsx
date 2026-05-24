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

const POLL_MS = 5000;
const LIMITE_GARGALO_MIN = 10;

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api.listarComandas({ status: "NOVO,EM_PREPARACAO" });
      setComandas(Array.isArray(r) ? r as Comanda[] : []);
      setErro("");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    pollRef.current = setInterval(carregar, POLL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [carregar]);

  const novos = comandas.filter(c => c.status === "NOVO");
  const emPrep = comandas.filter(c => c.status === "EM_PREPARACAO");

  async function aceitar(c: Comanda) {
    setAcao(c.id);
    try { await api.aceitarComanda(c.id); await carregar(); }
    catch (err) { alert("Erro: " + (err as Error).message); }
    finally { setAcao(null); }
  }

  async function cancelar(c: Comanda) {
    const motivo = prompt(`Motivo para cancelar a comanda #${c.numero}?`);
    if (motivo == null) return;
    setAcao(c.id);
    try { await api.cancelarComanda(c.id, motivo.trim() || undefined); await carregar(); }
    catch (err) { alert("Erro: " + (err as Error).message); }
    finally { setAcao(null); }
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
      alert("Erro ao carregar comanda: " + (err as Error).message);
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
            Atualiza a cada {POLL_MS / 1000}s · timer persistente (resiste a F5)
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
            onCancelar={cancelar}
            onImprimir={imprimirTicket}
            onCheckout={null}
            onAbrir={(c) => setDetalhe(c)}
            acaoAtual={acao}
          />
          <ColunaKanban
            titulo="🍳 Em preparação"
            cor={C.accent}
            comandas={emPrep}
            onAceitar={null}
            onCancelar={cancelar}
            onImprimir={imprimirTicket}
            onCheckout={abrirCheckout}
            onAbrir={(c) => setDetalhe(c)}
            acaoAtual={acao}
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
          onConcluido={async () => { setCheckout(null); await carregar(); }}
        />
      )}
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
}
function ColunaKanban({ titulo, cor, comandas, onAceitar, onCancelar, onImprimir, onCheckout, onAbrir, acaoAtual }: ColunaProps) {
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
interface CardProps extends Omit<ColunaProps, "titulo" | "comandas"> {
  comanda: Comanda;
}
function CardComanda({ comanda, cor, onAceitar, onCancelar, onImprimir, onCheckout, onAbrir, acaoAtual }: CardProps) {
  // Timer ancorado no instante real do servidor — resiste a F5.
  const desde = comanda.status === "EM_PREPARACAO" && comanda.aceitoEm
    ? comanda.aceitoEm
    : comanda.criadoEm;
  const { minutos, texto } = useTimerPersistente(desde);
  const gargalo = minutos >= LIMITE_GARGALO_MIN;
  const itens = comanda._count?.itens ?? comanda.itens?.length ?? 0;
  const ocupado = acaoAtual === comanda.id;

  return (
    <div style={{
      background: gargalo ? C.red + "12" : C.card,
      border: `1px solid ${gargalo ? C.red + "88" : cor + "55"}`,
      borderRadius: 8,
      padding: 10,
      animation: gargalo ? "pulse-card 1.6s ease-in-out infinite" : "none",
    }}>
      <style>{`
        @keyframes pulse-card {
          0%, 100% { box-shadow: 0 0 0 0 ${C.red}44; }
          50% { box-shadow: 0 0 0 6px ${C.red}11; }
        }
      `}</style>
      <button type="button" onClick={() => onAbrir(comanda)} style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        width: "100%", background: "transparent", border: "none",
        color: C.white, fontWeight: 700, fontSize: 13, cursor: "pointer",
        padding: 0, marginBottom: 6, textAlign: "left",
      }}>
        <span>#{comanda.numero}{comanda.mesa ? ` · ${comanda.mesa}` : ""}</span>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: gargalo ? C.red : cor,
          fontVariantNumeric: "tabular-nums",
        }}>{texto}{gargalo ? " ⚠" : ""}</span>
      </button>
      <div style={{ color: C.muted, fontSize: 11, marginBottom: 8 }}>
        {itens} {itens === 1 ? "item" : "itens"} · {fmtBRL(comanda.total)}
        {comanda.user?.nome ? ` · ${comanda.user.nome}` : ""}
        {comanda.cliente?.nome ? ` · ${comanda.cliente.nome}` : ""}
      </div>
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
          style={btnAcao(C.muted, ocupado, true)}>
          🖨️
        </button>
        {onCancelar && (
          <button type="button" onClick={() => onCancelar(comanda)} disabled={ocupado}
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
