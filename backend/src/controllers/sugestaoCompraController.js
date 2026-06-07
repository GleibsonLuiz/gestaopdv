import prisma from "../lib/prisma.js";

// ============ SUGESTOES DE COMPRA (lista de reposicao) ============
//
// Estrategia (ver model SugestaoCompra no schema): a sugestao AUTOMATICA
// (estoque <= estoqueMinimo) e calculada ao vivo a cada leitura — nunca
// gravada, entao nunca desatualiza quando o estoque muda. A tabela
// sugestoes_compra guarda so a intencao do usuario (itens manuais, overrides
// de quantidade/fornecedor e sugestoes do sistema descartadas). O endpoint de
// listagem MESCLA as duas fontes e marca cada item com origem + abaixoMinimo.

function toNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

// Quantidade Decimal(12,3) — arredonda para 3 casas (espelha Produto.estoque).
function arredQtd(n) {
  return Math.round(n * 1000) / 1000;
}

// Quantidade sugerida padrao: repor ate ~2x o minimo (cobre o consumo + uma
// folga). Piso de 1 para nunca sugerir comprar zero. So faz sentido com
// minimo > 0; nesse caso 2*min - estoque >= min > 0 quando estoque <= min.
export function qtdSugeridaPadrao(estoque, minimo) {
  const e = Number(estoque) || 0;
  const m = Number(minimo) || 0;
  if (m <= 0) return 1;
  const alvo = arredQtd(m * 2 - e);
  return alvo >= 1 ? alvo : 1;
}

/**
 * Mescla as sugestoes do sistema (estoque baixo, calculadas) com as linhas
 * persistidas (manuais / overrides / descartadas). Funcao PURA — recebe
 * arrays ja normalizados e nao toca no banco, para ser testavel isoladamente.
 *
 * @param {Array} produtosBaixos - produtos com estoque <= estoqueMinimo (>0).
 *   Cada um: { id, codigo, nome, unidade, estoque, estoqueMinimo, precoCusto,
 *              fornecedorId, fornecedorNome }
 * @param {Array} linhasSalvas - linhas de sugestoes_compra (status PENDENTE ou
 *   DESCARTADO) com produto+fornecedor. Cada uma: { produtoId, origem, status,
 *   quantidadeSugerida, observacao, fornecedorId, fornecedorNome, produto:{...} }
 * @returns {Array} itens da lista, ordenados (abaixo do minimo primeiro).
 */
