import CupomCabecalho from "./CupomCabecalho";
import CupomRodape from "./CupomRodape";
import { fmtBRL, fmtData } from "./fmt";
import type { EmpresaCupom, CfgCupom } from "./CupomCabecalho";

// Comprovante de fechamento de caixa. Recebe o caixa fechado retornado
// pelo backend (com totais embutidos) + a conferencia revelada
// (esperado/contado/diferenca/trocoProximoDia).
//
// "Conferencia cega": o backend so revela o saldo esperado apos o POST.
// Imprimimos os 4 numeros lado a lado pra fechar com clareza.

type Totais = {
  totalSuprimentos?: number | string | null;
  totalVendasDinheiro?: number | string | null;
  totalReceberDinheiro?: number | string | null;
  totalSangrias?: number | string | null;
  totalPagarDinheiro?: number | string | null;
  totalVendasOutras?: number | string | null;
  porForma?: Array<{ forma: string; total: number | string }> | null;
};

type Caixa = {
  numero?: number | null;
  abertoEm?: string | Date | null;
  fechadoEm?: string | Date | null;
  saldoInicial?: number | string | null;
  totais?: Totais | null;
  observacoesFechamento?: string | null;
};

type Conferencia = {
  contado?: number | string | null;
  esperado?: number | string | null;
  diferenca?: number | string | null;
  troco?: number | string | null;
};

type Operador = { nome?: string | null };

type Props = {
  caixa: Caixa | null | undefined;
  conferencia: Conferencia | null | undefined;
  operador?: Operador | null;
  empresa: EmpresaCupom;
  cfg: CfgCupom;
};

function Linha({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`cupom-linha${destaque ? " cupom-bold" : ""}`}>
      <span>{label}</span>
      <span>{valor}</span>
    </div>
  );
}

export default function CupomFechamentoCaixa({
  caixa,
  conferencia,
  operador,
  empresa,
  cfg,
}: Props) {
  const t: Totais = caixa?.totais || {};
  const dif = Number(conferencia?.diferenca ?? 0);
  const statusDif = dif === 0 ? "SEM DIFERENCA" : dif > 0 ? "SOBRA" : "QUEBRA";

  return (
    <>
      <CupomCabecalho empresa={empresa} cfg={cfg} />
      <hr className="cupom-divisor" />
      <div className="cupom-centro cupom-bold">FECHAMENTO DE CAIXA</div>
      <div className="cupom-centro cupom-mini">** NÃO É DOCUMENTO FISCAL **</div>
      <hr className="cupom-divisor" />
      {caixa?.numero != null && <div>Caixa: <span className="cupom-bold">#{caixa.numero}</span></div>}
      {caixa?.abertoEm && <div>Aberto em: {fmtData(caixa.abertoEm)}</div>}
      {caixa?.fechadoEm && <div>Fechado em: {fmtData(caixa.fechadoEm)}</div>}
      {cfg?.mostrarVendedor !== false && operador?.nome && (
        <div>Operador: {operador.nome}</div>
      )}
      <hr className="cupom-divisor" />

      <div className="cupom-bold">MOVIMENTO</div>
      <Linha label="Saldo inicial:" valor={fmtBRL(caixa?.saldoInicial)} />
      {t.totalSuprimentos != null && <Linha label="(+) Suprimentos:" valor={fmtBRL(t.totalSuprimentos)} />}
      {t.totalVendasDinheiro != null && <Linha label="(+) Vendas (dinheiro):" valor={fmtBRL(t.totalVendasDinheiro)} />}
      {t.totalReceberDinheiro != null && <Linha label="(+) Recebimentos:" valor={fmtBRL(t.totalReceberDinheiro)} />}
      {t.totalSangrias != null && <Linha label="(−) Sangrias:" valor={fmtBRL(t.totalSangrias)} />}
      {t.totalPagarDinheiro != null && <Linha label="(−) Pagamentos:" valor={fmtBRL(t.totalPagarDinheiro)} />}
      <hr className="cupom-divisor" />

      <div className="cupom-bold">CONFERENCIA</div>
      <Linha label="Saldo esperado:" valor={fmtBRL(conferencia?.esperado)} />
      <Linha label="Saldo contado:" valor={fmtBRL(conferencia?.contado)} destaque />
      <Linha
        label={statusDif + ":"}
        valor={(dif > 0 ? "+ " : "") + fmtBRL(dif)}
        destaque
      />
      <hr className="cupom-divisor" />

      {conferencia?.troco != null && Number(conferencia.troco) > 0 && (
        <>
          <Linha label="Troco proximo dia:" valor={fmtBRL(conferencia.troco)} />
          <hr className="cupom-divisor" />
        </>
      )}

      {caixa?.observacoesFechamento && (
        <>
          <div>Obs: {caixa.observacoesFechamento}</div>
          <hr className="cupom-divisor" />
        </>
      )}

      {t.totalVendasOutras != null && Number(t.totalVendasOutras) > 0 && (
        <>
          <div className="cupom-bold">VENDAS POR FORMA</div>
          {t.porForma?.map(f => (
            <Linha key={f.forma} label={f.forma + ":"} valor={fmtBRL(f.total)} />
          ))}
          <hr className="cupom-divisor" />
        </>
      )}

      <div style={{ marginTop: 12 }}>Assinatura do responsavel:</div>
      <div style={{ marginTop: 28 }}>____________________________</div>
      <CupomRodape cfg={cfg} mensagemPadrao="" />
    </>
  );
}
