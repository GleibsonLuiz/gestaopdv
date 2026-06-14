// E2E de FLUXO (escrita) contra a API de producao, tenant ECONOMIA:
// abrir caixa -> vendas (dinheiro / split / crediario) -> sangria ->
// estorno -> fechar caixa -> relatorio do dia. Verifica efeitos colaterais
// (estoque, caixa, conta a receber) a cada passo.
//
// Login SEM header de dispositivo => fail-open (nao registra device, nao
// esbarra no limite de licenca).
const BASE = process.env.SMOKE_BASE || "https://gestao-pdv-api.vercel.app";
let TOKEN = null;
const H = () => ({ "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) });
const brl = (n) => "R$ " + Number(n || 0).toFixed(2);
let pass = 0, fail = 0;
function check(cond, msg, detalhe = "") { if (cond) { pass++; console.log(`  ✅ ${msg}`); } else { fail++; console.log(`  ❌ ${msg}  ${detalhe}`); } }

async function api(method, path, body) {
  const r = await fetch(`${BASE}${path}`, { method, headers: H(), body: body ? JSON.stringify(body) : undefined });
  let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch {}
  return { status: r.status, j, t };
}

async function main() {
  console.log("== E2E FLUXO — tenant ECONOMIA (producao) ==\n");

  // login
  const login = await api("POST", "/auth/login", { email: "gerente@economia.local", senha: "economia123" });
  if (login.status !== 200 || !login.j?.token) { console.log("FALHA LOGIN:", login.status, login.t.slice(0, 200)); process.exit(1); }
  TOKEN = login.j.token;
  console.log("Login OK (gerente)\n");

  // ---------- 1) ABRIR CAIXA ----------
  console.log("1) ABRIR CAIXA");
  let caixa = (await api("GET", "/caixas/atual")).j;
  let caixaId = caixa?.id || caixa?.caixa?.id;
  if (!caixaId) {
    const ab = await api("POST", "/caixas/abrir", { saldoInicial: 200, observacoesAbertura: "abertura e2e" });
    check(ab.status === 200 || ab.status === 201, "Caixa aberto", `status ${ab.status} ${ab.t.slice(0,120)}`);
    caixaId = ab.j?.id || ab.j?.caixa?.id;
  } else {
    console.log("  (ja havia caixa aberto, reutilizando)");
  }
  check(!!caixaId, "Tenho caixaId", String(caixaId));
  const saldoInicial = 200;

  // ---------- produtos para vender ----------
  const prodResp = await api("GET", "/produtos");
  const listaProd = Array.isArray(prodResp.j) ? prodResp.j : (prodResp.j?.data || prodResp.j?.produtos || []);
  const comEstoque = listaProd.filter((p) => p.ativo && Number(p.estoque) >= 6 && p.unidade !== "KG").slice(0, 3);
  check(comEstoque.length >= 2, "Produtos com estoque para vender", `achei ${comEstoque.length}`);
  const estoqueAntes = Object.fromEntries(comEstoque.map((p) => [p.id, Number(p.estoque)]));
  const P = comEstoque;
  console.log("  produtos:", P.map((p) => `${p.nome.slice(0,18)}=${p.estoque}`).join(" | "));

  // cliente p/ crediario
  const cliResp = await api("GET", "/clientes");
  const listaCli = Array.isArray(cliResp.j) ? cliResp.j : (cliResp.j?.data || cliResp.j?.clientes || []);
  const cliente = listaCli[0];
  check(!!cliente, "Cliente disponivel p/ crediario", cliente?.nome);

  // ---------- 2) VENDA dinheiro ----------
  console.log("\n2) VENDA em DINHEIRO (2 itens)");
  const v1itens = [{ produtoId: P[0].id, quantidade: 2, precoUnitario: Number(P[0].precoVenda) }, { produtoId: P[1].id, quantidade: 1, precoUnitario: Number(P[1].precoVenda) }];
  const v1total = v1itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0);
  const v1 = await api("POST", "/vendas", { itens: v1itens, pagamentos: [{ forma: "DINHEIRO", valor: v1total }] });
  check(v1.status === 200 || v1.status === 201, "Venda dinheiro criada", `status ${v1.status} ${v1.t.slice(0,140)}`);
  const venda1 = v1.j;
  check(Number(venda1?.total) === Math.round(v1total * 100) / 100, "Total confere", `${venda1?.total} vs ${v1total}`);

  // ---------- 3) VENDA split dinheiro+pix com cliente ----------
  console.log("\n3) VENDA SPLIT (dinheiro+pix) com cliente");
  const v2itens = [{ produtoId: P[0].id, quantidade: 1, precoUnitario: Number(P[0].precoVenda) }];
  const v2total = Number(P[0].precoVenda);
  const metade = Math.round(v2total * 50) / 100;
  const v2 = await api("POST", "/vendas", { clienteId: cliente.id, itens: v2itens, pagamentos: [{ forma: "DINHEIRO", valor: metade }, { forma: "PIX", valor: Math.round((v2total - metade) * 100) / 100 }] });
  check(v2.status === 200 || v2.status === 201, "Venda split criada", `status ${v2.status} ${v2.t.slice(0,140)}`);

  // ---------- 4) VENDA crediario (gera conta a receber) ----------
  console.log("\n4) VENDA CREDIARIO (gera conta a receber)");
  const v3itens = [{ produtoId: P[1].id, quantidade: 1, precoUnitario: Number(P[1].precoVenda) }];
  const v3total = Number(P[1].precoVenda);
  const venc = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const v3 = await api("POST", "/vendas", { clienteId: cliente.id, itens: v3itens, pagamentos: [{ forma: "CREDIARIO", valor: v3total }], gerarContaReceber: { vencimento: venc, parcelas: 1, descricao: "Fiado teste e2e" } });
  check(v3.status === 200 || v3.status === 201, "Venda crediario criada", `status ${v3.status} ${v3.t.slice(0,160)}`);
  const venda3 = v3.j;
  // confere conta a receber
  const cr = await api("GET", `/contas-receber?dataInicio=2024-01-01&dataFim=2027-01-01`);
  const listaCR = Array.isArray(cr.j) ? cr.j : (cr.j?.data || cr.j?.contas || []);
  const crDaVenda = listaCR.find((c) => c.vendaId === venda3?.id);
  check(!!crDaVenda, "Conta a receber gerada para a venda crediario", `valor ${crDaVenda?.valor}`);

  // ---------- 5) verifica baixa de estoque ----------
  console.log("\n5) BAIXA DE ESTOQUE");
  const prod2 = await api("GET", "/produtos");
  const lista2 = Array.isArray(prod2.j) ? prod2.j : (prod2.j?.data || prod2.j?.produtos || []);
  const mapDepois = Object.fromEntries(lista2.map((p) => [p.id, Number(p.estoque)]));
  // P[0] vendido: 2 (v1) + 1 (v2) = 3 ; P[1] vendido: 1 (v1) + 1 (v3) = 2
  check(estoqueAntes[P[0].id] - mapDepois[P[0].id] === 3, `Estoque ${P[0].nome.slice(0,14)} baixou 3`, `${estoqueAntes[P[0].id]} -> ${mapDepois[P[0].id]}`);
  check(estoqueAntes[P[1].id] - mapDepois[P[1].id] === 2, `Estoque ${P[1].nome.slice(0,14)} baixou 2`, `${estoqueAntes[P[1].id]} -> ${mapDepois[P[1].id]}`);

  // ---------- 6) SANGRIA ----------
  console.log("\n6) SANGRIA");
  const sg = await api("POST", `/caixas/${caixaId}/sangria`, { valor: 50, descricao: "sangria e2e" });
  check(sg.status === 200 || sg.status === 201, "Sangria registrada", `status ${sg.status} ${sg.t.slice(0,120)}`);

  // ---------- 7) ESTORNO da venda 1 ----------
  console.log("\n7) ESTORNO da venda em dinheiro (devolve estoque + caixa)");
  const est = await api("POST", `/vendas/${venda1.id}/cancelar`, { motivo: "teste e2e" });
  check(est.status === 200 || est.status === 201, "Venda cancelada/estornada", `status ${est.status} ${est.t.slice(0,140)}`);
  const prod3 = await api("GET", "/produtos");
  const lista3 = Array.isArray(prod3.j) ? prod3.j : (prod3.j?.data || prod3.j?.produtos || []);
  const mapEstorno = Object.fromEntries(lista3.map((p) => [p.id, Number(p.estoque)]));
  // P[0] devolve 2, P[1] devolve 1
  check(mapEstorno[P[0].id] - mapDepois[P[0].id] === 2, `Estoque ${P[0].nome.slice(0,14)} devolvido (+2)`, `${mapDepois[P[0].id]} -> ${mapEstorno[P[0].id]}`);
  check(mapEstorno[P[1].id] - mapDepois[P[1].id] === 1, `Estoque ${P[1].nome.slice(0,14)} devolvido (+1)`, `${mapDepois[P[1].id]} -> ${mapEstorno[P[1].id]}`);

  // ---------- 8) EXTRATO do caixa (saldo coerente) ----------
  console.log("\n8) EXTRATO / SALDO DO CAIXA");
  const ext = await api("GET", `/caixas/${caixaId}/extrato`);
  check(ext.status === 200, "Extrato do caixa abre", `status ${ext.status}`);
  const tot = ext.j?.totais || ext.j;
  // dinheiro esperado = 200 (inicial) + v1 dinheiro(ja estornado=0 liquido) + v2 metade dinheiro - sangria 50
  // v1 dinheiro entrou e saiu (estorno) => liquido 0 ; v2 metade dinheiro entra ; sangria 50 sai
  const esperadoDin = 200 + metade - 50;
  const saldoDin = Number(tot?.saldoEsperadoDinheiro ?? tot?.vendasDinheiro);
  check(Number.isFinite(saldoDin), "Extrato traz saldo em dinheiro", `saldo=${saldoDin}`);
  if (Number.isFinite(saldoDin)) check(Math.abs(saldoDin - esperadoDin) < 0.02, "Saldo em dinheiro coerente", `calc=${esperadoDin} api=${saldoDin}`);

  // ---------- 9) FECHAR CAIXA ----------
  console.log("\n9) FECHAR CAIXA (conferencia cega)");
  const fechado = await api("POST", `/caixas/${caixaId}/fechar`, { saldoFinalContado: esperadoDin, trocoProximoDia: 150, observacoesFechamento: "fechamento e2e" });
  check(fechado.status === 200 || fechado.status === 201, "Caixa fechado", `status ${fechado.status} ${fechado.t.slice(0,140)}`);
  const dif = Number(fechado.j?.diferenca ?? fechado.j?.caixa?.diferenca);
  check(Math.abs(dif) < 0.02, "Diferenca de fechamento ~ 0 (conferencia bateu)", `diferenca=${dif}`);

  // ---------- 10) RELATORIO DO DIA ----------
  console.log("\n10) RELATORIO DO DIA");
  const hoje = new Date().toISOString().slice(0, 10);
  const rep = await api("GET", `/relatorios/resumo-diario?data=${hoje}`);
  check(rep.status === 200, "Relatorio resumo-diario gera", `status ${rep.status}`);
  const repCx = await api("GET", `/relatorios/caixas?dataInicio=${hoje}&dataFim=${hoje}`);
  check(repCx.status === 200, "Relatorio de caixas gera", `status ${repCx.status}`);

  console.log(`\n== RESULTADO: ${pass} PASS / ${fail} FAIL ==`);
  if (fail === 0) console.log("✅ Fluxo end-to-end completo e coerente.");
  process.exit(fail === 0 ? 0 : 2);
}
main().catch((e) => { console.error(e); process.exit(1); });
