import test from "node:test";
import assert from "node:assert/strict";
import { montarNfce } from "./montarNfce.js";

const config = {
  cnpj: "11222333000181", razaoSocial: "LOJA TESTE LTDA", nomeFantasia: "LOJA TESTE",
  endereco: "RUA A", numero: "100", bairro: "CENTRO", cidade: "SALVADOR", estado: "BA",
  cep: "40000000", codMunicipioIBGE: "2927408", codUFIBGE: "29", codPais: "1058", nomePais: "BRASIL",
  inscEstadual: "123456789", crt: 1, serieNfce: 1,
};

function vendaBase() {
  return {
    total: 47.4, desconto: 5.0, formaPagamento: "DINHEIRO",
    observacoes: "Obrigado!", createdAt: new Date("2026-06-01T18:30:00Z"),
  };
}
function itensBase() {
  return [
    { quantidade: 2, precoUnitario: 10.0, subtotal: 20.0, produto: { id: "p1", codigo: "001", nome: "PRODUTO A", ncm: "94036000", cfopPadrao: "5102", unidade: "UN", origem: "NACIONAL", csosnIcms: "102", cstPis: "07", cstCofins: "07", codigoBarras: "7891234567895" } },
    { quantidade: 1, precoUnitario: 32.4, subtotal: 32.4, produto: { id: "p2", codigo: "002", nome: "PRODUTO B", ncm: "94036000", cfopPadrao: "5102", unidade: "UN", origem: "NACIONAL", csosnIcms: "102", cstPis: "07", cstCofins: "07" } },
  ];
}

test("monta ide da NFC-e com campos da BA e fuso -03:00", () => {
  const { payload } = montarNfce({
    config, venda: vendaBase(), itens: itensBase(), pagamentos: [{ forma: "DINHEIRO", valor: 50 }],
    dest: null, ambiente: "HOMOLOGACAO", serie: 1, numeroFiscal: 1, codigoNumerico: "12345678",
  });
  assert.equal(payload.ide.cUF, "29");
  assert.equal(payload.ide.mod, "65");
  assert.equal(payload.ide.tpAmb, "2"); // homologacao
  assert.equal(payload.ide.tpImp, "4");
  assert.equal(payload.ide.idDest, "1");
  assert.equal(payload.ide.cNF, "12345678");
  assert.equal(payload.ide.dhEmi, "2026-06-01T15:30:00-03:00");
});

test("totais: vProd, vDesc rateado e vNF coerentes", () => {
  const { payload, totais } = montarNfce({
    config, venda: vendaBase(), itens: itensBase(), pagamentos: [{ forma: "DINHEIRO", valor: 50 }],
    dest: null, ambiente: "HOMOLOGACAO", serie: 1, numeroFiscal: 1, codigoNumerico: "12345678",
  });
  assert.equal(payload.total.ICMSTot.vProd, "52.40");
  assert.equal(payload.total.ICMSTot.vDesc, "5.00");
  assert.equal(payload.total.ICMSTot.vNF, "47.40");
  assert.equal(totais.valorTotal, 47.4);
  // soma dos vDesc por item fecha no desconto total
  const somaDesc = payload.det.reduce((a, d) => a + Number(d.prod.vDesc || 0), 0);
  assert.equal(Number(somaDesc.toFixed(2)), 5.0);
});

test("pagamento em dinheiro acima do total gera troco", () => {
  const { payload } = montarNfce({
    config, venda: vendaBase(), itens: itensBase(), pagamentos: [{ forma: "DINHEIRO", valor: 50 }],
    dest: null, ambiente: "HOMOLOGACAO", serie: 1, numeroFiscal: 1, codigoNumerico: "12345678",
  });
  assert.equal(payload.pag.detPag[0].tPag, "01");
  assert.equal(payload.pag.detPag[0].vPag, "50.00");
  assert.equal(payload.pag.vTroco, "2.60");
});

