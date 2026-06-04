// ============ FECHAMENTO MENSAL AUTOMATICO (Contabilidade) ============
//
// Cron mensal (rodar no dia 1): para cada empresa ativa com o modulo de
// contabilidade, apura os totais do MES ANTERIOR (despesas + contas pagas +
// receitas de notas) e cria uma notificacao in-app avisando que o mes fechou e
// o pacote para o contador esta pronto para exportar.
//
// Roda cross-tenant (sem contexto de tenant) -> usa prismaRaw e passa tenantId
// explicito. Autenticado por Bearer ${CRON_SECRET}, igual aos demais crons.
// Idempotente: nao recria a notificacao se ja existir a do mesmo mes/tenant.

import { prismaRaw } from "../lib/prisma.js";
import { compararSegredo } from "../lib/timingSafe.js";
import { empresaTemModulo } from "../lib/modulosPlano.js";

function autorizarCron(req, res) {
  const chave = process.env.CRON_SECRET;
  if (!chave) {
    res.status(503).json({ erro: "CRON_SECRET nao configurado no servidor" });
    return false;
  }
  const header = req.headers.authorization || "";
  const recebido = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!compararSegredo(recebido, chave)) {
    res.status(401).json({ erro: "Chave de cron invalida" });
    return false;
  }
  return true;
}

// Intervalo [inicio, fim) do mes anterior ao "agora" (fim exclusivo = 1o dia
// do mes corrente). Permite query por gte/lt sem ambiguidade de fuso.
function mesAnterior(agora) {
  const fim = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);
  const inicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1, 0, 0, 0, 0);
  return { inicio, fim };
}

const fmtBRL = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// GET/POST /cron/contabilidade-fechamento
export async function cronFechamentoMensal(req, res, next) {
  try {
    if (!autorizarCron(req, res)) return;

    const agora = new Date();
    const { inicio, fim } = mesAnterior(agora);
    const rotuloMes = inicio.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const titulo = `Fechamento de ${rotuloMes}`;

    const empresas = await prismaRaw.empresa.findMany({
      where: { ativo: true },
      select: { id: true, plano: true, modulosHabilitados: true },
    });

    const stats = { tenants: empresas.length, notificados: 0, semAtividade: 0, semModulo: 0, semUsuario: 0, jaNotificado: 0 };

    for (const empresa of empresas) {
      // So tenants com o modulo (contabilidade ou despesas) liberado.
      if (!empresaTemModulo(empresa, "CONTABILIDADE") && !empresaTemModulo(empresa, "DESPESAS")) {
        stats.semModulo++;
        continue;
      }

      const [despAgg, contasAgg, notasAgg] = await Promise.all([
        prismaRaw.despesa.aggregate({
          where: { tenantId: empresa.id, data: { gte: inicio, lt: fim } },
          _sum: { valor: true }, _count: true,
        }),
        prismaRaw.contaPagar.aggregate({
          where: { tenantId: empresa.id, status: "PAGA", pagamento: { gte: inicio, lt: fim } },
          _sum: { valor: true }, _count: true,
        }),
        prismaRaw.notaFiscal.aggregate({
          where: { tenantId: empresa.id, status: "AUTORIZADA", dataAutorizacao: { gte: inicio, lt: fim } },
          _sum: { valorTotal: true }, _count: true,
        }),
      ]);

      const qtd = (despAgg._count || 0) + (contasAgg._count || 0) + (notasAgg._count || 0);
      if (qtd === 0) { stats.semAtividade++; continue; }

      // Idempotencia: ja existe a notificacao deste mes para o tenant?
      const existe = await prismaRaw.notificacao.findFirst({
        where: { destinoTenantId: empresa.id, titulo },
        select: { id: true },
      });
      if (existe) { stats.jaNotificado++; continue; }

      // Atribui a criacao ao contador (permissao CONTABILIDADE), senao a um
      // ADMIN, senao a qualquer usuario do tenant (o model exige criadoPorId).
      const criador =
        (await prismaRaw.user.findFirst({
          where: { tenantId: empresa.id, ativo: true, permissoes: { has: "CONTABILIDADE" } },
          select: { id: true },
        })) ||
        (await prismaRaw.user.findFirst({
          where: { tenantId: empresa.id, role: "ADMIN", ativo: true },
          orderBy: { createdAt: "asc" }, select: { id: true },
        })) ||
        (await prismaRaw.user.findFirst({
          where: { tenantId: empresa.id }, orderBy: { createdAt: "asc" }, select: { id: true },
        }));
      if (!criador) { stats.semUsuario++; continue; }

      const totalDespesas = Number(despAgg._sum.valor || 0) + Number(contasAgg._sum.valor || 0);
      const totalReceitas = Number(notasAgg._sum.valorTotal || 0);

      try {
        await prismaRaw.notificacao.create({
          data: {
            titulo,
            mensagem: `O mes de ${rotuloMes} fechou: ${fmtBRL(totalReceitas)} em receitas e ${fmtBRL(totalDespesas)} em despesas/contas pagas. Abra Contabilidade para exportar o pacote do contador.`,
            tipo: "INFO",
            ativa: true,
            expiraEm: new Date(agora.getTime() + 30 * 86400000),
            criadoPorId: criador.id,
            destinoTenantId: empresa.id,
          },
        });
        stats.notificados++;
      } catch {
        // best-effort: nao derruba o cron por uma notificacao
      }
    }

    res.json({ ok: true, mes: rotuloMes, ...stats, executadoEm: agora.toISOString() });
  } catch (err) {
    next(err);
  }
}
