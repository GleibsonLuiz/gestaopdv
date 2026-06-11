import { useEffect, useRef, useState, type CSSProperties } from "react";
import { C } from "../lib/theme";
import { api, ApiError } from "../lib/api";
import { useModalKeys } from "../lib/modalKeys";

// ============ PIX QR CODE MODAL ============
//
// Pagamento PIX via Mercado Pago /v1/payments. Diferente do MaquininhaMpModal
// (que envia para o device), aqui o QR Code aparece NA TELA do PDV e o cliente
// escaneia com o app do banco. O backend faz polling do /v1/payments/:id e o
// webhook do MP confirma a aprovacao.

export type StatusPix = "PENDING" | "APPROVED" | "REJECTED" | "CANCELED" | "ERROR";

interface RespostaPix {
  id: string;
  status: StatusPix;
  tipo: "PIX";
  valor: number;
  intentId?: string | null;
  qrCode?: string | null;
  qrCodeBase64?: string | null;
  detalhe?: string | null;
  vendaId?: string | null;
  vendaNumero?: number | null;
  mensagem?: string;
}

interface PixQrCodeModalProps {
  totalReais: number;
  vendaPayload: Record<string, unknown>;
  onFechar: () => void;
  onConcluido: (info: { vendaId: string; vendaNumero: number | null; valor: number }) => void;
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PixQrCodeModal({
  totalReais, vendaPayload, onFechar, onConcluido,
}: PixQrCodeModalProps) {
  const [intencao, setIntencao] = useState<RespostaPix | null>(null);
  const [erro, setErro] = useState<string>("");
  const [gerando, setGerando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const concluidoRef = useRef(false);
  const iniciouRef = useRef(false);

  // Gera o PIX automaticamente ao abrir o modal — diferente do modal da
  // maquininha (em que o operador escolhe credit/debit/pix), aqui o usuario
  // ja entrou pelo botao "PIX", entao nao tem o que perguntar.
  useEffect(() => {
    if (iniciouRef.current) return;
    iniciouRef.current = true;
    (async () => {
      setGerando(true);
      try {
        const resp = await api.cobrarMp({
          tipo: "PIX",
          vendaPayload,
        }) as RespostaPix;
        setIntencao(resp);
      } catch (err) {
        setErro(extrairMensagemErro(err));
      } finally {
        setGerando(false);
      }
    })();
  }, [vendaPayload]);

  // Polling do status enquanto PENDING.
  useEffect(() => {
    if (!intencao?.id) return;
    if (intencao.status !== "PENDING") return;
    const handle = setInterval(async () => {
      try {
        const atualizada = await api.statusMp(intencao.id) as RespostaPix;
        setIntencao((prev) => prev ? { ...prev, ...atualizada } : atualizada);
      } catch (err) {
        console.warn("polling PIX falhou:", err);
      }
    }, 2000);
    return () => clearInterval(handle);
  }, [intencao?.id, intencao?.status]);

  // Aprovado: dispara callback uma unica vez.
  useEffect(() => {
    if (!intencao) return;
    if (intencao.status !== "APPROVED") return;
    if (concluidoRef.current) return;
    concluidoRef.current = true;
    onConcluido({
      vendaId: intencao.vendaId || "",
      vendaNumero: intencao.vendaNumero ?? null,
      valor: intencao.valor / 100,
    });
  }, [intencao, onConcluido]);

  // So permite fechar quando nao tem PIX PENDING ativo (evita perder a
  // cobranca em curso). Cancelar tem botao explicito.
  const podeFechar = !intencao || intencao.status !== "PENDING";
  useModalKeys(true, {
    onClose: () => { if (podeFechar) onFechar(); },
  });

  async function copiarCodigo() {
    if (!intencao?.qrCode) return;
    try {
      await navigator.clipboard.writeText(intencao.qrCode);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Nao foi possivel copiar — selecione manualmente abaixo.");
    }
  }

  async function cancelar() {
    if (!intencao?.id) return;
    if (!confirm("Cancelar a cobranca PIX?")) return;
    setCancelando(true);
    try {
      await api.cancelarMp(intencao.id);
      const atualizada = await api.statusMp(intencao.id) as RespostaPix;
      setIntencao(atualizada);
    } catch (err) {
      setErro(extrairMensagemErro(err));
    } finally {
      setCancelando(false);
    }
  }

  function extrairMensagemErro(err: unknown): string {
    const base = (err as Error)?.message || "Erro desconhecido";
    if (err instanceof ApiError) {
      const data = err.data as { detalhe?: string } | null;
      if (data?.detalhe) return `${base} — ${data.detalhe}`;
    }
    return base;
  }

  // ============ RENDER ============

  return (
    <div style={backdrop} onClick={() => podeFechar && onFechar()}>
      <div role="dialog" aria-modal="true" style={modal} onClick={(e) => e.stopPropagation()}>
        <header style={cabecalho}>
          <div style={{ fontSize: 28 }}>⚡</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: C.white }}>
              Pagamento PIX
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              Mercado Pago · {fmtBRL(totalReais)}
            </div>
          </div>
          {podeFechar && (
            <button onClick={onFechar} style={btnFechar} title="Fechar (Esc)">×</button>
          )}
        </header>

        <div style={corpo}>
          {gerando && (
            <div style={{ textAlign: "center", padding: "30px 0" }}>
              <Spinner />
              <div style={{ color: C.muted, fontSize: 13, marginTop: 14 }}>
                Gerando QR Code…
              </div>
            </div>
          )}

          {!gerando && intencao?.status === "PENDING" && intencao.qrCodeBase64 && (
            <div style={{ textAlign: "center" }}>
              <div style={{
                background: "#fff",
                padding: 12,
                borderRadius: 12,
                display: "inline-block",
                boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
              }}>
                <img
                  src={`data:image/png;base64,${intencao.qrCodeBase64}`}
                  alt="QR Code PIX"
                  style={{ display: "block", width: 240, height: 240 }}
                />
              </div>
              <div style={{ marginTop: 14, color: C.text, fontSize: 13, lineHeight: 1.5 }}>
                Cliente escaneia o QR Code no app do banco<br/>
                ou usa o codigo copia e cola:
              </div>
              <button
                onClick={copiarCodigo}
                style={{
                  marginTop: 10,
                  background: copiado ? C.green : C.surface,
                  color: copiado ? C.white : C.text,
                  border: `1px solid ${copiado ? C.green : C.border}`,
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  transition: "all 120ms",
                }}
              >
                {copiado ? "✓ Codigo copiado!" : "📋 Copiar codigo PIX"}
              </button>
              <div style={{ marginTop: 18, padding: 10, background: C.surface,
                            borderRadius: 8, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                <Spinner inline /> Aguardando pagamento. A tela atualiza automaticamente quando o cliente concluir.
              </div>
              <button
                onClick={cancelar}
                disabled={cancelando}
                style={{ ...btnSecundario, marginTop: 14, borderColor: C.red + "55", color: C.red }}
              >
                {cancelando ? "Cancelando…" : "Cancelar cobranca"}
              </button>
            </div>
          )}

          {!gerando && intencao?.status === "APPROVED" && (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div style={{ fontSize: 56 }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: C.green, marginTop: 8 }}>
                Pagamento aprovado
              </div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                PIX · {fmtBRL(intencao.valor / 100)}
              </div>
              {intencao.vendaNumero && (
                <div style={{ fontSize: 14, color: C.text, marginTop: 10 }}>
                  Venda <b>#{intencao.vendaNumero}</b> criada com sucesso
                </div>
              )}
              <button onClick={onFechar} style={{ ...btnPrimario, marginTop: 18 }}>
                OK
              </button>
            </div>
          )}

          {!gerando && intencao && ["REJECTED", "CANCELED", "ERROR"].includes(intencao.status) && (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div style={{ fontSize: 56 }}>{intencao.status === "ERROR" ? "⚠️" : "❌"}</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: C.red, marginTop: 8 }}>
                {intencao.status === "REJECTED" ? "Pagamento recusado"
                  : intencao.status === "CANCELED" ? "Cobranca cancelada"
                  : "Falha na cobranca"}
              </div>
              {intencao.detalhe && (
                <div style={{ fontSize: 12, color: C.text, marginTop: 10, padding: 10,
                              background: C.surface, borderRadius: 8, lineHeight: 1.4 }}>
                  {intencao.detalhe}
                </div>
              )}
              <button onClick={onFechar} style={{ ...btnPrimario, marginTop: 18 }}>
                Fechar
              </button>
            </div>
          )}

