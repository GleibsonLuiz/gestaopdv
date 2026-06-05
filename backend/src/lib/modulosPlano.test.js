import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MODULOS_POR_PLANO,
  IDS_MODULOS_PLANO,
  MODULO_FISCAL,
  MODULO_CARDAPIO,
  MODULO_NFE55,
  MODULO_NFSE,
  modulosDaEmpresa,
  empresaTemModulo,
} from "./modulosPlano.js";

describe("MODULOS_POR_PLANO", () => {
  it("contem TRIAL, FREE, STARTER, PRO, ENTERPRISE", () => {
    for (const p of ["TRIAL", "FREE", "STARTER", "PRO", "ENTERPRISE"]) {
      assert.ok(Array.isArray(MODULOS_POR_PLANO[p]), `Plano ${p} ausente`);
    }
  });

  it("TRIAL libera tudo (igual ENTERPRISE)", () => {
    assert.deepEqual(
      [...MODULOS_POR_PLANO.TRIAL].sort(),
      [...MODULOS_POR_PLANO.ENTERPRISE].sort()
    );
  });

  it("FREE e mais restrito que STARTER", () => {
    assert.ok(MODULOS_POR_PLANO.FREE.length < MODULOS_POR_PLANO.STARTER.length);
  });

  it("PRO inclui FISCAL", () => {
    assert.ok(MODULOS_POR_PLANO.PRO.includes(MODULO_FISCAL));
  });

  it("ENTERPRISE inclui NFE55 e NFSE", () => {
    assert.ok(MODULOS_POR_PLANO.ENTERPRISE.includes(MODULO_NFE55));
    assert.ok(MODULOS_POR_PLANO.ENTERPRISE.includes(MODULO_NFSE));
  });
});

describe("IDS_MODULOS_PLANO", () => {
  it("inclui modulos so-de-plano", () => {
    assert.ok(IDS_MODULOS_PLANO.includes(MODULO_FISCAL));
    assert.ok(IDS_MODULOS_PLANO.includes(MODULO_CARDAPIO));
    assert.ok(IDS_MODULOS_PLANO.includes(MODULO_NFE55));
    assert.ok(IDS_MODULOS_PLANO.includes(MODULO_NFSE));
  });
});

describe("modulosDaEmpresa", () => {
  it("usa modulosHabilitados se presente e nao-vazio", () => {
    const emp = { plano: "FREE", modulosHabilitados: ["PDV", "FISCAL"] };
    assert.deepEqual(modulosDaEmpresa(emp), ["PDV", "FISCAL"]);
  });

  it("cai no plano se modulosHabilitados vazio", () => {
    const emp = { plano: "STARTER", modulosHabilitados: [] };
    assert.deepEqual(modulosDaEmpresa(emp), MODULOS_POR_PLANO.STARTER);
  });

  it("cai no plano se modulosHabilitados null", () => {
    const emp = { plano: "PRO", modulosHabilitados: null };
    assert.deepEqual(modulosDaEmpresa(emp), MODULOS_POR_PLANO.PRO);
  });

  it("fallback FREE se plano desconhecido", () => {
    const emp = { plano: "INVALIDO" };
    assert.deepEqual(modulosDaEmpresa(emp), MODULOS_POR_PLANO.FREE);
  });

  it("fallback FREE se empresa null/undefined", () => {
    assert.deepEqual(modulosDaEmpresa(null), MODULOS_POR_PLANO.FREE);
    assert.deepEqual(modulosDaEmpresa(undefined), MODULOS_POR_PLANO.FREE);
  });
});

describe("empresaTemModulo", () => {
  it("retorna true se modulo esta no plano", () => {
    assert.equal(empresaTemModulo({ plano: "PRO" }, "PDV"), true);
    assert.equal(empresaTemModulo({ plano: "PRO" }, "FISCAL"), true);
  });

  it("retorna false se modulo nao esta no plano", () => {
    assert.equal(empresaTemModulo({ plano: "FREE" }, "FISCAL"), false);
  });

  it("override via modulosHabilitados", () => {
    const emp = { plano: "FREE", modulosHabilitados: ["FISCAL"] };
    assert.equal(empresaTemModulo(emp, "FISCAL"), true);
    assert.equal(empresaTemModulo(emp, "PDV"), false);
  });
});
