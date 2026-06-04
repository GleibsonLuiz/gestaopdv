// ============ MONTAGEM DO PAYLOAD infDPS (NFS-e — padrao nacional) ============
//
// Transforma uma prestacao de servico (Ordem de Servico ou entrada avulsa) +
// ConfiguracaoEmpresa no objeto infDPS (Declaracao de Prestacao de Servico) no
// leiaute do padrao NACIONAL da NFS-e, que o gateway (NuvemFiscal) recebe em
// POST /nfse { ambiente, referencia, infDPS }. NAO faz I/O — recebe tudo ja
// carregado pelo controller e devolve o objeto + os totais (p/ o snapshot da
// NotaFiscal).
//
// DIFERENCAS p/ a NFC-e: documento MUNICIPAL, imposto ISS (nao ICMS/PIS/COFINS),
// um unico servico por nota (nesta versao). A classificacao fiscal do servico
// (item LC 116 = cTribNac, codigo do municipio = cTribMun, aliquota ISS) vem do
// padrao da empresa (Config) e pode ser sobrescrita na emissao.
//
// RESSALVA (igual a do montarNfce/nuvemfiscal): a forma EXATA de alguns grupos
// do infDPS (locPrest, cServ, vServPrest, tribMun) segue o MOC nacional, mas
// deve ser conferida contra a conta/doc real da NuvemFiscal durante a
// homologacao — ajustar aqui conforme as rejeicoes.

import { ErroFiscal } from "./provedor.js";
import { round2 } from "./tributos.js";

const VER_APLIC = "GestaoPDV-1.0";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function soDigitos(v) {
  return v == null ? null : String(v).replace(/\D/g, "") || null;
}

