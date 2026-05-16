// Varredura de seguranca final apos as 5 ETAPAs da migracao multi-tenant.
//
// Verifica:
//   1. .env, .env.* nao estao versionados em momento algum (git history)
//   2. .gitignore inclui as entradas criticas
//   3. Codigo nao tem credenciais hardcoded (senhas, secrets, DATABASE_URL
//      com password embutido, JWT_SECRET embutido)
//   4. Console.log nao vaza senha/token (em codigo de producao)
//   5. Migrations nao tem senhas em SQL embutido
//   6. Sem TODOs criticos esquecidos
//   7. Os arquivos de teste/scripts nao deixaram dados de teste residuais
//      (Empresa B, admin-b@teste.local) no banco
//   8. Confirma que admin@gestaopro.local nao tem senha hardcoded fora
//      do seed
//
// Rodar com: cd backend && node scripts/auditoria-seguranca.js
//
// Sai com 0 se tudo limpo, 1 se houver findings.

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ROOT = resolve("..");
const BACKEND = resolve(".");

let ok = 0, fail = 0, warn = 0;
const findings = [];

function check(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); ok++; }
  else { console.log(`  ❌ ${msg}`); fail++; findings.push({ tipo: "ERRO", msg }); }
}
function aviso(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); ok++; }
  else { console.log(`  ⚠️  ${msg}`); warn++; findings.push({ tipo: "AVISO", msg }); }
}
function secao(t) { console.log(`\n=== ${t} ===`); }
function info(m) { console.log(`  ℹ️  ${m}`); }

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    return e.stdout?.toString() || "";
  }
}

