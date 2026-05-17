import { useState } from "react";
import { C } from "../lib/theme";
import EtiquetaPreco from "./EtiquetaPreco";

interface ProdutoParaEtiqueta {
  nome: string;
  precoVenda?: number | string | null;
  codigoBarras?: string | null;
  referencia?: string | null;
  codigo?: string | null;
}

interface EtiquetaPrecoModalProps {
  produto: ProdutoParaEtiqueta | null;
  onFechar: () => void;
}

// Modal que mostra previa da etiqueta + botoes de copias e Imprimir.
// O CSS `@media print` (injetado abaixo) garante que apenas as etiquetas
// vao para a impressora, sem cabecalho/rodape do navegador e no tamanho
// fisico 60x40mm.
export default function EtiquetaPrecoModal({ produto, onFechar }: EtiquetaPrecoModalProps) {
  const [copias, setCopias] = useState<number | string>(1);

  if (!produto) return null;

  const qtd = Math.max(1, Math.min(100, Number(copias) || 1));
  const etiquetas = Array.from({ length: qtd }, (_, i) => i);

  return (
    <>
      <style>{cssEtiqueta}</style>

      <div
        className="etiqueta-overlay fixed inset-0 flex items-center justify-center p-5"
        onClick={onFechar}
        style={{ background: "rgba(0,0,0,0.65)", zIndex: 200 }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="etiqueta-modal bg-gp-card rounded-[14px] w-full max-w-[560px] max-h-[92vh] overflow-y-auto p-6 flex flex-col gap-4"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex justify-between items-center">
            <div className="text-gp-white font-bold text-lg">Imprimir Etiqueta</div>
            <button
              type="button"
              onClick={onFechar}
              className="bg-transparent border-none text-gp-muted text-xl cursor-pointer"
            >
              ×
            </button>
          </div>

          <div className="text-xs text-gp-muted">
            Produto: <span className="text-gp-text font-semibold">{produto.nome}</span>
          </div>

          <div className="flex items-center gap-[10px]">
            <label className="text-[13px] text-gp-text">Cópias:</label>
            <input
              type="number"
              min={1}
              max={100}
              value={copias}
              onChange={(e) => setCopias(e.target.value)}
              className="w-20 bg-gp-surface text-gp-text rounded-lg px-[10px] py-[6px] text-sm"
              style={{ border: `1px solid ${C.border}` }}
            />
            <span className="text-[11px] text-gp-muted">(máx. 100)</span>
          </div>

          <div className="bg-gp-surface rounded-[10px] p-4 flex justify-center items-center" style={{ border: `1px solid ${C.border}` }}>
            <EtiquetaPreco
              nomeProduto={produto.nome}
              precoVenda={produto.precoVenda}
              codigoBarras={produto.codigoBarras || produto.codigo}
              referencia={produto.referencia}
              codigo={produto.codigo}
            />
          </div>

          <div className="flex justify-end gap-[10px]">
            <button
              type="button"
              onClick={onFechar}
              className="bg-gp-surface text-gp-text rounded-lg px-4 py-[10px] text-[13px] font-semibold cursor-pointer"
              style={{ border: `1px solid ${C.border}` }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="text-gp-white border-none rounded-lg px-[18px] py-[10px] text-[13px] font-bold cursor-pointer"
              style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.purple})` }}
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
            codigo={produto.codigo}
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
    border: 0.2mm solid #000 !important;
    border-radius: 0 !important;
    page-break-inside: avoid;
    break-inside: avoid;
  }
}
`;
