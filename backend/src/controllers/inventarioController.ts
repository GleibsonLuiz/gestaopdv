import type { Request, Response, NextFunction } from "express";
import { Prisma, StatusInventario, TipoMovimentacao } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { criarComNumeroRetry } from "../lib/proximoNumero.js";

// =====================================================================
// INVENTARIO COM CONTAGEM CEGA
// =====================================================================
//
// REGRA DE NEGOCIO
// ----------------
//   ABERTURA      O gestor escolhe filtro (categoria opcional). Snapshot
//                 de Produto.estoque -> InventarioItem.estoqueLogico.
//                 Snapshot de Produto.precoCusto -> precoCustoMomento.
//   CONTAGEM      O operador NUNCA recebe estoqueLogico no payload da
//                 contagem (ver getFolhaContagem). So salva quantidade.
//   DIVERGENCIAS  Apenas gestor (requireRole no router). Calcula sobra/
//                 falta e impacto financeiro com snapshot de precoCusto.
//   CONSOLIDACAO  $transaction: atualiza Produto.estoque, gera
//                 MovimentacaoEstoque AJUSTE para cada item divergente,
//                 marca inventario CONCLUIDO. Atomico (ou tudo, ou nada).
//
// MULTI-TENANT
// ------------
//   O Prisma extension (backend/src/lib/prisma.js) ja injeta tenantId
//   em find/create/update/delete. Nao precisamos passar manualmente.
// =====================================================================

const INCLUDE_LISTA = {
  responsavel: { select: { id: true, nome: true } },
  _count: { select: { itens: true } },
} satisfies Prisma.InventarioInclude;

const INCLUDE_DETALHE_GESTOR = {
  responsavel: { select: { id: true, nome: true, email: true } },
  itens: {
    include: {
      produto: {
        select: {
          id: true,
          codigo: true,
          codigoBarras: true,
          nome: true,
          unidade: true,
          precoCusto: true,
          categoria: { select: { id: true, nome: true } },
        },
      },
    },
    orderBy: [{ produto: { codigo: "asc" } }],
  },
} satisfies Prisma.InventarioInclude;

// Para a folha de contagem: campos do produto sem precoCusto, e nunca o
// estoqueLogico do item. Forma o "vista do operador" — contagem cega.
const INCLUDE_FOLHA = {
  itens: {
    select: {
      id: true,
      quantidadeContada: true,
      contadoEm: true,
      observacao: true,
      produto: {
        select: {
          id: true,
          codigo: true,
          codigoBarras: true,
          nome: true,
          unidade: true,
          categoria: { select: { id: true, nome: true } },
        },
      },
    },
    orderBy: [{ produto: { codigo: "asc" } }],
  },
} satisfies Prisma.InventarioInclude;

function toInt(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : NaN;
}

// Quantidade contada / estoque agora sao Decimal(12,3). Aceita fracao.
function toQtd(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 1000) / 1000;
}

// =====================================================================
// LISTAR
// =====================================================================

export async function listar(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = req.query as { status?: string };
    const where: Prisma.InventarioWhereInput = {};
    if (status && ["ABERTO", "CONCLUIDO", "CANCELADO"].includes(status)) {
      where.status = status as StatusInventario;
    }
    const inventarios = await prisma.inventario.findMany({
      where,
      include: INCLUDE_LISTA,
      orderBy: { dataInicio: "desc" },
    });
    res.json(inventarios);
  } catch (err) {
    next(err);
  }
}

// =====================================================================
// OBTER (gestor: traz divergencias calculadas)
// =====================================================================

