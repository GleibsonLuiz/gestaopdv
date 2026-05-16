import { prismaRaw } from "./prisma.js";

// ============ LIMITES POR PLANO ============
//
// Limites de uso por plano. `null` significa ilimitado. Valores
// arbitrarios — facil ajustar aqui sem migration.
//
// Recursos:
//   clientes    - max de clientes ativos cadastrados
//   produtos    - max de produtos ativos cadastrados
//   usuarios    - max de funcionarios (users) da empresa
//   vendasMes   - max de vendas concluidas por mes (corrente)
//
// Quando o limite e atingido, o controller retorna 402 Payment Required
// com body { erro, recurso, atual, limite, plano } para o frontend
// mostrar mensagem clara de upgrade.

export const LIMITES_PLANO = {
  TRIAL: {
    clientes: 50,
    produtos: 100,
    usuarios: 3,
    vendasMes: 200,
  },
  FREE: {
    clientes: 30,
    produtos: 50,
    usuarios: 1,
    vendasMes: 50,
  },
  STARTER: {
    clientes: 500,
    produtos: 1000,
    usuarios: 5,
    vendasMes: 2000,
  },
  PRO: {
    clientes: 5000,
    produtos: 10000,
    usuarios: 20,
    vendasMes: null,
  },
  ENTERPRISE: {
    clientes: null,
    produtos: null,
    usuarios: null,
    vendasMes: null,
  },
};

const RECURSOS = ["clientes", "produtos", "usuarios", "vendasMes"];

function inicioMes() {
  const d = new Date();
  d.setDate(1); d.setHours(0, 0, 0, 0);
  return d;
}

async function contarRecurso(tenantId, recurso) {
  switch (recurso) {
    case "clientes":
      return prismaRaw.cliente.count({ where: { tenantId, ativo: true } });
    case "produtos":
      return prismaRaw.produto.count({ where: { tenantId, ativo: true } });
    case "usuarios":
      return prismaRaw.user.count({ where: { tenantId, ativo: true } });
    case "vendasMes":
      return prismaRaw.venda.count({
        where: { tenantId, status: "CONCLUIDA", createdAt: { gte: inicioMes() } },
      });
    default:
      return 0;
  }
}

/**
 * Verifica se um tenant pode criar mais 1 de um recurso (clientes/produtos/etc).
 *
 * @param {string} tenantId
 * @param {"clientes"|"produtos"|"usuarios"|"vendasMes"} recurso
 * @returns {Promise<{ ok: boolean, atual: number, limite: number|null, plano: string, recurso: string }>}
 */
export async function verificarLimite(tenantId, recurso) {
  const empresa = await prismaRaw.empresa.findUnique({
    where: { id: tenantId },
    select: { plano: true },
  });
  const plano = empresa?.plano || "FREE";
  const limites = LIMITES_PLANO[plano] || LIMITES_PLANO.FREE;
  const limite = limites[recurso];
  // null = ilimitado
  if (limite === null || limite === undefined) {
    return { ok: true, atual: 0, limite: null, plano, recurso };
  }
  const atual = await contarRecurso(tenantId, recurso);
  return { ok: atual < limite, atual, limite, plano, recurso };
}

/**
 * Helper para usar em controllers. Se o limite foi atingido, ja retorna 402
 * pro client e retorna false (caller deve abortar). Caso contrario, retorna true.
 */
export async function aplicarLimite(req, res, recurso) {
  if (!req.tenantId) {
    // Rotas que rodam sem tenant (admin-master cross-tenant) nao tem limite
    return true;
  }
  const r = await verificarLimite(req.tenantId, recurso);
  if (!r.ok) {
    res.status(402).json({
      erro: `Limite do plano ${r.plano} atingido: ${r.atual}/${r.limite} ${rotuloRecurso(recurso)}. Faça upgrade do plano para criar mais.`,
      recurso: r.recurso,
      atual: r.atual,
      limite: r.limite,
      plano: r.plano,
      limiteAtingido: true,
    });
    return false;
  }
  return true;
}

/**
 * Snapshot completo de uso vs limites para o tenant. Util para tela Empresa.jsx.
 */
export async function obterUsoELimites(tenantId) {
  const empresa = await prismaRaw.empresa.findUnique({
    where: { id: tenantId },
    select: { plano: true, expiraEm: true },
  });
  const plano = empresa?.plano || "FREE";
  const limites = LIMITES_PLANO[plano] || LIMITES_PLANO.FREE;
  const uso = {};
  for (const r of RECURSOS) {
    uso[r] = await contarRecurso(tenantId, r);
  }
  return {
    plano,
    expiraEm: empresa?.expiraEm || null,
    limites,
    uso,
  };
}

function rotuloRecurso(r) {
  return {
    clientes: "clientes",
    produtos: "produtos",
    usuarios: "usuários",
    vendasMes: "vendas no mês",
  }[r] || r;
}
