// Teste da ETAPA 10: super-admin (desenvolvedor do sistema).
//
// 1. Super-admin (gleibsonluiz) loga e recebe JWT com claim `sa: true`.
// 2. GET /admin-master/empresas retorna lista de TODOS os tenants
//    (bypass do isolamento de tenant para super-admin).
// 3. GET /admin-master/estatisticas retorna agregados globais.
// 4. POST /admin-master/empresas cria nova empresa + admin inicial.
// 5. PATCH /admin-master/empresas/:id/status ativa/desativa.
// 6. User normal (admin de tenant) tenta /admin-master/* -> 403.
// 7. POST /tenants/signup sem super-admin -> 401 (rota agora exige auth).
//
// Cleanup: deleta a Empresa de teste criada no passo 4.

import bcrypt from "bcryptjs";
import http from "node:http";
import jwt from "jsonwebtoken";
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
const SENHA_SUPER = "super-admin-teste";
const SUPER_EMAIL = `super-admin-${SUFIXO}@teste.local`;
const ADMIN_NORMAL_EMAIL = `admin-normal-${SUFIXO}@teste.local`;
const ADMIN_NORMAL_SENHA = "admin-normal";

const criados = {
  empresaSuper: null, userSuper: null,
  empresaAdmin: null, userAdmin: null,
  empresaNova: null, // criada via /admin-master/empresas
};

async function setup() {
  secao("Setup — criando super-admin e admin normal");
  // Reaproveita uma empresa existente ou cria nova pra abrigar o super-admin
  // de teste. Idempotente.
  const tenantSuperExistente = await prisma.empresa.findFirst({
    where: { cnpj: { startsWith: "888888" } },
  });
  const tenantSuper = tenantSuperExistente || await prisma.empresa.create({
    data: { nome: `Sistema GestaoPRO ${SUFIXO}`, cnpj: `888888${SUFIXO}001`.slice(0, 14).padEnd(14, "0"), ativo: true },
  });
  criados.empresaSuper = tenantSuper.id;

  const senhaHashSuper = await bcrypt.hash(SENHA_SUPER, 10);
  const userSuper = await prisma.user.create({
    data: {
      nome: "DEV SUPER-ADMIN", email: SUPER_EMAIL, senha: senhaHashSuper,
      role: "ADMIN", ativo: true, superAdmin: true, tenantId: tenantSuper.id,
    },
  });
  criados.userSuper = userSuper.id;
  info(`Super-admin: ${SUPER_EMAIL}`);

  // Admin normal em outro tenant — NAO e super-admin
  const tenantAdmin = await prisma.empresa.create({
    data: { nome: `Cliente ${SUFIXO}`, cnpj: `777777${SUFIXO}001`.slice(0, 14).padEnd(14, "0"), ativo: true },
  });
  criados.empresaAdmin = tenantAdmin.id;
  const senhaHashAdmin = await bcrypt.hash(ADMIN_NORMAL_SENHA, 10);
  const userAdmin = await prisma.user.create({
    data: {
      nome: "ADMIN NORMAL", email: ADMIN_NORMAL_EMAIL, senha: senhaHashAdmin,
      role: "ADMIN", ativo: true, superAdmin: false, tenantId: tenantAdmin.id,
    },
  });
  criados.userAdmin = userAdmin.id;
  info(`Admin normal: ${ADMIN_NORMAL_EMAIL}`);
}

async function cleanup() {
  secao("Cleanup");
  try {
    for (const eid of [criados.empresaNova, criados.empresaAdmin, criados.empresaSuper].filter(Boolean)) {
      await prisma.logAuditoria.deleteMany({ where: { tenantId: eid } });
      await prisma.empresa.delete({ where: { id: eid } }).catch(() => {});
    }
    info("✅ Cleanup completo");
  } catch (e) {
    console.error("⚠️  Erro:", e.message);
  }
}

