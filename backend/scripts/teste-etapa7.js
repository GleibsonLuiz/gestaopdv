// Teste da ETAPA 7: signup publico de tenants.
//
// 1. Sobe o app Express in-process
// 2. POST /tenants/signup cria Empresa X + admin X
// 3. POST /tenants/signup cria Empresa Y + admin Y (CNPJ diferente)
// 4. Valida que ambos recebem JWT com tid diferente
// 5. Faz login em ambos com as credenciais retornadas
// 6. Confirma isolamento: admin X nao ve dados de Y e vice-versa
// 7. Testa validacoes (email duplicado, CNPJ duplicado, campos invalidos)
// 8. Cleanup: deleta Empresa X + Y + seus admins
//
// Rodar com: cd backend && node scripts/teste-etapa7.js

import http from "node:http";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
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
  nomeEmpresa: `Tenant X Teste ${SUFIXO}`,
  cnpj: `11111${SUFIXO}111`.slice(0, 14).padEnd(14, "0"),
  nomeAdmin: "ADMIN X",
  email: `admin-x-${SUFIXO}@teste.local`,
  senha: "senhaX-teste",
};
const TENANT_Y = {
  nomeEmpresa: `Tenant Y Teste ${SUFIXO}`,
  cnpj: `22222${SUFIXO}222`.slice(0, 14).padEnd(14, "0"),
  nomeAdmin: "ADMIN Y",
  email: `admin-y-${SUFIXO}@teste.local`,
  senha: "senhaY-teste",
};

const criados = { empresaX: null, userX: null, empresaY: null, userY: null };

async function cleanup() {
  secao("Cleanup");
  try {
    // produtos criados em testes — apaga via tenantId direto
    for (const empId of [criados.empresaX, criados.empresaY].filter(Boolean)) {
      await prisma.produto.deleteMany({ where: { tenantId: empId } });
    }
    if (criados.userX) {
      await prisma.logAuditoria.updateMany({ where: { usuarioId: criados.userX }, data: { usuarioId: null } });
      await prisma.user.delete({ where: { id: criados.userX } });
      info(`user X removido`);
    }
    if (criados.userY) {
      await prisma.logAuditoria.updateMany({ where: { usuarioId: criados.userY }, data: { usuarioId: null } });
      await prisma.user.delete({ where: { id: criados.userY } });
      info(`user Y removido`);
    }
    if (criados.empresaX) {
      await prisma.logAuditoria.deleteMany({ where: { tenantId: criados.empresaX } });
      await prisma.empresa.delete({ where: { id: criados.empresaX } });
      info(`empresa X removida`);
    }
    if (criados.empresaY) {
      await prisma.logAuditoria.deleteMany({ where: { tenantId: criados.empresaY } });
      await prisma.empresa.delete({ where: { id: criados.empresaY } });
      info(`empresa Y removida`);
    }
    info("✅ Cleanup completo");
  } catch (e) {
    console.error("⚠️  Erro no cleanup:", e.message);
  }
}

