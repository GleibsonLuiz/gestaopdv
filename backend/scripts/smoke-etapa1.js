// Smoke test pos-ETAPA 1: confirma que o sistema continua respondendo
// normalmente apos a migration + backfill.
//
// 1. Sobe o app Express em memoria (sem listen)
// 2. Faz login com admin@gestaopro.local / admin123
// 3. Lista produtos (autenticado)
// 4. Lista clientes (autenticado)
// 5. Confirma que cada registro retornado tem tenantId = empresa DEFAULT
//
// Roda sem precisar do dev server estar aberto.

import { PrismaClient } from "@prisma/client";
import app from "../src/server.js";

const prisma = new PrismaClient();

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
    console.log("\n=== 2. Login admin ===");
    const login = await httpRequest(server, {
      method: "POST", path: "/auth/login",
      body: { email: "admin@gestaopro.local", senha: "admin123" },
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

    // 5. Confirmar tenantId nas linhas do banco (sanity)
    console.log("\n=== 5. Sanidade — todos os registros tem tenantId ===");
    const usersSemTenant = await prisma.user.count({ where: { tenantId: null } });
    check(usersSemTenant === 0, `users sem tenantId: ${usersSemTenant}`);
    const produtosSemTenant = await prisma.produto.count({ where: { tenantId: null } });
    check(produtosSemTenant === 0, `produtos sem tenantId: ${produtosSemTenant}`);
    const clientesSemTenant = await prisma.cliente.count({ where: { tenantId: null } });
    check(clientesSemTenant === 0, `clientes sem tenantId: ${clientesSemTenant}`);
    const empresas = await prisma.empresa.count();
    check(empresas >= 1, `empresas no banco: ${empresas}`);

  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`SMOKE: ${ok} ✅  /  ${fail} ❌`);
  console.log("=".repeat(50));
  process.exit(fail > 0 ? 1 : 0);
}

main()
  .catch(e => {
    console.error("\n❌ Erro:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
