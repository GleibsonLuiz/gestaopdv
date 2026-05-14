import prisma from "../lib/prisma.js";

const CONFIG_ID = "default";

const DEFAULTS = {
  ativo: true,
  reaisPorPonto: 1,
  pontosParaUmReal: 100,
  minimoResgate: 100,
  maximoDescPct: 50,
};

export async function obterConfig(req, res, next) {
  try {
    const config = await prisma.configuracaoFidelidade.findFirst();
    res.json(config ?? { id: CONFIG_ID, ...DEFAULTS, createdAt: new Date(), updatedAt: new Date() });
  } catch (err) { next(err); }
}

export async function salvarConfig(req, res, next) {
  try {
    const { ativo, reaisPorPonto, pontosParaUmReal, minimoResgate, maximoDescPct } = req.body;
    const data = {};

    if (ativo !== undefined) data.ativo = Boolean(ativo);
    if (reaisPorPonto !== undefined) {
      const n = Number(reaisPorPonto);
      if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ erro: "reaisPorPonto invalido" });
      data.reaisPorPonto = n;
    }
    if (pontosParaUmReal !== undefined) {
      const n = parseInt(pontosParaUmReal, 10);
      if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ erro: "pontosParaUmReal invalido" });
      data.pontosParaUmReal = n;
    }
    if (minimoResgate !== undefined) {
      const n = parseInt(minimoResgate, 10);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ erro: "minimoResgate invalido" });
      data.minimoResgate = n;
    }
    if (maximoDescPct !== undefined) {
      const n = Number(maximoDescPct);
      if (!Number.isFinite(n) || n < 0 || n > 100) return res.status(400).json({ erro: "maximoDescPct invalido (0–100)" });
      data.maximoDescPct = n;
    }

    const config = await prisma.configuracaoFidelidade.upsert({
      where: { id: CONFIG_ID },
      update: { ...data, updatedAt: new Date() },
      create: { id: CONFIG_ID, ...DEFAULTS, ...data },
    });
    res.json(config);
  } catch (err) { next(err); }
}

export async function pontosPorCliente(req, res, next) {
  try {
    const { clienteId } = req.params;
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, nome: true },
    });
    if (!cliente) return res.status(404).json({ erro: "Cliente nao encontrado" });

    const [pontos, historico] = await Promise.all([
      prisma.pontosCliente.findUnique({ where: { clienteId } }),
      prisma.movimentacaoPontos.findMany({
        where: { clienteId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          user: { select: { id: true, nome: true } },
          venda: { select: { id: true, numero: true } },
        },
      }),
    ]);

    res.json({
      cliente,
      saldo: pontos?.saldo ?? 0,
      totalGanho: pontos?.totalGanho ?? 0,
      totalResgatado: pontos?.totalResgatado ?? 0,
      historico,
    });
  } catch (err) { next(err); }
}

export async function ajustarPontos(req, res, next) {
  try {
    const { clienteId } = req.params;
    const { tipo, pontos, descricao } = req.body;

    if (!["GANHO", "RESGATE", "AJUSTE"].includes(tipo)) {
      return res.status(400).json({ erro: "tipo invalido. Use GANHO, RESGATE ou AJUSTE" });
    }
    const qtd = parseInt(pontos, 10);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      return res.status(400).json({ erro: "pontos deve ser um inteiro positivo" });
    }

    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) return res.status(404).json({ erro: "Cliente nao encontrado" });

    try {
      const mov = await prisma.$transaction(async (tx) => {
        const atual = await tx.pontosCliente.findUnique({ where: { clienteId } });
        const saldo = atual?.saldo ?? 0;

        if (tipo === "RESGATE" && saldo < qtd) {
          const e = new Error(`Saldo insuficiente. Disponivel: ${saldo} pontos`);
          e.status = 400; throw e;
        }

        const delta = tipo === "RESGATE" ? -qtd : qtd;

        await tx.pontosCliente.upsert({
          where: { clienteId },
          update: {
            saldo: { increment: delta },
            ...(delta > 0 ? { totalGanho: { increment: qtd } } : { totalResgatado: { increment: qtd } }),
            updatedAt: new Date(),
          },
          create: {
            clienteId,
            saldo: Math.max(0, delta),
            totalGanho: delta > 0 ? qtd : 0,
            totalResgatado: delta < 0 ? qtd : 0,
          },
        });

        return tx.movimentacaoPontos.create({
          data: {
            tipo,
            pontos: qtd,
            descricao: descricao ? String(descricao).trim().slice(0, 200) : null,
            clienteId,
            userId: req.user.sub,
          },
          include: { user: { select: { id: true, nome: true } } },
        });
      });
      res.json(mov);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      throw err;
    }
  } catch (err) { next(err); }
}
