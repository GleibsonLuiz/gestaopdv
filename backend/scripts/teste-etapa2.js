// Teste da ETAPA 2 do multi-tenant: JWT com tenantId no payload.
//
// Cria um user temporario (admin-etapa2-temp) no tenant DEFAULT para nao
// depender da senha real do admin@gestaopro.local. Remove no final.
//
// 1. Sobe o app Express in-process
// 2. POST /auth/login com user temp
// 3. Decodifica o JWT
// 4. Verifica que o campo `tid` existe e bate com a Empresa DEFAULT
// 5. Verifica signature com JWT_SECRET
// 6. Chama /auth/me e confirma que retorna tenantId + empresa
//
// Rodar com: cd backend && node scripts/teste-etapa2.js

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import http from "node:http";
import app from "../src/server.js";

const prisma = new PrismaClient();
const EMAIL_TEMP = "admin-etapa2-temp@teste.local";
const SENHA_TEMP = "etapa2-teste-7a2c";

async function setupUserTemp() {
  const existing = await prisma.user.findFirst({ where: { email: EMAIL_TEMP } });
  if (existing) return existing;
  const tenant = await prisma.empresa.findUnique({ where: { cnpj: "00000000000000" } });
  if (!tenant) throw new Error("Empresa DEFAULT nao encontrada");
  const hash = await bcrypt.hash(SENHA_TEMP, 10);
  return prisma.user.create({
    data: {
      nome: "ETAPA2 TEMP ADMIN", email: EMAIL_TEMP, senha: hash,
      role: "ADMIN", ativo: true, tenantId: tenant.id,
    },
  });
}

async function cleanupUserTemp(userId) {
  if (!userId) return;
  await prisma.logAuditoria.updateMany({
    where: { usuarioId: userId },
    data: { usuarioId: null },
  });
  await prisma.user.delete({ where: { id: userId } });
}

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
  console.log("🔐 Teste ETAPA 2 — JWT com tenantId\n");

  // ---------- 0. Buscar Empresa DEFAULT + criar user temp ----------
  console.log("=== 0. Empresa DEFAULT no banco ===");
  const empresaDefault = await prisma.empresa.findUnique({
    where: { cnpj: "00000000000000" },
  });
  check(empresaDefault !== null, `Empresa DEFAULT existe`);
  if (empresaDefault) {
    console.log(`  ℹ️  id: ${empresaDefault.id}`);
    console.log(`  ℹ️  nome: ${empresaDefault.nome}`);
  }
  const userTemp = await setupUserTemp();
  console.log(`  ℹ️  User temp: ${userTemp.email}`);

  // ---------- 1. Sobe servidor ----------
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  console.log(`\nServidor temporario: http://localhost:${server.address().port}\n`);

  try {
    // ---------- 2. Login ----------
    console.log("=== 1. POST /auth/login ===");
    const r = await httpRequest(server, {
      method: "POST", path: "/auth/login",
      body: { email: EMAIL_TEMP, senha: SENHA_TEMP },
    });
    check(r.status === 200, `status 200`);
    check(typeof r.body?.token === "string", `body.token e string`);
    check(typeof r.body?.user === "object", `body.user e objeto`);
    check(typeof r.body?.empresa === "object", `body.empresa e objeto`);
    if (r.body?.empresa) {
      check(r.body.empresa.id === empresaDefault?.id,
        `body.empresa.id === Empresa DEFAULT (${r.body.empresa.id})`);
      check(r.body.empresa.nome === empresaDefault?.nome,
        `body.empresa.nome === "${r.body.empresa.nome}"`);
    }
    check(r.body?.user?.tenantId === empresaDefault?.id,
      `body.user.tenantId === Empresa DEFAULT`);

    if (!r.body?.token) {
      console.log(`\n  Resposta completa: ${JSON.stringify(r.body, null, 2)}`);
      return;
    }
    const token = r.body.token;

    // ---------- 3. Decodificar o JWT (so pra ler, sem verificar) ----------
    console.log("\n=== 2. Decodificacao do JWT ===");
    const decoded = jwt.decode(token, { complete: true });
    check(decoded !== null, `JWT decodificado com sucesso`);
    if (decoded) {
      console.log("\n  Header:");
      console.log(`    ${JSON.stringify(decoded.header)}`);
      console.log("\n  Payload:");
      console.log(`    ${JSON.stringify(decoded.payload, null, 2).split("\n").join("\n    ")}`);
      console.log();
    }
    const payload = decoded?.payload;
    check(typeof payload?.sub === "string", `payload.sub (user id) existe`);
    check(typeof payload?.role === "string", `payload.role existe`);
    check(typeof payload?.nome === "string", `payload.nome existe`);
    check(typeof payload?.tid === "string", `payload.tid (tenant id) existe ✨`);
    check(payload?.tid === empresaDefault?.id,
      `payload.tid === Empresa DEFAULT id`);
    check(typeof payload?.iat === "number", `payload.iat (issued at) existe`);
    check(typeof payload?.exp === "number", `payload.exp (expira em) existe`);

    // ---------- 4. Verificar signature com JWT_SECRET ----------
    console.log("\n=== 3. Verificacao da signature ===");
    try {
      const verificado = jwt.verify(token, process.env.JWT_SECRET);
      check(true, `jwt.verify passou com JWT_SECRET do .env`);
      check(verificado.tid === empresaDefault?.id, `tid no payload verificado bate`);
    } catch (e) {
      check(false, `jwt.verify falhou: ${e.message}`);
    }

    // ---------- 5. Chamar /auth/me com o token ----------
    console.log("\n=== 4. GET /auth/me (autenticado) ===");
    const meResp = await httpRequest(server, {
      method: "GET", path: "/auth/me",
      headers: { Authorization: `Bearer ${token}` },
    });
    check(meResp.status === 200, `status 200`);
    check(meResp.body?.tenantId === empresaDefault?.id,
      `body.tenantId === Empresa DEFAULT`);
    check(typeof meResp.body?.empresa === "object",
      `body.empresa e objeto`);
    if (meResp.body?.empresa) {
      check(meResp.body.empresa.nome === empresaDefault?.nome,
        `body.empresa.nome === "${meResp.body.empresa.nome}"`);
    }

  } finally {
    await new Promise(resolve => server.close(resolve));
    await cleanupUserTemp(userTemp.id);
    console.log(`\nUser temp removido.`);
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`ETAPA 2: ${ok} ✅  /  ${fail} ❌`);
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
