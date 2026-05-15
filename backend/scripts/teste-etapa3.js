// Teste da ETAPA 3 do multi-tenant: isolamento por tenant via middleware
// + Prisma extension.
//
// Estrategia:
//   1. Cria Empresa B + admin B (independente da Empresa DEFAULT existente).
//   2. Loga como admin A (DEFAULT) e admin B em paralelo, obtem 2 tokens.
//   3. Cria 1 produto no tenant A e 1 produto no tenant B via HTTP.
//   4. Lista produtos com cada token:
//        - A nao deve ver produto de B
//        - B nao deve ver produto de A
//   5. A tenta GET /produtos/<id-de-B> -> espera 404
//   6. A tenta PUT /produtos/<id-de-B> -> espera 404
//   7. A tenta DELETE /produtos/<id-de-B> -> espera 404
//   8. Verifica diretamente no banco que o produto de B tem tenantId = B.
//   9. Cleanup: remove tudo que foi criado pelo teste (produtos, user B, Empresa B).
//
// Rodar com: cd backend && node scripts/teste-etapa3.js

import bcrypt from "bcryptjs";
import http from "node:http";
import { PrismaClient } from "@prisma/client";
import app from "../src/server.js";

const prisma = new PrismaClient();

function req(server, { method, path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const r = http.request({
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
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

let ok = 0, fail = 0;
function check(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); ok++; }
  else { console.log(`  ❌ ${msg}`); fail++; }
}
function info(msg) { console.log(`  ℹ️  ${msg}`); }
function secao(t) { console.log(`\n=== ${t} ===`); }

// IDs criados pelo teste — usados no cleanup mesmo se houver falha.
const criados = {
  empresaB: null,
  userB: null,
  produtoA: null,
  produtoB: null,
};

async function cleanup() {
  secao("Cleanup");
  try {
    if (criados.produtoA) {
      // produto pode ter sido criado por tenant A; soft-delete via admin SQL direto
      await prisma.produto.deleteMany({ where: { id: criados.produtoA } });
      info(`produto A removido: ${criados.produtoA}`);
    }
    if (criados.produtoB) {
      await prisma.produto.deleteMany({ where: { id: criados.produtoB } });
      info(`produto B removido: ${criados.produtoB}`);
    }
    if (criados.userB) {
      // Pode ter LogAuditoria referenciando — set null primeiro
      await prisma.logAuditoria.updateMany({
        where: { usuarioId: criados.userB },
        data: { usuarioId: null },
      });
      await prisma.user.delete({ where: { id: criados.userB } });
      info(`user B removido: ${criados.userB}`);
    }
    if (criados.empresaB) {
      // Logs de auditoria criados durante o teste referenciam empresa B via tenantId
      await prisma.logAuditoria.deleteMany({ where: { tenantId: criados.empresaB } });
      await prisma.empresa.delete({ where: { id: criados.empresaB } });
      info(`empresa B removida: ${criados.empresaB}`);
    }
    info("✅ Cleanup completo");
  } catch (e) {
    console.error("⚠️  Erro no cleanup:", e.message);
  }
}

async function main() {
  console.log("🏢 Teste ETAPA 3 — isolamento entre 2 tenants\n");

  // ---------- 0. Preparar Empresa B + admin B ----------
  secao("0. Setup: Empresa B + admin B");
  const empresaB = await prisma.empresa.create({
    data: {
      nome: "Empresa Teste B",
      cnpj: "99999999999999",
      ativo: true,
    },
  });
  criados.empresaB = empresaB.id;
  info(`Empresa B criada: ${empresaB.id}`);

  const senhaHash = await bcrypt.hash("senha123", 10);
  const userB = await prisma.user.create({
    data: {
      nome: "ADMIN TESTE B",
      email: "admin-b@teste.local",
      senha: senhaHash,
      role: "ADMIN",
      ativo: true,
      tenantId: empresaB.id,
    },
  });
  criados.userB = userB.id;
  info(`User B criado: ${userB.id} (${userB.email})`);

  // Buscar Empresa A (DEFAULT) para comparacao
  const empresaA = await prisma.empresa.findUnique({ where: { cnpj: "00000000000000" } });

  // ---------- 1. Sobe servidor ----------
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  info(`Servidor temporario: http://localhost:${server.address().port}`);

  try {
    // ---------- 2. Login dos 2 tenants ----------
    secao("1. Login dos 2 tenants");
    const loginA = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: "admin@gestaopro.local", senha: "admin123" },
    });
    check(loginA.status === 200, `Login A status 200`);
    check(loginA.body?.user?.tenantId === empresaA.id, `Token A tenant = Empresa DEFAULT`);
    const tokenA = loginA.body.token;

    const loginB = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: "admin-b@teste.local", senha: "senha123" },
    });
    check(loginB.status === 200, `Login B status 200`);
    check(loginB.body?.user?.tenantId === empresaB.id, `Token B tenant = Empresa B`);
    const tokenB = loginB.body.token;
    check(tokenA !== tokenB, `Tokens diferentes para cada tenant`);

    if (!tokenA || !tokenB) { console.log("Abortando — sem tokens"); return; }

    // ---------- 3. Listagem inicial (baseline) ----------
    secao("2. Listagem inicial");
    const listaA0 = await req(server, {
      method: "GET", path: "/produtos",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    check(listaA0.status === 200, `GET /produtos (A) status 200`);
    info(`Tenant A ve ${listaA0.body.length} produtos inicialmente`);

    const listaB0 = await req(server, {
      method: "GET", path: "/produtos",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    check(listaB0.status === 200, `GET /produtos (B) status 200`);
    check(listaB0.body.length === 0,
      `Tenant B nao ve produtos de A — esperado 0, recebeu ${listaB0.body.length}`);

    // ---------- 4. A cria um produto ----------
    secao("3. Tenant A cria produto");
    const novoA = await req(server, {
      method: "POST", path: "/produtos",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        codigo: `TESTE-A-${Date.now()}`,
        nome: "PRODUTO TESTE TENANT A",
        precoVenda: 10.00,
        estoque: 5,
      },
    });
    check(novoA.status === 201, `POST /produtos (A) status 201`);
    check(typeof novoA.body?.id === "string", `produto A tem id`);
    criados.produtoA = novoA.body?.id;
    info(`produto A: ${criados.produtoA}`);

    // ---------- 5. B cria um produto ----------
    secao("4. Tenant B cria produto");
    const novoB = await req(server, {
      method: "POST", path: "/produtos",
      headers: { Authorization: `Bearer ${tokenB}` },
      body: {
        codigo: `TESTE-B-${Date.now()}`,
        nome: "PRODUTO TESTE TENANT B",
        precoVenda: 20.00,
        estoque: 3,
      },
    });
    check(novoB.status === 201, `POST /produtos (B) status 201`);
    check(typeof novoB.body?.id === "string", `produto B tem id`);
    criados.produtoB = novoB.body?.id;
    info(`produto B: ${criados.produtoB}`);

    // ---------- 6. Validar que o tenantId foi auto-injetado ----------
    secao("5. Validar tenantId no banco");
    const prodAReal = await prisma.produto.findUnique({ where: { id: criados.produtoA } });
    const prodBReal = await prisma.produto.findUnique({ where: { id: criados.produtoB } });
    check(prodAReal?.tenantId === empresaA.id,
      `produto A no banco tem tenantId = empresaA`);
    check(prodBReal?.tenantId === empresaB.id,
      `produto B no banco tem tenantId = empresaB`);

    // ---------- 7. Isolamento na listagem ----------
    secao("6. Listagem apos creates: isolamento");
    const listaA1 = await req(server, {
      method: "GET", path: "/produtos",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const idsA1 = listaA1.body.map(p => p.id);
    check(idsA1.includes(criados.produtoA),
      `Tenant A ve seu proprio produto`);
    check(!idsA1.includes(criados.produtoB),
      `Tenant A NAO ve produto de B 🛡️`);

    const listaB1 = await req(server, {
      method: "GET", path: "/produtos",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const idsB1 = listaB1.body.map(p => p.id);
    check(idsB1.length === 1,
      `Tenant B ve exatamente 1 produto (so o seu)`);
    check(idsB1.includes(criados.produtoB),
      `Tenant B ve seu proprio produto`);
    check(!idsB1.includes(criados.produtoA),
      `Tenant B NAO ve produto de A 🛡️`);

    // ---------- 8. A tenta acessar produto de B ----------
    secao("7. Tenant A tenta acessar produto de B (esperado 404 em tudo)");
    const getCross = await req(server, {
      method: "GET", path: `/produtos/${criados.produtoB}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    check(getCross.status === 404,
      `GET /produtos/<id-de-B> com token A -> 404 (recebeu ${getCross.status})`);

    const putCross = await req(server, {
      method: "PUT", path: `/produtos/${criados.produtoB}`,
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { nome: "TENTATIVA DE HIJACK" },
    });
    check(putCross.status === 404,
      `PUT /produtos/<id-de-B> com token A -> 404 (recebeu ${putCross.status})`);

    const delCross = await req(server, {
      method: "DELETE", path: `/produtos/${criados.produtoB}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    check(delCross.status === 404,
      `DELETE /produtos/<id-de-B> com token A -> 404 (recebeu ${delCross.status})`);

    // Confirma que produto B continua intacto
    const prodBPos = await prisma.produto.findUnique({ where: { id: criados.produtoB } });
    check(prodBPos?.nome === "PRODUTO TESTE TENANT B",
      `Produto B mantem nome original (nao foi hijacked)`);
    check(prodBPos?.ativo === true,
      `Produto B ainda ativo (nao foi soft-deleted)`);

    // ---------- 9. Cross-tenant em clientes (verifica que extension cobre outros models) ----------
    secao("8. Spot-check em outro modelo: clientes");
    const clientesA = await req(server, {
      method: "GET", path: "/clientes",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const clientesB = await req(server, {
      method: "GET", path: "/clientes",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    check(clientesA.status === 200 && clientesB.status === 200,
      `Listagem de clientes funciona para ambos`);
    check(clientesA.body.length === 7,
      `Tenant A ve 7 clientes (os existentes do backfill)`);
    check(clientesB.body.length === 0,
      `Tenant B ve 0 clientes (esta vazio)`);

  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  // ---------- 10. Cleanup ----------
  await cleanup();

  console.log(`\n${"=".repeat(50)}`);
  console.log(`ETAPA 3: ${ok} ✅  /  ${fail} ❌`);
  console.log("=".repeat(50));
  process.exit(fail > 0 ? 1 : 0);
}

main()
  .catch(async (e) => {
    console.error("\n❌ Erro inesperado:", e);
    await cleanup();
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
