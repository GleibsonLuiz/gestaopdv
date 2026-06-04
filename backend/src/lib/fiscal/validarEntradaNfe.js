// ============ VALIDADOR DE ENTRADA DE NF-e DE FORNECEDOR (Onda 6 / Fase 1) ============
//
// "Buffer de erros" da ENTRADA: parseia o XML de uma NF-e de COMPRA (modelo 55)
// recebida de um fornecedor e valida ANTES de qualquer Compra/estoque/financeiro
// tocar o banco (pedido original do Ponto 1). Diferente da saida, aqui NOS temos
// o XML — entao a validacao e estrutural/negocio sobre o documento de terceiro.
//
// Abordagem PURA-JS (sem dependencia nativa, serverless-safe): parser
// fast-xml-parser + checagens de DV da chave, CNPJ, grupos obrigatorios e
// coerencia de totais. (XSD oficial PL_009 fica como upgrade futuro.)
//
// Retorno: { ok, erros: [{ campo, item?, msg }], dados } — `dados` e o modelo
// intermediario ja extraido (emitente, itens, totais, duplicatas) para as fases
// seguintes (de-para + efetivacao). `dados` vem mesmo com ok=false (best-effort),
// para a UI mostrar o que conseguiu ler.

import { XMLParser } from "fast-xml-parser";
import { validarCpfCnpj, validarCnpj } from "./validarPayload.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false, // mantem tudo string (NCM "00000000" nao vira 0)
  trimValues: true,
});

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const soDigitos = (v) => (v == null ? "" : String(v).replace(/\D/g, ""));
const ehDigitos = (v, n) => new RegExp(`^\\d{${n}}$`).test(String(v ?? ""));

// DV (mod-11, pesos 2..9 ciclicos da direita) sobre os 43 primeiros digitos.
function dvChave(chave43) {
  let soma = 0, peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return String(resto === 0 || resto === 1 ? 0 : 11 - resto);
}

export function validarChaveAcesso(chave) {
  const d = soDigitos(chave);
  if (d.length !== 44) return false;
  return dvChave(d.slice(0, 43)) === d[43];
}

