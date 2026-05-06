import path from "node:path";
import multer from "multer";
import prisma from "../lib/prisma.js";
import { salvarArquivo, removerArquivo } from "../lib/storage.js";

const TAMANHO_MAX = 2 * 1024 * 1024; // 2 MB
const MIMES_PERMITIDOS = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"]);

const storage = multer.memoryStorage();

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

    if (cfg.logotipo) await removerArquivo(cfg.logotipo);

    const ext = path.extname(req.file.originalname).toLowerCase() || ".png";
    const { url } = await salvarArquivo({
      pasta: "logo",
      buffer: req.file.buffer,
      extensao: ext,
      mimeType: req.file.mimetype,
    });

    const atualizado = await prisma.configuracaoEmpresa.update({
      where: { id: cfg.id },
      data: { logotipo: url },
    });
    res.json(atualizado);
  } catch (err) {
    next(err);
  }
}

export async function excluirLogotipo(req, res, next) {
  try {
    const cfg = await prisma.configuracaoEmpresa.findFirst();
    if (!cfg) return res.status(404).json({ erro: "Configuracao nao encontrada" });

    if (cfg.logotipo) await removerArquivo(cfg.logotipo);

    const atualizado = await prisma.configuracaoEmpresa.update({
      where: { id: cfg.id },
      data: { logotipo: null },
    });
    res.json(atualizado);
  } catch (err) {
    next(err);
  }
}
