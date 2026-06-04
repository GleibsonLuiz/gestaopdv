// ============ ADAPTER: SIMULADOR (mock) ============
//
// Provedor FICTICIO para desenvolvimento/demonstracao SEM certificado e SEM
// comunicacao com a SEFAZ. "Autoriza" toda NFC-e na hora, gerando dados
// plausiveis (chave de acesso de 44 digitos com DV valido, protocolo, QR
// Code, XML minimo). NAO tem qualquer valor fiscal.
//
// Use selecionando provedorFiscal = "mock" em Configuracoes > Emissao Fiscal.
// Quando houver um emitente real (CNPJ + certificado + CSC), troque para um
// provedor real (nuvemfiscal/...). Implementa o mesmo contrato de provedor.js.

import crypto from "node:crypto";
import { ErroFiscal } from "./provedor.js";
import { distribuirFakes, gerarNfeFake, seedDaChave } from "./gerarNfeFake.js";

// Estado em memoria (vive enquanto o processo viver) — guarda o resultado de
// cada emissao por idIntegracao, p/ consultar/obterXml depois na mesma sessao.
const SIMULADOS = new Map();

// Digito verificador da chave (modulo 11, pesos 2..9 ciclicos da direita).
function dvMod11(chave43) {
  let soma = 0, peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return String(resto === 0 || resto === 1 ? 0 : 11 - resto);
}

// Monta a chave de acesso (44) a partir do payload infNFe.
function gerarChave(payload) {
  const ide = payload?.ide || {};
  const emit = payload?.emit || {};
  const cUF = String(ide.cUF || "29").replace(/\D/g, "").padStart(2, "0");
  const dh = String(ide.dhEmi || new Date().toISOString());
  const aamm = dh.slice(2, 4) + dh.slice(5, 7); // AAMM
  const cnpj = String(emit.CNPJ || "").replace(/\D/g, "").padStart(14, "0");
  const mod = String(ide.mod || "65").padStart(2, "0");
  const serie = String(ide.serie || "1").padStart(3, "0");
  const nNF = String(ide.nNF || "1").padStart(9, "0");
  const tpEmis = String(ide.tpEmis || "1").slice(0, 1);
  const cNF = String(ide.cNF || "0").replace(/\D/g, "").padStart(8, "0");
  const base43 = cUF + aamm + cnpj + mod + serie + nNF + tpEmis + cNF;
  return base43 + dvMod11(base43);
}

function protocoloFake() {
  // 15 digitos, padrao "1" (BA) + 14 digitos.
  return "1" + String(Date.now()).slice(-11).padStart(11, "0") + String(Math.floor(Math.random() * 1000)).padStart(3, "0");
}

export async function emitirNfce({ ambiente, payload }) {
  const chaveAcesso = gerarChave(payload);
  const tpAmb = ambiente === "PRODUCAO" ? "1" : "2";
  const idIntegracao = crypto.randomUUID();
  // URL de consulta no padrao QR Code v2 (apenas para o QR renderizar — nao
  // resolve numa SEFAZ real, pois e simulacao).
  const urlConsulta = "https://www.sefaz.ba.gov.br/nfce/consulta";
  const qrCode =
    `https://www.sefaz.ba.gov.br/nfce/qrcode?p=${chaveAcesso}|2|${tpAmb}|1|${crypto.randomBytes(20).toString("hex").toUpperCase()}`;

  const resultado = {
    status: "AUTORIZADA",
    cStat: "100",
    xMotivo: "Autorizado o uso da NF-e (SIMULADO - SEM VALOR FISCAL)",
    chaveAcesso,
    protocolo: protocoloFake(),
    dataAutorizacao: new Date().toISOString(),
    digestValue: crypto.randomBytes(20).toString("base64"),
    qrCode,
    urlConsulta,
    xmlAutorizado: null,
    idIntegracao,
  };
  SIMULADOS.set(idIntegracao, resultado);
  return resultado;
}

export async function consultarNfce({ idIntegracao }) {
  const r = SIMULADOS.get(idIntegracao);
  if (r) return r;
  // Sem estado (processo reiniciou): devolve AUTORIZADA generica sem zerar a
  // chave ja gravada (o controller mantem o que ja tinha se vier null).
  return {
    status: "AUTORIZADA", cStat: "100",
    xMotivo: "Autorizado o uso da NF-e (SIMULADO)",
    chaveAcesso: null, protocolo: null, dataAutorizacao: null,
    digestValue: null, qrCode: null, urlConsulta: null, idIntegracao,
  };
}

export async function cancelarNfce({ idIntegracao }) {
  const orig = SIMULADOS.get(idIntegracao);
  return {
    status: "CANCELADA", cStat: "135",
    xMotivo: "Evento registrado e vinculado a NF-e (SIMULADO)",
    chaveAcesso: orig?.chaveAcesso || null,
    protocolo: protocoloFake(),
    dataAutorizacao: orig?.dataAutorizacao || null,
    digestValue: null, qrCode: null, urlConsulta: null, idIntegracao,
  };
}

export async function inutilizarNumeracao() {
  return {
    status: "INUTILIZADA", cStat: "102",
    xMotivo: "Inutilizacao de numero homologada (SIMULADO)",
    protocolo: protocoloFake(), idIntegracao: crypto.randomUUID(),
  };
}

export async function consultarStatusServico() {
  return { online: true, cStat: "107", xMotivo: "Servico em Operacao (SIMULADO)" };
}

// Certificado A1 simulado: sempre valido por ~180 dias (nao ha .pfx no mock).
// O cron de monitoramento pula tenants com provedor "mock", mas o metodo existe
// para completude do contrato e testes manuais.
export async function consultarCertificado() {
  return {
    validade: new Date(Date.now() + 180 * 86400000).toISOString(),
    emissor: "AC SIMULADA",
    serial: "SIMULADO",
  };
}

