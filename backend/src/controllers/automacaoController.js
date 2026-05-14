import prisma from "../lib/prisma.js";

const TIPOS = ["CLIENTE_INATIVO", "ORCAMENTO_PARADO", "POS_VENDA_FOLLOWUP"];
const PRIORIDADES = ["BAIXA", "MEDIA", "ALTA", "URGENTE"];

function norm(v) {
  return v === undefined || v === null || v === "" ? null : v;
}

function diasAtras(d) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

function aplicarVariaveis(texto, ctx) {
  if (!texto) return "";
  return String(texto).replace(/\{\{(\w+)\}\}/g, (_, k) =>
    k in ctx ? String(ctx[k]) : `{{${k}}}`,
  );
}

// ============ CRUD ============

export async function listar(req, res, next) {
  try {
    const { ativo, tipo } = req.query;
    const where = {};
    if (ativo === "true") where.ativo = true;
    if (ativo === "false") where.ativo = false;
    if (tipo && TIPOS.includes(tipo)) where.tipo = tipo;

    const regras = await prisma.regraAutomacao.findMany({
      where,
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      include: {
        responsavel: { select: { id: true, nome: true } },
        _count: { select: { logs: true } },
      },
    });
    res.json(regras);
  } catch (err) {
    next(err);
  }
}

