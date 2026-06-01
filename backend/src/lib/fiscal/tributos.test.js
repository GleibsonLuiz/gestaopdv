import test from "node:test";
import assert from "node:assert/strict";
import { calcularImpostoItem, round2 } from "./tributos.js";

test("round2 arredonda para 2 casas", () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(3.0916), 3.09);
  assert.equal(round2(10), 10);
});

test("Simples Nacional CSOSN 102 — sem valor de ICMS", () => {
  const r = calcularImpostoItem({
    crt: 1, origem: "NACIONAL", csosn: "102",
    cstPis: "07", cstCofins: "07", vProd: 20,
  });
  assert.deepEqual(r.imposto.ICMS, { ICMSSN102: { orig: "0", CSOSN: "102" } });
  assert.deepEqual(r.imposto.PIS, { PISNT: { CST: "07" } });
  assert.deepEqual(r.imposto.COFINS, { COFINSNT: { CST: "07" } });
  assert.equal(r.vICMS, 0);
  assert.equal(r.vPIS, 0);
  assert.equal(r.vCOFINS, 0);
});

test("Simples CSOSN 900 — calcula ICMS com aliquota", () => {
  const r = calcularImpostoItem({
    crt: 1, origem: "NACIONAL", csosn: "900", aliquotaIcms: 18,
    cstPis: "07", cstCofins: "07", vProd: 100,
  });
  const g = r.imposto.ICMS.ICMSSN900;
  assert.equal(g.CSOSN, "900");
  assert.equal(g.vBC, 100);
  assert.equal(g.pICMS, 18);
  assert.equal(g.vICMS, 18);
  assert.equal(r.vICMS, 18);
  assert.equal(r.vBCICMS, 100);
});

test("Regime Normal CST 00 — ICMS tributado integral", () => {
  const r = calcularImpostoItem({
    crt: 3, origem: "NACIONAL", cst: "00", aliquotaIcms: 12,
    cstPis: "01", aliquotaPis: 1.65, cstCofins: "01", aliquotaCofins: 7.6, vProd: 200,
  });
  assert.equal(r.imposto.ICMS.ICMS00.CST, "00");
  assert.equal(r.imposto.ICMS.ICMS00.vICMS, 24); // 200 * 12%
  assert.equal(r.imposto.PIS.PISAliq.vPIS, 3.3); // 200 * 1.65%
  assert.equal(r.imposto.COFINS.COFINSAliq.vCOFINS, 15.2); // 200 * 7.6%
  assert.equal(r.vICMS, 24);
  assert.equal(r.vPIS, 3.3);
  assert.equal(r.vCOFINS, 15.2);
});

test("Regime Normal CST 40 — isento, sem valor", () => {
  const r = calcularImpostoItem({
    crt: 3, origem: "NACIONAL", cst: "40", cstPis: "07", cstCofins: "07", vProd: 50,
  });
  assert.deepEqual(r.imposto.ICMS, { ICMS40: { orig: "0", CST: "40" } });
  assert.equal(r.vICMS, 0);
});

test("Simples sem CSOSN lanca erro", () => {
  assert.throws(
    () => calcularImpostoItem({ crt: 1, origem: "NACIONAL", cstPis: "07", cstCofins: "07", vProd: 10 }),
    /CSOSN/,
  );
});

test("vTotTrib opcional entra no imposto quando informado", () => {
  const r = calcularImpostoItem({
    crt: 1, origem: "NACIONAL", csosn: "102", cstPis: "07", cstCofins: "07", vProd: 10, vTotTrib: 1.23,
  });
  assert.equal(r.imposto.vTotTrib, 1.23);
});
