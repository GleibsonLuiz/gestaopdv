// Smoke test rapido do novo endpoint /relatorios/crm/perdas.
// Confirma que:
//   - endpoint retorna 200 com body bem estruturado
//   - shape esperado (resumo, porMotivo, porResponsavel, etc) esta presente
//   - filtros opcionais (period, responsavel, origem, buscaMotivo) sao aceitos
//
// Cria um user temporario de teste (admin-smoke-temp@teste.local) no tenant
// DEFAULT, roda os checks e remove ao final. Nao toca nos users reais.

import bcrypt from "bcryptjs";
import http from "node:http";
import { PrismaClient } from "@prisma/client";
import app from "../src/server.js";

const prisma = new PrismaClient();
const EMAIL_TEMP = "admin-smoke-temp@teste.local";
const SENHA_TEMP = "smoke-teste-9d3f";

function req(server, { method, path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({
      hostname: "127.0.0.1", port: server.address().port,
      method, path,
      headers: { "Content-Type": "application/json", ...headers },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

let ok = 0, fail = 0;
function check(c, m) {
  if (c) { console.log(`  ✅ ${m}`); ok++; }
  else { console.log(`  ❌ ${m}`); fail++; }
}

async function setupUserTemp() {
  // Reaproveita se ja existir (idempotente entre runs falhos)
  const existing = await prisma.user.findFirst({ where: { email: EMAIL_TEMP } });
  if (existing) return existing;
  // Pega o tenant DEFAULT
  // ETAPA 10: pega tenant com mais users (admin pode ter renomeado)
  const tenants = await prisma.empresa.findMany({
    include: { _count: { select: { users: true } } },
  });
  if (tenants.length === 0) throw new Error("Nenhum tenant no banco");
  const tenant = tenants.sort((a, b) => b._count.users - a._count.users)[0];
  const hash = await bcrypt.hash(SENHA_TEMP, 10);
  return prisma.user.create({
    data: {
      nome: "SMOKE TEMP ADMIN",
      email: EMAIL_TEMP,
      senha: hash,
      role: "ADMIN",
      ativo: true,
      permissoes: ["RELATORIOS"],
      tenantId: tenant.id,
    },
  });
}

async function cleanupUserTemp(userId) {
  if (!userId) return;
  // Remove referencias em LogAuditoria primeiro
  await prisma.logAuditoria.updateMany({
    where: { usuarioId: userId },
    data: { usuarioId: null },
  });
  await prisma.user.delete({ where: { id: userId } });
}

async function main() {
  console.log("🧪 Smoke /relatorios/crm/perdas\n");

  const userTemp = await setupUserTemp();
  console.log(`User temp: ${userTemp.email} (${userTemp.id})`);

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));

  try {
    const login = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: EMAIL_TEMP, senha: SENHA_TEMP },
    });
    check(login.status === 200, `Login (user temp) -> 200`);
    const token = login.body?.token;
    if (!token) { console.log("Abortando"); return; }

    // Sem filtros
    console.log("\n=== Sem filtros ===");
    const r1 = await req(server, {
      method: "GET", path: "/relatorios/crm/perdas",
      headers: { Authorization: `Bearer ${token}` },
    });
    check(r1.status === 200, `status 200`);
    const d = r1.body;
    check(typeof d?.resumo === "object", `body.resumo existe`);
    check(typeof d?.resumo?.totalPerdidas === "number", `resumo.totalPerdidas e number`);
    check(typeof d?.resumo?.valorPerdidoTotal === "number", `resumo.valorPerdidoTotal e number`);
    check(typeof d?.resumo?.taxaPerda === "number", `resumo.taxaPerda e number`);
    check(Array.isArray(d?.porMotivo), `porMotivo e array`);
    check(Array.isArray(d?.porResponsavel), `porResponsavel e array`);
    check(Array.isArray(d?.porOrigem), `porOrigem e array`);
    check(Array.isArray(d?.evolucaoMensal), `evolucaoMensal e array`);
    check(Array.isArray(d?.topPerdas), `topPerdas e array`);
    check(typeof d?.cruzamentoMotivoOrigem === "object", `cruzamentoMotivoOrigem e objeto`);
    check(Array.isArray(d?.cruzamentoMotivoOrigem?.motivos), `cruzamento.motivos e array`);
    check(Array.isArray(d?.cruzamentoMotivoOrigem?.origens), `cruzamento.origens e array`);
    check(Array.isArray(d?.cruzamentoMotivoOrigem?.celulas), `cruzamento.celulas e array`);
    check(Array.isArray(d?.oportunidades), `oportunidades e array`);
    console.log(`  ℹ️  Perdidas no banco: ${d?.resumo?.totalPerdidas}`);
    console.log(`  ℹ️  Valor perdido: R$ ${d?.resumo?.valorPerdidoTotal?.toFixed(2) || 0}`);

    // Com filtro de busca por motivo
    console.log("\n=== Com filtro buscaMotivo=preco ===");
    const r2 = await req(server, {
      method: "GET", path: "/relatorios/crm/perdas?buscaMotivo=preco",
      headers: { Authorization: `Bearer ${token}` },
    });
    check(r2.status === 200, `status 200 com filtro`);
    check(r2.body?.filtros?.buscaMotivo === "preco", `filtros.buscaMotivo refletido na resposta`);

    // Com filtro de origem invalida -> tudo zerado mas 200
    console.log("\n=== Com origem inexistente ===");
    const r3 = await req(server, {
      method: "GET", path: "/relatorios/crm/perdas?origem=ZZZZZ",
      headers: { Authorization: `Bearer ${token}` },
    });
    check(r3.status === 200, `status 200 com origem invalida`);
    check(r3.body?.resumo?.totalPerdidas === 0, `0 perdidas com origem invalida`);

  } finally {
    await new Promise(resolve => server.close(resolve));
    await cleanupUserTemp(userTemp.id);
    console.log(`\nUser temp removido.`);
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`SMOKE PERDAS: ${ok} ✅  /  ${fail} ❌`);
  console.log("=".repeat(50));
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    const existing = await prisma.user.findFirst({ where: { email: EMAIL_TEMP } });
    if (existing) await cleanupUserTemp(existing.id);
  } catch {}
  process.exit(1);
}).finally(() => prisma.$disconnect());
