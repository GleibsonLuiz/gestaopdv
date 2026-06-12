import prisma from "../lib/prisma.js";
import { aplicarLimite } from "../lib/planoLimites.js";
import {
  validarNcm, validarCest, validarCfopSaida, validarGtin,
  validarTributacaoIcms, validarCst2Digitos,
  ORIGENS_VALIDAS, REGIMES_VALIDOS,
} from "../lib/validacoesFiscais.js";
import { sugerirCest } from "../lib/fiscal/cestLookup.js";

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

// ETAPA#6: sanitiza camposSegmento (JSON livre) em formato seguro.
// Aceita apenas as chaves conhecidas dos segmentos suportados; descarta o resto.
// Strings limitadas a 120 chars; arrays a 50 itens; numbers passam puros.
function sanitizarCamposSegmento(input) {
  if (input === undefined) return undefined;
  if (input === null || input === "") return null;
  if (typeof input !== "object" || Array.isArray(input)) return null;
  const chavesPermitidas = new Set([
    // AUTO_PECAS
    "codigoOEM", "marcaPeca", "compatibilidade",
    // FARMACIA
    "lote", "validade", "registroAnvisa", "pmc",
    // PADARIA / DELICATESSEN / LANCHONETE (kit alimentacao)
    "validadeDias", "conservacao", "alergenicos",
  ]);
  const lim = (s, max = 120) => (typeof s === "string" ? s.trim().slice(0, max) : "");
  const out = {};
  let temAlgo = false;
  for (const [k, v] of Object.entries(input)) {
    if (!chavesPermitidas.has(k)) continue;
    if (v === null || v === "" || v === undefined) continue;
    if (Array.isArray(v)) {
      const arr = v.slice(0, 50).map(x => lim(String(x))).filter(Boolean);
      if (arr.length) { out[k] = arr; temAlgo = true; }
    } else if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = v; temAlgo = true;
    } else {
      const s = lim(v);
      if (s) { out[k] = s; temAlgo = true; }
    }
  }
  return temAlgo ? out : null;
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
  fabricante: { select: { id: true, nome: true } },
  // Ficha tecnica (producao propria): receita com um mini-select do insumo —
  // suficiente p/ o form de produto e p/ o modal Registrar Producao calcular
  // consumo/custo sem nova chamada.
  composicao: {
    select: {
      id: true,
      insumoId: true,
      quantidade: true,
      insumo: {
        select: {
          id: true, codigo: true, nome: true, unidade: true,
          precoCusto: true, estoque: true, controlarEstoque: true,
        },
      },
    },
  },
};

// Normaliza o array de composicao (ficha tecnica) vindo do front.
// Retorna: undefined (campo ausente — nao mexer), [] (limpar receita),
// lista normalizada, ou null quando o payload e invalido.
function normalizarComposicao(input) {
  if (input === undefined) return undefined;
  if (input === null) return [];
  if (!Array.isArray(input)) return null;
  const vistos = new Set();
  const out = [];
  for (const item of input.slice(0, 60)) {
    const insumoId = item && item.insumoId ? String(item.insumoId) : "";
    const q = toNumber(item ? item.quantidade : null);
    if (!insumoId || q === null || Number.isNaN(q) || q <= 0) return null;
    if (vistos.has(insumoId)) continue; // dedupe silencioso
    vistos.add(insumoId);
    // Coeficiente com 4 casas (Decimal(12,4) no schema).
    out.push({ insumoId, quantidade: Math.round(q * 10000) / 10000 });
  }
  return out;
}

// Confere que todos os insumos existem NO TENANT (findMany ja e filtrado pelo
// wrapper multi-tenant), sao PRODUTO (servico nao e insumo) e nao referenciam
// o proprio produto final. Retorna mensagem de erro ou null se ok.
async function validarInsumosComposicao(composicao, produtoFinalId = null) {
  if (!composicao || composicao.length === 0) return null;
  if (produtoFinalId && composicao.some(c => c.insumoId === produtoFinalId)) {
    return "Um produto nao pode ser insumo da propria receita";
  }
  const insumos = await prisma.produto.findMany({
    where: { id: { in: composicao.map(c => c.insumoId) } },
    select: { id: true, nome: true, tipoItem: true },
  });
  if (insumos.length !== composicao.length) {
    return "Insumo da composicao nao encontrado";
  }
  const servico = insumos.find(i => i.tipoItem === "SERVICO");
  if (servico) return `"${servico.nome}" e um servico — nao pode ser insumo de receita`;
  return null;
}

