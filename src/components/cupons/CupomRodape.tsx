import type { CSSProperties } from "react";
import type { CfgCupom } from "./CupomCabecalho";

// Rodape padrao do cupom: rodapeExtra (linhas livres) + N linhas em branco
// para o operador conseguir destacar o papel. Aparece em TODOS os templates.

type Props = {
  cfg: CfgCupom;
  mensagemPadrao?: string;
};

export default function CupomRodape({ cfg, mensagemPadrao = "" }: Props) {
  const linhas = (cfg?.rodapeExtra || "").split("\n").map(s => s.trim()).filter(Boolean);
  const linhasFinal = Math.max(0, Number(cfg?.cortarLinhasFinal ?? 4));

  return (
    <>
      {linhas.length === 0 && mensagemPadrao && (
        <div className="cupom-centro" style={{ marginTop: 6 }}>{mensagemPadrao}</div>
      )}
      {linhas.map((l, i) => (
        <div
          key={i}
          className="cupom-centro"
          style={i === 0 ? ({ marginTop: 6 } as CSSProperties) : undefined}
        >
          {l}
        </div>
      ))}
      <div className="cupom-centro cupom-mini" style={{ marginTop: 4 }}>
        {new Date().toLocaleString("pt-BR")}
      </div>
      {Array.from({ length: linhasFinal }).map((_, i) => (
        <div key={`f${i}`}>&nbsp;</div>
      ))}
    </>
  );
}
