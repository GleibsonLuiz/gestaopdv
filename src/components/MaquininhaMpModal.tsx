import { useEffect, useRef, useState, type CSSProperties } from "react";
import { C } from "../lib/theme";
import { api } from "../lib/api";
import { useModalKeys } from "../lib/modalKeys";

// ============ MAQUININHA MERCADO PAGO ============
//
// Encapsula o fluxo de cobranca via Mercado Pago Point:
//
//   1) Operador escolhe o tipo (CREDIT/DEBIT/PIX)
//   2) Componente chama POST /pagamentos-mp/cobrar com o vendaPayload
//      (mesmo shape de POST /vendas — backend guarda o payload e so cria
//      a Venda real quando o webhook aprovar)
//   3) Polling em GET /pagamentos-mp/status/:id a cada 2s
//   4) Quando status final, chama onConcluido (APPROVED) ou apenas mostra
//      erro e permite retentar / fechar
//
// O componente NAO conhece o conceito de Venda — quem chama (PDV) recebe
// onConcluido(vendaNumero) e cuida de exibir recibo, limpar carrinho etc.

export type TipoMaquininha = "CREDIT" | "DEBIT" | "PIX";
export type StatusIntencao = "PENDING" | "APPROVED" | "REJECTED" | "CANCELED" | "ERROR";

interface IntencaoResposta {
  id: string;
  status: StatusIntencao;
  tipo: TipoMaquininha;
  valor: number;
  intentId?: string | null;
  detalhe?: string | null;
  vendaId?: string | null;
  vendaNumero?: number | null;
  mensagem?: string;
}

interface MaquininhaMpModalProps {
  // Valor TOTAL da venda em reais (o componente converte para centavos).
  totalReais: number;
  // Payload de venda completo (mesmo shape de POST /vendas). Sera reusado
  // pelo backend quando o pagamento aprovar.
  vendaPayload: Record<string, unknown>;
  onFechar: () => void;
  // Chamado quando APPROVED. Recebe os dados que o PDV precisa pra montar
  // o recibo.
  onConcluido: (info: { vendaId: string; vendaNumero: number | null; valor: number }) => void;
}

