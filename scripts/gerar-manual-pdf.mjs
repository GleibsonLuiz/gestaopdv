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
  /* Paleta OURO (padrao da marca GestaoProMax)
     deep   #7a5e16  (titulos, legivel no branco)
     gold   #b8862b  (realces / regras)
     accent #9a7a1c  (links)
     bright #f6e3a3  (brilho do ouro na capa escura)
     line   #e7d9a8  (bordas claras douradas) */
  @page { size: A4; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: "Segoe UI", "Inter", system-ui, -apple-system, Arial, sans-serif;
    color: #211c12; font-size: 11.5px; line-height: 1.62; margin: 0;
  }

  /* ---------- CAPA ---------- */
  .cover {
    height: 250mm; display: flex; flex-direction: column; justify-content: space-between;
    padding: 26mm 22mm; color: #efe2b8; break-after: page; break-inside: avoid;
    background: linear-gradient(150deg, #14110a 0%, #2c2410 52%, #4a3c16 100%);
    border: 1px solid #6b551d; border-radius: 4px;
  }
  .cover .brand { font-size: 15px; letter-spacing: 3px; text-transform: uppercase; font-weight: 600; color: #e6d39a; }
  .cover .title {
    font-size: 58px; font-weight: 800; line-height: 1.04; margin: 0; letter-spacing: -1px;
    background: linear-gradient(92deg, #f9edbf 0%, #e3c264 42%, #b8862b 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .cover .sub { font-size: 20px; font-weight: 600; margin-top: 14px; color: #f1e4ba; }
  .cover .tagline { font-size: 15px; color: #d8c690; margin-top: 6px; max-width: 70%; }
  .cover .rule { height: 2px; width: 120px; margin: 4px 0 0; border: 0;
    background: linear-gradient(90deg, #c9a227, #f6e3a3, transparent); }
  .cover .meta { font-size: 12.5px; color: #cbb978; border-top: 1px solid rgba(230,210,150,.32); padding-top: 14px; }
  .cover .dot { display:inline-block; width:8px;height:8px;border-radius:50%;background:#e9c46a;margin-right:7px;vertical-align:middle; }

  /* ---------- INTRO ---------- */
  .intro { break-after: page; }
  .intro > h2:first-of-type {
    font-size: 25px; color: #7a5e16; border: 0; margin: 0 0 4px;
  }
  .intro h3 { color: #9a7a1c; font-size: 15px; margin-top: 22px; }
  .intro p { font-size: 12.5px; }
  .intro hr { border: 0; border-top: 1px solid #ece0bd; margin: 22px 0; }
  .intro ul li { margin: 5px 0; }

  /* ---------- CORPO ---------- */
  h1 { font-size: 26px; color: #7a5e16; margin: 0 0 6px; break-after: avoid; }
  h2 {
    font-size: 19px; color: #7a5e16; margin: 26px 0 10px; padding-bottom: 6px;
    border-bottom: 2px solid #e7d9a8; break-after: avoid;
  }
  /* quebras de pagina SO no corpo do manual — nunca na capa/intro */
  main h1, main h2 { break-before: page; }
  main h1 + h2 { break-before: avoid; }
  .cover .title, .intro h2 { break-before: avoid; }
  h3 { font-size: 15px; color: #9a7a1c; margin: 20px 0 6px; break-after: avoid; }
  h4 { font-size: 13.5px; color: #5a4a1a; margin: 16px 0 6px; break-after: avoid; }
  p { margin: 7px 0; }
  a { color: #9a7a1c; text-decoration: none; }
  strong { color: #2b2310; }

  ul, ol { margin: 7px 0; padding-left: 20px; }
  li { margin: 3px 0; }
  ul li::marker { color: #b8862b; }

  blockquote {
    margin: 10px 0; padding: 8px 14px; background: #faf5e6;
    border-left: 3px solid #c9a227; color: #4a4129; border-radius: 4px;
  }
  blockquote p { margin: 3px 0; }

  code { font-family: "Consolas","SF Mono",monospace; background: #f3ead0; color: #6b5418; padding: 1px 5px; border-radius: 4px; font-size: 10.5px; }
  pre {
    background: #221c0d; color: #e8dcb0; padding: 12px 14px; border-radius: 8px;
    overflow: hidden; font-size: 9.5px; line-height: 1.4; break-inside: avoid;
  }
  pre code { background: transparent; color: inherit; padding: 0; }

  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10.5px; break-inside: avoid; }
  th, td { border: 1px solid #e8dcb4; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #f7efd6; color: #7a5e16; font-weight: 700; }
  tr:nth-child(even) td { background: #fbf7ea; }

  img {
    display: block; width: 100%; max-width: 100%; margin: 12px auto 6px;
    border: 1px solid #e6d9b0; border-radius: 8px; break-inside: avoid;
  }
  hr { border: 0; border-top: 1px solid #ece0bd; margin: 18px 0; }

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
      <hr class="rule">
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
    <div style="width:100%;font-size:8px;color:#a98f3f;padding:0 15mm;
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
