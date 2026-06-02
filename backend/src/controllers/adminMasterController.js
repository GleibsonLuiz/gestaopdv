import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma, { prismaRaw } from "../lib/prisma.js";
import { registrarEvento } from "../middlewares/auditoria.js";
import { permissoesPadrao } from "../lib/permissoes.js";
import { getProvedor } from "../lib/billing/provedor.js";
import { modulosDaEmpresa, MODULOS_POR_PLANO } from "../lib/modulosPlano.js";
import { IDS_MODULOS } from "../lib/permissoes.js";

// prismaRaw = sem extension (cross-tenant). Use SEMPRE que precisar buscar
// ou alterar registros de outros tenants. O `prisma` normal e mantido
// apenas para $queryRaw (que ja bypassa extension de qualquer forma).

// ============ ADMIN MASTER ============
//
// Endpoints exclusivos do desenvolvedor do sistema (super-admin).
// Permite enxergar e gerenciar todas as empresas (tenants) do sistema.
//
// IMPORTANTE (multi-tenant):
// O Prisma Extension da ETAPA 3 FILTRA queries por tenantId. Aqui queremos
// o oposto: queries devem cobrir TODOS os tenants. Solucao: usamos
// $queryRaw (que ja bypassa o extension) para queries cross-tenant, ou
// passamos um tenantId arbitrario quando precisamos isolar. Estes
// endpoints rodam APENAS sob requireSuperAdmin — usuarios normais nem
// chegam aqui.

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_CNPJ = /^\d{14}$/;

function lim(s, n) {
  return String(s).trim().slice(0, n);
}

// GET /admin-master/empresas — lista todas as empresas com estatisticas.
export async function listarEmpresas(req, res, next) {
  try {
    // $queryRaw bypassa o extension. Cross-tenant intencional.
    const linhas = await prisma.$queryRaw`
      SELECT
        e.id,
        e.nome,
        e.cnpj,
        e.ativo,
        e.plano,
        e.segmento,
        e."expiraEm" AS expira_em,
        e."observacoesPlano" AS observacoes_plano,
        e."statusAssinatura" AS status_assinatura,
        e."valorMensal" AS valor_mensal,
        e."proximaCobrancaEm" AS proxima_cobranca_em,
        e."ultimoPagamentoEm" AS ultimo_pagamento_em,
        e."modulosHabilitados" AS modulos_habilitados,
        e."createdAt" AS criada_em,
        e."updatedAt" AS atualizada_em,
        COALESCE(u.qtd, 0)::int AS qtd_users,
        COALESCE(c.qtd, 0)::int AS qtd_clientes,
        COALESCE(p.qtd, 0)::int AS qtd_produtos,
        COALESCE(v.qtd, 0)::int AS qtd_vendas,
        COALESCE(v.total, 0)::float AS faturamento_total
      FROM empresas e
      LEFT JOIN (SELECT "tenantId", COUNT(*) AS qtd FROM users GROUP BY "tenantId") u ON u."tenantId" = e.id
      LEFT JOIN (SELECT "tenantId", COUNT(*) AS qtd FROM clientes GROUP BY "tenantId") c ON c."tenantId" = e.id
      LEFT JOIN (SELECT "tenantId", COUNT(*) AS qtd FROM produtos GROUP BY "tenantId") p ON p."tenantId" = e.id
      LEFT JOIN (
        SELECT "tenantId", COUNT(*) AS qtd, COALESCE(SUM(total), 0) AS total
        FROM vendas WHERE status = 'CONCLUIDA'
        GROUP BY "tenantId"
      ) v ON v."tenantId" = e.id
      ORDER BY e."createdAt" DESC
    `;

    const empresas = linhas.map(l => ({
      id: l.id,
      nome: l.nome,
      cnpj: l.cnpj,
      ativo: l.ativo,
      plano: l.plano,
      segmento: l.segmento,
      expiraEm: l.expira_em,
      observacoesPlano: l.observacoes_plano,
      statusAssinatura: l.status_assinatura,
      valorMensal: l.valor_mensal != null ? Number(l.valor_mensal) : null,
      proximaCobrancaEm: l.proxima_cobranca_em,
      ultimoPagamentoEm: l.ultimo_pagamento_em,
      // Lista explicita (null = usa pacote do plano) + conjunto efetivo.
      modulosHabilitados: Array.isArray(l.modulos_habilitados) ? l.modulos_habilitados : null,
      modulos: modulosDaEmpresa({ plano: l.plano, modulosHabilitados: l.modulos_habilitados }),
      criadaEm: l.criada_em,
      atualizadaEm: l.atualizada_em,
      estatisticas: {
        usuarios: l.qtd_users,
        clientes: l.qtd_clientes,
        produtos: l.qtd_produtos,
        vendas: l.qtd_vendas,
        faturamentoTotal: l.faturamento_total,
      },
    }));

    res.json({ total: empresas.length, empresas });
  } catch (err) {
    next(err);
  }
}

// GET /admin-master/estatisticas — totais agregados do sistema inteiro.
export async function estatisticasGlobais(req, res, next) {
  try {
    const [agg] = await prisma.$queryRaw`
      SELECT
        (SELECT COUNT(*)::int FROM empresas) AS total_empresas,
        (SELECT COUNT(*)::int FROM empresas WHERE ativo = true) AS empresas_ativas,
        (SELECT COUNT(*)::int FROM users) AS total_users,
        (SELECT COUNT(*)::int FROM users WHERE "superAdmin" = true) AS super_admins,
        (SELECT COUNT(*)::int FROM clientes) AS total_clientes,
        (SELECT COUNT(*)::int FROM produtos) AS total_produtos,
        (SELECT COUNT(*)::int FROM vendas WHERE status = 'CONCLUIDA') AS total_vendas,
        (SELECT COALESCE(SUM(total), 0)::float FROM vendas WHERE status = 'CONCLUIDA') AS faturamento_geral
    `;

    res.json({
      totalEmpresas: agg.total_empresas,
      empresasAtivas: agg.empresas_ativas,
      totalUsers: agg.total_users,
      superAdmins: agg.super_admins,
      totalClientes: agg.total_clientes,
      totalProdutos: agg.total_produtos,
      totalVendas: agg.total_vendas,
      faturamentoGeral: agg.faturamento_geral,
    });
  } catch (err) {
    next(err);
  }
}

