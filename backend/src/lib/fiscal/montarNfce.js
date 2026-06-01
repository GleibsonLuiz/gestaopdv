// ============ MONTAGEM DO PAYLOAD infNFe (NFC-e modelo 65) ============
//
// Transforma Venda + Itens + Pagamentos + ConfiguracaoEmpresa no objeto infNFe
// no leiaute oficial (4.00) que o gateway (NuvemFiscal) recebe. NAO faz I/O —
// recebe tudo ja carregado pelo controller e devolve o objeto + os totais
// calculados (p/ gravar no snapshot da NotaFiscal).
//
// Regras NFC-e aplicadas (Anexo IV / MOC):
//   mod=65, tpNF=1 (saida), idDest=1 (interna), tpImp=4 (DANFE NFC-e),
//   tpEmis=1 (normal/online), finNFe=1, indFinal=1, indPres=1, procEmi=0.
//
// Validacoes locais anti-rejeicao (Boas Praticas §22): confere que o total
// dos pagamentos casa com o total da nota (evita rejeicao 767/769) e que ha
// ao menos um item e uma forma de pagamento.

import { ErroFiscal } from "./provedor.js";
import { calcularImpostoItem, round2 } from "./tributos.js";

const VER_PROC = "GestaoPDV-1.0";
// String obrigatoria no destinatario em ambiente de homologacao (senao a
// SEFAZ rejeita). Vale para NFC-e quando ha destinatario identificado.
const XNOME_HOMOLOGACAO = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

// FormaPagamento (nosso enum) -> tPag da SEFAZ (Tabela de meios de pagamento).
const TPAG = {
  DINHEIRO: "01",
  CARTAO_CREDITO: "03",
  CARTAO_DEBITO: "04",
  PIX: "17",        // 17 = Pagamento Instantaneo (PIX) - dinamico
  BOLETO: "15",
  CREDIARIO: "05",  // 05 = Credito Loja (crediario)
};