export function mesclarSugestoes(produtosBaixos, linhasSalvas) {
  const salvasPorProduto = new Map();
  for (const l of linhasSalvas) salvasPorProduto.set(l.produtoId, l);

  const itens = [];
  const baixosIds = new Set();

  // 1) Sugestoes do sistema (estoque baixo).
  for (const p of produtosBaixos) {
    baixosIds.add(p.id);
    const salva = salvasPorProduto.get(p.id);
    // Descartada pelo usuario: some da lista ate ser readicionada.
    if (salva && salva.status === "DESCARTADO") continue;

    const estoque = Number(p.estoque) || 0;
    const minimo = Number(p.estoqueMinimo) || 0;
    const qtdSalva = salva ? toNumber(salva.quantidadeSugerida) : null;
    itens.push({
      produtoId: p.id,
      codigo: p.codigo,
      nome: p.nome,
      unidade: p.unidade || "UN",
      estoque,
      estoqueMinimo: minimo,
      precoCusto: p.precoCusto != null ? Number(p.precoCusto) : null,
      abaixoMinimo: true,
      // Se o usuario ja interagiu (linha MANUAL), respeita a origem dele.
      origem: salva && salva.origem === "MANUAL" ? "MANUAL" : "SISTEMA",
      quantidadeSugerida: qtdSalva != null && !Number.isNaN(qtdSalva)
        ? qtdSalva
        : qtdSugeridaPadrao(estoque, minimo),
      fornecedorId: (salva && salva.fornecedorId) || p.fornecedorId || null,
      fornecedorNome: (salva && salva.fornecedorNome) || p.fornecedorNome || null,
      observacao: salva ? salva.observacao || null : null,
      temLinhaSalva: !!salva,
    });
  }

  // 2) Linhas manuais cujo produto NAO esta abaixo do minimo (antecipacao).
  for (const l of linhasSalvas) {
    if (l.status !== "PENDENTE") continue;
    if (baixosIds.has(l.produtoId)) continue; // ja entrou no passo 1
    const prod = l.produto || {};
    const estoque = Number(prod.estoque) || 0;
    const minimo = Number(prod.estoqueMinimo) || 0;
    const qtdSalva = toNumber(l.quantidadeSugerida);
    itens.push({
      produtoId: l.produtoId,
      codigo: prod.codigo || "",
      nome: prod.nome || "",
      unidade: prod.unidade || "UN",
      estoque,
      estoqueMinimo: minimo,
      precoCusto: prod.precoCusto != null ? Number(prod.precoCusto) : null,
      abaixoMinimo: false,
      origem: "MANUAL",
      quantidadeSugerida: qtdSalva != null && !Number.isNaN(qtdSalva) && qtdSalva > 0
        ? qtdSalva
        : (minimo > 0 ? qtdSugeridaPadrao(estoque, minimo) : 1),
      fornecedorId: l.fornecedorId || prod.fornecedorId || null,
      fornecedorNome: l.fornecedorNome || (prod.fornecedor ? prod.fornecedor.nome : null) || null,
      observacao: l.observacao || null,
      temLinhaSalva: true,
    });
  }

  // Ordena: abaixo do minimo primeiro (mais urgente: maior deficit), depois nome.
  itens.sort((a, b) => {
    if (a.abaixoMinimo !== b.abaixoMinimo) return a.abaixoMinimo ? -1 : 1;
    if (a.abaixoMinimo) {
      const da = a.estoque - a.estoqueMinimo;
      const db = b.estoque - b.estoqueMinimo;
      if (da !== db) return da - db;
    }
    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  return itens;
}

// Normaliza uma linha do banco (com includes) para o formato esperado por
// mesclarSugestoes.
function normalizarLinhaSalva(l) {
  return {
    produtoId: l.produtoId,
    origem: l.origem,
    status: l.status,
    quantidadeSugerida: l.quantidadeSugerida,
    observacao: l.observacao,
    fornecedorId: l.fornecedorId,
    fornecedorNome: l.fornecedor ? l.fornecedor.nome : null,
    produto: l.produto || null,
  };
}

export async function listar(req, res, next) {
  try {
    const tenantId = req.tenantId;

    // Estoque baixo via SQL (filtra no banco, nao carrega o catalogo todo).
    // $queryRaw bypassa o Prisma Extension — filtro de tenant manual.
    const [produtosBaixos, linhas] = await Promise.all([
      prisma.$queryRaw`
        SELECT p.id, p.codigo, p.nome, p.unidade, p.estoque,
               p."estoqueMinimo", p."precoCusto",
               p."fornecedorId", f.nome AS "fornecedorNome"
        FROM produtos p
        LEFT JOIN fornecedores f ON f.id = p."fornecedorId"
        WHERE p.ativo = true
          AND p."tipoItem" = 'PRODUTO'
          AND p."estoqueMinimo" > 0
          AND p.estoque <= p."estoqueMinimo"
          AND p."tenantId" = ${tenantId}
        ORDER BY (p.estoque - p."estoqueMinimo") ASC, p.nome ASC
      `,
      prisma.sugestaoCompra.findMany({
        where: { status: { in: ["PENDENTE", "DESCARTADO"] } },
        include: {
          produto: {
            select: {
              id: true, codigo: true, nome: true, unidade: true,
              estoque: true, estoqueMinimo: true, precoCusto: true,
              ativo: true, tipoItem: true,
              fornecedorId: true,
              fornecedor: { select: { id: true, nome: true } },
            },
          },
          fornecedor: { select: { id: true, nome: true } },
        },
      }),
    ]);

    // Descarta linhas cujo produto sumiu/foi inativado/virou servico.
    const linhasValidas = linhas
      .filter((l) => l.produto && l.produto.ativo && l.produto.tipoItem === "PRODUTO")
      .map(normalizarLinhaSalva);

    const itens = mesclarSugestoes(produtosBaixos, linhasValidas);

    res.json({
      geradoEm: new Date().toISOString(),
      total: itens.length,
      contagem: {
        abaixoMinimo: itens.filter((i) => i.abaixoMinimo).length,
        manual: itens.filter((i) => i.origem === "MANUAL").length,
        sistema: itens.filter((i) => i.origem === "SISTEMA").length,
      },
      itens,
    });
  } catch (err) {
    next(err);
  }
}

// Faz upsert da linha de sugestao para um produto, aplicando os campos
// informados. A origem e calculada: se o produto esta abaixo do minimo agora,
// e um override de sugestao do sistema (SISTEMA); senao e antecipacao MANUAL.
async function upsertLinha(req, produtoId, dados) {
  // findFirst (nao findUnique) para que a extensao multi-tenant injete o
  // filtro tenantId no where — garante que so produtos do proprio tenant
  // entrem na lista (findUnique nao permite filtrar por tenant no where).
  const produto = await prisma.produto.findFirst({
    where: { id: produtoId },
    select: { id: true, tipoItem: true, estoque: true, estoqueMinimo: true },
  });
  if (!produto) { const e = new Error("Produto nao encontrado"); e.status = 404; throw e; }
  if (produto.tipoItem === "SERVICO") {
    const e = new Error("Servicos nao entram na lista de compras"); e.status = 400; throw e;
  }

  const abaixoMinimo = Number(produto.estoqueMinimo) > 0
    && Number(produto.estoque) <= Number(produto.estoqueMinimo);
  const origem = dados.origemForcada || (abaixoMinimo ? "SISTEMA" : "MANUAL");

  const set = {};
  if (dados.quantidadeSugerida !== undefined) set.quantidadeSugerida = dados.quantidadeSugerida;
  if (dados.fornecedorId !== undefined) set.fornecedorId = dados.fornecedorId;
  if (dados.observacao !== undefined) set.observacao = dados.observacao;
  if (dados.status !== undefined) set.status = dados.status;

  return prisma.sugestaoCompra.upsert({
    where: { tenantId_produtoId: { tenantId: req.tenantId, produtoId } },
    create: {
      produtoId,
      origem,
      status: dados.status || "PENDENTE",
      quantidadeSugerida: dados.quantidadeSugerida ?? null,
      fornecedorId: dados.fornecedorId ?? null,
      observacao: dados.observacao ?? null,
      userId: req.user?.sub || null,
    },
    update: { ...set, userId: req.user?.sub || null },
    include: { fornecedor: { select: { id: true, nome: true } } },
  });
}

// Valida e normaliza o corpo comum (quantidade/fornecedor/observacao).
function lerCampos(body) {
  const dados = {};
  if (body.quantidadeSugerida !== undefined && body.quantidadeSugerida !== null && body.quantidadeSugerida !== "") {
    const q = toNumber(body.quantidadeSugerida);
    if (q === null || Number.isNaN(q) || q <= 0) {
      const e = new Error("Quantidade sugerida deve ser maior que zero"); e.status = 400; throw e;
    }
    dados.quantidadeSugerida = arredQtd(q);
  }
  if (body.fornecedorId !== undefined) {
    dados.fornecedorId = body.fornecedorId ? String(body.fornecedorId) : null;
  }
  if (body.observacao !== undefined) {
    dados.observacao = body.observacao ? String(body.observacao).trim().slice(0, 300) : null;
  }
  return dados;
}

// POST /sugestoes-compra — adiciona um produto manualmente a lista.
export async function adicionarManual(req, res, next) {
  try {
    const { produtoId } = req.body || {};
    if (!produtoId) return res.status(400).json({ erro: "produtoId e obrigatorio" });
    const dados = lerCampos(req.body || {});
    // Adicao manual sempre marca como pendente (re-adicionar reativa um item
    // que estava descartado).
    dados.status = "PENDENTE";
    dados.origemForcada = "MANUAL";
    const linha = await upsertLinha(req, produtoId, dados);
    res.status(201).json(linha);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.message });
    next(err);
  }
}