export async function obter(req, res, next) {
  try {
    const r = await prisma.regraAutomacao.findUnique({
      where: { id: req.params.id },
      include: {
        responsavel: { select: { id: true, nome: true } },
        logs: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });
    if (!r) return res.status(404).json({ erro: "Regra nao encontrada" });
    res.json(r);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const {
      nome, tipo, ativo, diasGatilho, valorMinimo,
      tituloTarefa, descricaoTarefa, prioridadeTarefa, prazoEmDias, responsavelId,
    } = req.body;

    if (!nome || !String(nome).trim()) return res.status(400).json({ erro: "Nome e obrigatorio" });
    if (!tipo || !TIPOS.includes(tipo)) return res.status(400).json({ erro: "Tipo invalido" });
    if (!tituloTarefa || !String(tituloTarefa).trim()) {
      return res.status(400).json({ erro: "Titulo da tarefa e obrigatorio" });
    }
    if (prioridadeTarefa && !PRIORIDADES.includes(prioridadeTarefa)) {
      return res.status(400).json({ erro: "Prioridade invalida" });
    }

    const regra = await prisma.regraAutomacao.create({
      data: {
        nome: String(nome).trim(),
        tipo,
        ativo: ativo !== false,
        diasGatilho: diasGatilho ? parseInt(diasGatilho, 10) : null,
        valorMinimo: valorMinimo ? Number(valorMinimo) : null,
        tituloTarefa: String(tituloTarefa).trim(),
        descricaoTarefa: norm(descricaoTarefa),
        prioridadeTarefa: prioridadeTarefa || "MEDIA",
        prazoEmDias: prazoEmDias ? parseInt(prazoEmDias, 10) : 7,
        responsavelId: norm(responsavelId),
      },
      include: { responsavel: { select: { id: true, nome: true } } },
    });
    res.status(201).json(regra);
  } catch (err) {
    if (err.code === "P2003") return res.status(400).json({ erro: "Responsavel nao encontrado" });
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const data = {};
    const b = req.body;
    if (b.nome !== undefined) {
      const n = String(b.nome).trim();
      if (!n) return res.status(400).json({ erro: "Nome nao pode ser vazio" });
      data.nome = n;
    }
    if (b.tipo !== undefined) {
      if (!TIPOS.includes(b.tipo)) return res.status(400).json({ erro: "Tipo invalido" });
      data.tipo = b.tipo;
    }
    if (b.ativo !== undefined) data.ativo = !!b.ativo;
    if (b.diasGatilho !== undefined) {
      data.diasGatilho = b.diasGatilho === null || b.diasGatilho === ""
        ? null : parseInt(b.diasGatilho, 10);
    }
    if (b.valorMinimo !== undefined) {
      data.valorMinimo = b.valorMinimo === null || b.valorMinimo === ""
        ? null : Number(b.valorMinimo);
    }
    if (b.tituloTarefa !== undefined) {
      const t = String(b.tituloTarefa).trim();
      if (!t) return res.status(400).json({ erro: "Titulo da tarefa nao pode ser vazio" });
      data.tituloTarefa = t;
    }
    if (b.descricaoTarefa !== undefined) data.descricaoTarefa = norm(b.descricaoTarefa);
    if (b.prioridadeTarefa !== undefined) {
      if (!PRIORIDADES.includes(b.prioridadeTarefa)) {
        return res.status(400).json({ erro: "Prioridade invalida" });
      }
      data.prioridadeTarefa = b.prioridadeTarefa;
    }
    if (b.prazoEmDias !== undefined) data.prazoEmDias = parseInt(b.prazoEmDias, 10) || 7;
    if (b.responsavelId !== undefined) data.responsavelId = norm(b.responsavelId);

    const regra = await prisma.regraAutomacao.update({
      where: { id: req.params.id },
      data,
      include: { responsavel: { select: { id: true, nome: true } } },
    });
    res.json(regra);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Regra nao encontrada" });
    if (err.code === "P2003") return res.status(400).json({ erro: "Responsavel nao encontrado" });
    next(err);
  }
}

export async function excluir(req, res, next) {
  try {
    await prisma.regraAutomacao.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Regra nao encontrada" });
    next(err);
  }
}

// ============ LOGS ============

export async function listarLogs(req, res, next) {
  try {
    const { regraId, limite = 100 } = req.query;
    const where = {};
    if (regraId) where.regraId = regraId;

    const logs = await prisma.logAutomacao.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: parseInt(limite, 10),
      include: { regra: { select: { id: true, nome: true, tipo: true } } },
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
}

// ============ MOTOR DE EXECUCAO ============
//
// Cada tipo de regra possui sua propria query de candidatos + criacao
// de tarefa idempotente via LogAutomacao.

async function executarRegraCliente(regra, executorUserId) {
  const dias = regra.diasGatilho || 90;
  const limite = new Date(Date.now() - dias * 86400000);

  // Clientes que tem pelo menos uma venda CONCLUIDA cuja ultima venda foi
  // antes do limite (inativos pelo periodo).
  const candidatos = await prisma.cliente.findMany({
    where: {
      ativo: true,
      vendas: {
        some: { status: "CONCLUIDA" },
        none: { status: "CONCLUIDA", createdAt: { gte: limite } },
      },
    },
    include: {
      vendas: {
        where: { status: "CONCLUIDA" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, userId: true },
      },
    },
  });

  // Anti-duplicacao: clientes que ja receberam essa regra nos ultimos `dias` dias
  const logsRecentes = await prisma.logAutomacao.findMany({
    where: {
      regraId: regra.id,
      createdAt: { gte: limite },
      clienteId: { not: null },
    },
    select: { clienteId: true },
  });
  const jaProcessados = new Set(logsRecentes.map((l) => l.clienteId));

  let criadas = 0;
  let skips = 0;
  for (const c of candidatos) {
    if (jaProcessados.has(c.id)) { skips++; continue; }
    const ultimaVenda = c.vendas[0];
    const recencia = ultimaVenda ? diasAtras(ultimaVenda.createdAt) : null;
    const responsavelFinal = regra.responsavelId || ultimaVenda?.userId || null;

    const ctx = {
      nomeCliente: c.nome,
      recenciaDias: recencia ?? "—",
      valorVenda: "—",
      numeroOrcamento: "—",
      diasParado: "—",
      descricaoOrcamento: "—",
    };

    const tarefa = await prisma.tarefa.create({
      data: {
        titulo: aplicarVariaveis(regra.tituloTarefa, ctx),
        descricao: aplicarVariaveis(regra.descricaoTarefa, ctx),
        prioridade: regra.prioridadeTarefa,
        prazo: new Date(Date.now() + (regra.prazoEmDias || 7) * 86400000),
        clienteId: c.id,
        responsavelId: responsavelFinal,
        criadoPorId: executorUserId,
      },
    });

    await prisma.logAutomacao.create({
      data: {
        regraId: regra.id,
        clienteId: c.id,
        tarefaId: tarefa.id,
        resultado: "CRIADA",
      },
    });
    criadas++;
  }

  return { tipo: regra.tipo, candidatos: candidatos.length, criadas, skips };
}

async function executarRegraOrcamento(regra, executorUserId) {
  const dias = regra.diasGatilho || 7;
  const limite = new Date(Date.now() - dias * 86400000);

  const candidatos = await prisma.orcamento.findMany({
    where: {
      status: "AGUARDANDO_APROVACAO",
      updatedAt: { lt: limite },
    },
    include: {
      cliente: { select: { id: true, nome: true } },
      user: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, nome: true } },
    },
  });

  const logsExistentes = await prisma.logAutomacao.findMany({
    where: { regraId: regra.id, orcamentoId: { not: null } },
    select: { orcamentoId: true },
  });
  const jaProcessados = new Set(logsExistentes.map((l) => l.orcamentoId));

  let criadas = 0;
  let skips = 0;
  for (const o of candidatos) {
    if (jaProcessados.has(o.id)) { skips++; continue; }

    const responsavelFinal = regra.responsavelId
      || o.responsavelId
      || o.userId
      || null;

    const ctx = {
      nomeCliente: o.cliente?.nome || o.descricaoCliente || "Cliente",
      recenciaDias: "—",
      valorVenda: "—",
      numeroOrcamento: `#${o.numero}`,
      diasParado: diasAtras(o.updatedAt),
      descricaoOrcamento: o.descricaoCliente || `Orcamento #${o.numero}`,
    };

    const tarefa = await prisma.tarefa.create({
      data: {
        titulo: aplicarVariaveis(regra.tituloTarefa, ctx),
        descricao: aplicarVariaveis(regra.descricaoTarefa, ctx),
        prioridade: regra.prioridadeTarefa,
        prazo: new Date(Date.now() + (regra.prazoEmDias || 7) * 86400000),
        clienteId: o.clienteId,
        responsavelId: responsavelFinal,
        criadoPorId: executorUserId,
      },
    });

    await prisma.logAutomacao.create({
      data: {
        regraId: regra.id,
        orcamentoId: o.id,
        clienteId: o.clienteId,
        tarefaId: tarefa.id,
        resultado: "CRIADA",
      },
    });
    criadas++;
  }

  return { tipo: regra.tipo, candidatos: candidatos.length, criadas, skips };
}

