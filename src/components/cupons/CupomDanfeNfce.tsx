import CupomCabecalho from "./CupomCabecalho";
import type { EmpresaCupom, CfgCupom } from "./CupomCabecalho";
import { fmtBRL, fmtData, fmtQtd, FORMA_LABEL } from "./fmt";
import type { FormaPagamento } from "./fmt";

// DANFE NFC-e (modelo 65) — Documento Auxiliar da NFC-e, layout do
// "Manual de Especificacoes Tecnicas do DANFE NFC-e e QR Code v6.0".
// Divisoes: I cabecalho, II itens, III totais, IV chave de acesso,
// V QR Code, VI consumidor, VII identificacao+protocolo, VIII mensagem
// fiscal, IX mensagem do contribuinte.
//
// Apresentacional puro: o QR Code ja vem como data URL (gerado antes de
// imprimir, em lib/danfeNfce.ts), garantindo que a imagem esteja pronta
// quando o imprimirDocumento() dispara o print.

export type ItemDanfe = {
  numeroItem: number;
  codigo?: string | null;
  descricao: string;
  quantidade: number | string;
  unidade?: string | null;
  valorUnitario: number | string;
  valorTotal: number | string;
};

export type PagamentoDanfe = {
  forma: FormaPagamento | string;
  valor: number | string;
  formaCustomNome?: string | null;
};

export type NotaFiscalDanfe = {
  serie: number;
  numeroFiscal: number;
  status: string;
  ambiente: "HOMOLOGACAO" | "PRODUCAO" | string;
  tipoEmissao?: string | null;
  chaveAcesso?: string | null;
  protocolo?: string | null;
  dataAutorizacao?: string | Date | null;
  urlConsulta?: string | null;
  valorTotal: number | string;
  destCpfCnpj?: string | null;
  destNome?: string | null;
  createdAt?: string | Date | null;
  itens?: ItemDanfe[] | null;
};

type Props = {
  nota: NotaFiscalDanfe;
  empresa: EmpresaCupom;
  cfg: CfgCupom;
  qrCodeDataUrl?: string | null;
  pagamentos?: PagamentoDanfe[] | null;
  troco?: number | string;
};

// Formata a chave de acesso (44 digitos) em 11 blocos de 4.
function formatarChave(chave?: string | null): string {
  if (!chave) return "";
  return (chave.match(/.{1,4}/g) || []).join(" ");
}

const labelForma = (f: FormaPagamento | string) =>
  f && f in FORMA_LABEL ? FORMA_LABEL[f as FormaPagamento] : String(f);

