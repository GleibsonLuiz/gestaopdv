// ============ DE-PARA: casamento de itens da NF-e de entrada (Fase 3) ============
//
// Dado um item da NF-e do fornecedor (cProdFornecedor, cEAN) e os mapas de
// lookup do tenant, decide qual Produto nosso ele e — por ordem de confianca:
//
//   1. DEPARA  — memoria de importacoes anteriores (cProd do fornecedor ja
//                vinculado a um produtoId). A mais confiavel: o operador ja
//                confirmou esse vinculo antes.
//   2. GTIN    — cEAN do XML bate com Produto.codigoBarras. Forte (GTIN global).
//   3. CODIGO  — cProd do fornecedor bate com nosso Produto.codigo. Fraco
//                (codigos internos colidem), mas util como palpite.
//   4. NENHUM  — sem palpite: o operador vincula ou cria o produto na tela.
//
// PURO (sem I/O): o controller monta os mapas a partir do banco e passa aqui.

// item: { cProdFornecedor, cEAN }
// mapas: { dePara: Map<cProd, produtoId>, porEan: Map<gtin, produtoId>,
//          porCodigo: Map<codigo, produtoId> }
export function resolverItem(item, { dePara, porEan, porCodigo }) {
  const cProd = item?.cProdFornecedor != null ? String(item.cProdFornecedor) : null;
  const ean = item?.cEAN ? String(item.cEAN) : null;

  if (cProd && dePara?.has(cProd)) {
    return { produtoIdSugerido: dePara.get(cProd), origem: "DEPARA" };
  }
  if (ean && porEan?.has(ean)) {
    return { produtoIdSugerido: porEan.get(ean), origem: "GTIN" };
  }
  if (cProd && porCodigo?.has(cProd)) {
    return { produtoIdSugerido: porCodigo.get(cProd), origem: "CODIGO" };
  }
  return { produtoIdSugerido: null, origem: "NENHUM" };
}

// Resolve todos os itens, preservando o numero do item. Devolve um array
// alinhado a `itens` com { numero, produtoIdSugerido, origem }.
export function casarItens(itens, mapas) {
  return (itens || []).map((it, i) => ({
    numero: it?.numero ?? i + 1,
    ...resolverItem(it, mapas),
  }));
}

// Conta quantos itens ficaram sem palpite — util p/ a UI sinalizar o esforco
// de conciliacao ("3 de 8 itens precisam de vinculo").
export function contarPendentes(sugestoes) {
  return (sugestoes || []).filter((s) => !s.produtoIdSugerido).length;
}
