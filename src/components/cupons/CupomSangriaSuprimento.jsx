import CupomCabecalho from "./CupomCabecalho.jsx";
import CupomRodape from "./CupomRodape.jsx";
import { fmtBRL, fmtData } from "./fmt.js";

// Comprovante de sangria (saida) ou suprimento (entrada) de dinheiro do
// caixa. Recebe a movimentacao retornada pelo backend.

export default function CupomSangriaSuprimento({ movimentacao, caixa, operador, empresa, cfg }) {
  const ehSangria = movimentacao?.tipo === "SANGRIA";
  const titulo = ehSangria ? "SANGRIA DE CAIXA" : "SUPRIMENTO DE CAIXA";
  const subtitulo = ehSangria ? "Saída de dinheiro" : "Entrada de dinheiro";

  return (
    <>
      <CupomCabecalho empresa={empresa} cfg={cfg} />
      <hr className="cupom-divisor" />
      <div className="cupom-centro cupom-bold">{titulo}</div>
      <div className="cupom-centro cupom-mini">{subtitulo}</div>
      <hr className="cupom-divisor" />
      {caixa?.numero != null && <div>Caixa: <span className="cupom-bold">#{caixa.numero}</span></div>}
      <div>Data: {fmtData(movimentacao?.createdAt || new Date().toISOString())}</div>
      {cfg?.mostrarVendedor !== false && operador?.nome && (
        <div>Operador: {operador.nome}</div>
      )}
      <hr className="cupom-divisor" />
      <div className="cupom-linha cupom-grande">
        <span>{ehSangria ? "VALOR RETIRADO:" : "VALOR ADICIONADO:"}</span>
        <span>{ehSangria ? "− " : "+ "}{fmtBRL(movimentacao?.valor)}</span>
      </div>
      <hr className="cupom-divisor" />
      {movimentacao?.saldoAntes != null && (
        <div className="cupom-linha">
          <span>Saldo antes:</span>
          <span>{fmtBRL(movimentacao.saldoAntes)}</span>
        </div>
      )}
      {movimentacao?.saldoDepois != null && (
        <div className="cupom-linha cupom-bold">
          <span>Saldo depois:</span>
          <span>{fmtBRL(movimentacao.saldoDepois)}</span>
        </div>
      )}
      {movimentacao?.descricao && (
        <>
          <hr className="cupom-divisor" />
          <div>Motivo: {movimentacao.descricao}</div>
        </>
      )}
      <hr className="cupom-divisor" />
      <div style={{ marginTop: 12 }}>Assinatura do operador:</div>
      <div style={{ marginTop: 28 }}>____________________________</div>
      <CupomRodape cfg={cfg} mensagemPadrao="" />
    </>
  );
}