export async function obter(req: Request, res: Response, next: NextFunction) {
  try {
    const inv = await prisma.inventario.findUnique({
      where: { id: req.params.id },
      include: INCLUDE_DETALHE_GESTOR,
    });
    if (!inv) return res.status(404).json({ erro: "Inventario nao encontrado" });

    // Enriquecimento: para cada item, calcula impacto financeiro a partir
    // do snapshot de precoCusto. NUNCA confia no precoCusto atual do produto
    // (que pode ter mudado depois da abertura).
    const itensComCalculos = inv.itens.map((item) => {
      const contada = item.quantidadeContada === null ? null : Number(item.quantidadeContada);
      const logico = Number(item.estoqueLogico);
      const dif = contada === null ? null : Math.round((contada - logico) * 1000) / 1000;
      const custoUnit = item.precoCustoMomento ? Number(item.precoCustoMomento) : 0;
      const impactoFinanceiro = dif === null ? null : Number((dif * custoUnit).toFixed(2));
      return {
        ...item,
        diferencaCalculada: dif,
        impactoFinanceiro,
      };
    });

    // Totais agregados (resumo do cabecalho do relatorio)
    let totalItens = 0;
    let itensContados = 0;
    let itensComSobra = 0;
    let itensComFalta = 0;
    let itensOk = 0;
    let impactoTotal = 0;
    for (const it of itensComCalculos) {
      totalItens++;
      if (it.quantidadeContada !== null) {
        itensContados++;
        if (it.diferencaCalculada! > 0) itensComSobra++;
        else if (it.diferencaCalculada! < 0) itensComFalta++;
        else itensOk++;
        if (it.impactoFinanceiro !== null) impactoTotal += it.impactoFinanceiro;
      }
    }

    res.json({
      ...inv,
      itens: itensComCalculos,
      resumo: {
        totalItens,
        itensContados,
        itensPendentes: totalItens - itensContados,
        itensComSobra,
        itensComFalta,
        itensOk,
        impactoFinanceiroTotal: Number(impactoTotal.toFixed(2)),
      },
    });
  } catch (err) {
    next(err);
  }
}

// =====================================================================
// FOLHA DE CONTAGEM (visao do operador — SEM estoqueLogico!)
// =====================================================================

export async function getFolhaContagem(req: Request, res: Response, next: NextFunction) {
  try {
    const inv = await prisma.inventario.findUnique({
      where: { id: req.params.id },
      include: INCLUDE_FOLHA,
    });
    if (!inv) return res.status(404).json({ erro: "Inventario nao encontrado" });
    if (inv.status !== "ABERTO") {
      return res.status(409).json({
        erro: "Inventario ja consolidado ou cancelado — contagem encerrada",
      });
    }

    // Devolve so o necessario pra contagem cega. Cabecalho com numero/data
    // para o operador identificar a sessao + lista de itens sem estoque
    // logico nem custo.
    res.json({
      id: inv.id,
      numero: inv.numero,
      descricao: inv.descricao,
      filtroCategoria: inv.filtroCategoria,
      dataInicio: inv.dataInicio,
      itens: inv.itens,
    });
  } catch (err) {
    next(err);
  }
}

// =====================================================================
// ABRIR (gestor: snapshot de Produto.estoque e Produto.precoCusto)
// =====================================================================

