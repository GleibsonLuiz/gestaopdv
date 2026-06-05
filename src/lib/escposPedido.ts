// =====================================================================
// ETAPA#8a — Converte um pedido/venda em comandos ESC/POS.
//
// Layout adaptado por segmento da empresa (Auto-Pecas / Farmacia)
// — campos extras vem em produto.camposSegmento.
// =====================================================================
import * as e from "./escpos";
import type { SegmentoEmpresa } from "./api";
import { fmtBRL, fmtData, fmtQtd } from "../lib/format";


export interface ItemPedidoImp {
  quantidade: number | string;
  precoUnitario: number | string;
  subtotal: number | string;
  produto?: {
    codigo?: string | number | null;
    nome?: string | null;
    unidade?: string | null;
    camposSegmento?: {
      codigoOEM?: string;
      marcaPeca?: string;
      lote?: string;
      validade?: string;
    } | null;
  } | null;
}

export interface PedidoImp {
  numero: number | string;
  createdAt: string | Date;
  total: number | string;
  desconto?: number | string | null;
  cliente?: { nome?: string | null } | null;
  user?: { nome?: string | null } | null;
  itens?: ItemPedidoImp[] | null;
  observacoes?: string | null;
  formaPagamentoLabel?: string | null; // ex: "DINHEIRO", "PAGO VIA MAQUININHA"
}

export interface EmpresaImp {
  nome?: string | null;
  cnpj?: string | null;
  endereco?: string | null;
  telefone?: string | null;
}

export interface OpcoesImp {
  larguraMm?: 58 | 80;          // largura fisica do papel
  abrirGavetaDinheiro?: boolean; // se houver pagamento em dinheiro
  qrCode?: string | null;        // QR ao final (ex: link de consulta)
  cortarPapel?: boolean;         // emite GS V 0 ao final
  segmento?: SegmentoEmpresa;    // controla quais campos extras renderizar
  mensagemRodape?: string | null;
  vendedorAssinatura?: boolean;  // linha "Assinatura: ___" no rodape
}

export function gerarComandosPedido(
  pedido: PedidoImp,
  empresa: EmpresaImp,
  opcoes: OpcoesImp = {},
): Uint8Array {
  const largCh = (opcoes.larguraMm ?? 80) === 58 ? 32 : 48;
  const segmento = opcoes.segmento ?? "GERAL";
  const partes: Uint8Array[] = [];

  partes.push(e.init());

  // ============ CABECALHO ============
  partes.push(e.align(1), e.bold(true), e.fontSize(1, 2));
  partes.push(e.linha((empresa.nome || "ESTABELECIMENTO").toUpperCase()));
  partes.push(e.fontSize(1, 1), e.bold(false));
  if (empresa.cnpj) partes.push(e.linha("CNPJ: " + empresa.cnpj));
  if (empresa.endereco) partes.push(e.linha(empresa.endereco));
  if (empresa.telefone) partes.push(e.linha("Tel: " + empresa.telefone));
  partes.push(e.align(0));
  partes.push(e.divisor(largCh, "="));

  // ============ INFO DO PEDIDO ============
  partes.push(e.bold(true), e.align(1));
  partes.push(e.linha("PEDIDO #" + pedido.numero));
  partes.push(e.bold(false), e.align(0));
  partes.push(e.linha("Data: " + fmtData(pedido.createdAt)));
  if (pedido.user?.nome) partes.push(e.linha("Vendedor: " + pedido.user.nome));
  if (pedido.cliente?.nome) partes.push(e.linha("Cliente: " + pedido.cliente.nome));
  partes.push(e.divisor(largCh));

  // ============ ITENS ============
  for (const it of pedido.itens || []) {
    const seg = it.produto?.camposSegmento;
    const nome = String(it.produto?.nome || "").slice(0, largCh - 2);
    partes.push(e.linha(`${it.produto?.codigo ?? ""} ${nome}`.trim()));
    // Campos extras por segmento (so renderizar se preenchidos).
    if (segmento === "AUTO_PECAS") {
      if (seg?.codigoOEM) {
        const extra = seg.marcaPeca ? `OEM: ${seg.codigoOEM} - ${seg.marcaPeca}` : `OEM: ${seg.codigoOEM}`;
        partes.push(e.linha("  " + extra));
      }
    } else if (segmento === "FARMACIA") {
      if (seg?.lote || seg?.validade) {
        const partesExtra: string[] = [];
        if (seg.lote) partesExtra.push(`Lote ${seg.lote}`);
        if (seg.validade) partesExtra.push(`Val. ${seg.validade}`);
        partes.push(e.linha("  " + partesExtra.join(" / ")));
      }
    }
    partes.push(e.linhaDireita(
      `${fmtQtd(it.quantidade)} ${it.produto?.unidade || "un"} x ${fmtBRL(it.precoUnitario)}`,
      fmtBRL(it.subtotal),
      largCh,
    ));
  }
  partes.push(e.divisor(largCh));

  // ============ TOTAIS ============
  const subtotal = Number(pedido.total) + Number(pedido.desconto || 0);
  partes.push(e.linhaDireita("Subtotal:", fmtBRL(subtotal), largCh));
  if (Number(pedido.desconto) > 0) {
    partes.push(e.linhaDireita("Desconto:", "- " + fmtBRL(pedido.desconto || 0), largCh));
  }
  partes.push(e.bold(true), e.fontSize(1, 2));
  partes.push(e.linhaDireita("TOTAL:", fmtBRL(pedido.total), Math.floor(largCh / 2)));
  partes.push(e.bold(false), e.fontSize(1, 1));
  partes.push(e.divisor(largCh));

  // ============ PAGAMENTO ============
  if (pedido.formaPagamentoLabel) {
    partes.push(e.align(1), e.bold(true));
    partes.push(e.linha(pedido.formaPagamentoLabel));
    partes.push(e.bold(false), e.align(0));
    partes.push(e.divisor(largCh));
  }

  // ============ ASSINATURA (ETAPA#9a — Central de Comandas) ============
  if (opcoes.vendedorAssinatura) {
    partes.push(e.newLine(2));
    partes.push(e.linha("Assinatura do Vendedor:"));
    partes.push(e.linha("_".repeat(largCh)));
    partes.push(e.newLine());
  }

  // ============ OBSERVACOES ============
  if (pedido.observacoes) {
    partes.push(e.linha("Obs: " + pedido.observacoes));
    partes.push(e.divisor(largCh));
  }

  // ============ QR CODE (opcional) ============
  if (opcoes.qrCode) {
    partes.push(e.newLine(), e.align(1));
    partes.push(e.qrCode(opcoes.qrCode, 6, "M"));
    partes.push(e.align(0));
  }

  // ============ RODAPE ============
  partes.push(e.align(1));
  partes.push(e.linha(opcoes.mensagemRodape || "OBRIGADO PELA PREFERENCIA!"));
  partes.push(e.align(0), e.newLine(3));

  // ============ GAVETA + CORTE ============
  if (opcoes.abrirGavetaDinheiro) partes.push(e.abrirGaveta());
  if (opcoes.cortarPapel !== false) partes.push(e.cut());

  return e.concat(partes);
}

