// Teste de isolamento do Dashboard (GET /dashboard) entre tenants.
//
// Cobre o bug critico onde $queryRaw bypassava o Prisma Extension da
// ETAPA 3 — Dashboard mostrava dados de outros tenants no grafico de
// vendas dos 7 dias, estoque baixo, etc.
//
// Estrategia:
//   1. Cria 2 tenants novos (X e Y) via signup
//   2. Popula X com vendas + produtos + estoque baixo
//   3. Y nasce vazio
//   4. GET /dashboard com token Y -> espera todas as metricas zeradas
//   5. GET /dashboard com token X -> espera as metricas reais de X
//   6. GET /alertas com token Y -> espera 0 alertas de estoque
//   7. Cleanup
//
// Rodar com: cd backend && node scripts/teste-dashboard-isolamento.js

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
  nomeEmpresa: `DASH-X ${SUFIXO}`,
  cnpj: `55555${SUFIXO}001`.slice(0, 14).padEnd(14, "0"),
  nomeAdmin: "ADMIN DX",
  email: `dash-x-${SUFIXO}@teste.local`,
  senha: "dash-x",
};
const TENANT_Y = {
  nomeEmpresa: `DASH-Y ${SUFIXO}`,
  cnpj: `66666${SUFIXO}002`.slice(0, 14).padEnd(14, "0"),
  nomeAdmin: "ADMIN DY",
  email: `dash-y-${SUFIXO}@teste.local`,
  senha: "dash-y",
};

