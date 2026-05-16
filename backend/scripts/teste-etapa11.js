// Teste da ETAPA 11: super-poderes do super-admin.
//
// Cobre:
//   1. Reset remoto de empresa (POST /admin-master/empresas/:id/reset)
//   2. Listar users cross-tenant (GET /admin-master/users)
//   3. Promover/rebaixar super-admin (proteção do ultimo)
//   4. Impersonate (POST /admin-master/impersonate/:userId)
//   5. Logs cross-tenant (GET /admin-master/logs)
//   6. Metricas (GET /admin-master/metricas)
//   7. Suspender com motivo (PATCH com body.motivo) e login bloqueado
//      retorna motivoSuspensao
//
// Cleanup: deleta empresas/users criados.

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
const SENHA_SUPER = "etapa11-super";
const SUPER_EMAIL = `etapa11-super-${SUFIXO}@teste.local`;

const criados = { empresaSuper: null, userSuper: null, empresaA: null, empresaB: null };

async function setup() {
  secao("Setup");
  const empSuper = await prisma.empresa.create({
    data: { nome: `E11 SUPER ${SUFIXO}`, cnpj: `818181${SUFIXO}001`.slice(0, 14).padEnd(14, "0"), ativo: true },
  });
  criados.empresaSuper = empSuper.id;
  const hash = await bcrypt.hash(SENHA_SUPER, 10);
  const userSuper = await prisma.user.create({
    data: {
      nome: "ETAPA 11 SUPER", email: SUPER_EMAIL, senha: hash,
      role: "ADMIN", ativo: true, superAdmin: true, tenantId: empSuper.id,
    },
  });
  criados.userSuper = userSuper.id;
  info(`Super-admin de teste: ${SUPER_EMAIL}`);
}

async function cleanup() {
  secao("Cleanup");
  try {
    for (const eid of [criados.empresaA, criados.empresaB, criados.empresaSuper].filter(Boolean)) {
      await prisma.logAuditoria.deleteMany({ where: { tenantId: eid } });
      await prisma.empresa.delete({ where: { id: eid } }).catch(() => {});
    }
    info("✅ Cleanup completo");
  } catch (e) {
    console.error("⚠️  Erro:", e.message);
  }
}