// GET /admin-master/financeiro — agregacoes pro dashboard financeiro do SaaS.
// Preco por plano fica no frontend (constante visivel/ajustavel); aqui
// retornamos so contagens/series temporais que dao trabalho calcular no front.
export async function financeiroDashboard(req, res, next) {
  try {
    const [porPlano, cadastrosMes, [agg], [billing]] = await Promise.all([
      // Distribuicao de planos (so empresas ativas — suspensas nao geram receita)
      prisma.$queryRaw`
        SELECT plano, COUNT(*)::int AS qtd
        FROM empresas
        WHERE ativo = true
        GROUP BY plano
      `,
      // Cadastros nos ultimos 12 meses agrupados por mes
      prisma.$queryRaw`
        SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS mes,
               COUNT(*)::int AS qtd
        FROM empresas
        WHERE "createdAt" >= NOW() - INTERVAL '11 months'
        GROUP BY mes
        ORDER BY mes ASC
      `,
      // Counters auxiliares
      prisma.$queryRaw`
        SELECT
          (SELECT COUNT(*)::int FROM empresas) AS total_empresas,
          (SELECT COUNT(*)::int FROM empresas WHERE ativo = true) AS total_ativas,
          (SELECT COUNT(*)::int FROM empresas WHERE ativo = false) AS total_suspensas,
          (SELECT COUNT(*)::int FROM empresas
            WHERE ativo = false AND "suspensaEm" >= NOW() - INTERVAL '30 days') AS suspensas_30d,
          (SELECT COUNT(*)::int FROM empresas
            WHERE plano = 'TRIAL' AND ativo = true
              AND "expiraEm" IS NOT NULL
              AND "expiraEm" >= NOW()
              AND "expiraEm" <= NOW() + INTERVAL '7 days') AS trial_expirando_7d,
          (SELECT COUNT(*)::int FROM empresas
            WHERE ativo = true AND plano NOT IN ('TRIAL', 'FREE')) AS pagantes,
          (SELECT COUNT(*)::int FROM empresas
            WHERE ativo = true AND plano = 'TRIAL') AS em_trial
      `,
      // Billing real: MRR = soma do valorMensal das assinaturas ATIVAS;
      // inadimplencia; e o que entrou/esta a receber em cobrancas.
      prisma.$queryRaw`
        SELECT
          (SELECT COALESCE(SUM("valorMensal"), 0)::float FROM empresas
            WHERE "statusAssinatura" = 'ATIVA') AS mrr_real,
          (SELECT COUNT(*)::int FROM empresas
            WHERE "statusAssinatura" = 'ATIVA') AS assinaturas_ativas,
          (SELECT COUNT(*)::int FROM empresas
            WHERE "statusAssinatura" = 'INADIMPLENTE') AS inadimplentes,
          (SELECT COUNT(*)::int FROM empresas
            WHERE "statusAssinatura" = 'CANCELADA') AS canceladas,
          (SELECT COALESCE(SUM(valor), 0)::float FROM cobrancas_assinatura
            WHERE status = 'PAGA'
              AND "pagoEm" >= DATE_TRUNC('month', NOW())) AS recebido_mes,
          (SELECT COALESCE(SUM(valor), 0)::float FROM cobrancas_assinatura
            WHERE status = 'PENDENTE') AS a_receber
      `,
    ]);

    // Normaliza porPlano em objeto { TRIAL: N, FREE: N, ... } — facilita no front
    const porPlanoMap = {};
    for (const row of porPlano) porPlanoMap[row.plano] = row.qtd;

    // Preenche meses faltantes (sem cadastros) — frontend pode renderizar
    // serie continua sem precisar interpolar.
    const cadastrosCompleto = preencherUltimos12Meses(cadastrosMes);

    res.json({
      porPlano: porPlanoMap,
      cadastrosPorMes: cadastrosCompleto,
      totais: {
        empresas: agg.total_empresas,
        ativas: agg.total_ativas,
        suspensas: agg.total_suspensas,
        suspensas30d: agg.suspensas_30d,
        trialExpirando7d: agg.trial_expirando_7d,
        pagantes: agg.pagantes,
        emTrial: agg.em_trial,
      },
      // Billing real (assinaturas/cobrancas) — quando ha assinaturas ATIVAS o
      // frontend usa mrrReal em vez do calculo por preco-de-referencia.
      billing: {
        mrrReal: billing.mrr_real,
        assinaturasAtivas: billing.assinaturas_ativas,
        inadimplentes: billing.inadimplentes,
        canceladas: billing.canceladas,
        recebidoMes: billing.recebido_mes,
        aReceber: billing.a_receber,
      },
    });
  } catch (err) {
    next(err);
  }
}

// Garante 12 entradas (mes corrente + 11 anteriores). Mesmo que o mes nao
// tenha cadastros, ele aparece com qtd=0 — facilita renderizar grafico.
function preencherUltimos12Meses(linhas) {
  const mapa = new Map(linhas.map(l => [l.mes, l.qtd]));
  const hoje = new Date();
  const out = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ mes, qtd: mapa.get(mes) ?? 0 });
  }
  return out;
}