// dhEmi no horario da Bahia (UTC-3) com offset -03:00 (mesmo criterio da NFC-e).
function dhEmiBahia(date) {
  const ba = new Date(date.getTime() - 3 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${ba.getUTCFullYear()}-${p(ba.getUTCMonth() + 1)}-${p(ba.getUTCDate())}` +
    `T${p(ba.getUTCHours())}:${p(ba.getUTCMinutes())}:${p(ba.getUTCSeconds())}-03:00`;
}

// Competencia (dCompet) — primeiro dia do mes da emissao, formato AAAA-MM-DD.
function competencia(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-01`;
}

// Regime tributario do prestador a partir do CRT (Simples x Normal) e do
// regime especial do ISSQN. opSimpNac: 1=nao optante, 2=optante MEI,
// 3=optante ME/EPP (assumimos ME/EPP quando Simples; MEI nao e distinguido hoje).
function montarRegTrib(config) {
  const crt = Number(config.crt);
  const opSimpNac = crt === 1 || crt === 2 ? 3 : 1;
  const regTrib = { opSimpNac };
  const regEsp = config.regimeEspecialISSQN;
  if (regEsp != null && regEsp !== "") regTrib.regEspTrib = Number(regEsp);
  return regTrib;
}

// Grupo prestador (prest) a partir da ConfiguracaoEmpresa.
function montarPrest(config) {
  const cnpj = soDigitos(config.cnpj);
  if (!cnpj) throw new ErroFiscal("CNPJ do emitente nao configurado.");
  const im = soDigitos(config.inscMunicipal);
  if (!im) throw new ErroFiscal("Inscricao Municipal nao configurada (obrigatoria para NFS-e).");
  return { CNPJ: cnpj, IM: im, regTrib: montarRegTrib(config) };
}

// Grupo tomador (toma) — opcional. tomador: { cpfCnpj, nome, endereco? }.
function montarToma(tomador) {
  if (!tomador) return undefined;
  const doc = soDigitos(tomador.cpfCnpj);
  const grupo = {};
  if (doc?.length === 14) grupo.CNPJ = doc;
  else if (doc?.length === 11) grupo.CPF = doc;
  if (tomador.nome) grupo.xNome = String(tomador.nome).slice(0, 300);
  const e = tomador.endereco;
  if (e && (e.logradouro || e.codMunicipio)) {
    grupo.end = {
      xLgr: e.logradouro || undefined,
      nro: e.numero || "S/N",
      xBairro: e.bairro || undefined,
      cMun: soDigitos(e.codMunicipio) || undefined,
      UF: e.uf || undefined,
      CEP: soDigitos(e.cep) || undefined,
    };
  }
  // Se nao ha documento nem nome, nao identifica o tomador.
  return (grupo.CNPJ || grupo.CPF || grupo.xNome) ? grupo : undefined;
}

/**
 * Monta o infDPS completo da NFS-e.
 *
 * @param {object} args
 * @param {object} args.config     ConfiguracaoEmpresa (prestador + defaults ISS)
 * @param {object} args.prestacao  { valorServicos, valorDeducoes?, discriminacao,
 *                                    itemListaServico?, codTributacaoMunicipio?,
 *                                    codMunicipioPrestacao?, aliquotaIss?, issRetido? }
 *                                  (campos opcionais usam o padrao da Config)
 * @param {object} [args.tomador]  { cpfCnpj, nome, endereco? } ou null
 * @param {string} args.ambiente   "HOMOLOGACAO" | "PRODUCAO"
 * @param {number} args.serie
 * @param {number} args.numeroFiscal  nDPS
 * @param {Date}   [args.dataEmissao]
 * @returns {{ payload, totais, snapshot }}
 */
export function montarNfse({ config, prestacao, tomador, ambiente, serie, numeroFiscal, dataEmissao }) {
  if (!prestacao) throw new ErroFiscal("Dados da prestacao de servico ausentes.");

  const vServ = round2(num(prestacao.valorServicos));
  if (vServ <= 0) throw new ErroFiscal("Valor do servico deve ser maior que zero.");

  const discriminacao = String(prestacao.discriminacao || "").trim();
  if (!discriminacao) throw new ErroFiscal("Discriminacao do servico e obrigatoria.");

  // Classificacao fiscal: prestacao sobrescreve o padrao da empresa.
  const itemListaServico = soDigitos(prestacao.itemListaServico ?? config.itemListaServicoPadrao);
  if (!itemListaServico) {
    throw new ErroFiscal("Item da lista de servicos (LC 116) nao informado nem configurado.");
  }
  const codTributacaoMunicipio = soDigitos(
    prestacao.codTributacaoMunicipio ?? config.codTributacaoMunicipioPadrao
  );
  const aliquotaIss = prestacao.aliquotaIss != null
    ? num(prestacao.aliquotaIss)
    : num(config.aliquotaIssPadrao);
  const issRetido = !!prestacao.issRetido;

  // Municipio de prestacao: o informado, ou o do emitente.
  const codMunicipio = soDigitos(prestacao.codMunicipioPrestacao) || soDigitos(config.codMunicipioIBGE);
  if (!codMunicipio) throw new ErroFiscal("Codigo IBGE do municipio de prestacao nao configurado.");

  const vDeducoes = round2(num(prestacao.valorDeducoes));
  const baseCalculoIss = round2(Math.max(0, vServ - vDeducoes));
  const valorIss = round2(baseCalculoIss * (aliquotaIss / 100));

  const ehHomologacao = ambiente !== "PRODUCAO";
  const tpAmb = ehHomologacao ? 2 : 1;
  const agora = dataEmissao ? new Date(dataEmissao) : new Date();

  const infDPS = {
    tpAmb,
    dhEmi: dhEmiBahia(agora),
    verAplic: VER_APLIC,
    serie: String(serie),
    nDPS: String(numeroFiscal),
    dCompet: competencia(agora),
    tpEmit: 1, // 1 = emissao pelo proprio prestador
    cLocEmi: codMunicipio,
    prest: montarPrest(config),
    serv: {
      locPrest: { cLocPrestacao: codMunicipio },
      cServ: {
        cTribNac: itemListaServico,
        ...(codTributacaoMunicipio ? { cTribMun: codTributacaoMunicipio } : {}),
        xDescServ: discriminacao.slice(0, 2000),
      },
    },
    valores: {
      vServPrest: { vServ: vServ.toFixed(2) },
      trib: {
        tribMun: {
          tribISSQN: 1, // 1 = operacao tributavel
          cLocIncid: codMunicipio,
          pAliq: aliquotaIss.toFixed(2),
          tpRetISSQN: issRetido ? 1 : 2, // 1=retido pelo tomador, 2=nao retido
        },
      },
    },
  };

  const grupoToma = montarToma(tomador);
  if (grupoToma) infDPS.toma = grupoToma;

  const totais = { valorServicos: vServ, valorDeducoes: vDeducoes, baseCalculoIss, aliquotaIss, valorIss, issRetido };

  const snapshot = {
    valorServicos: vServ,
    valorDeducoes: vDeducoes,
    baseCalculoIss,
    aliquotaIss,
    valorIss,
    issRetido,
    itemListaServico,
    codTributacaoMunicipio: codTributacaoMunicipio || null,
    codMunicipioPrestacao: codMunicipio,
    discriminacao,
  };

  return { payload: infDPS, totais, snapshot };
}