export async function abrir(req: Request, res: Response, next: NextFunction) {
  try {
    const { descricao, observacoes, categoriaId, somenteAtivos } = req.body as {
      descricao?: string;
      observacoes?: string;
      categoriaId?: string;
      somenteAtivos?: boolean;
    };

    // Filtro do snapshot. Default: todos produtos ativos do tenant.
    const whereProd: Prisma.ProdutoWhereInput = {};
    if (somenteAtivos !== false) whereProd.ativo = true;
    if (categoriaId) whereProd.categoriaId = categoriaId;

    const produtos = await prisma.produto.findMany({
      where: whereProd,
      select: { id: true, estoque: true, precoCusto: true },
    });
    if (produtos.length === 0) {
      return res.status(400).json({
        erro: "Nenhum produto encontrado para o filtro selecionado",
      });
    }

    // Resolve nome da categoria (se filtrada) para exibir na folha de contagem.
    let filtroCategoria: string | null = null;
    if (categoriaId) {
      const cat = await prisma.categoria.findUnique({
        where: { id: categoriaId },
        select: { nome: true },
      });
      filtroCategoria = cat?.nome ?? null;
    }

    const reqWithCtx = req as Request & {
      user?: { sub?: string };
      tenantId?: string;
    };
    const responsavelId = reqWithCtx.user?.sub;
    const tenantId = reqWithCtx.tenantId;
    if (!responsavelId || !tenantId) {
      return res.status(401).json({ erro: "Usuario nao identificado" });
    }

    // Snapshot atomico: criar inventario + itens em transacao. Se algo
    // falhar (race em produto deletado), nada e gravado. O retry resolve
    // race-condition no compound unique (tenantId, numero).
    const inventario = await criarComNumeroRetry(
      prisma.inventario,
      tenantId,
      async (numero: number) =>
        prisma.inventario.create({
          data: {
            numero,
            descricao: descricao?.trim() || null,
            observacoes: observacoes?.trim() || null,
            filtroCategoria,
            status: "ABERTO",
            responsavelId,
            itens: {
              create: produtos.map((p) => ({
                produtoId: p.id,
                estoqueLogico: p.estoque,
                precoCustoMomento: p.precoCusto,
                quantidadeContada: null,
                diferenca: 0,
              })),
            },
          },
          include: INCLUDE_LISTA,
        })
    );

    res.status(201).json(inventario);
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ erro: "Conflito ao gerar numero do inventario" });
    }
    next(err);
  }
}

// =====================================================================
// SALVAR CONTAGENS (operador)
// =====================================================================

export async function salvarContagens(req: Request, res: Response, next: NextFunction) {
  try {
    const inv = await prisma.inventario.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });
    if (!inv) return res.status(404).json({ erro: "Inventario nao encontrado" });
    if (inv.status !== "ABERTO") {
      return res.status(409).json({
        erro: "Inventario ja consolidado ou cancelado — contagem encerrada",
      });
    }

    const { contagens } = req.body as {
      contagens?: Array<{ itemId: string; quantidadeContada: number; observacao?: string }>;
    };
    if (!Array.isArray(contagens) || contagens.length === 0) {
      return res.status(400).json({ erro: "Informe ao menos uma contagem" });
    }

    // Valida cada contagem antes de tocar no banco — payload todo-ou-nada.
    for (const c of contagens) {
      if (!c.itemId) return res.status(400).json({ erro: "itemId e obrigatorio" });
      const q = toQtd(c.quantidadeContada);
      if (q === null || !Number.isFinite(q) || q < 0) {
        return res.status(400).json({
          erro: `Quantidade invalida para o item ${c.itemId}`,
        });
      }
    }

    // Transacao: garante que se um item nao pertencer ao inventario, nada
    // e atualizado. Como estamos buscando os itens com WHERE composto
    // (id + inventarioId), o updateMany e seguro mesmo em inventario errado.
    const agora = new Date();
    await prisma.$transaction(async (tx) => {
      for (const c of contagens) {
        const q = toQtd(c.quantidadeContada)!;
        // Recupera estoqueLogico do snapshot para calcular diferenca.
        const item = await tx.inventarioItem.findFirst({
          where: { id: c.itemId, inventarioId: req.params.id },
          select: { id: true, estoqueLogico: true },
        });
        if (!item) {
          throw Object.assign(new Error("Item nao pertence a este inventario"), {
            statusHttp: 400,
          });
        }
        const diferenca = Math.round((q - Number(item.estoqueLogico)) * 1000) / 1000;
        await tx.inventarioItem.update({
          where: { id: item.id },
          data: {
            quantidadeContada: q,
            diferenca,
            observacao: c.observacao?.trim() || null,
            contadoEm: agora,
          },
        });
      }
    });

    res.json({ ok: true, total: contagens.length });
  } catch (err: unknown) {
    const e = err as { statusHttp?: number; message?: string };
    if (e.statusHttp) {
      return res.status(e.statusHttp).json({ erro: e.message });
    }
    next(err);
  }
}

// =====================================================================
// CONSOLIDAR (gestor: ajusta Produto.estoque + gera MovimentacaoEstoque)
// =====================================================================

