import CupomCabecalho from "./CupomCabecalho.jsx";
import CupomRodape from "./CupomRodape.jsx";
import { fmtBRL, fmtData, FORMA_LABEL } from "./fmt.js";

// Recibo de pagamento (PAGAR) ou recebimento (RECEBER). Modelo brasileiro
// classico: "Recebemos de X a importancia de Y referente a...".
//
// Props:
//   tipo: "PAGAR" | "RECEBER"
//   conta: { titulo, valor, vencimento, dataPagamento, formaPagamento,
//            fornecedor?, cliente?, numero, observacoes }

export default function CupomReciboFinanceiro({ tipo, conta, operador, empresa, cfg }) {
  const ehReceber = tipo === "RECEBER";
  const titulo = ehReceber ? "RECIBO DE PAGAMENTO" : "COMPROVANTE DE PAGAMENTO";
  const acao = ehReceber ? "Recebemos de" : "Pagamos a";
  const contraparte = ehReceber
    ? (conta?.cliente?.nome || conta?.clienteNome)
    : (conta?.fornecedor?.nome || conta?.fornecedorNome);
  const documento = ehReceber
    ? (conta?.cliente?.cpfCnpj || conta?.clienteCpfCnpj)
    : (conta?.fornecedor?.cpfCnpj || conta?.fornecedorCpfCnpj);
  const valor = Number(conta?.valorPago ?? conta?.valor) || 0;

  return (
    <>
      <CupomCabecalho empresa={empresa} cfg={cfg} />
      <hr className="cupom-divisor" />
      <div className="cupom-centro cupom-bold">{titulo}</div>
      <div className="cupom-centro cupom-mini">** NÃO É DOCUMENTO FISCAL **</div>
      <hr className="cupom-divisor" />
      <div>{acao}: <span className="cupom-bold">{contraparte || "—"}</span></div>
      {documento && <div>CPF/CNPJ: {documento}</div>}
      <hr className="cupom-divisor" />
      <div>A importancia de:</div>
      <div className="cupom-grande cupom-centro" style={{ marginTop: 6, marginBottom: 6 }}>
        {fmtBRL(valor)}
      </div>
      <hr className="cupom-divisor" />
      <div>Referente a:</div>
      <div className="cupom-bold">{conta?.titulo || conta?.descricao || "—"}</div>
      {conta?.numero != null && <div className="cupom-mini">Documento #{conta.numero}</div>}
      <hr className="cupom-divisor" />
      <div className="cupom-linha">
        <span>Vencimento:</span>
        <span>{conta?.vencimento ? fmtData(conta.vencimento) : "—"}</span>
      </div>
      <div className="cupom-linha">
        <span>Pagamento:</span>
        <span>{conta?.dataPagamento ? fmtData(conta.dataPagamento) : fmtData(new Date().toISOString())}</span>
      </div>
      {conta?.formaPagamento && (
        <div className="cupom-linha">
          <span>Forma:</span>
          <span>{FORMA_LABEL[conta.formaPagamento] || conta.formaPagamento}</span>
        </div>
      )}
      {cfg?.mostrarVendedor !== false && operador?.nome && (
        <div className="cupom-linha">
          <span>Operador:</span>
          <span>{operador.nome}</span>
        </div>
      )}
      {conta?.observacoes && (
        <>
          <hr className="cupom-divisor" />
          <div>Obs: {conta.observacoes}</div>
        </>
      )}
      <hr className="cupom-divisor" />
      <div style={{ marginTop: 14 }}>
        {ehReceber ? "Para clareza, firmamos o presente recibo." : "Damos quitacao ao valor acima."}
      </div>
      <div style={{ marginTop: 28 }}>____________________________</div>
      <div className="cupom-centro cupom-mini">
        {ehReceber ? (empresa?.razaoSocial || empresa?.nomeFantasia || "Emitente") : (contraparte || "Recebedor")}
      </div>
      <CupomRodape cfg={cfg} mensagemPadrao="" />
    </>
  );
}
