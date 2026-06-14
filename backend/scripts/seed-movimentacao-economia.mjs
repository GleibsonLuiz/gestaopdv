// ============================================================================
// SEED DE MOVIMENTACAO INTENSA — SUPERMERCADO ECONOMIA
// ============================================================================
//
// Gera ~2 anos (2024-06-13 -> 2026-06-13) de operacao realista e COERENTE
// para o tenant "SUPERMERCADO ECONOMIA", exercitando todos os modulos:
//
//   - Cadastros: categorias, fornecedores, clientes, vendedores (login real),
//                fidelidade.
//   - PDV/Vendas: vendas com itens, split de pagamento, descontos, fidelidade,
//                 contas a receber (crediario/cartao), pontos.
//   - Caixa: 1 caixa por dia (abertura -> vendas -> despesas/sangrias ->
//            fechamento com conferencia cega), saldo em dinheiro coerente.
//   - Estoque: baixa por venda (SAIDA), entrada por compra (ENTRADA),
//              estoque inicial, estornos (ENTRADA de devolucao).
//   - Compras: entrada de pedidos de fornecedor (reposicao automatica quando
//              estoque baixa) + contas a pagar.
//   - Estornos: cancelamento de vendas (estoque devolvido + caixa estornado +
//               conta a receber cancelada).
//   - Contabilidade: despesas operacionais classificadas no plano de contas,
//                    contas a pagar (fixas mensais + compras).
//
// Toda a aritmetica de estoque e de caixa em dinheiro e mantida coerente em
// memoria (mesma logica de caixaController/vendaController), entao os
// relatorios, dashboards e o extrato do caixa fecham.
//
// Uso:  node scripts/seed-movimentacao-economia.mjs
//       node scripts/seed-movimentacao-economia.mjs --force   (ignora guarda)
//
// IDEMPOTENCIA: por seguranca, aborta se ja houver > 200 vendas no tenant
// (provavel re-execucao). Use --force para rodar mesmo assim.
// ----------------------------------------------------------------------------

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import "dotenv/config";

const prisma = new PrismaClient();
const T = "a1e31227-e1cd-4fc1-aa18-d11ddef5e3de";
const FORCE = process.argv.includes("--force");

const INICIO = new Date("2024-06-13T08:00:00.000Z");
const FIM = new Date("2026-06-13T08:00:00.000Z");

