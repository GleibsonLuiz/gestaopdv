import prisma from "../lib/prisma.js";

const TIPOS_VALIDOS = new Set(["ENTRADA", "SAIDA", "AJUSTE"]);

function toNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

// Estoque com 3 casas decimais (Decimal(12,3) no banco).
function arredQtd(n) {
  return Math.round(n * 1000) / 1000;
}

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

    const qtdRaw = toNumber(quantidade);
    if (qtdRaw === null || Number.isNaN(qtdRaw)) {
      return res.status(400).json({ erro: "Quantidade invalida" });
    }
    if (tipo !== "AJUSTE" && qtdRaw <= 0) {
      return res.status(400).json({ erro: "Quantidade deve ser maior que zero para ENTRADA/SAIDA" });
    }
    if (tipo === "AJUSTE" && qtdRaw < 0) {
      return res.status(400).json({ erro: "Para AJUSTE, informe a quantidade absoluta (>= 0) que o estoque deve ficar" });
    }
    const qtd = arredQtd(qtdRaw);

    const result = await prisma.$transaction(async (tx) => {
      const produto = await tx.produto.findUnique({ where: { id: produtoId } });
      if (!produto) {
        const e = new Error("Produto nao encontrado");
        e.status = 404;
        throw e;
      }
      if (produto.tipoItem === "SERVICO") {
        const e = new Error("Servicos nao tem estoque — movimentacao nao permitida");
        e.status = 400;
        throw e;
      }

      const antes = Number(produto.estoque);
      let depois;
      if (tipo === "ENTRADA") depois = arredQtd(antes + qtd);
      else if (tipo === "SAIDA") depois = arredQtd(antes - qtd);
      else depois = qtd;

      // Producao propria (controlarEstoque=false) pode ficar negativa — ex:
      // registrar a perda do pao no fim do dia mesmo sem ter lancado producao.
      if (depois < 0 && produto.controlarEstoque !== false) {
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

// ============ REGISTRAR PRODUCAO (ficha tecnica / producao propria) ============
//
// Padaria/lanchonete: o produto final (pao, bolo, lanche) tem uma receita
// (ComposicaoProduto) que diz quanto de cada insumo e consumido por unidade
// produzida. Registrar a producao de N unidades faz, numa unica transacao:
//
//   1. SAIDA proporcional de cada insumo (coeficiente x N, arredondado a
//      3 casas) — bloqueia se o insumo controlado nao tiver saldo;
//   2. ENTRADA de N no produto final;
//
// tudo auditado em MovimentacaoEstoque com motivo "Producao". A resposta
// inclui o custo dos insumos consumidos (precoCusto x consumo) para o front
// mostrar o custo real do lote e por unidade produzida.
export async function registrarProducao(req, res, next) {
  try {
    const { produtoId, quantidade, observacao } = req.body;
    if (!produtoId) return res.status(400).json({ erro: "produtoId e obrigatorio" });
    const qtdRaw = toNumber(quantidade);
    if (qtdRaw === null || Number.isNaN(qtdRaw) || qtdRaw <= 0) {
      return res.status(400).json({ erro: "Quantidade produzida invalida" });
    }
    const qtd = arredQtd(qtdRaw);
    const obs = observacao ? ` — ${String(observacao).trim().slice(0, 120)}` : "";

    const resultado = await prisma.$transaction(async (tx) => {
      const produto = await tx.produto.findUnique({
        where: { id: produtoId },
        include: { composicao: { include: { insumo: true } } },
      });
      if (!produto) {
        const e = new Error("Produto nao encontrado"); e.status = 404; throw e;
      }
      if (produto.tipoItem === "SERVICO") {
        const e = new Error("Servicos nao tem producao de estoque"); e.status = 400; throw e;
      }
      if (!produto.composicao.length) {
        const e = new Error(`"${produto.nome}" nao tem ficha tecnica — cadastre a receita na aba Composicao do produto antes de registrar producao`);
        e.status = 400; throw e;
      }

      const saidas = [];
      let custoInsumos = 0;

      for (const item of produto.composicao) {
        const insumo = item.insumo;
        const consumo = arredQtd(Number(item.quantidade) * qtd);
        if (!(consumo > 0)) continue;
        const antesIns = Number(insumo.estoque);
        const depoisIns = arredQtd(antesIns - consumo);
        // Mesma regra da venda: insumo controlado nao pode ficar negativo;
        // insumo sem controle (raro) deixa produzir mesmo assim.
        if (depoisIns < 0 && insumo.controlarEstoque !== false) {
          const e = new Error(`Insumo insuficiente: "${insumo.nome}" — necessario ${consumo} ${insumo.unidade || ""}, disponivel ${antesIns}`);
          e.status = 400; throw e;
        }
        await tx.produto.update({
          where: { id: insumo.id },
          data: { estoque: depoisIns },
        });
        const mov = await tx.movimentacaoEstoque.create({
          data: {
            tipo: "SAIDA",
            quantidade: consumo,
            estoqueAntes: antesIns,
            estoqueDepois: depoisIns,
            motivo: `Produção: ${produto.nome}${obs}`,
            produtoId: insumo.id,
            userId: req.user.sub,
          },
          include: INCLUDE_REL,
        });
        saidas.push(mov);
        custoInsumos += Number(insumo.precoCusto || 0) * consumo;
      }

      const antes = Number(produto.estoque);
      const depois = arredQtd(antes + qtd);
      await tx.produto.update({
        where: { id: produto.id },
        data: { estoque: depois },
      });
      const entrada = await tx.movimentacaoEstoque.create({
        data: {
          tipo: "ENTRADA",
          quantidade: qtd,
          estoqueAntes: antes,
          estoqueDepois: depois,
          motivo: `Produção própria${obs}`,
          produtoId: produto.id,
          userId: req.user.sub,
        },
        include: INCLUDE_REL,
      });

      custoInsumos = Math.round(custoInsumos * 100) / 100;
      return {
        produto: { id: produto.id, nome: produto.nome, unidade: produto.unidade, estoque: depois },
        quantidadeProduzida: qtd,
        custoInsumos,
        custoUnitario: qtd > 0 ? Math.round((custoInsumos / qtd) * 100) / 100 : null,
        entrada,
        saidas,
      };
    });

    res.status(201).json(resultado);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.message });
    next(err);
  }
}
