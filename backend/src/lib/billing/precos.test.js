import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRECOS_PLANO,
  PLANOS_GRATUITOS,
  DIAS_CARENCIA,
  DIAS_TRIAL,
  ehPlanoAssinavel,
  valorDoPlano,
  planoPorValor,
  catalogoPublico,
} from "./precos.js";

describe("PRECOS_PLANO", () => {
  it("contem STARTER, PRO, ENTERPRISE", () => {
    assert.ok("STARTER" in PRECOS_PLANO);
    assert.ok("PRO" in PRECOS_PLANO);
    assert.ok("ENTERPRISE" in PRECOS_PLANO);
  });

  it("cada plano tem valorMensal numerico positivo", () => {
    for (const [, info] of Object.entries(PRECOS_PLANO)) {
      assert.equal(typeof info.valorMensal, "number");
      assert.ok(info.valorMensal > 0);
    }
  });

  it("todos tem rotulo e descricao string", () => {
    for (const [, info] of Object.entries(PRECOS_PLANO)) {
      assert.equal(typeof info.rotulo, "string");
      assert.equal(typeof info.descricao, "string");
    }
  });
});

describe("PLANOS_GRATUITOS", () => {
  it("contem TRIAL e FREE", () => {
    assert.ok(PLANOS_GRATUITOS.has("TRIAL"));
    assert.ok(PLANOS_GRATUITOS.has("FREE"));
  });

  it("nao contem planos pagos", () => {
    assert.ok(!PLANOS_GRATUITOS.has("STARTER"));
    assert.ok(!PLANOS_GRATUITOS.has("PRO"));
  });
});

describe("constantes", () => {
  it("DIAS_CARENCIA e positivo", () => {
    assert.ok(DIAS_CARENCIA > 0);
  });

  it("DIAS_TRIAL e positivo", () => {
    assert.ok(DIAS_TRIAL > 0);
  });
});

describe("ehPlanoAssinavel", () => {
  it("STARTER e PRO sao assinaveis", () => {
    assert.equal(ehPlanoAssinavel("STARTER"), true);
    assert.equal(ehPlanoAssinavel("PRO"), true);
  });

  it("ENTERPRISE nao e assinavel", () => {
    assert.equal(ehPlanoAssinavel("ENTERPRISE"), false);
  });

  it("plano inexistente retorna false", () => {
    assert.equal(ehPlanoAssinavel("INVALIDO"), false);
    assert.equal(ehPlanoAssinavel(null), false);
    assert.equal(ehPlanoAssinavel(""), false);
  });

  it("case-insensitive", () => {
    assert.equal(ehPlanoAssinavel("starter"), true);
    assert.equal(ehPlanoAssinavel("pro"), true);
  });
});

describe("valorDoPlano", () => {
  it("retorna valor correto para planos existentes", () => {
    assert.equal(valorDoPlano("STARTER"), 49.9);
    assert.equal(valorDoPlano("PRO"), 149.9);
    assert.equal(valorDoPlano("ENTERPRISE"), 499.9);
  });

  it("retorna null para plano inexistente", () => {
    assert.equal(valorDoPlano("FREE"), null);
    assert.equal(valorDoPlano(null), null);
  });

  it("case-insensitive", () => {
    assert.equal(valorDoPlano("starter"), 49.9);
  });
});

describe("planoPorValor", () => {
  it("encontra STARTER por valor", () => {
    assert.equal(planoPorValor(49.9), "STARTER");
  });

  it("encontra PRO por valor", () => {
    assert.equal(planoPorValor(149.9), "PRO");
  });

  it("encontra com tolerancia de 0.004", () => {
    assert.equal(planoPorValor(49.904), "STARTER");
  });

  it("retorna null para valor sem match", () => {
    assert.equal(planoPorValor(99.9), null);
  });

  it("retorna null para null/NaN", () => {
    assert.equal(planoPorValor(null), null);
    assert.equal(planoPorValor("abc"), null);
  });
});

describe("catalogoPublico", () => {
  it("retorna array com todos os planos de PRECOS_PLANO", () => {
    const cat = catalogoPublico();
    assert.ok(Array.isArray(cat));
    assert.equal(cat.length, Object.keys(PRECOS_PLANO).length);
  });

  it("cada item tem plano, valorMensal, rotulo, descricao, assinavel", () => {
    for (const item of catalogoPublico()) {
      assert.equal(typeof item.plano, "string");
      assert.equal(typeof item.valorMensal, "number");
      assert.equal(typeof item.rotulo, "string");
      assert.equal(typeof item.descricao, "string");
      assert.equal(typeof item.assinavel, "boolean");
    }
  });
});