async function main() {
  console.log("🦸 Teste ETAPA 11 — Super-poderes\n");
  await setup();

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));

  try {
    // Login do super-admin
    const loginSuper = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: SUPER_EMAIL, senha: SENHA_SUPER },
    });
    const tokenSuper = loginSuper.body.token;

    // Cria 2 empresas-cliente via /admin-master/empresas
    secao("1. Criar 2 empresas-cliente A e B");
    const rA = await req(server, {
      method: "POST", path: "/admin-master/empresas",
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: {
        nomeEmpresa: `E11 A ${SUFIXO}`, cnpj: `111000${SUFIXO}011`.slice(0, 14).padEnd(14, "0"),
        nomeAdmin: "Admin A", email: `e11-a-${SUFIXO}@teste.local`, senha: "senha-a",
      },
    });
    check(rA.status === 201, `Empresa A criada -> 201`);
    criados.empresaA = rA.body?.empresa?.id;
    const adminAId = rA.body?.admin?.id;

    const rB = await req(server, {
      method: "POST", path: "/admin-master/empresas",
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: {
        nomeEmpresa: `E11 B ${SUFIXO}`, cnpj: `222000${SUFIXO}022`.slice(0, 14).padEnd(14, "0"),
        nomeAdmin: "Admin B", email: `e11-b-${SUFIXO}@teste.local`, senha: "senha-b",
      },
    });
    check(rB.status === 201, `Empresa B criada -> 201`);
    criados.empresaB = rB.body?.empresa?.id;

    // ---------- 2. Listar users cross-tenant ----------
    secao("2. GET /admin-master/users (cross-tenant)");
    const listaUsers = await req(server, {
      method: "GET", path: "/admin-master/users",
      headers: { Authorization: `Bearer ${tokenSuper}` },
    });
    check(listaUsers.status === 200, `status 200`);
    check(Array.isArray(listaUsers.body?.users), `body.users e array`);
    info(`Total users no sistema: ${listaUsers.body?.total}`);

    const adminA = listaUsers.body.users.find(u => u.id === adminAId);
    check(adminA?.empresaNome?.includes("E11 A"), `Admin A vem com empresaNome`);

    // Com filtro tenantId
    const listaA = await req(server, {
      method: "GET", path: `/admin-master/users?tenantId=${criados.empresaA}`,
      headers: { Authorization: `Bearer ${tokenSuper}` },
    });
    check(listaA.body?.users?.length === 1, `Filtro tenantId=A retorna 1 user (admin)`);

    // ---------- 3. Impersonate ----------
    secao("3. Impersonate admin da Empresa A");
    const imp = await req(server, {
      method: "POST", path: `/admin-master/impersonate/${adminAId}`,
      headers: { Authorization: `Bearer ${tokenSuper}` },
    });
    check(imp.status === 200, `Impersonate -> 200`);
    check(typeof imp.body?.token === "string", `recebeu token`);
    check(imp.body?.impersonadoPor?.id === criados.userSuper,
      `impersonadoPor é o super-admin`);

    const decImp = jwt.decode(imp.body.token);
    check(decImp?.imp === criados.userSuper, `JWT.imp === super-admin id`);
    check(decImp?.sub === adminAId, `JWT.sub === admin A id`);
    check(decImp?.tid === criados.empresaA, `JWT.tid === empresa A`);

    // Tenta usar o token impersonado pra listar produtos (deve funcionar)
    const prodA = await req(server, {
      method: "GET", path: "/produtos",
      headers: { Authorization: `Bearer ${imp.body.token}` },
    });
    check(prodA.status === 200, `Token impersonado consegue listar produtos do tenant A`);

    // ---------- 4. Promover/rebaixar super-admin ----------
    secao("4. Promover admin A a super-admin");
    const promover = await req(server, {
      method: "PATCH", path: `/admin-master/users/${adminAId}/super-admin`,
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: { superAdmin: true },
    });
    check(promover.status === 200, `Promover -> 200`);
    check(promover.body?.superAdmin === true, `superAdmin === true`);

    // Verifica no banco
    const adminAReal = await prisma.user.findUnique({ where: { id: adminAId } });
    check(adminAReal?.superAdmin === true, `Banco refletiu`);

    // Agora rebaixar de volta
    const rebaixar = await req(server, {
      method: "PATCH", path: `/admin-master/users/${adminAId}/super-admin`,
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: { superAdmin: false },
    });
    check(rebaixar.status === 200, `Rebaixar -> 200`);

    // Tentar rebaixar o ULTIMO super-admin (gleibsonluiz) — deve dar 409
    // Mas só vai dar 409 se houver SO 1 super-admin. Como o teste cria 1
    // super-admin de teste, ja temos 2 (gleibsonluiz + criados.userSuper),
    // entao rebaixar 1 nao deveria dar erro. Mas pra cobrir o caso,
    // marcamos o criados.userSuper como nao-super temporariamente.
    secao("5. Proteção: nao pode remover o ULTIMO super-admin");
    // Lista super-admins atuais
    const supersAntes = await prisma.user.count({ where: { superAdmin: true } });
    info(`Super-admins no sistema: ${supersAntes}`);
    if (supersAntes >= 2) {
      // Rebaixa todos exceto o de teste
      const outrosSuper = await prisma.user.findMany({
        where: { superAdmin: true, id: { not: criados.userSuper } },
        select: { id: true, email: true },
      });
      for (const o of outrosSuper) {
        await prisma.user.update({ where: { id: o.id }, data: { superAdmin: false } });
      }
      // Agora SO criados.userSuper e super. Tenta rebaixar
      const tentativaUltimo = await req(server, {
        method: "PATCH", path: `/admin-master/users/${criados.userSuper}/super-admin`,
        headers: { Authorization: `Bearer ${tokenSuper}` },
        body: { superAdmin: false },
      });
      check(tentativaUltimo.status === 409,
        `Rebaixar o ultimo super-admin -> 409 (recebeu ${tentativaUltimo.status})`);
      // Restaura
      for (const o of outrosSuper) {
        await prisma.user.update({ where: { id: o.id }, data: { superAdmin: true } });
      }
    } else {
      info("Pulando — so 1 super-admin no banco");
    }

    // ---------- 6. Suspender com motivo ----------
    secao("6. Suspender empresa B com motivo");
    const susp = await req(server, {
      method: "PATCH", path: `/admin-master/empresas/${criados.empresaB}/status`,
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: { ativo: false, motivo: "Pagamento em atraso desde 10/05" },
    });
    check(susp.status === 200, `Suspender -> 200`);
    check(susp.body?.motivoSuspensao === "Pagamento em atraso desde 10/05",
      `motivoSuspensao retornado`);

    const empB = await prisma.empresa.findUnique({ where: { id: criados.empresaB } });
    check(empB?.ativo === false, `empresa B inativa no banco`);
    check(empB?.motivoSuspensao === "Pagamento em atraso desde 10/05",
      `motivo persistido`);
    check(empB?.suspensaEm !== null, `suspensaEm preenchido`);

    // Login bloqueado retorna motivo
    const loginBloqueado = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: `e11-b-${SUFIXO}@teste.local`, senha: "senha-b" },
    });
    check(loginBloqueado.status === 403, `Login em empresa suspensa -> 403`);
    check(loginBloqueado.body?.motivoSuspensao === "Pagamento em atraso desde 10/05",
      `Body retorna motivoSuspensao`);

    // Reativar
    await req(server, {
      method: "PATCH", path: `/admin-master/empresas/${criados.empresaB}/status`,
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: { ativo: true },
    });

    // ---------- 7. Reset remoto ----------
    secao("7. Reset remoto da empresa A");
    // Popula A primeiro
    const loginA = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: `e11-a-${SUFIXO}@teste.local`, senha: "senha-a" },
    });
    const tokenA = loginA.body.token;
    await req(server, {
      method: "POST", path: "/produtos",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { codigo: `E11A-${SUFIXO}`, nome: "PROD A", precoVenda: 10, estoque: 5 },
    });
    const antesProdutos = await prisma.produto.count({ where: { tenantId: criados.empresaA } });
    check(antesProdutos === 1, `A tem 1 produto antes do reset`);

    const reset = await req(server, {
      method: "POST", path: `/admin-master/empresas/${criados.empresaA}/reset`,
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: { confirmacao: "CONFIRMAR_RESET" },
    });
    check(reset.status === 200, `Reset remoto -> 200`);
    check(reset.body?.removidos?.produtos >= 1, `>= 1 produto removido`);

    const aposProdutos = await prisma.produto.count({ where: { tenantId: criados.empresaA } });
    check(aposProdutos === 0, `A zerou produtos`);

    // Usuario admin de A continua existindo (preservado pelo reset)
    const usersA = await prisma.user.count({ where: { tenantId: criados.empresaA } });
    check(usersA === 1, `Admin A preservado`);

    // Confirmacao errada bloqueia
    const resetErrado = await req(server, {
      method: "POST", path: `/admin-master/empresas/${criados.empresaB}/reset`,
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: { confirmacao: "errado" },
    });
    check(resetErrado.status === 400, `Reset com confirmacao errada -> 400`);

    // ---------- 8. Logs cross-tenant ----------
    secao("8. GET /admin-master/logs com filtros");
    const logsTodos = await req(server, {
      method: "GET", path: "/admin-master/logs?limit=50",
      headers: { Authorization: `Bearer ${tokenSuper}` },
    });
    check(logsTodos.status === 200, `Logs cross-tenant -> 200`);
    check(Array.isArray(logsTodos.body?.logs), `body.logs e array`);
    check(logsTodos.body.logs.length > 0, `Pelo menos 1 log no sistema`);

    const logsImpersonate = await req(server, {
      method: "GET", path: "/admin-master/logs?acao=SUPER_ADMIN_IMPERSONOU",
      headers: { Authorization: `Bearer ${tokenSuper}` },
    });
    check(logsImpersonate.body?.logs?.length >= 1,
      `Filtro acao=SUPER_ADMIN_IMPERSONOU encontra evento`);

    // ---------- 9. Metricas ----------
    secao("9. GET /admin-master/metricas");
    const metricas = await req(server, {
      method: "GET", path: "/admin-master/metricas?diasAtras=30",
      headers: { Authorization: `Bearer ${tokenSuper}` },
    });
    check(metricas.status === 200, `Metricas -> 200`);
    check(Array.isArray(metricas.body?.ranking),
      `body.ranking e array`);
    check(typeof metricas.body?.empresasInativasCount === "number",
      `empresasInativasCount e numero`);
    info(`Janela: ${metricas.body?.janelaDias}d, empresas inativas: ${metricas.body?.empresasInativasCount}`);

  } finally {
    await new Promise(r => server.close(r));
  }

  await cleanup();

  console.log(`\n${"=".repeat(50)}`);
  console.log(`ETAPA 11: ${ok} ✅  /  ${fail} ❌`);
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
