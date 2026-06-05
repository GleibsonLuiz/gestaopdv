/* global process */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { cifrar, decifrar, mascarar } from "./cripto.js";

// Use a fixed 32-byte key for testing (64 hex chars)
const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("cripto", () => {
  let originalKey;

  before(() => {
    originalKey = process.env.CRIPTO_SECRET;
    process.env.CRIPTO_SECRET = TEST_KEY;
  });

  after(() => {
    if (originalKey !== undefined) process.env.CRIPTO_SECRET = originalKey;
    else delete process.env.CRIPTO_SECRET;
  });

  describe("cifrar + decifrar (roundtrip)", () => {
    it("criptografa e descriptografa texto simples", () => {
      const original = "meu_segredo_123";
      const cifrado = cifrar(original);
      assert.ok(cifrado);
      assert.notEqual(cifrado, original);
      assert.equal(decifrar(cifrado), original);
    });

    it("funciona com strings longas e unicode", () => {
      const original = "Texto com acentuação: ção, ão, ê, ú! 🔑";
      const cifrado = cifrar(original);
      assert.equal(decifrar(cifrado), original);
    });

    it("cada cifragem gera resultado diferente (IV aleatorio)", () => {
      const c1 = cifrar("test");
      const c2 = cifrar("test");
      assert.notEqual(c1, c2);
    });
  });

  describe("cifrar", () => {
    it("retorna null para null/undefined/vazio", () => {
      assert.equal(cifrar(null), null);
      assert.equal(cifrar(undefined), null);
      assert.equal(cifrar(""), null);
    });

    it("retorna formato iv:tag:ciphertext", () => {
      const c = cifrar("x");
      const partes = c.split(":");
      assert.equal(partes.length, 3);
      // IV = 12 bytes = 24 hex chars
      assert.equal(partes[0].length, 24);
      // Tag = 16 bytes = 32 hex chars
      assert.equal(partes[1].length, 32);
      // Ciphertext > 0
      assert.ok(partes[2].length > 0);
    });
  });

  describe("decifrar", () => {
    it("retorna null para falsy", () => {
      assert.equal(decifrar(null), null);
      assert.equal(decifrar(""), null);
      assert.equal(decifrar(undefined), null);
    });

    it("lanca erro para formato invalido (sem 3 partes)", () => {
      assert.throws(() => decifrar("abc:def"), /invalido/);
    });

    it("lanca erro para IV de tamanho errado", () => {
      assert.throws(() => decifrar("aabb:ccddccddccddccddccddccddccddccdd:eeff"), /invalido/);
    });
  });
});

describe("mascarar", () => {
  it("retorna null para falsy", () => {
    assert.equal(mascarar(null), null);
    assert.equal(mascarar(""), null);
    assert.equal(mascarar(undefined), null);
  });

  it("mascara completamente strings curtas (<=8 chars)", () => {
    const r = mascarar("12345678");
    assert.ok(!r.includes("1"));
    assert.equal(r.length, 8);
  });

  it("preserva primeiros 8 e ultimos 4 para strings longas", () => {
    const r = mascarar("APP_USR-1234567890ABCDEF");
    assert.ok(r.startsWith("APP_USR-"));
    assert.ok(r.endsWith("CDEF"));
    assert.ok(r.includes("…"));
  });
});