// PATCH /sugestoes-compra/:produtoId — ajusta quantidade/fornecedor/observacao
// (materializa um override de uma sugestao do sistema, se ainda nao existia).
export async function atualizar(req, res, next) {
  try {
    const dados = lerCampos(req.body || {});
    const linha = await upsertLinha(req, req.params.produtoId, dados);
    res.json(linha);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.message });
    next(err);
  }
}

// POST /sugestoes-compra/:produtoId/descartar — esconde uma sugestao do
// sistema (status=DESCARTADO). Volta a aparecer se o usuario readicionar.
export async function descartar(req, res, next) {
  try {
    const linha = await upsertLinha(req, req.params.produtoId, { status: "DESCARTADO" });
    res.json(linha);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.message });
    next(err);
  }
}

// DELETE /sugestoes-compra/:produtoId — remove a linha persistida (item
// manual sai da lista; sugestao do sistema sem linha simplesmente nao tem o
// que remover e volta a ser calculada).
export async function remover(req, res, next) {
  try {
    const r = await prisma.sugestaoCompra.deleteMany({
      where: { produtoId: req.params.produtoId },
    });
    res.json({ removidos: r.count });
  } catch (err) {
    next(err);
  }
}

// POST /sugestoes-compra/limpar — limpa varios itens de uma vez (usado apos
// gerar o pedido com a opcao "limpar lista"). Remove as linhas persistidas;
// sugestoes do sistema somem sozinhas quando o estoque sobe com a compra.
export async function limpar(req, res, next) {
  try {
    const { produtoIds } = req.body || {};
    if (!Array.isArray(produtoIds) || produtoIds.length === 0) {
      return res.status(400).json({ erro: "Informe produtoIds (lista nao vazia)" });
    }
    const ids = produtoIds.filter((x) => typeof x === "string");
    const r = await prisma.sugestaoCompra.deleteMany({
      where: { produtoId: { in: ids } },
    });
    res.json({ removidos: r.count });
  } catch (err) {
    next(err);
  }
}
