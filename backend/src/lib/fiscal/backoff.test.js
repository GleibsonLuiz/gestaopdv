import test from "node:test";
import assert from "node:assert/strict";
import {
  intervaloSegundos, deveDesistir, estaVencida, proximaTentativaEm,
  MAX_TENTATIVAS, ESCALA_SEGUNDOS,
} from "./backoff.js";

test("intervaloSegundos cresce e satura no ultimo degrau", () => {
  assert.equal(intervaloSegundos(0), 30);
  assert.equal(intervaloSegundos(1), 120);
  assert.equal(intervaloSegundos(5), 3600);
  assert.equal(intervaloSegundos(MAX_TENTATIVAS - 1), ESCALA_SEGUNDOS.at(-1));
  // satura: tentativa alem da escala usa o ultimo valor
  assert.equal(intervaloSegundos(999), ESCALA_SEGUNDOS.at(-1));
  // negativo clampa em 0
  assert.equal(intervaloSegundos(-3), 30);
});

test("deveDesistir so apos esgotar a escala", () => {
  assert.equal(deveDesistir(MAX_TENTATIVAS - 1), false);
  assert.equal(deveDesistir(MAX_TENTATIVAS), true);
  assert.equal(deveDesistir(MAX_TENTATIVAS + 5), true);
});

test("estaVencida respeita o intervalo do degrau atual", () => {
  const ultima = new Date("2026-06-02T12:00:00Z");
  // tentativa 0 -> 30s de espera
  assert.equal(estaVencida(0, ultima, new Date("2026-06-02T12:00:29Z")), false);
  assert.equal(estaVencida(0, ultima, new Date("2026-06-02T12:00:30Z")), true);
  // tentativa 1 -> 120s
  assert.equal(estaVencida(1, ultima, new Date("2026-06-02T12:01:59Z")), false);
  assert.equal(estaVencida(1, ultima, new Date("2026-06-02T12:02:00Z")), true);
});

test("estaVencida sem ultimaTentativa = vencida (primeira passada)", () => {
  assert.equal(estaVencida(0, null), true);
});

test("proximaTentativaEm aplica o intervalo (jitter injetavel)", () => {
  const desde = new Date("2026-06-02T12:00:00Z");
  const r = proximaTentativaEm(1, { desde, jitterFn: () => 1 }); // 120s exatos
  assert.equal(r.toISOString(), "2026-06-02T12:02:00.000Z");
});
