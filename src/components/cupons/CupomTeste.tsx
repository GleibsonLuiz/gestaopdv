import CupomCabecalho from "./CupomCabecalho";
import CupomRodape from "./CupomRodape";
import type { EmpresaCupom, CfgCupom } from "./CupomCabecalho";

// Cupom de teste — exercita cabecalho, divisores, alinhamentos, fonte
// grande/normal e rodape. Usado pelo botao "Imprimir cupom de teste" da
// tela de Configuracao da Impressora.

type Props = {
  empresa: EmpresaCupom;
  cfg: CfgCupom;
};

export default function CupomTeste({ empresa, cfg }: Props) {
  return (
    <>
      <CupomCabecalho empresa={empresa} cfg={cfg} />
      <hr className="cupom-divisor" />
      <div className="cupom-centro cupom-bold">CUPOM DE TESTE</div>
      <div className="cupom-centro cupom-mini">** NÃO É DOCUMENTO FISCAL **</div>
      <hr className="cupom-divisor" />
      <div>Largura configurada: <span className="cupom-bold">{cfg?.largura || "MM_80"}</span></div>
      <div>Fonte base: <span className="cupom-bold">{cfg?.fonteBase || 12}px</span></div>
      <div>Margem: <span className="cupom-bold">{cfg?.margemMm ?? 4}mm</span></div>
      <hr className="cupom-divisor" />
      <div className="cupom-linha cupom-bold">
        <span>ITEM</span>
        <span>VALOR</span>
      </div>
      <hr className="cupom-divisor" />
      <div style={{ marginBottom: 4 }}>
        <div>001 PRODUTO TESTE 1</div>
        <div className="cupom-linha"><span>1 UN x R$ 10,00</span><span>R$ 10,00</span></div>
      </div>
      <div style={{ marginBottom: 4 }}>
        <div>002 PRODUTO TESTE 2 NOME LONGO</div>
        <div className="cupom-linha"><span>2 UN x R$ 5,50</span><span>R$ 11,00</span></div>
      </div>
      <hr className="cupom-divisor" />
      <div className="cupom-linha cupom-grande">
        <span>TOTAL:</span>
        <span>R$ 21,00</span>
      </div>
      <hr className="cupom-divisor" />
      <CupomRodape cfg={cfg} mensagemPadrao="TESTE DE IMPRESSAO — OK" />
    </>
  );
}
