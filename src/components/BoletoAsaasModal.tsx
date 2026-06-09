import { useEffect, useRef, useState, type CSSProperties } from "react";
import { C } from "../lib/theme";
import { api, ApiError } from "../lib/api";
import { useModalKeys } from "../lib/modalKeys";

// ============ BOLETO HIBRIDO (BOLETO + PIX) — ASAAS ============
//
// Gera um boleto via a conta Asaas do lojista para cobrar o cliente final.
// O boleto ja aceita pagamento por PIX (boleto hibrido), entao mostramos a
// linha digitavel + o codigo PIX copia-e-cola + o QR. Enquanto PENDENTE,
// faz polling do status — o webhook do Asaas confirma e quita a conta a receber.

export type StatusBoleto = "PENDENTE" | "PAGO" | "VENCIDO" | "CANCELADO" | "ERRO";

interface RespostaBoleto {
  id: string;
  status: StatusBoleto;
  valorOriginal: number;
  valorCobrado: number;
  taxa: number;
  vencimento: string;
  pagoEm?: string | null;
  linhaDigitavel?: string | null;
  codigoBarras?: string | null;
  urlBoleto?: string | null;
  pixCopiaECola?: string | null;
  pixQrCodeBase64?: string | null;
  detalhe?: string | null;
  contaReceberId?: string | null;
}

interface CampoFaltando { campo: string; erro: string; }

