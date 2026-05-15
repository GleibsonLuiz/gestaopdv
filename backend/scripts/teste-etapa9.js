// Teste da ETAPA 9: gestao da empresa (GET/PUT /empresa).
//
// 1. Cria 2 tenants via signup (X e Y)
// 2. GET /empresa com token X -> retorna empresa X (com estatisticas)
// 3. GET /empresa com token Y -> retorna empresa Y (isolado)
// 4. PUT /empresa com token X (ADMIN) -> atualiza nome e cnpj
// 5. Confirma que mudanca em X nao afeta Y
// 6. PUT /empresa com user VENDEDOR -> 403 (so ADMIN edita)
// 7. PUT /empresa com cnpj duplicado de outro tenant -> 409
// 8. PUT /empresa com nome vazio -> 400
// 9. Cleanup completo
//
// Rodar com: cd backend && node scripts/teste-etapa9.js

import bcrypt from "bcryptjs";
import http from "node:http";
import { PrismaClient } from "@prisma/client";
import app from "../src/server.js";

const prisma = new PrismaClient();

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
function info(m) { console.log(`  ℹ️  ${m}`); }
function secao(t) { console.log(`\n=== ${t} ===`); }

const SUFIXO = Date.now().toString().slice(-6);
const TENANT_X = {
  nomeEmpresa: `E9 Tenant X ${SUFIXO}`,
  cnpj: `99000${SUFIXO}001`.slice(0, 14).padEnd(14, "0"),
  nomeAdmin: "ADMIN E9 X",
  email: `e9-x-${SUFIXO}@teste.local`,
  senha: "senha-e9-x",
};
const TENANT_Y = {
  nomeEmpresa: `E9 Tenant Y ${SUFIXO}`,
  cnpj: `88000${SUFIXO}002`.slice(0, 14).padEnd(14, "0"),
  nomeAdmin: "ADMIN E9 Y",
  email: `e9-y-${SUFIXO}@teste.local`,
  senha: "senha-e9-y",
};

const criados = {
  empresaX: null, userAdminX: null, userVendX: null,
  empresaY: null, userAdminY: null,
};

async function cleanup() {
  secao("Cleanup");
  try {
    for (const uid of [criados.userAdminX, criados.userVendX, criados.userAdminY].filter(Boolean)) {
      await prisma.logAuditoria.updateMany({ where: { usuarioId: uid }, data: { usuarioId: null } });
      await prisma.user.delete({ where: { id: uid } }).catch(() => {});
    }
    for (const eid of [criados.empresaX, criados.empresaY].filter(Boolean)) {
      await prisma.logAuditoria.deleteMany({ where: { tenantId: eid } });
      await prisma.empresa.delete({ where: { id: eid } }).catch(() => {});
    }
    info("✅ Cleanup completo");
  } catch (e) {
    console.error("⚠️  Erro no cleanup:", e.message);
  }
}

