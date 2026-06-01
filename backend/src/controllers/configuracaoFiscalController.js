import prisma from "../lib/prisma.js";
import { cifrar, decifrar, mascarar } from "../lib/cripto.js";

// ============ CONFIGURACAO FISCAL DO EMITENTE (NFC-e modelo 65) ============
//
// Le/grava a secao fiscal do emitente em ConfiguracaoEmpresa (campos ja
// existentes no schema — migration 20260528000000_fiscal_nota_fiscal_emitente).
// Os dados de identidade da empresa (razaoSocial, cnpj, inscEstadual,
// endereco...) ficam no configuracaoController.js — aqui tratamos so o que
// e especifico da emissao fiscal.
//
// O CSC e cifrado com AES-256-GCM (lib/cripto.js) e NUNCA retornado decifrado
// nos GETs — segue o mesmo padrao do mpAccessTokenEnc (pagamentoMpController).
// O certificado A1 e gerenciado pelo PROVEDOR (gateway): guardamos so a
// referencia (certificadoRef), nunca o .pfx nem a senha.

const PROVEDORES_VALIDOS = new Set(["nuvemfiscal", "focusnfe", "plugnotas"]);
const AMBIENTES_VALIDOS = new Set(["HOMOLOGACAO", "PRODUCAO"]);
const CRTS_VALIDOS = new Set([1, 2, 3]);

const norm = (v) => (v === undefined || v === null || v === "" ? null : String(v).trim());
const soDigitos = (v) => (v == null ? null : String(v).replace(/\D/g, "") || null);

// Decifra so para mascarar; se falhar (chave errada/valor corrompido) devolve
// placeholder sem vazar o erro. Mesmo helper do pagamentoMpController.
function safeDecifrarPrefixo(blob) {
  try { return decifrar(blob); }
  catch { return "***"; }
}

// Avalia se o emitente esta pronto para LIGAR a emissao (fiscalAtivo=true).
// Retorna a lista de campos faltantes em pt-BR para a UI orientar o usuario.
// Nao valida credenciamento na SEFAZ nem o certificado no provedor (isso e
// externo) — so checa o que temos no banco.
export function avaliarProntidao(cfg) {
  const faltando = [];
  if (!cfg) return { pronta: false, faltando: ["Cadastro da empresa nao iniciado"] };

  if (!norm(cfg.razaoSocial)) faltando.push("Razao social");
  if (!soDigitos(cfg.cnpj)) faltando.push("CNPJ");
  if (!norm(cfg.inscEstadual)) faltando.push("Inscricao estadual");
  if (!CRTS_VALIDOS.has(cfg.crt)) faltando.push("Regime tributario (CRT)");
  if (!norm(cfg.endereco)) faltando.push("Endereco (logradouro)");
  if (!norm(cfg.numero)) faltando.push("Numero do endereco");
  if (!norm(cfg.bairro)) faltando.push("Bairro");
  if (!soDigitos(cfg.cep)) faltando.push("CEP");
  if (!norm(cfg.cidade)) faltando.push("Cidade");
  if (!norm(cfg.estado)) faltando.push("UF");
  if (!soDigitos(cfg.codMunicipioIBGE)) faltando.push("Codigo IBGE do municipio");
  if (!soDigitos(cfg.codUFIBGE)) faltando.push("Codigo IBGE da UF");
  if (!cfg.provedorFiscal) faltando.push("Provedor fiscal (gateway)");
  // CSC: necessario para o hash do QR Code v2.00 (vigente na BA).
  if (!cfg.cscEnc) faltando.push("CSC (Codigo de Seguranca do Contribuinte)");
  if (!norm(cfg.cscId)) faltando.push("ID do CSC");

  return { pronta: faltando.length === 0, faltando };
}

// Monta o payload de resposta dos GET/PUT — CSC sempre mascarado.
function montarResposta(cfg) {
  const prontidao = avaliarProntidao(cfg);
  return {
    fiscalAtivo: !!cfg?.fiscalAtivo,
    ambienteFiscal: cfg?.ambienteFiscal || "HOMOLOGACAO",
    provedorFiscal: cfg?.provedorFiscal || null,
    crt: cfg?.crt ?? null,
    cnae: cfg?.cnae || null,
    inscMunicipal: cfg?.inscMunicipal || null,
    ieSubstitutoTrib: cfg?.ieSubstitutoTrib || null,
    regimeEspecialISSQN: cfg?.regimeEspecialISSQN ?? null,
    codMunicipioIBGE: cfg?.codMunicipioIBGE || null,
    codUFIBGE: cfg?.codUFIBGE || null,
    codPais: cfg?.codPais || "1058",
    nomePais: cfg?.nomePais || "BRASIL",
    serieNfce: cfg?.serieNfce ?? 1,
    proximoNumeroNfce: cfg?.proximoNumeroNfce ?? 1,
    cscId: cfg?.cscId || null,
    // CSC mascarado: confirma que existe sem expor o valor.
    cscMascarado: cfg?.cscEnc ? mascarar(safeDecifrarPrefixo(cfg.cscEnc)) : null,
    certificadoRef: cfg?.certificadoRef || null,
    prontidao,
  };
}

// GET /fiscal/config
export async function obterConfig(req, res, next) {
  try {
    const cfg = await prisma.configuracaoEmpresa.findFirst();
    res.json(montarResposta(cfg));
  } catch (err) {
    next(err);
  }
}