async function main() {
  console.log("🛡️  Teste ETAPA 10 — Super-admin (Admin Master)\n");

  await setup();

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));

  try {
    // ---------- 1. Login do super-admin ----------
    secao("1. Login do super-admin retorna JWT com claim sa=true");
    const loginSuper = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: SUPER_EMAIL, senha: SENHA_SUPER },
    });
    check(loginSuper.status === 200, `Login super-admin -> 200`);
    check(loginSuper.body?.user?.superAdmin === true,
      `body.user.superAdmin === true`);
    const tokenSuper = loginSuper.body?.token;
    const decoded = jwt.decode(tokenSuper);
    check(decoded?.sa === true, `JWT.sa === true`);
    info(`payload: sub=${decoded?.sub?.slice(0, 8)}... sa=${decoded?.sa} tid=${decoded?.tid?.slice(0, 8)}...`);

    // ---------- 2. Login do admin normal NAO tem sa ----------
    secao("2. Admin normal — JWT.sa === false");
    const loginAdmin = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: ADMIN_NORMAL_EMAIL, senha: ADMIN_NORMAL_SENHA },
    });
    check(loginAdmin.status === 200, `Login admin normal -> 200`);
    check(loginAdmin.body?.user?.superAdmin === false,
      `body.user.superAdmin === false`);
    const tokenAdmin = loginAdmin.body?.token;
    const decAdmin = jwt.decode(tokenAdmin);
    check(decAdmin?.sa === false, `JWT.sa === false`);

    // ---------- 3. /admin-master/empresas com super-admin ----------
    secao("3. Super-admin lista TODAS as empresas (cross-tenant)");
    const listaSuper = await req(server, {
      method: "GET", path: "/admin-master/empresas",
      headers: { Authorization: `Bearer ${tokenSuper}` },
    });
    check(listaSuper.status === 200, `GET /admin-master/empresas -> 200`);
    check(Array.isArray(listaSuper.body?.empresas), `body.empresas e array`);
    check(listaSuper.body?.empresas?.length >= 2,
      `Lista tem pelo menos 2 empresas (super + admin) — recebeu ${listaSuper.body?.empresas?.length}`);
    info(`Total empresas no sistema: ${listaSuper.body?.total}`);

    // ---------- 4. /admin-master/estatisticas ----------
    secao("4. Estatisticas globais");
    const est = await req(server, {
      method: "GET", path: "/admin-master/estatisticas",
      headers: { Authorization: `Bearer ${tokenSuper}` },
    });
    check(est.status === 200, `GET /admin-master/estatisticas -> 200`);
    check(typeof est.body?.totalEmpresas === "number",
      `totalEmpresas e numero`);
    check(est.body?.superAdmins >= 1, `superAdmins >= 1 (eu)`);
    info(`empresas=${est.body?.totalEmpresas}, users=${est.body?.totalUsers}, superAdmins=${est.body?.superAdmins}`);

    // ---------- 5. /admin-master/empresas POST cria nova ----------
    secao("5. Super-admin cria nova empresa");
    const novaEmpresa = await req(server, {
      method: "POST", path: "/admin-master/empresas",
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: {
        nomeEmpresa: `Empresa Nova ${SUFIXO}`,
        cnpj: `666666${SUFIXO}001`.slice(0, 14).padEnd(14, "0"),
        nomeAdmin: "ADMIN INICIAL",
        email: `nova-${SUFIXO}@teste.local`,
        senha: "senha-nova-123",
      },
    });
    check(novaEmpresa.status === 201, `POST nova empresa -> 201`);
    check(typeof novaEmpresa.body?.empresa?.id === "string", `body.empresa.id existe`);
    check(typeof novaEmpresa.body?.admin?.email === "string", `body.admin.email existe`);
    criados.empresaNova = novaEmpresa.body?.empresa?.id;

    // Admin novo consegue logar (token funciona)
    const loginNovo = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: `nova-${SUFIXO}@teste.local`, senha: "senha-nova-123" },
    });
    check(loginNovo.status === 200, `Login do admin criado -> 200`);
    check(loginNovo.body?.user?.superAdmin === false,
      `Admin criado NAO e super-admin`);

    // ---------- 6. PATCH status (desativar empresa) ----------
    secao("6. Desativar empresa via PATCH");
    const patch = await req(server, {
      method: "PATCH", path: `/admin-master/empresas/${criados.empresaNova}/status`,
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: { ativo: false },
    });
    check(patch.status === 200, `PATCH status -> 200`);
    check(patch.body?.ativo === false, `body.ativo === false`);

    // Confirma no banco
    const empNoBanco = await prisma.empresa.findUnique({ where: { id: criados.empresaNova } });
    check(empNoBanco?.ativo === false, `Empresa marcada como inativa no banco`);

    // Login do admin nessa empresa agora bate em "Conta indisponivel" (403)
    const loginInativa = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: `nova-${SUFIXO}@teste.local`, senha: "senha-nova-123" },
    });
    check(loginInativa.status === 403,
      `Login no tenant inativo -> 403 (recebeu ${loginInativa.status})`);

    // Reativa pro cleanup
    await req(server, {
      method: "PATCH", path: `/admin-master/empresas/${criados.empresaNova}/status`,
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: { ativo: true },
    });

    // ---------- 7. Admin normal -> 403 em /admin-master/* ----------
    secao("7. Admin normal recebe 403 em /admin-master/*");
    const proibido1 = await req(server, {
      method: "GET", path: "/admin-master/empresas",
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    check(proibido1.status === 403, `GET /admin-master/empresas com token admin -> 403`);

    const proibido2 = await req(server, {
      method: "POST", path: "/admin-master/empresas",
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      body: { nomeEmpresa: "x", nomeAdmin: "x", email: "x@x.com", senha: "123456" },
    });
    check(proibido2.status === 403, `POST /admin-master/empresas com token admin -> 403`);

    // ---------- 8. /tenants/signup blindado ----------
    secao("8. /tenants/signup agora exige autenticacao + super-admin");
    const signupSemAuth = await req(server, {
      method: "POST", path: "/tenants/signup",
      body: { nomeEmpresa: "Hack", nomeAdmin: "X", email: "hack@x.com", senha: "123456" },
    });
    check(signupSemAuth.status === 401,
      `Signup sem token -> 401 (recebeu ${signupSemAuth.status})`);

    const signupAdminNormal = await req(server, {
      method: "POST", path: "/tenants/signup",
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      body: { nomeEmpresa: "Hack", nomeAdmin: "X", email: "hack2@x.com", senha: "123456" },
    });
    check(signupAdminNormal.status === 403,
      `Signup com admin normal -> 403`);

    // Super-admin via signup tambem funciona (rota antiga preservada)
    const signupSuper = await req(server, {
      method: "POST", path: "/tenants/signup",
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: {
        nomeEmpresa: `Via Signup ${SUFIXO}`,
        cnpj: `555555${SUFIXO}001`.slice(0, 14).padEnd(14, "0"),
        nomeAdmin: "ADMIN LEGACY", email: `viasignup-${SUFIXO}@teste.local`, senha: "senha-legacy",
      },
    });
    check(signupSuper.status === 201, `Signup com super-admin -> 201 (rota legacy ainda funciona)`);
    // Adiciona ao cleanup
    if (signupSuper.body?.empresa?.id) {
      await prisma.logAuditoria.deleteMany({ where: { tenantId: signupSuper.body.empresa.id } });
      await prisma.empresa.delete({ where: { id: signupSuper.body.empresa.id } });
    }

  } finally {
    await new Promise(r => server.close(r));
  }

  await cleanup();

  console.log(`\n${"=".repeat(50)}`);
  console.log(`ETAPA 10: ${ok} ✅  /  ${fail} ❌`);
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