async function main() {
  console.log("🔒 Auditoria de seguranca pos-migracao multi-tenant\n");

  // ---------- 1. .env nao versionado ----------
  secao("1. .env e secrets nao versionados");
  const trackedEnvRaw = git("ls-files -- *.env .env .env.* backend/.env backend/.env.*").trim();
  // .env.example, .env.sample, .env.template sao TEMPLATES com placeholders — OK versionar.
  const trackedEnv = trackedEnvRaw
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean)
    .filter(f => !/\.example$|\.sample$|\.template$/.test(f));
  check(trackedEnv.length === 0,
    `Nenhum .env sensivel versionado${trackedEnvRaw && trackedEnv.length === 0 ? ` (templates OK: ${trackedEnvRaw.split("\n").join(", ")})` : ""}`);
  if (trackedEnv.length > 0) {
    console.log(`     Arquivos sensiveis:\n${trackedEnv.map(l => `       - ${l}`).join("\n")}`);
  }

  // Verifica historico inteiro (caso tenha sido commitado e depois removido)
  const historicalEnv = git("log --all --diff-filter=A --name-only --pretty=format: -- *.env backend/.env")
    .split("\n").map(s => s.trim()).filter(Boolean);
  // Pode dar falso positivo com .env.example - filtramos
  const sensiveis = historicalEnv.filter(f => !/\.example$|\.sample$|\.template$/.test(f));
  aviso(sensiveis.length === 0,
    `Nenhum .env sensivel em qualquer commit do historico${sensiveis.length ? ` (encontrados: ${sensiveis.join(", ")})` : ""}`);

  // ---------- 2. .gitignore tem as entradas certas ----------
  secao("2. .gitignore");
  const gitignorePath = join(ROOT, ".gitignore");
  const gitignoreBackend = join(BACKEND, ".gitignore");
  const gi = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  const giBack = existsSync(gitignoreBackend) ? readFileSync(gitignoreBackend, "utf8") : "";
  const allGi = gi + "\n" + giBack;
  check(/(^|\n)\s*\.env(\s|$)/.test(allGi) || /(^|\n)\s*\.env\b/.test(allGi),
    `.env esta no .gitignore`);
  check(/node_modules/.test(allGi), `node_modules no .gitignore`);
  check(/dist/.test(allGi) || /build/.test(allGi), `dist/build no .gitignore`);

  // ---------- 3. Credenciais hardcoded no codigo ----------
  secao("3. Credenciais hardcoded no codigo");
  // Procura JWT_SECRET com valor literal
  const jwtHard = git(`grep -nE "JWT_SECRET\\s*=\\s*['\\"]\\w+" -- src backend/src`).trim();
  check(jwtHard === "", `Nenhum JWT_SECRET literal embutido no codigo${jwtHard ? "\n" + jwtHard : ""}`);

  // Procura DATABASE_URL com senha
  const dbHard = git(`grep -nE "DATABASE_URL\\s*=\\s*['\\"]post" -- src backend/src`).trim();
  check(dbHard === "", `Nenhum DATABASE_URL hardcoded no codigo${dbHard ? "\n" + dbHard : ""}`);

  // Senhas literais em codigo de producao (exclui scripts/, seed, testes)
  const senhasHard = git(`grep -nE "senha\\s*:\\s*['\\"][a-zA-Z0-9]{6,}" -- src backend/src/controllers backend/src/middlewares backend/src/routes backend/src/lib`).trim();
  // Excluir o caso conhecido: senha em DTO de request body (ex: `req.body.senha`) - falso positivo
  const senhasLinhas = senhasHard.split("\n").filter(l =>
    l && !l.includes("req.body") && !l.includes("data.senha")
  );
  aviso(senhasLinhas.length === 0,
    `Nenhuma senha literal em codigo de producao${senhasLinhas.length ? "\n     " + senhasLinhas.join("\n     ") : ""}`);

  // ---------- 4. Console.log vazando dados sensiveis ----------
  secao("4. console.log com dados sensiveis");
  const logs = git(`grep -rnE "console\\.(log|info|warn|error)\\([^)]*(senha|token|password|jwt|secret|TOKEN|JWT)" -- src backend/src`).trim();
  // Filtrar falsos positivos: emit/registrarEvento de logs estruturados nao sao console.log
  const logsReal = logs.split("\n").filter(l =>
    l &&
    !l.includes("scripts/") &&
    !l.includes("ETAPA") &&
    !l.includes("teste-") &&
    !l.includes("auditoria-")
  );
  aviso(logsReal.length === 0,
    `Nenhum console.log vazando token/senha em codigo de producao${logsReal.length ? "\n     " + logsReal.join("\n     ") : ""}`);

  // ---------- 5. Migrations nao tem senhas ----------
  secao("5. Migrations sem credenciais literais");
  // Filtra falsos positivos: declaracoes de coluna como `"senha" TEXT NOT NULL`
  // sao legitimas (tabela users guarda hash). So sinaliza se for valor literal
  // (string entre aspas com pelo menos 8 chars depois do `=` ou DEFAULT).
  const migsRaw = git(`grep -rniE "password\\s*=\\s*['\\"]|senha\\s*=\\s*['\\"]|DEFAULT\\s+['\\"][^'\\"]{8,}|JWT_SECRET" -- backend/prisma/migrations`).trim();
  aviso(migsRaw === "",
    `Nenhuma credencial LITERAL em migrations${migsRaw ? "\n     " + migsRaw.split("\n").slice(0, 5).join("\n     ") : ""}`);

  // ---------- 6. TODOs criticos esquecidos ----------
  secao("6. TODOs/FIXMEs introduzidos nesta migracao");
  const todos = git(`grep -nE "(TODO|FIXME|XXX|HACK).*(tenant|tenantId|multi-tenant)" -- src backend/src`).trim();
  aviso(todos === "", `Nenhum TODO critico relacionado a multi-tenant${todos ? "\n     " + todos : ""}`);

  // ---------- 7. Dados de teste residuais ----------
  secao("7. Dados de teste residuais no banco");
  const empresaTeste = await prisma.empresa.findUnique({ where: { cnpj: "99999999999999" } });
  check(empresaTeste === null, `Empresa de teste B (CNPJ 99999999999999) NAO existe no banco`);

  const userTeste = await prisma.user.findFirst({ where: { email: "admin-b@teste.local" } });
  check(userTeste === null, `User de teste admin-b@teste.local NAO existe no banco`);

  // Produtos de teste por prefixo
  const produtosTeste = await prisma.produto.findMany({
    where: { codigo: { startsWith: "TESTE-" } },
  });
  check(produtosTeste.length === 0, `Produtos de teste (codigo TESTE-*) removidos do banco (encontrados: ${produtosTeste.length})`);

  // ---------- 8. Tenant principal existe e tem dados ----------
  // Originalmente esperavamos "DEFAULT" com CNPJ 00000000000000 (criado pelo
  // backfill da ETAPA 1). Mas a partir da ETAPA 9 o admin pode renomear sua
  // empresa e mudar o CNPJ. Agora detectamos o tenant principal como o que
  // tem mais users (o user real continua logando nele).
  secao("8. Tenant principal e dados originais");
  const tenants = await prisma.empresa.findMany({
    include: { _count: { select: { users: true } } },
  });
  check(tenants.length >= 1, `Pelo menos 1 empresa existe (achou ${tenants.length})`);
  const empPrincipal = tenants.sort((a, b) => b._count.users - a._count.users)[0];
  if (empPrincipal) {
    info(`Tenant principal: "${empPrincipal.nome}" (${empPrincipal._count.users} users)`);
    const counts = {
      users: empPrincipal._count.users,
      produtos: await prisma.produto.count({ where: { tenantId: empPrincipal.id } }),
      vendas: await prisma.venda.count({ where: { tenantId: empPrincipal.id } }),
    };
    console.log(`     users no principal: ${counts.users}`);
    console.log(`     produtos no principal: ${counts.produtos}`);
    console.log(`     vendas no principal: ${counts.vendas}`);
    check(counts.users >= 1, `>= 1 user no tenant principal`);
    // Removemos os thresholds rigidos (>= 53 produtos / 340 vendas) porque o
    // admin pode ter resetado seus dados via tela Sistema ou esses numeros
    // mudam com o uso normal do sistema.
  }

  // ---------- 9. Schema: tenantId presente em todos os modelos esperados ----------
  secao("9. Schema integridade");
  const orfaos = await prisma.$queryRaw`
    SELECT 'users' AS tabela, COUNT(*)::int AS c FROM users WHERE "tenantId" IS NULL
    UNION ALL SELECT 'clientes', COUNT(*)::int FROM clientes WHERE "tenantId" IS NULL
    UNION ALL SELECT 'produtos', COUNT(*)::int FROM produtos WHERE "tenantId" IS NULL
    UNION ALL SELECT 'vendas', COUNT(*)::int FROM vendas WHERE "tenantId" IS NULL
    UNION ALL SELECT 'caixas', COUNT(*)::int FROM caixas WHERE "tenantId" IS NULL
  `;
  let totalOrfaos = 0;
  for (const r of orfaos) totalOrfaos += r.c;
  check(totalOrfaos === 0, `Nenhum registro orfao (sem tenantId) em users/clientes/produtos/vendas/caixas`);

  // ---------- 10. Verifica que o patch da ETAPA 1 ainda esta documentado ----------
  secao("10. Patches temporarios documentados");
  const authSrc = readFileSync(join(BACKEND, "src/controllers/authController.js"), "utf8");
  aviso(/multi-tenant/i.test(authSrc),
    `authController.js menciona multi-tenant no comentario do findFirst`);

  // ---------- Resumo ----------
  console.log(`\n${"=".repeat(56)}`);
  console.log(`AUDITORIA: ${ok} ✅  /  ${warn} ⚠️  /  ${fail} ❌`);
  console.log("=".repeat(56));
  if (findings.length > 0) {
    console.log("\nAchados:");
    for (const f of findings) {
      console.log(`  ${f.tipo === "ERRO" ? "❌" : "⚠️ "} ${f.msg}`);
    }
  } else {
    console.log("\n🎉 Limpo — nenhuma credencial vazada, nenhum dado de teste residual.");
  }
  process.exit(fail > 0 ? 1 : 0);
}

main()
  .catch(e => { console.error("\n❌ Erro:", e); process.exit(2); })
  .finally(() => prisma.$disconnect());
