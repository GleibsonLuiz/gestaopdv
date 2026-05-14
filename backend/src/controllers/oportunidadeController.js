import prisma from "../lib/prisma.js";

const ETAPAS = ["LEAD", "QUALIFICADO", "PROPOSTA", "NEGOCIACAO", "GANHO", "PERDIDO"];

// Probabilidade padrao por etapa quando o usuario nao informa.
const PROB_PADRAO = {
  LEAD: 10,
  QUALIFICADO: 30,
  PROPOSTA: 50,
  NEGOCIACAO: 75,
  GANHO: 100,
  PERDIDO: 0,
};

const INCLUDE_DETALHE = {
  cliente: { select: { id: true, nome: true, telefone: true, email: true } },
  responsavel: { select: { id: true, nome: true, role: true } },
  criadoPor: { select: { id: true, nome: true, role: true } },
  venda: { select: { id: true, numero: true, total: true, status: true } },
};

function norm(v) {
  if (v === undefined || v === null || v === "") return null;
  return v;
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

// ============ LISTAR ============

export async function listar(req, res, next) {
  try {
    const { etapa, responsavelId, clienteId, origem, search, minhas } = req.query;

    const where = {};
    if (etapa) where.etapa = etapa;
    if (responsavelId) where.responsavelId = responsavelId;
    if (clienteId) where.clienteId = clienteId;
    if (origem) where.origem = origem;
    if (minhas === "true") where.responsavelId = req.user.id;
    if (search && String(search).trim()) {
      const s = String(search).trim();
      where.OR = [
        { titulo: { contains: s, mode: "insensitive" } },
        { descricao: { contains: s, mode: "insensitive" } },
        { cliente: { nome: { contains: s, mode: "insensitive" } } },
      ];
    }

    const oportunidades = await prisma.oportunidade.findMany({
      where,
      include: INCLUDE_DETALHE,
      orderBy: [{ etapa: "asc" }, { updatedAt: "desc" }],
    });

    res.json(oportunidades);
  } catch (err) {
    next(err);
  }
}

// ============ KPIS DO FUNIL ============
//
// Retorna agrupamento por etapa: total de oportunidades, soma do
// valorEstimado e soma ponderada pela probabilidade (forecast).

export async function resumoFunil(req, res, next) {
  try {
    const { responsavelId, minhas } = req.query;
    const where = {};
    if (responsavelId) where.responsavelId = responsavelId;
    if (minhas === "true") where.responsavelId = req.user.id;

    const todas = await prisma.oportunidade.findMany({
      where,
      select: { etapa: true, valorEstimado: true, probabilidade: true, dataGanho: true },
    });

    const porEtapa = {};
    for (const e of ETAPAS) porEtapa[e] = { quantidade: 0, valorEstimado: 0, valorPonderado: 0 };

    let totalGanho = 0;
    let totalPerdido = 0;
    let valorGanho = 0;
    for (const o of todas) {
      const v = Number(o.valorEstimado || 0);
      const p = Number(o.probabilidade || 0) / 100;
      porEtapa[o.etapa].quantidade += 1;
      porEtapa[o.etapa].valorEstimado += v;
      porEtapa[o.etapa].valorPonderado += v * p;
      if (o.etapa === "GANHO") {
        totalGanho += 1;
        valorGanho += v;
      } else if (o.etapa === "PERDIDO") {
        totalPerdido += 1;
      }
    }

    const totalFechadas = totalGanho + totalPerdido;
    const taxaConversao = totalFechadas > 0 ? (totalGanho / totalFechadas) * 100 : 0;
    const totalAberto = todas.length - totalGanho - totalPerdido;
    const valorPonderadoAberto = ETAPAS
      .filter((e) => e !== "GANHO" && e !== "PERDIDO")
      .reduce((acc, e) => acc + porEtapa[e].valorPonderado, 0);

    res.json({
      porEtapa,
      totalGanho,
      totalPerdido,
      totalAberto,
      valorGanho,
      valorPonderadoAberto,
      taxaConversao,
    });
  } catch (err) {
    next(err);
  }
}

// ============ OBTER ============

export async function obter(req, res, next) {
  try {
    const op = await prisma.oportunidade.findUnique({
      where: { id: req.params.id },
      include: {
        ...INCLUDE_DETALHE,
        historico: {
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, nome: true } } },
        },
      },
    });
    if (!op) return res.status(404).json({ erro: "Oportunidade nao encontrada" });
    res.json(op);
  } catch (err) {
    next(err);
  }
}

// ============ CRIAR ============

