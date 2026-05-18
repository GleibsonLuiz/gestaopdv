import prisma from "../lib/prisma.js";
import { aplicarLimite } from "../lib/planoLimites.js";
import {
  validarNcm, validarCest, validarCfopSaida, validarGtin,
  validarTributacaoIcms, validarCst2Digitos,
  ORIGENS_VALIDAS, REGIMES_VALIDOS,
} from "../lib/validacoesFiscais.js";

const norm = (v) => (v === undefined || v === null || v === "" ? null : v);

const TIPOS_ITEM_VALIDOS = new Set(["PRODUTO", "SERVICO"]);

function normalizarTipoItem(v) {
  if (v === undefined || v === null || v === "") return "PRODUTO";
  const s = String(v).trim().toUpperCase();
  return TIPOS_ITEM_VALIDOS.has(s) ? s : null;
}

function toNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function toInt(v, fallback = 0) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : NaN;
}

// Estoque vira Decimal(12,3) — arredonda para 3 casas para casar com o banco.
function toQtd(v, fallback = 0) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 1000) / 1000;
}

const INCLUDE_REL = {
  categoria: { select: { id: true, nome: true } },
  fornecedor: { select: { id: true, nome: true } },
};

export async function listar(req, res, next) {
  try {
    const { search, ativo, categoriaId, fornecedorId, estoqueBaixo } = req.query;
    const where = {};
    if (ativo === "true") where.ativo = true;
    if (ativo === "false") where.ativo = false;
    if (categoriaId) where.categoriaId = categoriaId;
    if (fornecedorId) where.fornecedorId = fornecedorId;
    if (search) {
      where.OR = [
        { codigo: { contains: search, mode: "insensitive" } },
        { codigoBarras: { contains: search, mode: "insensitive" } },
        { referencia: { contains: search, mode: "insensitive" } },
        { nome: { contains: search, mode: "insensitive" } },
      ];
    }

    let produtos = await prisma.produto.findMany({
      where,
      include: INCLUDE_REL,
      orderBy: { nome: "asc" },
    });

    if (estoqueBaixo === "true") {
      produtos = produtos.filter(p => Number(p.estoque) <= Number(p.estoqueMinimo));
    }

    res.json(produtos);
  } catch (err) {
    next(err);
  }
}

