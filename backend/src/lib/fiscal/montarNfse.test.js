import test from "node:test";
import assert from "node:assert/strict";
import { montarNfse } from "./montarNfse.js";

const config = {
  cnpj: "11222333000181", razaoSocial: "SERVICOS TESTE LTDA",
  inscMunicipal: "987654", crt: 1, regimeEspecialISSQN: null,
  codMunicipioIBGE: "2927408",
  itemListaServicoPadrao: "1401", codTributacaoMunicipioPadrao: "140100",
  aliquotaIssPadrao: 5,
};

function base(extra = {}) {
  return montarNfse({
    config,
    prestacao: { valorServicos: 100, discriminacao: "Conserto de equipamento", ...extra },
    tomador: { cpfCnpj: "52998224725", nome: "CLIENTE TESTE" },
    ambiente: "HOMOLOGACAO", serie: 1, numeroFiscal: 7,
    dataEmissao: new Date("2026-06-02T18:30:00Z"),
  });
}

test("monta infDPS com prestador, serie/numero e ambiente de homologacao", () => {
  const { payload } = base();
  assert.equal(payload.tpAmb, 2);
  assert.equal(payload.serie, "1");
  assert.equal(payload.nDPS, "7");
  assert.equal(payload.cLocEmi, "2927408");
  assert.equal(payload.prest.CNPJ, "11222333000181");
  assert.equal(payload.prest.IM, "987654");
  assert.equal(payload.prest.regTrib.opSimpNac, 3); // CRT 1 = Simples -> ME/EPP
  assert.equal(payload.dhEmi, "2026-06-02T15:30:00-03:00"); // fuso -03:00
  assert.equal(payload.dCompet, "2026-06-01"); // competencia = primeiro dia do mes
});

test("usa a classificacao padrao da empresa quando nao sobrescrita", () => {
  const { payload, snapshot } = base();
  assert.equal(payload.serv.cServ.cTribNac, "1401");
  assert.equal(payload.serv.cServ.cTribMun, "140100");
  assert.equal(payload.serv.cServ.xDescServ, "Conserto de equipamento");
  assert.equal(snapshot.itemListaServico, "1401");
});

test("calcula base e ISS (servico - deducoes) * aliquota", () => {
  const { totais } = base({ valorServicos: 200, valorDeducoes: 50 });
  assert.equal(totais.baseCalculoIss, 150);
  assert.equal(totais.valorIss, 7.5); // 150 * 5%
  assert.equal(totais.valorServicos, 200);
});

test("override de aliquota e ISS retido no payload de tributacao", () => {
  const { payload } = base({ aliquotaIss: 3, issRetido: true });
  assert.equal(payload.valores.trib.tribMun.pAliq, "3.00");
  assert.equal(payload.valores.trib.tribMun.tpRetISSQN, 1); // retido
});

test("tomador vira CPF/CNPJ + xNome", () => {
  const { payload } = base();
  assert.equal(payload.toma.CPF, "52998224725");
  assert.equal(payload.toma.xNome, "CLIENTE TESTE");
});

test("rejeita servico sem valor ou sem discriminacao", () => {
  assert.throws(() => base({ valorServicos: 0 }), /maior que zero/);
  assert.throws(() => base({ discriminacao: "" }), /[Dd]iscriminacao/);
});

test("rejeita quando nao ha item LC 116 (nem padrao nem override)", () => {
  assert.throws(() => montarNfse({
    config: { ...config, itemListaServicoPadrao: null },
    prestacao: { valorServicos: 100, discriminacao: "Servico X" },
    ambiente: "HOMOLOGACAO", serie: 1, numeroFiscal: 1,
  }), /lista de servicos/);
});

test("CRT 3 (regime normal) => opSimpNac nao optante", () => {
  const { payload } = montarNfse({
    config: { ...config, crt: 3 },
    prestacao: { valorServicos: 100, discriminacao: "Servico Y" },
    ambiente: "PRODUCAO", serie: 1, numeroFiscal: 1,
  });
  assert.equal(payload.tpAmb, 1);
  assert.equal(payload.prest.regTrib.opSimpNac, 1);
});
