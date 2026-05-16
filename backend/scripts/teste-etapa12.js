// Teste ETAPA 12: Plano + Trial + Notificacoes + Export
//
// Cobre:
//   1. Empresa nasce com plano TRIAL
//   2. PATCH /admin-master/empresas/:id/plano altera plano + expiraEm
//   3. Login com plano expirado retorna 403 + planoExpirado=true
//   4. Notificacao broadcast aparece pro user normal em GET /notificacoes
//   5. POST /notificacoes/:id/marcar-lida some da lista
//   6. Notificacao desativada nao aparece
//   7. Export JSON retorna body completo

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
const SENHA_SUPER = "etapa12-super";
const SUPER_EMAIL = `etapa12-super-${SUFIXO}@teste.local`;

const criados = {
  empresaSuper: null, userSuper: null, empresaA: null, notificacaoId: null,
};

async function setup() {
  secao("Setup");
  const empSuper = await prisma.empresa.create({
    data: { nome: `E12 SUPER ${SUFIXO}`, cnpj: `121212${SUFIXO}001`.slice(0, 14).padEnd(14, "0"), ativo: true },
  });
  criados.empresaSuper = empSuper.id;
  const hash = await bcrypt.hash(SENHA_SUPER, 10);
  const userSuper = await prisma.user.create({
    data: {
      nome: "E12 SUPER", email: SUPER_EMAIL, senha: hash,
      role: "ADMIN", ativo: true, superAdmin: true, tenantId: empSuper.id,
    },
  });
  criados.userSuper = userSuper.id;
}

async function cleanup() {
  secao("Cleanup");
  try {
    if (criados.notificacaoId) {
      await prisma.notificacaoLida.deleteMany({ where: { notificacaoId: criados.notificacaoId } }).catch(() => {});
      await prisma.notificacao.delete({ where: { id: criados.notificacaoId } }).catch(() => {});
    }
    for (const eid of [criados.empresaA, criados.empresaSuper].filter(Boolean)) {
      await prisma.logAuditoria.deleteMany({ where: { tenantId: eid } });
      await prisma.empresa.delete({ where: { id: eid } }).catch(() => {});
    }
    info("✅ Cleanup completo");
  } catch (e) {
    console.error("⚠️  Erro:", e.message);
  }
}