// POST /admin-master/empresas — cria nova empresa + admin inicial.
// Mesma logica do antigo signup publico, agora exclusivo do super-admin.
export async function criarEmpresa(req, res, next) {
  try {
    const { nomeEmpresa, cnpj, nomeAdmin, email, senha, segmento } = req.body || {};

    if (!nomeEmpresa || String(nomeEmpresa).trim().length < 3) {
      return res.status(400).json({ erro: "Nome da empresa e obrigatorio (min 3 caracteres)" });
    }
    // ETAPA#6: segmento e obrigatorio na criacao (default GERAL se nao enviado).
    const SEGMENTOS_VALIDOS = new Set(["GERAL", "AUTO_PECAS", "FARMACIA", "PAPELARIA"]);
    const segmentoLimpo = segmento ? String(segmento).toUpperCase() : "GERAL";
    if (!SEGMENTOS_VALIDOS.has(segmentoLimpo)) {
      return res.status(400).json({ erro: "Segmento invalido (use GERAL/AUTO_PECAS/FARMACIA/PAPELARIA)" });
    }
    if (String(nomeEmpresa).trim().length > 120) {
      return res.status(400).json({ erro: "Nome da empresa muito longo (max 120)" });
    }
    let cnpjLimpo = null;
    if (cnpj) {
      cnpjLimpo = String(cnpj).replace(/\D/g, "");
      if (!REGEX_CNPJ.test(cnpjLimpo)) {
        return res.status(400).json({ erro: "CNPJ invalido (use 14 digitos)" });
      }
    }
    if (!nomeAdmin || String(nomeAdmin).trim().length < 3) {
      return res.status(400).json({ erro: "Nome do administrador e obrigatorio (min 3 caracteres)" });
    }
    if (!email || !REGEX_EMAIL.test(String(email).trim().toLowerCase())) {
      return res.status(400).json({ erro: "Email invalido" });
    }
    if (!senha || typeof senha !== "string" || senha.length < 6) {
      return res.status(400).json({ erro: "Senha deve ter pelo menos 6 caracteres" });
    }
    const emailLimpo = String(email).trim().toLowerCase();

    // Cross-tenant: use prismaRaw para nao filtrar pelo tenant do super-admin
    const emailExistente = await prismaRaw.user.findFirst({ where: { email: emailLimpo } });
    if (emailExistente) {
      return res.status(409).json({ erro: "Email ja cadastrado" });
    }
    if (cnpjLimpo) {
      const cnpjExistente = await prismaRaw.empresa.findUnique({ where: { cnpj: cnpjLimpo } });
      if (cnpjExistente) {
        return res.status(409).json({ erro: "CNPJ ja cadastrado" });
      }
    }

    const senhaHash = await bcrypt.hash(senha, 12);
    const resultado = await prismaRaw.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({
        data: {
          nome: lim(nomeEmpresa, 120),
          cnpj: cnpjLimpo,
          segmento: segmentoLimpo,
          ativo: true,
        },
      });
      const user = await tx.user.create({
        data: {
          nome: lim(nomeAdmin, 120),
          email: emailLimpo,
          senha: senhaHash,
          role: "ADMIN",
          ativo: true,
          permissoes: permissoesPadrao("ADMIN"),
          tenantId: empresa.id,
        },
      });
      return { empresa, user };
    });

    registrarEvento({
      acao: "EMPRESA_CRIADA", modulo: "ADMIN_MASTER", sucesso: true,
      usuarioId: req.user.sub,
      usuarioNome: req.user.nome,
      tenantId: resultado.empresa.id,
      mensagem: `Empresa "${resultado.empresa.nome}" criada pelo super-admin (${req.user.nome})`,
      req,
    });

    res.status(201).json({
      empresa: {
        id: resultado.empresa.id,
        nome: resultado.empresa.nome,
        cnpj: resultado.empresa.cnpj,
        segmento: resultado.empresa.segmento,
        ativo: resultado.empresa.ativo,
        criadaEm: resultado.empresa.createdAt,
      },
      admin: {
        id: resultado.user.id,
        nome: resultado.user.nome,
        email: resultado.user.email,
      },
    });
  } catch (err) {
    if (err.code === "P2002") {
      const campo = err.meta?.target?.includes("cnpj") ? "CNPJ" : "Email";
      return res.status(409).json({ erro: `${campo} ja cadastrado` });
    }
    next(err);
  }
}

// PATCH /admin-master/empresas/:id/status — ativa/desativa empresa.
// Desativada nao consegue mais logar. Aceita motivo (mostrado no login bloqueado).
export async function alterarStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { ativo, motivo } = req.body || {};
    if (typeof ativo !== "boolean") {
      return res.status(400).json({ erro: "Campo 'ativo' (boolean) obrigatorio" });
    }
    const motivoStr = motivo ? String(motivo).trim().slice(0, 500) : null;
    const suspensaEm = ativo ? null : new Date();

    const linhas = await prisma.$executeRaw`
      UPDATE empresas SET
        ativo = ${ativo},
        "motivoSuspensao" = ${motivoStr},
        "suspensaEm" = ${suspensaEm},
        "updatedAt" = NOW()
      WHERE id = ${id}
    `;
    if (linhas === 0) {
      return res.status(404).json({ erro: "Empresa nao encontrada" });
    }

    registrarEvento({
      acao: ativo ? "EMPRESA_ATIVADA" : "EMPRESA_DESATIVADA",
      modulo: "ADMIN_MASTER", sucesso: true,
      usuarioId: req.user.sub,
      usuarioNome: req.user.nome,
      tenantId: id,
      mensagem: ativo
        ? `Empresa REATIVADA pelo super-admin`
        : `Empresa SUSPENSA pelo super-admin${motivoStr ? `. Motivo: ${motivoStr}` : ""}`,
      req,
    });

    res.json({ ok: true, ativo, motivoSuspensao: motivoStr, suspensaEm });
  } catch (err) {
    next(err);
  }
}

