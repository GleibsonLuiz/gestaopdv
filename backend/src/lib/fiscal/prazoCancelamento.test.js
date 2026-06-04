import test from "node:test";
import assert from "node:assert/strict";
import { checarPrazoCancelamento, PRAZO_CANCELAMENTO_MIN } from "./prazoCancelamento.js";

const base = new Date("2026-06-03T12:00:00Z");
const minAtras = (m) => new Date(base.getTime() - m * 60000);

test("NFC-e dentro do prazo: permitido com restanteMin", () => {
  const r = checarPrazoCancelamento({ modelo: "NFCE_65", dataAutorizacao: minAtras(60) }, base);
  assert.equal(r.permitido, true);
  assert.equal(r.limiteMin, 1440);
  assert.equal(r.restanteMin, 1380); // 1440 - 60
});

test("NFC-e apos 24h: bloqueado com mensagem e alternativa", () => {
  const r = checarPrazoCancelamento({ modelo: "NFCE_65", dataAutorizacao: minAtras(1441) }, base);
  assert.equal(r.permitido, false);
  assert.equal(r.limiteMin, 1440);
  assert.match(r.mensagem, /24h/);
  assert.match(r.alternativa, /devolucao|estorno/);
});

test("NF-e 55 usa o mesmo prazo de 24h", () => {
  assert.equal(PRAZO_CANCELAMENTO_MIN.NFE_55, 1440);
  const r = checarPrazoCancelamento({ modelo: "NFE_55", dataAutorizacao: minAtras(2000) }, base);
  assert.equal(r.permitido, false);
});

test("NFS-e nao tem corte local (prefeitura decide)", () => {
  const r = checarPrazoCancelamento({ modelo: "NFSE", dataAutorizacao: minAtras(99999) }, base);
  assert.equal(r.permitido, true);
  assert.equal(r.restanteMin, undefined);
});

test("sem dataAutorizacao: nao bloqueia (nada a checar)", () => {
  const r = checarPrazoCancelamento({ modelo: "NFCE_65", dataAutorizacao: null }, base);
  assert.equal(r.permitido, true);
});

test("exatamente no limite ainda permite (>, nao >=)", () => {
  const r = checarPrazoCancelamento({ modelo: "NFCE_65", dataAutorizacao: minAtras(1440) }, base);
  assert.equal(r.permitido, true);
  assert.equal(r.restanteMin, 0);
});
