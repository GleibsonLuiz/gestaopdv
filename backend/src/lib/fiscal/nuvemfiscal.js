// ============ ADAPTER: NuvemFiscal (gateway fiscal) ============
//
// Implementa o contrato de provedor.js para a API REST da NuvemFiscal.
// Doc oficial: https://dev.nuvemfiscal.com.br/docs/api
//
// CREDENCIAIS (env vars da PLATAFORMA — nao por tenant):
//   FISCAL_NUVEMFISCAL_CLIENT_ID
//   FISCAL_NUVEMFISCAL_CLIENT_SECRET
//   FISCAL_NUVEMFISCAL_BASE_URL  (opcional — default api.nuvemfiscal.com.br)
//   FISCAL_NUVEMFISCAL_AUTH_URL  (opcional — default auth.nuvemfiscal.com.br/oauth/token)
//
// Autenticacao: OAuth2 client_credentials -> Bearer token (cacheado em memoria
// ate ~expirar). Em serverless (Fluid Compute) a instancia e reusada entre
// requisicoes, entao o cache evita um round-trip de auth por nota.
//
// NOTA DE IMPLEMENTACAO: os nomes de campos da resposta (chave_acesso,
// numero_protocolo, digest_value, qrcode...) seguem a referencia da API da
// NuvemFiscal. As leituras abaixo sao DEFENSIVAS (aceitam variacoes de nome)
// para reduzir quebra, mas devem ser conferidas contra a conta/doc real
// durante a Fase 0/testes antes do go-live.

import { ErroFiscal } from "./provedor.js";

const BASE_URL = process.env.FISCAL_NUVEMFISCAL_BASE_URL || "https://api.nuvemfiscal.com.br";
const AUTH_URL = process.env.FISCAL_NUVEMFISCAL_AUTH_URL || "https://auth.nuvemfiscal.com.br/oauth/token";
const SCOPE = "nfce nfse empresa";

// Cache do token (escopo do modulo — vive enquanto a instancia serverless viver).
let tokenCache = { value: null, expiraEm: 0 };

function credenciais() {
  const id = process.env.FISCAL_NUVEMFISCAL_CLIENT_ID;
  const secret = process.env.FISCAL_NUVEMFISCAL_CLIENT_SECRET;
  if (!id || !secret) {
    throw new ErroFiscal(
      "Credenciais do gateway fiscal (NuvemFiscal) nao configuradas no servidor."
    );
  }
  return { id, secret };
}

async function obterToken() {
  const agora = Date.now();
  if (tokenCache.value && agora < tokenCache.expiraEm) return tokenCache.value;

  const { id, secret } = credenciais();
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: id,
    client_secret: secret,
    scope: SCOPE,
  });

  let resp;
  try {
    resp = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (e) {
    throw new ErroFiscal("Falha de rede ao autenticar no gateway fiscal.", { detalhe: e.message });
  }

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    throw new ErroFiscal("Falha ao autenticar no gateway fiscal.", {
      status: resp.status,
      detalhe: data,
    });
  }

  // Margem de 60s para nao usar um token que expira no meio do request.
  const ttlMs = ((data.expires_in || 3600) - 60) * 1000;
  tokenCache = { value: data.access_token, expiraEm: agora + Math.max(ttlMs, 30_000) };
  return tokenCache.value;
}

// Helper HTTP generico para a API. `raw=true` devolve o Response (p/ baixar
// PDF/XML como binario/texto). Caso contrario devolve JSON ja parseado.
async function chamar(metodo, caminho, { body, query, raw = false } = {}) {
  const token = await obterToken();
  let url = `${BASE_URL}${caminho}`;
  if (query) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(query).filter(([, v]) => v != null))
    );
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const headers = { Authorization: `Bearer ${token}` };
  let corpo;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    corpo = JSON.stringify(body);
  }

  let resp;
  try {
    resp = await fetch(url, { method: metodo, headers, body: corpo });
  } catch (e) {
    throw new ErroFiscal("Falha de rede ao comunicar com o gateway fiscal.", { detalhe: e.message });
  }

  if (raw) {
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw erroDaResposta(resp.status, data);
    }
    return resp;
  }

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw erroDaResposta(resp.status, data);
  return data;
}