// POST /admin-master/empresas/:id/reset — reseta TODOS os dados da empresa
// (mesma logica do /admin/reset, mas executado pelo super-admin em nome de
// outro tenant). Util pra dar suporte a clientes que pediram zerar tudo.
export async function resetarEmpresa(req, res, next) {
  try {
    const { id } = req.params;
    const { confirmacao } = req.body || {};
    if (confirmacao !== "CONFIRMAR_RESET") {
      return res.status(400).json({
        erro: 'Confirmacao invalida. Envie { "confirmacao": "CONFIRMAR_RESET" }',
      });
    }
    const empresa = await prismaRaw.empresa.findUnique({ where: { id } });
    if (!empresa) return res.status(404).json({ erro: "Empresa nao encontrada" });

    // Cross-tenant: usa prismaRaw para que o extension nao sobrescreva
    // o tenantId que estamos passando explicitamente no where.
    const t = id;
    const removidos = await prismaRaw.$transaction(async (tx) => {
      const logsAutomacao = await tx.logAutomacao.deleteMany({ where: { tenantId: t } });
      const regrasAutomacao = await tx.regraAutomacao.deleteMany({ where: { tenantId: t } });
      const templates = await tx.templateMensagem.deleteMany({ where: { tenantId: t } });
      const historicoOportunidades = await tx.historicoOportunidade.deleteMany({ where: { tenantId: t } });
      const oportunidades = await tx.oportunidade.deleteMany({ where: { tenantId: t } });
      const tarefas = await tx.tarefa.deleteMany({ where: { tenantId: t } });
      const clienteTags = await tx.clienteTag.deleteMany({ where: { tenantId: t } });
      const tags = await tx.tag.deleteMany({ where: { tenantId: t } });
      const interacoes = await tx.interacao.deleteMany({ where: { tenantId: t } });
      const contatos = await tx.contato.deleteMany({ where: { tenantId: t } });
      const movimentacoesPontos = await tx.movimentacaoPontos.deleteMany({ where: { tenantId: t } });
      const pontosCliente = await tx.pontosCliente.deleteMany({ where: { tenantId: t } });
      const configFidelidade = await tx.configuracaoFidelidade.deleteMany({ where: { tenantId: t } });
      const pesquisasNps = await tx.pesquisaNps.deleteMany({ where: { tenantId: t } });
      const itensVenda = await tx.itemVenda.deleteMany({ where: { tenantId: t } });
      const itensOrcamento = await tx.itemOrcamento.deleteMany({ where: { tenantId: t } });
      const movimentacoesCaixa = await tx.movimentacaoCaixa.deleteMany({ where: { tenantId: t } });
      const vendas = await tx.venda.deleteMany({ where: { tenantId: t } });
      const orcamentos = await tx.orcamento.deleteMany({ where: { tenantId: t } });
      const caixas = await tx.caixa.deleteMany({ where: { tenantId: t } });
      const itensCompra = await tx.itemCompra.deleteMany({ where: { tenantId: t } });
      const compras = await tx.compra.deleteMany({ where: { tenantId: t } });
      const movimentacoesEstoque = await tx.movimentacaoEstoque.deleteMany({ where: { tenantId: t } });
      const anexos = await tx.anexo.deleteMany({ where: { tenantId: t } });
      const contasPagar = await tx.contaPagar.deleteMany({ where: { tenantId: t } });
      const contasReceber = await tx.contaReceber.deleteMany({ where: { tenantId: t } });
      const produtos = await tx.produto.deleteMany({ where: { tenantId: t } });
      const categorias = await tx.categoria.deleteMany({ where: { tenantId: t } });
      const fornecedores = await tx.fornecedor.deleteMany({ where: { tenantId: t } });
      const clientes = await tx.cliente.deleteMany({ where: { tenantId: t } });
      const formasPagamentoCustom = await tx.formaPagamentoCustom.deleteMany({ where: { tenantId: t } });

      return {
        logsAutomacao: logsAutomacao.count, regrasAutomacao: regrasAutomacao.count,
        templates: templates.count, historicoOportunidades: historicoOportunidades.count,
        oportunidades: oportunidades.count, tarefas: tarefas.count,
        clienteTags: clienteTags.count, tags: tags.count, interacoes: interacoes.count,
        contatos: contatos.count, movimentacoesPontos: movimentacoesPontos.count,
        pontosCliente: pontosCliente.count, configFidelidade: configFidelidade.count,
        pesquisasNps: pesquisasNps.count, itensVenda: itensVenda.count,
        itensOrcamento: itensOrcamento.count, vendas: vendas.count,
        orcamentos: orcamentos.count, movimentacoesCaixa: movimentacoesCaixa.count,
        caixas: caixas.count, itensCompra: itensCompra.count, compras: compras.count,
        movimentacoesEstoque: movimentacoesEstoque.count, anexos: anexos.count,
        contasPagar: contasPagar.count, contasReceber: contasReceber.count,
        produtos: produtos.count, categorias: categorias.count,
        fornecedores: fornecedores.count, clientes: clientes.count,
        formasPagamentoCustom: formasPagamentoCustom.count,
      };
    });

    registrarEvento({
      acao: "EMPRESA_RESETADA", modulo: "ADMIN_MASTER", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome, tenantId: id,
      mensagem: `Reset remoto executado pelo super-admin em "${empresa.nome}"`,
      req,
    });

    res.json({ ok: true, removidos });
  } catch (err) {
    next(err);
  }
}

// GET /admin-master/users — lista users cross-tenant com info do tenant.
export async function listarUsers(req, res, next) {
  try {
    const tenantId = req.query.tenantId || null;
    const linhas = await prisma.$queryRaw`
      SELECT
        u.id, u.nome, u.email, u.role, u.ativo, u."superAdmin",
        u."createdAt", u."tenantId",
        e.nome AS empresa_nome
      FROM users u
      LEFT JOIN empresas e ON e.id = u."tenantId"
      WHERE (${tenantId}::text IS NULL OR u."tenantId" = ${tenantId})
      ORDER BY u."createdAt" DESC
    `;
    const users = linhas.map(l => ({
      id: l.id, nome: l.nome, email: l.email, role: l.role,
      ativo: l.ativo, superAdmin: l.superAdmin,
      criadoEm: l.createdAt, tenantId: l.tenantId,
      empresaNome: l.empresa_nome,
    }));
    res.json({ total: users.length, users });
  } catch (err) {
    next(err);
  }
}

