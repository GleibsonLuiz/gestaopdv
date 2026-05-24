import CupomCabecalho from "./CupomCabecalho";
import CupomRodape from "./CupomRodape";
import { fmtBRL, fmtData, fmtQtd, FORMA_LABEL } from "./fmt";
import type { FormaPagamento } from "./fmt";
import type { EmpresaCupom, CfgCupom } from "./CupomCabecalho";

// Conteudo do cupom de venda. Substitui o markup inline que ficava dentro
// de PDV.ReciboModal. Pode ser usado:
//   - INLINE no ReciboModal (cupom ja no DOM, basta window.print())
//   - PORTAL via imprimirDocumento() para reimpressao programatica
//
// Respeita flags da ConfiguracaoImpressora: mostrarVendedor, mostrarCliente.

type ProdutoItem = {
  codigo?: string | number | null;
  nome?: string | null;
  unidade?: string | null;
  // ETAPA#8a: campos extras por segmento (auto-pecas: OEM/marca/compat;
  // farmacia: lote/validade). Vem do JSON Produto.camposSegmento.
  camposSegmento?: {
    codigoOEM?: string;
    marcaPeca?: string;
    compatibilidade?: string[];
    lote?: string;
    validade?: string;
    registroAnvisa?: string;
    pmc?: number;
  } | null;
};

type ItemVenda = {
  id: string | number;
  quantidade: number | string;
  precoUnitario: number | string;
  subtotal: number | string;
  produto?: ProdutoItem | null;
};

type Cliente = { nome?: string | null; cpfCnpj?: string | null };
type Usuario = { nome?: string | null };

type PagamentoCupom = {
  id?: string | number;
  forma: FormaPagamento | string;
  valor: number | string;
  formaCustomNome?: string | null;
  ordem?: number;
};

export type VendaCupom = {
  numero: number | string;
  createdAt: string | Date;
  total: number | string;
  desconto?: number | string | null;
  formaPagamento?: FormaPagamento | string | null;
  pagamentos?: PagamentoCupom[] | null;
  observacoes?: string | null;
  cliente?: Cliente | null;
  user?: Usuario | null;
  itens?: ItemVenda[] | null;
};

type Props = {
  venda: VendaCupom;
  empresa: EmpresaCupom;
  cfg: CfgCupom;
  valorRecebido?: number | string;
  troco?: number | string;
  modoReimpressao?: boolean;
};

export default function CupomVenda({
  venda,
  empresa,
  cfg,
  valorRecebido = 0,
  troco = 0,
  modoReimpressao = false,
}: Props) {
  const subtotalCupom = Number(venda.total) + Number(venda.desconto || 0);
  const mostrarRecebidoTroco = Number(valorRecebido) > 0;
  const pagamentos = Array.isArray(venda.pagamentos) && venda.pagamentos.length > 0
    ? venda.pagamentos
    : (venda.formaPagamento
        ? [{ forma: venda.formaPagamento as FormaPagamento, valor: venda.total }]
        : []);
  const labelForma = (f: FormaPagamento | string) =>
    f && f in FORMA_LABEL ? FORMA_LABEL[f as FormaPagamento] : String(f);

  return (
    <>
      <CupomCabecalho empresa={empresa} cfg={cfg} />
      <hr className="cupom-divisor" />
      <div className="cupom-centro cupom-bold">CUPOM DE VENDA</div>
      <div className="cupom-centro cupom-mini">** NÃO É DOCUMENTO FISCAL **</div>
      {modoReimpressao && (
        <div className="cupom-centro cupom-bold" style={{ marginTop: 2 }}>
          ** 2ª VIA — REIMPRESSÃO **
        </div>
      )}
      <hr className="cupom-divisor" />
      <div>Venda: <span className="cupom-bold">#{venda.numero}</span></div>
      <div>Data: {fmtData(venda.createdAt)}</div>
      {cfg?.mostrarCliente !== false && venda.cliente?.nome && (
        <div>Cliente: {venda.cliente.nome}</div>
      )}
      {cfg?.mostrarCliente !== false && venda.cliente?.cpfCnpj && (
        <div>CPF/CNPJ: {venda.cliente.cpfCnpj}</div>
      )}
      {cfg?.mostrarVendedor !== false && venda.user?.nome && (
        <div>Vendedor: {venda.user.nome}</div>
      )}
      <hr className="cupom-divisor" />
      <div className="cupom-linha cupom-bold">
        <span>ITEM</span>
        <span>VALOR</span>
      </div>
      <hr className="cupom-divisor" />
      {venda.itens?.map(it => {
        const seg = it.produto?.camposSegmento;
        return (
          <div key={it.id} style={{ marginBottom: 4 }}>
            <div>{it.produto?.codigo} {it.produto?.nome}</div>
            {/* ETAPA#8a: linhas extras por segmento (so se preenchidas) */}
            {seg?.codigoOEM && (
              <div className="cupom-mini">OEM: {seg.codigoOEM}{seg.marcaPeca ? ` · ${seg.marcaPeca}` : ""}</div>
            )}
            {seg?.lote && (
              <div className="cupom-mini">Lote: {seg.lote}{seg.validade ? ` · Val. ${seg.validade}` : ""}</div>
            )}
            <div className="cupom-linha">
              <span>{fmtQtd(it.quantidade)} {it.produto?.unidade || ""} x {fmtBRL(it.precoUnitario)}</span>
              <span>{fmtBRL(it.subtotal)}</span>
            </div>
          </div>
        );
      })}
      <hr className="cupom-divisor" />
      <div className="cupom-linha">
        <span>Subtotal:</span>
        <span>{fmtBRL(subtotalCupom)}</span>
      </div>
      {Number(venda.desconto) > 0 && (
        <div className="cupom-linha">
          <span>Desconto:</span>
          <span>- {fmtBRL(venda.desconto)}</span>
        </div>
      )}
      <hr className="cupom-divisor" />
      <div className="cupom-linha cupom-grande">
        <span>TOTAL:</span>
        <span>{fmtBRL(venda.total)}</span>
      </div>
      <hr className="cupom-divisor" />
      {pagamentos.length === 1 ? (
        <div>Pagamento: <span className="cupom-bold">{pagamentos[0].formaCustomNome || labelForma(pagamentos[0].forma)}</span></div>
      ) : (
        <>
          <div className="cupom-bold">PAGAMENTOS:</div>
          {pagamentos.map((p, i) => (
            <div key={p.id ?? i} className="cupom-linha">
              <span>{p.formaCustomNome || labelForma(p.forma)}</span>
              <span>{fmtBRL(p.valor)}</span>
            </div>
          ))}
        </>
      )}
      {mostrarRecebidoTroco && (
        <>
          <div className="cupom-linha">
            <span>Valor recebido:</span>
            <span>{fmtBRL(valorRecebido)}</span>
          </div>
          <div className="cupom-linha cupom-bold">
            <span>TROCO:</span>
            <span>{fmtBRL(troco)}</span>
          </div>
        </>
      )}
      {venda.observacoes && (
        <>
          <hr className="cupom-divisor" />
          <div>Obs: {venda.observacoes}</div>
        </>
      )}
      <hr className="cupom-divisor" />
      <CupomRodape cfg={cfg} mensagemPadrao="OBRIGADO PELA PREFERÊNCIA!" />
    </>
  );
}