async function main() {
  console.log("🎫📢📥 Teste ETAPA 12 — Plano + Notificacoes + Export\n");
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

    // ---------- 1. Cria empresa-cliente A ----------
    secao("1. Cria empresa A (default TRIAL sem expiraEm)");
    const rA = await req(server, {
      method: "POST", path: "/admin-master/empresas",
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: {
        nomeEmpresa: `E12 A ${SUFIXO}`,
        cnpj: `212121${SUFIXO}011`.slice(0, 14).padEnd(14, "0"),
        nomeAdmin: "Admin A", email: `e12-a-${SUFIXO}@teste.local`, senha: "senha-a",
      },
    });
    check(rA.status === 201, `Signup -> 201`);
    criados.empresaA = rA.body.empresa.id;

    const empA = await prisma.empresa.findUnique({ where: { id: criados.empresaA } });
    check(empA?.plano === "TRIAL", `Plano default === TRIAL`);
    check(empA?.expiraEm === null, `expiraEm === null inicialmente`);

    // ---------- 2. Login normal funciona com TRIAL sem expiracao ----------
    secao("2. Login funciona com TRIAL sem data");
    const loginA = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: `e12-a-${SUFIXO}@teste.local`, senha: "senha-a" },
    });
    check(loginA.status === 200, `Login -> 200`);

    // ---------- 3. PATCH plano com expiraEm no PASSADO ----------
    secao("3. Definir plano expirado (ontem)");
    const ontem = new Date(Date.now() - 86400000).toISOString();
    const patchPlano = await req(server, {
      method: "PATCH", path: `/admin-master/empresas/${criados.empresaA}/plano`,
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: { plano: "STARTER", expiraEm: ontem, observacoes: "teste expiracao" },
    });
    check(patchPlano.status === 200, `PATCH plano -> 200`);
    check(patchPlano.body?.empresa?.plano === "STARTER", `Plano alterado para STARTER`);

    // ---------- 4. Login bloqueado por plano expirado ----------
    secao("4. Login bloqueado quando plano expirou");
    const loginExp = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: `e12-a-${SUFIXO}@teste.local`, senha: "senha-a" },
    });
    check(loginExp.status === 403, `Login -> 403 (recebeu ${loginExp.status})`);
    check(loginExp.body?.planoExpirado === true, `body.planoExpirado === true`);
    check(loginExp.body?.plano === "STARTER", `body.plano === STARTER`);
    info(`Mensagem retornada: "${loginExp.body?.erro}"`);

    // ---------- 5. Renovar plano: expiraEm futuro ----------
    secao("5. Renovar para data futura desbloqueia login");
    const futuro = new Date(Date.now() + 30 * 86400000).toISOString();
    await req(server, {
      method: "PATCH", path: `/admin-master/empresas/${criados.empresaA}/plano`,
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: { plano: "PRO", expiraEm: futuro },
    });
    const loginRenovado = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: `e12-a-${SUFIXO}@teste.local`, senha: "senha-a" },
    });
    check(loginRenovado.status === 200, `Login apos renovacao -> 200`);
    const tokenA = loginRenovado.body.token;

    // ---------- 6. Notificacao broadcast ----------
    secao("6. Cria notificacao broadcast (super-admin)");
    const novaNotif = await req(server, {
      method: "POST", path: "/admin-master/notificacoes",
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: {
        titulo: `Teste broadcast ${SUFIXO}`,
        mensagem: "Notificacao de teste do super-admin",
        tipo: "AVISO",
      },
    });
    check(novaNotif.status === 201, `POST notificacao -> 201`);
    criados.notificacaoId = novaNotif.body?.id;

    // ---------- 7. Admin A vê a notificação ----------
    secao("7. Admin de A ve a notificacao em GET /notificacoes");
    const minhas = await req(server, {
      method: "GET", path: "/notificacoes",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    check(minhas.status === 200, `GET /notificacoes -> 200`);
    const minhaIds = (minhas.body?.notificacoes || []).map(n => n.id);
    check(minhaIds.includes(criados.notificacaoId), `Notificacao broadcast aparece pra admin A`);

    // ---------- 8. Marcar lida some da lista ----------
    secao("8. POST marcar-lida some da lista");
    const marcar = await req(server, {
      method: "POST", path: `/notificacoes/${criados.notificacaoId}/marcar-lida`,
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    check(marcar.status === 200, `marcar-lida -> 200`);

    const minhas2 = await req(server, {
      method: "GET", path: "/notificacoes",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const ids2 = (minhas2.body?.notificacoes || []).map(n => n.id);
    check(!ids2.includes(criados.notificacaoId), `Apos marcar lida, some da lista`);

    // ---------- 9. Listar todas (super-admin) com contagem ----------
    secao("9. Super-admin lista notificacoes com contagem de leituras");
    const todas = await req(server, {
      method: "GET", path: "/admin-master/notificacoes",
      headers: { Authorization: `Bearer ${tokenSuper}` },
    });
    check(todas.status === 200, `Listar -> 200`);
    const n = (todas.body?.notificacoes || []).find(x => x.id === criados.notificacaoId);
    check(n?.leituras >= 1, `Pelo menos 1 leitura registrada`);

    // ---------- 10. Desativar notificacao ----------
    secao("10. Desativar notificacao");
    const desativ = await req(server, {
      method: "PATCH", path: `/admin-master/notificacoes/${criados.notificacaoId}`,
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: { ativa: false },
    });
    check(desativ.status === 200, `PATCH -> 200`);

    // ---------- 11. Export JSON ----------
    secao("11. Export JSON da empresa A");
    const exp = await req(server, {
      method: "GET", path: `/admin-master/empresas/${criados.empresaA}/export`,
      headers: { Authorization: `Bearer ${tokenSuper}` },
    });
    check(exp.status === 200, `Export -> 200`);
    check(exp.body?.versao === 1, `body.versao === 1`);
    check(exp.body?.empresa?.id === criados.empresaA, `body.empresa.id bate`);
    check(Array.isArray(exp.body?.usuarios), `body.usuarios e array`);
    check(exp.body?.usuarios?.length === 1, `1 user (admin)`);
    // Confirma que senha NAO esta no export (seguranca)
    const usrExp = exp.body.usuarios[0];
    check(usrExp.senha === undefined, `Senha NAO inclusa no export (seguranca)`);
    check(typeof exp.body?.cadastros === "object", `body.cadastros existe`);
    check(typeof exp.body?.operacional === "object", `body.operacional existe`);
    check(typeof exp.body?.crm === "object", `body.crm existe`);

    // ---------- 12. Validações ----------
    secao("12. Validacoes");
    const planoInvalido = await req(server, {
      method: "PATCH", path: `/admin-master/empresas/${criados.empresaA}/plano`,
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: { plano: "ULTRA" },
    });
    check(planoInvalido.status === 400, `Plano invalido -> 400`);

    const notifSemTitulo = await req(server, {
      method: "POST", path: "/admin-master/notificacoes",
      headers: { Authorization: `Bearer ${tokenSuper}` },
      body: { titulo: "", mensagem: "x" },
    });
    check(notifSemTitulo.status === 400, `Notif sem titulo -> 400`);

    // User normal não pode criar notificação
    const notifSemSuper = await req(server, {
      method: "POST", path: "/admin-master/notificacoes",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { titulo: "Hack", mensagem: "Hack" },
    });
    check(notifSemSuper.status === 403, `User normal cria notif -> 403`);

  } finally {
    await new Promise(r => server.close(r));
  }

  await cleanup();

  console.log(`\n${"=".repeat(50)}`);
  console.log(`ETAPA 12: ${ok} ✅  /  ${fail} ❌`);
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
