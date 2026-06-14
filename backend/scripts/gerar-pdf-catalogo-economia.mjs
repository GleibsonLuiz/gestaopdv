// Gera um PDF com a lista de produtos do tenant "SUPERMERCADO ECONOMIA"
// (nome, codigo interno, preco e codigo de barras em EAN-13 legivel por
// leitor/bipe), para teste do bipe no PDV.
//
// Tambem gera 3 etiquetas extras de BALANCA (peso variavel, prefixo "2")
// para o produto vendido por KG, simulando 300g/500g/1kg.
//
// Uso:  node scripts/gerar-pdf-catalogo-economia.mjs
// Saida: docs/Catalogo-Produtos-SupermercadoEconomia.pdf (na raiz do repo)

import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const TENANT_ID = "a1e31227-e1cd-4fc1-aa18-d11ddef5e3de";

const prisma = new PrismaClient();

function checkDigitEAN13(digits12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(digits12[i]);
    sum += i % 2 === 0 ? n : n * 3;
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

function etiquetaBalanca(codigoInterno, gramas) {
  const cod6 = String(parseInt(codigoInterno, 10)).padStart(6, "0");
  const peso5 = String(gramas).padStart(5, "0");
  const base12 = `2${cod6}${peso5}`;
  return base12 + checkDigitEAN13(base12);
}

const fmt = (v) => Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const main = async () => {
  const produtos = await prisma.produto.findMany({
    where: { tenantId: TENANT_ID, ativo: true },
    orderBy: { codigo: "asc" },
  });
  await prisma.$disconnect();

  console.log(`Produtos: ${produtos.length}`);

  // Cards normais: 1 por produto (codigo de barras de fabrica/EAN-13).
  const cards = produtos.map((p) => ({
    titulo: p.nome,
    sub: `Cod. interno ${p.codigo} · ${p.unidade} · Custo R$ ${fmt(p.precoCusto)} · Venda R$ ${fmt(p.precoVenda)} · Estoque min ${Number(p.estoqueMinimo)}`,
    codigo: p.codigoBarras,
  }));

  // Etiquetas extras de balanca para o produto KG (QUEIJO MUSSARELA = 0015).
  const produtoKg = produtos.find((p) => p.unidade === "KG");
  if (produtoKg) {
    for (const gramas of [300, 500, 1000]) {
      const peso = gramas >= 1000 ? `${(gramas / 1000).toFixed(3)} kg` : `${gramas} g`;
      cards.push({
        titulo: `${produtoKg.nome} — etiqueta balanca ${peso}`,
        sub: `Etiqueta de peso variavel (prefixo 2) · simula ${peso} no bipe`,
        codigo: etiquetaBalanca(produtoKg.codigo, gramas),
        balanca: true,
      });
    }
  }

  const jsbarcodeSrc = readFileSync(
    join(ROOT, "node_modules", "jsbarcode", "dist", "JsBarcode.all.min.js"),
    "utf8",
  );

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; color: #1f2430; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { font-size: 11px; color: #666; margin-bottom: 10mm; }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4mm;
  }
  .card {
    border: 1px solid #d8dbe2;
    border-radius: 6px;
    padding: 3mm 4mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    break-inside: avoid;
  }
  .card.balanca { border-color: #b8862b; background: #fdf8ee; }
  .card .titulo { font-size: 12px; font-weight: 700; line-height: 1.25; min-height: 28px; }
  .card .sub { font-size: 9px; color: #666; margin: 1mm 0 2mm; }
  .card svg { max-width: 100%; height: 46px; }
  .card .codigo-num { font-size: 11px; font-weight: 700; letter-spacing: 1px; margin-top: 1mm; }
</style>
</head>
<body>
  <h1>Supermercado Econômia — Catálogo de Produtos (teste de bipe)</h1>
  <div class="meta">${cards.length} etiquetas · gerado em ${new Date().toLocaleString("pt-BR")}</div>
  <div class="grid">
    ${cards.map((c, i) => `
      <div class="card${c.balanca ? " balanca" : ""}">
        <div class="titulo">${c.titulo}</div>
        <div class="sub">${c.sub}</div>
        <svg id="bc${i}"></svg>
        <div class="codigo-num">${c.codigo}</div>
      </div>
    `).join("")}
  </div>
  <script>${jsbarcodeSrc}</script>
  <script>
    ${cards.map((c, i) => `JsBarcode("#bc${i}", ${JSON.stringify(c.codigo)}, { format: "EAN13", width: 2, height: 40, displayValue: false, margin: 0 });`).join("\n")}
  </script>
</body>
</html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  const outPath = join(ROOT, "docs", "Catalogo-Produtos-SupermercadoEconomia.pdf");
  await page.pdf({ path: outPath, format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
  await browser.close();

  console.log("PDF gerado em:", outPath);
};

main().catch((e) => { console.error(e); process.exit(1); });
