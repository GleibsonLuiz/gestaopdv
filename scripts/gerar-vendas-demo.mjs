// Gera vendas-demo no banco demo_manual para popular Dashboard/Relatórios/Caixa.
const API = "http://127.0.0.1:3334";
const H = (token) => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
const FORMAS = ["DINHEIRO", "PIX", "CARTAO_DEBITO", "CARTAO_CREDITO", "PIX", "DINHEIRO"];
const rnd = (n) => Math.floor(Math.random() * n);

const j = async (r) => {
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
};

// login
const lr = await fetch(`${API}/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@gestaopro.local", senha: "admin123" }),
});
const { token } = await j(lr);
if (!token) { console.error("sem token"); process.exit(1); }

// abre caixa (ignora se já aberto)
const ca = await fetch(`${API}/caixas/abrir`, {
  method: "POST", headers: H(token), body: JSON.stringify({ saldoInicial: 200 }),
});
console.log("abrir caixa:", ca.status === 201 || ca.status === 200 ? "ok" : `(${ca.status}) ` + JSON.stringify(await j(ca)).slice(0, 80));

// produtos com estoque e preço
const prods = (await j(await fetch(`${API}/produtos`, { headers: H(token) })));
const lista = (Array.isArray(prods) ? prods : prods.items || prods.dados || [])
  .filter((p) => p.ativo && Number(p.precoVenda) > 0 && Number(p.estoque) > 5);
console.log("produtos vendáveis:", lista.length);

// clientes
const clis = (await j(await fetch(`${API}/clientes`, { headers: H(token) })));
const clientes = (Array.isArray(clis) ? clis : clis.items || clis.dados || []);
console.log("clientes:", clientes.length);

let ok = 0, fail = 0;
const N = 16;
for (let v = 0; v < N; v++) {
  const nItens = 1 + rnd(3);
  const itens = [];
  for (let k = 0; k < nItens; k++) {
    const p = lista[rnd(lista.length)];
    const quantidade = 1 + rnd(2);
    itens.push({ produtoId: p.id, quantidade, precoUnitario: Number(p.precoVenda) });
  }
  const total = itens.reduce((a, it) => a + it.quantidade * it.precoUnitario, 0);
  const forma = FORMAS[rnd(FORMAS.length)];
  const usarCliente = Math.random() < 0.6 && clientes.length;
  const body = {
    itens,
    pagamentos: [{ forma, valor: Number(total.toFixed(2)) }],
    ...(usarCliente ? { clienteId: clientes[rnd(clientes.length)].id } : {}),
  };
  const r = await fetch(`${API}/vendas`, { method: "POST", headers: H(token), body: JSON.stringify(body) });
  if (r.status === 201 || r.status === 200) { ok++; }
  else { fail++; if (fail <= 3) console.log("  falha venda:", r.status, JSON.stringify(await j(r)).slice(0, 120)); }
}
console.log(`\nVendas criadas: ${ok} | falhas: ${fail}`);
