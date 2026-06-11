// @ts-nocheck — extraido verbatim de PDV.tsx no fatiamento (Fase 5).
// A tipagem fina do objeto `venda` fica para a etapa de tipagem do PDV.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, getEmpresa } from "../lib/api";
import { emitirToast } from "../lib/toast";
import { useConfiguracaoEmpresa, formatarEndereco } from "../HeaderRelatorio";
import { obterConfigImpressora, devePrintar } from "../lib/impressora";
import CupomEnvelope from "../components/cupons/CupomEnvelope";
import CupomVenda from "../components/cupons/CupomVenda";
import { imprimirDanfeNfce } from "../lib/danfeNfce";
import { gerarComandosPedido } from "../lib/escposPedido";
import { imprimirViaBluetooth, bluetoothDisponivel } from "../lib/webBluetoothPrint";
import { qzAtivoEConfigurado, imprimirRawQz } from "../lib/qztray";
import { FORMA_LABEL, FORMA_COR_VAR, fmtBRL, fmtQtd, fmtData } from "./comum";

// Recibo pos-venda do PDV: resumo da venda concluida (ou reimpressao a
// partir do Historico), com impressao do cupom (QZ Tray -> navegador,
// Bluetooth opcional) e emissao de NFC-e quando a emissao fiscal esta ativa.
export default function ReciboModal({ venda, valorRecebido = 0, troco = 0, onFechar, modoReimpressao = false }) {
  const mostrarRecebidoTroco = Number(valorRecebido) > 0;
  const empresa = useConfiguracaoEmpresa();
  const novaVendaBtnRef = useRef(null);
  const [cfgImp, setCfgImp] = useState(null);
  const printDispatchedRef = useRef(false);

  // Carrega ConfiguracaoImpressora — usada para decidir auto-print, vias e
  // largura/conteudo do cupom. Cacheada (TTL 30s no helper).
  useEffect(() => {
    let ativo = true;
    obterConfigImpressora().then(c => { if (ativo) setCfgImp(c); });
    return () => { ativo = false; };
  }, []);

  // Auto-imprime ao abrir o recibo (apenas no fluxo de venda concluida —
  // reimpressao requer clique explicito). Respeita cfgImp.imprimirAutomatico
  // e cfgImp.imprimirVenda. Espera o cupom estar no DOM (paint) + imagens.
  useEffect(() => {
    if (printDispatchedRef.current) return;
    if (modoReimpressao) return;
    if (!cfgImp || !empresa) return;
    if (!devePrintar("VENDA", cfgImp)) return;
    if (!cfgImp.imprimirAutomatico) return;
    printDispatchedRef.current = true;
    const vias = Math.max(1, Number(cfgImp.viasVenda) || 1);
    let i = 0;
    const disparar = async () => {
      await imprimirUmaVia();
      i += 1;
      if (i < vias) setTimeout(disparar, 500);
    };
    // 2 RAFs + microtask para garantir paint e que o logo carregou.
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(disparar, 100)));
  }, [cfgImp, empresa, modoReimpressao]);

  // Foca o botão principal (Nova Venda no fluxo PDV; Fechar na reimpressão).
  // Tenta imediatamente e de novo apos ticks caso outro setTimeout(0) esteja
  // na fila — vence focarBusca() do parent quando vindo do PDV.
  useEffect(() => {
    novaVendaBtnRef.current?.focus();
    const t1 = setTimeout(() => novaVendaBtnRef.current?.focus(), 30);
    const t2 = setTimeout(() => novaVendaBtnRef.current?.focus(), 150);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Monta o cupom da venda em comandos ESC/POS — compartilhado entre o
  // agente QZ Tray e a impressao via Bluetooth (mesmo layout/bytes).
  function construirComandosVenda(): Uint8Array {
    const segmento = (getEmpresa()?.segmento) || "GERAL";
    const formaLabel = Array.isArray(venda.pagamentos) && venda.pagamentos.length === 1
      ? (venda.pagamentos[0].formaCustomNome || FORMA_LABEL[venda.pagamentos[0].forma] || venda.pagamentos[0].forma)
      : null;
    return gerarComandosPedido(
      {
        numero: venda.numero,
        createdAt: venda.createdAt,
        total: venda.total,
        desconto: venda.desconto,
        cliente: venda.cliente,
        user: venda.user,
        itens: venda.itens,
        observacoes: venda.observacoes,
        formaPagamentoLabel: formaLabel,
        valorRecebido,
        troco,
      },
      {
        nome: empresa?.nomeFantasia || empresa?.razaoSocial,
        cnpj: empresa?.cnpj,
        endereco: empresa ? formatarEndereco(empresa) : null,
        telefone: empresa?.telefone,
      },
      {
        larguraMm: cfgImp?.largura === "MM_58" ? 58 : 80,
        abrirGavetaDinheiro: cfgImp?.abrirGavetaDinheiro && (venda.formaPagamento === "DINHEIRO"),
        segmento: segmento as any,
        cortarPapel: true,
      },
    );
  }

  // Imprime UMA via do cupom: tenta o agente QZ Tray (se ligado neste PC) e,
  // em qualquer falha, cai no window.print() do navegador. Nunca lanca.
  async function imprimirUmaVia(): Promise<void> {
    if (qzAtivoEConfigurado()) {
      try {
        await imprimirRawQz(construirComandosVenda());
        return;
      } catch (err) {
        console.warn("[QZ] falhou, usando impressao do navegador:", err);
      }
    }
    window.print();
  }

  function imprimir() {
    imprimirUmaVia();
  }

  // ETAPA#8a: impressao termica via Web Bluetooth (impressora portatil
  // pareada). Layout muda conforme empresa.segmento (OEM em auto-pecas,
  // lote/validade em farmacia). Mostra o botao so se navegador suporta.
  const [imprimindoBT, setImprimindoBT] = useState(false);
  async function imprimirBT() {
    if (imprimindoBT) return;
    setImprimindoBT(true);
    try {
      await imprimirViaBluetooth(construirComandosVenda());
    } catch (err) {
      alert("Falha na impressao Bluetooth:\n" + (err as Error).message);
    } finally {
      setImprimindoBT(false);
    }
  }

  // ===== Emissao de NFC-e (modelo 65) =====
  // O botao so aparece quando a emissao fiscal esta ativa (Configuracoes >
  // Emissao Fiscal). Status guarda PENDENTE/AUTORIZADA/etc da nota da venda.
  const [fiscalAtivo, setFiscalAtivo] = useState(false);
  const [statusNfce, setStatusNfce] = useState(null);
  const [emitindoNfce, setEmitindoNfce] = useState(false);

  useEffect(() => {
    let ativo = true;
    api.obterConfigFiscal()
      .then((c: any) => { if (ativo) setFiscalAtivo(!!c?.fiscalAtivo); })
      .catch(() => {});
    return () => { ativo = false; };
  }, []);

  async function emitirNotaFiscal() {
    if (emitindoNfce || !venda?.id) return;
    setEmitindoNfce(true);
    try {
      const resp: any = await api.emitirNfce(venda.id);
      const nota = resp?.nota;
      setStatusNfce(nota?.status || null);
      if (nota?.status === "AUTORIZADA") {
        emitirToast({ tipo: "sucesso", titulo: "NFC-e autorizada", mensagem: `Nota ${nota.numeroFiscal} autorizada.` });
        try {
          await imprimirDanfeNfce(nota.id, { pagamentos: venda.pagamentos, troco });
        } catch { /* impressao e best-effort — a nota ja esta autorizada */ }
      } else if (nota?.status === "REJEITADA") {
        emitirToast({ tipo: "erro", titulo: "NFC-e rejeitada", mensagem: nota.xMotivo || "Verifique o cadastro fiscal.", duracao: 8000 });
      } else if (resp?.aviso) {
        emitirToast({ tipo: "aviso", titulo: "NFC-e pendente", mensagem: resp.aviso, duracao: 7000 });
      }
    } catch (err) {
      emitirToast({ tipo: "erro", titulo: "Falha ao emitir NFC-e", mensagem: (err as Error).message, duracao: 8000 });
    } finally {
      setEmitindoNfce(false);
    }
  }

  return (
    <>
      <style>{`
        .recibo-nova-venda:focus,
        .recibo-nova-venda:focus-visible {
          box-shadow: 0 0 0 3px var(--pdv-accent-glow), 0 6px 18px -6px var(--pdv-accent-glow), 0 1px 0 rgba(255,255,255,.2) inset;
          transform: translateY(-1px);
        }
      `}</style>

      <div onClick={onFechar} className="pdv-modal-bg">
        <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" className="pdv-modal" style={{ width: "min(500px, calc(100vw - 32px))", maxHeight: "calc(100vh - 24px)" }}>
          {!modoReimpressao ? (
            <div className="pdv-success" style={{ paddingBottom: 12 }}>
              <div className="pdv-success-mark">✓</div>
              <div className="pdv-success-title">Venda concluída</div>
              <div className="pdv-success-sub">
                {fmtBRL(venda.total)} via {
                  Array.isArray(venda.pagamentos) && venda.pagamentos.length > 1
                    ? `${venda.pagamentos.length} formas`
                    : (FORMA_LABEL[venda.pagamentos?.[0]?.forma || venda.formaPagamento] || venda.formaPagamento)
                } · #{venda.numero}
              </div>
            </div>
          ) : (
            <div className="pdv-modal-hd">
              <div>
                <div className="pdv-modal-title">Reimpressão de cupom</div>
                <div className="pdv-modal-sub">Venda #{venda.numero} · {fmtData(venda.createdAt)}</div>
              </div>
              <button type="button" onClick={onFechar} aria-label="Fechar" className="pdv-modal-x">×</button>
            </div>
          )}

          <div className="pdv-modal-body" style={{ paddingBottom: 6 }}>
            <div style={{
              background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
              borderRadius: 12, padding: 12, marginBottom: 10,
            }}>
              <div style={{ color: "var(--pdv-t3)", fontSize: 10.5, fontWeight: 500, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 6 }}>Itens</div>
              {venda.itens?.map((it, i) => (
                <div key={it.id} style={{
                  display: "flex", justifyContent: "space-between", padding: "6px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--pdv-line)", fontSize: 13,
                }}>
                  <div>
                    <div style={{ color: "var(--pdv-t1)", fontWeight: 500 }}>{it.produto?.nome}</div>
                    <div style={{ color: "var(--pdv-t3)", fontSize: 11.5, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                      {fmtQtd(it.quantidade)} × {fmtBRL(it.precoUnitario)}
                    </div>
                  </div>
                  <div style={{ color: "var(--pdv-t1)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(it.subtotal)}</div>
                </div>
              ))}
            </div>

            <div style={{
              background: "var(--pdv-surf-2)", border: "1px solid var(--pdv-line)",
              borderRadius: 12, padding: 12, marginBottom: 0,
            }}>
              {Array.isArray(venda.pagamentos) && venda.pagamentos.length > 1 ? (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ color: "var(--pdv-t3)", fontSize: 11, marginBottom: 6, fontWeight: 500 }}>
                    Pagamentos ({venda.pagamentos.length})
                  </div>
                  {venda.pagamentos.map(p => (
                    <div key={p.id} style={{
                      display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4,
                      paddingLeft: 10, borderLeft: `3px solid ${FORMA_COR_VAR[p.forma] || "var(--pdv-accent)"}`,
                    }}>
                      <span style={{ color: "var(--pdv-t2)" }}>
                        {p.formaCustomNome || FORMA_LABEL[p.forma] || p.forma}
                      </span>
                      <span style={{ color: "var(--pdv-t1)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                        {fmtBRL(p.valor)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: "var(--pdv-t3)" }}>Forma de pagamento</span>
                  <span style={{ color: "var(--pdv-t1)", fontWeight: 500 }}>
                    {venda.pagamentos?.[0]?.formaCustomNome
                      || FORMA_LABEL[venda.pagamentos?.[0]?.forma || venda.formaPagamento]
                      || venda.formaPagamento}
                  </span>
                </div>
              )}
              {Number(venda.desconto) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: "var(--pdv-t3)" }}>Desconto</span>
                  <span style={{ color: "var(--pdv-c-rose)", fontWeight: 500 }}>− {fmtBRL(venda.desconto)}</span>
                </div>
              )}
              {mostrarRecebidoTroco && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: "var(--pdv-t3)" }}>Valor recebido</span>
                    <span style={{ color: "var(--pdv-t1)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(valorRecebido)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: "var(--pdv-t3)" }}>Troco</span>
                    <span style={{ color: "var(--pdv-accent)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(troco)}</span>
                  </div>
                </>
              )}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--pdv-line-2)",
              }}>
                <span style={{ color: "var(--pdv-t3)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 500 }}>Total</span>
                <span style={{ color: "var(--pdv-accent)", fontSize: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{fmtBRL(venda.total)}</span>
              </div>
            </div>
          </div>

          {/* NFC-e: emissao fiscal (so quando ativa). Status fica visivel
              apos emitir; AUTORIZADA ja dispara a impressao do DANFE. */}
          {fiscalAtivo && venda?.id && (
            <div style={{ padding: "0 16px 8px", display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={emitirNotaFiscal}
                disabled={emitindoNfce || statusNfce === "AUTORIZADA"}
                className="pdv-btn-ghost"
                style={{ flex: 1, justifyContent: "center" }}
                title="Emitir Nota Fiscal de Consumidor eletronica (NFC-e)"
              >
                {statusNfce === "AUTORIZADA"
                  ? "✓ NFC-e autorizada"
                  : emitindoNfce ? "Emitindo NFC-e…" : "🧾 Emitir NFC-e"}
              </button>
              {statusNfce && statusNfce !== "AUTORIZADA" && (
                <span style={{ fontSize: 11, color: "var(--pdv-t3)" }}>{statusNfce}</span>
              )}
            </div>
          )}

          <div className="pdv-modal-foot">
            <button onClick={imprimir} className="pdv-btn-ghost" style={{ flex: 1, justifyContent: "center" }}>
              🖨️ Imprimir cupom
            </button>
            {/* ETAPA#8a: impressao direta via Bluetooth — so aparece se o
                navegador suporta Web Bluetooth (Chromium-based em HTTPS). */}
            {bluetoothDisponivel() && (
              <button
                onClick={imprimirBT}
                disabled={imprimindoBT}
                className="pdv-btn-ghost"
                style={{ justifyContent: "center", padding: "0 14px" }}
                title="Imprimir via impressora Bluetooth pareada (ESC/POS)"
              >
                {imprimindoBT ? "..." : "🔌 BT"}
              </button>
            )}
            <button
              ref={novaVendaBtnRef}
              onClick={onFechar}
              className="pdv-btn-finalize recibo-nova-venda"
              style={{ flex: 1 }}
            >
              {modoReimpressao ? "Fechar" : "Nova venda"}
              <span className="pdv-kbd">Enter</span>
            </button>
          </div>
        </div>
      </div>

      {/* Cupom oculto, visivel apenas na impressao — quando habilitado.
          Renderizado num portal no body (fora do #root) para que o
          @media print possa esconder o app inteiro com #root{display:none}
          sem matar o cupom — evitando paginas em branco. */}
      {cfgImp && devePrintar("VENDA", cfgImp) && createPortal(
        <CupomEnvelope cfg={cfgImp}>
          <CupomVenda
            venda={venda}
            empresa={empresa}
            cfg={cfgImp}
            valorRecebido={valorRecebido}
            troco={troco}
            modoReimpressao={modoReimpressao}
          />
        </CupomEnvelope>,
        document.body,
      )}
    </>
  );
}
