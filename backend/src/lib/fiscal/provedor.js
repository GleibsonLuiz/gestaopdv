// ============ CAMADA DE PROVEDOR FISCAL (GATEWAY) ============
//
// Abstrai o gateway fiscal (NuvemFiscal / Focus / PlugNotas) atras de uma
// interface unica. O resto do sistema (controller de emissao, Fase 3+) fala
// SO com esta interface — nunca com a API de um provedor especifico. Trocar
// de provedor = adicionar um novo adapter aqui, sem tocar no controller.
//
// O provedor e ESCOLHIDO por ConfiguracaoEmpresa.provedorFiscal (por tenant),
// mas as CREDENCIAIS de acesso ao gateway sao da PLATAFORMA (env vars) — um
// contrato nosso com o provedor cobre todos os tenants. O vinculo do tenant
// e o CNPJ do emitente (a empresa/certificado ja cadastrados no gateway).
//
// Contrato normalizado (o que todo adapter recebe/devolve):
//
//   emitirNfce({ cnpjEmitente, ambiente, payload, referencia })
//     -> ResultadoEmissao
//   consultarNfce({ cnpjEmitente, idIntegracao })           -> ResultadoEmissao
//   cancelarNfce({ cnpjEmitente, idIntegracao, justificativa }) -> ResultadoEmissao
//   inutilizarNumeracao({ cnpjEmitente, ambiente, serie,
//                         numeroInicial, numeroFinal, justificativa }) -> ResultadoInutilizacao
//   consultarStatusServico({ cnpjEmitente, ambiente })      -> { online, cStat, xMotivo }
//   consultarCertificado({ cnpjEmitente })                  -> { validade, emissor, serial }
//   obterPdfDanfe({ cnpjEmitente, idIntegracao })           -> Buffer (PDF)
//   obterXml({ cnpjEmitente, idIntegracao })                -> string (XML)
//
//   ---- Distribuicao DF-e (NF-e recebidas CONTRA o nosso CNPJ — Epico Entrada) ----
//   distribuirDFe({ cnpjEmitente, ultimoNSU })
//     -> { ultimoNSU, maxNSU, documentos: [{ nsu, tipo, chave, emitenteCnpj,
//          emitenteNome, valorTotal, dataEmissao }] }
//   manifestar({ cnpjEmitente, chave, tipoEvento, justificativa }) -> { ok, cStat, xMotivo }
//   baixarXmlEntrada({ cnpjEmitente, chave })               -> string (XML completo)
//
//   ambiente: "HOMOLOGACAO" | "PRODUCAO" (nosso enum AmbienteFiscal)
//   payload: objeto da NFC-e ja montado pela Fase 3 (lib/fiscal/montarNfce.js)
//   referencia: id externo de idempotencia (ex.: id da NotaFiscal local)
//
// ResultadoEmissao (campos que mapeiam 1:1 para o model NotaFiscal):
//   { status, cStat, xMotivo, chaveAcesso, protocolo, dataAutorizacao,
//     digestValue, qrCode, urlConsulta, xmlAutorizado, idIntegracao }
//   status: um valor do enum StatusSefaz (AUTORIZADA, REJEITADA, ...).
//
// ---- NFS-e (servicos / ISS, municipal) — contrato paralelo ao da NFC-e ----
// A NFS-e e documento MUNICIPAL (imposto ISS, leiaute DPS) e tem ciclo proprio:
// nao ha inutilizacao nem QR/CSC; o "numero" e o "codigo de verificacao" sao
// atribuidos pela prefeitura. Metodos:
//
//   emitirNfse({ ambiente, payload, referencia })   -> ResultadoEmissaoNfse
//   consultarNfse({ idIntegracao })                 -> ResultadoEmissaoNfse
//   cancelarNfse({ idIntegracao, justificativa })   -> ResultadoEmissaoNfse
//   obterPdfNfse({ idIntegracao })                  -> Buffer (PDF DANFSE)
//   obterXmlNfse({ idIntegracao })                  -> string (XML)
//   configurarEmpresaNfse({ cnpjEmitente, ... })    -> objeto (opcional, setup)
//
//   payload: objeto infDPS ja montado por lib/fiscal/montarNfse.js
//
// ResultadoEmissaoNfse (campos 1:1 com os campos NFS-e do model NotaFiscal):
//   { status, cStat, xMotivo, numeroNfse, codigoVerificacao, protocolo,
//     dataAutorizacao, xmlAutorizado, idIntegracao }

import * as nuvemfiscal from "./nuvemfiscal.js";
import * as mock from "./mock.js";

// Erro normalizado de qualquer provedor. O controller pega `cStat`/`xMotivo`
// para gravar na NotaFiscal e devolver ao usuario sem vazar detalhe do gateway.
export class ErroFiscal extends Error {
  constructor(message, { cStat = null, xMotivo = null, status = null, detalhe = null } = {}) {
    super(message);
    this.name = "ErroFiscal";
    this.cStat = cStat;       // codigo SEFAZ (ex.: "539") quando houver
    this.xMotivo = xMotivo;   // descricao da rejeicao/erro
    this.httpStatus = status; // status HTTP do gateway, p/ diagnostico
    this.detalhe = detalhe;   // corpo cru do erro (logs), nunca exposto ao cliente
  }
}

// Adapters registrados. A chave bate com ConfiguracaoEmpresa.provedorFiscal.
const ADAPTERS = {
  nuvemfiscal,
  mock, // simulador (dev/demo) — sem certificado, sem SEFAZ, sem valor fiscal
  // focusnfe: (a implementar)
  // plugnotas: (a implementar)
};

// Resolve o adapter do provedor configurado para o tenant. Lanca ErroFiscal
// se o provedor nao foi escolhido ou ainda nao tem adapter.
export function getProvedor(nomeProvedor) {
  if (!nomeProvedor) {
    throw new ErroFiscal("Provedor fiscal nao configurado. Defina em Configuracoes > Emissao Fiscal.");
  }
  const chave = String(nomeProvedor).toLowerCase();
  const adapter = ADAPTERS[chave];
  if (!adapter) {
    throw new ErroFiscal(`Provedor fiscal "${nomeProvedor}" ainda nao suportado.`);
  }
  return adapter;
}

// Normaliza nosso enum de ambiente para o termo do gateway (todos usam
// "homologacao"/"producao" em minusculas no corpo das requisicoes).
export function ambienteParaGateway(ambienteFiscal) {
  return ambienteFiscal === "PRODUCAO" ? "producao" : "homologacao";
}