async function executarRegraPosVenda(regra, executorUserId) {
  const dias = regra.diasGatilho || 3;
  // Vendas concluidas exatamente entre (dias atras) e agora — janela movel.
  const limiteSuperior = new Date(Date.now() - dias * 86400000);
  // Para nao perder vendas, olhamos uma janela ate +30 dias atras do gatilho.
  const limiteInferior = new Date(limiteSuperior.getTime() - 30 * 86400000);

  const where = {
    status: "CONCLUIDA",
    createdAt: { gte: limiteInferior, lte: limiteSuperior },
    clienteId: { not: null },
  };
  if (regra.valorMinimo) {
    where.total = { gte: regra.valorMinimo };
  }

  const candidatos = await prisma.venda.findMany({
    where,
    include: {
      cliente: { select: { id: true, nome: true } },
      user: { select: { id: true, nome: true } },
    },
  });

  const logsExistentes = await prisma.logAutomacao.findMany({
    where: { regraId: regra.id, vendaId: { not: null } },
    select: { vendaId: true },
  });
  const jaProcessadas = new Set(logsExistentes.map((l) => l.vendaId));

  let criadas = 0;
  let skips = 0;
  for (const v of candidatos) {
    if (jaProcessadas.has(v.id)) { skips++; continue; }

    const responsavelFinal = regra.responsavelId || v.userId || null;

    const ctx = {
      nomeCliente: v.cliente?.nome || "Cliente",
      recenciaDias: diasAtras(v.createdAt),
      valorVenda: Number(v.total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      numeroOrcamento: "—",
      diasParado: "—",
      descricaoOrcamento: "—",
    };

    const tarefa = await prisma.tarefa.create({
      data: {
        titulo: aplicarVariaveis(regra.tituloTarefa, ctx),
        descricao: aplicarVariaveis(regra.descricaoTarefa, ctx),
        prioridade: regra.prioridadeTarefa,
        prazo: new Date(Date.now() + (regra.prazoEmDias || 7) * 86400000),
        clienteId: v.clienteId,
        responsavelId: responsavelFinal,
        criadoPorId: executorUserId,
      },
    });

    await prisma.logAutomacao.create({
      data: {
        regraId: regra.id,
        vendaId: v.id,
        clienteId: v.clienteId,
        tarefaId: tarefa.id,
        resultado: "CRIADA",
      },
    });
    criadas++;
  }

  return { tipo: regra.tipo, candidatos: candidatos.length, criadas, skips };
}

async function executarUma(regra, executorUserId) {
  if (!regra.ativo) return { tipo: regra.tipo, candidatos: 0, criadas: 0, skips: 0, inativa: true };

  let resultado;
  if (regra.tipo === "CLIENTE_INATIVO") {
    resultado = await executarRegraCliente(regra, executorUserId);
  } else if (regra.tipo === "ORCAMENTO_PARADO") {
    resultado = await executarRegraOrcamento(regra, executorUserId);
  } else if (regra.tipo === "POS_VENDA_FOLLOWUP") {
    resultado = await executarRegraPosVenda(regra, executorUserId);
  } else {
    return { tipo: regra.tipo, candidatos: 0, criadas: 0, skips: 0, erro: "Tipo desconhecido" };
  }

  await prisma.regraAutomacao.update({
    where: { id: regra.id },
    data: {
      ultimaExecucao: new Date(),
      totalDisparos: { increment: resultado.criadas },
    },
  });

  return resultado;
}

export async function executar(req, res, next) {
  try {
    const regra = await prisma.regraAutomacao.findUnique({ where: { id: req.params.id } });
    if (!regra) return res.status(404).json({ erro: "Regra nao encontrada" });

    const resultado = await executarUma(regra, req.user.sub);
    res.json({ regraId: regra.id, nome: regra.nome, ...resultado });
  } catch (err) {
    next(err);
  }
}

export async function executarTodas(req, res, next) {
  try {
    const regras = await prisma.regraAutomacao.findMany({ where: { ativo: true } });
    const resultados = [];
    for (const r of regras) {
      try {
        const resumo = await executarUma(r, req.user.sub);
        resultados.push({ regraId: r.id, nome: r.nome, ...resumo });
      } catch (e) {
        resultados.push({ regraId: r.id, nome: r.nome, erro: e.message });
      }
    }
    const totalCriadas = resultados.reduce((s, r) => s + (r.criadas || 0), 0);
    res.json({ totalRegras: regras.length, totalCriadas, resultados });
  } catch (err) {
    next(err);
  }
}
