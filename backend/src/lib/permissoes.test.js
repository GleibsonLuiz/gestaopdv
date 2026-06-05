import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  IDS_MODULOS,
  sanitizarPermissoes,
  permissoesPadrao,
  temPermissao,
} from "./permissoes.js";

describe("IDS_MODULOS", () => {
  it("e um array nao-vazio de strings", () => {
    assert.ok(Array.isArray(IDS_MODULOS));
    assert.ok(IDS_MODULOS.length > 0);
    for (const m of IDS_MODULOS) assert.equal(typeof m, "string");
  });
});

describe("sanitizarPermissoes", () => {
  it("retorna vazio para nao-array", () => {
    assert.deepEqual(sanitizarPermissoes(null), []);
    assert.deepEqual(sanitizarPermissoes("PDV"), []);
    assert.deepEqual(sanitizarPermissoes(123), []);
  });

  it("filtra modulos invalidos", () => {
    const r = sanitizarPermissoes(["PDV", "INVALIDO", "CAIXA"]);
    assert.deepEqual(r.sort(), ["CAIXA", "PDV"]);
  });

  it("normaliza uppercase e trim", () => {
    const r = sanitizarPermissoes(["  pdv  ", "caixa"]);
    assert.ok(r.includes("PDV"));
    assert.ok(r.includes("CAIXA"));
  });

  it("deduplicar", () => {
    const r = sanitizarPermissoes(["PDV", "PDV", "pdv"]);
    assert.equal(r.length, 1);
  });

  it("ignora itens nao-string", () => {
    const r = sanitizarPermissoes([123, null, "PDV", undefined]);
    assert.deepEqual(r, ["PDV"]);
  });
});

describe("permissoesPadrao", () => {
  it("ADMIN recebe todos os modulos", () => {
    const p = permissoesPadrao("ADMIN");
    assert.deepEqual(p, IDS_MODULOS);
  });

  it("GERENTE recebe quase tudo exceto FUNCIONARIOS", () => {
    const p = permissoesPadrao("GERENTE");
    assert.ok(!p.includes("FUNCIONARIOS"));
    assert.ok(p.includes("PDV"));
    assert.ok(p.includes("WHATSAPP"));
  });

  it("VENDEDOR/outro recebe pacote basico", () => {
    const p = permissoesPadrao("VENDEDOR");
    assert.ok(p.includes("PDV"));
    assert.ok(p.includes("CAIXA"));
    assert.ok(!p.includes("FINANCEIRO"));
    assert.ok(!p.includes("FUNCIONARIOS"));
  });
});

describe("temPermissao", () => {
  it("retorna false para user null", () => {
    assert.equal(temPermissao(null, "PDV"), false);
  });

  it("ADMIN sempre tem acesso", () => {
    assert.equal(temPermissao({ role: "ADMIN", permissoes: [] }, "FINANCEIRO"), true);
    assert.equal(temPermissao({ role: "ADMIN", permissoes: [] }, "FUNCIONARIOS"), true);
  });

  it("FUNCIONARIOS so para ADMIN", () => {
    assert.equal(temPermissao({ role: "VENDEDOR", permissoes: ["FUNCIONARIOS"] }, "FUNCIONARIOS"), false);
  });

  it("verifica lista de permissoes", () => {
    const user = { role: "VENDEDOR", permissoes: ["PDV", "CAIXA"] };
    assert.equal(temPermissao(user, "PDV"), true);
    assert.equal(temPermissao(user, "FINANCEIRO"), false);
  });
});
