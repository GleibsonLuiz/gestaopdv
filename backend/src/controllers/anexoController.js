import path from "node:path";
import fs from "node:fs/promises";
import multer from "multer";
import crypto from "node:crypto";
import prisma from "../lib/prisma.js";

const PASTA_UPLOADS = path.resolve("uploads");
const TAMANHO_MAX = 5 * 1024 * 1024; // 5 MB
const MIMES_PERMITIDOS = new Set([
  "application/pdf",
  "image/jpeg", "image/jpg", "image/png",
]);

await fs.mkdir(PASTA_UPLOADS, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PASTA_UPLOADS),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8);
    const id = crypto.randomUUID();
    cb(null, `${id}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: TAMANHO_MAX },
  fileFilter: (_req, file, cb) => {
    if (!MIMES_PERMITIDOS.has(file.mimetype)) {
      return cb(new Error("TIPO_NAO_PERMITIDO"));
    }
    cb(null, true);
  },
});

// Trata erros do multer (limite de tamanho, tipo invalido) com mensagens em
// portugues sem acentos. Aplicar como middleware logo apos o `upload.single`.
export function tratarErroUpload(err, _req, res, next) {
  if (!err) return next();
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ erro: "Arquivo muito grande (max 5MB)" });
  }
  if (err.message === "TIPO_NAO_PERMITIDO") {
    return res.status(400).json({ erro: "Tipo de arquivo nao permitido (apenas PDF, JPG, PNG)" });
  }
  next(err);
}

async function removerArquivo(nomeArmazenado) {
  if (!nomeArmazenado) return;
  try {
    await fs.unlink(path.join(PASTA_UPLOADS, nomeArmazenado));
  } catch {
    // arquivo ja inexistente — ignora
  }
}

// Anexa um arquivo a uma conta a pagar OU a receber. O parametro `tipo` decide
// qual relacao usar. Cria registro Anexo apontando para o arquivo no disco.
async function anexarArquivo(tipo, contaId, file, res) {
  if (!file) return res.status(400).json({ erro: "Arquivo nao enviado" });

  const tabela = tipo === "pagar" ? prisma.contaPagar : prisma.contaReceber;
  const conta = await tabela.findUnique({ where: { id: contaId } });
  if (!conta) {
    await removerArquivo(file.filename);
    return res.status(404).json({ erro: "Conta nao encontrada" });
  }

  const dadosLink = tipo === "pagar"
    ? { contaPagarId: contaId }
    : { contaReceberId: contaId };

  const anexo = await prisma.anexo.create({
    data: {
      nomeOriginal: file.originalname,
      nomeArmazenado: file.filename,
      mimeType: file.mimetype,
      tamanho: file.size,
      url: `/uploads/${file.filename}`,
      ...dadosLink,
    },
  });
  res.status(201).json(anexo);
}

export async function anexarPagar(req, res, next) {
  try { await anexarArquivo("pagar", req.params.id, req.file, res); }
  catch (err) {
    if (req.file) await removerArquivo(req.file.filename);
    next(err);
  }
}

export async function anexarReceber(req, res, next) {
  try { await anexarArquivo("receber", req.params.id, req.file, res); }
  catch (err) {
    if (req.file) await removerArquivo(req.file.filename);
    next(err);
  }
}

export async function excluirAnexo(req, res, next) {
  try {
    const anexo = await prisma.anexo.findUnique({ where: { id: req.params.anexoId } });
    if (!anexo) return res.status(404).json({ erro: "Anexo nao encontrado" });

    // Confere que o anexo pertence a conta indicada na URL.
    const tipo = req.params.tipo;
    if (tipo === "pagar" && anexo.contaPagarId !== req.params.id) {
      return res.status(404).json({ erro: "Anexo nao pertence a esta conta" });
    }
    if (tipo === "receber" && anexo.contaReceberId !== req.params.id) {
      return res.status(404).json({ erro: "Anexo nao pertence a esta conta" });
    }

    await prisma.anexo.delete({ where: { id: anexo.id } });
    await removerArquivo(anexo.nomeArmazenado);
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Anexo nao encontrado" });
    next(err);
  }
}
