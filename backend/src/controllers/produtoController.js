import prisma from "../lib/prisma.js";

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
        { nome: { contains: search, mode: "insensitive" } },
      ];
    }

    let produtos = await prisma.produto.findMany({
      where,
      include: INCLUDE_REL,
      orderBy: { nome: "asc" },
    });

    if (estoqueBaixo === "true") {
      produtos = produtos.filter(p => p.estoque <= p.estoqueMinimo);
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

    const tipoItem = normalizarTipoItem(req.body.tipoItem);
    if (tipoItem === null) return res.status(400).json({ erro: "Tipo de item invalido (use PRODUTO ou SERVICO)" });

    const precoVenda = toNumber(req.body.precoVenda);
    if (precoVenda === null || Number.isNaN(precoVenda) || precoVenda < 0) {
      return res.status(400).json({ erro: "Preco de venda invalido" });
    }
    const precoCusto = req.body.precoCusto !== undefined ? toNumber(req.body.precoCusto) : null;
    if (precoCusto !== null && (Number.isNaN(precoCusto) || precoCusto < 0)) {
      return res.status(400).json({ erro: "Preco de custo invalido" });
    }

    // Servicos nao tem estoque: ignora qualquer valor enviado e zera os campos.
    let estoque = 0;
    let estoqueMinimo = 0;
    if (tipoItem === "PRODUTO") {
      estoque = toInt(req.body.estoque, 0);
      estoqueMinimo = toInt(req.body.estoqueMinimo, 0);
      if (Number.isNaN(estoque) || estoque < 0) return res.status(400).json({ erro: "Estoque invalido" });
      if (Number.isNaN(estoqueMinimo) || estoqueMinimo < 0) return res.status(400).json({ erro: "Estoque minimo invalido" });
    }

    const produto = await prisma.produto.create({
      data: {
        codigo,
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
      },
      include: INCLUDE_REL,
    });
    res.status(201).json(produto);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ erro: "Ja existe um produto com este codigo" });
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
    // Estoque so e aceito quando o item NAO esta sendo marcado como SERVICO
    // (campo ja zerado acima nesse caso).
    if (req.body.estoque !== undefined && data.tipoItem !== "SERVICO") {
      const v = toInt(req.body.estoque, NaN);
      if (Number.isNaN(v) || v < 0) return res.status(400).json({ erro: "Estoque invalido" });
      data.estoque = v;
    }
    if (req.body.estoqueMinimo !== undefined && data.tipoItem !== "SERVICO") {
      const v = toInt(req.body.estoqueMinimo, NaN);
      if (Number.isNaN(v) || v < 0) return res.status(400).json({ erro: "Estoque minimo invalido" });
      data.estoqueMinimo = v;
    }
    if (req.body.unidade !== undefined) {
      data.unidade = String(req.body.unidade).trim().toUpperCase().slice(0, 6) || "UN";
    }
    if (req.body.categoriaId !== undefined) data.categoriaId = norm(req.body.categoriaId);
    if (req.body.fornecedorId !== undefined) data.fornecedorId = norm(req.body.fornecedorId);
    if (req.body.ativo !== undefined) data.ativo = !!req.body.ativo;

    const produto = await prisma.produto.update({
      where: { id: req.params.id },
      data,
      include: INCLUDE_REL,
    });
    res.json(produto);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Produto nao encontrado" });
    if (err.code === "P2002") return res.status(409).json({ erro: "Ja existe um produto com este codigo" });
    if (err.code === "P2003") return res.status(400).json({ erro: "Categoria ou fornecedor inexistente" });
    next(err);
  }
}

export async function excluir(req, res, next) {
  try {
    if (req.query.permanente === "true") {
      await prisma.produto.delete({ where: { id: req.params.id } });
    } else {
      await prisma.produto.update({
        where: { id: req.params.id },
        data: { ativo: false },
      });
    }
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