export async function consolidar(req: Request, res: Response, next: NextFunction) {
  try {
    const inv = await prisma.inventario.findUnique({
      where: { id: req.params.id },
      include: {
        itens: {
          include: { produto: { select: { id: true, estoque: true } } },
        },
      },
    });
    if (!inv) return res.status(404).json({ erro: "Inventario nao encontrado" });
    if (inv.status !== "ABERTO") {
      return res.status(409).json({
        erro: "Inventario ja consolidado ou cancelado",
      });
    }

    // Bloqueia consolidacao com itens nao contados (regra rigida: contagem
    // cega exige contagem completa). Se o gestor quiser ignorar, deve
    // cancelar e abrir um novo, ou marcar item como contado=estoqueLogico.
    const naoContados = inv.itens.filter((i) => i.quantidadeContada === null);
    if (naoContados.length > 0) {
      return res.status(400).json({
        erro: `Existem ${naoContados.length} item(s) nao contado(s). Conclua a contagem antes de consolidar.`,
      });
    }

    const userId = (req as Request & { user?: { sub?: string } }).user?.sub;
    if (!userId) return res.status(401).json({ erro: "Usuario nao identificado" });

    // Para cada item divergente: aplica AJUSTE no produto + gera movimentacao.
    // Tudo em uma transacao — se falhar em qualquer linha, nada e gravado.
    const agora = new Date();
    const result = await prisma.$transaction(async (tx) => {
      let ajustados = 0;
      for (const item of inv.itens) {
        // Re-lemos o produto DENTRO da transacao para usar o estoque CORRENTE.
        // O estoqueLogico do snapshot serve apenas para calcular a divergencia
        // mostrada ao gestor; a movimentacao real usa o estado vigente.
        const prod = await tx.produto.findUnique({
          where: { id: item.produtoId },
          select: { id: true, estoque: true },
        });
        if (!prod) {
          throw Object.assign(new Error(`Produto ${item.produtoId} nao encontrado`), {
            statusHttp: 404,
          });
        }
        const estoqueAntes = Number(prod.estoque);
        const estoqueDepois = Number(item.quantidadeContada!);
        if (estoqueAntes === estoqueDepois) continue; // sem mudanca real

        const delta = Math.round((estoqueDepois - estoqueAntes) * 1000) / 1000;
        await tx.produto.update({
          where: { id: prod.id },
          data: { estoque: estoqueDepois },
        });
        await tx.movimentacaoEstoque.create({
          data: {
            tipo: TipoMovimentacao.AJUSTE,
            quantidade: Math.abs(delta),
            estoqueAntes,
            estoqueDepois,
            motivo: `Inventario #${inv.numero} - ${delta > 0 ? "sobra" : "falta"} de ${Math.abs(delta)}`,
            produtoId: prod.id,
            userId,
          },
        });
        ajustados++;
      }

      const inventarioConsolidado = await tx.inventario.update({
        where: { id: inv.id },
        data: { status: "CONCLUIDO", dataFim: agora },
        include: INCLUDE_LISTA,
      });

      return { inventario: inventarioConsolidado, ajustados };
    });

    res.json(result);
  } catch (err: unknown) {
    const e = err as { statusHttp?: number; message?: string };
    if (e.statusHttp) {
      return res.status(e.statusHttp).json({ erro: e.message });
    }
    next(err);
  }
}

// =====================================================================
// CANCELAR (gestor)
// =====================================================================

export async function cancelar(req: Request, res: Response, next: NextFunction) {
  try {
    const inv = await prisma.inventario.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });
    if (!inv) return res.status(404).json({ erro: "Inventario nao encontrado" });
    if (inv.status !== "ABERTO") {
      return res.status(409).json({
        erro: "Apenas inventarios ABERTOS podem ser cancelados",
      });
    }
    const atualizado = await prisma.inventario.update({
      where: { id: inv.id },
      data: { status: "CANCELADO", dataFim: new Date() },
      include: INCLUDE_LISTA,
    });
    res.json(atualizado);
  } catch (err) {
    next(err);
  }
}