export default function CupomDanfeNfce({ nota, empresa, cfg, qrCodeDataUrl, pagamentos, troco = 0 }: Props) {
  const ehHomologacao = nota.ambiente === "HOMOLOGACAO";
  const ehContingencia = nota.tipoEmissao === "CONTINGENCIA_OFFLINE";
  const autorizada = nota.status === "AUTORIZADA";
  const qtdeItens = nota.itens?.length || 0;

  return (
    <>
      {/* Divisao I — Cabecalho do emitente */}
      <CupomCabecalho empresa={empresa} cfg={cfg} />
      <div className="cupom-centro cupom-mini">
        Documento Auxiliar da Nota Fiscal de Consumidor Eletronica
      </div>
      <hr className="cupom-divisor" />

      {/* Divisao VIII (topo) — aviso de homologacao / contingencia */}
      {ehHomologacao && (
        <div className="cupom-centro cupom-bold" style={{ marginBottom: 4 }}>
          EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL
        </div>
      )}
      {ehContingencia && (
        <div className="cupom-centro cupom-bold" style={{ marginBottom: 4 }}>
          EMITIDA EM CONTINGENCIA<br />Pendente de autorizacao
        </div>
      )}

      {/* Divisao II — Itens */}
      <div className="cupom-linha cupom-bold">
        <span>COD / DESCRICAO</span>
        <span>VL TOTAL</span>
      </div>
      <hr className="cupom-divisor" />
      {nota.itens?.map((it) => (
        <div key={it.numeroItem} style={{ marginBottom: 3 }}>
          <div>{it.codigo} {it.descricao}</div>
          <div className="cupom-linha">
            <span>{fmtQtd(it.quantidade)} {it.unidade || "UN"} x {fmtBRL(it.valorUnitario)}</span>
            <span>{fmtBRL(it.valorTotal)}</span>
          </div>
        </div>
      ))}
      <hr className="cupom-divisor" />

      {/* Divisao III — Totais e pagamento */}
      <div className="cupom-linha">
        <span>Qtde. total de itens</span>
        <span>{qtdeItens}</span>
      </div>
      <div className="cupom-linha cupom-grande">
        <span>VALOR TOTAL R$</span>
        <span>{fmtBRL(nota.valorTotal)}</span>
      </div>
      {pagamentos && pagamentos.length > 0 ? (
        pagamentos.map((p, i) => (
          <div key={i} className="cupom-linha">
            <span>{p.formaCustomNome || labelForma(p.forma)}</span>
            <span>{fmtBRL(p.valor)}</span>
          </div>
        ))
      ) : (
        <div className="cupom-linha">
          <span>Valor pago</span>
          <span>{fmtBRL(nota.valorTotal)}</span>
        </div>
      )}
      {Number(troco) > 0 && (
        <div className="cupom-linha">
          <span>Troco R$</span>
          <span>{fmtBRL(troco)}</span>
        </div>
      )}
      <hr className="cupom-divisor" />

      {/* Divisao VI — Consumidor */}
      <div className="cupom-centro">
        {nota.destCpfCnpj
          ? `CONSUMIDOR ${(nota.destCpfCnpj.replace(/\D/g, "").length === 14) ? "CNPJ" : "CPF"}: ${nota.destCpfCnpj}`
          : "CONSUMIDOR NAO IDENTIFICADO"}
      </div>
      {nota.destNome && !ehHomologacao && (
        <div className="cupom-centro cupom-mini">{nota.destNome}</div>
      )}
      <hr className="cupom-divisor" />

      {/* Divisao VII — Identificacao da NFC-e + protocolo */}
      <div className="cupom-centro cupom-mini">
        NFC-e n {nota.numeroFiscal} Serie {nota.serie} — {fmtData(nota.createdAt)}
      </div>
      {autorizada && nota.protocolo && (
        <div className="cupom-centro cupom-mini">
          Protocolo de autorizacao: {nota.protocolo}
          {nota.dataAutorizacao ? ` ${fmtData(nota.dataAutorizacao)}` : ""}
        </div>
      )}

      {/* Divisao IV — Consulta pela chave de acesso */}
      {nota.chaveAcesso && (
        <>
          <hr className="cupom-divisor" />
          <div className="cupom-centro cupom-mini">Consulte pela Chave de Acesso em:</div>
          {nota.urlConsulta && (
            <div className="cupom-centro cupom-mini" style={{ wordBreak: "break-all" }}>{nota.urlConsulta}</div>
          )}
          <div className="cupom-centro cupom-mini" style={{ wordBreak: "break-all", marginTop: 2 }}>
            {formatarChave(nota.chaveAcesso)}
          </div>
        </>
      )}

      {/* Divisao V — QR Code */}
      {qrCodeDataUrl && (
        <div className="cupom-centro" style={{ marginTop: 6 }}>
          <img
            src={qrCodeDataUrl}
            alt="QR Code NFC-e"
            style={{ width: "25mm", height: "25mm", imageRendering: "pixelated" }}
          />
        </div>
      )}

      <hr className="cupom-divisor" />
      {/* Divisao VIII (rodape) — reforco do aviso de homologacao */}
      {ehHomologacao && (
        <div className="cupom-centro cupom-mini cupom-bold">
          SEM VALOR FISCAL (HOMOLOGACAO)
        </div>
      )}
    </>
  );
}
