import path from "node:path";
import multer from "multer";
import prisma from "../lib/prisma.js";
import { salvarArquivo, removerArquivo } from "../lib/storage.js";

const TAMANHO_MAX = 2 * 1024 * 1024; // 2 MB
const MIMES_PERMITIDOS = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

const storage = multer.memoryStorage();

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

export async function enviarImagem(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ erro: "Imagem nao enviada" });

    const produto = await prisma.produto.findUnique({ where: { id: req.params.id } });
    if (!produto) {
      return res.status(404).json({ erro: "Produto nao encontrado" });
    }

    // Remove imagem antiga (se houver) antes de gravar a nova URL.
    if (produto.imagem) await removerArquivo(produto.imagem);

    const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
    const { url } = await salvarArquivo({
      pasta: "produtos",
      buffer: req.file.buffer,
      extensao: ext,
      mimeType: req.file.mimetype,
    });

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
    next(err);
  }
}

export async function excluirImagem(req, res, next) {
  try {
    const produto = await prisma.produto.findUnique({ where: { id: req.params.id } });
    if (!produto) return res.status(404).json({ erro: "Produto nao encontrado" });

    if (produto.imagem) await removerArquivo(produto.imagem);

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