// PATCH /admin-master/users/:id/super-admin — promove/rebaixa super-admin.
// Bloqueia se for o ULTIMO super-admin tentando se rebaixar.
export async function alterarSuperAdmin(req, res, next) {
  try {
    const { id } = req.params;
    const { superAdmin } = req.body || {};
    if (typeof superAdmin !== "boolean") {
      return res.status(400).json({ erro: "Campo 'superAdmin' (boolean) obrigatorio" });
    }

    // Cross-tenant: usa prismaRaw
    const alvo = await prismaRaw.user.findUnique({
      where: { id },
      select: { id: true, nome: true, email: true, superAdmin: true },
    });
    if (!alvo) return res.status(404).json({ erro: "Usuario nao encontrado" });

    // Proteção: nao permite remover o ultimo super-admin
    if (alvo.superAdmin && !superAdmin) {
      const count = await prismaRaw.user.count({ where: { superAdmin: true } });
      if (count <= 1) {
        return res.status(409).json({
          erro: "Nao e possivel remover o ultimo super-admin do sistema",
        });
      }
    }

    await prismaRaw.user.update({
      where: { id },
      data: { superAdmin },
    });

    registrarEvento({
      acao: superAdmin ? "SUPER_ADMIN_PROMOVIDO" : "SUPER_ADMIN_REBAIXADO",
      modulo: "ADMIN_MASTER", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome,
      mensagem: `${superAdmin ? "Promovido" : "Rebaixado"}: ${alvo.email}`,
      req,
    });

    res.json({ ok: true, id, superAdmin });
  } catch (err) {
    next(err);
  }
}