// Extrai a chave do Id do infNFe ("NFe" + 44 digitos) ou do protNFe.
function extrairChave(infNFe, nfeProc) {
  const id = String(infNFe?.["@_Id"] || "");
  const doId = soDigitos(id);
  if (doId.length === 44) return doId;
  const ch = soDigitos(nfeProc?.protNFe?.infProt?.chNFe);
  return ch.length === 44 ? ch : null;
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

// Extrai o modelo intermediario do infNFe (sempre, mesmo que invalido).
function extrair(infNFe, chave) {
  const ide = infNFe?.ide || {};
  const emit = infNFe?.emit || {};
  const dest = infNFe?.dest || {};
  const icmsTot = infNFe?.total?.ICMSTot || {};

  const itens = arr(infNFe?.det).map((d, i) => {
    const p = d?.prod || {};
    return {
      numero: Number(d?.["@_nItem"]) || i + 1,
      cProdFornecedor: p.cProd != null ? String(p.cProd) : null,
      cEAN: soDigitos(p.cEAN) || null,
      descricao: p.xProd != null ? String(p.xProd) : null,
      ncm: soDigitos(p.NCM) || null,
      cest: soDigitos(p.CEST) || null,
      cfop: soDigitos(p.CFOP) || null,
      unidade: p.uCom != null ? String(p.uCom) : null,
      quantidade: n(p.qCom),
      valorUnitario: n(p.vUnCom),
      valorTotal: n(p.vProd),
    };
  });

  const duplicatas = arr(infNFe?.cobr?.dup).map((d) => ({
    numero: d?.nDup != null ? String(d.nDup) : null,
    vencimento: d?.dVenc || null,
    valor: n(d?.vDup),
  }));

  return {
    chave,
    modelo: soDigitos(ide.mod) || null,
    numero: ide.nNF != null ? String(ide.nNF) : null,
    serie: ide.serie != null ? String(ide.serie) : null,
    dataEmissao: ide.dhEmi || ide.dEmi || null,
    naturezaOperacao: ide.natOp != null ? String(ide.natOp) : null,
    emitente: {
      cnpj: soDigitos(emit.CNPJ) || null,
      nome: emit.xNome != null ? String(emit.xNome) : null,
      ie: emit.IE != null ? String(emit.IE) : null,
    },
    destinatario: {
      doc: soDigitos(dest.CNPJ || dest.CPF) || null,
      nome: dest.xNome != null ? String(dest.xNome) : null,
    },
    itens,
    totais: { valorProdutos: n(icmsTot.vProd), valorNota: n(icmsTot.vNF) },
    duplicatas,
  };
}

export function validarEntradaNfe(xml) {
  if (!xml || typeof xml !== "string" || !xml.trim()) {
    return { ok: false, erros: [{ campo: "xml", msg: "XML da NF-e vazio." }], dados: null };
  }

  let doc;
  try {
    doc = parser.parse(xml);
  } catch (e) {
    return { ok: false, erros: [{ campo: "xml", msg: "XML invalido (nao foi possivel ler o arquivo)." }], dados: null };
  }

  const nfeProc = doc?.nfeProc || null;
  const nfe = nfeProc?.NFe || doc?.NFe;
  const infNFe = nfe?.infNFe;
  if (!infNFe) {
    return { ok: false, erros: [{ campo: "infNFe", msg: "Estrutura de NF-e nao encontrada (esperado nfeProc/NFe/infNFe)." }], dados: null };
  }

  const chave = extrairChave(infNFe, nfeProc);
  const dados = extrair(infNFe, chave);
  const erros = [];

  // Chave de acesso
  if (!chave) {
    erros.push({ campo: "chave", msg: "Chave de acesso ausente no XML." });
  } else if (!validarChaveAcesso(chave)) {
    erros.push({ campo: "chave", msg: "Chave de acesso invalida (digito verificador nao confere)." });
  }

  // Modelo: entrada de NF-e e modelo 55
  if (dados.modelo !== "55") {
    erros.push({ campo: "ide.mod", msg: `Modelo ${dados.modelo || "?"} nao suportado na entrada. Esperado NF-e modelo 55.` });
  }

  // Emitente (fornecedor) — CNPJ valido e obrigatorio
  if (!dados.emitente.cnpj) {
    erros.push({ campo: "emit.CNPJ", msg: "CNPJ do fornecedor (emitente) ausente no XML." });
  } else if (!validarCnpj(dados.emitente.cnpj)) {
    erros.push({ campo: "emit.CNPJ", msg: "CNPJ do fornecedor (emitente) invalido." });
  }

  // Destinatario, se informado, precisa ter documento valido
  if (dados.destinatario.doc && !validarCpfCnpj(dados.destinatario.doc)) {
    erros.push({ campo: "dest", msg: "CPF/CNPJ do destinatario invalido no XML." });
  }

  // Itens
  if (dados.itens.length === 0) {
    erros.push({ campo: "det", msg: "NF-e sem itens." });
  }
  dados.itens.forEach((it) => {
    const ref = it.descricao ? `"${it.descricao}"` : `item ${it.numero}`;
    if (!ehDigitos(it.ncm, 8) || it.ncm === "00000000") {
      erros.push({ campo: "NCM", item: it.numero, msg: `Produto ${ref} com NCM invalido (8 digitos).` });
    }
    if (!(it.quantidade > 0)) {
      erros.push({ campo: "qCom", item: it.numero, msg: `Produto ${ref} com quantidade invalida.` });
    }
    if (!(it.valorTotal >= 0)) {
      erros.push({ campo: "vProd", item: it.numero, msg: `Produto ${ref} com valor invalido.` });
    }
  });

  // Coerencia de totais: na entrada (dado de terceiro) a soma DEVE bater.
  const somaItens = dados.itens.reduce((s, it) => s + it.valorTotal, 0);
  if (dados.itens.length && Math.abs(somaItens - dados.totais.valorProdutos) > 0.01) {
    erros.push({
      campo: "total.vProd",
      msg: `Soma dos itens (R$ ${somaItens.toFixed(2)}) diverge do total de produtos da NF-e (R$ ${dados.totais.valorProdutos.toFixed(2)}).`,
    });
  }

  return { ok: erros.length === 0, erros, dados };
}
