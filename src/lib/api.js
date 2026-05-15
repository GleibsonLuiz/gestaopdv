// URL do backend. Em producao (Vercel), VITE_API_URL e injetado pela
// variavel de ambiente do projeto. Em dev, default para o backend local.
export const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3333";

// Multi-tenant: o JWT armazenado em localStorage carrega o `tid` (tenant id)
// dentro do payload. Toda requisicao autenticada enviada por request()
// inclui Authorization: Bearer <token>, e o backend extrai o tenantId do
// JWT para isolar dados via Prisma extension (ver backend/src/lib/prisma.js).
//
// Os dados da empresa logada (id, nome, cnpj) sao salvos junto da sessao
// para permitir exibir contexto no header da UI sem ter que decodificar
// o JWT no front.

const TOKEN_KEY = "gestao_token";
const USER_KEY = "gestao_user";
const EMPRESA_KEY = "gestao_empresa";

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

export function getEmpresa() {
  try {
    const raw = localStorage.getItem(EMPRESA_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(token, user, empresa = null) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (empresa) {
    localStorage.setItem(EMPRESA_KEY, JSON.stringify(empresa));
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EMPRESA_KEY);
}

// Interceptor de autenticacao multi-tenant: cada chamada autenticada
// injeta automaticamente o JWT (lido do localStorage) no header
// Authorization. Em 401 o backend ja invalidou o token, entao
// limpamos a sessao localmente e disparamos auth:logout para o
// App.jsx redirecionar pro Login.
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

// Upload multipart (anexos). Nao seta Content-Type — o browser monta o
// boundary correto automaticamente quando recebe FormData.
async function uploadForm(path, formData) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: formData });
  } catch {
    throw new Error("Não foi possível conectar ao servidor.");
  }
  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new Event("auth:logout"));
  }
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = { erro: text }; } }
  if (!res.ok) {
    const err = new Error((data && (data.erro || data.message)) || `Erro ${res.status}`);
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  login: (email, senha) => request("/auth/login", { method: "POST", body: { email, senha }, auth: false }),
  me: () => request("/auth/me"),
  // Multi-tenant signup publico — cria Empresa + admin User em transacao
  // e ja retorna { token, user, empresa } pronto para auto-login.
  signup: (dados) => request("/tenants/signup", { method: "POST", body: dados, auth: false }),
  trocarSenha: (senhaAtual, senhaNova) =>
    request("/auth/senha", { method: "PUT", body: { senhaAtual, senhaNova } }),

  listarClientes: ({ search = "", ativo = "", segmento = "", tagId = "", statusFunil = "", origem = "" } = {}) => {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (ativo !== "") qs.set("ativo", ativo);
    if (segmento) qs.set("segmento", segmento);
    if (tagId) qs.set("tagId", tagId);
    if (statusFunil) qs.set("statusFunil", statusFunil);
    if (origem) qs.set("origem", origem);
    const q = qs.toString();
    return request(`/clientes${q ? `?${q}` : ""}`);
  },
  obterCliente: (id) => request(`/clientes/${id}`),
  perfilCliente: (id) => request(`/clientes/${id}/perfil`),
  listarInteracoes: (clienteId) => request(`/clientes/${clienteId}/interacoes`),
  criarInteracao: (clienteId, data) => request(`/clientes/${clienteId}/interacoes`, { method: "POST", body: data }),
  excluirInteracao: (clienteId, id) => request(`/clientes/${clienteId}/interacoes/${id}`, { method: "DELETE" }),

  listarContatos: (clienteId) => request(`/clientes/${clienteId}/contatos`),
  criarContato: (clienteId, data) => request(`/clientes/${clienteId}/contatos`, { method: "POST", body: data }),
  atualizarContato: (clienteId, id, data) => request(`/clientes/${clienteId}/contatos/${id}`, { method: "PUT", body: data }),
  excluirContato: (clienteId, id) => request(`/clientes/${clienteId}/contatos/${id}`, { method: "DELETE" }),
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

  listarFormasPagamento: ({ ativo = "" } = {}) => {
    const qs = new URLSearchParams();
    if (ativo !== "") qs.set("ativo", ativo);
    const query = qs.toString();
    return request(`/formas-pagamento${query ? `?${query}` : ""}`);
  },
  criarFormaPagamento: (data) => request("/formas-pagamento", { method: "POST", body: data }),
  atualizarFormaPagamento: (id, data) => request(`/formas-pagamento/${id}`, { method: "PUT", body: data }),
  excluirFormaPagamento: (id) => request(`/formas-pagamento/${id}`, { method: "DELETE" }),

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
  enviarImagemProduto: (id, file) => {
    const fd = new FormData();
    fd.append("imagem", file);
    return uploadForm(`/produtos/${id}/imagem`, fd);
  },
  excluirImagemProduto: (id) => request(`/produtos/${id}/imagem`, { method: "DELETE" }),

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
  estornarCompra: (id, motivo) => request(`/compras/${id}/estornar`, { method: "POST", body: { motivo } }),

  // Lista enxuta de usuarios ativos {id, nome, role} para selects de
  // "responsavel" — disponivel para todos (nao exige modulo FUNCIONARIOS).
  listarResponsaveis: () => request("/funcionarios/responsaveis"),
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
  reabrirVenda: (id, autorizacao) => request(`/vendas/${id}/reabrir`, {
    method: "POST",
    body: autorizacao && autorizacao.emailAutorizacao ? autorizacao : undefined,
  }),
  refinalizarVenda: (id, data) => request(`/vendas/${id}/refinalizar`, { method: "POST", body: data }),

  // ==================== ORCAMENTOS / ORDENS DE SERVICO ====================
  listarOrcamentos: ({ clienteId = "", status = "", tipo = "", dataInicio = "", dataFim = "", search = "", limite = "" } = {}) => {
    const qs = new URLSearchParams();
    if (clienteId) qs.set("clienteId", clienteId);
    if (status) qs.set("status", status);
    if (tipo) qs.set("tipo", tipo);
    if (dataInicio) qs.set("dataInicio", dataInicio);
    if (dataFim) qs.set("dataFim", dataFim);
    if (search) qs.set("search", search);
    if (limite) qs.set("limite", limite);
    const q = qs.toString();
    return request(`/orcamentos${q ? `?${q}` : ""}`);
  },
  obterOrcamento: (id) => request(`/orcamentos/${id}`),
  criarOrcamento: (data) => request("/orcamentos", { method: "POST", body: data }),
  atualizarOrcamento: (id, data) => request(`/orcamentos/${id}`, { method: "PUT", body: data }),
  alterarStatusOrcamento: (id, status, motivo) =>
    request(`/orcamentos/${id}/status`, { method: "POST", body: { status, motivo } }),
  converterOrcamentoEmVenda: (id, formaPagamento) =>
    request(`/orcamentos/${id}/converter-venda`, { method: "POST", body: { formaPagamento } }),
  excluirOrcamento: (id) => request(`/orcamentos/${id}`, { method: "DELETE" }),

  // ==================== NPS POS-VENDA ====================
  // Endpoints publicos (sem auth): cliente acessa pela URL ?nps=<token>
  obterPesquisaNpsPublica: (token) => request(`/nps/publico/${token}`, { auth: false }),
  responderPesquisaNps: (token, data) =>
    request(`/nps/publico/${token}`, { method: "POST", body: data, auth: false }),
  // Privados
  resumoNps: ({ dias = "" } = {}) => {
    const qs = new URLSearchParams();
    if (dias) qs.set("dias", String(dias));
    const q = qs.toString();
    return request(`/nps/resumo${q ? `?${q}` : ""}`);
  },
  listarPesquisasNps: ({ status = "", limite = "" } = {}) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (limite) qs.set("limite", String(limite));
    const q = qs.toString();
    return request(`/nps${q ? `?${q}` : ""}`);
  },

  // ==================== AUTOMACOES (CRM) ====================
  listarAutomacoes: ({ ativo = "", tipo = "" } = {}) => {
    const qs = new URLSearchParams();
    if (ativo !== "") qs.set("ativo", ativo);
    if (tipo) qs.set("tipo", tipo);
    const q = qs.toString();
    return request(`/automacoes${q ? `?${q}` : ""}`);
  },
  obterAutomacao: (id) => request(`/automacoes/${id}`),
  criarAutomacao: (data) => request("/automacoes", { method: "POST", body: data }),
  atualizarAutomacao: (id, data) => request(`/automacoes/${id}`, { method: "PUT", body: data }),
  excluirAutomacao: (id) => request(`/automacoes/${id}`, { method: "DELETE" }),
  executarAutomacao: (id) => request(`/automacoes/${id}/executar`, { method: "POST" }),
  executarTodasAutomacoes: () => request("/automacoes/executar", { method: "POST" }),
  listarLogsAutomacao: ({ regraId = "", limite = "" } = {}) => {
    const qs = new URLSearchParams();
    if (regraId) qs.set("regraId", regraId);
    if (limite) qs.set("limite", String(limite));
    const q = qs.toString();
    return request(`/automacoes/logs${q ? `?${q}` : ""}`);
  },

  // ==================== TEMPLATES DE MENSAGEM ====================
  listarTemplates: ({ tipo = "", ativo = "" } = {}) => {
    const qs = new URLSearchParams();
    if (tipo) qs.set("tipo", tipo);
    if (ativo !== "") qs.set("ativo", ativo);
    const q = qs.toString();
    return request(`/templates${q ? `?${q}` : ""}`);
  },
  obterTemplate: (id) => request(`/templates/${id}`),
  criarTemplate: (data) => request("/templates", { method: "POST", body: data }),
  atualizarTemplate: (id, data) => request(`/templates/${id}`, { method: "PUT", body: data }),
  excluirTemplate: (id) => request(`/templates/${id}`, { method: "DELETE" }),

  // ==================== TAGS / SEGMENTACAO RFM ====================
  listarTags: () => request("/tags"),
  criarTag: (data) => request("/tags", { method: "POST", body: data }),
  atualizarTag: (id, data) => request(`/tags/${id}`, { method: "PUT", body: data }),
  excluirTag: (id) => request(`/tags/${id}`, { method: "DELETE" }),
  atribuirTagCliente: (clienteId, tagId) =>
    request(`/tags/clientes/${clienteId}/${tagId}`, { method: "POST" }),
  removerTagCliente: (clienteId, tagId) =>
    request(`/tags/clientes/${clienteId}/${tagId}`, { method: "DELETE" }),
  segmentosClientes: ({ dias = "" } = {}) => {
    const qs = new URLSearchParams();
    if (dias) qs.set("dias", String(dias));
    const q = qs.toString();
    return request(`/clientes/segmentos${q ? `?${q}` : ""}`);
  },
  aniversariantes: ({ mes = "", dia = "" } = {}) => {
    const qs = new URLSearchParams();
    if (mes) qs.set("mes", String(mes));
    if (dia) qs.set("dia", String(dia));
    const q = qs.toString();
    return request(`/clientes/aniversariantes${q ? `?${q}` : ""}`);
  },
  clientesReativacao: ({ diasMin = "" } = {}) => {
    const qs = new URLSearchParams();
    if (diasMin) qs.set("diasMin", String(diasMin));
    const q = qs.toString();
    return request(`/clientes/reativacao${q ? `?${q}` : ""}`);
  },

  // ==================== OPORTUNIDADES (FUNIL CRM) ====================
  listarOportunidades: ({ etapa = "", responsavelId = "", clienteId = "", origem = "", search = "", minhas = "" } = {}) => {
    const qs = new URLSearchParams();
    if (etapa) qs.set("etapa", etapa);
    if (responsavelId) qs.set("responsavelId", responsavelId);
    if (clienteId) qs.set("clienteId", clienteId);
    if (origem) qs.set("origem", origem);
    if (search) qs.set("search", search);
    if (minhas) qs.set("minhas", minhas);
    const q = qs.toString();
    return request(`/oportunidades${q ? `?${q}` : ""}`);
  },
  resumoFunilOportunidades: ({ responsavelId = "", minhas = "" } = {}) => {
    const qs = new URLSearchParams();
    if (responsavelId) qs.set("responsavelId", responsavelId);
    if (minhas) qs.set("minhas", minhas);
    const q = qs.toString();
    return request(`/oportunidades/resumo${q ? `?${q}` : ""}`);
  },
  obterOportunidade: (id) => request(`/oportunidades/${id}`),
  criarOportunidade: (data) => request("/oportunidades", { method: "POST", body: data }),
  atualizarOportunidade: (id, data) => request(`/oportunidades/${id}`, { method: "PUT", body: data }),
  moverEtapaOportunidade: (id, etapa, extras = {}) =>
    request(`/oportunidades/${id}/mover`, { method: "POST", body: { etapa, ...extras } }),
  excluirOportunidade: (id) => request(`/oportunidades/${id}`, { method: "DELETE" }),

  listarTarefas: ({ status = "", prioridade = "", responsavelId = "", clienteId = "", minhas = "", atrasadas = "" } = {}) => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (prioridade) qs.set("prioridade", prioridade);
    if (responsavelId) qs.set("responsavelId", responsavelId);
    if (clienteId) qs.set("clienteId", clienteId);
    if (minhas) qs.set("minhas", minhas);
    if (atrasadas) qs.set("atrasadas", atrasadas);
    const q = qs.toString();
    return request(`/tarefas${q ? `?${q}` : ""}`);
  },
  obterTarefa: (id) => request(`/tarefas/${id}`),
  criarTarefa: (data) => request("/tarefas", { method: "POST", body: data }),
  atualizarTarefa: (id, data) => request(`/tarefas/${id}`, { method: "PUT", body: data }),
  concluirTarefa: (id) => request(`/tarefas/${id}/concluir`, { method: "POST" }),
  reabrirTarefa: (id) => request(`/tarefas/${id}/reabrir`, { method: "POST" }),
  excluirTarefa: (id) => request(`/tarefas/${id}`, { method: "DELETE" }),

  obterDashboard: () => request("/dashboard/resumo"),
  obterDashboardCrm: ({ dias = "" } = {}) => {
    const qs = new URLSearchParams();
    if (dias) qs.set("dias", String(dias));
    const q = qs.toString();
    return request(`/dashboard/crm${q ? `?${q}` : ""}`);
  },
  obterAlertas: () => request("/alertas"),

  relatorioVendas: ({ dataInicio = "", dataFim = "", formaPagamento = "", clienteId = "", userId = "" } = {}) => {
    const qs = new URLSearchParams();
    if (dataInicio) qs.set("dataInicio", dataInicio);
    if (dataFim) qs.set("dataFim", dataFim);
    if (formaPagamento) qs.set("formaPagamento", formaPagamento);
    if (clienteId) qs.set("clienteId", clienteId);
    if (userId) qs.set("userId", userId);
    const q = qs.toString();
    return request(`/relatorios/vendas${q ? `?${q}` : ""}`);
  },
  relatorioCompras: ({ dataInicio = "", dataFim = "", fornecedorId = "" } = {}) => {
    const qs = new URLSearchParams();
    if (dataInicio) qs.set("dataInicio", dataInicio);
    if (dataFim) qs.set("dataFim", dataFim);
    if (fornecedorId) qs.set("fornecedorId", fornecedorId);
    const q = qs.toString();
    return request(`/relatorios/compras${q ? `?${q}` : ""}`);
  },
  relatorioFinanceiro: ({ dataInicio = "", dataFim = "", tipo = "", clienteId = "", fornecedorId = "" } = {}) => {
    const qs = new URLSearchParams();
    if (dataInicio) qs.set("dataInicio", dataInicio);
    if (dataFim) qs.set("dataFim", dataFim);
    if (tipo) qs.set("tipo", tipo);
    if (clienteId) qs.set("clienteId", clienteId);
    if (fornecedorId) qs.set("fornecedorId", fornecedorId);
    const q = qs.toString();
    return request(`/relatorios/financeiro${q ? `?${q}` : ""}`);
  },
  relatorioEstoque: ({ categoriaId = "", fornecedorId = "", situacao = "" } = {}) => {
    const qs = new URLSearchParams();
    if (categoriaId) qs.set("categoriaId", categoriaId);
    if (fornecedorId) qs.set("fornecedorId", fornecedorId);
    if (situacao) qs.set("situacao", situacao);
    const q = qs.toString();
    return request(`/relatorios/estoque${q ? `?${q}` : ""}`);
  },
  relatorioCaixas: ({ dataInicio = "", dataFim = "", userId = "" } = {}) => {
    const qs = new URLSearchParams();
    if (dataInicio) qs.set("dataInicio", dataInicio);
    if (dataFim) qs.set("dataFim", dataFim);
    if (userId) qs.set("userId", userId);
    const q = qs.toString();
    return request(`/relatorios/caixas${q ? `?${q}` : ""}`);
  },
  relatorioFunilCrm: ({ dataInicio = "", dataFim = "", responsavelId = "", origem = "" } = {}) => {
    const qs = new URLSearchParams();
    if (dataInicio) qs.set("dataInicio", dataInicio);
    if (dataFim) qs.set("dataFim", dataFim);
    if (responsavelId) qs.set("responsavelId", responsavelId);
    if (origem) qs.set("origem", origem);
    const q = qs.toString();
    return request(`/relatorios/crm/funil${q ? `?${q}` : ""}`);
  },
  relatorioPerformanceCrm: ({ dataInicio = "", dataFim = "", responsavelId = "" } = {}) => {
    const qs = new URLSearchParams();
    if (dataInicio) qs.set("dataInicio", dataInicio);
    if (dataFim) qs.set("dataFim", dataFim);
    if (responsavelId) qs.set("responsavelId", responsavelId);
    const q = qs.toString();
    return request(`/relatorios/crm/performance${q ? `?${q}` : ""}`);
  },
  relatorioCarteiraCrm: ({ janelaDias = "", segmento = "", tagId = "", statusFunil = "", cidade = "" } = {}) => {
    const qs = new URLSearchParams();
    if (janelaDias) qs.set("janelaDias", janelaDias);
    if (segmento) qs.set("segmento", segmento);
    if (tagId) qs.set("tagId", tagId);
    if (statusFunil) qs.set("statusFunil", statusFunil);
    if (cidade) qs.set("cidade", cidade);
    const q = qs.toString();
    return request(`/relatorios/crm/carteira${q ? `?${q}` : ""}`);
  },
  relatorioNpsCrm: ({ dataInicio = "", dataFim = "", userId = "", somenteRespondidas = "" } = {}) => {
    const qs = new URLSearchParams();
    if (dataInicio) qs.set("dataInicio", dataInicio);
    if (dataFim) qs.set("dataFim", dataFim);
    if (userId) qs.set("userId", userId);
    if (somenteRespondidas) qs.set("somenteRespondidas", somenteRespondidas);
    const q = qs.toString();
    return request(`/relatorios/crm/nps${q ? `?${q}` : ""}`);
  },
  relatorioAtividadesCrm: ({ dataInicio = "", dataFim = "", userId = "", diasInativo = "" } = {}) => {
    const qs = new URLSearchParams();
    if (dataInicio) qs.set("dataInicio", dataInicio);
    if (dataFim) qs.set("dataFim", dataFim);
    if (userId) qs.set("userId", userId);
    if (diasInativo) qs.set("diasInativo", diasInativo);
    const q = qs.toString();
    return request(`/relatorios/crm/atividades${q ? `?${q}` : ""}`);
  },
  relatorioForecastCrm: ({ mesesFuturos = "", responsavelId = "", origem = "" } = {}) => {
    const qs = new URLSearchParams();
    if (mesesFuturos) qs.set("mesesFuturos", mesesFuturos);
    if (responsavelId) qs.set("responsavelId", responsavelId);
    if (origem) qs.set("origem", origem);
    const q = qs.toString();
    return request(`/relatorios/crm/forecast${q ? `?${q}` : ""}`);
  },
  relatorioPerdasCrm: ({ dataInicio = "", dataFim = "", responsavelId = "", origem = "", buscaMotivo = "" } = {}) => {
    const qs = new URLSearchParams();
    if (dataInicio) qs.set("dataInicio", dataInicio);
    if (dataFim) qs.set("dataFim", dataFim);
    if (responsavelId) qs.set("responsavelId", responsavelId);
    if (origem) qs.set("origem", origem);
    if (buscaMotivo) qs.set("buscaMotivo", buscaMotivo);
    const q = qs.toString();
    return request(`/relatorios/crm/perdas${q ? `?${q}` : ""}`);
  },

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
  pagarConta: (id, body) => {
    const payload = typeof body === "string" || body instanceof Date
      ? { pagamento: body }
      : (body || {});
    return request(`/contas-pagar/${id}/pagar`, { method: "POST", body: payload });
  },
  reabrirContaPagar: (id) => request(`/contas-pagar/${id}/reabrir`, { method: "POST" }),
  cancelarContaPagar: (id) => request(`/contas-pagar/${id}/cancelar`, { method: "POST" }),
  excluirContaPagar: (id) => request(`/contas-pagar/${id}`, { method: "DELETE" }),
  anexarContaPagar: (id, file) => {
    const fd = new FormData();
    fd.append("arquivo", file);
    return uploadForm(`/contas-pagar/${id}/anexos`, fd);
  },
  excluirAnexoContaPagar: (id, anexoId) =>
    request(`/contas-pagar/${id}/anexos/${anexoId}`, { method: "DELETE" }),

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
  receberConta: (id, body) => {
    const payload = typeof body === "string" || body instanceof Date
      ? { recebimento: body }
      : (body || {});
    return request(`/contas-receber/${id}/receber`, { method: "POST", body: payload });
  },
  reabrirContaReceber: (id) => request(`/contas-receber/${id}/reabrir`, { method: "POST" }),
  cancelarContaReceber: (id) => request(`/contas-receber/${id}/cancelar`, { method: "POST" }),
  excluirContaReceber: (id) => request(`/contas-receber/${id}`, { method: "DELETE" }),
  anexarContaReceber: (id, file) => {
    const fd = new FormData();
    fd.append("arquivo", file);
    return uploadForm(`/contas-receber/${id}/anexos`, fd);
  },
  excluirAnexoContaReceber: (id, anexoId) =>
    request(`/contas-receber/${id}/anexos/${anexoId}`, { method: "DELETE" }),

  resetarSistema: (confirmacao) =>
    request("/admin/reset", { method: "POST", body: { confirmacao } }),

  // ==================== FIDELIDADE ====================
  obterConfiguracaoFidelidade: () => request("/fidelidade/configuracao"),
  salvarConfiguracaoFidelidade: (data) => request("/fidelidade/configuracao", { method: "PUT", body: data }),
  pontosFidelidade: (clienteId) => request(`/fidelidade/pontos/${clienteId}`),
  ajustarPontosFidelidade: (clienteId, data) => request(`/fidelidade/pontos/${clienteId}/ajustar`, { method: "POST", body: data }),

  // ==================== CONFIGURACAO DA EMPRESA ====================
  obterConfiguracao: () => request("/configuracao"),
  salvarConfiguracao: (dados) => request("/configuracao", { method: "PUT", body: dados }),
  enviarLogotipo: (file) => {
    const fd = new FormData();
    fd.append("logotipo", file);
    return uploadForm("/configuracao/logotipo", fd);
  },
  excluirLogotipo: () => request("/configuracao/logotipo", { method: "DELETE" }),

  // ==================== CAIXA ====================
  obterCaixaAtual: () => request("/caixas/atual"),
  obterPainelPDV: () => request("/pdv/inicio"),
  sugerirTrocoCaixa: () => request("/caixas/sugestao-troco"),
  listarCaixas: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== "" && v != null)
    ).toString();
    return request(`/caixas${qs ? `?${qs}` : ""}`);
  },
  obterExtratoCaixa: (id) => request(`/caixas/${id}/extrato`),
  abrirCaixa: ({ saldoInicial, observacoesAbertura }) =>
    request("/caixas/abrir", {
      method: "POST",
      body: { saldoInicial, observacoesAbertura },
    }),
  fecharCaixa: (id, { saldoFinalContado, trocoProximoDia, observacoesFechamento, emailAutorizacao, senhaAutorizacao }) =>
    request(`/caixas/${id}/fechar`, {
      method: "POST",
      body: { saldoFinalContado, trocoProximoDia, observacoesFechamento, emailAutorizacao, senhaAutorizacao },
    }),
  sangriaCaixa: (id, { valor, descricao, emailAutorizacao, senhaAutorizacao }) =>
    request(`/caixas/${id}/sangria`, {
      method: "POST",
      body: { valor, descricao, emailAutorizacao, senhaAutorizacao },
    }),
  suprimentoCaixa: (id, { valor, descricao }) =>
    request(`/caixas/${id}/suprimento`, { method: "POST", body: { valor, descricao } }),

  // Comissoes
  listarComissoes: ({ ativo = "" } = {}) => {
    const q = ativo ? `?ativo=${ativo}` : "";
    return request(`/comissoes${q}`);
  },
  listarVendedoresComissao: () => request("/comissoes/vendedores"),
  obterComissao: (userId) => request(`/comissoes/${userId}`),
  salvarComissao: (userId, dados) =>
    request(`/comissoes/${userId}`, { method: "PUT", body: dados }),
  excluirComissao: (userId) =>
    request(`/comissoes/${userId}`, { method: "DELETE" }),
  relatorioComissoes: ({ dataInicio = "", dataFim = "", userId = "" } = {}) => {
    const params = new URLSearchParams();
    if (dataInicio) params.set("dataInicio", dataInicio);
    if (dataFim) params.set("dataFim", dataFim);
    if (userId) params.set("userId", userId);
    const q = params.toString();
    return request(`/comissoes/relatorio${q ? `?${q}` : ""}`);
  },

  // Logout server-side. Best-effort: limpa sessao local mesmo se falhar.
  logout: () => request("/auth/logout", { method: "POST" }).catch(() => null),

  // Auditoria — ADMIN only.
  listarLogs: ({ usuarioId = "", modulo = "", acao = "", sucesso = "",
                 dataInicio = "", dataFim = "", busca = "",
                 pagina = 1, tamanho = 50 } = {}) => {
    const qs = new URLSearchParams();
    if (usuarioId) qs.set("usuarioId", usuarioId);
    if (modulo) qs.set("modulo", modulo);
    if (acao) qs.set("acao", acao);
    if (sucesso !== "") qs.set("sucesso", sucesso);
    if (dataInicio) qs.set("dataInicio", dataInicio);
    if (dataFim) qs.set("dataFim", dataFim);
    if (busca) qs.set("busca", busca);
    qs.set("pagina", String(pagina));
    qs.set("tamanho", String(tamanho));
    return request(`/logs?${qs.toString()}`);
  },
  resumoLogs: () => request("/logs/resumo"),
  filtrosLogs: () => request("/logs/filtros"),
};
