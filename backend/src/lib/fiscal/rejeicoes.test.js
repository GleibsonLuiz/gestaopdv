import test from "node:test";
import assert from "node:assert/strict";
import { traduzir, corpoErroFiscal, REJEICOES } from "./rejeicoes.js";

test("traduzir codigo conhecido devolve mensagem amigavel acionavel", () => {
  const r = traduzir("209");
  assert.equal(r.conhecido, true);
  assert.equal(r.cStat, "209");
  assert.match(r.titulo, /Inscricao Estadual/);
  assert.equal(r.quemResolve, "admin");
  assert.equal(r.campo, "inscEstadual");
  assert.ok(r.comoResolver.length > 0);
});

test("traduzir normaliza zeros a esquerda e espacos", () => {
  assert.equal(traduzir(" 0209 ").cStat, "209");
  assert.equal(traduzir(209).titulo, REJEICOES["209"].titulo);
});

test("traduzir codigo desconhecido cai no fallback usando o xMotivo cru", () => {
  const r = traduzir("777", "Rejeicao: motivo cru da SEFAZ");
  assert.equal(r.conhecido, false);
  assert.equal(r.oQueAconteceu, "Rejeicao: motivo cru da SEFAZ");
  assert.match(r.comoResolver, /777/); // cita o codigo p/ o suporte
  assert.equal(r.quemResolve, "suporte");
});

test("traduzir sem codigo nem motivo ainda devolve orientacao", () => {
  const r = traduzir(null, null);
  assert.equal(r.conhecido, false);
  assert.ok(r.titulo);
  assert.ok(r.comoResolver);
});

test("corpoErroFiscal mantem campos legados e acrescenta amigavel", () => {
  const body = corpoErroFiscal({ message: "boom", cStat: "281", xMotivo: "cert vencido" });
  // legado (frontend atual le `erro`)
  assert.equal(body.erro, REJEICOES["281"].titulo);
  assert.equal(body.cStat, "281");
  assert.equal(body.xMotivo, "cert vencido");
  // novo
  assert.equal(body.amigavel.quemResolve, "admin");
  assert.equal(body.amigavel.campo, "certificadoRef");
});

test("corpoErroFiscal preserva a mensagem original quando o codigo e desconhecido", () => {
  const body = corpoErroFiscal({ message: "Falha de rede ao comunicar com o gateway fiscal." });
  assert.equal(body.erro, "Falha de rede ao comunicar com o gateway fiscal.");
  assert.ok(body.amigavel.comoResolver);
});
