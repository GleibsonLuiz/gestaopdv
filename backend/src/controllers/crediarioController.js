import prisma from "../lib/prisma.js";
import { registrarEvento } from "../middlewares/auditoria.js";

// ============ CREDIARIO (FIADO) ============
//
// Camada de "caderneta" sobre Contas a Receber: acompanha o saldo devedor de
// cada cliente, o limite de credito e permite lancar uma compra no fiado
// (cria uma ContaReceber). A BAIXA (recebimento) reusa o endpoint existente
// /contas-receber/:id/receber — que ja cuida da integracao com o caixa.
//
// "Aberto" = ContaReceber com status PENDENTE ou ATRASADA. Saldo devedor = soma
// dessas. Vencido = abertas com vencimento < hoje.

const ABERTAS = ["PENDENTE", "ATRASADA"];

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// GET /crediario — lista clientes com crediario relevante (tem limite definido
// OU tem saldo em aberto), com saldo/vencido/qtd. Filtro opcional ?busca=.
export async function listar(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const linhas = await prisma.$queryRaw`
      SELECT
        c.id, c.nome, c."cpfCnpj" AS cpf_cnpj, c.telefone,
        c."limiteCredito"::float AS limite,
        COALESCE(SUM(CASE WHEN cr.status IN ('PENDENTE','ATRASADA') THEN cr.valor ELSE 0 END), 0)::float AS saldo,
        COALESCE(SUM(CASE WHEN cr.status IN ('PENDENTE','ATRASADA') AND cr.vencimento < NOW() THEN cr.valor ELSE 0 END), 0)::float AS vencido,
        COUNT(CASE WHEN cr.status IN ('PENDENTE','ATRASADA') THEN 1 END)::int AS qtd_abertas
      FROM clientes c
      LEFT JOIN contas_receber cr ON cr."clienteId" = c.id AND cr."tenantId" = ${tenantId}
      WHERE c."tenantId" = ${tenantId} AND c.ativo = true
      GROUP BY c.id, c.nome, c."cpfCnpj", c.telefone, c."limiteCredito"
      HAVING c."limiteCredito" IS NOT NULL
         OR COUNT(CASE WHEN cr.status IN ('PENDENTE','ATRASADA') THEN 1 END) > 0
      ORDER BY vencido DESC, saldo DESC
    `;

    const clientes = linhas.map(l => {
      const limite = l.limite;
      const saldo = l.saldo;
      const disponivel = limite != null ? Math.max(0, limite - saldo) : null;
      return {
        id: l.id,
        nome: l.nome,
        cpfCnpj: l.cpf_cnpj,
        telefone: l.telefone,
        limiteCredito: limite,
        saldoDevedor: saldo,
        vencido: l.vencido,
        creditoDisponivel: disponivel,
        acimaDoLimite: limite != null && saldo > limite,
        qtdAbertas: l.qtd_abertas,
      };
    });

    res.json({
      total: clientes.length,
      totalDevedor: clientes.reduce((s, c) => s + c.saldoDevedor, 0),
      totalVencido: clientes.reduce((s, c) => s + c.vencido, 0),
      clientes,
    });
  } catch (err) {
    next(err);
  }
}