// Converte um corpo de erro da NuvemFiscal em ErroFiscal normalizado.
// A API costuma devolver { error: { message, code } } ou { message }.
function erroDaResposta(status, data) {
  const msg =
    data?.error?.message ||
    data?.message ||
    data?.erro ||
    `Erro ${status} no gateway fiscal`;
  return new ErroFiscal(msg, {
    status,
    cStat: data?.error?.code || data?.codigo_status || null,
    xMotivo: data?.error?.message || data?.motivo_status || null,
    detalhe: data,
  });
}

// Le a primeira chave existente dentre varias (tolera variacao de nomes).
function pick(obj, ...chaves) {
  if (!obj) return null;
  for (const k of chaves) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return null;
}

// Mapeia o status textual da NuvemFiscal para o nosso enum StatusSefaz.
function mapearStatus(s) {
  switch (String(s || "").toLowerCase()) {
    case "autorizado": return "AUTORIZADA";
    case "rejeitado": return "REJEITADA";
    case "denegado": return "DENEGADA";
    case "cancelado": return "CANCELADA";
    case "pendente":
    case "processando": return "PROCESSANDO";
    case "erro": return "ERRO";
    default: return "PROCESSANDO";
  }
}

// Normaliza o documento NFC-e da NuvemFiscal para o ResultadoEmissao do
// contrato (campos 1:1 com o model NotaFiscal).
function mapearResultado(doc) {
  const aut = doc?.autorizacao || doc;
  return {
    status: mapearStatus(pick(doc, "status")),
    cStat: String(pick(aut, "codigo_status", "cStat") ?? "") || null,
    xMotivo: pick(aut, "motivo_status", "xMotivo") || null,
    chaveAcesso: pick(doc, "chave", "chave_acesso") || pick(aut, "chave_acesso", "chave"),
    protocolo: pick(aut, "numero_protocolo", "protocolo", "nProt"),
    dataAutorizacao: pick(aut, "data_recebimento", "data_autorizacao", "dhRecbto"),
    digestValue: pick(aut, "digest_value", "digestValue"),
    qrCode: pick(doc, "qrcode", "qr_code", "url_qrcode"),
    urlConsulta: pick(doc, "url_consulta_nfce", "url_consulta", "urlChave"),
    xmlAutorizado: null, // baixado sob demanda via obterXml()
    idIntegracao: pick(doc, "id"),
  };
}

// ---------- METODOS DO CONTRATO ----------

// Emite a NFC-e. `payload` ja vem montado pela Fase 3 (objeto infNFe). A
// NuvemFiscal recebe { infNFe, ambiente }. `referencia` permite idempotencia.
export async function emitirNfce({ ambiente, payload, referencia }) {
  const doc = await chamar("POST", "/nfce", {
    body: {
      ambiente: ambiente === "PRODUCAO" ? "producao" : "homologacao",
      referencia: referencia || undefined,
      infNFe: payload,
    },
  });
  return mapearResultado(doc);
}

export async function consultarNfce({ idIntegracao }) {
  if (!idIntegracao) throw new ErroFiscal("idIntegracao ausente na consulta.");
  const doc = await chamar("GET", `/nfce/${encodeURIComponent(idIntegracao)}`);
  return mapearResultado(doc);
}

export async function cancelarNfce({ idIntegracao, justificativa }) {
  if (!idIntegracao) throw new ErroFiscal("idIntegracao ausente no cancelamento.");
  if (!justificativa || String(justificativa).trim().length < 15) {
    throw new ErroFiscal("Justificativa de cancelamento deve ter ao menos 15 caracteres.");
  }
  const doc = await chamar("POST", `/nfce/${encodeURIComponent(idIntegracao)}/cancelamento`, {
    body: { justificativa: String(justificativa).trim() },
  });
  return mapearResultado(doc);
}