const criados = { empresaX: null, empresaY: null };

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
  console.log("📊 Teste isolamento do Dashboard\n");

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

    // ---------- Popular SO o tenant X ----------
    secao("1. Popular SO o tenant X com vendas + estoque baixo");
    // Produto com estoque baixo (estoque=1, estoqueMinimo=10)
    const prodBaixo = await req(server, {
      method: "POST", path: "/produtos",
      headers: { Authorization: `Bearer ${tokenX}` },
      body: {
        codigo: `DASH-LOW-${SUFIXO}`, nome: "PROD ESTOQUE BAIXO",
        precoVenda: 50, precoCusto: 20, estoque: 1, estoqueMinimo: 10,
      },
    });
    check(prodBaixo.status === 201, `Produto baixo criado em X`);

    // Abre caixa em X
    await req(server, {
      method: "POST", path: "/caixas/abrir",
      headers: { Authorization: `Bearer ${tokenX}` },
      body: { saldoInicial: 100 },
    });

    // Cria 3 vendas em X
    for (let i = 0; i < 3; i++) {
      await req(server, {
        method: "POST", path: "/vendas",
        headers: { Authorization: `Bearer ${tokenX}` },
        body: {
          itens: [{ produtoId: prodBaixo.body.id, quantidade: 1, precoUnitario: 50 }],
          formaPagamento: "DINHEIRO",
        },
      });
    }

    // ---------- Dashboard de Y (deve estar ZERADO) ----------
    secao("2. Dashboard Y — esperado tudo zerado (bug antigo: vazava X)");
    const dashY = await req(server, {
      method: "GET", path: "/dashboard/resumo",
      headers: { Authorization: `Bearer ${tokenY}` },
    });
    check(dashY.status === 200, `GET /dashboard/resumo Y -> 200`);
    const dY = dashY.body || {};
    const kY = dY.kpis || {};
    info(`Y faturamento mes: ${kY.vendasMes?.total}`);
    info(`Y vendas hoje: ${kY.vendasHoje?.total}`);
    info(`Y produtos ativos: ${kY.produtosAtivos}`);
    info(`Y estoqueBaixo (qtd): ${kY.produtosEstoqueBaixo}`);
    info(`Y vendasPorDia: ${JSON.stringify(dY.vendasPorDia || [])}`);
    info(`Y margemBruta total: ${kY.margemBrutaMes?.total}`);
    info(`Y valorEstoque total: ${kY.valorEstoque?.total}`);

    check(kY.vendasMes?.total === 0,
      `Y vendasMes.total === 0 (recebeu ${kY.vendasMes?.total})`);
    check(kY.vendasHoje?.total === 0,
      `Y vendasHoje.total === 0`);
    check(kY.produtosAtivos === 0,
      `Y produtosAtivos === 0`);
    check(kY.produtosEstoqueBaixo === 0,
      `Y produtosEstoqueBaixo === 0 (recebeu ${kY.produtosEstoqueBaixo})`);
    check(Array.isArray(dY.estoqueBaixo) && dY.estoqueBaixo.length === 0,
      `Y estoqueBaixo array vazio (recebeu ${dY.estoqueBaixo?.length})`);
    // Dashboard preenche 7 dias mesmo zerados (pra renderizar o grafico).
    // O importante e que TODOS os totais sejam 0 (sem vazamento).
    const todosZeradosY = Array.isArray(dY.vendasPorDia)
      && dY.vendasPorDia.every(d => Number(d.total) === 0 && Number(d.qtd) === 0);
    check(todosZeradosY,
      `Y vendasPorDia todos os dias zerados (sem vazar X)`);
    check(kY.margemBrutaMes?.total === 0,
      `Y margemBrutaMes.total === 0`);
    check(kY.valorEstoque?.total === 0,
      `Y valorEstoque.total === 0`);

    // ---------- Dashboard de X (deve mostrar dados reais) ----------
    secao("3. Dashboard X — dados reais (3 vendas, 1 produto, estoque baixo)");
    const dashX = await req(server, {
      method: "GET", path: "/dashboard/resumo",
      headers: { Authorization: `Bearer ${tokenX}` },
    });
    check(dashX.status === 200, `GET /dashboard/resumo X -> 200`);
    const dX = dashX.body || {};
    const kX = dX.kpis || {};
    info(`X faturamento mes: ${kX.vendasMes?.total}`);
    info(`X produtos ativos: ${kX.produtosAtivos}`);
    info(`X estoqueBaixo qtd: ${kX.produtosEstoqueBaixo}`);
    info(`X vendasPorDia length: ${dX.vendasPorDia?.length}`);

    check(kX.vendasMes?.total > 0, `X vendasMes.total > 0`);
    check(kX.produtosAtivos === 1, `X produtosAtivos === 1`);
    check(kX.produtosEstoqueBaixo === 1, `X produtosEstoqueBaixo === 1`);
    check(Array.isArray(dX.estoqueBaixo) && dX.estoqueBaixo.length === 1,
      `X estoqueBaixo array length === 1`);
    check(Array.isArray(dX.vendasPorDia) && dX.vendasPorDia.length > 0,
      `X vendasPorDia tem registros`);

    // ---------- /alertas tambem deve isolar ----------
    secao("4. /alertas em Y — sem estoque baixo");
    const alertasY = await req(server, {
      method: "GET", path: "/alertas",
      headers: { Authorization: `Bearer ${tokenY}` },
    });
    check(alertasY.status === 200, `GET /alertas Y -> 200`);
    const contagemY = alertasY.body?.contagem || {};
    info(`Y contagem.estoqueBaixo: ${contagemY.estoqueBaixo}`);
    check(contagemY.estoqueBaixo === 0,
      `Y contagem.estoqueBaixo === 0 (recebeu ${contagemY.estoqueBaixo})`);

    secao("5. /alertas em X — tem estoque baixo");
    const alertasX = await req(server, {
      method: "GET", path: "/alertas",
      headers: { Authorization: `Bearer ${tokenX}` },
    });
    const contagemX = alertasX.body?.contagem || {};
    info(`X contagem.estoqueBaixo: ${contagemX.estoqueBaixo}`);
    check(contagemX.estoqueBaixo === 1,
      `X contagem.estoqueBaixo === 1 (recebeu ${contagemX.estoqueBaixo})`);

  } finally {
    await new Promise(r => server.close(r));
  }

  await cleanup();

  console.log(`\n${"=".repeat(50)}`);
  console.log(`DASHBOARD ISOLAMENTO: ${ok} ✅  /  ${fail} ❌`);
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