// ============ CONSULTA DE NCM (BrasilAPI) ============
//
// Proxy para a BrasilAPI (gratuita, sem chave) que valida um NCM e devolve a
// descricao oficial da tabela. Usado pelo cadastro de produto (aba Tributacao)
// para o usuario confirmar que digitou o NCM certo ao sair do campo (onBlur).
//
// Por que via backend e nao direto do front: evita problema de CORS/cache do
// service worker (PWA) e nos deixa cachear em memoria — varios produtos do
// mesmo segmento repetem o mesmo NCM, entao o cache evita bater na BrasilAPI
// a cada digitacao. A BrasilAPI NAO devolve CEST; esse campo segue manual.
const BRASILAPI_NCM_URL = "https://brasilapi.com.br/api/ncm/v1";
// Cache de modulo (vive enquanto a instancia serverless viver). codigo -> resultado.
const cacheNcm = new Map();

export async function consultarNcm(req, res, next) {
  try {
    const { ok, valor: codigo, erro } = validarNcm(req.params.codigo);
    if (!ok) return res.status(400).json({ erro });
    if (!codigo) return res.status(400).json({ erro: "Informe um NCM" });

    if (cacheNcm.has(codigo)) return res.json(cacheNcm.get(codigo));

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    let resp;
    try {
      resp = await fetch(`${BRASILAPI_NCM_URL}/${codigo}`, {
        headers: { Accept: "application/json" },
        signal: ac.signal,
      });
    } catch {
      clearTimeout(timer);
      return res.status(502).json({ erro: "Servico de consulta de NCM indisponivel" });
    }
    clearTimeout(timer);

    if (resp.status === 404) {
      return res.status(404).json({ erro: "NCM nao encontrado na tabela oficial" });
    }
    if (!resp.ok) {
      return res.status(502).json({ erro: "Falha ao consultar NCM" });
    }

    const dados = await resp.json().catch(() => null);
    if (!dados || !dados.descricao) {
      return res.status(404).json({ erro: "NCM nao encontrado na tabela oficial" });
    }
    const resultado = {
      ncm: codigo,
      codigoFormatado: dados.codigo || codigo,
      descricao: dados.descricao,
    };
    cacheNcm.set(codigo, resultado);
    return res.json(resultado);
  } catch (err) {
    next(err);
  }
}

// ============ BUSCA DE NCM POR DESCRICAO (BrasilAPI) ============
//
// O inverso de consultarNcm: recebe um termo (nome do produto) e sugere os
// NCMs candidatos. Usado pelo botao "buscar pelo nome" na aba Tributacao para
// quem nao sabe o codigo de cabeca.
//
// A BrasilAPI faz match por SUBSTRING na descricao oficial (sensivel a acento),
// entao a frase inteira do produto quase nunca casa ("caneta esferografica" ->
// vazio). Por isso tentamos uma sequencia de termos: a frase completa primeiro
// e, se nao houver acerto, cada palavra significativa (>=3 letras, fora as de
// ligacao). Paramos no primeiro termo que retorna algum NCM de 8 digitos —
// os unicos que servem para preencher o campo (posicoes de 2/4/6 digitos da
// hierarquia sao descartadas). E so SUGESTAO: o usuario confirma o codigo.
const STOPWORDS_NCM = new Set([
  "de", "da", "do", "das", "dos", "com", "sem", "para", "por", "the",
  "ml", "kg", "cx", "un", "pct", "und", "lt", "litro", "litros", "tipo",
]);
// Cache de modulo: termo normalizado -> lista de sugestoes.
const cacheBuscaNcm = new Map();