test("cartao credito inclui grupo card (tpIntegra)", () => {
  const { payload } = montarNfce({
    config, venda: { ...vendaBase(), desconto: 0, total: 52.4 }, itens: itensBase(),
    pagamentos: [{ forma: "CARTAO_CREDITO", valor: 52.4 }],
    dest: null, ambiente: "HOMOLOGACAO", serie: 1, numeroFiscal: 1, codigoNumerico: "12345678",
  });
  assert.equal(payload.pag.detPag[0].tPag, "03");
  assert.deepEqual(payload.pag.detPag[0].card, { tpIntegra: "2" });
});

test("homologacao forca xNome do destinatario", () => {
  const { payload } = montarNfce({
    config, venda: vendaBase(), itens: itensBase(), pagamentos: [{ forma: "DINHEIRO", valor: 50 }],
    dest: { cpfCnpj: "52998224725", nome: "JOAO" }, ambiente: "HOMOLOGACAO", serie: 1, numeroFiscal: 1, codigoNumerico: "12345678",
  });
  assert.equal(payload.dest.CPF, "52998224725");
  assert.match(payload.dest.xNome, /HOMOLOGACAO/);
});

test("producao usa nome real do destinatario e tpAmb=1", () => {
  const { payload } = montarNfce({
    config, venda: vendaBase(), itens: itensBase(), pagamentos: [{ forma: "DINHEIRO", valor: 50 }],
    dest: { cpfCnpj: "52998224725", nome: "JOAO" }, ambiente: "PRODUCAO", serie: 1, numeroFiscal: 1, codigoNumerico: "12345678",
  });
  assert.equal(payload.ide.tpAmb, "1");
  assert.equal(payload.dest.xNome, "JOAO");
});

test("produto sem codigo de barras vira SEM GTIN; NCM ausente vira fallback", () => {
  const itens = [{ quantidade: 1, precoUnitario: 5, subtotal: 5, produto: { id: "x", codigo: "9", nome: "SEM CODIGOS", cfopPadrao: "5102", unidade: "UN", origem: "NACIONAL", csosnIcms: "102", cstPis: "07", cstCofins: "07" } }];
  const { payload } = montarNfce({
    config, venda: { ...vendaBase(), desconto: 0, total: 5 }, itens, pagamentos: [{ forma: "DINHEIRO", valor: 5 }],
    dest: null, ambiente: "HOMOLOGACAO", serie: 1, numeroFiscal: 1, codigoNumerico: "12345678",
  });
  assert.equal(payload.det[0].prod.cEAN, "SEM GTIN");
  assert.equal(payload.det[0].prod.NCM, "00000000");
});

test("pagamento menor que o total lanca erro (anti-rejeicao 767)", () => {
  assert.throws(
    () => montarNfce({
      config, venda: vendaBase(), itens: itensBase(), pagamentos: [{ forma: "DINHEIRO", valor: 10 }],
      dest: null, ambiente: "HOMOLOGACAO", serie: 1, numeroFiscal: 1, codigoNumerico: "12345678",
    }),
    /menor que o total/,
  );
});

test("venda sem itens lanca erro", () => {
  assert.throws(
    () => montarNfce({ config, venda: vendaBase(), itens: [], pagamentos: [], dest: null, ambiente: "HOMOLOGACAO", serie: 1, numeroFiscal: 1, codigoNumerico: "12345678" }),
    /sem itens/,
  );
});

test("itensSnapshot espelha os itens para gravar na NotaFiscal", () => {
  const { itensSnapshot } = montarNfce({
    config, venda: vendaBase(), itens: itensBase(), pagamentos: [{ forma: "DINHEIRO", valor: 50 }],
    dest: null, ambiente: "HOMOLOGACAO", serie: 1, numeroFiscal: 1, codigoNumerico: "12345678",
  });
  assert.equal(itensSnapshot.length, 2);
  assert.equal(itensSnapshot[0].numeroItem, 1);
  assert.equal(itensSnapshot[0].codigo, "001");
  assert.equal(itensSnapshot[0].csosnIcms, "102");
  assert.equal(itensSnapshot[0].produtoId, "p1");
});
