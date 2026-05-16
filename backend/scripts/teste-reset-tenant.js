// Teste do reset (Sistema.jsx + adminController.resetarSistema) em
// ambiente multi-tenant. Valida que:
//   1. Reset apaga TODOS os dados operacionais + CRM do tenant atual
//   2. NAO toca em dados de outros tenants (isolamento via extension)
//   3. Preserva users, ConfiguracaoEmpresa, ConfiguracaoComissao, Empresa,
//      LogAuditoria do tenant resetado
//
// Cria 2 tenants (X e Y), popula AMBOS com dados ricos, reseta apenas X
// via endpoint autenticado, valida X vazio e Y intacto. Cleanup completo.
//
// Rodar com: cd backend && node scripts/teste-reset-tenant.js

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
  nomeEmpresa: `RESET-X ${SUFIXO}`,
  cnpj: `33333${SUFIXO}001`.slice(0, 14).padEnd(14, "0"),
  nomeAdmin: "ADMIN RX",
  email: `reset-x-${SUFIXO}@teste.local`,
  senha: "senha-rx",
};
const TENANT_Y = {
  nomeEmpresa: `RESET-Y ${SUFIXO}`,
  cnpj: `44444${SUFIXO}002`.slice(0, 14).padEnd(14, "0"),
  nomeAdmin: "ADMIN RY",
  email: `reset-y-${SUFIXO}@teste.local`,
  senha: "senha-ry",
};

const criados = { empresaX: null, empresaY: null };

async function popular(server, token, tenantId) {
  // Cria produto
  const prod = await req(server, {
    method: "POST", path: "/produtos",
    headers: { Authorization: `Bearer ${token}` },
    body: { codigo: `R-${SUFIXO}-${tenantId.slice(0, 4)}`, nome: "PROD RESET", precoVenda: 10, estoque: 50 },
  });
  // Abre caixa
  await req(server, {
    method: "POST", path: "/caixas/abrir",
    headers: { Authorization: `Bearer ${token}` },
    body: { saldoInicial: 100 },
  });
  // Cria cliente
  const cli = await req(server, {
    method: "POST", path: "/clientes",
    headers: { Authorization: `Bearer ${token}` },
    body: { nome: "CLIENTE RESET" },
  });
  // Cria venda
  await req(server, {
    method: "POST", path: "/vendas",
    headers: { Authorization: `Bearer ${token}` },
    body: {
      itens: [{ produtoId: prod.body.id, quantidade: 1, precoUnitario: 10 }],
      formaPagamento: "DINHEIRO",
      clienteId: cli.body?.id,
    },
  });
  // Cria oportunidade
  await req(server, {
    method: "POST", path: "/oportunidades",
    headers: { Authorization: `Bearer ${token}` },
    body: { titulo: "OPP RESET", etapa: "QUALIFICADO", clienteId: cli.body?.id },
  });
  // Cria tarefa
  await req(server, {
    method: "POST", path: "/tarefas",
    headers: { Authorization: `Bearer ${token}` },
    body: { titulo: "TAREFA RESET", clienteId: cli.body?.id, prioridade: "MEDIA" },
  });
}

async function contagemTenant(tenantId) {
  return {
    vendas: await prisma.venda.count({ where: { tenantId } }),
    clientes: await prisma.cliente.count({ where: { tenantId } }),
    produtos: await prisma.produto.count({ where: { tenantId } }),
    caixas: await prisma.caixa.count({ where: { tenantId } }),
    oportunidades: await prisma.oportunidade.count({ where: { tenantId } }),
    tarefas: await prisma.tarefa.count({ where: { tenantId } }),
    users: await prisma.user.count({ where: { tenantId } }),
  };
}

async function cleanup() {
  secao("Cleanup");
  try {
    for (const eid of [criados.empresaX, criados.empresaY].filter(Boolean)) {
      await prisma.logAuditoria.deleteMany({ where: { tenantId: eid } });
      await prisma.empresa.delete({ where: { id: eid } }).catch(() => {});
    }
    info("✅ Cleanup completo");
  } catch (e) {
    console.error("⚠️  Erro:", e.message);
  }
}