// dhEmi no horario da Bahia (UTC-3, sem horario de verao) com offset -03:00.
// Recebe o instante (Date) e devolve "AAAA-MM-DDTHH:mm:ss-03:00".
function dhEmiBahia(date) {
  const ba = new Date(date.getTime() - 3 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${ba.getUTCFullYear()}-${p(ba.getUTCMonth() + 1)}-${p(ba.getUTCDate())}` +
    `T${p(ba.getUTCHours())}:${p(ba.getUTCMinutes())}:${p(ba.getUTCSeconds())}-03:00`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function soDigitos(v) {
  return v == null ? null : String(v).replace(/\D/g, "") || null;
}

// Distribui um desconto total entre itens proporcionalmente ao subtotal,
// ajustando o ultimo item para fechar a soma exata (evita centavo perdido
// no arredondamento — causa de rejeicao por divergencia de totais).
function ratearDesconto(subtotais, descontoTotal) {
  const total = subtotais.reduce((a, b) => a + b, 0);
  if (descontoTotal <= 0 || total <= 0) return subtotais.map(() => 0);
  const descontos = subtotais.map((s) => round2((s / total) * descontoTotal));
  const somado = descontos.reduce((a, b) => a + b, 0);
  const ajuste = round2(descontoTotal - somado);
  if (ajuste !== 0 && descontos.length) descontos[descontos.length - 1] = round2(descontos[descontos.length - 1] + ajuste);
  return descontos;
}

// Monta o grupo emit a partir da ConfiguracaoEmpresa.
function montarEmit(cfg) {
  const cnpj = soDigitos(cfg.cnpj);
  if (!cnpj) throw new ErroFiscal("CNPJ do emitente nao configurado.");
  return {
    CNPJ: cnpj,
    xNome: cfg.razaoSocial,
    xFant: cfg.nomeFantasia || undefined,
    enderEmit: {
      xLgr: cfg.endereco,
      nro: cfg.numero || "S/N",
      xBairro: cfg.bairro,
      cMun: soDigitos(cfg.codMunicipioIBGE),
      xMun: cfg.cidade,
      UF: cfg.estado,
      CEP: soDigitos(cfg.cep),
      cPais: cfg.codPais || "1058",
      xPais: cfg.nomePais || "BRASIL",
      fone: soDigitos(cfg.telefone) || undefined,
    },
    IE: soDigitos(cfg.inscEstadual),
    CRT: String(cfg.crt),
  };
}

// Monta o grupo dest (opcional na NFC-e). Em homologacao forca o xNome exigido.
function montarDest(dest, ehHomologacao) {
  if (!dest || !dest.cpfCnpj) return undefined;
  const doc = soDigitos(dest.cpfCnpj);
  if (!doc) return undefined;
  const grupo = {};
  if (doc.length === 14) grupo.CNPJ = doc;
  else if (doc.length === 11) grupo.CPF = doc;
  else return undefined; // documento invalido — emite sem destinatario
  grupo.xNome = ehHomologacao ? XNOME_HOMOLOGACAO : (dest.nome || undefined);
  // indIEDest=9: nao contribuinte (consumidor final tipico da NFC-e).
  grupo.indIEDest = "9";
  return grupo;
}

// Monta o grupo pag (detPag[]) a partir das formas de pagamento da venda.
function montarPag(pagamentos, vTroco) {
  const detPag = pagamentos.map((p) => {
    const tPag = TPAG[p.forma] || "99"; // 99 = Outros
    const item = { indPag: "0", tPag, vPag: round2(num(p.valor)).toFixed(2) };
    if (tPag === "99" && p.formaCustomNome) item.xPag = p.formaCustomNome;
    // Cartao credito/debito: grupo card obrigatorio. tpIntegra=2 = pagamento
    // NAO integrado ao sistema de pagamento (sem TEF) — evita rejeicao 391/392.
    if (tPag === "03" || tPag === "04") {
      item.card = { tpIntegra: "2" };
    }
    return item;
  });
  const pag = { detPag };
  if (vTroco > 0) pag.vTroco = round2(vTroco).toFixed(2);
  return pag;
}

/**
 * Monta o infNFe completo da NFC-e.
 *
 * @param {object} args
 * @param {object} args.config   ConfiguracaoEmpresa (emitente)
 * @param {object} args.venda    Venda (total, desconto, observacoes, createdAt)
 * @param {Array}  args.itens    ItemVenda[] com .produto (campos fiscais)
 * @param {Array}  args.pagamentos VendaPagamento[] (forma, valor, formaCustomNome)
 * @param {object} [args.dest]   { cpfCnpj, nome } ou null
 * @param {string} args.ambiente "HOMOLOGACAO" | "PRODUCAO"
 * @param {number} args.serie
 * @param {number} args.numeroFiscal
 * @param {string} args.codigoNumerico cNF — 8 digitos aleatorios
 * @returns {{ payload, totais, itensSnapshot }}
 */
export function montarNfce({ config, venda, itens, pagamentos, dest, ambiente, serie, numeroFiscal, codigoNumerico }) {
  if (!itens || itens.length === 0) {
    throw new ErroFiscal("Venda sem itens — nao e possivel emitir NFC-e.");
  }
  const crt = Number(config.crt);
  const ehHomologacao = ambiente !== "PRODUCAO";
  const tpAmb = ehHomologacao ? "2" : "1";

  const subtotais = itens.map((it) => round2(num(it.subtotal)));
  const descontos = ratearDesconto(subtotais, round2(num(venda.desconto)));

  let vProdTotal = 0, vDescTotal = 0, vBCTotal = 0, vICMSTotal = 0, vPISTotal = 0, vCOFINSTotal = 0, vTotTribTotal = 0;
  let temTotTrib = false;

  const det = [];
  const itensSnapshot = [];

  itens.forEach((it, idx) => {
    const prodCad = it.produto || {};
    const vProd = subtotais[idx];
    const vDescItem = descontos[idx];
    const baseTributavel = round2(vProd - vDescItem);
    const qCom = num(it.quantidade);
    const vUnCom = num(it.precoUnitario);
    const unidade = prodCad.unidade || "UN";
    const unidadeTrib = prodCad.unidadeTributavel || unidade;
    const cEAN = prodCad.codigoBarras || "SEM GTIN";

    // vTotTrib (Lei 12.741) e opcional/informativo e nao temos a fonte por
    // produto hoje — fica nulo. Pode ser preenchido no futuro (IBPT).
    const vTotTribItem = null;

    const { imposto, vICMS, vPIS, vCOFINS, vBCICMS } = calcularImpostoItem({
      crt,
      origem: prodCad.origem,
      csosn: prodCad.csosnIcms,
      cst: prodCad.cstIcms,
      aliquotaIcms: prodCad.aliquotaIcms,
      cstPis: prodCad.cstPis,
      aliquotaPis: prodCad.aliquotaPis,
      cstCofins: prodCad.cstCofins,
      aliquotaCofins: prodCad.aliquotaCofins,
      vProd: baseTributavel,
      vTotTrib: vTotTribItem,
    });

    const prod = {
      cProd: String(prodCad.codigo || prodCad.id || (idx + 1)),
      cEAN,
      xProd: prodCad.nome || prodCad.descricao || "ITEM",
      NCM: soDigitos(prodCad.ncm) || "00000000",
      CFOP: soDigitos(prodCad.cfopPadrao) || "5102",
      uCom: unidade,
      qCom: qCom.toFixed(4),
      vUnCom: vUnCom.toFixed(10),
      vProd: vProd.toFixed(2),
      cEANTrib: cEAN,
      uTrib: unidadeTrib,
      qTrib: qCom.toFixed(4),
      vUnTrib: vUnCom.toFixed(10),
      indTot: "1",
    };
    if (soDigitos(prodCad.cest)) prod.CEST = soDigitos(prodCad.cest);
    if (vDescItem > 0) prod.vDesc = vDescItem.toFixed(2);

    det.push({ nItem: idx + 1, prod, imposto });

    // Acumula totais.
    vProdTotal = round2(vProdTotal + vProd);
    vDescTotal = round2(vDescTotal + vDescItem);
    vBCTotal = round2(vBCTotal + num(vBCICMS));
    vICMSTotal = round2(vICMSTotal + num(vICMS));
    vPISTotal = round2(vPISTotal + num(vPIS));
    vCOFINSTotal = round2(vCOFINSTotal + num(vCOFINS));
    if (vTotTribItem != null) { temTotTrib = true; vTotTribTotal = round2(vTotTribTotal + vTotTribItem); }

    itensSnapshot.push({
      numeroItem: idx + 1,
      codigo: prod.cProd,
      descricao: prod.xProd,
      ncm: prod.NCM,
      cest: prod.CEST || null,
      cfop: prod.CFOP,
      unidade,
      quantidade: qCom,
      valorUnitario: vUnCom,
      valorTotal: vProd,
      origem: prodCad.origem || null,
      cstIcms: prodCad.cstIcms || null,
      csosnIcms: prodCad.csosnIcms || null,
      baseIcms: num(vBCICMS),
      aliquotaIcms: prodCad.aliquotaIcms != null ? num(prodCad.aliquotaIcms) : null,
      valorIcms: num(vICMS),
      cstPis: prodCad.cstPis || null,
      valorPis: num(vPIS),
      cstCofins: prodCad.cstCofins || null,
      valorCofins: num(vCOFINS),
      produtoId: prodCad.id || null,
    });
  });

  const vNF = round2(vProdTotal - vDescTotal);

  // --- Pagamentos: valida o casamento com o total (anti-rejeicao 767) ---
  let listaPag = (pagamentos && pagamentos.length)
    ? pagamentos
    : [{ forma: venda.formaPagamento, valor: vNF }];
  const totalPago = round2(listaPag.reduce((a, p) => a + num(p.valor), 0));
  const vTroco = round2(Math.max(0, totalPago - vNF));
  // O valor pago pode ser >= vNF (troco em dinheiro). Se for MENOR, ha
  // inconsistencia — bloqueia localmente antes de gastar uma chamada/numeracao.
  if (totalPago + 0.001 < vNF) {
    throw new ErroFiscal(
      `Total dos pagamentos (R$ ${totalPago.toFixed(2)}) menor que o total da nota (R$ ${vNF.toFixed(2)}).`
    );
  }

  const ide = {
    cUF: soDigitos(config.codUFIBGE),
    cNF: codigoNumerico,
    natOp: "VENDA",
    mod: "65",
    serie: String(serie),
    nNF: String(numeroFiscal),
    dhEmi: dhEmiBahia(venda.createdAt ? new Date(venda.createdAt) : new Date()),
    tpNF: "1",
    idDest: "1",
    cMunFG: soDigitos(config.codMunicipioIBGE),
    tpImp: "4",
    tpEmis: "1",
    tpAmb,
    finNFe: "1",
    indFinal: "1",
    indPres: "1",
    procEmi: "0",
    verProc: VER_PROC,
  };

  const total = {
    ICMSTot: {
      vBC: vBCTotal.toFixed(2),
      vICMS: vICMSTotal.toFixed(2),
      vICMSDeson: "0.00",
      vFCP: "0.00",
      vBCST: "0.00",
      vST: "0.00",
      vProd: vProdTotal.toFixed(2),
      vFrete: "0.00",
      vSeg: "0.00",
      vDesc: vDescTotal.toFixed(2),
      vII: "0.00",
      vIPI: "0.00",
      vPIS: vPISTotal.toFixed(2),
      vCOFINS: vCOFINSTotal.toFixed(2),
      vOutro: "0.00",
      vNF: vNF.toFixed(2),
    },
  };
  if (temTotTrib) total.ICMSTot.vTotTrib = vTotTribTotal.toFixed(2);

  const payload = {
    versao: "4.00",
    ide,
    emit: montarEmit(config),
    det,
    total,
    transp: { modFrete: "9" }, // 9 = sem transporte
    pag: montarPag(listaPag, vTroco),
  };

  const grupoDest = montarDest(dest, ehHomologacao);
  if (grupoDest) payload.dest = grupoDest;

  if (venda.observacoes) {
    payload.infAdic = { infCpl: String(venda.observacoes).slice(0, 5000) };
  }

  const totais = {
    valorTotal: vNF,
    valorTributos: temTotTrib ? vTotTribTotal : null,
    baseCalculoIcms: vBCTotal,
    valorIcms: vICMSTotal,
    valorPis: vPISTotal,
    valorCofins: vCOFINSTotal,
  };

  return { payload, totais, itensSnapshot };
}
