import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validarNcm,
  validarCest,
  validarCfopSaida,
  validarGtin,
  validarTributacaoIcms,
  validarCst2Digitos,
  ORIGENS_VALIDAS,
  REGIMES_VALIDOS,
} from "./validacoesFiscais.js";

// ─── validarNcm ─────────────────────────────────────────────
describe("validarNcm", () => {
  it("aceita null/undefined/vazio como null", () => {
    assert.deepEqual(validarNcm(null), { ok: true, valor: null });
    assert.deepEqual(validarNcm(undefined), { ok: true, valor: null });
    assert.deepEqual(validarNcm(""), { ok: true, valor: null });
  });

  it("aceita 8 digitos puros", () => {
    assert.deepEqual(validarNcm("48202000"), { ok: true, valor: "48202000" });
  });

  it("remove pontos/tracos e aceita", () => {
    assert.deepEqual(validarNcm("4820.20.00"), { ok: true, valor: "48202000" });
    assert.deepEqual(validarNcm("4820-20-00"), { ok: true, valor: "48202000" });
  });

  it("rejeita se nao tem 8 digitos", () => {
    const r = validarNcm("1234567");
    assert.equal(r.ok, false);
    assert.match(r.erro, /8 digitos/);
  });
});

// ─── validarCest ────────────────────────────────────────────
describe("validarCest", () => {
  it("aceita null/vazio", () => {
    assert.deepEqual(validarCest(null), { ok: true, valor: null });
    assert.deepEqual(validarCest(""), { ok: true, valor: null });
  });

  it("aceita 7 digitos", () => {
    assert.deepEqual(validarCest("0300700"), { ok: true, valor: "0300700" });
  });

  it("remove formatacao e valida", () => {
    assert.deepEqual(validarCest("03.007.00"), { ok: true, valor: "0300700" });
  });

  it("rejeita se nao tem 7 digitos", () => {
    const r = validarCest("123456");
    assert.equal(r.ok, false);
    assert.match(r.erro, /7 digitos/);
  });
});

// ─── validarCfopSaida ───────────────────────────────────────
describe("validarCfopSaida", () => {
  it("aceita null/vazio", () => {
    assert.deepEqual(validarCfopSaida(null), { ok: true, valor: null });
  });

  it("aceita CFOP de saida valido (5, 6, 7)", () => {
    assert.deepEqual(validarCfopSaida("5102"), { ok: true, valor: "5102" });
    assert.deepEqual(validarCfopSaida("6102"), { ok: true, valor: "6102" });
    assert.deepEqual(validarCfopSaida("7102"), { ok: true, valor: "7102" });
  });

  it("rejeita CFOP de entrada", () => {
    const r = validarCfopSaida("1102");
    assert.equal(r.ok, false);
    assert.match(r.erro, /5, 6 ou 7/);
  });

  it("rejeita se nao tem 4 digitos", () => {
    const r = validarCfopSaida("51");
    assert.equal(r.ok, false);
    assert.match(r.erro, /4 digitos/);
  });
});

// ─── validarGtin ────────────────────────────────────────────
describe("validarGtin", () => {
  it("aceita null/vazio", () => {
    assert.deepEqual(validarGtin(null), { ok: true, valor: null });
    assert.deepEqual(validarGtin(""), { ok: true, valor: null });
  });

  it("aceita SEM GTIN (case-insensitive)", () => {
    assert.deepEqual(validarGtin("SEM GTIN"), { ok: true, valor: "SEM GTIN" });
  });

  it("aceita EAN-13 valido", () => {
    // 7891234567895 - valid EAN-13 checksum
    assert.deepEqual(validarGtin("7891234567895"), { ok: true, valor: "7891234567895" });
  });

  it("aceita EAN-8 valido", () => {
    // 12345670 - valid EAN-8
    assert.deepEqual(validarGtin("12345670"), { ok: true, valor: "12345670" });
  });

  it("rejeita checksum invalido", () => {
    const r = validarGtin("7891234567890");
    assert.equal(r.ok, false);
    assert.match(r.erro, /digito verificador/);
  });

  it("rejeita tamanho invalido", () => {
    const r = validarGtin("123456");
    assert.equal(r.ok, false);
    assert.match(r.erro, /8, 12, 13 ou 14/);
  });

  it("rejeita nao-digitos", () => {
    const r = validarGtin("789ABC567890");
    assert.equal(r.ok, false);
    assert.match(r.erro, /apenas digitos/);
  });
});

// ─── validarTributacaoIcms ──────────────────────────────────
describe("validarTributacaoIcms", () => {
  it("regime normal aceita CST 3 digitos", () => {
    const r = validarTributacaoIcms({ regime: "REGIME_NORMAL", cstIcms: "000", csosnIcms: null });
    assert.deepEqual(r, { ok: true });
  });

  it("regime normal rejeita CSOSN", () => {
    const r = validarTributacaoIcms({ regime: "REGIME_NORMAL", cstIcms: null, csosnIcms: "102" });
    assert.equal(r.ok, false);
    assert.match(r.erro, /CSOSN/);
  });

  it("simples aceita CSOSN 3 ou 4 digitos", () => {
    assert.deepEqual(validarTributacaoIcms({ regime: "SIMPLES_NACIONAL", cstIcms: null, csosnIcms: "102" }), { ok: true });
    assert.deepEqual(validarTributacaoIcms({ regime: "SIMPLES_NACIONAL", cstIcms: null, csosnIcms: "0900" }), { ok: true });
  });

  it("simples rejeita CST", () => {
    const r = validarTributacaoIcms({ regime: "SIMPLES_NACIONAL", cstIcms: "000", csosnIcms: null });
    assert.equal(r.ok, false);
    assert.match(r.erro, /CST/);
  });
});

// ─── validarCst2Digitos ─────────────────────────────────────
describe("validarCst2Digitos", () => {
  it("aceita vazio", () => {
    assert.deepEqual(validarCst2Digitos("", "PIS"), { ok: true, valor: null });
  });

  it("aceita 2 digitos", () => {
    assert.deepEqual(validarCst2Digitos("01", "PIS"), { ok: true, valor: "01" });
  });

  it("rejeita 3 digitos", () => {
    const r = validarCst2Digitos("001", "PIS");
    assert.equal(r.ok, false);
    assert.match(r.erro, /2 digitos/);
  });
});

// ─── Sets exportados ────────────────────────────────────────
describe("constantes", () => {
  it("ORIGENS_VALIDAS contem NACIONAL", () => {
    assert.ok(ORIGENS_VALIDAS.has("NACIONAL"));
  });

  it("REGIMES_VALIDOS contem os 3 regimes", () => {
    assert.equal(REGIMES_VALIDOS.size, 3);
    assert.ok(REGIMES_VALIDOS.has("SIMPLES_NACIONAL"));
    assert.ok(REGIMES_VALIDOS.has("REGIME_NORMAL"));
  });
});
