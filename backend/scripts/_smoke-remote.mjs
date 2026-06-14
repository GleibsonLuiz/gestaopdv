// Smoke test contra a API de PRODUCAO (Vercel) usando os dados seedados do
// tenant ECONOMIA. Loga como gerente e bate nos endpoints de leitura pesados,
// medindo status/tempo e flagrando 500/timeout/lentidao.
const BASE = process.env.SMOKE_BASE || "https://gestao-pdv-api.vercel.app";
const Q = "dataInicio=2024-06-01&dataFim=2026-06-13&inicio=2024-06-01&fim=2026-06-13&data=2026-06-12&periodo=ano&ano=2025&mes=6";
const HDR = { "X-Device-Id": "smoke", "X-Device-Name": "Smoke Test", "User-Agent": "smoke/1.0" };
let TOKEN = null;
const authHdr = (e = {}) => ({ ...HDR, ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), ...e });

async function req(method, path, body) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}${path}`, { method, headers: authHdr(body ? { "Content-Type": "application/json" } : {}), body: body ? JSON.stringify(body) : undefined });
    const txt = await r.text(); let json = null; try { json = JSON.parse(txt); } catch {}
    return { status: r.status, ms: Date.now() - t0, json, txt };
  } catch (e) { return { status: 0, ms: Date.now() - t0, err: String(e) }; }
}

const results = [];
async function hit(label, method, path, body) {
  const r = await req(method, path, body);
  const ok = r.status >= 200 && r.status < 400;
  results.push({ label, status: r.status, ms: r.ms, ok });
  const flag = (r.status >= 500 || r.status === 0) ? " ❌" : (!ok ? " ⚠️" : (r.ms > 5000 ? " 🐢" : ""));
  const extra = ok ? "" : "  " + (r.err || (r.json ? JSON.stringify(r.json).slice(0, 140) : r.txt?.slice(0, 140)));
  console.log(`${String(r.status).padEnd(3)} ${String(r.ms).padStart(6)}ms  ${label.padEnd(32)}${flag}${extra}`);
  return r;
}

async function main() {
  console.log("BASE:", BASE, "\n");
  const login = await req("POST", "/auth/login", { email: "gerente@economia.local", senha: "economia123" });
  if (login.status !== 200 || !login.json?.token) { console.log("FALHA LOGIN:", login.status, login.txt?.slice(0, 200)); process.exit(1); }
  TOKEN = login.json.token;
  console.log("Login OK (gerente). Testando...\n");

  await hit("auth/me", "GET", "/auth/me");
  const vendas = await hit("vendas (lista)", "GET", `/vendas?${Q}&limit=20`);
  const clientes = await hit("clientes (lista)", "GET", `/clientes?${Q}`);
  const caixas = await hit("caixas (lista)", "GET", `/caixas?${Q}`);
  const produtos = await hit("produtos (lista)", "GET", `/produtos?${Q}`);

  const arr = (r) => Array.isArray(r.json) ? r.json : (r.json?.data || r.json?.itens || r.json?.vendas || r.json?.clientes || r.json?.caixas || r.json?.produtos || []);
  const vId = arr(vendas)[0]?.id;
  const cId = arr(clientes)[0]?.id;
  const kId = (arr(caixas).find((c) => c.status === "FECHADO") || arr(caixas)[0])?.id;
  const pId = arr(produtos)[0]?.id;

  await hit("dashboard/resumo", "GET", `/dashboard/resumo?${Q}`);
  await hit("dashboard/crm", "GET", `/dashboard/crm?${Q}`);

  for (const r of ["vendas","compras","financeiro","estoque","caixas","lucratividade","curva-abc","giro-estoque","sazonalidade","aging-receber","resumo-diario"])
    await hit(`relatorios/${r}`, "GET", `/relatorios/${r}?${Q}`);
  for (const r of ["funil","performance","carteira","nps","atividades","forecast","perdas"])
    await hit(`relatorios/crm/${r}`, "GET", `/relatorios/crm/${r}?${Q}`);

  await hit("contas-receber", "GET", `/contas-receber?${Q}`);
  await hit("contas-pagar", "GET", `/contas-pagar?${Q}`);
  await hit("despesas", "GET", `/despesas?${Q}`);
  await hit("despesas/previsto-realizado", "GET", `/despesas/previsto-realizado?${Q}`);
  await hit("contabilidade/lancamentos", "GET", `/contabilidade/lancamentos?${Q}`);
  await hit("contabilidade/dashboard", "GET", `/contabilidade/dashboard?${Q}`);
  await hit("planos-contas", "GET", `/planos-contas?${Q}`);
  await hit("estoque/movimentacoes", "GET", `/estoque/movimentacoes?${Q}&limit=50`);
  await hit("compras (lista)", "GET", `/compras?${Q}`);
  await hit("sugestoes-compra", "GET", `/sugestoes-compra?${Q}`);
  await hit("inventarios", "GET", `/inventarios?${Q}`);
  await hit("fornecedores", "GET", `/fornecedores?${Q}`);
  await hit("clientes/segmentos", "GET", `/clientes/segmentos?${Q}`);
  await hit("clientes/aniversariantes", "GET", `/clientes/aniversariantes?${Q}`);
  await hit("clientes/reativacao", "GET", `/clientes/reativacao?${Q}`);
  await hit("crediario", "GET", `/crediario?${Q}`);
  await hit("fidelidade/configuracao", "GET", `/fidelidade/configuracao`);
  await hit("caixas/atual", "GET", `/caixas/atual`);

  if (vId) await hit("vendas/:id", "GET", `/vendas/${vId}`);
  if (kId) await hit("caixas/:id/extrato", "GET", `/caixas/${kId}/extrato`);
  if (cId) { await hit("clientes/:id/perfil", "GET", `/clientes/${cId}/perfil`); await hit("clientes/:id/timeline", "GET", `/clientes/${cId}/timeline`); await hit("clientes/:id/score", "GET", `/clientes/${cId}/score`); }
  if (pId) await hit("produtos/:id/compras", "GET", `/produtos/${pId}/compras`);

  const fail = results.filter((r) => r.status >= 500 || r.status === 0);
  const warn = results.filter((r) => !r.ok && r.status < 500 && r.status !== 0);
  const slow = results.filter((r) => r.ms > 5000 && r.ok);
  console.log(`\n== ${results.length} endpoints | ${results.filter((r) => r.ok).length} OK | ${warn.length} 4xx | ${fail.length} 5xx/erro | ${slow.length} lentos(>5s) ==`);
  if (fail.length) console.log("QUEBRADOS:", fail.map((f) => `${f.label}(${f.status})`).join(", "));
  if (warn.length) console.log("4xx:", warn.map((f) => `${f.label}(${f.status})`).join(", "));
  if (slow.length) console.log("LENTOS:", slow.map((f) => `${f.label} ${f.ms}ms`).join(", "));
  console.log("Tempo max:", Math.max(...results.map((r) => r.ms)) + "ms");
}
main().catch((e) => { console.error(e); process.exit(1); });
