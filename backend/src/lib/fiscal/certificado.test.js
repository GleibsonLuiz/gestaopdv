import test from "node:test";
import assert from "node:assert/strict";
import { avaliarCertificado, nivelAlerta } from "./certificado.js";

const base = new Date("2026-06-03T12:00:00Z");
const emDias = (d) => new Date(base.getTime() + d * 86400000);

test("nivelAlerta mapeia para a banda mais urgente", () => {
  assert.equal(nivelAlerta(40), null);
  assert.equal(nivelAlerta(30), 30);
  assert.equal(nivelAlerta(20), 30);
  assert.equal(nivelAlerta(15), 15);
  assert.equal(nivelAlerta(7), 7);
  assert.equal(nivelAlerta(1), 1);
  assert.equal(nivelAlerta(0), 0);
  assert.equal(nivelAlerta(-5), 0);
});

test("sem data: nao gera alerta", () => {
  const r = avaliarCertificado(null, base);
  assert.equal(r.temData, false);
  assert.equal(r.alerta, false);
});

test("validade folgada (>30 dias): sem alerta", () => {
  const r = avaliarCertificado(emDias(60), base);
  assert.equal(r.alerta, false);
  assert.equal(r.nivelAlerta, null);
  assert.equal(r.diasRestantes, 60);
});

test("dentro de 30 dias: alerta com mensagem e data BR", () => {
  const r = avaliarCertificado(emDias(25), base);
  assert.equal(r.alerta, true);
  assert.equal(r.nivelAlerta, 30);
  assert.equal(r.vencido, false);
  assert.match(r.mensagem, /vence em 25 dia/);
  assert.match(r.mensagem, /\d{2}\/\d{2}\/\d{4}/);
});

test("vencido: nivel 0, bloqueio na mensagem", () => {
  const r = avaliarCertificado(emDias(-2), base);
  assert.equal(r.vencido, true);
  assert.equal(r.nivelAlerta, 0);
  assert.match(r.titulo, /vencido/i);
  assert.match(r.mensagem, /bloqueada/);
});

test("data invalida tratada como sem data", () => {
  const r = avaliarCertificado("nao-e-data", base);
  assert.equal(r.temData, false);
  assert.equal(r.alerta, false);
});
