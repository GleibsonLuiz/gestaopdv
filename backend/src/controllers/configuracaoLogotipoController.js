import path from "node:path";
import fs from "node:fs/promises";
import multer from "multer";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";

const PASTA_LOGO = path.resolve("uploads", "logo");
const TAMANHO_MAX = 2 * 1024 * 1024; // 2 MB
const MIMES_PERMITIDOS = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"]);

await fs.mkdir(PASTA_LOGO, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PASTA_LOGO),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8) || ".png";
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const uploadLogotipo = multer({
  storage,
  limits: { fileSize: TAMANHO_MAX },
  fileFilter: (_req, file, cb) => {
    if (!MIMES_PERMITIDOS.has(file.mimetype)) return cb(new Error("TIPO_NAO_PERMITIDO"));
    cb(null, true);
  },
});

export function tratarErroUploadLogotipo(err, _req, res, next) {
  if (!err) return next();
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ erro: "Logotipo muito grande (max 2MB)" });
  }
  if (err.message === "TIPO_NAO_PERMITIDO") {
    return res.status(400).json({ erro: "Tipo invalido (apenas JPG, PNG, WEBP, SVG)" });
  }
  next(err);
}

async function removerArquivoSeguro(urlImagem) {
  if (!urlImagem) return;
  const nome = path.basename(urlImagem);
  if (!nome) return;
  try {
    await fs.unlink(path.join(PASTA_LOGO, nome));
  } catch {
    // arquivo ja removido — ignora
  }
}

// Upload de logo opera no singleton da empresa. Cria o registro se ainda nao
// existir (com dados minimos) — assim o usuario pode comecar pelo upload de
// logo e preencher o resto depois.

export async function enviarLogotipo(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ erro: "Logotipo nao enviado" });

    let cfg = await prisma.configuracaoEmpresa.findFirst();
    if (!cfg) {
      cfg = await prisma.configuracaoEmpresa.create({
        data: { razaoSocial: "EMPRESA SEM NOME" },
      });
    }

    if (cfg.logotipo) await removerArquivoSeguro(cfg.logotipo);

    const url = `/uploads/logo/${req.file.filename}`;
    const atualizado = await prisma.configuracaoEmpresa.update({
      where: { id: cfg.id },
      data: { logotipo: url },
    });
    res.json(atualizado);
  } catch (err) {
    if (req.file) await removerArquivoSeguro(`/uploads/logo/${req.file.filename}`);
    next(err);
  }
}

export async function excluirLogotipo(req, res, next) {
  try {
    const cfg = await prisma.configuracaoEmpresa.findFirst();
    if (!cfg) return res.status(404).json({ erro: "Configuracao nao encontrada" });

    if (cfg.logotipo) await removerArquivoSeguro(cfg.logotipo);

    const atualizado = await prisma.configuracaoEmpresa.update({
      where: { id: cfg.id },
      data: { logotipo: null },
    });
    res.json(atualizado);
  } catch (err) {
    next(err);
  }
}
