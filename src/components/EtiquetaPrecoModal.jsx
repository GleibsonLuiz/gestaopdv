import { useState } from "react";
import { C } from "../lib/theme.js";
import EtiquetaPreco from "./EtiquetaPreco.jsx";

// Modal que mostra previa da etiqueta + botoes de copias e Imprimir.
// O CSS `@media print` (injetado abaixo) garante que apenas as etiquetas
// vao para a impressora, sem cabecalho/rodape do navegador e no tamanho
// fisico 60x40mm.
export default function EtiquetaPrecoModal({ produto, onFechar }) {
  const [copias, setCopias] = useState(1);

  if (!produto) return null;

  const qtd = Math.max(1, Math.min(100, Number(copias) || 1));
  const etiquetas = Array.from({ length: qtd }, (_, i) => i);

  return (
    <>
      <style>{cssEtiqueta}</style>

      <div
        className="etiqueta-overlay"
        onClick={onFechar}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.65)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20, zIndex: 200,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="etiqueta-modal"
          style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
            width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto",
            padding: 24, display: "flex", flexDirection: "column", gap: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: C.white, fontWeight: 700, fontSize: 18 }}>
              Imprimir Etiqueta
            </div>
            <button
              type="button"
              onClick={onFechar}
              style={{
                background: "transparent", border: "none",
                color: C.muted, fontSize: 20, cursor: "pointer",
              }}
            >×</button>
          </div>

          <div style={{ fontSize: 12, color: C.muted }}>
            Produto: <span style={{ color: C.text, fontWeight: 600 }}>{produto.nome}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 13, color: C.text }}>Cópias:</label>
            <input
              type="number"
              min={1}
              max={100}
              value={copias}
              onChange={(e) => setCopias(e.target.value)}
              style={{
                width: 80,
                background: C.surface, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 8,
                padding: "6px 10px", fontSize: 14,
              }}
            />
            <span style={{ fontSize: 11, color: C.muted }}>(máx. 100)</span>
          </div>

          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: 16,
            display: "flex", justifyContent: "center", alignItems: "center",
          }}>
            <EtiquetaPreco
              nomeProduto={produto.nome}
              precoVenda={produto.precoVenda}
              codigoBarras={produto.codigoBarras || produto.codigo}
              referencia={produto.referencia}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={onFechar}
              style={{
                background: C.surface, color: C.text,
                border: `1px solid ${C.border}`, borderRadius: 8,
                padding: "10px 16px", fontSize: 13, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              style={{
                background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
                color: C.white,
                border: "none", borderRadius: 8,
                padding: "10px 18px", fontSize: 13, fontWeight: 700,
                cursor: "pointer",
              }}
            >
              🖨️ Imprimir
            </button>
          </div>
        </div>
      </div>

      <div className="etiqueta-area-impressao" aria-hidden="true">
        {etiquetas.map((i) => (
          <EtiquetaPreco
            key={i}
            nomeProduto={produto.nome}
            precoVenda={produto.precoVenda}
            codigoBarras={produto.codigoBarras || produto.codigo}
            referencia={produto.referencia}
          />
        ))}
      </div>
    </>
  );
}

// CSS de impressao:
// - @page A4 com margem fina; etiquetas sao dispostas em grid de 3 colunas
//   de 60mm cada (3 x 60 = 180mm, cabe na largura util de A4 ~190mm).
// - O browser quebra a pagina sozinho quando as etiquetas excedem a altura
//   da folha; page-break-inside: avoid evita que uma etiqueta fique
//   partida no meio.
// - Em tela, a area-impressao fica escondida; ao imprimir, escondemos
//   TUDO exceto ela.
const cssEtiqueta = `
.etiqueta-area-impressao { display: none; }

@media print {
  @page {
    size: A4;
    margin: 5mm;
  }

  html, body {
    background: #ffffff !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  body * { visibility: hidden !important; }

  .etiqueta-area-impressao,
  .etiqueta-area-impressao * { visibility: visible !important; }

  .etiqueta-area-impressao {
    display: grid !important;
    grid-template-columns: repeat(3, 60mm);
    grid-auto-rows: 40mm;
    gap: 0;
    position: absolute;
    top: 0;
    left: 0;
  }

  .etiqueta-area-impressao .etiqueta-preco {
    border: none !important;
    page-break-inside: avoid;
    break-inside: avoid;
  }
}
`;
