// @ts-nocheck — extraido verbatim de PDV.tsx no fatiamento (Fase 5).
// Abertura de caixa direto do PDV (sem sair para a tela Caixa), com
// sugestao de troco baseada no ultimo fechamento.
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useModalKeys } from "../lib/modalKeys";
import { fmtBRL } from "./comum";

export default function ModalAbrirCaixaPDV({ onCancelar, onSucesso }) {
  const [saldoInicial, setSaldoInicial] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [sugestao, setSugestao] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const saldoRef = useRef(null);
  useModalKeys(true, { onClose: () => !salvando && onCancelar() });

  useEffect(() => {
    api.sugerirTrocoCaixa()
      .then(r => { setSugestao(r); setSaldoInicial(String(r.sugestao ?? 0)); })
      .catch(() => setSaldoInicial("0"));
    setTimeout(() => saldoRef.current?.focus(), 80);
  }, []);

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    const valor = Number(String(saldoInicial).replace(",", "."));
    if (!Number.isFinite(valor) || valor < 0) { setErro("Saldo inicial inválido"); return; }
    setSalvando(true);
    try {
      await api.abrirCaixa({ saldoInicial: valor, observacoesAbertura: observacoes });
      onSucesso();
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <div className="pdv-modal-bg" onClick={() => !salvando && onCancelar()}>
      <div className="pdv-modal" style={{ width: "min(440px, calc(100vw - 32px))" }} onClick={e => e.stopPropagation()}>
        <div className="pdv-modal-hd">
          <div>
            <div className="pdv-modal-title">🟢 Abrir Caixa</div>
            <div className="pdv-modal-sub">Informe o saldo inicial em dinheiro (troco)</div>
          </div>
          <button type="button" onClick={onCancelar} disabled={salvando} className="pdv-modal-x">×</button>
        </div>

        <form onSubmit={salvar}>
          <div className="pdv-modal-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
            {sugestao?.origem && (
              <div style={{
                background: "color-mix(in oklab, var(--pdv-accent) 10%, transparent)",
                border: "1px solid color-mix(in oklab, var(--pdv-accent) 30%, transparent)",
                borderRadius: 10, padding: "10px 14px", marginBottom: 14,
                fontSize: 12.5, color: "var(--pdv-t2)", lineHeight: 1.5,
              }}>
                💡 Sugestão baseada no fechamento do caixa <b style={{ color: "var(--pdv-t1)" }}>#{sugestao.origem.caixaNumero}</b>:{" "}
                <b style={{ color: "var(--pdv-c-lime)" }}>{fmtBRL(sugestao.sugestao)}</b>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label className="pdv-field-label">Saldo Inicial (R$) *</label>
              <input
                ref={saldoRef}
                type="number" step="0.01" min="0"
                value={saldoInicial}
                onChange={e => setSaldoInicial(e.target.value)}
                className="pdv-field-input"
              />
            </div>
            <div style={{ marginBottom: 4 }}>
              <label className="pdv-field-label">Observações</label>
              <input
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                placeholder="Opcional"
                className="pdv-field-input"
              />
            </div>

            {erro && <div className="pdv-erro-inline" style={{ marginTop: 12 }}>{erro}</div>}
          </div>

          <div className="pdv-modal-foot">
            <button type="button" onClick={onCancelar} disabled={salvando} className="pdv-btn-ghost">
              Cancelar <span className="pdv-kbd is-warn">Esc</span>
            </button>
            <button type="submit" disabled={salvando} className="pdv-btn-finalize" style={{ flex: 1 }}>
              {salvando ? "Abrindo…" : "Abrir Caixa"}
              {!salvando && <span className="pdv-kbd">Enter</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
