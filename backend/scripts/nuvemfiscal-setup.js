// ============================================================================
// Setup unico da empresa na NuvemFiscal (Sandbox) — Fase 0 do modulo fiscal.
//
// Faz, de uma vez:
//   1. Obtem token OAuth2 (client_credentials, scope "empresa nfce")
//   2. Cadastra a empresa (POST /empresas) — idempotente
//   3. Envia o certificado A1 (.pfx) (PUT /empresas/{cnpj}/certificado)
//   4. Configura a NFC-e + CSC (PUT /empresas/{cnpj}/nfce)
//
// USO:
//   1. Em backend/.env, defina:
//        FISCAL_NUVEMFISCAL_CLIENT_ID=...
//        FISCAL_NUVEMFISCAL_CLIENT_SECRET=...
//        # opcional (default = sandbox):
//        FISCAL_NUVEMFISCAL_BASE_URL=https://api.sandbox.nuvemfiscal.com.br
//   2. Copie scripts/nuvemfiscal-empresa.example.json para
//      scripts/nuvemfiscal-empresa.json e preencha (CNPJ, endereco, caminho
//      do .pfx, senha do certificado, CSC + idCSC).
//   3. Rode:  node scripts/nuvemfiscal-setup.js
//      (ou:   node scripts/nuvemfiscal-setup.js caminho/do/config.json)
//
// O arquivo nuvemfiscal-empresa.json contem segredos (senha do .pfx, CSC) e
// esta no .gitignore — nao commitar.
//
// Este script e descartavel: quando trocarmos de provedor (antes de 31/07),
// ele pode ser removido. Nao faz parte do runtime do servidor.
// ============================================================================

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.FISCAL_NUVEMFISCAL_BASE_URL || "https://api.sandbox.nuvemfiscal.com.br";
const AUTH_URL = process.env.FISCAL_NUVEMFISCAL_AUTH_URL || "https://auth.nuvemfiscal.com.br/oauth/token";

function abortar(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function lerConfig() {
  const arg = process.argv[2];
  const caminho = arg
    ? path.resolve(arg)
    : path.join(SCRIPT_DIR, "nuvemfiscal-empresa.json");
  if (!fs.existsSync(caminho)) {
    abortar(
      `Config nao encontrada: ${caminho}\n` +
      `Copie scripts/nuvemfiscal-empresa.example.json para nuvemfiscal-empresa.json e preencha.`
    );
  }
  return { config: JSON.parse(fs.readFileSync(caminho, "utf8")), caminho };
}

async function obterToken() {
  const id = process.env.FISCAL_NUVEMFISCAL_CLIENT_ID;
  const secret = process.env.FISCAL_NUVEMFISCAL_CLIENT_SECRET;
  if (!id || !secret) {
    abortar("Defina FISCAL_NUVEMFISCAL_CLIENT_ID e FISCAL_NUVEMFISCAL_CLIENT_SECRET no backend/.env.");
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials", client_id: id, client_secret: secret, scope: "empresa nfce",
  });
  const resp = await fetch(AUTH_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) abortar(`Falha na autenticacao (${resp.status}): ${JSON.stringify(data)}`);
  return data.access_token;
}

async function chamar(token, metodo, caminho, corpo) {
  const resp = await fetch(`${BASE_URL}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let data = null;
  try { data = await resp.json(); } catch { /* sem corpo */ }
  return { ok: resp.ok, status: resp.status, data };
}

async function main() {
  const { config, caminho } = lerConfig();
  console.log(`\n🔧 NuvemFiscal setup — base: ${BASE_URL}`);
  console.log(`   Config: ${caminho}\n`);

  const cnpj = String(config.cpf_cnpj || "").replace(/\D/g, "");
  if (!cnpj) abortar("config.cpf_cnpj ausente.");

  const token = await obterToken();
  console.log("✅ Token OAuth obtido.");

  // 2) Cadastrar empresa (idempotente) ------------------------------------
  const empresaBody = {
    cpf_cnpj: cnpj,
    nome_razao_social: config.nome_razao_social,
    nome_fantasia: config.nome_fantasia || undefined,
    inscricao_estadual: config.inscricao_estadual || undefined,
    inscricao_municipal: config.inscricao_municipal || undefined,
    email: config.email || undefined,
    endereco: config.endereco,
  };
  let r = await chamar(token, "POST", "/empresas", empresaBody);
  if (r.ok) {
    console.log("✅ Empresa cadastrada.");
  } else if (r.status === 409 || /existe|cadastrad/i.test(JSON.stringify(r.data || ""))) {
    console.log("ℹ️  Empresa ja existe — atualizando dados.");
    const up = await chamar(token, "PUT", `/empresas/${cnpj}`, empresaBody);
    if (!up.ok) console.warn(`⚠️  Falha ao atualizar empresa (${up.status}): ${JSON.stringify(up.data)}`);
  } else {
    abortar(`Falha ao cadastrar empresa (${r.status}): ${JSON.stringify(r.data)}`);
  }

  // 3) Enviar certificado A1 ----------------------------------------------
  const pfxPath = path.resolve(config.certificado_pfx_path);
  if (!fs.existsSync(pfxPath)) abortar(`Certificado .pfx nao encontrado: ${pfxPath}`);
  const certBase64 = fs.readFileSync(pfxPath).toString("base64");
  r = await chamar(token, "PUT", `/empresas/${cnpj}/certificado`, {
    certificado: certBase64,
    password: config.certificado_password,
  });
  if (r.ok) {
    console.log(`✅ Certificado enviado.${r.data?.validade ? ` Validade: ${r.data.validade}` : ""}`);
  } else {
    abortar(`Falha ao enviar certificado (${r.status}): ${JSON.stringify(r.data)}`);
  }

  // 4) Configurar NFC-e + CSC ---------------------------------------------
  // OBS: confirmar nomes dos campos na doc /docs/empresas (config NFC-e).
  // Estrutura usual: { ambiente, sefaz: { id_csc, csc } } ou campos no topo.
  const nfceBody = {
    ambiente: config.ambiente || "homologacao",
    id_csc: String(config.csc_id || ""),
    csc: config.csc || "",
  };
  r = await chamar(token, "PUT", `/empresas/${cnpj}/nfce`, nfceBody);
  if (r.ok) {
    console.log("✅ NFC-e configurada (CSC vinculado).");
  } else {
    console.warn(
      `⚠️  Falha ao configurar NFC-e/CSC (${r.status}): ${JSON.stringify(r.data)}\n` +
      `   Confira os nomes dos campos em https://dev.nuvemfiscal.com.br/docs/empresas e ajuste nfceBody.`
    );
  }

  console.log("\n🏁 Setup concluido. Proximo passo: ligar a emissao no sistema e rodar o checklist de homologacao.\n");
}

main().catch((e) => abortar(e?.message || String(e)));
