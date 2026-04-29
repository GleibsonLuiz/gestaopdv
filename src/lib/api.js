const BASE_URL = "http://localhost:3333";

const TOKEN_KEY = "gestao_token";
const USER_KEY = "gestao_user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Não foi possível conectar ao servidor. O backend está rodando em http://localhost:3333?");
  }

  if (res.status === 401 && auth) {
    clearSession();
    window.dispatchEvent(new Event("auth:logout"));
  }

  if (res.status === 204) return null;

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { erro: text }; }
  }

  if (!res.ok) {
    const msg = (data && (data.erro || data.message)) || `Erro ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  login: (email, senha) => request("/auth/login", { method: "POST", body: { email, senha }, auth: false }),
  me: () => request("/auth/me"),
  trocarSenha: (senhaAtual, senhaNova) =>
    request("/auth/senha", { method: "PUT", body: { senhaAtual, senhaNova } }),

  listarClientes: ({ search = "", ativo = "" } = {}) => {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (ativo !== "") qs.set("ativo", ativo);
    const q = qs.toString();
    return request(`/clientes${q ? `?${q}` : ""}`);
  },
  obterCliente: (id) => request(`/clientes/${id}`),
  criarCliente: (data) => request("/clientes", { method: "POST", body: data }),
  atualizarCliente: (id, data) => request(`/clientes/${id}`, { method: "PUT", body: data }),
  excluirCliente: (id) => request(`/clientes/${id}`, { method: "DELETE" }),

  listarFornecedores: ({ search = "", ativo = "" } = {}) => {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (ativo !== "") qs.set("ativo", ativo);
    const q = qs.toString();
    return request(`/fornecedores${q ? `?${q}` : ""}`);
  },
  obterFornecedor: (id) => request(`/fornecedores/${id}`),
  criarFornecedor: (data) => request("/fornecedores", { method: "POST", body: data }),
  atualizarFornecedor: (id, data) => request(`/fornecedores/${id}`, { method: "PUT", body: data }),
  excluirFornecedor: (id) => request(`/fornecedores/${id}`, { method: "DELETE" }),

  listarCategorias: () => request("/categorias"),
  criarCategoria: (data) => request("/categorias", { method: "POST", body: data }),
  atualizarCategoria: (id, data) => request(`/categorias/${id}`, { method: "PUT", body: data }),
  excluirCategoria: (id) => request(`/categorias/${id}`, { method: "DELETE" }),

  listarProdutos: ({ search = "", ativo = "", categoriaId = "", fornecedorId = "", estoqueBaixo = "" } = {}) => {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (ativo !== "") qs.set("ativo", ativo);
    if (categoriaId) qs.set("categoriaId", categoriaId);
    if (fornecedorId) qs.set("fornecedorId", fornecedorId);
    if (estoqueBaixo === "true") qs.set("estoqueBaixo", "true");
    const q = qs.toString();
    return request(`/produtos${q ? `?${q}` : ""}`);
  },
  obterProduto: (id) => request(`/produtos/${id}`),
  criarProduto: (data) => request("/produtos", { method: "POST", body: data }),
  atualizarProduto: (id, data) => request(`/produtos/${id}`, { method: "PUT", body: data }),
  excluirProduto: (id) => request(`/produtos/${id}`, { method: "DELETE" }),

  listarMovimentacoes: ({ produtoId = "", tipo = "", limite = "" } = {}) => {
    const qs = new URLSearchParams();
    if (produtoId) qs.set("produtoId", produtoId);
    if (tipo) qs.set("tipo", tipo);
    if (limite) qs.set("limite", limite);
    const q = qs.toString();
    return request(`/estoque/movimentacoes${q ? `?${q}` : ""}`);
  },
  criarMovimentacao: (data) => request("/estoque/movimentacoes", { method: "POST", body: data }),

  listarCompras: ({ fornecedorId = "", dataInicio = "", dataFim = "" } = {}) => {
    const qs = new URLSearchParams();
    if (fornecedorId) qs.set("fornecedorId", fornecedorId);
    if (dataInicio) qs.set("dataInicio", dataInicio);
    if (dataFim) qs.set("dataFim", dataFim);
    const q = qs.toString();
    return request(`/compras${q ? `?${q}` : ""}`);
  },
  obterCompra: (id) => request(`/compras/${id}`),
  criarCompra: (data) => request("/compras", { method: "POST", body: data }),

  listarFuncionarios: ({ search = "", ativo = "", role = "" } = {}) => {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (ativo !== "") qs.set("ativo", ativo);
    if (role) qs.set("role", role);
    const q = qs.toString();
    return request(`/funcionarios${q ? `?${q}` : ""}`);
  },
  obterFuncionario: (id) => request(`/funcionarios/${id}`),
  criarFuncionario: (data) => request("/funcionarios", { method: "POST", body: data }),
  atualizarFuncionario: (id, data) => request(`/funcionarios/${id}`, { method: "PUT", body: data }),
  excluirFuncionario: (id) => request(`/funcionarios/${id}`, { method: "DELETE" }),

  listarVendas: ({ clienteId = "", userId = "", formaPagamento = "", status = "", dataInicio = "", dataFim = "", limite = "" } = {}) => {
    const qs = new URLSearchParams();
    if (clienteId) qs.set("clienteId", clienteId);
    if (userId) qs.set("userId", userId);
    if (formaPagamento) qs.set("formaPagamento", formaPagamento);
    if (status) qs.set("status", status);
    if (dataInicio) qs.set("dataInicio", dataInicio);
    if (dataFim) qs.set("dataFim", dataFim);
    if (limite) qs.set("limite", limite);
    const q = qs.toString();
    return request(`/vendas${q ? `?${q}` : ""}`);
  },
  obterVenda: (id) => request(`/vendas/${id}`),
  criarVenda: (data) => request("/vendas", { method: "POST", body: data }),
  cancelarVenda: (id) => request(`/vendas/${id}/cancelar`, { method: "POST" }),

  obterDashboard: () => request("/dashboard/resumo"),

  listarContasPagar: ({ search = "", status = "", fornecedorId = "", dataInicio = "", dataFim = "", vencidas = "" } = {}) => {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (status) qs.set("status", status);
    if (fornecedorId) qs.set("fornecedorId", fornecedorId);
    if (dataInicio) qs.set("dataInicio", dataInicio);
    if (dataFim) qs.set("dataFim", dataFim);
    if (vencidas) qs.set("vencidas", vencidas);
    const q = qs.toString();
    return request(`/contas-pagar${q ? `?${q}` : ""}`);
  },
  obterContaPagar: (id) => request(`/contas-pagar/${id}`),
  criarContaPagar: (data) => request("/contas-pagar", { method: "POST", body: data }),
  atualizarContaPagar: (id, data) => request(`/contas-pagar/${id}`, { method: "PUT", body: data }),
  pagarConta: (id, pagamento) => request(`/contas-pagar/${id}/pagar`, { method: "POST", body: { pagamento } }),
  reabrirContaPagar: (id) => request(`/contas-pagar/${id}/reabrir`, { method: "POST" }),
  cancelarContaPagar: (id) => request(`/contas-pagar/${id}/cancelar`, { method: "POST" }),
  excluirContaPagar: (id) => request(`/contas-pagar/${id}`, { method: "DELETE" }),

  listarContasReceber: ({ search = "", status = "", clienteId = "", dataInicio = "", dataFim = "", vencidas = "" } = {}) => {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (status) qs.set("status", status);
    if (clienteId) qs.set("clienteId", clienteId);
    if (dataInicio) qs.set("dataInicio", dataInicio);
    if (dataFim) qs.set("dataFim", dataFim);
    if (vencidas) qs.set("vencidas", vencidas);
    const q = qs.toString();
    return request(`/contas-receber${q ? `?${q}` : ""}`);
  },
  obterContaReceber: (id) => request(`/contas-receber/${id}`),
  criarContaReceber: (data) => request("/contas-receber", { method: "POST", body: data }),
  atualizarContaReceber: (id, data) => request(`/contas-receber/${id}`, { method: "PUT", body: data }),
  receberConta: (id, recebimento) => request(`/contas-receber/${id}/receber`, { method: "POST", body: { recebimento } }),
  reabrirContaReceber: (id) => request(`/contas-receber/${id}/reabrir`, { method: "POST" }),
  cancelarContaReceber: (id) => request(`/contas-receber/${id}/cancelar`, { method: "POST" }),
  excluirContaReceber: (id) => request(`/contas-receber/${id}`, { method: "DELETE" }),
};
