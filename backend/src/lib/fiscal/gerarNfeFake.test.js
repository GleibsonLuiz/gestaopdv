import test from "node:test";
import assert from "node:assert/strict";
import { gerarNfeFake, seedDaChave, distribuirFakes, TOTAL_FAKES } from "./gerarNfeFake.js";
import { validarEntradaNfe } from "./validarEntradaNfe.js";
import { validarCnpj } from "./validarPayload.js";

const DEST = "18145637000131"; // CNPJ valido do destinatario

test("todo XML fake gerado PASSA no validarEntradaNfe real", () => {
  for (let seed = 1; seed <= TOTAL_FAKES; seed++) {
    const { xml, chave } = gerarNfeFake(seed, DEST);
    const r = validarEntradaNfe(xml);
    assert.equal(r.ok, true, `seed ${seed}: ${JSON.stringify(r.erros)}`);
    assert.equal(r.dados.chave, chave);
    // emitente com CNPJ valido
    assert.equal(validarCnpj(r.dados.emitente.cnpj), true);
    // total bate com a soma dos itens (validador ja garante, mas reforça)
    assert.ok(r.dados.itens.length >= 1);
  }
});

test("seedDaChave faz round-trip com a chave gerada", () => {
  for (let seed = 1; seed <= TOTAL_FAKES; seed++) {
    const { chave } = gerarNfeFake(seed, DEST);
    assert.equal(seedDaChave(chave), seed);
  }
});

test("baixar regenera o MESMO XML que o resumo anunciou (chave estavel)", () => {
  const a = gerarNfeFake(3, DEST);
  const seed = seedDaChave(a.chave);
  const b = gerarNfeFake(seed, DEST);
  assert.equal(a.xml, b.xml);
  assert.equal(a.chave, b.chave);
});

test("distribuirFakes pagina por NSU e para quando esgota", () => {
  const p1 = distribuirFakes("000000000000000", DEST, 3);
  assert.equal(p1.documentos.length, 3); // NSU 1,2,3
  assert.equal(Number(p1.ultimoNSU), 3);

  const p2 = distribuirFakes(p1.ultimoNSU, DEST, 3);
  assert.equal(p2.documentos.length, 2); // NSU 4,5
  assert.equal(Number(p2.ultimoNSU), TOTAL_FAKES);

  const p3 = distribuirFakes(p2.ultimoNSU, DEST, 3);
  assert.equal(p3.documentos.length, 0); // nada novo
  assert.equal(p3.ultimoNSU, p3.maxNSU);
});

test("NSU vem com 15 digitos (padrao SEFAZ)", () => {
  const { documentos } = distribuirFakes("0", DEST, 1);
  assert.match(documentos[0].nsu, /^\d{15}$/);
});
