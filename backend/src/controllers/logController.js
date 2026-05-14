import prisma from "../lib/prisma.js";

// Lista logs com filtros e paginacao. Apenas ADMIN.
// Filtros suportados:
//   usuarioId  - id do usuario que fez a acao
//   modulo     - CLIENTES | PRODUTOS | AUTH | ...
//   acao       - CREATE | UPDATE | DELETE | LOGIN | LOGIN_FALHO | LOGOUT | TROCA_SENHA
//   sucesso    - "true" | "false"
//   dataInicio - ISO date (YYYY-MM-DD)
//   dataFim    - ISO date (YYYY-MM-DD)
//   busca      - string livre em rota/email/nome/mensagem
//   pagina     - 1..N (default 1)
//   tamanho    - 1..200 (default 50)
export async function listar(req, res, next) {
  try {
    const {
      usuarioId, modulo, acao, sucesso, dataInicio, dataFim, busca,
      pagina = "1", tamanho = "50",
    } = req.query;

    const where = {};
    if (usuarioId) where.usuarioId = String(usuarioId);
    if (modulo) where.modulo = String(modulo).toUpperCase();
    if (acao) where.acao = String(acao).toUpperCase();
    if (sucesso === "true") where.sucesso = true;
    else if (sucesso === "false") where.sucesso = false;

    if (dataInicio || dataFim) {
      where.createdAt = {};
      if (dataInicio) where.createdAt.gte = new Date(`${dataInicio}T00:00:00.000Z`);
      if (dataFim)    where.createdAt.lte = new Date(`${dataFim}T23:59:59.999Z`);
    }

    if (busca && String(busca).trim()) {
      const q = String(busca).trim();
      where.OR = [
        { rota:         { contains: q, mode: "insensitive" } },
        { mensagem:     { contains: q, mode: "insensitive" } },
        { usuarioNome:  { contains: q, mode: "insensitive" } },
        { usuarioEmail: { contains: q, mode: "insensitive" } },
        { entidadeId:   { equals: q } },
      ];
    }

    const tamanhoN = Math.min(Math.max(parseInt(tamanho, 10) || 50, 1), 200);
    const paginaN = Math.max(parseInt(pagina, 10) || 1, 1);
    const skip = (paginaN - 1) * tamanhoN;

    const [total, itens] = await Promise.all([
      prisma.logAuditoria.count({ where }),
      prisma.logAuditoria.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: tamanhoN,
      }),
    ]);

    res.json({
      total,
      pagina: paginaN,
      tamanho: tamanhoN,
      totalPaginas: Math.ceil(total / tamanhoN),
      itens,
    });
  } catch (err) {
    next(err);
  }
}

// Estatisticas globais para o painel de logs (cabecalho com KPIs).
export async function resumo(req, res, next) {
  try {
    const agora = new Date();
    const inicio24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    const inicio7d  = new Date(agora.getTime() - 7  * 24 * 60 * 60 * 1000);

    const [total24h, total7d, falhas24h, porModulo] = await Promise.all([
      prisma.logAuditoria.count({ where: { createdAt: { gte: inicio24h } } }),
      prisma.logAuditoria.count({ where: { createdAt: { gte: inicio7d } } }),
      prisma.logAuditoria.count({ where: { createdAt: { gte: inicio24h }, sucesso: false } }),
      prisma.logAuditoria.groupBy({
        by: ["modulo"],
        where: { createdAt: { gte: inicio7d } },
        _count: { _all: true },
        orderBy: { _count: { modulo: "desc" } },
        take: 10,
      }),
    ]);

    res.json({
      total24h, total7d, falhas24h,
      porModulo: porModulo.map(p => ({ modulo: p.modulo, total: p._count._all })),
    });
  } catch (err) {
    next(err);
  }
}

// Lista distinct de modulos e usuarios para popular filtros do front.
export async function filtros(req, res, next) {
  try {
    const [modulos, acoes, usuarios] = await Promise.all([
      prisma.logAuditoria.findMany({
        distinct: ["modulo"], select: { modulo: true }, orderBy: { modulo: "asc" },
      }),
      prisma.logAuditoria.findMany({
        distinct: ["acao"], select: { acao: true }, orderBy: { acao: "asc" },
      }),
      prisma.user.findMany({
        select: { id: true, nome: true, email: true }, orderBy: { nome: "asc" },
      }),
    ]);
    res.json({
      modulos: modulos.map(m => m.modulo),
      acoes:   acoes.map(a => a.acao),
      usuarios,
    });
  } catch (err) {
    next(err);
  }
}