// GET /crediario/:clienteId — caderneta do cliente: limite, saldo e lancamentos.
export async function caderneta(req, res, next) {
  try {
    const { clienteId } = req.params;
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, nome: true, cpfCnpj: true, telefone: true, limiteCredito: true },
    });
    if (!cliente) return res.status(404).json({ erro: "Cliente nao encontrado" });

    const contas = await prisma.contaReceber.findMany({
      where: { clienteId },
      orderBy: [{ status: "asc" }, { vencimento: "asc" }],
      take: 100,
      select: {
        id: true, descricao: true, valor: true, vencimento: true,
        recebimento: true, status: true, vendaId: true, createdAt: true,
      },
    });

    const agora = new Date();
    let saldo = 0, vencido = 0;
    const lancamentos = contas.map(c => {
      const valor = Number(c.valor);
      const aberta = ABERTAS.includes(c.status);
      if (aberta) {
        saldo += valor;
        if (c.vencimento && new Date(c.vencimento) < agora) vencido += valor;
      }
      return {
        id: c.id,
        descricao: c.descricao,
        valor,
        vencimento: c.vencimento,
        recebimento: c.recebimento,
        status: c.status,
        vencida: aberta && c.vencimento && new Date(c.vencimento) < agora,
        origemVenda: Boolean(c.vendaId),
        criadaEm: c.createdAt,
      };
    });

    const limite = cliente.limiteCredito != null ? Number(cliente.limiteCredito) : null;
    res.json({
      cliente: {
        id: cliente.id, nome: cliente.nome, cpfCnpj: cliente.cpfCnpj, telefone: cliente.telefone,
        limiteCredito: limite,
      },
      saldoDevedor: saldo,
      vencido,
      creditoDisponivel: limite != null ? Math.max(0, limite - saldo) : null,
      acimaDoLimite: limite != null && saldo > limite,
      lancamentos,
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /crediario/:clienteId/limite — define/remove o limite de credito.
// Body: { limite: number|null }. ADMIN/GERENTE (garantido na rota).
export async function definirLimite(req, res, next) {
  try {
    const { clienteId } = req.params;
    const { limite } = req.body || {};

    let valor = null;
    if (limite !== null && limite !== undefined && limite !== "") {
      valor = Number(limite);
      if (isNaN(valor) || valor < 0) {
        return res.status(400).json({ erro: "Limite invalido (use um numero >= 0 ou null para remover)" });
      }
    }

    const atualizado = await prisma.cliente.update({
      where: { id: clienteId },
      data: { limiteCredito: valor },
      select: { id: true, nome: true, limiteCredito: true },
    }).catch(err => { if (err.code === "P2025") return null; throw err; });
    if (!atualizado) return res.status(404).json({ erro: "Cliente nao encontrado" });

    registrarEvento({
      acao: "CREDIARIO_LIMITE", modulo: "CREDIARIO", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome, tenantId: req.tenantId,
      mensagem: valor != null
        ? `Limite de credito de "${atualizado.nome}" definido em ${valor}`
        : `Limite de credito de "${atualizado.nome}" removido`,
      req,
    });

    res.json({ ok: true, limiteCredito: atualizado.limiteCredito != null ? Number(atualizado.limiteCredito) : null });
  } catch (err) {
    next(err);
  }
}

// POST /crediario/:clienteId/lancar — lanca uma compra no fiado (cria uma
// ContaReceber). Valida o limite: se saldo + valor ultrapassar, bloqueia (402).
// Body: { valor, descricao?, vencimento? }
export async function lancar(req, res, next) {
  try {
    const { clienteId } = req.params;
    const valor = Number(req.body?.valor);
    if (!valor || isNaN(valor) || valor <= 0) {
      return res.status(400).json({ erro: "Valor invalido" });
    }
    const descricao = String(req.body?.descricao || "Compra no crediario").trim().slice(0, 200);
    const vencimento = parseDate(req.body?.vencimento)
      || new Date(Date.now() + 30 * 86400000); // default +30 dias

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, nome: true, limiteCredito: true },
    });
    if (!cliente) return res.status(404).json({ erro: "Cliente nao encontrado" });

    // Saldo em aberto atual
    const agg = await prisma.contaReceber.aggregate({
      where: { clienteId, status: { in: ABERTAS } },
      _sum: { valor: true },
    });
    const saldo = Number(agg._sum.valor || 0);

    // Valida limite (se definido)
    if (cliente.limiteCredito != null) {
      const limite = Number(cliente.limiteCredito);
      if (saldo + valor > limite) {
        return res.status(402).json({
          erro: `Limite de crédito excedido. Limite ${limite.toFixed(2)}, saldo atual ${saldo.toFixed(2)}, disponível ${Math.max(0, limite - saldo).toFixed(2)}.`,
          limiteExcedido: true,
          limite, saldo, disponivel: Math.max(0, limite - saldo),
        });
      }
    }

    const conta = await prisma.contaReceber.create({
      data: {
        descricao,
        valor,
        valorBruto: valor,
        vencimento,
        status: "PENDENTE",
        clienteId,
      },
      select: { id: true, descricao: true, valor: true, vencimento: true, status: true },
    });

    registrarEvento({
      acao: "CREDIARIO_LANCAMENTO", modulo: "CREDIARIO", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome, tenantId: req.tenantId,
      mensagem: `Fiado lancado para "${cliente.nome}": ${descricao} — ${valor.toFixed(2)}`,
      req,
    });

    res.status(201).json({
      ok: true,
      conta: { ...conta, valor: Number(conta.valor) },
      novoSaldo: saldo + valor,
    });
  } catch (err) {
    next(err);
  }
}