          {erro && <div style={alerta(C.red)}>{erro}</div>}
        </div>
      </div>
    </div>
  );
}

function Spinner({ inline }: { inline?: boolean } = {}) {
  const size = inline ? 14 : 56;
  return (
    <>
      <style>{`
        @keyframes pix-spin { to { transform: rotate(360deg); } }
      `}</style>
      <span style={{
        display: "inline-block",
        verticalAlign: "middle",
        width: size, height: size,
        border: `${inline ? 2 : 5}px solid ${C.surface}`,
        borderTopColor: C.accent,
        borderRadius: "50%",
        animation: "pix-spin 0.9s linear infinite",
      }} />
    </>
  );
}

const backdrop: CSSProperties = {
  position: "fixed", inset: 0,
  background: "rgba(5, 8, 18, 0.78)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 9999,
  backdropFilter: "blur(4px)",
};

const modal: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  width: "min(440px, 95vw)",
  boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
  overflow: "hidden",
};

const cabecalho: CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  padding: "16px 18px",
  borderBottom: `1px solid ${C.border}`,
  background: C.surface,
};

const corpo: CSSProperties = {
  padding: "18px",
};

const btnFechar: CSSProperties = {
  background: "transparent",
  border: "none",
  color: C.muted,
  fontSize: 26,
  cursor: "pointer",
  padding: "0 6px",
  lineHeight: 1,
};

const btnPrimario: CSSProperties = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: "var(--accent-ink)",
  border: "none",
  borderRadius: 8,
  padding: "10px 16px",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  boxShadow: `0 2px 10px ${C.accent}55`,
};

const btnSecundario: CSSProperties = {
  background: C.surface,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

function alerta(cor: string): CSSProperties {
  return {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 8,
    background: cor + "22",
    border: `1px solid ${cor}55`,
    color: cor,
    fontSize: 12,
  };
}