// Extrai os termos candidatos do texto, em ordem de tentativa: frase completa
// (se tiver mais de uma palavra) e depois cada palavra significativa NA ORDEM
// EM QUE APARECE. No varejo o substantivo do produto vem quase sempre primeiro
// ("Caneta BIC azul", "Arroz Tio Joao", "Parafuso sextavado"), entao a primeira
// palavra costuma ser a mais relevante — ordenar por tamanho erraria o alvo
// (pegaria "Cristal" em vez de "Caneta", p.ex.).
function termosBuscaNcm(texto) {
  const limpo = String(texto || "").trim().replace(/\s+/g, " ");
  if (!limpo) return [];
  const palavras = limpo
    .split(" ")
    .map(p => p.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(p => p.length >= 3 && !STOPWORDS_NCM.has(p.toLowerCase()) && !/^\d+$/.test(p));
  const termos = [];
  if (limpo.includes(" ")) termos.push(limpo);
  for (const p of [...new Set(palavras)]) if (!termos.includes(p)) termos.push(p);
  return termos.slice(0, 4); // limita a 4 chamadas a BrasilAPI por busca
}

async function fetchNcmSearch(termo) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    const resp = await fetch(
      `${BRASILAPI_NCM_URL}?search=${encodeURIComponent(termo)}`,
      { headers: { Accept: "application/json" }, signal: ac.signal },
    );
    if (!resp.ok) return null;
    const dados = await resp.json().catch(() => null);
    return Array.isArray(dados) ? dados : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function buscarNcm(req, res, next) {
  try {
    const q = String(req.query.q || "").trim();
    if (q.length < 3) return res.status(400).json({ erro: "Informe ao menos 3 caracteres" });

    const chave = q.toLowerCase();
    if (cacheBuscaNcm.has(chave)) return res.json(cacheBuscaNcm.get(chave));

    const termos = termosBuscaNcm(q);
    if (termos.length === 0) return res.json({ termo: null, resultados: [] });

    for (const termo of termos) {
      const dados = await fetchNcmSearch(termo);
      if (!dados) continue;
      // Mantem so os codigos de 8 digitos (folhas da tabela, validos no XML).
      const resultados = dados
        .map(d => {
          const cod = String(d.codigo || "").replace(/\D/g, "");
          return cod.length === 8
            ? {
                ncm: cod,
                codigoFormatado: d.codigo,
                descricao: String(d.descricao || "").replace(/<[^>]+>/g, "").trim(),
              }
            : null;
        })
        .filter(Boolean)
        .slice(0, 25);
      if (resultados.length > 0) {
        const payload = { termo, resultados };
        cacheBuscaNcm.set(chave, payload);
        return res.json(payload);
      }
    }

    const vazio = { termo: termos[0], resultados: [] };
    cacheBuscaNcm.set(chave, vazio);
    return res.json(vazio);
  } catch (err) {
    next(err);
  }
}

// ============ SUGESTAO DE CEST POR NCM (Conv. 142/2018) ============
//
// Tabela local (sem API externa): dado o NCM escolhido, devolve os CEST
// candidatos. Sincrono e barato. Ver cestLookup.js para a ressalva fiscal
// (CEST so se aplica a itens com Substituicao Tributaria).
export async function buscarCest(req, res, next) {
  try {
    const ncm = String(req.query.ncm || "").replace(/\D/g, "");
    if (ncm.length !== 8) return res.status(400).json({ erro: "Informe um NCM de 8 digitos" });
    return res.json({ ncm, sugestoes: sugerirCest(ncm) });
  } catch (err) {
    next(err);
  }
}

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

// Historico de compras de UM produto: toda vez que ele entrou via nota de
// compra, com fornecedor, quantidade, preco unitario, subtotal e data. Usado
// pelo botao "Histórico de compras" no cadastro do produto. As compras
// canceladas/estornadas aparecem na lista (marcadas) mas NAO entram no resumo
// — o estorno ja reverteu a entrada de estoque.
export async function historicoCompras(req, res, next) {
  try {
    const produto = await prisma.produto.findUnique({
      where: { id: req.params.id },
      select: { id: true, codigo: true, nome: true, unidade: true, precoCusto: true },
    });
    if (!produto) return res.status(404).json({ erro: "Produto nao encontrado" });

    const itens = await prisma.itemCompra.findMany({
      where: { produtoId: req.params.id },
      select: {
        id: true,
        quantidade: true,
        precoUnitario: true,
        subtotal: true,
        compra: {
          select: {
            id: true,
            numero: true,
            createdAt: true,
            cancelada: true,
            fornecedor: { select: { id: true, nome: true, cnpj: true } },
          },
        },
      },
      orderBy: { compra: { createdAt: "desc" } },
    });

    // Resumo apenas das compras validas (nao canceladas).
    const validos = itens.filter(it => !it.compra.cancelada);
    let quantidadeTotal = 0;
    let valorTotal = 0;
    for (const it of validos) {
      quantidadeTotal += Number(it.quantidade);
      valorTotal += Number(it.subtotal);
    }
    quantidadeTotal = Math.round(quantidadeTotal * 1000) / 1000;
    valorTotal = Math.round(valorTotal * 100) / 100;
    const precoMedio = quantidadeTotal > 0
      ? Math.round((valorTotal / quantidadeTotal) * 100) / 100
      : null;
    const ultima = validos[0] || null; // ja vem ordenado por data desc

    res.json({
      produto,
      itens,
      resumo: {
        totalCompras: validos.length,
        quantidadeTotal,
        valorTotal,
        precoMedio,
        ultimoPreco: ultima ? Number(ultima.precoUnitario) : null,
        ultimaData: ultima ? ultima.compra.createdAt : null,
        ultimoFornecedor: ultima ? ultima.compra.fornecedor?.nome || null : null,
      },
    });
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

    // Ficha tecnica (producao propria): valida e cria junto com o produto.
    const composicao = normalizarComposicao(req.body.composicao);
    if (composicao === null) {
      return res.status(400).json({ erro: "Composicao invalida — cada insumo precisa de insumoId e quantidade > 0" });
    }
    if (composicao && composicao.length) {
      if (tipoItem === "SERVICO") {
        return res.status(400).json({ erro: "Servicos nao tem ficha tecnica" });
      }
      const erroInsumo = await validarInsumosComposicao(composicao);
      if (erroInsumo) return res.status(400).json({ erro: erroInsumo });
    }

    const produto = await prisma.produto.create({
      data: {
        codigo,
        codigoBarras: gtin.valor,
        referencia: norm(req.body.referencia),
        nome,
        descricao: norm(req.body.descricao),
        fabricanteId: norm(req.body.fabricanteId),
        tipoItem,
        precoVenda,
        precoCusto,
        estoque,
        estoqueMinimo,
        unidade: req.body.unidade ? String(req.body.unidade).trim().toUpperCase().slice(0, 6) : "UN",
        // Producao propria: false = venda nunca bloqueia por falta de saldo.
        controlarEstoque: req.body.controlarEstoque === undefined ? true : !!req.body.controlarEstoque,
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
        // ETAPA#6: campos extras por segmento (OEM/Lote/etc).
        camposSegmento: sanitizarCamposSegmento(req.body.camposSegmento),
        // Ficha tecnica: nested create. tenantId explicito — o wrapper so
        // propaga em create raiz; explicitar vale para qualquer caminho.
        ...(composicao && composicao.length
          ? { composicao: { create: composicao.map(c => ({ insumoId: c.insumoId, quantidade: c.quantidade, tenantId: req.tenantId })) } }
          : {}),
      },
      include: INCLUDE_REL,
    });
    res.status(201).json(produto);
  } catch (err) {
    if (err.code === "P2002") {
      const campo = err.meta?.target?.includes("codigoBarras") ? "codigo de barras" : "codigo";
      return res.status(409).json({ erro: `Ja existe um produto com este ${campo}` });
    }
    if (err.code === "P2003") return res.status(400).json({ erro: "Categoria, fornecedor ou fabricante inexistente" });
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
    if (req.body.fabricanteId !== undefined) data.fabricanteId = norm(req.body.fabricanteId);
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
    if (req.body.controlarEstoque !== undefined) data.controlarEstoque = !!req.body.controlarEstoque;

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
    if (req.body.camposSegmento !== undefined) {
      data.camposSegmento = sanitizarCamposSegmento(req.body.camposSegmento);
    }

    // Ficha tecnica: substituicao integral (deleteMany + create aninhados no
    // proprio update — atomico e ja escopado ao produto do tenant pelo where).
    // tenantId explicito no create: o hook de update do wrapper NAO propaga
    // tenant em nested writes (so o de create raiz).
    const composicao = normalizarComposicao(req.body.composicao);
    if (composicao === null) {
      return res.status(400).json({ erro: "Composicao invalida — cada insumo precisa de insumoId e quantidade > 0" });
    }
    if (data.tipoItem === "SERVICO") {
      // Virou servico: a receita deixa de existir.
      data.composicao = { deleteMany: {} };
    } else if (composicao !== undefined) {
      const erroInsumo = await validarInsumosComposicao(composicao, req.params.id);
      if (erroInsumo) return res.status(400).json({ erro: erroInsumo });
      data.composicao = {
        deleteMany: {},
        create: composicao.map(c => ({ insumoId: c.insumoId, quantidade: c.quantidade, tenantId: req.tenantId })),
      };
    }

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
    if (err.code === "P2003") return res.status(400).json({ erro: "Categoria, fornecedor ou fabricante inexistente" });
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