// ----------------------------------------------------------------------------
// PRNG deterministico (mulberry32) — seed fixa para reproducibilidade.
// ----------------------------------------------------------------------------
let _s = 0x9e3779b9;
function rng() {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (a, b) => a + Math.floor(rng() * (b - a + 1)); // int [a,b]
const rf = (a, b) => a + rng() * (b - a);                 // float [a,b)
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const chance = (p) => rng() < p;
const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;
const uuid = () => crypto.randomUUID();

// ----------------------------------------------------------------------------
// Geradores de documento com digito verificador valido (CPF/CNPJ).
// ----------------------------------------------------------------------------
function cpfDV(base9) {
  const calc = (nums) => {
    let f = nums.length + 1, s = 0;
    for (const n of nums) s += n * f--;
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = calc(base9);
  const d2 = calc([...base9, d1]);
  return `${d1}${d2}`;
}
function gerarCPF() {
  const base = Array.from({ length: 9 }, () => ri(0, 9));
  return base.join("") + cpfDV(base);
}
function cnpjDV(base12) {
  const calc = (nums, pesos) => {
    let s = 0;
    for (let i = 0; i < nums.length; i++) s += nums[i] * pesos[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5,4,3,2,9,8,7,6,5,4,3,2];
  const p2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
  const d1 = calc(base12, p1);
  const d2 = calc([...base12, d1], p2);
  return `${d1}${d2}`;
}
function gerarCNPJ() {
  const base = [...Array.from({ length: 8 }, () => ri(0, 9)), 0, 0, 0, 1];
  return base.join("") + cnpjDV(base);
}

const fmtCPF = (c) => `${c.slice(0,3)}.${c.slice(3,6)}.${c.slice(6,9)}-${c.slice(9)}`;
const fmtCNPJ = (c) => `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`;

// ----------------------------------------------------------------------------
// Insere em lotes (createMany) respeitando o limite de parametros do Postgres.
// ----------------------------------------------------------------------------
async function insertAll(label, model, rows, chunk = 800) {
  if (!rows.length) { console.log(`  ${label}: 0`); return; }
  for (let i = 0; i < rows.length; i += chunk) {
    await model.createMany({ data: rows.slice(i, i + chunk), skipDuplicates: true });
  }
  console.log(`  ${label}: ${rows.length}`);
}

// dia +/- horas para distribuir timestamps dentro do expediente
function emDia(dia, hora, min = 0) {
  const d = new Date(dia);
  d.setUTCHours(hora, min, ri(0, 59), 0);
  return d;
}

// ============================================================================
async function main() {
  console.log("== SEED MOVIMENTACAO ECONOMIA ==");

  const empresa = await prisma.empresa.findUnique({ where: { id: T }, select: { nome: true } });
  if (!empresa) throw new Error("Tenant nao encontrado");
  console.log("Tenant:", empresa.nome);

  const vendasExistentes = await prisma.venda.count({ where: { tenantId: T } });
  if (vendasExistentes > 200 && !FORCE) {
    console.log(`ABORTADO: ja existem ${vendasExistentes} vendas. Use --force para rodar mesmo assim.`);
    return;
  }

  const ADMIN = await prisma.user.findFirst({ where: { tenantId: T, role: "ADMIN" } });
  if (!ADMIN) throw new Error("Usuario ADMIN do tenant nao encontrado");

  // --- counters sequenciais por tenant (continuam de onde estao) ---
  const maxV = await prisma.venda.aggregate({ where: { tenantId: T }, _max: { numero: true } });
  const maxC = await prisma.compra.aggregate({ where: { tenantId: T }, _max: { numero: true } });
  const maxK = await prisma.caixa.aggregate({ where: { tenantId: T }, _max: { numero: true } });
  const maxD = await prisma.despesa.aggregate({ where: { tenantId: T }, _max: { numero: true } });
  let nVenda = (maxV._max.numero || 0) + 1;
  let nCompra = (maxC._max.numero || 0) + 1;
  let nCaixa = (maxK._max.numero || 0) + 1;
  let nDespesa = (maxD._max.numero || 0) + 1;

  // ==========================================================================
  // 1) VENDEDORES (login real) — admin + gerente + 2 vendedores
  // ==========================================================================
  const senhaHash = await bcrypt.hash("economia123", 12);
  const novosUsers = [
    { nome: "MARIA SILVA (GERENTE)", email: "gerente@economia.local", role: "GERENTE" },
    { nome: "JOAO PEREIRA (CAIXA 1)", email: "caixa1@economia.local", role: "VENDEDOR" },
    { nome: "ANA SOUZA (CAIXA 2)", email: "caixa2@economia.local", role: "VENDEDOR" },
  ];
  const userRows = [];
  const userIds = [ADMIN.id];
  for (const u of novosUsers) {
    const existe = await prisma.user.findUnique({ where: { tenantId_email: { tenantId: T, email: u.email } } }).catch(() => null);
    if (existe) { userIds.push(existe.id); continue; }
    const id = uuid();
    userRows.push({ id, tenantId: T, nome: u.nome, email: u.email, senha: senhaHash, role: u.role, ativo: true });
    userIds.push(id);
  }
  await insertAll("usuarios", prisma.user, userRows);
  const vendedores = userIds; // todos podem registrar venda

  // ==========================================================================
  // 2) CATEGORIAS — garante o conjunto de supermercado e mapeia produtos
  // ==========================================================================
  const catNomes = [
    "GRAOS E CEREAIS", "MERCEARIA", "LATICINIOS", "LIMPEZA", "HIGIENE",
    "BEBIDAS", "BISCOITOS E SNACKS", "DOCES",
  ];
  const catExist = await prisma.categoria.findMany({ where: { tenantId: T } });
  const catMap = new Map(catExist.map((c) => [c.nome, c.id]));
  const catRows = [];
  for (const nome of catNomes) {
    if (!catMap.has(nome)) { const id = uuid(); catMap.set(nome, id); catRows.push({ id, tenantId: T, nome }); }
  }
  await insertAll("categorias", prisma.categoria, catRows);

  const catDe = (nome) => {
    const n = nome.toUpperCase();
    if (/ARROZ|FEIJAO|CEREAL/.test(n)) return "GRAOS E CEREAIS";
    if (/LEITE|MANTEIGA|QUEIJO|IOGURTE|REQUEIJAO/.test(n)) return "LATICINIOS";
    if (/SABAO|DETERGENTE|AGUA SANITARIA|ALVEJANTE|LIMPA|LAVA ROUPA|DESINFE/.test(n)) return "LIMPEZA";
    if (/CREME DENTAL|GEL DENTAL|PAPEL HIGIENICO|SABONETE|SHAMPOO|DESODORANTE|ALCOOL EM GEL/.test(n)) return "HIGIENE";
    if (/REFRIGERANTE|PEPSI|COCA|SUCO|AGUA MINERAL|CERVEJA|ENERGETICO/.test(n)) return "BEBIDAS";
    if (/BISCOITO|BATATA|SALGAD|CHIPS|LAMEN|MACARRAO INSTAN/.test(n)) return "BISCOITOS E SNACKS";
    if (/BOMBOM|BOMBONS|CHOCOLATE|BALA|DOCE/.test(n)) return "DOCES";
    return "MERCEARIA";
  };

  // ==========================================================================
  // 3) FORNECEDORES
  // ==========================================================================
  const fornecedoresDef = [
    { nome: "ATACADAO DISTRIBUICAO S.A.", fant: "Atacadao", cats: ["GRAOS E CEREAIS", "MERCEARIA"] },
    { nome: "BRASIL FOODS DISTRIBUIDORA LTDA", fant: "BR Foods", cats: ["LATICINIOS"] },
    { nome: "LIMPMAX PRODUTOS DE LIMPEZA LTDA", fant: "LimpMax", cats: ["LIMPEZA"] },
    { nome: "HIGIPLUS HIGIENE E PERFUMARIA LTDA", fant: "HigiPlus", cats: ["HIGIENE"] },
    { nome: "BEBIDAS DO NORTE DISTRIBUIDORA LTDA", fant: "Bebidas Norte", cats: ["BEBIDAS"] },
    { nome: "DOCES & CIA COMERCIO DE ALIMENTOS LTDA", fant: "Doces & Cia", cats: ["DOCES", "BISCOITOS E SNACKS"] },
    { nome: "UNIAO ATACADISTA REGIONAL LTDA", fant: "Uniao Atacado", cats: ["MERCEARIA", "BISCOITOS E SNACKS"] },
  ];
  const cidades = [
    ["Fortaleza", "CE"], ["Maracanau", "CE"], ["Caucaia", "CE"], ["Recife", "PE"], ["Natal", "RN"],
  ];
  const fornRows = [];
  const fornPorCat = new Map(); // categoria -> [fornId,...]
  for (const f of fornecedoresDef) {
    const id = uuid();
    const [cid, uf] = pick(cidades);
    fornRows.push({
      id, tenantId: T, nome: f.nome, nomeFantasia: f.fant, tipoPessoa: "PJ",
      cnpj: fmtCNPJ(gerarCNPJ()), email: `contato@${f.fant.toLowerCase().replace(/[^a-z]/g, "")}.com.br`,
      telefone: `(85) 3${ri(100,999)}-${ri(1000,9999)}`, cidade: cid, estado: uf,
      endereco: `Av. Industrial, ${ri(100, 4000)}`, bairro: "Distrito Industrial", ativo: true,
    });
    for (const c of f.cats) { if (!fornPorCat.has(c)) fornPorCat.set(c, []); fornPorCat.get(c).push(id); }
  }
  const fornGeral = fornRows.map((f) => f.id);
  const fornDaCat = (cat) => pick(fornPorCat.get(cat) || fornGeral);
  await insertAll("fornecedores", prisma.fornecedor, fornRows);

  // ==========================================================================
  // 4) PRODUTOS — carrega, mapeia categoria/fornecedor, define estoque inicial
  // ==========================================================================
  const produtosDb = await prisma.produto.findMany({
    where: { tenantId: T, ativo: true },
    select: { id: true, codigo: true, nome: true, unidade: true, precoVenda: true, precoCusto: true, estoqueMinimo: true, controlarEstoque: true, categoriaId: true, fornecedorId: true },
    orderBy: { codigo: "asc" },
  });

  const prodUpdates = [];
  const prods = produtosDb.map((p) => {
    const catNome = catDe(p.nome);
    const categoriaId = catMap.get(catNome);
    const fornecedorId = fornDaCat(catNome);
    const ehKg = p.unidade === "KG";
    const precoVenda = Number(p.precoVenda);
    const precoCusto = Number(p.precoCusto) || round2(precoVenda * 0.7);
    const estMin = Number(p.estoqueMinimo) || (ehKg ? 5 : 10);
    // estoque inicial saudavel para iniciar a simulacao
    const estoqueInicial = ehKg ? round3(rf(12, 30)) : ri(40, 120);
    prodUpdates.push({ id: p.id, categoriaId, fornecedorId, estoqueMinimo: estMin });
    return {
      id: p.id, codigo: p.codigo, nome: p.nome, unidade: p.unidade, ehKg,
      precoVenda, precoCusto, estMin, fornecedorId, categoriaId,
      controlarEstoque: p.controlarEstoque !== false,
      estoque: estoqueInicial,            // estoque corrente (em memoria)
      reorder: ehKg ? round3(estMin * 2.5) : Math.ceil(estMin * 2.5),
      alvo: ehKg ? round3(estMin * 6) : Math.ceil(estMin * 6),
    };
  });
  const prodById = new Map(prods.map((p) => [p.id, p]));

  // ==========================================================================
  // 5) CLIENTES
  // ==========================================================================
  const nomes = [
    "JOSE DA SILVA", "MARIA OLIVEIRA", "ANTONIO SANTOS", "FRANCISCA SOUZA", "JOAO LIMA",
    "ANA COSTA", "FRANCISCO PEREIRA", "ANTONIA RODRIGUES", "PAULO ALMEIDA", "CARLOS FERREIRA",
    "RAIMUNDO NUNES", "MARCOS GOMES", "LUCAS MARTINS", "GABRIEL ARAUJO", "RAFAEL RIBEIRO",
    "DANIEL CARVALHO", "MARCOS VINICIUS", "FERNANDA DIAS", "JULIANA MORAES", "PATRICIA ROCHA",
    "SANDRA BARBOSA", "VERA LUCIA FREITAS", "ROBERTO TAVARES", "EDUARDO MENDES", "FABIO CASTRO",
    "LARISSA PINTO", "CAMILA AZEVEDO", "BRUNO CARDOSO", "RENATA TEIXEIRA", "MERCEARIA DO ZE LTDA",
    "BAR E LANCHONETE TRES IRMAOS", "PADARIA PAO QUENTE ME",
  ];
  const clienteRows = [];
  const clientes = [];
  const cpfsUsados = new Set();
  for (let i = 0; i < nomes.length; i++) {
    const nome = nomes[i];
    const ehPJ = /LTDA|ME$|IRMAOS|PADARIA|MERCEARIA/.test(nome);
    let doc; do { doc = ehPJ ? gerarCNPJ() : gerarCPF(); } while (cpfsUsados.has(doc));
    cpfsUsados.add(doc);
    const [cid, uf] = pick(cidades);
    const id = uuid();
    // ~1/3 com limite de credito (elegiveis a crediario)
    const temCred = chance(0.35);
    clienteRows.push({
      id, tenantId: T, nome,
      cpfCnpj: ehPJ ? fmtCNPJ(doc) : fmtCPF(doc),
      telefone: `(85) 9${ri(8000,9999)}-${ri(1000,9999)}`,
      email: chance(0.6) ? `${nome.split(" ")[0].toLowerCase()}${ri(1,99)}@email.com` : null,
      cidade: cid, estado: uf, bairro: pick(["Centro", "Aldeota", "Messejana", "Parangaba", "Bairro de Fatima"]),
      endereco: `Rua ${pick(["das Flores","Sao Joao","Padre Cicero","Dom Pedro","Monsenhor Tabosa"])}, ${ri(10, 1500)}`,
      limiteCredito: temCred ? pick([200, 300, 500, 800, 1000]) : null,
      statusFunil: "CLIENTE_ATIVO",
      origem: pick(["PDV", "INDICACAO", "REDES SOCIAIS", "PASSANTE"]),
      createdAt: emDia(new Date(INICIO.getTime() - ri(1, 60) * 864e5), 9),
    });
    clientes.push({ id, nome, limiteCredito: temCred ? 1 : 0 });
  }
  await insertAll("clientes", prisma.cliente, clienteRows);
  const clientesCred = clientes.filter((c) => c.limiteCredito);

  // ==========================================================================
  // 6) FIDELIDADE — config + acumulador de pontos por cliente
  // ==========================================================================
  await prisma.configuracaoFidelidade.upsert({
    where: { tenantId: T },
    update: { ativo: true },
    create: { tenantId: T, ativo: true, reaisPorPonto: 1, pontosParaUmReal: 100, minimoResgate: 100, maximoDescPct: 50 },
  });
  const pontosAcc = new Map(); // clienteId -> { saldo, totalGanho }

  // ==========================================================================
  // ACUMULADORES de linhas para bulk insert
  // ==========================================================================
  const caixas = [], movCaixa = [], vendas = [], itensVenda = [], vendaPag = [];
  const movEstoque = [], contasReceber = [], contasPagar = [], movPontos = [];
  const compras = [], itensCompra = [], despesas = [];

  // estoque inicial: 1 movimentacao ENTRADA por produto na abertura da loja
  for (const p of prods) {
    movEstoque.push({
      id: uuid(), tenantId: T, tipo: "ENTRADA", quantidade: p.estoque,
      estoqueAntes: 0, estoqueDepois: p.estoque, motivo: "ESTOQUE INICIAL",
      produtoId: p.id, userId: ADMIN.id, createdAt: emDia(INICIO, 7),
    });
  }

  // distribuicao de formas de pagamento
  const formasComuns = ["DINHEIRO","DINHEIRO","DINHEIRO","PIX","PIX","CARTAO_DEBITO","CARTAO_DEBITO","CARTAO_CREDITO"];

  const FORMAS_RECEBER = new Set(["CARTAO_CREDITO", "BOLETO", "CREDIARIO"]);

  let totalEstornos = 0;
  let diaIdx = 0;

  // ==========================================================================
  // LOOP PRINCIPAL — dia a dia
  // ==========================================================================
  for (let d = new Date(INICIO); d <= FIM; d.setUTCDate(d.getUTCDate() + 1)) {
    diaIdx++;
    const dow = d.getUTCDay();          // 0=dom
    const mes = d.getUTCMonth();        // 0=jan
    const diaMes = d.getUTCDate();
    if (dow === 0 && chance(0.6)) continue; // fecha a maioria dos domingos

    // --- abre o caixa do dia ---
    const operador = pick(vendedores);
    const saldoInicial = pick([150, 200, 200, 250, 300]);
    const caixaId = uuid();
    const numCaixa = nCaixa++;
    let caixaCash = saldoInicial;       // saldo em dinheiro corrente
    const abertura = emDia(d, 7, 30);
    movCaixa.push({
      id: uuid(), tenantId: T, caixaId, userId: operador, tipo: "ABERTURA",
      formaPagamento: "DINHEIRO", valor: saldoInicial, descricao: "ABERTURA DE CAIXA",
      saldoAntes: 0, saldoDepois: saldoInicial, createdAt: abertura,
    });

    // --- volume de vendas do dia (sazonalidade) ---
    let base = ri(3, 8);
    if (mes === 11) base += ri(2, 6);                 // dezembro
    if (diaMes <= 7) base += ri(0, 3);                // inicio do mes (pagamento)
    if (dow === 6) base += ri(1, 3);                  // sabado
    if (dow === 0) base = Math.max(2, base - 3);      // domingo (quando abre)
    // leve crescimento ano 2
    if (d.getUTCFullYear() === 2025) base += 1;
    if (d.getUTCFullYear() === 2026) base += 2;

    let horaVenda = 8;
    for (let s = 0; s < base; s++) {
      // distribui pelo expediente 8h-20h
      horaVenda = 8 + Math.floor((s / base) * 12);
      const quando = emDia(d, Math.min(20, horaVenda), ri(0, 59));

      // monta itens (1-5 produtos distintos com estoque)
      const nItens = ri(1, 5);
      const escolhidos = new Set();
      const itens = [];
      let subtotal = 0;
      for (let k = 0; k < nItens; k++) {
        const p = pick(prods);
        if (escolhidos.has(p.id)) continue;
        if (p.controlarEstoque && p.estoque <= 0) continue;
        escolhidos.add(p.id);
        let qtd = p.ehKg ? round3(rf(0.2, 2.5)) : ri(1, 4);
        if (p.controlarEstoque && qtd > p.estoque) qtd = p.ehKg ? round3(p.estoque) : Math.floor(p.estoque);
        if (qtd <= 0) continue;
        const preco = p.precoVenda;
        const sub = round2(qtd * preco);
        itens.push({ p, qtd, preco, sub });
        subtotal += sub;
      }
      if (!itens.length) continue;
      subtotal = round2(subtotal);

      // desconto ocasional
      let desconto = 0;
      if (chance(0.18)) desconto = round2(Math.min(subtotal * rf(0.02, 0.08), subtotal - 0.5));
      const total = round2(subtotal - desconto);
      if (total <= 0) continue;

      // cliente identificado em ~45% das vendas
      let cliente = null;
      if (chance(0.45)) cliente = pick(clientes);

      // forma de pagamento (split eventual)
      let pagamentos = [];
      const querCrediario = cliente && clientesCred.find((c) => c.id === cliente.id) && chance(0.25);
      if (querCrediario) {
        pagamentos = [{ forma: "CREDIARIO", valor: total }];
      } else if (chance(0.12)) {
        // split: dinheiro + pix
        const v1 = round2(total * rf(0.3, 0.6));
        pagamentos = [{ forma: "DINHEIRO", valor: v1 }, { forma: "PIX", valor: round2(total - v1) }];
      } else {
        pagamentos = [{ forma: pick(formasComuns), valor: total }];
      }
      // forma principal = maior valor
      const formaPrincipal = [...pagamentos].sort((a, b) => b.valor - a.valor)[0].forma;
      const valorAPrazo = round2(pagamentos.filter((p) => FORMAS_RECEBER.has(p.forma)).reduce((s, p) => s + p.valor, 0));

      const vendaId = uuid();
      const numVenda = nVenda++;
      const userVenda = operador;

      // baixa estoque + movimentacao SAIDA
      for (const it of itens) {
        const antes = it.p.estoque;
        const depois = it.p.controlarEstoque ? round3(antes - it.qtd) : round3(antes - it.qtd);
        it.p.estoque = depois;
        itensVenda.push({ id: uuid(), tenantId: T, vendaId, produtoId: it.p.id, quantidade: it.qtd, precoUnitario: it.preco, subtotal: it.sub });
        movEstoque.push({ id: uuid(), tenantId: T, tipo: "SAIDA", quantidade: it.qtd, estoqueAntes: antes, estoqueDepois: depois, motivo: `VENDA #${numVenda}`, produtoId: it.p.id, userId: userVenda, createdAt: quando });
      }

      vendas.push({
        id: vendaId, tenantId: T, numero: numVenda, total, desconto, formaPagamento: formaPrincipal,
        status: "CONCLUIDA", clienteId: cliente?.id || null, userId: userVenda, caixaId, createdAt: quando,
        observacoes: null,
      });
      pagamentos.forEach((pg, idx) => {
        vendaPag.push({ id: uuid(), tenantId: T, vendaId, forma: pg.forma, valor: pg.valor, ordem: idx + 1, createdAt: quando });
        // movimentacao de caixa por pagamento (so DINHEIRO afeta o saldo)
        const ehDin = pg.forma === "DINHEIRO";
        const sAntes = caixaCash;
        if (ehDin) caixaCash = round2(caixaCash + pg.valor);
        const suf = pagamentos.length > 1 ? ` (${pg.forma})` : "";
        movCaixa.push({
          id: uuid(), tenantId: T, caixaId, userId: userVenda, tipo: "VENDA",
          formaPagamento: pg.forma, valor: pg.valor,
          descricao: `VENDA #${numVenda}${cliente ? "" : " — CONSUMIDOR"}${suf}`,
          saldoAntes: sAntes, saldoDepois: ehDin ? caixaCash : sAntes, vendaId, createdAt: quando,
        });
      });

      // conta a receber para parcela a prazo
      if (valorAPrazo > 0) {
        const ehCred = formaPrincipal === "CREDIARIO" || pagamentos.some((p) => p.forma === "CREDIARIO");
        const venc = new Date(quando.getTime() + (ehCred ? ri(15, 45) : ri(28, 32)) * 864e5);
        // cartao de credito normalmente cai (PAGA) ~30 dias; crediario varia
        let status = "PENDENTE", recebimento = null;
        const jaVenceu = venc < FIM;
        if (!ehCred) {
          // cartao: liquidado
          status = jaVenceu ? "PAGA" : "PENDENTE";
          recebimento = jaVenceu ? venc : null;
        } else if (jaVenceu) {
          const r = rng();
          if (r < 0.7) { status = "PAGA"; recebimento = new Date(venc.getTime() - ri(0, 10) * 864e5); }
          else if (r < 0.85) { status = "ATRASADA"; }
          else { status = "PENDENTE"; }
        }
        contasReceber.push({
          id: uuid(), tenantId: T,
          descricao: `VENDA #${numVenda} - ${cliente ? cliente.nome : "CONSUMIDOR"}`,
          valor: valorAPrazo, valorBruto: valorAPrazo, vencimento: venc, recebimento, status,
          clienteId: cliente?.id || null, vendaId, createdAt: quando,
          observacoes: `GERADA AUTOMATICAMENTE PELA VENDA #${numVenda}`,
        });
        // recebimento em dinheiro do crediario entra no caixa do dia do recebimento?
        // simplificacao: nao reabrimos caixas antigos; o recebimento fica no financeiro.
      }

      // fidelidade: ganho de pontos (1 ponto por real, conforme reaisPorPonto=1)
      if (cliente && total > 0) {
        const ganhos = Math.floor(total / 1);
        if (ganhos > 0) {
          const acc = pontosAcc.get(cliente.id) || { saldo: 0, totalGanho: 0 };
          acc.saldo += ganhos; acc.totalGanho += ganhos; pontosAcc.set(cliente.id, acc);
          movPontos.push({ id: uuid(), tenantId: T, tipo: "GANHO", pontos: ganhos, descricao: `GANHO NA VENDA #${numVenda}`, clienteId: cliente.id, vendaId, userId: userVenda, createdAt: quando });
        }
      }

      // ----- ESTORNO ocasional (mesmo dia) -----
      if (chance(0.02)) {
        totalEstornos++;
        const qEstorno = emDia(d, Math.min(20, horaVenda), ri(0, 59));
        // devolve estoque
        for (const it of itens) {
          const antes = it.p.estoque;
          const depois = round3(antes + it.qtd);
          it.p.estoque = depois;
          movEstoque.push({ id: uuid(), tenantId: T, tipo: "ENTRADA", quantidade: it.qtd, estoqueAntes: antes, estoqueDepois: depois, motivo: `CANCELAMENTO VENDA #${numVenda}`, produtoId: it.p.id, userId: userVenda, createdAt: qEstorno });
        }
        // marca venda cancelada
        const vRef = vendas[vendas.length - 1];
        vRef.status = "CANCELADA";
        vRef.observacoes = "VENDA CANCELADA (ESTORNO)";
        // estorno no caixa (so dinheiro afeta saldo)
        for (const pg of pagamentos) {
          const ehDin = pg.forma === "DINHEIRO";
          const sAntes = caixaCash;
          if (ehDin) caixaCash = round2(caixaCash - pg.valor);
          const suf = pagamentos.length > 1 ? ` (${pg.forma})` : "";
          movCaixa.push({ id: uuid(), tenantId: T, caixaId, userId: userVenda, tipo: "ESTORNO_VENDA", formaPagamento: pg.forma, valor: pg.valor, descricao: `ESTORNO VENDA #${numVenda}${suf}`, saldoAntes: sAntes, saldoDepois: ehDin ? caixaCash : sAntes, vendaId, createdAt: qEstorno });
        }
        // cancela conta a receber dessa venda
        const cr = contasReceber.find((c) => c.vendaId === vendaId);
        if (cr) { cr.status = "CANCELADA"; cr.recebimento = null; }
        // estorna pontos ganhos
        if (cliente) {
          const acc = pontosAcc.get(cliente.id);
          const mp = movPontos.find((m) => m.vendaId === vendaId && m.tipo === "GANHO");
          if (acc && mp) { acc.saldo -= mp.pontos; acc.totalGanho -= mp.pontos; }
        }
      }
    }

    // --- despesa paga do caixa (pequena, ocasional) ---
    if (chance(0.20) && caixaCash > 80) {
      const despDef = pick([
        ["3.1.03.002", "Material de limpeza", rf(15, 60)],
        ["3.1.03.003", "Copa e cozinha", rf(10, 45)],
        ["3.1.03.001", "Material de escritorio", rf(12, 50)],
        ["3.1.04.004", "Embalagens (sacolas)", rf(20, 80)],
        ["3.1.03.006", "Manutencao e reparos", rf(30, 120)],
      ]);
      const valor = round2(despDef[2]);
      if (valor < caixaCash - 50) {
        const desId = uuid();
        const numDes = nDespesa++;
        const quando = emDia(d, 18, ri(0, 59));
        despesas.push({ __codigo: despDef[0], id: desId, tenantId: T, numero: numDes, data: quando, valor, descricao: despDef[1], formaPagamento: "DINHEIRO", origem: "MANUAL", planoContaId: null, caixaId, userId: operador, createdAt: quando });
        const sAntes = caixaCash; caixaCash = round2(caixaCash - valor);
        movCaixa.push({ id: uuid(), tenantId: T, caixaId, userId: operador, tipo: "DESPESA", formaPagamento: "DINHEIRO", valor, descricao: `DESPESA #${numDes} - ${despDef[1]}`, saldoAntes: sAntes, saldoDepois: caixaCash, despesaId: desId, createdAt: quando });
      }
    }

    // --- sangria ocasional (excesso de dinheiro para o cofre/banco) ---
    if (caixaCash > 900 && chance(0.5)) {
      const valor = round2(caixaCash - pick([200, 250, 300]));
      const quando = emDia(d, 19, ri(0, 30));
      const sAntes = caixaCash; caixaCash = round2(caixaCash - valor);
      movCaixa.push({ id: uuid(), tenantId: T, caixaId, userId: operador, tipo: "SANGRIA", formaPagamento: "DINHEIRO", valor, descricao: "SANGRIA P/ COFRE", saldoAntes: sAntes, saldoDepois: caixaCash, createdAt: quando });
    }

    // --- fecha o caixa (conferencia cega: pequena diferenca eventual) ---
    const fechamento = emDia(d, 20, ri(10, 59));
    const esperado = round2(caixaCash);
    let contado = esperado;
    if (chance(0.25)) contado = round2(esperado + pick([-5, -2, -1, -0.5, 1, 2, 5]) * rf(0.5, 1.5));
    if (contado < 0) contado = 0;
    const diferenca = round2(contado - esperado);
    const trocoProx = pick([150, 200, 200]);
    caixas.push({
      id: caixaId, tenantId: T, numero: numCaixa, status: "FECHADO", saldoInicial,
      saldoFinalContado: contado, saldoFinalEsperado: esperado, trocoProximoDia: trocoProx,
      diferenca, userId: operador, abertoEm: abertura, fechadoEm: fechamento,
      observacoesAbertura: null, observacoesFechamento: diferenca !== 0 ? "DIFERENCA NA CONFERENCIA" : null,
    });
    movCaixa.push({ id: uuid(), tenantId: T, caixaId, userId: operador, tipo: "FECHAMENTO", formaPagamento: "DINHEIRO", valor: contado, descricao: "FECHAMENTO DE CAIXA", saldoAntes: esperado, saldoDepois: contado, createdAt: fechamento });

    // ======================================================================
    // COMPRAS (reposicao) — a cada ~6 dias, repor produtos abaixo do reorder
    // ======================================================================
    if (diaIdx % 6 === 0) {
      // agrupa produtos baixos por fornecedor
      const baixos = prods.filter((p) => p.controlarEstoque && p.estoque <= p.reorder);
      const porForn = new Map();
      for (const p of baixos) { if (!porForn.has(p.fornecedorId)) porForn.set(p.fornecedorId, []); porForn.get(p.fornecedorId).push(p); }
      for (const [fornId, lista] of porForn) {
        if (!lista.length) continue;
        const compraId = uuid();
        const numCompra = nCompra++;
        const quando = emDia(d, ri(8, 16), ri(0, 59));
        let totalCompra = 0;
        for (const p of lista) {
          const falta = p.alvo - p.estoque;
          let qtd = p.ehKg ? round3(Math.max(falta, 5)) : Math.max(Math.ceil(falta), 6);
          const precoUnit = round2(p.precoCusto * rf(0.97, 1.05));
          const sub = round2(qtd * precoUnit);
          totalCompra += sub;
          itensCompra.push({ id: uuid(), tenantId: T, compraId, produtoId: p.id, quantidade: qtd, precoUnitario: precoUnit, subtotal: sub });
          // entrada de estoque
          const antes = p.estoque; const depois = round3(antes + qtd); p.estoque = depois;
          movEstoque.push({ id: uuid(), tenantId: T, tipo: "ENTRADA", quantidade: qtd, estoqueAntes: antes, estoqueDepois: depois, motivo: `COMPRA #${numCompra}`, produtoId: p.id, userId: ADMIN.id, createdAt: quando });
        }
        totalCompra = round2(totalCompra);
        compras.push({ id: compraId, tenantId: T, numero: numCompra, total: totalCompra, desconto: 0, fornecedorId: fornId, createdAt: quando, observacoes: `PEDIDO DE REPOSICAO` });
        // conta a pagar da compra (vencimento ~28d)
        const venc = new Date(quando.getTime() + ri(20, 35) * 864e5);
        const jaVenceu = venc < FIM;
        let status = "PENDENTE", pagamento = null;
        if (jaVenceu) { const r = rng(); if (r < 0.82) { status = "PAGA"; pagamento = new Date(venc.getTime() - ri(0, 6) * 864e5); } else if (r < 0.92) { status = "ATRASADA"; } }
        contasPagar.push({ id: uuid(), tenantId: T, descricao: `COMPRA #${numCompra} - REPOSICAO`, valor: totalCompra, valorBruto: totalCompra, vencimento: venc, pagamento, status, fornecedorId: fornId, compraId, createdAt: quando, observacoes: "GERADA PELA COMPRA" });
      }
    }
  }

  // ==========================================================================
  // DESPESAS FIXAS MENSAIS -> Contas a Pagar (aluguel, energia, agua, etc.)
  // ==========================================================================
  const fixasMensais = [
    { codigo: "3.1.01.001", desc: "Aluguel da loja", valor: () => 2500, dia: 5 },
    { codigo: "3.1.01.003", desc: "Energia eletrica", valor: () => round2(rf(680, 1250)), dia: 10 },
    { codigo: "3.1.01.004", desc: "Agua e esgoto", valor: () => round2(rf(120, 240)), dia: 12 },
    { codigo: "3.1.01.005", desc: "Internet e telefone", valor: () => 199.9, dia: 15 },
    { codigo: "3.1.02.001", desc: "Salarios (folha)", valor: () => round2(rf(4200, 5200)), dia: 5 },
    { codigo: "3.3.001", desc: "Simples Nacional (DAS)", valor: () => round2(rf(900, 2200)), dia: 20 },
    { codigo: "3.1.03.004", desc: "Servicos de contabilidade", valor: () => 450, dia: 10 },
  ];
  for (let y = INICIO.getUTCFullYear(); y <= FIM.getUTCFullYear(); y++) {
    for (let m = 0; m < 12; m++) {
      for (const f of fixasMensais) {
        const venc = new Date(Date.UTC(y, m, f.dia, 9, 0, 0));
        if (venc < INICIO || venc > FIM) continue;
        const valor = f.valor();
        const jaVenceu = venc < FIM;
        let status = "PENDENTE", pagamento = null;
        if (jaVenceu) { const r = rng(); if (r < 0.9) { status = "PAGA"; pagamento = new Date(venc.getTime() + ri(-2, 3) * 864e5); } else if (r < 0.96) { status = "ATRASADA"; } }
        contasPagar.push({ __codigo: f.codigo, id: uuid(), tenantId: T, descricao: f.desc, valor, valorBruto: valor, vencimento: venc, pagamento, status, createdAt: new Date(venc.getTime() - 5 * 864e5), observacoes: "DESPESA FIXA MENSAL" });
      }
    }
  }

  // resolve planoContaId das despesas e contas a pagar com __codigo
  const planoMap = new Map((await prisma.planoConta.findMany({ where: { tenantId: T }, select: { id: true, codigo: true } })).map((p) => [p.codigo, p.id]));
  for (const dsp of despesas) { dsp.planoContaId = planoMap.get(dsp.__codigo) || planoMap.get("3.1.03.003"); delete dsp.__codigo; }
  for (const cp of contasPagar) { if (cp.__codigo) { cp.planoContaId = planoMap.get(cp.__codigo) || null; delete cp.__codigo; } }

  // ==========================================================================
  // PERSISTE TUDO (ordem respeitando FKs)
  // ==========================================================================
  console.log("\nInserindo no banco...");
  await insertAll("caixas", prisma.caixa, caixas);
  await insertAll("compras", prisma.compra, compras);
  await insertAll("itens_compra", prisma.itemCompra, itensCompra);
  await insertAll("vendas", prisma.venda, vendas);
  await insertAll("itens_venda", prisma.itemVenda, itensVenda);
  await insertAll("venda_pagamentos", prisma.vendaPagamento, vendaPag);
  await insertAll("contas_receber", prisma.contaReceber, contasReceber);
  await insertAll("contas_pagar", prisma.contaPagar, contasPagar);
  await insertAll("despesas", prisma.despesa, despesas);
  await insertAll("movimentacoes_estoque", prisma.movimentacaoEstoque, movEstoque);
  await insertAll("movimentacoes_caixa", prisma.movimentacaoCaixa, movCaixa);
  await insertAll("movimentacoes_pontos", prisma.movimentacaoPontos, movPontos);

  // pontos por cliente
  const pontosRows = [];
  for (const [clienteId, acc] of pontosAcc) {
    if (acc.totalGanho <= 0) continue;
    pontosRows.push({ id: uuid(), tenantId: T, clienteId, saldo: Math.max(0, acc.saldo), totalGanho: acc.totalGanho, totalResgatado: 0, updatedAt: new Date() });
  }
  await insertAll("pontos_cliente", prisma.pontosCliente, pontosRows);

  // ==========================================================================
  // ATUALIZA PRODUTOS: categoria, fornecedor, estoque final, estoqueMinimo
  // ==========================================================================
  console.log("Atualizando produtos (categoria/fornecedor/estoque)...");
  for (const p of prods) {
    const upd = prodUpdates.find((u) => u.id === p.id);
    await prisma.produto.update({
      where: { id: p.id },
      data: {
        categoriaId: upd.categoriaId, fornecedorId: upd.fornecedorId,
        estoqueMinimo: upd.estoqueMinimo, estoque: round3(Math.max(0, p.estoque)),
      },
    });
  }

  // ==========================================================================
  // RESUMO
  // ==========================================================================
  console.log("\n== RESUMO ==");
  console.log(`Periodo: ${INICIO.toISOString().slice(0,10)} a ${FIM.toISOString().slice(0,10)}`);
  console.log(`Caixas (dias): ${caixas.length}`);
  console.log(`Vendas: ${vendas.length} (canceladas/estornos: ${totalEstornos})`);
  console.log(`Itens de venda: ${itensVenda.length}`);
  console.log(`Compras (reposicao): ${compras.length} | itens: ${itensCompra.length}`);
  console.log(`Mov. estoque: ${movEstoque.length} | Mov. caixa: ${movCaixa.length}`);
  console.log(`Contas a receber: ${contasReceber.length} | Contas a pagar: ${contasPagar.length}`);
  console.log(`Despesas (do caixa): ${despesas.length} | Mov. pontos: ${movPontos.length}`);
  console.log(`Clientes: ${clienteRows.length} | Fornecedores: ${fornRows.length} | Usuarios novos: ${userRows.length}`);
  const faturado = vendas.filter((v) => v.status === "CONCLUIDA").reduce((s, v) => s + v.total, 0);
  console.log(`Faturamento total (concluidas): R$ ${faturado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log("\nLogins criados (senha: economia123): gerente@economia.local, caixa1@economia.local, caixa2@economia.local");
  console.log("OK");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
