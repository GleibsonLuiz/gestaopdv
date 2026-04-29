import prisma from "../lib/prisma.js";

const TIPOS_VALIDOS = new Set(["ENTRADA", "SAIDA", "AJUSTE"]);

const INCLUDE_REL = {
  produto: { select: { id: true, codigo: true, nome: true, unidade: true } },
  user: { select: { id: true, nome: true } },
};

export async function listar(req, res, next) {
  try {
    const { produtoId, tipo, limite } = req.query;
    const where = {};
    if (produtoId) where.produtoId = produtoId;
    if (tipo && TIPOS_VALIDOS.has(tipo)) where.tipo = tipo;

    const take = Math.min(parseInt(limite, 10) || 200, 1000);

    const movimentacoes = await prisma.movimentacaoEstoque.findMany({
      where,
      include: INCLUDE_REL,
      orderBy: { createdAt: "desc" },
      take,
    });
    res.json(movimentacoes);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const { produtoId, tipo, quantidade, motivo } = req.body;

    if (!produtoId) return res.status(400).json({ erro: "produtoId e obrigatorio" });
    if (!tipo || !TIPOS_VALIDOS.has(tipo)) {
      return res.status(400).json({ erro: "Tipo invalido (use ENTRADA, SAIDA ou AJUSTE)" });
    }

    const qtd = parseInt(quantidade, 10);
    if (!Number.isFinite(qtd)) {
      return res.status(400).json({ erro: "Quantidade invalida" });
    }
    if (tipo !== "AJUSTE" && qtd <= 0) {
      return res.status(400).json({ erro: "Quantidade deve ser maior que zero para ENTRADA/SAIDA" });
    }
    if (tipo === "AJUSTE" && qtd < 0) {
      return res.status(400).json({ erro: "Para AJUSTE, informe a quantidade absoluta (>= 0) que o estoque deve ficar" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const produto = await tx.produto.findUnique({ where: { id: produtoId } });
      if (!produto) {
        const e = new Error("Produto nao encontrado");
        e.status = 404;
        throw e;
      }

      const antes = produto.estoque;
      let depois;
      if (tipo === "ENTRADA") depois = antes + qtd;
      else if (tipo === "SAIDA") depois = antes - qtd;
      else depois = qtd;

      if (depois < 0) {
        const e = new Error(`Estoque insuficiente. Atual: ${antes}, saida: ${qtd}`);
        e.status = 400;
        throw e;
      }

      await tx.produto.update({
        where: { id: produtoId },
        data: { estoque: depois },
      });

      const mov = await tx.movimentacaoEstoque.create({
        data: {
          tipo,
          quantidade: qtd,
          estoqueAntes: antes,
          estoqueDepois: depois,
          motivo: motivo ? String(motivo).trim() : null,
          produtoId,
          userId: req.user.sub,
        },
        include: INCLUDE_REL,
      });

      return mov;
    });

    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.message });
    next(err);
  }
}
