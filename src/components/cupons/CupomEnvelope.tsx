import type { ReactNode } from "react";
import { paginaDeLargura, larguraEmTela } from "../../lib/impressora";
import type { CfgCupom } from "./CupomCabecalho";

// Wrapper de impressao. Aplica:
//   - @media print: isola .cupom-imprimivel (esconde o resto da tela)
//   - @page: tamanho conforme ConfiguracaoImpressora.largura
//   - Estilos base do cupom (font monoespacada, divisor pontilhado, etc)
//
// Usado em DOIS modos:
//   1. INLINE — dentro de uma modal aberta, o cupom ja esta no DOM oculto.
//      Basta chamar window.print() (PDV.ReciboModal faz isso).
//   2. PORTAL — via imprimirDocumento() do lib/impressora.ts, monta este
//      componente num container temporario, espera paint, dispara print().
//
// O conteudo concreto (CupomVenda, CupomSangria, etc) vem como children.

type Props = {
  cfg: CfgCupom;
  children?: ReactNode;
  preview?: boolean;
};

export default function CupomEnvelope({ cfg, children, preview = false }: Props) {
  const largura = cfg?.largura || "MM_80";
  const fonte = cfg?.fonteBase || 12;
  const margem = cfg?.margemMm ?? 4;
  const paginaCss = paginaDeLargura(largura);
  const larguraTela = larguraEmTela(largura);

  // Modo preview: cupom visivel na tela (sem position off-screen) — usado
  // pela tela de configuracao para mostrar como vai sair. Mantemos o CSS de
  // print mesmo no preview pra a regra "esconder o resto da pagina" ser
  // herdada caso o usuario imprima a tela.
  const posCss = preview
    ? "position: relative; left: 0; top: 0; box-shadow: 0 4px 16px rgba(0,0,0,.18); border: 1px solid #ddd;"
    : "position: absolute; left: -9999px; top: -9999px;";

  return (
    <>
      <style>{`
        @media print {
          @page { size: ${paginaCss}; margin: ${margem}mm; }
          body * { visibility: hidden !important; }
          .cupom-imprimivel, .cupom-imprimivel * { visibility: visible !important; }
          .cupom-imprimivel {
            position: absolute !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            border: 0 !important;
          }
        }
        .cupom-imprimivel {
          ${posCss}
          width: ${larguraTela};
          background: white;
          color: black;
          font-family: 'Courier New', Courier, monospace;
          font-size: ${fonte}px;
          line-height: 1.4;
          padding: 8px 6px;
        }
        .cupom-imprimivel .cupom-divisor {
          border: 0;
          border-top: 1px dashed #000;
          margin: 6px 0;
        }
        .cupom-imprimivel .cupom-linha {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }
        .cupom-imprimivel .cupom-centro { text-align: center; }
        .cupom-imprimivel .cupom-bold { font-weight: 700; }
        .cupom-imprimivel .cupom-grande { font-size: ${fonte + 2}px; font-weight: 700; }
        .cupom-imprimivel .cupom-mini { font-size: ${Math.max(8, fonte - 2)}px; }
      `}</style>

      <div className="cupom-imprimivel" aria-hidden="true">
        {children}
      </div>
    </>
  );
}
