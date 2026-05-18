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

export type VendaCupom = {
  numero: number | string;
  createdAt: string | Date;
  total: number | string;
  desconto?: number | string | null;
  formaPagamento?: FormaPagamento | string | null;
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
  const forma = venda.formaPagamento;
  const formaLabel = forma && forma in FORMA_LABEL
    ? FORMA_LABEL[forma as FormaPagamento]
    : forma;

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
      {venda.itens?.map(it => (
        <div key={it.id} style={{ marginBottom: 4 }}>
          <div>{it.produto?.codigo} {it.produto?.nome}</div>
          <div className="cupom-linha">
            <span>{fmtQtd(it.quantidade)} {it.produto?.unidade || ""} x {fmtBRL(it.precoUnitario)}</span>
            <span>{fmtBRL(it.subtotal)}</span>
          </div>
        </div>
      ))}
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
      <div>Pagamento: <span className="cupom-bold">{formaLabel}</span></div>
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
