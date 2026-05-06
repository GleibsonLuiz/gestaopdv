// Camada fina sobre Vercel Blob para uploads (anexos, logotipo, imagens
// de produto). Quando rodar localmente sem BLOB_READ_WRITE_TOKEN, escreve
// no filesystem em backend/uploads/ — preserva a experiencia atual em dev.
//
// Em producao (Vercel), o token e injetado automaticamente quando a Blob
// store esta conectada ao projeto. Os arquivos vao para um bucket
// gerenciado e a URL retornada e absoluta + publica.

import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { put, del } from "@vercel/blob";

const PASTA_LOCAL = path.resolve("uploads");
const TEM_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

// Cria a pasta local sob demanda (lazy). Importante: em ambiente serverless
// (Vercel) o filesystem e read-only — fazer mkdir no top-level quebra o
// load do modulo. Em dev, isso garante a pasta antes do primeiro upload.
async function garantirPastaLocal(subdir = "") {
  const dir = subdir ? path.join(PASTA_LOCAL, subdir) : PASTA_LOCAL;
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// Sobe um arquivo. Recebe Buffer + extensao + mimeType e devolve uma URL
// que sera salva no banco. Em producao a URL e absoluta (https://*.blob.
// vercel-storage.com/...); em dev e relativa (/uploads/...).
export async function salvarArquivo({ pasta = "", buffer, extensao, mimeType }) {
  const ext = (extensao || "").toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 8);
  const nome = `${crypto.randomUUID()}${ext.startsWith(".") ? ext : (ext ? "." + ext : "")}`;
  const caminho = pasta ? `${pasta}/${nome}` : nome;

  if (TEM_BLOB) {
    // addRandomSuffix=false porque ja garantimos unicidade via uuid.
    const blob = await put(caminho, buffer, {
      access: "public",
      contentType: mimeType,
      addRandomSuffix: false,
    });
    return { url: blob.url, nomeArmazenado: blob.pathname };
  } else {
    const dir = await garantirPastaLocal(pasta);
    await fs.writeFile(path.join(dir, nome), buffer);
    const url = `/uploads/${pasta ? pasta + "/" : ""}${nome}`;
    return { url, nomeArmazenado: nome };
  }
}

// Remove um arquivo. Aceita a URL ou o nomeArmazenado. Em dev, mapeia de
// volta para o filesystem; em producao, chama o blob.del() que aceita URL
// completa.
export async function removerArquivo(urlOuNome) {
  if (!urlOuNome) return;
  if (TEM_BLOB) {
    try {
      await del(urlOuNome);
    } catch {
      // arquivo ja removido ou inexistente — ignora silenciosamente
    }
    return;
  }
  // Modo local: tenta mapear /uploads/... para um caminho real.
  let rel = urlOuNome.startsWith("/uploads/") ? urlOuNome.slice("/uploads/".length) : urlOuNome;
  // Se veio so o nomeArmazenado, assume raiz de uploads.
  const alvo = path.join(PASTA_LOCAL, rel);
  try {
    await fs.unlink(alvo);
  } catch {
    // ignora
  }
}
