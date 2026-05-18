import CupomCabecalho from "./CupomCabecalho";
import CupomRodape from "./CupomRodape";
import { fmtBRL, fmtData, FORMA_LABEL } from "./fmt";
import type { FormaPagamento } from "./fmt";
import type { EmpresaCupom, CfgCupom } from "./CupomCabecalho";

// Recibo de pagamento (PAGAR) ou recebimento (RECEBER). Modelo brasileiro
// classico: "Recebemos de X a importancia de Y referente a...".

type Contraparte = {
  nome?: string | null;
  cpfCnpj?: string | null;
};

type Conta = {
  titulo?: string | null;
  descricao?: string | null;
  valor?: number | string | null;
  valorPago?: number | string | null;
  vencimento?: string | Date | null;
  dataPagamento?: string | Date | null;
  formaPagamento?: FormaPagamento | string | null;
  fornecedor?: Contraparte | null;
  fornecedorNome?: string | null;
  fornecedorCpfCnpj?: string | null;
  cliente?: Contraparte | null;
  clienteNome?: string | null;
  clienteCpfCnpj?: string | null;
  numero?: number | string | null;
  observacoes?: string | null;
};

type Operador = { nome?: string | null };

type Props = {
  tipo: "PAGAR" | "RECEBER";
  conta: Conta | null | undefined;
  operador?: Operador | null;
  empresa: EmpresaCupom;
  cfg: CfgCupom;
};

export default function CupomReciboFinanceiro({ tipo, conta, operador, empresa, cfg }: Props) {
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
  const forma = conta?.formaPagamento;
  const formaLabel = forma && forma in FORMA_LABEL
    ? FORMA_LABEL[forma as FormaPagamento]
    : forma;

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
      {forma && (
        <div className="cupom-linha">
          <span>Forma:</span>
          <span>{formaLabel}</span>
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
