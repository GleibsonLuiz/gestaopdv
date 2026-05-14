import crypto from "node:crypto";
import prisma from "../lib/prisma.js";

// ============ HELPERS ============

export function gerarToken() {
  // 32 hex chars - colidir requer 2^128 tentativas, suficiente para o uso.
  return crypto.randomBytes(16).toString("hex");
}

function classificar(nota) {
  if (nota == null) return null;
  if (nota >= 9) return "PROMOTOR";
  if (nota >= 7) return "NEUTRO";
  return "DETRATOR";
}

// ============ ENDPOINTS PUBLICOS (sem autenticacao) ============
//
// Cliente acessa atraves do link ?nps=<token>. A resposta nao expoe
// dados sensiveis — apenas o nome da empresa (para confirmar contexto)
// e o numero da venda.

export async function obterPublico(req, res, next) {
  try {
    const { token } = req.params;
    const pesquisa = await prisma.pesquisaNps.findUnique({
      where: { token },
      include: {
        venda: { select: { numero: true, total: true, createdAt: true } },
        cliente: { select: { nome: true } },
      },
    });
    if (!pesquisa) return res.status(404).json({ erro: "Pesquisa nao encontrada" });

    // Carrega nome da empresa (para personalizar a mensagem)
    const empresa = await prisma.configuracaoEmpresa.findFirst({
      select: { nomeFantasia: true, razaoSocial: true },
    });

    res.json({
      token: pesquisa.token,
      respondida: !!pesquisa.respondidaEm,
      respondidaEm: pesquisa.respondidaEm,
      nota: pesquisa.nota,
      comentario: pesquisa.comentario,
      cliente: pesquisa.cliente?.nome || null,
      venda: pesquisa.venda
        ? {
            numero: pesquisa.venda.numero,
            data: pesquisa.venda.createdAt,
            total: pesquisa.venda.total,
          }
        : null,
      empresa: empresa?.nomeFantasia || empresa?.razaoSocial || "Nossa empresa",
    });
  } catch (err) {
    next(err);
  }
}

export async function responderPublico(req, res, next) {
  try {
    const { token } = req.params;
    const { nota, comentario } = req.body;

    const n = parseInt(nota, 10);
    if (isNaN(n) || n < 0 || n > 10) {
      return res.status(400).json({ erro: "Nota invalida (0 a 10)" });
    }

    const pesquisa = await prisma.pesquisaNps.findUnique({ where: { token } });
    if (!pesquisa) return res.status(404).json({ erro: "Pesquisa nao encontrada" });
    if (pesquisa.respondidaEm) {
      return res.status(400).json({ erro: "Pesquisa ja respondida" });
    }

    const atualizada = await prisma.pesquisaNps.update({
      where: { token },
      data: {
        nota: n,
        comentario: comentario ? String(comentario).slice(0, 1000) : null,
        respondidaEm: new Date(),
      },
    });

    res.json({ ok: true, nota: atualizada.nota, classificacao: classificar(atualizada.nota) });
  } catch (err) {
    next(err);
  }
}

// ============ ENDPOINTS PRIVADOS (auth + permissao NPS) ============

// Dashboard com NPS score, distribuicao e taxa de resposta.
export async function resumo(req, res, next) {
  try {
    const dias = parseInt(req.query.dias || "90", 10);
    const desde = new Date(Date.now() - dias * 86400000);

    const pesquisas = await prisma.pesquisaNps.findMany({
      where: { createdAt: { gte: desde } },
      select: { nota: true, respondidaEm: true, createdAt: true },
    });

    const total = pesquisas.length;
    const respondidas = pesquisas.filter((p) => p.respondidaEm != null);
    const pendentes = total - respondidas.length;
    const taxaResposta = total > 0 ? (respondidas.length / total) * 100 : 0;

    let promotores = 0, neutros = 0, detratores = 0;
    let somaNotas = 0;
    for (const p of respondidas) {
      somaNotas += p.nota;
      if (p.nota >= 9) promotores++;
      else if (p.nota >= 7) neutros++;
      else detratores++;
    }

    const npsScore = respondidas.length > 0
      ? ((promotores - detratores) / respondidas.length) * 100
      : null;
    const notaMedia = respondidas.length > 0 ? somaNotas / respondidas.length : null;

    res.json({
      janelaDias: dias,
      total,
      respondidas: respondidas.length,
      pendentes,
      taxaResposta,
      npsScore,
      notaMedia,
      promotores,
      neutros,
      detratores,
    });
  } catch (err) {
    next(err);
  }
}

// Lista de respostas + pendentes (para o gestor copiar links e enviar).
export async function listar(req, res, next) {
  try {
    const { status = "TODAS", limite = 100 } = req.query;
    const where = {};
    if (status === "RESPONDIDAS") where.respondidaEm = { not: null };
    else if (status === "PENDENTES") where.respondidaEm = null;

    const pesquisas = await prisma.pesquisaNps.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: parseInt(limite, 10),
      include: {
        venda: { select: { numero: true, total: true, createdAt: true } },
        cliente: { select: { id: true, nome: true, telefone: true, email: true } },
      },
    });

    res.json(pesquisas.map((p) => ({
      ...p,
      classificacao: classificar(p.nota),
    })));
  } catch (err) {
    next(err);
  }
}