// =====================================================================
// Adendo: cupom para itens adicionados a uma comanda ja aberta. Imprime
// destacado "ADENDO COMANDA #X" + so os itens novos, sem totais da
// comanda inteira (cozinha so precisa do que falta produzir).
// =====================================================================
export interface AdendoImp {
  comandaNumero: number | string;
  mesa?: string | null;
  vendedorNome?: string | null;
  itensNovos: ItemPedidoImp[];
  agora?: Date;
}

export function gerarComandosAdendo(
  adendo: AdendoImp,
  empresa: EmpresaImp,
  opcoes: OpcoesImp = {},
): Uint8Array {
  const largCh = (opcoes.larguraMm ?? 80) === 58 ? 32 : 48;
  const segmento = opcoes.segmento ?? "GERAL";
  const partes: Uint8Array[] = [];

  partes.push(e.init());

  // ============ CABECALHO ============
  partes.push(e.align(1), e.bold(true), e.fontSize(1, 2));
  partes.push(e.linha((empresa.nome || "ESTABELECIMENTO").toUpperCase()));
  partes.push(e.fontSize(1, 1));
  partes.push(e.linha("*** ADENDO ***"));
  partes.push(e.bold(false), e.align(0));
  partes.push(e.divisor(largCh, "="));

  // ============ INFO DO ADENDO ============
  partes.push(e.bold(true), e.align(1));
  partes.push(e.linha("COMANDA #" + adendo.comandaNumero));
  partes.push(e.bold(false), e.align(0));
  partes.push(e.linha("Data: " + fmtData(adendo.agora || new Date())));
  if (adendo.mesa) partes.push(e.linha("Mesa/Balcao: " + adendo.mesa));
  if (adendo.vendedorNome) partes.push(e.linha("Vendedor: " + adendo.vendedorNome));
  partes.push(e.divisor(largCh));

  // ============ ITENS NOVOS ============
  partes.push(e.align(1), e.bold(true));
  partes.push(e.linha("ITENS ADICIONADOS"));
  partes.push(e.bold(false), e.align(0));
  partes.push(e.divisor(largCh));

  let totalAdendo = 0;
  for (const it of adendo.itensNovos) {
    const seg = it.produto?.camposSegmento;
    const nome = String(it.produto?.nome || "").slice(0, largCh - 2);
    partes.push(e.linha(`${it.produto?.codigo ?? ""} ${nome}`.trim()));
    if (segmento === "AUTO_PECAS") {
      if (seg?.codigoOEM) {
        const extra = seg.marcaPeca ? `OEM: ${seg.codigoOEM} - ${seg.marcaPeca}` : `OEM: ${seg.codigoOEM}`;
        partes.push(e.linha("  " + extra));
      }
    } else if (segmento === "FARMACIA") {
      if (seg?.lote || seg?.validade) {
        const partesExtra: string[] = [];
        if (seg.lote) partesExtra.push(`Lote ${seg.lote}`);
        if (seg.validade) partesExtra.push(`Val. ${seg.validade}`);
        partes.push(e.linha("  " + partesExtra.join(" / ")));
      }
    }
    partes.push(e.linhaDireita(
      `${fmtQtd(it.quantidade)} ${it.produto?.unidade || "un"} x ${fmtBRL(it.precoUnitario)}`,
      fmtBRL(it.subtotal),
      largCh,
    ));
    totalAdendo += Number(it.subtotal) || 0;
  }
  partes.push(e.divisor(largCh));

  // ============ SUBTOTAL DO ADENDO (somente dos novos) ============
  partes.push(e.bold(true));
  partes.push(e.linhaDireita("Subtotal adendo:", fmtBRL(totalAdendo), largCh));
  partes.push(e.bold(false));
  partes.push(e.divisor(largCh));

  // ============ RODAPE ============
  partes.push(e.align(1));
  partes.push(e.linha(opcoes.mensagemRodape || "ADICIONAR A COMANDA EXISTENTE"));
  partes.push(e.align(0), e.newLine(3));

  if (opcoes.cortarPapel !== false) partes.push(e.cut());

  return e.concat(partes);
}
