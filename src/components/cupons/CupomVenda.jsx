import CupomCabecalho from "./CupomCabecalho.jsx";
import CupomRodape from "./CupomRodape.jsx";
import { fmtBRL, fmtData, FORMA_LABEL } from "./fmt.js";

// Conteudo do cupom de venda. Substitui o markup inline que ficava dentro
// de PDV.ReciboModal. Pode ser usado:
//   - INLINE no ReciboModal (cupom ja no DOM, basta window.print())
//   - PORTAL via imprimirDocumento() para reimpressao programatica
//
// Respeita flags da ConfiguracaoImpressora: mostrarVendedor, mostrarCliente.

export default function CupomVenda({
  venda,
  empresa,
  cfg,
  valorRecebido = 0,
  troco = 0,
  modoReimpressao = false,
}) {
  const subtotalCupom = Number(venda.total) + Number(venda.desconto || 0);
  const mostrarRecebidoTroco = Number(valorRecebido) > 0;

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
            <span>{it.quantidade} {it.produto?.unidade || ""} x {fmtBRL(it.precoUnitario)}</span>
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
      <div>Pagamento: <span className="cupom-bold">{FORMA_LABEL[venda.formaPagamento] || venda.formaPagamento}</span></div>
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