export async function inutilizarNumeracao({
  cnpjEmitente, ambiente, serie, numeroInicial, numeroFinal, justificativa,
}) {
  if (!justificativa || String(justificativa).trim().length < 15) {
    throw new ErroFiscal("Justificativa de inutilizacao deve ter ao menos 15 caracteres.");
  }
  const doc = await chamar("POST", "/nfce/inutilizacoes", {
    body: {
      ambiente: ambiente === "PRODUCAO" ? "producao" : "homologacao",
      cnpj: String(cnpjEmitente || "").replace(/\D/g, ""),
      ano: new Date().getFullYear() % 100,
      serie,
      numero_inicial: numeroInicial,
      numero_final: numeroFinal,
      justificativa: String(justificativa).trim(),
    },
  });
  return {
    status: mapearStatus(pick(doc, "status")),
    cStat: String(pick(doc, "codigo_status", "cStat") ?? "") || null,
    xMotivo: pick(doc, "motivo_status", "xMotivo") || null,
    protocolo: pick(doc, "numero_protocolo", "protocolo"),
    idIntegracao: pick(doc, "id"),
  };
}

export async function consultarStatusServico({ cnpjEmitente, ambiente }) {
  const doc = await chamar("GET", "/nfce/sefaz/status", {
    query: {
      cpf_cnpj: String(cnpjEmitente || "").replace(/\D/g, ""),
      ambiente: ambiente === "PRODUCAO" ? "producao" : "homologacao",
    },
  });
  const cStat = String(pick(doc, "codigo_status", "cStat") ?? "") || null;
  return {
    online: cStat === "107", // 107 = Servico em Operacao
    cStat,
    xMotivo: pick(doc, "motivo_status", "xMotivo") || null,
  };
}

export async function obterPdfDanfe({ idIntegracao }) {
  if (!idIntegracao) throw new ErroFiscal("idIntegracao ausente ao obter DANFE.");
  const resp = await chamar("GET", `/nfce/${encodeURIComponent(idIntegracao)}/pdf`, { raw: true });
  const arrayBuf = await resp.arrayBuffer();
  return Buffer.from(arrayBuf);
}

export async function obterXml({ idIntegracao }) {
  if (!idIntegracao) throw new ErroFiscal("idIntegracao ausente ao obter XML.");
  const resp = await chamar("GET", `/nfce/${encodeURIComponent(idIntegracao)}/xml`, { raw: true });
  return resp.text();
}

// ============ NFS-e (servicos / ISS — padrao DPS nacional) ============
//
// Endpoints simetricos aos da NFC-e (POST /nfse, GET /nfse/{id}, .../cancelamento,
// .../pdf, .../xml). O corpo de emissao e { ambiente, referencia, infDPS } — o
// infDPS ja vem montado por lib/fiscal/montarNfse.js no leiaute nacional.
//
// RESSALVA (igual a da NFC-e): os nomes dos campos da RESPOSTA NFS-e
// (numero, codigo_verificacao, data_emissao, mensagens[].codigo/descricao...)
// seguem a referencia da API e sao lidos de forma DEFENSIVA. Conferir contra a
// conta/doc real durante a homologacao antes do go-live.

// Normaliza o documento NFS-e para o ResultadoEmissaoNfse do contrato.
function mapearResultadoNfse(doc) {
  const msg = Array.isArray(doc?.mensagens) ? doc.mensagens[0] : null;
  return {
    status: mapearStatus(pick(doc, "status")),
    cStat: String(pick(doc, "codigo_status", "cStat") ?? (msg ? pick(msg, "codigo") : "") ?? "") || null,
    xMotivo: pick(doc, "motivo_status", "xMotivo") || (msg ? pick(msg, "descricao") : null),
    numeroNfse: pick(doc, "numero", "numero_nfse") || null,
    codigoVerificacao: pick(doc, "codigo_verificacao", "codigoVerificacao") || null,
    protocolo: pick(doc, "numero_protocolo", "protocolo") || null,
    dataAutorizacao: pick(doc, "data_emissao", "data_autorizacao", "data_processamento"),
    xmlAutorizado: null, // baixado sob demanda via obterXmlNfse()
    idIntegracao: pick(doc, "id"),
  };
}

export async function emitirNfse({ ambiente, payload, referencia }) {
  const doc = await chamar("POST", "/nfse", {
    body: {
      ambiente: ambiente === "PRODUCAO" ? "producao" : "homologacao",
      referencia: referencia || undefined,
      infDPS: payload,
    },
  });
  return mapearResultadoNfse(doc);
}