// POST /admin-master/impersonate/:userId — gera JWT em nome de outro user
// para o super-admin "entrar como" ele. Util pra suporte. O token gerado
// carrega claim `imp` com o id do super-admin original para auditoria.
export async function impersonate(req, res, next) {
  try {
    const { userId } = req.params;
    // Cross-tenant: usa prismaRaw
    const alvo = await prismaRaw.user.findUnique({
      where: { id: userId },
      include: { tenant: { select: { id: true, nome: true, cnpj: true, ativo: true } } },
    });
    if (!alvo) return res.status(404).json({ erro: "Usuario nao encontrado" });
    if (!alvo.ativo) return res.status(400).json({ erro: "Usuario esta inativo" });
    if (!alvo.tenant) return res.status(400).json({ erro: "Usuario sem tenant" });

    // Sessao curta (1 hora) para limitar impacto. Claim `imp` carrega o id
    // do super-admin para auditoria — toda acao feita no token impersonado
    // pode ser rastreada de volta ao super-admin.
    const token = jwt.sign(
      {
        sub: alvo.id, role: alvo.role, nome: alvo.nome,
        tid: alvo.tenantId, sa: alvo.superAdmin === true,
        imp: req.user.sub,         // id do super-admin original
        impNome: req.user.nome,    // nome para exibir banner no UI
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    registrarEvento({
      acao: "SUPER_ADMIN_IMPERSONOU", modulo: "ADMIN_MASTER", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome,
      tenantId: alvo.tenantId,
      mensagem: `Impersonou ${alvo.email} ("${alvo.tenant.nome}")`,
      req,
    });

    res.json({
      token,
      user: {
        id: alvo.id, nome: alvo.nome, email: alvo.email, role: alvo.role,
        permissoes: alvo.permissoes, tenantId: alvo.tenantId,
        superAdmin: alvo.superAdmin === true,
      },
      empresa: {
        id: alvo.tenant.id, nome: alvo.tenant.nome, cnpj: alvo.tenant.cnpj,
      },
      impersonadoPor: { id: req.user.sub, nome: req.user.nome },
    });
  } catch (err) {
    next(err);
  }
}

// GET /admin-master/logs — auditoria global cross-tenant. Filtros opcionais.
export async function logsGlobal(req, res, next) {
  try {
    const { tenantId, usuarioId, acao, modulo, limit } = req.query;
    const max = Math.min(Math.max(parseInt(limit || "200", 10), 1), 1000);

    // Como LogAuditoria.tenantId pode ser NULL (login com email inexistente),
    // queremos VER eventos com null tambem quando nao ha filtro.
    const linhas = await prisma.$queryRaw`
      SELECT
        l.id, l.acao, l.modulo, l."entidadeId", l.metodo, l.rota,
        l."statusCode", l.sucesso, l.ip, l.mensagem, l."createdAt",
        l."usuarioId", l."usuarioNome", l."usuarioEmail", l."tenantId",
        e.nome AS empresa_nome
      FROM logs_auditoria l
      LEFT JOIN empresas e ON e.id = l."tenantId"
      WHERE
        (${tenantId || null}::text IS NULL OR l."tenantId" = ${tenantId || null})
        AND (${usuarioId || null}::text IS NULL OR l."usuarioId" = ${usuarioId || null})
        AND (${acao || null}::text IS NULL OR l.acao = ${acao || null})
        AND (${modulo || null}::text IS NULL OR l.modulo = ${modulo || null})
      ORDER BY l."createdAt" DESC
      LIMIT ${max}
    `;
    const logs = linhas.map(l => ({
      id: l.id, acao: l.acao, modulo: l.modulo, entidadeId: l.entidadeId,
      metodo: l.metodo, rota: l.rota, statusCode: l.statusCode, sucesso: l.sucesso,
      ip: l.ip, mensagem: l.mensagem, createdAt: l.createdAt,
      usuarioId: l.usuarioId, usuarioNome: l.usuarioNome, usuarioEmail: l.usuarioEmail,
      tenantId: l.tenantId, empresaNome: l.empresa_nome,
    }));
    res.json({ total: logs.length, max, logs });
  } catch (err) {
    next(err);
  }
}

// ============ ETAPA 12 ============

const PLANOS = new Set(["TRIAL", "FREE", "STARTER", "PRO", "ENTERPRISE"]);
const STATUS_ASSINATURA = new Set(["TRIAL", "ATIVA", "INADIMPLENTE", "CANCELADA"]);

// PATCH /admin-master/empresas/:id/plano — altera plano + expiracao +
// (opcional) status de assinatura. Permite ao super-admin marcar ATIVA na mao
// para clientes negociados/pagos por fora do gateway (ex.: Enterprise).
export async function alterarPlano(req, res, next) {
  try {
    const { id } = req.params;
    const { plano, expiraEm, observacoes, statusAssinatura } = req.body || {};
    if (!plano || !PLANOS.has(String(plano).toUpperCase())) {
      return res.status(400).json({
        erro: `Plano invalido. Use: ${[...PLANOS].join(", ")}`,
      });
    }
    let statusAssin = null;
    if (statusAssinatura !== undefined && statusAssinatura !== null && statusAssinatura !== "") {
      statusAssin = String(statusAssinatura).toUpperCase();
      if (!STATUS_ASSINATURA.has(statusAssin)) {
        return res.status(400).json({
          erro: `Status de assinatura invalido. Use: ${[...STATUS_ASSINATURA].join(", ")}`,
        });
      }
    }
    let expira = null;
    if (expiraEm) {
      const d = new Date(expiraEm);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ erro: "expiraEm invalido (use ISO date)" });
      }
      expira = d;
    }
    const obs = observacoes ? String(observacoes).trim().slice(0, 500) : null;

    const data = {
      plano: String(plano).toUpperCase(),
      expiraEm: expira,
      observacoesPlano: obs,
    };
    // Se o super-admin mudou o status manualmente, persiste. Marcar ATIVA por
    // fora do gateway registra a data de pagamento (baixa manual de contrato).
    if (statusAssin) {
      data.statusAssinatura = statusAssin;
      if (statusAssin === "ATIVA") {
        data.ultimoPagamentoEm = new Date();
        data.ativo = true;
      }
    }

    const atualizada = await prismaRaw.empresa.update({
      where: { id },
      data,
    }).catch(err => {
      if (err.code === "P2025") return null;
      throw err;
    });
    if (!atualizada) return res.status(404).json({ erro: "Empresa nao encontrada" });

    registrarEvento({
      acao: "PLANO_ALTERADO", modulo: "ADMIN_MASTER", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome,
      tenantId: id,
      mensagem: `Plano alterado para ${atualizada.plano}${statusAssin ? `, assinatura ${statusAssin}` : ""}${expira ? `, expira em ${expira.toISOString().slice(0, 10)}` : ""}`,
      req,
    });

    res.json({
      ok: true,
      empresa: {
        id: atualizada.id,
        plano: atualizada.plano,
        expiraEm: atualizada.expiraEm,
        observacoesPlano: atualizada.observacoesPlano,
        statusAssinatura: atualizada.statusAssinatura,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ETAPA#6: PATCH /admin-master/empresas/:id/segmento — altera segmento de
// negocio da empresa (GERAL/AUTO_PECAS/FARMACIA/PAPELARIA). So super-admin.
const SEGMENTOS = new Set(["GERAL", "AUTO_PECAS", "FARMACIA", "PAPELARIA"]);
export async function alterarSegmento(req, res, next) {
  try {
    const { id } = req.params;
    const { segmento } = req.body || {};
    if (!segmento || !SEGMENTOS.has(String(segmento).toUpperCase())) {
      return res.status(400).json({
        erro: `Segmento invalido. Use: ${[...SEGMENTOS].join(", ")}`,
      });
    }
    const atualizada = await prismaRaw.empresa.update({
      where: { id },
      data: { segmento: String(segmento).toUpperCase() },
    }).catch(err => {
      if (err.code === "P2025") return null;
      throw err;
    });
    if (!atualizada) return res.status(404).json({ erro: "Empresa nao encontrada" });

    registrarEvento({
      acao: "SEGMENTO_ALTERADO", modulo: "ADMIN_MASTER", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome,
      tenantId: id,
      mensagem: `Segmento alterado para ${atualizada.segmento}`,
      req,
    });

    res.json({ ok: true, empresa: { id: atualizada.id, segmento: atualizada.segmento } });
  } catch (err) {
    next(err);
  }
}

// PATCH /admin-master/empresas/:id/modulos — define os modulos liberados para a
// empresa (modelo hibrido). Body:
//   { modulos: ["PDV","CAIXA",...] }  -> lista explicita (override do plano)
//   { modulos: null }                 -> volta ao pacote padrao do plano
const SET_MODULOS = new Set(IDS_MODULOS);
export async function alterarModulos(req, res, next) {
  try {
    const { id } = req.params;
    const { modulos } = req.body || {};

    let valor = null; // null = volta ao padrao do plano
    if (modulos !== null && modulos !== undefined) {
      if (!Array.isArray(modulos)) {
        return res.status(400).json({ erro: "modulos deve ser um array de ids ou null" });
      }
      // Sanitiza: dedup, uppercase, so ids validos.
      const limpos = [...new Set(
        modulos.map(m => String(m).trim().toUpperCase()).filter(m => SET_MODULOS.has(m))
      )];
      valor = limpos;
    }

    const atualizada = await prismaRaw.empresa.update({
      where: { id },
      data: { modulosHabilitados: valor },
      select: { id: true, plano: true, modulosHabilitados: true },
    }).catch(err => {
      if (err.code === "P2025") return null;
      throw err;
    });
    if (!atualizada) return res.status(404).json({ erro: "Empresa nao encontrada" });

    registrarEvento({
      acao: "MODULOS_ALTERADOS", modulo: "ADMIN_MASTER", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome, tenantId: id,
      mensagem: valor
        ? `Modulos definidos manualmente (${valor.length}): ${valor.join(", ")}`
        : `Modulos resetados para o pacote padrao do plano ${atualizada.plano}`,
      req,
    });

    res.json({
      ok: true,
      modulosHabilitados: Array.isArray(atualizada.modulosHabilitados) ? atualizada.modulosHabilitados : null,
      modulos: modulosDaEmpresa(atualizada),
      padraoDoPlano: MODULOS_POR_PLANO[atualizada.plano] || [],
    });
  } catch (err) {
    next(err);
  }
}

// GET /admin-master/empresas/:id/export — dump JSON com todos os dados
// da empresa. Util para portabilidade (LGPD) ou backup manual.
export async function exportarEmpresa(req, res, next) {
  try {
    const { id } = req.params;
    const empresa = await prismaRaw.empresa.findUnique({ where: { id } });
    if (!empresa) return res.status(404).json({ erro: "Empresa nao encontrada" });

    // Coleta todos os dados do tenant em paralelo. prismaRaw evita filtro
    // automatico do extension (que filtraria pelo tenant do super-admin).
    const t = { tenantId: id };
    const [
      users, configuracaoEmpresa, configuracoesComissao,
      configuracaoFidelidade, formasPagamentoCustom,
      clientes, fornecedores, categorias, produtos,
      vendas, compras, caixas,
      orcamentos, oportunidades, tarefas, interacoes,
      tags, contatos, pesquisasNps,
      templatesMensagem, regrasAutomacao,
      contasPagar, contasReceber,
    ] = await Promise.all([
      prismaRaw.user.findMany({
        where: t,
        select: {
          id: true, nome: true, email: true, role: true, ativo: true,
          permissoes: true, superAdmin: true, createdAt: true,
          // NAO inclui senha (hash) — fora do export por seguranca
        },
      }),
      prismaRaw.configuracaoEmpresa.findFirst({ where: t }),
      prismaRaw.configuracaoComissao.findMany({ where: t }),
      prismaRaw.configuracaoFidelidade.findFirst({ where: t }),
      prismaRaw.formaPagamentoCustom.findMany({ where: t }),
      prismaRaw.cliente.findMany({ where: t, include: { contatos: true, tags: true } }),
      prismaRaw.fornecedor.findMany({ where: t }),
      prismaRaw.categoria.findMany({ where: t }),
      prismaRaw.produto.findMany({ where: t }),
      prismaRaw.venda.findMany({ where: t, include: { itens: true } }),
      prismaRaw.compra.findMany({ where: t, include: { itens: true } }),
      prismaRaw.caixa.findMany({ where: t, include: { movimentacoes: true } }),
      prismaRaw.orcamento.findMany({ where: t, include: { itens: true } }),
      prismaRaw.oportunidade.findMany({ where: t, include: { historico: true } }),
      prismaRaw.tarefa.findMany({ where: t }),
      prismaRaw.interacao.findMany({ where: t }),
      prismaRaw.tag.findMany({ where: t }),
      prismaRaw.contato.findMany({ where: t }),
      prismaRaw.pesquisaNps.findMany({ where: t }),
      prismaRaw.templateMensagem.findMany({ where: t }),
      prismaRaw.regraAutomacao.findMany({ where: t }),
      prismaRaw.contaPagar.findMany({ where: t }),
      prismaRaw.contaReceber.findMany({ where: t }),
    ]);

    registrarEvento({
      acao: "EMPRESA_EXPORTADA", modulo: "ADMIN_MASTER", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome,
      tenantId: id,
      mensagem: `Export JSON gerado para "${empresa.nome}"`,
      req,
    });

    const filename = `export-${empresa.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.json({
      versao: 1,
      geradoEm: new Date().toISOString(),
      empresa,
      usuarios: users,
      configuracaoEmpresa,
      configuracoesComissao,
      configuracaoFidelidade,
      formasPagamentoCustom,
      cadastros: { clientes, fornecedores, categorias, produtos },
      operacional: { vendas, compras, caixas },
      crm: {
        orcamentos, oportunidades, tarefas, interacoes,
        tags, contatos, pesquisasNps,
        templatesMensagem, regrasAutomacao,
      },
      financeiro: { contasPagar, contasReceber },
    });
  } catch (err) {
    next(err);
  }
}

// GET /admin-master/metricas — uso e engajamento por empresa.
export async function metricas(req, res, next) {
  try {
    const dias = Math.min(Math.max(parseInt(req.query.diasAtras || "30", 10), 1), 365);
    const desde = new Date(Date.now() - dias * 86400000);

    // 1. Ranking de vendas por empresa nos ultimos N dias
    const ranking = await prisma.$queryRaw`
      SELECT
        e.id, e.nome, e.cnpj, e.ativo,
        COALESCE(v.qtd, 0)::int AS vendas_qtd,
        COALESCE(v.total, 0)::float AS faturamento
      FROM empresas e
      LEFT JOIN (
        SELECT "tenantId", COUNT(*) AS qtd, SUM(total) AS total
        FROM vendas
        WHERE status = 'CONCLUIDA' AND "createdAt" >= ${desde}
        GROUP BY "tenantId"
      ) v ON v."tenantId" = e.id
      ORDER BY faturamento DESC, vendas_qtd DESC
    `;

    // 2. Empresas com login recente (logins via audit log)
    const atividade = await prisma.$queryRaw`
      SELECT
        e.id, e.nome,
        MAX(l."createdAt") AS ultimo_login
      FROM empresas e
      LEFT JOIN logs_auditoria l ON l."tenantId" = e.id
        AND l.acao = 'LOGIN' AND l.sucesso = true
      GROUP BY e.id, e.nome
      ORDER BY ultimo_login DESC NULLS LAST
    `;

    // 3. Empresas inativas (sem login ha mais de 30 dias)
    const corteInativo = new Date(Date.now() - 30 * 86400000);
    const inativas = atividade.filter(a =>
      !a.ultimo_login || new Date(a.ultimo_login) < corteInativo
    );

    res.json({
      janelaDias: dias,
      ranking: ranking.map(r => ({
        id: r.id, nome: r.nome, cnpj: r.cnpj, ativo: r.ativo,
        vendasQtd: r.vendas_qtd, faturamento: r.faturamento,
      })),
      atividade: atividade.map(a => ({
        id: a.id, nome: a.nome, ultimoLogin: a.ultimo_login,
      })),
      empresasInativasCount: inativas.length,
      empresasInativas: inativas.map(a => ({
        id: a.id, nome: a.nome, ultimoLogin: a.ultimo_login,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// ============ ASSINATURA / COBRANCAS (visao super-admin) ============
//
// Cross-tenant (prismaRaw) — o super-admin enxerga a assinatura e o historico
// de cobranca de qualquer empresa. Distinto de /billing/* (que e a visao do
// proprio cliente sobre a SUA assinatura).

const CICLO_DIAS = 30;

function empurrarValidade(expiraEmAtual) {
  const agora = new Date();
  const base = expiraEmAtual && new Date(expiraEmAtual) > agora ? new Date(expiraEmAtual) : agora;
  return new Date(base.getTime() + CICLO_DIAS * 86400000);
}

// GET /admin-master/empresas/:id/cobrancas — assinatura + historico de faturas.
export async function listarCobrancasEmpresa(req, res, next) {
  try {
    const { id } = req.params;
    const empresa = await prismaRaw.empresa.findUnique({
      where: { id },
      select: {
        id: true, nome: true, plano: true, expiraEm: true,
        statusAssinatura: true, gatewayProvedor: true, gatewayAssinaturaId: true,
        valorMensal: true, ultimoPagamentoEm: true, proximaCobrancaEm: true,
      },
    });
    if (!empresa) return res.status(404).json({ erro: "Empresa nao encontrada" });

    const cobrancas = await prismaRaw.cobrancaAssinatura.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: "desc" },
      take: 24,
    });

    res.json({
      assinatura: {
        plano: empresa.plano,
        expiraEm: empresa.expiraEm,
        statusAssinatura: empresa.statusAssinatura,
        provedor: empresa.gatewayProvedor,
        valorMensal: empresa.valorMensal != null ? Number(empresa.valorMensal) : null,
        ultimoPagamentoEm: empresa.ultimoPagamentoEm,
        proximaCobrancaEm: empresa.proximaCobrancaEm,
        temAssinaturaGateway: Boolean(empresa.gatewayAssinaturaId),
      },
      cobrancas: cobrancas.map(c => ({
        id: c.id,
        valor: Number(c.valor),
        status: c.status,
        vencimento: c.vencimento,
        pagoEm: c.pagoEm,
        metodo: c.metodo,
        linkPagamento: c.linkPagamento,
        descricao: c.descricao,
        criadaEm: c.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// POST /admin-master/empresas/:id/cobrancas/:cobrancaId/marcar-paga — baixa
// manual de uma cobranca (ex.: cliente pagou por fora/PIX direto). Marca PAGA,
// ativa a assinatura e empurra o expiraEm +30d.
export async function marcarCobrancaPaga(req, res, next) {
  try {
    const { id, cobrancaId } = req.params;
    const empresa = await prismaRaw.empresa.findUnique({ where: { id } });
    if (!empresa) return res.status(404).json({ erro: "Empresa nao encontrada" });

    const cobranca = await prismaRaw.cobrancaAssinatura.findUnique({ where: { id: cobrancaId } });
    if (!cobranca || cobranca.tenantId !== id) {
      return res.status(404).json({ erro: "Cobranca nao encontrada para esta empresa" });
    }
    if (cobranca.status === "PAGA") {
      return res.status(409).json({ erro: "Cobranca ja esta paga" });
    }

    const agora = new Date();
    await prismaRaw.$transaction([
      prismaRaw.cobrancaAssinatura.update({
        where: { id: cobrancaId },
        data: { status: "PAGA", pagoEm: agora, metodo: cobranca.metodo || "MANUAL" },
      }),
      prismaRaw.empresa.update({
        where: { id },
        data: {
          statusAssinatura: "ATIVA",
          ativo: true,
          ultimoPagamentoEm: agora,
          expiraEm: empurrarValidade(empresa.expiraEm),
          proximaCobrancaEm: new Date(agora.getTime() + CICLO_DIAS * 86400000),
        },
      }),
    ]);

    registrarEvento({
      acao: "COBRANCA_BAIXA_MANUAL", modulo: "ADMIN_MASTER", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome, tenantId: id,
      mensagem: `Baixa manual de cobranca (${Number(cobranca.valor)}) — assinatura reativada +30d`,
      req,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// POST /admin-master/empresas/:id/assinatura/cancelar — cancela a assinatura
// no gateway (se houver) e marca CANCELADA. Nao suspende o acesso na hora —
// o cliente continua ate o expiraEm vigente.
export async function cancelarAssinaturaEmpresa(req, res, next) {
  try {
    const { id } = req.params;
    const empresa = await prismaRaw.empresa.findUnique({ where: { id } });
    if (!empresa) return res.status(404).json({ erro: "Empresa nao encontrada" });

    // Tenta cancelar no gateway que originou a assinatura (best-effort).
    if (empresa.gatewayAssinaturaId && empresa.gatewayProvedor) {
      try {
        const provedor = getProvedor(empresa.gatewayProvedor);
        await provedor.cancelarAssinatura({ assinaturaId: empresa.gatewayAssinaturaId });
      } catch (e) {
        console.error("Falha ao cancelar no gateway (segue marcando CANCELADA):", e.message);
      }
    }

    await prismaRaw.empresa.update({
      where: { id },
      data: { statusAssinatura: "CANCELADA" },
    });

    registrarEvento({
      acao: "ASSINATURA_CANCELADA", modulo: "ADMIN_MASTER", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome, tenantId: id,
      mensagem: `Assinatura cancelada pelo super-admin (acesso mantido ate ${empresa.expiraEm ? new Date(empresa.expiraEm).toISOString().slice(0, 10) : "—"})`,
      req,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