const TIPOS: { id: TipoMaquininha; label: string; icone: string; cor: string }[] = [
  { id: "CREDIT", label: "Crédito à vista", icone: "💳", cor: C.yellow },
  { id: "DEBIT",  label: "Débito",          icone: "💳", cor: C.accent },
  { id: "PIX",    label: "PIX",             icone: "⚡", cor: "#06b6d4" },
];

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function MaquininhaMpModal({
  totalReais, vendaPayload, onFechar, onConcluido,
}: MaquininhaMpModalProps) {
  const [tipo, setTipo] = useState<TipoMaquininha | null>(null);
  const [intencao, setIntencao] = useState<IntencaoResposta | null>(null);
  const [erro, setErro] = useState<string>("");
  const [enviando, setEnviando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  // Ref para evitar fechar acidentalmente um modal em estado terminal antes
  // de chamar onConcluido (ja agendado pelo effect).
  const concluidoRef = useRef(false);

  // Polling enquanto PENDING. Para imediatamente em estado final.
  useEffect(() => {
    if (!intencao?.id) return;
    if (intencao.status !== "PENDING") return;
    const handle = setInterval(async () => {
      try {
        const atualizada = await api.statusMp(intencao.id) as IntencaoResposta;
        setIntencao((prev) => prev ? { ...prev, ...atualizada } : atualizada);
      } catch (err) {
        // Nao quebra o polling em erro transiente — proximo tick tenta de novo.
        console.warn("polling MP falhou:", err);
      }
    }, 2000);
    return () => clearInterval(handle);
  }, [intencao?.id, intencao?.status]);

  // Quando alcanca APPROVED, dispara callback uma unica vez.
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

  // Esc fecha — mas so quando nao tem cobranca PENDING ativa (evita o
  // operador fechar enquanto a maquininha esta cobrando o cliente).
  const podeFechar =
    !intencao || intencao.status !== "PENDING";
  useModalKeys(true, {
    onClose: () => { if (podeFechar) onFechar(); },
  });

  async function enviar(tipoEscolhido: TipoMaquininha) {
    setErro("");
    setEnviando(true);
    try {
      const resp = await api.cobrarMp({
        tipo: tipoEscolhido,
        vendaPayload,
      }) as IntencaoResposta;
      setIntencao(resp);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function cancelar() {
    if (!intencao?.id) return;
    if (!confirm("Cancelar a cobrança na maquininha?")) return;
    setCancelando(true);
    try {
      await api.cancelarMp(intencao.id);
      // Forca refresh — o polling tambem vai pegar.
      const atualizada = await api.statusMp(intencao.id) as IntencaoResposta;
      setIntencao(atualizada);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCancelando(false);
    }
  }

  // ============ RENDER ============

  return (
    <div style={backdrop} onClick={() => podeFechar && onFechar()}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <header style={cabecalho}>
          <div style={{ fontSize: 28 }}>📲</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: C.white }}>
              Cobrar na maquininha
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              Mercado Pago Point · {fmtBRL(totalReais)}
            </div>
          </div>
          {podeFechar && (
            <button onClick={onFechar} style={btnFechar} title="Fechar (Esc)">×</button>
          )}
        </header>

        <div style={corpo}>
          {!intencao ? (
            <SelecionarTipo
              valor={tipo}
              onMudar={setTipo}
              onConfirmar={(t) => enviar(t)}
              enviando={enviando}
            />
          ) : (
            <Acompanhar
              intencao={intencao}
              onCancelar={cancelar}
              cancelando={cancelando}
              onNovaTentativa={() => { setIntencao(null); setTipo(null); setErro(""); concluidoRef.current = false; }}
              onFechar={onFechar}
            />
          )}

          {erro && <div style={alerta(C.red)}>{erro}</div>}
        </div>
      </div>
    </div>
  );
}

// ============ TELA 1: SELECIONAR TIPO ============

interface SelecionarTipoProps {
  valor: TipoMaquininha | null;
  onMudar: (t: TipoMaquininha) => void;
  onConfirmar: (t: TipoMaquininha) => void;
  enviando: boolean;
}

function SelecionarTipo({ valor, onMudar, onConfirmar, enviando }: SelecionarTipoProps) {
  return (
    <>
      <div style={{ color: C.muted, fontSize: 12, marginBottom: 10 }}>
        Selecione como o cliente vai pagar. A maquininha vai exibir o valor e processar.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {TIPOS.map((t) => {
          const ativo = valor === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onMudar(t.id)}
              disabled={enviando}
              style={{
                background: ativo ? `linear-gradient(135deg, ${t.cor}33, ${t.cor}11)` : C.surface,
                border: `2px solid ${ativo ? t.cor : C.border}`,
                borderRadius: 10,
                padding: "14px 10px",
                cursor: enviando ? "default" : "pointer",
                textAlign: "center",
                color: C.text,
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 4 }}>{t.icone}</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{t.label}</div>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => valor && onConfirmar(valor)}
        disabled={!valor || enviando}
        style={{
          marginTop: 16, width: "100%", padding: "12px 14px",
          background: !valor || enviando
            ? C.muted
            : `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
          color: C.white, border: "none", borderRadius: 8,
          fontWeight: 700, fontSize: 14,
          cursor: !valor || enviando ? "default" : "pointer",
          boxShadow: !valor || enviando ? "none" : `0 2px 10px ${C.accent}55`,
        }}
      >
        {enviando ? "Enviando para a maquininha…" : "📲 Enviar para a maquininha"}
      </button>
    </>
  );
}

// ============ TELA 2: ACOMPANHAR INTENCAO ============

interface AcompanharProps {
  intencao: IntencaoResposta;
  onCancelar: () => void;
  cancelando: boolean;
  onNovaTentativa: () => void;
  onFechar: () => void;
}

function Acompanhar({ intencao, onCancelar, cancelando, onNovaTentativa, onFechar }: AcompanharProps) {
  const tipoLabel = TIPOS.find((t) => t.id === intencao.tipo)?.label || intencao.tipo;
  if (intencao.status === "PENDING") {
    return (
      <div style={{ textAlign: "center", padding: "10px 0" }}>
        <Spinner />
        <div style={{ fontWeight: 800, fontSize: 18, color: C.white, marginTop: 16 }}>
          Aguardando pagamento…
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
          {tipoLabel} · {fmtBRL(intencao.valor / 100)}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
          Entregue a maquininha ao cliente. O sistema vai atualizar automaticamente
          quando o pagamento for confirmado.
        </div>
        <button
          onClick={onCancelar}
          disabled={cancelando}
          style={{ ...btnSecundario, marginTop: 18, borderColor: C.red + "55", color: C.red }}
        >
          {cancelando ? "Cancelando…" : "Cancelar cobrança"}
        </button>
      </div>
    );
  }

  if (intencao.status === "APPROVED") {
    return (
      <div style={{ textAlign: "center", padding: "10px 0" }}>
        <div style={{ fontSize: 56 }}>✅</div>
        <div style={{ fontWeight: 800, fontSize: 20, color: C.green, marginTop: 8 }}>
          Pagamento aprovado
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
          {tipoLabel} · {fmtBRL(intencao.valor / 100)}
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
    );
  }

  const ehErro = intencao.status === "ERROR";
  const ehRejeitado = intencao.status === "REJECTED";
  const corDestaque = ehErro ? C.yellow : C.red;
  const titulo = ehRejeitado ? "Pagamento recusado"
    : intencao.status === "CANCELED" ? "Cobrança cancelada"
    : "Falha na cobrança";

  return (
    <div style={{ textAlign: "center", padding: "10px 0" }}>
      <div style={{ fontSize: 56 }}>{ehErro ? "⚠️" : "❌"}</div>
      <div style={{ fontWeight: 800, fontSize: 20, color: corDestaque, marginTop: 8 }}>
        {titulo}
      </div>
      <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
        {tipoLabel} · {fmtBRL(intencao.valor / 100)}
      </div>
      {intencao.detalhe && (
        <div style={{ fontSize: 12, color: C.text, marginTop: 10, padding: 10,
                      background: C.surface, borderRadius: 8, lineHeight: 1.4 }}>
          {intencao.detalhe}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button onClick={onFechar} style={{ ...btnSecundario, flex: 1 }}>
          Fechar
        </button>
        <button onClick={onNovaTentativa} style={{ ...btnPrimario, flex: 1 }}>
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

// ============ SPINNER ============

function Spinner() {
  return (
    <>
      <style>{`
        @keyframes mp-spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{
        width: 64, height: 64, margin: "8px auto 0",
        border: `5px solid ${C.surface}`,
        borderTopColor: C.accent,
        borderRadius: "50%",
        animation: "mp-spin 0.9s linear infinite",
      }} />
    </>
  );
}

// ============ ESTILOS ============

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
  color: C.white,
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