export async function criar(req, res, next) {
  try {
    const {
      titulo, descricao, etapa, probabilidade, valorEstimado,
      dataFechamentoPrevista, origem, clienteId, responsavelId,
    } = req.body;

    if (!titulo || !String(titulo).trim()) {
      return res.status(400).json({ erro: "Titulo e obrigatorio" });
    }
    if (etapa && !ETAPAS.includes(etapa)) {
      return res.status(400).json({ erro: "Etapa invalida" });
    }

    const etapaInicial = etapa || "LEAD";
    const probFinal = probabilidade !== undefined && probabilidade !== null && probabilidade !== ""
      ? clamp(parseInt(probabilidade, 10) || 0, 0, 100)
      : PROB_PADRAO[etapaInicial];

    const op = await prisma.$transaction(async (tx) => {
      const criada = await tx.oportunidade.create({
        data: {
          titulo: String(titulo).trim(),
          descricao: norm(descricao),
          etapa: etapaInicial,
          probabilidade: probFinal,
          valorEstimado: valorEstimado !== undefined && valorEstimado !== null && valorEstimado !== ""
            ? Number(valorEstimado)
            : null,
          dataFechamentoPrevista: parseDate(dataFechamentoPrevista),
          origem: norm(origem),
          clienteId: norm(clienteId),
          responsavelId: norm(responsavelId),
          criadoPorId: req.user.id,
          dataGanho: etapaInicial === "GANHO" ? new Date() : null,
          dataPerdida: etapaInicial === "PERDIDO" ? new Date() : null,
        },
        include: INCLUDE_DETALHE,
      });

      await tx.historicoOportunidade.create({
        data: {
          oportunidadeId: criada.id,
          etapaAnterior: null,
          etapaNova: etapaInicial,
          userId: req.user.id,
          observacao: "Oportunidade criada",
        },
      });

      return criada;
    });

    res.status(201).json(op);
  } catch (err) {
    if (err.code === "P2003") return res.status(400).json({ erro: "Cliente, responsavel ou venda nao encontrado" });
    next(err);
  }
}

// ============ ATUALIZAR ============

export async function atualizar(req, res, next) {
  try {
    const {
      titulo, descricao, probabilidade, valorEstimado,
      dataFechamentoPrevista, origem, clienteId, responsavelId,
    } = req.body;

    const existente = await prisma.oportunidade.findUnique({ where: { id: req.params.id } });
    if (!existente) return res.status(404).json({ erro: "Oportunidade nao encontrada" });

    const data = {};
    if (titulo !== undefined) {
      const t = String(titulo).trim();
      if (!t) return res.status(400).json({ erro: "Titulo nao pode ser vazio" });
      data.titulo = t;
    }
    if (descricao !== undefined) data.descricao = norm(descricao);
    if (probabilidade !== undefined) {
      data.probabilidade = clamp(parseInt(probabilidade, 10) || 0, 0, 100);
    }
    if (valorEstimado !== undefined) {
      data.valorEstimado = valorEstimado === null || valorEstimado === ""
        ? null
        : Number(valorEstimado);
    }
    if (dataFechamentoPrevista !== undefined) {
      data.dataFechamentoPrevista = parseDate(dataFechamentoPrevista);
    }
    if (origem !== undefined) data.origem = norm(origem);
    if (clienteId !== undefined) data.clienteId = norm(clienteId);
    if (responsavelId !== undefined) data.responsavelId = norm(responsavelId);

    const atualizada = await prisma.oportunidade.update({
      where: { id: req.params.id },
      data,
      include: INCLUDE_DETALHE,
    });
    res.json(atualizada);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Oportunidade nao encontrada" });
    if (err.code === "P2003") return res.status(400).json({ erro: "Cliente ou responsavel nao encontrado" });
    next(err);
  }
}

// ============ MOVER ETAPA (drag-and-drop) ============

export async function moverEtapa(req, res, next) {
  try {
    const { etapa, motivoPerda, observacao } = req.body;
    if (!etapa || !ETAPAS.includes(etapa)) {
      return res.status(400).json({ erro: "Etapa invalida" });
    }

    const existente = await prisma.oportunidade.findUnique({ where: { id: req.params.id } });
    if (!existente) return res.status(404).json({ erro: "Oportunidade nao encontrada" });

    if (etapa === existente.etapa) {
      return res.json(existente);
    }
    if (etapa === "PERDIDO" && !motivoPerda) {
      return res.status(400).json({ erro: "Motivo de perda e obrigatorio" });
    }

    const data = {
      etapa,
      probabilidade: PROB_PADRAO[etapa],
    };

    if (etapa === "GANHO") {
      data.dataGanho = new Date();
      data.dataPerdida = null;
      data.motivoPerda = null;
    } else if (etapa === "PERDIDO") {
      data.dataPerdida = new Date();
      data.dataGanho = null;
      data.motivoPerda = String(motivoPerda).trim();
    } else {
      // Reabrindo (voltando para etapa nao-terminal)
      data.dataGanho = null;
      data.dataPerdida = null;
      data.motivoPerda = null;
    }

    const atualizada = await prisma.$transaction(async (tx) => {
      const upd = await tx.oportunidade.update({
        where: { id: req.params.id },
        data,
        include: INCLUDE_DETALHE,
      });

      await tx.historicoOportunidade.create({
        data: {
          oportunidadeId: req.params.id,
          etapaAnterior: existente.etapa,
          etapaNova: etapa,
          userId: req.user.id,
          observacao: norm(observacao) || `Movida de ${existente.etapa} para ${etapa}`,
        },
      });

      return upd;
    });

    res.json(atualizada);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Oportunidade nao encontrada" });
    next(err);
  }
}

// ============ EXCLUIR ============

export async function excluir(req, res, next) {
  try {
    await prisma.oportunidade.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Oportunidade nao encontrada" });
    next(err);
  }
}