async function main() {
  console.log("🏢 Teste ETAPA 9 — Gestao da empresa (GET/PUT /empresa)\n");

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  info(`Servidor: http://localhost:${server.address().port}`);

  try {
    // ---------- 1. Signup X e Y ----------
    secao("1. Signup de 2 tenants");
    const rX = await req(server, { method: "POST", path: "/tenants/signup", body: TENANT_X });
    check(rX.status === 201, `Signup X -> 201`);
    criados.empresaX = rX.body?.empresa?.id;
    criados.userAdminX = rX.body?.user?.id;
    const tokenAdminX = rX.body.token;

    const rY = await req(server, { method: "POST", path: "/tenants/signup", body: TENANT_Y });
    check(rY.status === 201, `Signup Y -> 201`);
    criados.empresaY = rY.body?.empresa?.id;
    criados.userAdminY = rY.body?.user?.id;
    const tokenAdminY = rY.body.token;

    // ---------- 2. GET /empresa com cada token ----------
    secao("2. GET /empresa isolado por tenant");
    const getX = await req(server, {
      method: "GET", path: "/empresa",
      headers: { Authorization: `Bearer ${tokenAdminX}` },
    });
    check(getX.status === 200, `GET /empresa X -> 200`);
    check(getX.body?.id === criados.empresaX, `GET X retorna empresa X`);
    check(getX.body?.nome === TENANT_X.nomeEmpresa, `nome bate`);
    check(getX.body?.cnpj === TENANT_X.cnpj, `cnpj bate`);
    check(getX.body?.estatisticas?.usuarios === 1, `1 usuario (admin)`);
    check(getX.body?.estatisticas?.clientes === 0, `0 clientes (tenant novo)`);
    check(getX.body?.estatisticas?.produtos === 0, `0 produtos`);
    check(getX.body?.estatisticas?.vendas === 0, `0 vendas`);

    const getY = await req(server, {
      method: "GET", path: "/empresa",
      headers: { Authorization: `Bearer ${tokenAdminY}` },
    });
    check(getY.body?.id === criados.empresaY, `GET Y retorna empresa Y (isolado)`);
    check(getY.body?.id !== getX.body?.id, `IDs distintos`);

    // ---------- 3. PUT /empresa X — atualizar nome ----------
    secao("3. PUT /empresa atualiza nome (admin)");
    const novoNome = `E9 Tenant X RENOMEADO ${SUFIXO}`;
    const putX = await req(server, {
      method: "PUT", path: "/empresa",
      headers: { Authorization: `Bearer ${tokenAdminX}` },
      body: { nome: novoNome },
    });
    check(putX.status === 200, `PUT /empresa X -> 200`);
    check(putX.body?.nome === novoNome, `nome retornado bate`);
    check(putX.body?.cnpj === TENANT_X.cnpj, `cnpj preservado`);

    // Confirma persistencia via GET
    const getX2 = await req(server, {
      method: "GET", path: "/empresa",
      headers: { Authorization: `Bearer ${tokenAdminX}` },
    });
    check(getX2.body?.nome === novoNome, `GET reflete o novo nome`);

    // ---------- 4. Mudanca em X nao afeta Y ----------
    secao("4. Isolamento — Y nao foi afetado");
    const getY2 = await req(server, {
      method: "GET", path: "/empresa",
      headers: { Authorization: `Bearer ${tokenAdminY}` },
    });
    check(getY2.body?.nome === TENANT_Y.nomeEmpresa, `Y mantem seu nome original`);

    // ---------- 5. PUT com VENDEDOR -> 403 ----------
    secao("5. VENDEDOR nao edita empresa");
    // Cria user VENDEDOR no tenant X
    const senhaHash = await bcrypt.hash("vend-e9-x", 10);
    const userVendX = await prisma.user.create({
      data: {
        nome: "VENDEDOR E9 X",
        email: `e9-vend-x-${SUFIXO}@teste.local`,
        senha: senhaHash,
        role: "VENDEDOR",
        ativo: true,
        tenantId: criados.empresaX,
      },
    });
    criados.userVendX = userVendX.id;

    const loginVend = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: userVendX.email, senha: "vend-e9-x" },
    });
    check(loginVend.status === 200, `Login vendedor X -> 200`);
    const tokenVend = loginVend.body.token;

    const putComoVendedor = await req(server, {
      method: "PUT", path: "/empresa",
      headers: { Authorization: `Bearer ${tokenVend}` },
      body: { nome: "TENTATIVA DE HIJACK" },
    });
    check(putComoVendedor.status === 403, `PUT como vendedor -> 403 (recebeu ${putComoVendedor.status})`);

    // Confirma que nada mudou
    const getX3 = await req(server, {
      method: "GET", path: "/empresa",
      headers: { Authorization: `Bearer ${tokenAdminX}` },
    });
    check(getX3.body?.nome === novoNome, `Nome preservado apos tentativa de vendedor`);

    // ---------- 6. PUT com CNPJ duplicado -> 409 ----------
    secao("6. CNPJ duplicado entre tenants");
    const putDupCnpj = await req(server, {
      method: "PUT", path: "/empresa",
      headers: { Authorization: `Bearer ${tokenAdminX}` },
      body: { cnpj: TENANT_Y.cnpj },
    });
    check(putDupCnpj.status === 409, `PUT cnpj duplicado -> 409 (recebeu ${putDupCnpj.status})`);

    // ---------- 7. PUT validacoes ----------
    secao("7. Validacoes");
    const putNomeVazio = await req(server, {
      method: "PUT", path: "/empresa",
      headers: { Authorization: `Bearer ${tokenAdminX}` },
      body: { nome: "" },
    });
    check(putNomeVazio.status === 400, `Nome vazio -> 400`);

    const putNomeCurto = await req(server, {
      method: "PUT", path: "/empresa",
      headers: { Authorization: `Bearer ${tokenAdminX}` },
      body: { nome: "ab" },
    });
    check(putNomeCurto.status === 400, `Nome com 2 chars -> 400`);

    const putCnpjInvalido = await req(server, {
      method: "PUT", path: "/empresa",
      headers: { Authorization: `Bearer ${tokenAdminX}` },
      body: { cnpj: "abc123" },
    });
    check(putCnpjInvalido.status === 400, `CNPJ invalido -> 400`);

    const putVazio = await req(server, {
      method: "PUT", path: "/empresa",
      headers: { Authorization: `Bearer ${tokenAdminX}` },
      body: {},
    });
    check(putVazio.status === 400, `PUT sem campos -> 400`);

    // ---------- 8. PUT com cnpj null (limpa) ----------
    secao("8. PUT cnpj=null limpa CNPJ");
    const putLimpaCnpj = await req(server, {
      method: "PUT", path: "/empresa",
      headers: { Authorization: `Bearer ${tokenAdminX}` },
      body: { cnpj: null },
    });
    check(putLimpaCnpj.status === 200, `PUT cnpj=null -> 200`);
    check(putLimpaCnpj.body?.cnpj === null, `cnpj agora e null`);

    // ---------- 9. GET sem token -> 401 ----------
    secao("9. GET sem token");
    const semToken = await req(server, { method: "GET", path: "/empresa" });
    check(semToken.status === 401, `GET sem auth -> 401`);

  } finally {
    await new Promise(r => server.close(r));
  }

  await cleanup();

  console.log(`\n${"=".repeat(50)}`);
  console.log(`ETAPA 9: ${ok} ✅  /  ${fail} ❌`);
  console.log("=".repeat(50));
  process.exit(fail > 0 ? 1 : 0);
}

main()
  .catch(async (e) => {
    console.error("\n❌ Erro:", e);
    await cleanup();
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