interface BoletoAsaasModalProps {
  // Modo titulo: cobra uma ContaReceber existente (valor/vencimento/cliente
  // saem do titulo no backend).
  contaReceberId?: string;
  // Modo avulso: informe cliente + valor + vencimento.
  clienteId?: string;
  valorReais?: number;
  vencimentoSugerido?: string; // yyyy-mm-dd
  descricao?: string;
  // Rotulo do cliente para exibir no cabecalho (opcional).
  clienteNome?: string;
  onFechar: () => void;
  // Disparado quando o boleto e pago (para a tela atualizar a conta a receber).
  onPago?: () => void;
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function BoletoAsaasModal({
  contaReceberId, clienteId, valorReais, vencimentoSugerido, descricao,
  clienteNome, onFechar, onPago,
}: BoletoAsaasModalProps) {
  const [boleto, setBoleto] = useState<RespostaBoleto | null>(null);
  const [erro, setErro] = useState<string>("");
  const [camposFaltando, setCamposFaltando] = useState<CampoFaltando[]>([]);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState<"linha" | "pix" | null>(null);
  const iniciouRef = useRef(false);
  const pagoRef = useRef(false);

  async function gerar() {
    setGerando(true);
    setErro("");
    setCamposFaltando([]);
    try {
      const resp = await api.criarBoleto({
        contaReceberId,
        clienteId,
        valor: valorReais,
        vencimento: vencimentoSugerido,
        descricao,
      }) as RespostaBoleto;
      setBoleto(resp);
    } catch (err) {
      tratarErro(err);
    } finally {
      setGerando(false);
    }
  }

  // Gera automaticamente ao abrir.
  useEffect(() => {
    if (iniciouRef.current) return;
    iniciouRef.current = true;
    gerar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling do status enquanto PENDENTE.
  useEffect(() => {
    if (!boleto?.id || boleto.status !== "PENDENTE") return;
    const handle = setInterval(async () => {
      try {
        const atual = await api.statusBoleto(boleto.id) as RespostaBoleto;
        setBoleto((prev) => (prev ? { ...prev, ...atual } : atual));
      } catch { /* proximo tick tenta de novo */ }
    }, 5000);
    return () => clearInterval(handle);
  }, [boleto?.id, boleto?.status]);

  // Dispara onPago uma unica vez.
  useEffect(() => {
    if (boleto?.status === "PAGO" && !pagoRef.current) {
      pagoRef.current = true;
      onPago?.();
    }
  }, [boleto?.status, onPago]);

  function tratarErro(err: unknown) {
    if (err instanceof ApiError) {
      const data = err.data as { erro?: string; campos?: CampoFaltando[]; detalhe?: string } | null;
      if (data?.campos?.length) setCamposFaltando(data.campos);
      const base = data?.erro || err.message;
      setErro(data?.detalhe ? `${base} — ${data.detalhe}` : base);
      return;
    }
    setErro((err as Error)?.message || "Erro desconhecido");
  }

  async function copiar(tipo: "linha" | "pix") {
    const texto = tipo === "linha" ? boleto?.linhaDigitavel : boleto?.pixCopiaECola;
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(tipo);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setErro("Nao foi possivel copiar — selecione manualmente.");
    }
  }

  // Abre o boleto numa nova aba: a pagina do Asaas tem opcao de imprimir/PDF.
  function imprimir() {
    if (boleto?.urlBoleto) window.open(boleto.urlBoleto, "_blank", "noopener");
  }

  const podeFechar = !gerando;
  useModalKeys(true, { onClose: () => { if (podeFechar) onFechar(); } });

  // ============ RENDER ============

  return (
    <div style={backdrop} onClick={() => podeFechar && onFechar()}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <header style={cabecalho}>
          <div style={{ fontSize: 26 }}>🧾</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: C.white }}>
              Boleto + PIX
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              Asaas{clienteNome ? ` · ${clienteNome}` : ""}
              {valorReais ? ` · ${fmtBRL(valorReais)}` : ""}
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
                Gerando boleto no Asaas…
              </div>
            </div>
          )}

          {/* PENDENTE: dados de pagamento */}
          {!gerando && boleto?.status === "PENDENTE" && (
            <div>
              {boleto.taxa > 0 && (
                <div style={{ ...alerta(C.muted), marginBottom: 12 }}>
                  Valor da venda {fmtBRL(boleto.valorOriginal)} + taxa do boleto{" "}
                  {fmtBRL(boleto.taxa)} = <b style={{ color: C.text }}>{fmtBRL(boleto.valorCobrado)}</b>
                </div>
              )}

              <button onClick={imprimir} style={{ ...btnPrimario, width: "100%" }}>
                🖨️ Abrir / imprimir boleto
              </button>

              {boleto.linhaDigitavel && (
                <div style={bloco}>
                  <div style={rotulo}>Linha digitável</div>
                  <div style={valorMono}>{boleto.linhaDigitavel}</div>
                  <button
                    onClick={() => copiar("linha")}
                    style={copiado === "linha" ? btnCopiadoOk : btnCopiar}
                  >
                    {copiado === "linha" ? "✓ Copiada!" : "📋 Copiar linha"}
                  </button>
                </div>
              )}

              {boleto.pixCopiaECola && (
                <div style={bloco}>
                  <div style={rotulo}>PIX copia e cola</div>
                  {boleto.pixQrCodeBase64 && (
                    <div style={{ textAlign: "center", marginBottom: 10 }}>
                      <div style={qrWrap}>
                        <img
                          src={`data:image/png;base64,${boleto.pixQrCodeBase64}`}
                          alt="QR Code PIX do boleto"
                          style={{ display: "block", width: 180, height: 180 }}
                        />
                      </div>
                    </div>
                  )}
                  <div style={valorMono}>{boleto.pixCopiaECola}</div>
                  <button
                    onClick={() => copiar("pix")}
                    style={copiado === "pix" ? btnCopiadoOk : btnCopiar}
                  >
                    {copiado === "pix" ? "✓ Copiado!" : "📋 Copiar código PIX"}
                  </button>
                </div>
              )}

              <div style={{ ...alerta(C.muted), marginTop: 14 }}>
                <Spinner inline /> Aguardando pagamento. A conta a receber é quitada
                automaticamente quando o cliente pagar.
              </div>
            </div>
          )}

          {/* PAGO */}
          {!gerando && boleto?.status === "PAGO" && (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div style={{ fontSize: 56 }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: C.green, marginTop: 8 }}>
                Boleto pago
              </div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                {fmtBRL(boleto.valorCobrado)}
              </div>
              <button onClick={onFechar} style={{ ...btnPrimario, marginTop: 18 }}>OK</button>
            </div>
          )}

          {/* CANCELADO / VENCIDO / ERRO */}
          {!gerando && boleto && ["CANCELADO", "VENCIDO", "ERRO"].includes(boleto.status) && (
            <div style={{ textAlign: "center", padding: "10px 0" }}>
              <div style={{ fontSize: 56 }}>{boleto.status === "VENCIDO" ? "⏰" : "⚠️"}</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: C.red, marginTop: 8 }}>
                {boleto.status === "VENCIDO" ? "Boleto vencido"
                  : boleto.status === "CANCELADO" ? "Boleto cancelado"
                  : "Falha na emissão"}
              </div>
              {boleto.detalhe && (
                <div style={{ ...alerta(C.red), marginTop: 10, textAlign: "left" }}>
                  {boleto.detalhe}
                </div>
              )}
              <button onClick={onFechar} style={{ ...btnPrimario, marginTop: 18 }}>Fechar</button>
            </div>
          )}

          {/* Erro de emissao (sem boleto criado) */}
          {!gerando && !boleto && erro && (
            <div style={{ padding: "6px 0" }}>
              <div style={{ ...alerta(C.red), textAlign: "left" }}>{erro}</div>
              {camposFaltando.length > 0 && (
                <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: C.text, fontSize: 12 }}>
                  {camposFaltando.map((c) => (
                    <li key={c.campo} style={{ marginBottom: 4 }}>
                      <b>{c.campo}</b>: {c.erro}
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={gerar} style={{ ...btnSecundario, flex: 1 }}>Tentar de novo</button>
                <button onClick={onFechar} style={{ ...btnPrimario, flex: 1 }}>Fechar</button>
              </div>
            </div>
          )}

          {/* Erro pontual quando ja ha boleto na tela */}
          {boleto && erro && <div style={{ ...alerta(C.red), marginTop: 12 }}>{erro}</div>}
        </div>
      </div>
    </div>
  );
}

function Spinner({ inline }: { inline?: boolean } = {}) {
  const size = inline ? 14 : 56;
  return (
    <>
      <style>{`@keyframes bol-spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{
        display: "inline-block", verticalAlign: "middle",
        width: size, height: size,
        border: `${inline ? 2 : 5}px solid ${C.surface}`,
        borderTopColor: C.accent, borderRadius: "50%",
        animation: "bol-spin 0.9s linear infinite",
      }} />
    </>
  );
}

const backdrop: CSSProperties = {
  position: "fixed", inset: 0,
  background: "rgba(5, 8, 18, 0.78)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 9999, backdropFilter: "blur(4px)",
};
const modal: CSSProperties = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
  width: "min(460px, 95vw)", maxHeight: "92vh", overflowY: "auto",
  boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
};
const cabecalho: CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, padding: "16px 18px",
  borderBottom: `1px solid ${C.border}`, background: C.surface,
  position: "sticky", top: 0, zIndex: 1,
};
const corpo: CSSProperties = { padding: "18px" };
const btnFechar: CSSProperties = {
  background: "transparent", border: "none", color: C.muted,
  fontSize: 26, cursor: "pointer", padding: "0 6px", lineHeight: 1,
};
const bloco: CSSProperties = {
  marginTop: 14, padding: 12, background: C.surface,
  border: `1px solid ${C.border}`, borderRadius: 10,
};
const rotulo: CSSProperties = {
  fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase",
  letterSpacing: 0.4, marginBottom: 6,
};
const valorMono: CSSProperties = {
  fontFamily: "ui-monospace, Menlo, Consolas, monospace",
  fontSize: 12, color: C.text, wordBreak: "break-all", lineHeight: 1.5,
};
const qrWrap: CSSProperties = {
  background: "#fff", padding: 10, borderRadius: 10, display: "inline-block",
  boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
};
const btnPrimario: CSSProperties = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: C.white, border: "none", borderRadius: 8, padding: "11px 16px",
  fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: `0 2px 10px ${C.accent}55`,
};
const btnSecundario: CSSProperties = {
  background: C.surface, color: C.text, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "11px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer",
};
const btnCopiar: CSSProperties = {
  marginTop: 8, background: C.card, color: C.text, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "7px 12px", fontWeight: 700, fontSize: 12,
  cursor: "pointer", transition: "all 120ms",
};
const btnCopiadoOk: CSSProperties = { ...btnCopiar, background: C.green, color: C.white, borderColor: C.green };

function alerta(cor: string): CSSProperties {
  return {
    padding: "10px 12px", borderRadius: 8, background: cor + "22",
    border: `1px solid ${cor}55`, color: cor, fontSize: 12, lineHeight: 1.5,
  };
}