// PUT /fiscal/config
// Body (todos opcionais — partial update):
//   provedorFiscal, ambienteFiscal, crt, cnae, inscMunicipal,
//   ieSubstitutoTrib, regimeEspecialISSQN, codMunicipioIBGE, codUFIBGE,
//   codPais, nomePais, serieNfce, proximoNumeroNfce, cscId, csc, fiscalAtivo
// - csc: passe "" para LIMPAR; valor novo e cifrado antes de gravar.
// - fiscalAtivo so pode virar true se a prontidao estiver completa.
export async function salvarConfig(req, res, next) {
  try {
    const b = req.body || {};
    const data = {};

    if (b.provedorFiscal !== undefined) {
      const p = norm(b.provedorFiscal)?.toLowerCase() ?? null;
      if (p && !PROVEDORES_VALIDOS.has(p)) {
        return res.status(400).json({
          erro: "Provedor fiscal invalido. Use: nuvemfiscal, focusnfe ou plugnotas.",
        });
      }
      data.provedorFiscal = p;
    }

    if (b.ambienteFiscal !== undefined) {
      const a = norm(b.ambienteFiscal)?.toUpperCase() ?? null;
      if (a && !AMBIENTES_VALIDOS.has(a)) {
        return res.status(400).json({ erro: "Ambiente invalido. Use HOMOLOGACAO ou PRODUCAO." });
      }
      if (a) data.ambienteFiscal = a;
    }

    if (b.crt !== undefined) {
      if (b.crt === null || b.crt === "") {
        data.crt = null;
      } else {
        const crt = Number(b.crt);
        if (!CRTS_VALIDOS.has(crt)) {
          return res.status(400).json({ erro: "CRT invalido. Use 1 (Simples), 2 (Simples/Excesso) ou 3 (Regime Normal)." });
        }
        data.crt = crt;
      }
    }

    if (b.cnae !== undefined) data.cnae = soDigitos(b.cnae);
    if (b.inscMunicipal !== undefined) data.inscMunicipal = norm(b.inscMunicipal);
    if (b.ieSubstitutoTrib !== undefined) data.ieSubstitutoTrib = norm(b.ieSubstitutoTrib);
    if (b.regimeEspecialISSQN !== undefined) {
      data.regimeEspecialISSQN = b.regimeEspecialISSQN === null || b.regimeEspecialISSQN === ""
        ? null : Number(b.regimeEspecialISSQN);
    }

    if (b.codMunicipioIBGE !== undefined) {
      const c = soDigitos(b.codMunicipioIBGE);
      if (c && c.length !== 7) {
        return res.status(400).json({ erro: "Codigo IBGE do municipio deve ter 7 digitos." });
      }
      data.codMunicipioIBGE = c;
    }
    if (b.codUFIBGE !== undefined) {
      const c = soDigitos(b.codUFIBGE);
      if (c && c.length !== 2) {
        return res.status(400).json({ erro: "Codigo IBGE da UF deve ter 2 digitos (Bahia = 29)." });
      }
      data.codUFIBGE = c;
    }
    if (b.codPais !== undefined) data.codPais = soDigitos(b.codPais) || "1058";
    if (b.nomePais !== undefined) data.nomePais = norm(b.nomePais)?.toUpperCase() || "BRASIL";

    if (b.serieNfce !== undefined) {
      const s = Number(b.serieNfce);
      if (!Number.isInteger(s) || s < 0) {
        return res.status(400).json({ erro: "Serie da NFC-e deve ser um inteiro >= 0." });
      }
      data.serieNfce = s;
    }
    if (b.proximoNumeroNfce !== undefined) {
      const n = Number(b.proximoNumeroNfce);
      if (!Number.isInteger(n) || n < 1) {
        return res.status(400).json({ erro: "Proximo numero da NFC-e deve ser um inteiro >= 1." });
      }
      data.proximoNumeroNfce = n;
    }

    if (b.cscId !== undefined) data.cscId = soDigitos(b.cscId);

    // CSC: 16 a 36 chars alfanumericos (Manual DANFE/QR Code §4.6). "" limpa.
    if (b.csc !== undefined) {
      const c = b.csc;
      if (c === null || c === "") {
        data.cscEnc = null;
      } else if (typeof c === "string") {
        const limpo = c.trim();
        if (limpo.length < 16 || limpo.length > 36) {
          return res.status(400).json({ erro: "CSC deve ter entre 16 e 36 caracteres." });
        }
        data.cscEnc = cifrar(limpo);
      }
    }

    const existente = await prisma.configuracaoEmpresa.findFirst();
    if (!existente) {
      return res.status(412).json({
        erro: "Cadastre os dados da empresa (Configuracoes) antes de configurar a emissao fiscal.",
      });
    }

    // fiscalAtivo: so liga se a prontidao estiver completa. Avaliamos a config
    // ja MESCLADA com as mudancas deste request, pra permitir ligar no mesmo
    // PUT que preenche os ultimos campos. Desligar (false) e sempre permitido.
    if (b.fiscalAtivo !== undefined) {
      const ligar = !!b.fiscalAtivo;
      if (ligar) {
        const mesclada = { ...existente, ...data };
        // cscEnc pode ter sido setado neste request (data.cscEnc) ou ja existir.
        const prontidao = avaliarProntidao(mesclada);
        if (!prontidao.pronta) {
          return res.status(400).json({
            erro: "Nao e possivel ativar a emissao fiscal: cadastro incompleto.",
            faltando: prontidao.faltando,
          });
        }
      }
      data.fiscalAtivo = ligar;
    }

    const cfg = await prisma.configuracaoEmpresa.update({
      where: { id: existente.id },
      data,
    });

    res.json(montarResposta(cfg));
  } catch (err) {
    next(err);
  }
}
