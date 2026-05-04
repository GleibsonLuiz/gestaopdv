import prisma from "../lib/prisma.js";
import { parseDate, gerarSerieRecorrencia, calcularValores } from "../lib/contas.js";

const INCLUDE_LISTA = {
  fornecedor: { select: { id: true, nome: true, cnpj: true } },
  _count: { select: { itens: true } },
};

const INCLUDE_DETALHE = {
  fornecedor: { select: { id: true, nome: true, cnpj: true, email: true, telefone: true } },
  itens: {
    include: {
      produto: { select: { id: true, codigo: true, nome: true, unidade: true } },
    },
  },
};

function toNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export async function listar(req, res, next) {
  try {
    const { fornecedorId, dataInicio, dataFim } = req.query;
    const where = {};
    if (fornecedorId) where.fornecedorId = fornecedorId;
    if (dataInicio || dataFim) {
      where.createdAt = {};
      if (dataInicio) where.createdAt.gte = new Date(dataInicio);
      if (dataFim) where.createdAt.lte = new Date(dataFim + "T23:59:59.999Z");
    }
    const compras = await prisma.compra.findMany({
      where,
      include: INCLUDE_LISTA,
      orderBy: { createdAt: "desc" },
    });
    res.json(compras);
  } catch (err) {
    next(err);
  }
}

export async function obter(req, res, next) {
  try {
    const compra = await prisma.compra.findUnique({
      where: { id: req.params.id },
      include: INCLUDE_DETALHE,
    });
    if (!compra) return res.status(404).json({ erro: "Compra nao encontrada" });
    res.json(compra);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const { fornecedorId, observacoes, itens, gerarContaPagar } = req.body;

    if (!fornecedorId) return res.status(400).json({ erro: "fornecedorId e obrigatorio" });
    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: "Informe ao menos um item" });
    }

    // Validacao da conta a pagar (se solicitada). Feita ANTES da transacao
    // para falhar rapido sem precisar reverter a compra.
    let configConta = null;
    if (gerarContaPagar) {
      const venc = parseDate(gerarContaPagar.vencimento);
      if (!venc) return res.status(400).json({ erro: "Vencimento da conta a pagar invalido" });
      const parcelas = parseInt(gerarContaPagar.parcelas, 10) || 1;
      if (parcelas < 1 || parcelas > 60) {
        return res.status(400).json({ erro: "Numero de parcelas deve estar entre 1 e 60" });
      }
      configConta = {
        vencimento: venc,
        parcelas,
        descricaoCustom: gerarContaPagar.descricao
          ? String(gerarContaPagar.descricao).trim().toUpperCase().slice(0, 200)
          : null,
        observacoesConta: gerarContaPagar.observacoes
          ? String(gerarContaPagar.observacoes).trim().toUpperCase().slice(0, 500)
          : null,
      };
    }

    const itensNorm = [];
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      const idx = i + 1;
      if (!it?.produtoId) return res.status(400).json({ erro: `Item ${idx}: produtoId obrigatorio` });
      const qtd = parseInt(it.quantidade, 10);
      if (!Number.isFinite(qtd) || qtd <= 0) {
        return res.status(400).json({ erro: `Item ${idx}: quantidade deve ser > 0` });
      }
      const preco = toNumber(it.precoUnitario);
      if (preco === null || Number.isNaN(preco) || preco < 0) {
        return res.status(400).json({ erro: `Item ${idx}: precoUnitario invalido` });
      }
      itensNorm.push({ produtoId: it.produtoId, quantidade: qtd, precoUnitario: preco });
    }

    const total = itensNorm.reduce((acc, it) => acc + it.quantidade * it.precoUnitario, 0);

    try {
      const compra = await prisma.$transaction(async (tx) => {
        const fornecedor = await tx.fornecedor.findUnique({ where: { id: fornecedorId } });
        if (!fornecedor) {
          const e = new Error("Fornecedor nao encontrado"); e.status = 404; throw e;
        }

        const produtos = await tx.produto.findMany({
          where: { id: { in: itensNorm.map(i => i.produtoId) } },
        });
        const mapaProdutos = new Map(produtos.map(p => [p.id, p]));

        for (const it of itensNorm) {
          const p = mapaProdutos.get(it.produtoId);
          if (!p) {
            const e = new Error(`Produto ${it.produtoId} nao encontrado`); e.status = 404; throw e;
          }
          if (p.tipoItem === "SERVICO") {
            const e = new Error(`"${p.nome}" e um servico — nao pode ser incluido em compra`);
            e.status = 400; throw e;
          }
        }

        const compraCriada = await tx.compra.create({
          data: {
            fornecedorId,
            total,
            observacoes: observacoes ? String(observacoes).trim() : null,
            itens: {
              create: itensNorm.map(it => ({
                produtoId: it.produtoId,
                quantidade: it.quantidade,
                precoUnitario: it.precoUnitario,
                subtotal: it.quantidade * it.precoUnitario,
              })),
            },
          },
          include: INCLUDE_DETALHE,
        });

        for (const it of itensNorm) {
          const p = mapaProdutos.get(it.produtoId);
          const antes = p.estoque;
          const depois = antes + it.quantidade;
          await tx.produto.update({
            where: { id: it.produtoId },
            data: { estoque: depois },
          });
          await tx.movimentacaoEstoque.create({
            data: {
              tipo: "ENTRADA",
              quantidade: it.quantidade,
              estoqueAntes: antes,
              estoqueDepois: depois,
              motivo: `Compra #${compraCriada.numero}`,
              produtoId: it.produtoId,
              userId: req.user.sub,
            },
          });
        }

        // Conta a pagar opcional. Reaproveita a logica de parcelamento do
        // financeiro: 1 parcela = NENHUMA, >1 = PARCELADA (divide o total).
        // Tudo dentro da mesma transacao — se algo falhar, a compra tambem
        // e revertida.
        let contasGeradas = [];
        if (configConta) {
          const descricao = configConta.descricaoCustom
            || `COMPRA #${compraCriada.numero} - ${fornecedor.nome.toUpperCase()}`;
          const calc = calcularValores({
            valorBruto: total, juros: 0, multa: 0, desconto: 0,
          });
          if (!calc.ok) { const e = new Error(calc.erro); e.status = 400; throw e; }
          const serie = gerarSerieRecorrencia({
            tipoRecorrencia: configConta.parcelas > 1 ? "PARCELADA" : "NENHUMA",
            parcelaTotal: configConta.parcelas,
            valores: calc.valores,
            vencimento: configConta.vencimento,
            dadosBase: {
              descricao,
              fornecedorId,
              observacoes: configConta.observacoesConta || `GERADA AUTOMATICAMENTE PELA COMPRA #${compraCriada.numero}`,
            },
          });
          if (!serie.ok) {
            const e = new Error(serie.erro); e.status = 400; throw e;
          }
          for (const reg of serie.registros) {
            const conta = await tx.contaPagar.create({ data: reg });
            contasGeradas.push({
              id: conta.id,
              descricao: conta.descricao,
              valor: Number(conta.valor),
              vencimento: conta.vencimento,
              parcelaAtual: conta.parcelaAtual,
              parcelaTotal: conta.parcelaTotal,
            });
          }
        }

        return { ...compraCriada, contasGeradas };
      });

      res.status(201).json(compra);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      throw err;
    }
  } catch (err) {
    next(err);
  }
}
