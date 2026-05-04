import path from "node:path";
import fs from "node:fs/promises";
import multer from "multer";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";

const PASTA_PRODUTOS = path.resolve("uploads", "produtos");
const TAMANHO_MAX = 2 * 1024 * 1024; // 2 MB
const MIMES_PERMITIDOS = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

await fs.mkdir(PASTA_PRODUTOS, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PASTA_PRODUTOS),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8) || ".jpg";
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const uploadImagem = multer({
  storage,
  limits: { fileSize: TAMANHO_MAX },
  fileFilter: (_req, file, cb) => {
    if (!MIMES_PERMITIDOS.has(file.mimetype)) return cb(new Error("TIPO_NAO_PERMITIDO"));
    cb(null, true);
  },
});

export function tratarErroUploadImagem(err, _req, res, next) {
  if (!err) return next();
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ erro: "Imagem muito grande (max 2MB)" });
  }
  if (err.message === "TIPO_NAO_PERMITIDO") {
    return res.status(400).json({ erro: "Tipo invalido (apenas JPG, PNG, WEBP)" });
  }
  next(err);
}

async function removerArquivoSeguro(urlImagem) {
  if (!urlImagem) return;
  // url e' tipo "/uploads/produtos/<uuid>.jpg" — extrai apenas o nome do arquivo.
  const nome = path.basename(urlImagem);
  if (!nome) return;
  try {
    await fs.unlink(path.join(PASTA_PRODUTOS, nome));
  } catch {
    // arquivo ja removido — ignora
  }
}

export async function enviarImagem(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ erro: "Imagem nao enviada" });

    const produto = await prisma.produto.findUnique({ where: { id: req.params.id } });
    if (!produto) {
      await removerArquivoSeguro(`/uploads/produtos/${req.file.filename}`);
      return res.status(404).json({ erro: "Produto nao encontrado" });
    }

    // Remove imagem antiga (se houver) antes de gravar a nova URL.
    if (produto.imagem) await removerArquivoSeguro(produto.imagem);

    const url = `/uploads/produtos/${req.file.filename}`;
    const atualizado = await prisma.produto.update({
      where: { id: req.params.id },
      data: { imagem: url },
      include: {
        categoria: { select: { id: true, nome: true } },
        fornecedor: { select: { id: true, nome: true } },
      },
    });
    res.json(atualizado);
  } catch (err) {
    if (req.file) await removerArquivoSeguro(`/uploads/produtos/${req.file.filename}`);
    next(err);
  }
}

export async function excluirImagem(req, res, next) {
  try {
    const produto = await prisma.produto.findUnique({ where: { id: req.params.id } });
    if (!produto) return res.status(404).json({ erro: "Produto nao encontrado" });

    if (produto.imagem) await removerArquivoSeguro(produto.imagem);

    const atualizado = await prisma.produto.update({
      where: { id: req.params.id },
      data: { imagem: null },
      include: {
        categoria: { select: { id: true, nome: true } },
        fornecedor: { select: { id: true, nome: true } },
      },
    });
    res.json(atualizado);
  } catch (err) {
    next(err);
  }
}
