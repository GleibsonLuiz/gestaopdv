import test from "node:test";
import assert from "node:assert/strict";
import { validarCpf, validarCnpj, validarCpfCnpj, validarNfce, validarNfse } from "./validarPayload.js";

// Fixtures classicos validos
const CNPJ_OK = "11222333000181";
const CPF_OK = "52998224725";

test("validarCnpj aceita valido e rejeita DV errado / repetido / tamanho", () => {
  assert.equal(validarCnpj(CNPJ_OK), true);
  assert.equal(validarCnpj("11222333000180"), false); // DV errado
  assert.equal(validarCnpj("11111111111111"), false); // todos iguais
  assert.equal(validarCnpj("123"), false);
});

test("validarCpf aceita valido e rejeita DV errado / repetido", () => {
  assert.equal(validarCpf(CPF_OK), true);
  assert.equal(validarCpf("52998224724"), false);
  assert.equal(validarCpf("00000000000"), false);
});

test("validarCpfCnpj roteia por tamanho", () => {
  assert.equal(validarCpfCnpj(CPF_OK), true);
  assert.equal(validarCpfCnpj(CNPJ_OK), true);
  assert.equal(validarCpfCnpj("12345"), false);
});

function nfceOk() {
  return {
    emit: { CNPJ: CNPJ_OK, IE: "123456789" },
    det: [{ nItem: 1, prod: { xProd: "Refrigerante 2L", NCM: "22021000", CFOP: "5102", qCom: "2.0000" } }],
  };
}

test("validarNfce: payload coerente passa", () => {
  const r = validarNfce(nfceOk());
  assert.equal(r.ok, true);
  assert.equal(r.erros.length, 0);
});

test("validarNfce: NCM default 00000000 e barrado (o buraco do montarNfce)", () => {
  const p = nfceOk();
  p.det[0].prod.NCM = "00000000";
  const r = validarNfce(p);
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.campo === "NCM" && e.item === 1));
});

test("validarNfce: CFOP malformado e quantidade zero sao barrados por item", () => {
  const p = nfceOk();
  p.det[0].prod.CFOP = "510"; // 3 digitos
  p.det[0].prod.qCom = "0";
  const r = validarNfce(p);
  assert.ok(r.erros.some((e) => e.campo === "CFOP"));
  assert.ok(r.erros.some((e) => e.campo === "qCom"));
});

test("validarNfce: CNPJ do emitente invalido e cliente com doc invalido", () => {
  const p = nfceOk();
  p.emit.CNPJ = "11222333000180";
  p.dest = { CPF: "52998224724" };
  const r = validarNfce(p);
  assert.ok(r.erros.some((e) => e.campo === "emit.CNPJ"));
  assert.ok(r.erros.some((e) => e.campo === "dest"));
});

function nfseOk() {
  return {
    prest: { CNPJ: CNPJ_OK, IM: "987654" },
    serv: { cServ: { cTribNac: "0107", xDescServ: "Conserto de equipamento" } },
    valores: { vServPrest: { vServ: "150.00" }, trib: { tribMun: { pAliq: "5.00" } } },
  };
}

test("validarNfse: payload coerente passa", () => {
  assert.equal(validarNfse(nfseOk()).ok, true);
});

test("validarNfse: valor zero, aliquota fora de faixa e tomador invalido", () => {
  const p = nfseOk();
  p.valores.vServPrest.vServ = "0";
  p.valores.trib.tribMun.pAliq = "150";
  p.toma = { CNPJ: "11222333000180" };
  const r = validarNfse(p);
  assert.ok(r.erros.some((e) => e.campo === "valores.vServPrest.vServ"));
  assert.ok(r.erros.some((e) => e.campo === "tribMun.pAliq"));
  assert.ok(r.erros.some((e) => e.campo === "toma"));
});