// ============ DISTRIBUICAO DF-e (NF-e recebidas) — simulado ============
// Simula a SEFAZ entregando NF-es emitidas contra o nosso CNPJ. Determinístico
// pelo cursor NSU (lib/fiscal/gerarNfeFake.js): cada sincronizacao traz ate 3
// resumos novos ate esgotar o lote fake. baixarXmlEntrada regenera o XML
// completo a partir da chave (que carrega o seed).
export async function distribuirDFe({ cnpjEmitente, ultimoNSU }) {
  return distribuirFakes(ultimoNSU, cnpjEmitente, 3);
}

export async function manifestar({ chave }) {
  if (!chave) throw new ErroFiscal("Chave ausente na manifestacao (SIMULADO).");
  return { ok: true, cStat: "135", xMotivo: "Evento de ciencia registrado (SIMULADO)" };
}

export async function baixarXmlEntrada({ cnpjEmitente, chave }) {
  const seed = seedDaChave(chave);
  if (!seed) throw new ErroFiscal("Chave invalida para download (SIMULADO).");
  return gerarNfeFake(seed, cnpjEmitente).xml;
}

export async function obterPdfDanfe() {
  // O DANFE e renderizado no proprio sistema (CupomDanfeNfce). O simulador
  // nao entrega PDF — o controller nao usa este metodo no fluxo atual.
  throw new ErroFiscal("PDF nao disponivel no simulador (DANFE e gerado no sistema).");
}

export async function obterXml({ idIntegracao }) {
  const r = SIMULADOS.get(idIntegracao);
  const chave = r?.chaveAcesso || "".padStart(44, "0");
  const prot = r?.protocolo || protocoloFake();
  // XML minimo so para o botao "baixar XML" produzir um arquivo. NAO e um
  // procNFe valido — e simulacao.
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- DOCUMENTO SIMULADO - SEM VALOR FISCAL -->
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe Id="NFe${chave}"><!-- conteudo simulado --></infNFe></NFe>
  <protNFe versao="4.00"><infProt><chNFe>${chave}</chNFe><nProt>${prot}</nProt><cStat>100</cStat><xMotivo>Autorizado (SIMULADO)</xMotivo></infProt></protNFe>
</nfeProc>`;
}

// ============ NFS-e (servicos / ISS) — simulado ============
// Estado separado por idIntegracao da NFS-e.
const SIMULADOS_NFSE = new Map();

// Numero da NFS-e (sequencia ficticia baseada no nDPS do payload, com fallback).
function numeroNfseFake(payload) {
  const n = payload?.nDPS || payload?.serie ? String(payload.nDPS || "") : "";
  return n || String(Date.now()).slice(-9);
}

export async function emitirNfse({ payload }) {
  const idIntegracao = crypto.randomUUID();
  const resultado = {
    status: "AUTORIZADA",
    cStat: "100",
    xMotivo: "NFS-e autorizada (SIMULADO - SEM VALOR FISCAL)",
    numeroNfse: numeroNfseFake(payload),
    codigoVerificacao: crypto.randomBytes(6).toString("hex").toUpperCase(),
    protocolo: protocoloFake(),
    dataAutorizacao: new Date().toISOString(),
    xmlAutorizado: null,
    idIntegracao,
  };
  SIMULADOS_NFSE.set(idIntegracao, { resultado, payload });
  return resultado;
}

export async function consultarNfse({ idIntegracao }) {
  const r = SIMULADOS_NFSE.get(idIntegracao)?.resultado;
  if (r) return r;
  return {
    status: "AUTORIZADA", cStat: "100",
    xMotivo: "NFS-e autorizada (SIMULADO)",
    numeroNfse: null, codigoVerificacao: null, protocolo: null,
    dataAutorizacao: null, xmlAutorizado: null, idIntegracao,
  };
}

export async function cancelarNfse({ idIntegracao }) {
  const orig = SIMULADOS_NFSE.get(idIntegracao)?.resultado;
  return {
    status: "CANCELADA", cStat: "135",
    xMotivo: "Cancelamento de NFS-e homologado (SIMULADO)",
    numeroNfse: orig?.numeroNfse || null,
    codigoVerificacao: orig?.codigoVerificacao || null,
    protocolo: protocoloFake(),
    dataAutorizacao: orig?.dataAutorizacao || null,
    xmlAutorizado: null, idIntegracao,
  };
}

// PDF minimo valido (um retangulo com texto) so para o botao "Abrir DANFSE"
// produzir um arquivo abrivel. NAO e um DANFSE real — e simulacao.
export async function obterPdfNfse({ idIntegracao }) {
  const dados = SIMULADOS_NFSE.get(idIntegracao);
  const num = dados?.resultado?.numeroNfse || "SIMULADO";
  const texto = `DANFSE SIMULADO - SEM VALOR FISCAL - NFS-e ${num}`;
  const conteudo = `BT /F1 14 Tf 50 740 Td (${texto}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => { pdf += `${String(off).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

export async function obterXmlNfse({ idIntegracao }) {
  const r = SIMULADOS_NFSE.get(idIntegracao)?.resultado;
  const num = r?.numeroNfse || "0";
  const cod = r?.codigoVerificacao || "SIMULADO";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- DOCUMENTO SIMULADO - SEM VALOR FISCAL -->
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse">
  <infNFSe><nNFSe>${num}</nNFSe><cVerif>${cod}</cVerif><!-- conteudo simulado --></infNFSe>
</NFSe>`;
}
