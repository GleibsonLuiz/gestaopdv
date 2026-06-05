import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compararSegredo } from "./timingSafe.js";

describe("compararSegredo", () => {
  it("retorna true para strings iguais", () => {
    assert.equal(compararSegredo("abc123", "abc123"), true);
  });

  it("retorna false para strings diferentes", () => {
    assert.equal(compararSegredo("abc123", "abc124"), false);
  });

  it("retorna false para tamanhos diferentes", () => {
    assert.equal(compararSegredo("short", "longer-string"), false);
  });

  it("retorna false se a nao e string", () => {
    assert.equal(compararSegredo(123, "123"), false);
    assert.equal(compararSegredo(null, "abc"), false);
    assert.equal(compararSegredo(undefined, "abc"), false);
  });

  it("retorna false se b nao e string", () => {
    assert.equal(compararSegredo("abc", 123), false);
    assert.equal(compararSegredo("abc", null), false);
  });

  it("funciona com strings vazias iguais", () => {
    assert.equal(compararSegredo("", ""), true);
  });

  it("funciona com strings unicode", () => {
    assert.equal(compararSegredo("café", "café"), true);
    assert.equal(compararSegredo("café", "cafe"), false);
  });
});