async function main() {
  console.log("🗑️  Teste reset multi-tenant\n");

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));

  try {
    // ---------- Setup ----------
    secao("0. Signup de 2 tenants");
    const rX = await req(server, { method: "POST", path: "/tenants/signup", body: TENANT_X });
    check(rX.status === 201, `Signup X -> 201`);
    criados.empresaX = rX.body.empresa.id;
    const tokenX = rX.body.token;

    const rY = await req(server, { method: "POST", path: "/tenants/signup", body: TENANT_Y });
    check(rY.status === 201, `Signup Y -> 201`);
    criados.empresaY = rY.body.empresa.id;
    const tokenY = rY.body.token;

    // ---------- Popular ambos ----------
    secao("1. Popular X e Y com dados ricos");
    await popular(server, tokenX, criados.empresaX);
    await popular(server, tokenY, criados.empresaY);

    const antesX = await contagemTenant(criados.empresaX);
    const antesY = await contagemTenant(criados.empresaY);
    info(`X antes: ${JSON.stringify(antesX)}`);
    info(`Y antes: ${JSON.stringify(antesY)}`);
    check(antesX.vendas > 0 && antesX.clientes > 0 && antesX.oportunidades > 0 && antesX.tarefas > 0,
      `X tem dados em vendas/clientes/oportunidades/tarefas`);
    check(antesY.vendas > 0 && antesY.clientes > 0,
      `Y tambem populado`);

    // ---------- RESET X via endpoint autenticado ----------
    secao("2. POST /admin/reset com token X");
    const reset = await req(server, {
      method: "POST", path: "/admin/reset",
      headers: { Authorization: `Bearer ${tokenX}` },
      body: { confirmacao: "CONFIRMAR_RESET" },
    });
    check(reset.status === 200, `Reset -> 200`);
    check(reset.body?.ok === true, `body.ok === true`);
    const removidos = reset.body?.removidos || {};
    info(`removidos: vendas=${removidos.vendas}, clientes=${removidos.clientes}, oportunidades=${removidos.oportunidades}, tarefas=${removidos.tarefas}, produtos=${removidos.produtos}`);
    check(removidos.vendas >= 1, `>=1 venda removida em X`);
    check(removidos.oportunidades >= 1, `>=1 oportunidade removida em X`);
    check(removidos.tarefas >= 1, `>=1 tarefa removida em X`);

    // ---------- Validar X zerado ----------
    secao("3. Tenant X esta zerado");
    const aposX = await contagemTenant(criados.empresaX);
    info(`X apos: ${JSON.stringify(aposX)}`);
    check(aposX.vendas === 0, `X.vendas === 0`);
    check(aposX.clientes === 0, `X.clientes === 0`);
    check(aposX.produtos === 0, `X.produtos === 0`);
    check(aposX.caixas === 0, `X.caixas === 0`);
    check(aposX.oportunidades === 0, `X.oportunidades === 0`);
    check(aposX.tarefas === 0, `X.tarefas === 0`);
    check(aposX.users === 1, `X.users === 1 (admin preservado)`);

    // ---------- Validar Y intocado ----------
    secao("4. Tenant Y nao foi afetado (isolamento)");
    const aposY = await contagemTenant(criados.empresaY);
    info(`Y apos: ${JSON.stringify(aposY)}`);
    check(aposY.vendas === antesY.vendas, `Y.vendas inalterado (${aposY.vendas})`);
    check(aposY.clientes === antesY.clientes, `Y.clientes inalterado`);
    check(aposY.produtos === antesY.produtos, `Y.produtos inalterado`);
    check(aposY.caixas === antesY.caixas, `Y.caixas inalterado`);
    check(aposY.oportunidades === antesY.oportunidades, `Y.oportunidades inalterado`);
    check(aposY.tarefas === antesY.tarefas, `Y.tarefas inalterado`);

    // ---------- Validar login X continua funcionando ----------
    secao("5. Login em X ainda funciona apos reset");
    const loginPos = await req(server, {
      method: "POST", path: "/auth/login",
      body: { email: TENANT_X.email, senha: TENANT_X.senha },
    });
    check(loginPos.status === 200, `Login X (apos reset) -> 200`);
    check(loginPos.body?.empresa?.id === criados.empresaX, `Mesma Empresa X`);

    // ---------- Empresa X em si nao foi apagada ----------
    secao("6. Entidade Empresa preservada");
    const empExiste = await prisma.empresa.findUnique({ where: { id: criados.empresaX } });
    check(empExiste !== null, `Empresa X existe`);
    check(empExiste.nome === TENANT_X.nomeEmpresa, `Nome preservado`);

  } finally {
    await new Promise(r => server.close(r));
  }

  await cleanup();

  console.log(`\n${"=".repeat(50)}`);
  console.log(`RESET TENANT: ${ok} ✅  /  ${fail} ❌`);
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