async function main() {
  console.log("🆕 Teste ETAPA 7 — Signup publico de tenants\n");

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  info(`Servidor: http://localhost:${server.address().port}`);

  try {
    // ---------- 1. Signup X ----------
    secao("1. POST /tenants/signup — Tenant X");
    const rX = await req(server, {
      method: "POST", path: "/tenants/signup", body: TENANT_X,
    });
    check(rX.status === 201, `status 201 (recebeu ${rX.status})`);
    check(typeof rX.body?.token === "string", `body.token e string`);
    check(typeof rX.body?.empresa?.id === "string", `body.empresa.id existe`);
    check(rX.body?.empresa?.nome === TENANT_X.nomeEmpresa, `empresa.nome bate`);
    check(rX.body?.user?.email === TENANT_X.email.toLowerCase(), `user.email bate (lowercase)`);
    check(rX.body?.user?.role === "ADMIN", `user.role === ADMIN`);
    criados.empresaX = rX.body?.empresa?.id;
    criados.userX = rX.body?.user?.id;
    info(`Empresa X: ${criados.empresaX}`);

    // ---------- 2. Signup Y ----------
    secao("2. POST /tenants/signup — Tenant Y");
    const rY = await req(server, {
      method: "POST", path: "/tenants/signup", body: TENANT_Y,
    });
    check(rY.status === 201, `status 201`);
    check(rY.body?.empresa?.id !== rX.body?.empresa?.id, `empresa Y tem id distinto`);
    criados.empresaY = rY.body?.empresa?.id;
    criados.userY = rY.body?.user?.id;

    // ---------- 3. JWT carrega tid correto ----------
    secao("3. Tokens carregam tid distintos");
    const decX = jwt.decode(rX.body.token);
    const decY = jwt.decode(rY.body.token);
    check(decX?.tid === criados.empresaX, `JWT X.tid === empresaX.id`);
    check(decY?.tid === criados.empresaY, `JWT Y.tid === empresaY.id`);
    check(decX.tid !== decY.tid, `tids diferentes`);

    // ---------- 4. Login imediato com credenciais retornadas ----------
    secao("4. Login imediato com credenciais retornadas");
    const lX = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: TENANT_X.email, senha: TENANT_X.senha },
    });
    check(lX.status === 200, `Login X status 200`);
    check(lX.body?.user?.tenantId === criados.empresaX, `Login X retorna tenant X`);

    const lY = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: TENANT_Y.email, senha: TENANT_Y.senha },
    });
    check(lY.status === 200, `Login Y status 200`);
    check(lY.body?.user?.tenantId === criados.empresaY, `Login Y retorna tenant Y`);

    // ---------- 5. Isolamento: cria produto em X, Y nao ve ----------
    secao("5. Isolamento entre tenants criados via signup");
    const tokenX = lX.body.token;
    const tokenY = lY.body.token;

    const prodX = await req(server, {
      method: "POST", path: "/produtos",
      headers: { Authorization: `Bearer ${tokenX}` },
      body: {
        codigo: `X-${SUFIXO}`,
        nome: "PROD ISOLADO X",
        precoVenda: 10,
        estoque: 1,
      },
    });
    check(prodX.status === 201, `X cria produto -> 201`);

    const listaY = await req(server, {
      method: "GET", path: "/produtos",
      headers: { Authorization: `Bearer ${tokenY}` },
    });
    check(listaY.status === 200, `Y lista produtos -> 200`);
    check(listaY.body?.length === 0, `Y NAO ve produto de X (esperado 0, recebeu ${listaY.body?.length})`);

    // ---------- 6. Validacoes ----------
    secao("6. Validacoes — esperam 4xx");
    const dupEmail = await req(server, {
      method: "POST", path: "/tenants/signup",
      body: { ...TENANT_Y, cnpj: "99999999999998", nomeEmpresa: "outra" },
    });
    check(dupEmail.status === 409, `Email duplicado -> 409 (recebeu ${dupEmail.status})`);

    const dupCnpj = await req(server, {
      method: "POST", path: "/tenants/signup",
      body: { ...TENANT_X, email: `outro-${SUFIXO}@teste.local`, nomeEmpresa: "outra" },
    });
    check(dupCnpj.status === 409, `CNPJ duplicado -> 409 (recebeu ${dupCnpj.status})`);

    const semNome = await req(server, {
      method: "POST", path: "/tenants/signup",
      body: { ...TENANT_X, email: `outroz-${SUFIXO}@teste.local`, cnpj: "33333333333333", nomeEmpresa: "" },
    });
    check(semNome.status === 400, `Sem nomeEmpresa -> 400`);

    const senhaFraca = await req(server, {
      method: "POST", path: "/tenants/signup",
      body: { ...TENANT_X, email: `senhaf-${SUFIXO}@teste.local`, cnpj: "44444444444444", senha: "123" },
    });
    check(senhaFraca.status === 400, `Senha fraca -> 400`);

    const emailInvalido = await req(server, {
      method: "POST", path: "/tenants/signup",
      body: { ...TENANT_X, email: "naoEhUmEmail", cnpj: "55555555555555" },
    });
    check(emailInvalido.status === 400, `Email invalido -> 400`);

    const cnpjInvalido = await req(server, {
      method: "POST", path: "/tenants/signup",
      body: { ...TENANT_X, email: `cnpji-${SUFIXO}@teste.local`, cnpj: "abc123" },
    });
    check(cnpjInvalido.status === 400, `CNPJ invalido -> 400`);

  } finally {
    await new Promise(r => server.close(r));
  }

  await cleanup();

  console.log(`\n${"=".repeat(50)}`);
  console.log(`ETAPA 7: ${ok} ✅  /  ${fail} ❌`);
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
