// Smoke test pos-ETAPA 1: confirma que o sistema continua respondendo
// normalmente apos a migration + backfill.
//
// Cria user temporario no tenant DEFAULT pra nao depender da senha real.
//
// 1. Sobe o app Express em memoria (sem listen)
// 2. Faz login com user temp
// 3. Lista produtos (autenticado)
// 4. Lista clientes (autenticado)
// 5. Confirma que cada registro retornado tem tenantId = empresa DEFAULT
//
// Roda sem precisar do dev server estar aberto.

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import app from "../src/server.js";

const prisma = new PrismaClient();
const EMAIL_TEMP = "smoke-etapa1-temp@teste.local";
const SENHA_TEMP = "smoke1-teste-5b8d";

async function setupUserTemp() {
  const existing = await prisma.user.findFirst({ where: { email: EMAIL_TEMP } });
  if (existing) return existing;
  // ETAPA 10: pega tenant com mais users (admin pode ter renomeado)
  const tenants = await prisma.empresa.findMany({
    include: { _count: { select: { users: true } } },
  });
  if (tenants.length === 0) throw new Error("Nenhum tenant no banco");
  const tenant = tenants.sort((a, b) => b._count.users - a._count.users)[0];
  const hash = await bcrypt.hash(SENHA_TEMP, 10);
  return prisma.user.create({
    data: {
      nome: "SMOKE1 TEMP ADMIN", email: EMAIL_TEMP, senha: hash,
      role: "ADMIN", ativo: true, tenantId: tenant.id,
    },
  });
}

async function cleanupUserTemp(userId) {
  if (!userId) return;
  await prisma.logAuditoria.updateMany({ where: { usuarioId: userId }, data: { usuarioId: null } });
  await prisma.user.delete({ where: { id: userId } });
}

// Mini-cliente HTTP que usa o app Express via injecao direta
import http from "node:http";

function httpRequest(server, { method, path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: server.address().port,
      method, path,
      headers: { "Content-Type": "application/json", ...headers },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

let ok = 0, fail = 0;
function check(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); ok++; }
  else { console.log(`  ❌ ${msg}`); fail++; }
}

async function main() {
  console.log("🔥 Smoke test pos-ETAPA 1\n");

  const userTemp = await setupUserTemp();
  console.log(`User temp: ${userTemp.email}`);

  // Sobe servidor em porta aleatoria
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  console.log(`Servidor temporario em http://localhost:${server.address().port}\n`);

  try {
    // 1. Health check
    console.log("=== 1. Health check ===");
    const health = await httpRequest(server, { method: "GET", path: "/health" });
    check(health.status === 200, `GET /health -> ${health.status}`);
    check(health.body?.status === "ok", `body.status === "ok"`);

    // 2. Login
    console.log("\n=== 2. Login (user temp) ===");
    const login = await httpRequest(server, {
      method: "POST", path: "/auth/login",
      body: { email: EMAIL_TEMP, senha: SENHA_TEMP },
    });
    check(login.status === 200, `POST /auth/login -> ${login.status}`);
    check(typeof login.body?.token === "string", `recebeu token JWT`);
    const token = login.body?.token;
    if (!token) {
      console.log("  ⚠️  Sem token, abortando proximos checks");
      console.log(`  Resposta: ${JSON.stringify(login.body)}`);
      return;
    }

    // 3. Listar produtos autenticado
    console.log("\n=== 3. Listar produtos (autenticado) ===");
    const produtos = await httpRequest(server, {
      method: "GET", path: "/produtos",
      headers: { Authorization: `Bearer ${token}` },
    });
    check(produtos.status === 200, `GET /produtos -> ${produtos.status}`);
    check(Array.isArray(produtos.body), `body e array`);
    if (Array.isArray(produtos.body)) {
      console.log(`  ℹ️  ${produtos.body.length} produtos retornados`);
    }

    // 4. Listar clientes autenticado
    console.log("\n=== 4. Listar clientes (autenticado) ===");
    const clientes = await httpRequest(server, {
      method: "GET", path: "/clientes",
      headers: { Authorization: `Bearer ${token}` },
    });
    check(clientes.status === 200, `GET /clientes -> ${clientes.status}`);
    check(Array.isArray(clientes.body), `body e array`);
    if (Array.isArray(clientes.body)) {
      console.log(`  ℹ️  ${clientes.body.length} clientes retornados`);
    }

    // 5. Confirmar tenantId nas linhas do banco (sanity). Usa $queryRaw
    // porque tenantId virou NOT NULL na ETAPA 6 e o Prisma rejeita filtros
    // por null em campos NOT NULL.
    console.log("\n=== 5. Sanidade — todos os registros tem tenantId ===");
    const usersSemTenant = (await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS c FROM "users" WHERE "tenantId" IS NULL`
    ))[0]?.c ?? 0;
    check(usersSemTenant === 0, `users sem tenantId: ${usersSemTenant}`);
    const produtosSemTenant = (await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS c FROM "produtos" WHERE "tenantId" IS NULL`
    ))[0]?.c ?? 0;
    check(produtosSemTenant === 0, `produtos sem tenantId: ${produtosSemTenant}`);
    const clientesSemTenant = (await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS c FROM "clientes" WHERE "tenantId" IS NULL`
    ))[0]?.c ?? 0;
    check(clientesSemTenant === 0, `clientes sem tenantId: ${clientesSemTenant}`);
    const empresas = await prisma.empresa.count();
    check(empresas >= 1, `empresas no banco: ${empresas}`);

  } finally {
    await new Promise(resolve => server.close(resolve));
    await cleanupUserTemp(userTemp.id);
    console.log(`\nUser temp removido.`);
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`SMOKE: ${ok} ✅  /  ${fail} ❌`);
  console.log("=".repeat(50));
  process.exit(fail > 0 ? 1 : 0);
}

main()
  .catch(async (e) => {
    console.error("\n❌ Erro:", e);
    try {
      const u = await prisma.user.findFirst({ where: { email: EMAIL_TEMP } });
      if (u) await cleanupUserTemp(u.id);
    } catch {}
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
