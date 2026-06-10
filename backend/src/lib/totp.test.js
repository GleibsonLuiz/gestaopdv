import { test, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import otplib from "otplib";

const { authenticator } = otplib;

// CRIPTO_SECRET de teste (a lib cifra o segredo TOTP em repouso).
before(() => {
  if (!process.env.CRIPTO_SECRET) {
    process.env.CRIPTO_SECRET = crypto.randomBytes(32).toString("hex");
  }
});

const carregar = () => import("./totp.js");

test("segredo cifrado valida o codigo do momento e rejeita codigo errado", async () => {
  const { gerarSegredoTotp, cifrarSegredo, verificarCodigoTotp } = await carregar();
  const secret = gerarSegredoTotp();
  const blob = cifrarSegredo(secret);
  assert.notEqual(blob, secret); // em repouso so existe a versao cifrada

  const codigoValido = authenticator.generate(secret);
  assert.equal(verificarCodigoTotp(blob, codigoValido), true);
  // 6 digitos errados (vira o codigo valido +1 com wrap) — deve falhar
  const errado = String((Number(codigoValido) + 1) % 1000000).padStart(6, "0");
  assert.equal(verificarCodigoTotp(blob, errado), false);
});

test("entradas hostis nao passam nem crasham", async () => {
  const { gerarSegredoTotp, cifrarSegredo, verificarCodigoTotp } = await carregar();
  const blob = cifrarSegredo(gerarSegredoTotp());
  assert.equal(verificarCodigoTotp(blob, ""), false);
  assert.equal(verificarCodigoTotp(blob, null), false);
  assert.equal(verificarCodigoTotp(blob, "12345"), false);      // 5 digitos
  assert.equal(verificarCodigoTotp(blob, "abc123"), false);     // nao numerico
  assert.equal(verificarCodigoTotp(null, "123456"), false);     // sem segredo
  assert.equal(verificarCodigoTotp("blob:invalido", "123456"), false); // cifra corrompida
});

test("otpauth URL tem issuer e e renderizavel como QR svg", async () => {
  const { gerarSegredoTotp, urlOtpauth, qrCodeSvg } = await carregar();
  const secret = gerarSegredoTotp();
  const url = urlOtpauth("dono@loja.com", secret);
  assert.match(url, /^otpauth:\/\/totp\//);
  assert.match(url, /issuer=GestaoProMax/);
  const svg = await qrCodeSvg(url);
  assert.match(svg, /^<svg/);
});
