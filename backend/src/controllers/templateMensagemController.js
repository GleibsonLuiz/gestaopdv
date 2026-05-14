import prisma from "../lib/prisma.js";

const TIPOS = ["WHATSAPP", "EMAIL", "SMS"];

function norm(v) {
  return v === undefined || v === null || v === "" ? null : v;
}

export async function listar(req, res, next) {
  try {
    const { tipo, ativo } = req.query;
    const where = {};
    if (tipo && TIPOS.includes(tipo)) where.tipo = tipo;
    if (ativo === "true") where.ativo = true;
    if (ativo === "false") where.ativo = false;

    const templates = await prisma.templateMensagem.findMany({
      where,
      orderBy: [{ tipo: "asc" }, { ordem: "asc" }, { nome: "asc" }],
    });
    res.json(templates);
  } catch (err) {
    next(err);
  }
}

export async function obter(req, res, next) {
  try {
    const tpl = await prisma.templateMensagem.findUnique({
      where: { id: req.params.id },
    });
    if (!tpl) return res.status(404).json({ erro: "Template nao encontrado" });
    res.json(tpl);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const { nome, tipo, assunto, corpo, ativo, ordem } = req.body;

    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ erro: "Nome e obrigatorio" });
    }
    if (!tipo || !TIPOS.includes(tipo)) {
      return res.status(400).json({ erro: "Tipo invalido" });
    }
    if (!corpo || !String(corpo).trim()) {
      return res.status(400).json({ erro: "Corpo e obrigatorio" });
    }
    if (tipo === "EMAIL" && (!assunto || !String(assunto).trim())) {
      return res.status(400).json({ erro: "Assunto e obrigatorio para EMAIL" });
    }

    const tpl = await prisma.templateMensagem.create({
      data: {
        nome: String(nome).trim(),
        tipo,
        assunto: norm(assunto),
        corpo: String(corpo).trim(),
        ativo: ativo !== false,
        ordem: Number.isFinite(parseInt(ordem, 10)) ? parseInt(ordem, 10) : 0,
      },
    });
    res.status(201).json(tpl);
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ erro: "Ja existe template com este nome" });
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const { nome, tipo, assunto, corpo, ativo, ordem } = req.body;

    if (tipo !== undefined && !TIPOS.includes(tipo)) {
      return res.status(400).json({ erro: "Tipo invalido" });
    }

    const data = {};
    if (nome !== undefined) {
      const n = String(nome).trim();
      if (!n) return res.status(400).json({ erro: "Nome nao pode ser vazio" });
      data.nome = n;
    }
    if (tipo !== undefined) data.tipo = tipo;
    if (assunto !== undefined) data.assunto = norm(assunto);
    if (corpo !== undefined) {
      const c = String(corpo).trim();
      if (!c) return res.status(400).json({ erro: "Corpo nao pode ser vazio" });
      data.corpo = c;
    }
    if (ativo !== undefined) data.ativo = !!ativo;
    if (ordem !== undefined) data.ordem = parseInt(ordem, 10) || 0;

    const tpl = await prisma.templateMensagem.update({
      where: { id: req.params.id },
      data,
    });
    res.json(tpl);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Template nao encontrado" });
    if (err.code === "P2002") return res.status(409).json({ erro: "Ja existe template com este nome" });
    next(err);
  }
}

export async function excluir(req, res, next) {
  try {
    await prisma.templateMensagem.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Template nao encontrado" });
    next(err);
  }
}
