// Gera o manual completo em PDF a partir de docs/manual-intro.md + docs/MANUAL.md,
// com capa, introducao de redator e as telas reais embutidas (docs/img/*.png).
//
// Uso:  node scripts/gerar-manual-pdf.mjs
// Saida: docs/Manual-GestaoProMax.pdf
//
// Requer: marked (npm i marked) e playwright (ja usado nos screenshots).

import { marked } from "marked";
import { chromium } from "playwright";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS = join(__dirname, "..", "docs");

marked.setOptions({ gfm: true, breaks: false });

// --- conteudo ---
let intro = readFileSync(join(DOCS, "manual-intro.md"), "utf8");
// remove o "# GestaoProMax" inicial (ja aparece na capa) p/ nao duplicar
intro = intro.replace(/^#\s+GestãoProMax\s*\n/, "");
const manual = readFileSync(join(DOCS, "MANUAL.md"), "utf8");

const introHtml = marked.parse(intro);
const manualHtml = marked.parse(manual);

const HOJE = new Date().toLocaleDateString("pt-BR", {
  day: "2-digit", month: "long", year: "numeric",
});

const css = `
  @page { size: A4; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: "Segoe UI", "Inter", system-ui, -apple-system, Arial, sans-serif;
    color: #1f2430; font-size: 11.5px; line-height: 1.62; margin: 0;
  }

  /* ---------- CAPA ---------- */
  .cover {
    height: 247mm; display: flex; flex-direction: column; justify-content: space-between;
    padding: 28mm 22mm; color: #fff; break-after: page;
    background: linear-gradient(150deg, #312e81 0%, #4f46e5 48%, #7c3aed 100%);
    border-radius: 4px;
  }
  .cover .brand { font-size: 15px; letter-spacing: 3px; text-transform: uppercase; opacity: .85; font-weight: 600; }
  .cover .title { font-size: 58px; font-weight: 800; line-height: 1.04; margin: 0; letter-spacing: -1px; }
  .cover .sub { font-size: 20px; font-weight: 600; margin-top: 14px; opacity: .96; }
  .cover .tagline { font-size: 15px; opacity: .82; margin-top: 6px; max-width: 70%; }
  .cover .meta { font-size: 12.5px; opacity: .8; border-top: 1px solid rgba(255,255,255,.28); padding-top: 14px; }
  .cover .dot { display:inline-block; width:8px;height:8px;border-radius:50%;background:#34d399;margin-right:7px;vertical-align:middle; }

  /* ---------- INTRO ---------- */
  .intro { break-after: page; }
  .intro > h2:first-of-type {
    font-size: 25px; color: #312e81; border: 0; margin: 0 0 4px;
    break-before: avoid;
  }
  .intro h3 { color: #4f46e5; font-size: 15px; margin-top: 22px; }
  .intro p { font-size: 12.5px; }
  .intro hr { border: 0; border-top: 1px solid #e6e8ef; margin: 22px 0; }
  .intro ul li { margin: 5px 0; }

  /* ---------- CORPO ---------- */
  h1 { font-size: 26px; color: #312e81; margin: 0 0 6px; break-before: page; break-after: avoid; }
  h2 {
    font-size: 19px; color: #312e81; margin: 26px 0 10px; padding-bottom: 6px;
    border-bottom: 2px solid #e6e8ef; break-before: page; break-after: avoid;
  }
  .intro + * h2:first-child, h1 + h2 { break-before: auto; }
  h3 { font-size: 15px; color: #4f46e5; margin: 20px 0 6px; break-after: avoid; }
  h4 { font-size: 13.5px; color: #1f2430; margin: 16px 0 6px; break-after: avoid; }
  p { margin: 7px 0; }
  a { color: #4f46e5; text-decoration: none; }
  strong { color: #111827; }

  ul, ol { margin: 7px 0; padding-left: 20px; }
  li { margin: 3px 0; }

  blockquote {
    margin: 10px 0; padding: 8px 14px; background: #f5f6fb;
    border-left: 3px solid #7c3aed; color: #3a3f4b; border-radius: 4px;
  }
  blockquote p { margin: 3px 0; }

  code { font-family: "Consolas","SF Mono",monospace; background: #eef0f7; padding: 1px 5px; border-radius: 4px; font-size: 10.5px; }
  pre {
    background: #1e213a; color: #d6d9f0; padding: 12px 14px; border-radius: 8px;
    overflow: hidden; font-size: 9.5px; line-height: 1.4; break-inside: avoid;
  }
  pre code { background: transparent; color: inherit; padding: 0; }

  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10.5px; break-inside: avoid; }
  th, td { border: 1px solid #e0e3ee; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #f0f1f8; color: #312e81; font-weight: 700; }
  tr:nth-child(even) td { background: #fafbfe; }

  img {
    display: block; width: 100%; max-width: 100%; margin: 12px auto 6px;
    border: 1px solid #e0e3ee; border-radius: 8px; break-inside: avoid;
  }
  hr { border: 0; border-top: 1px solid #e6e8ef; margin: 18px 0; }

  h1, h2, h3, h4 { page-break-after: avoid; }
  img, table, pre { page-break-inside: avoid; }
`;

const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><style>${css}</style></head>
<body>
  <section class="cover">
    <div>
      <div class="brand"><span class="dot"></span>GestãoProMax</div>
    </div>
    <div>
      <h1 class="title">Manual<br>Completo</h1>
      <div class="sub">Guia do usuário — do balcão à gestão</div>
      <div class="tagline">O sistema que cuida da loja enquanto você cuida do cliente.</div>
    </div>
    <div class="meta">
      Edição de ${HOJE} &nbsp;·&nbsp; Todas as funcionalidades, com telas reais do sistema<br>
      PDV · Estoque · Financeiro · CRM · Fiscal · Relatórios
    </div>
  </section>

  <section class="intro">${introHtml}</section>

  <main>${manualHtml}</main>
</body></html>`;

const tmp = join(DOCS, "_manual-build.html");
writeFileSync(tmp, html, "utf8");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + tmp.replace(/\\/g, "/"), { waitUntil: "networkidle" });

  const footer = `
    <div style="width:100%;font-size:8px;color:#9aa0b4;padding:0 15mm;
      display:flex;justify-content:space-between;font-family:'Segoe UI',sans-serif;">
      <span>GestãoProMax — Manual Completo</span>
      <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
    </div>`;

  const out = join(DOCS, "Manual-GestaoProMax.pdf");
  await page.pdf({
    path: out,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: footer,
    margin: { top: "14mm", bottom: "16mm", left: "15mm", right: "15mm" },
  });

  await browser.close();
  try { unlinkSync(tmp); } catch {}
  console.log("✔ PDF gerado: docs/Manual-GestaoProMax.pdf");
})();