export async function consultarNfse({ idIntegracao }) {
  if (!idIntegracao) throw new ErroFiscal("idIntegracao ausente na consulta NFS-e.");
  const doc = await chamar("GET", `/nfse/${encodeURIComponent(idIntegracao)}`);
  return mapearResultadoNfse(doc);
}

export async function cancelarNfse({ idIntegracao, justificativa }) {
  if (!idIntegracao) throw new ErroFiscal("idIntegracao ausente no cancelamento NFS-e.");
  if (!justificativa || String(justificativa).trim().length < 15) {
    throw new ErroFiscal("Justificativa de cancelamento deve ter ao menos 15 caracteres.");
  }
  const doc = await chamar("POST", `/nfse/${encodeURIComponent(idIntegracao)}/cancelamento`, {
    body: { justificativa: String(justificativa).trim() },
  });
  return mapearResultadoNfse(doc);
}

export async function obterPdfNfse({ idIntegracao }) {
  if (!idIntegracao) throw new ErroFiscal("idIntegracao ausente ao obter DANFSE.");
  const resp = await chamar("GET", `/nfse/${encodeURIComponent(idIntegracao)}/pdf`, { raw: true });
  const arrayBuf = await resp.arrayBuffer();
  return Buffer.from(arrayBuf);
}

export async function obterXmlNfse({ idIntegracao }) {
  if (!idIntegracao) throw new ErroFiscal("idIntegracao ausente ao obter XML NFS-e.");
  const resp = await chamar("GET", `/nfse/${encodeURIComponent(idIntegracao)}/xml`, { raw: true });
  return resp.text();
}

// Cadastra/atualiza a empresa para NFS-e no gateway (PUT /empresas/{cnpj}/nfse).
// Usado pelo script de setup (Fase 8), nao pelo fluxo de emissao.
export async function configurarEmpresaNfse({ cnpjEmitente, config }) {
  const cnpj = String(cnpjEmitente || "").replace(/\D/g, "");
  if (!cnpj) throw new ErroFiscal("CNPJ do emitente ausente ao configurar NFS-e.");
  return chamar("PUT", `/empresas/${cnpj}/nfse`, { body: config });
}

// ============ CERTIFICADO A1 (monitoramento de validade — Onda 5) ============
//
// O A1 fica no gateway (nao no nosso banco). Consultamos a validade para o cron
// alertar antes do vencimento. GET /empresas/{cnpj}/certificado costuma devolver
// not_valid_after / not_valid_before / serial_number / issuer_name. Leitura
// DEFENSIVA (varios nomes possiveis) — confirmar contra a conta real.
export async function consultarCertificado({ cnpjEmitente }) {
  const cnpj = String(cnpjEmitente || "").replace(/\D/g, "");
  if (!cnpj) throw new ErroFiscal("CNPJ do emitente ausente ao consultar certificado.");
  const doc = await chamar("GET", `/empresas/${cnpj}/certificado`);
  return {
    validade: pick(doc, "not_valid_after", "vencimento", "validade", "valid_to", "data_validade", "expiration"),
    emissor: pick(doc, "issuer_name", "emissor"),
    serial: pick(doc, "serial_number", "serial"),
  };
}

// ============ DISTRIBUICAO DF-e (Fase B — NF-e recebidas contra o CNPJ) ============
//
// A distribuicao real exige (1) certificado A1 do CNPJ cadastrado no gateway em
// PRODUCAO e (2) confirmar os endpoints/plano da NuvemFiscal (DistribuicaoNFe +
// manifestacao do destinatario). Enquanto isso, o sistema usa o provedor `mock`.
// Estes metodos ficam como contrato; ligar na Fase B = implementar as chamadas
// HTTP reais (GET /distribuicao/nfe?ult_nsu=..., POST manifestacao, GET xml) e
// confirmar os nomes dos campos da resposta — mesma ressalva dos demais.
const ERRO_FASE_B = "Distribuicao de DF-e ainda nao habilitada para a NuvemFiscal (Fase B: requer certificado A1 em producao + confirmacao do endpoint). Use o provedor simulador para testar o fluxo.";

export async function distribuirDFe() {
  throw new ErroFiscal(ERRO_FASE_B);
}
export async function manifestar() {
  throw new ErroFiscal(ERRO_FASE_B);
}
export async function baixarXmlEntrada() {
  throw new ErroFiscal(ERRO_FASE_B);
}
