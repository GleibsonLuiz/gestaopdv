// Gera cartões de título (PNG 1440x900) para o tutorial combinado.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "docs/video/_titles";
mkdirSync(OUT, { recursive: true });

const CARDS = [
  { f: "00-intro",   n: "",  titulo: "GestãoPRO", sub: "Tutorial — Primeiros Passos", pe: "Sistema de Gestão + PDV" },
  { f: "01-venda",   n: "1", titulo: "Venda no PDV", sub: "Registrar uma venda no balcão", pe: "" },
  { f: "02-fiado",   n: "2", titulo: "Venda no Fiado", sub: "Crediário · caderneta do cliente", pe: "" },
  { f: "03-produto", n: "3", titulo: "Cadastrar Produto", sub: "Incluir um novo item no catálogo", pe: "" },
  { f: "04-caixa",   n: "4", titulo: "Abrir e Fechar o Caixa", sub: "Controle do dinheiro físico", pe: "" },
  { f: "99-fim",     n: "",  titulo: "Bons negócios! 🚀", sub: "GestãoPRO", pe: "" },
];

const html = (c) => `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box;font-family:system-ui,'Segoe UI',Roboto,sans-serif}
  body{width:1440px;height:900px;display:flex;flex-direction:column;align-items:center;justify-content:center;
    background:radial-gradient(1200px 700px at 50% 35%, #1b2a4a 0%, #0b1220 60%, #070b14 100%);color:#fff;overflow:hidden}
  .badge{width:96px;height:96px;border-radius:50%;background:linear-gradient(135deg,#4f8ef7,#8b5cf6);
    display:${c.n ? "flex" : "none"};align-items:center;justify-content:center;font-size:46px;font-weight:800;
    box-shadow:0 14px 50px rgba(79,142,247,.5);margin-bottom:34px}
  .brand{display:${c.n ? "none" : "flex"};align-items:center;gap:14px;margin-bottom:30px}
  .brand .sq{width:60px;height:60px;border-radius:16px;background:linear-gradient(135deg,#4f8ef7,#8b5cf6);
    display:flex;align-items:center;justify-content:center;font-size:30px;box-shadow:0 12px 40px rgba(79,142,247,.5)}
  h1{font-size:64px;font-weight:800;letter-spacing:-1px;text-align:center;padding:0 60px}
  .sub{font-size:28px;color:#9fb3d1;margin-top:18px;font-weight:500;text-align:center}
  .pe{font-size:18px;color:#5b6b86;margin-top:40px;letter-spacing:3px;text-transform:uppercase}
  .bar{width:120px;height:5px;border-radius:3px;background:linear-gradient(90deg,#4f8ef7,#8b5cf6);margin-top:34px}
</style></head><body>
  <div class="badge">${c.n}</div>
  <div class="brand"><div class="sq">📊</div></div>
  <h1>${c.titulo}</h1>
  <div class="sub">${c.sub}</div>
  <div class="bar"></div>
  ${c.pe ? `<div class="pe">${c.pe}</div>` : ""}
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
for (const c of CARDS) {
  await page.setContent(html(c), { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/${c.f}.png` });
  console.log("  ✔", c.f);
}
await browser.close();