export async function obter(req, res, next) {
  try {
    const produto = await prisma.produto.findUnique({
      where: { id: req.params.id },
      include: INCLUDE_REL,
    });
    if (!produto) return res.status(404).json({ erro: "Produto nao encontrado" });
    res.json(produto);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const codigo = req.body?.codigo ? String(req.body.codigo).trim() : "";
    const nome = req.body?.nome ? String(req.body.nome).trim() : "";
    if (!codigo) return res.status(400).json({ erro: "Codigo e obrigatorio" });
    if (!nome) return res.status(400).json({ erro: "Nome e obrigatorio" });

    // ETAPA 13: limite por plano
    if (!await aplicarLimite(req, res, "produtos")) return;

    const tipoItem = normalizarTipoItem(req.body.tipoItem);
    if (tipoItem === null) return res.status(400).json({ erro: "Tipo de item invalido (use PRODUTO ou SERVICO)" });

    let precoVenda = toNumber(req.body.precoVenda);
    const precoCusto = req.body.precoCusto !== undefined ? toNumber(req.body.precoCusto) : null;
    if (precoCusto !== null && (Number.isNaN(precoCusto) || precoCusto < 0)) {
      return res.status(400).json({ erro: "Preco de custo invalido" });
    }

    // ETAPA 14: calculo automatico custo + margem -> preco. Roda apenas
    // quando o cliente NAO enviou precoVenda explicito e enviou custo + margem.
    const margemLucro = toNumber(req.body.margemLucro);
    if ((precoVenda === null || precoVenda === 0)
        && precoCusto && precoCusto > 0
        && margemLucro && margemLucro > 0 && margemLucro < 100) {
      precoVenda = Number((precoCusto / (1 - margemLucro / 100)).toFixed(2));
    }
    if (precoVenda === null || Number.isNaN(precoVenda) || precoVenda < 0) {
      return res.status(400).json({ erro: "Preco de venda invalido" });
    }

    // Servicos nao tem estoque: ignora qualquer valor enviado e zera os campos.
    let estoque = 0;
    let estoqueMinimo = 0;
    if (tipoItem === "PRODUTO") {
      estoque = toQtd(req.body.estoque, 0);
      estoqueMinimo = toQtd(req.body.estoqueMinimo, 0);
      if (Number.isNaN(estoque) || estoque < 0) return res.status(400).json({ erro: "Estoque invalido" });
      if (Number.isNaN(estoqueMinimo) || estoqueMinimo < 0) return res.status(400).json({ erro: "Estoque minimo invalido" });
    }

    // ETAPA 14: validacoes fiscais. Todos os campos sao opcionais no cadastro
    // (viram obrigatorios na emissao da NF-e), mas se vier, tem que estar bem-formado.
    const gtin = validarGtin(req.body.codigoBarras);
    if (!gtin.ok) return res.status(400).json({ erro: gtin.erro });

    const ncm = validarNcm(req.body.ncm);
    if (!ncm.ok) return res.status(400).json({ erro: ncm.erro });
    const cest = validarCest(req.body.cest);
    if (!cest.ok) return res.status(400).json({ erro: cest.erro });
    const cfop = validarCfopSaida(req.body.cfopPadrao);
    if (!cfop.ok) return res.status(400).json({ erro: cfop.erro });

    const origem = req.body.origem || "NACIONAL";
    if (!ORIGENS_VALIDAS.has(origem)) return res.status(400).json({ erro: "Origem da mercadoria invalida" });

    const regime = req.body.regimeTributario || "SIMPLES_NACIONAL";
    if (!REGIMES_VALIDOS.has(regime)) return res.status(400).json({ erro: "Regime tributario invalido" });

    const tribIcms = validarTributacaoIcms({
      regime, cstIcms: req.body.cstIcms, csosnIcms: req.body.csosnIcms,
    });
    if (!tribIcms.ok) return res.status(400).json({ erro: tribIcms.erro });

    const cstPis = validarCst2Digitos(req.body.cstPis, "PIS");
    if (!cstPis.ok) return res.status(400).json({ erro: cstPis.erro });
    const cstCofins = validarCst2Digitos(req.body.cstCofins, "COFINS");
    if (!cstCofins.ok) return res.status(400).json({ erro: cstCofins.erro });

    const produto = await prisma.produto.create({
      data: {
        codigo,
        codigoBarras: gtin.valor,
        referencia: norm(req.body.referencia),
        nome,
        descricao: norm(req.body.descricao),
        tipoItem,
        precoVenda,
        precoCusto,
        estoque,
        estoqueMinimo,
        unidade: req.body.unidade ? String(req.body.unidade).trim().toUpperCase().slice(0, 6) : "UN",
        categoriaId: norm(req.body.categoriaId),
        fornecedorId: norm(req.body.fornecedorId),
        // Bloco fiscal NF-e
        ncm: ncm.valor,
        cest: cest.valor,
        cfopPadrao: cfop.valor,
        origem,
        unidadeTributavel: req.body.unidadeTributavel
          ? String(req.body.unidadeTributavel).trim().toUpperCase().slice(0, 6) : null,
        regimeTributario: regime,
        cstIcms: regime === "REGIME_NORMAL" ? (norm(req.body.cstIcms) || null) : null,
        csosnIcms: regime !== "REGIME_NORMAL" ? (norm(req.body.csosnIcms) || null) : null,
        aliquotaIcms: toNumber(req.body.aliquotaIcms),
        cstPis: cstPis.valor,
        aliquotaPis: toNumber(req.body.aliquotaPis),
        cstCofins: cstCofins.valor,
        aliquotaCofins: toNumber(req.body.aliquotaCofins),
        codBeneficioFiscal: norm(req.body.codBeneficioFiscal),
        pesoLiquido: toNumber(req.body.pesoLiquido),
        pesoBruto: toNumber(req.body.pesoBruto),
      },
      include: INCLUDE_REL,
    });
    res.status(201).json(produto);
  } catch (err) {
    if (err.code === "P2002") {
      const campo = err.meta?.target?.includes("codigoBarras") ? "codigo de barras" : "codigo";
      return res.status(409).json({ erro: `Ja existe um produto com este ${campo}` });
    }
    if (err.code === "P2003") return res.status(400).json({ erro: "Categoria ou fornecedor inexistente" });
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const data = {};
    if (req.body.codigo !== undefined) {
      const c = String(req.body.codigo).trim();
      if (!c) return res.status(400).json({ erro: "Codigo nao pode ser vazio" });
      data.codigo = c;
    }
    if (req.body.nome !== undefined) {
      const n = String(req.body.nome).trim();
      if (!n) return res.status(400).json({ erro: "Nome nao pode ser vazio" });
      data.nome = n;
    }
    if (req.body.descricao !== undefined) data.descricao = norm(req.body.descricao);
    // codigoBarras eh validado mais abaixo no bloco fiscal (ETAPA 14, checksum GTIN).
    if (req.body.referencia !== undefined) data.referencia = norm(req.body.referencia);
    if (req.body.tipoItem !== undefined) {
      const t = normalizarTipoItem(req.body.tipoItem);
      if (t === null) return res.status(400).json({ erro: "Tipo de item invalido (use PRODUTO ou SERVICO)" });
      data.tipoItem = t;
      // Trocar para SERVICO zera estoque/minimo automaticamente — servicos
      // nao tem controle de estoque.
      if (t === "SERVICO") {
        data.estoque = 0;
        data.estoqueMinimo = 0;
      }
    }
    if (req.body.precoVenda !== undefined) {
      const v = toNumber(req.body.precoVenda);
      if (v === null || Number.isNaN(v) || v < 0) return res.status(400).json({ erro: "Preco de venda invalido" });
      data.precoVenda = v;
    }
    if (req.body.precoCusto !== undefined) {
      const v = req.body.precoCusto === "" || req.body.precoCusto === null ? null : toNumber(req.body.precoCusto);
      if (v !== null && (Number.isNaN(v) || v < 0)) return res.status(400).json({ erro: "Preco de custo invalido" });
      data.precoCusto = v;
    }
    // ETAPA 14: calculo auto preco. So aplica se o cliente enviou margemLucro
    // explicito sem mandar precoVenda (caso contrario o que ele digitou prevalece).
    if (req.body.margemLucro !== undefined && req.body.precoVenda === undefined) {
      const m = toNumber(req.body.margemLucro);
      const c = data.precoCusto ?? (req.body.precoCusto !== undefined ? toNumber(req.body.precoCusto) : null);
      if (m && m > 0 && m < 100 && c && c > 0) {
        data.precoVenda = Number((c / (1 - m / 100)).toFixed(2));
      }
    }
    // Estoque so e aceito quando o item NAO esta sendo marcado como SERVICO
    // (campo ja zerado acima nesse caso).
    if (req.body.estoque !== undefined && data.tipoItem !== "SERVICO") {
      const v = toQtd(req.body.estoque, NaN);
      if (Number.isNaN(v) || v < 0) return res.status(400).json({ erro: "Estoque invalido" });
      data.estoque = v;
    }
    if (req.body.estoqueMinimo !== undefined && data.tipoItem !== "SERVICO") {
      const v = toQtd(req.body.estoqueMinimo, NaN);
      if (Number.isNaN(v) || v < 0) return res.status(400).json({ erro: "Estoque minimo invalido" });
      data.estoqueMinimo = v;
    }
    if (req.body.unidade !== undefined) {
      data.unidade = String(req.body.unidade).trim().toUpperCase().slice(0, 6) || "UN";
    }
    if (req.body.categoriaId !== undefined) data.categoriaId = norm(req.body.categoriaId);
    if (req.body.fornecedorId !== undefined) data.fornecedorId = norm(req.body.fornecedorId);
    if (req.body.ativo !== undefined) data.ativo = !!req.body.ativo;

    // ETAPA 14: bloco fiscal — todos opcionais, valida so quando enviado.
    if (req.body.codigoBarras !== undefined) {
      const gtin = validarGtin(req.body.codigoBarras);
      if (!gtin.ok) return res.status(400).json({ erro: gtin.erro });
      data.codigoBarras = gtin.valor;
    }
    if (req.body.ncm !== undefined) {
      const r = validarNcm(req.body.ncm);
      if (!r.ok) return res.status(400).json({ erro: r.erro });
      data.ncm = r.valor;
    }
    if (req.body.cest !== undefined) {
      const r = validarCest(req.body.cest);
      if (!r.ok) return res.status(400).json({ erro: r.erro });
      data.cest = r.valor;
    }
    if (req.body.cfopPadrao !== undefined) {
      const r = validarCfopSaida(req.body.cfopPadrao);
      if (!r.ok) return res.status(400).json({ erro: r.erro });
      data.cfopPadrao = r.valor;
    }
    if (req.body.origem !== undefined) {
      if (!ORIGENS_VALIDAS.has(req.body.origem)) {
        return res.status(400).json({ erro: "Origem da mercadoria invalida" });
      }
      data.origem = req.body.origem;
    }
    if (req.body.unidadeTributavel !== undefined) {
      data.unidadeTributavel = req.body.unidadeTributavel
        ? String(req.body.unidadeTributavel).trim().toUpperCase().slice(0, 6) : null;
    }

    // Regime + CST/CSOSN sao validados em conjunto porque a coerencia
    // depende dos tres. Recuperamos o regime atual do banco se nao veio
    // no body — necessario pra saber se cstIcms ou csosnIcms eh valido.
    const regimeAtual = req.body.regimeTributario !== undefined
      ? req.body.regimeTributario
      : null;
    if (regimeAtual !== null && !REGIMES_VALIDOS.has(regimeAtual)) {
      return res.status(400).json({ erro: "Regime tributario invalido" });
    }
    if (regimeAtual !== null || req.body.cstIcms !== undefined || req.body.csosnIcms !== undefined) {
      const atual = regimeAtual ?? await prisma.produto
        .findUnique({ where: { id: req.params.id }, select: { regimeTributario: true } })
        .then(p => p?.regimeTributario || "SIMPLES_NACIONAL");
      const tribIcms = validarTributacaoIcms({
        regime: atual,
        cstIcms: req.body.cstIcms,
        csosnIcms: req.body.csosnIcms,
      });
      if (!tribIcms.ok) return res.status(400).json({ erro: tribIcms.erro });
      if (regimeAtual !== null) data.regimeTributario = regimeAtual;
      // Mutuamente exclusivos — zera o campo que nao se aplica ao regime.
      if (atual === "REGIME_NORMAL") {
        if (req.body.cstIcms !== undefined) data.cstIcms = norm(req.body.cstIcms);
        data.csosnIcms = null;
      } else {
        if (req.body.csosnIcms !== undefined) data.csosnIcms = norm(req.body.csosnIcms);
        data.cstIcms = null;
      }
    }

    if (req.body.aliquotaIcms !== undefined) data.aliquotaIcms = toNumber(req.body.aliquotaIcms);
    if (req.body.cstPis !== undefined) {
      const r = validarCst2Digitos(req.body.cstPis, "PIS");
      if (!r.ok) return res.status(400).json({ erro: r.erro });
      data.cstPis = r.valor;
    }
    if (req.body.aliquotaPis !== undefined) data.aliquotaPis = toNumber(req.body.aliquotaPis);
    if (req.body.cstCofins !== undefined) {
      const r = validarCst2Digitos(req.body.cstCofins, "COFINS");
      if (!r.ok) return res.status(400).json({ erro: r.erro });
      data.cstCofins = r.valor;
    }
    if (req.body.aliquotaCofins !== undefined) data.aliquotaCofins = toNumber(req.body.aliquotaCofins);
    if (req.body.codBeneficioFiscal !== undefined) data.codBeneficioFiscal = norm(req.body.codBeneficioFiscal);
    if (req.body.pesoLiquido !== undefined) data.pesoLiquido = toNumber(req.body.pesoLiquido);
    if (req.body.pesoBruto !== undefined) data.pesoBruto = toNumber(req.body.pesoBruto);

    const produto = await prisma.produto.update({
      where: { id: req.params.id },
      data,
      include: INCLUDE_REL,
    });
    res.json(produto);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Produto nao encontrado" });
    if (err.code === "P2002") {
      const campo = err.meta?.target?.includes("codigoBarras") ? "codigo de barras" : "codigo";
      return res.status(409).json({ erro: `Ja existe um produto com este ${campo}` });
    }
    if (err.code === "P2003") return res.status(400).json({ erro: "Categoria ou fornecedor inexistente" });
    next(err);
  }
}

// Soft-delete apenas: marca ativo=false. Hard-delete foi removido para
// preservar a integridade historica de itens de venda/compra/orcamento e
// movimentacoes de estoque que referenciam o produto.
export async function excluir(req, res, next) {
  try {
    await prisma.produto.update({
      where: { id: req.params.id },
      data: { ativo: false },
    });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Produto nao encontrado" });
    if (err.code === "P2003") {
      return res.status(409).json({
        erro: "Produto possui vendas, compras ou movimentacoes vinculados. Inative em vez de excluir.",
      });
    }
    next(err);
  }
}
