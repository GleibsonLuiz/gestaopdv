// URL do backend. Em producao (Vercel), VITE_API_URL e injetado pela
// variavel de ambiente do projeto. Em dev, default para o backend local.
export const BASE_URL: string = import.meta.env.VITE_API_URL || "http://localhost:3333";

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

export type Role = "ADMIN" | "GERENTE" | "VENDEDOR";

export interface SessionUser {
  id: string;
  email: string;
  nome?: string;
  role: Role;
  permissoes?: string[];
  superAdmin?: boolean;
  ativo?: boolean;
  [extra: string]: unknown;
}

export type SegmentoEmpresa = "GERAL" | "AUTO_PECAS" | "FARMACIA" | "PAPELARIA";

export interface SessionEmpresa {
  id: string;
  nome: string;
  cnpj?: string;
  plano?: string;
  segmento?: SegmentoEmpresa;
  [extra: string]: unknown;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function getEmpresa(): SessionEmpresa | null {
  try {
    const raw = localStorage.getItem(EMPRESA_KEY);
    return raw ? (JSON.parse(raw) as SessionEmpresa) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: SessionUser, empresa: SessionEmpresa | null = null): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (empresa) {
    localStorage.setItem(EMPRESA_KEY, JSON.stringify(empresa));
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EMPRESA_KEY);
}

// Interceptor de autenticacao multi-tenant: cada chamada autenticada
// injeta automaticamente o JWT (lido do localStorage) no header
// Authorization. Em 401 o backend ja invalidou o token, entao
// limpamos a sessao localmente e disparamos auth:logout para o
// App.jsx redirecionar pro Login.
async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Não foi possível conectar ao servidor. O backend está rodando em http://localhost:3333?");
  }

  if (res.status === 401 && auth) {
    clearSession();
    window.dispatchEvent(new Event("auth:logout"));
  }

  if (res.status === 204) return null as T;

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { erro: text }; }
  }

  if (!res.ok) {
    const d = data as { erro?: string; message?: string } | null;
    const msg = (d && (d.erro || d.message)) || `Erro ${res.status}`;
    throw new ApiError(msg, res.status, data);
  }

  return data as T;
}

// Upload multipart (anexos). Nao seta Content-Type — o browser monta o
// boundary correto automaticamente quando recebe FormData.
async function uploadForm<T = unknown>(path: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: formData });
  } catch {
    throw new Error("Não foi possível conectar ao servidor.");
  }
  if (res.status === 401) {
    clearSession();
    window.dispatchEvent(new Event("auth:logout"));
  }
  let data: unknown = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = { erro: text }; } }
  if (!res.ok) {
    const d = data as { erro?: string; message?: string } | null;
    const msg = (d && (d.erro || d.message)) || `Erro ${res.status}`;
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

// Tipos auxiliares para os filtros de listagem (todos com keys opcionais
// e values string/number — sao serializados em URLSearchParams).
type StringDict = Record<string, string | number | boolean | undefined | null>;

function qsFrom(filtros: StringDict): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export const api = {
  login: (email: string, senha: string) =>
    request("/auth/login", { method: "POST", body: { email, senha }, auth: false }),
  me: () => request("/auth/me"),
  // ETAPA 10: signup agora exige super-admin (auditado pelo backend).
  // Usado pela tela /admin-master.
  signup: (dados: unknown) => request("/tenants/signup", { method: "POST", body: dados }),

  // Empresa (tenant) do usuario logado — GET retorna nome + cnpj +
  // estatisticas; PUT permite editar nome/cnpj (so ADMIN).
  obterEmpresa: () => request("/empresa"),
  atualizarEmpresa: (dados: unknown) => request("/empresa", { method: "PUT", body: dados }),

  // ============ ADMIN MASTER (super-admin only) ============
  // Endpoints exclusivos do desenvolvedor do sistema. Todos retornam 403
  // se o JWT nao tem `sa: true`.
  adminMasterListarEmpresas: () => request("/admin-master/empresas"),
  adminMasterEstatisticas: () => request("/admin-master/estatisticas"),
  adminMasterCriarEmpresa: (dados: unknown) =>
    request("/admin-master/empresas", { method: "POST", body: dados }),
  adminMasterAlterarStatus: (id: string, ativo: boolean, motivo?: string) =>
    request(`/admin-master/empresas/${id}/status`, {
      method: "PATCH", body: { ativo, motivo },
    }),
  // ETAPA 11
  adminMasterResetarEmpresa: (id: string) =>
    request(`/admin-master/empresas/${id}/reset`, {
      method: "POST", body: { confirmacao: "CONFIRMAR_RESET" },
    }),
  adminMasterListarUsers: (tenantId?: string) => {
    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
    return request(`/admin-master/users${qs}`);
  },
  adminMasterAlterarSuperAdmin: (id: string, superAdmin: boolean) =>
    request(`/admin-master/users/${id}/super-admin`, {
      method: "PATCH", body: { superAdmin },
    }),
  adminMasterImpersonate: (userId: string) =>
    request(`/admin-master/impersonate/${userId}`, { method: "POST" }),
  adminMasterLogs: (filtros: StringDict = {}) =>
    request(`/admin-master/logs${qsFrom(filtros)}`),
  adminMasterMetricas: (diasAtras: number | string = 30) =>
    request(`/admin-master/metricas?diasAtras=${diasAtras}`),
  adminMasterFinanceiro: () =>
    request("/admin-master/financeiro"),

  // ETAPA 12
  adminMasterAlterarPlano: (id: string, dados: unknown) =>
    request(`/admin-master/empresas/${id}/plano`, { method: "PATCH", body: dados }),
  // ETAPA#6: segmento de negocio (super-admin only)
  adminMasterAlterarSegmento: (id: string, segmento: SegmentoEmpresa) =>
    request(`/admin-master/empresas/${id}/segmento`, { method: "PATCH", body: { segmento } }),
  adminMasterExportEmpresaUrl: (id: string) =>
    `${BASE_URL}/admin-master/empresas/${id}/export`,
  adminMasterListarNotificacoes: () =>
    request("/admin-master/notificacoes"),
  adminMasterCriarNotificacao: (dados: unknown) =>
    request("/admin-master/notificacoes", { method: "POST", body: dados }),
  adminMasterAlterarAtivaNotificacao: (id: string, ativa: boolean) =>
    request(`/admin-master/notificacoes/${id}`, { method: "PATCH", body: { ativa } }),
  adminMasterDeletarNotificacao: (id: string) =>
    request(`/admin-master/notificacoes/${id}`, { method: "DELETE" }),

  // Notificacoes do user logado (banner global)
  notificacoesMinhas: () => request("/notificacoes"),
  notificacoesMarcarLida: (id: string) =>
    request(`/notificacoes/${id}/marcar-lida`, { method: "POST" }),
  trocarSenha: (senhaAtual: string, senhaNova: string) =>
    request("/auth/senha", { method: "PUT", body: { senhaAtual, senhaNova } }),
  // Sync de preferencias de UI (tema, sidebar) entre dispositivos. O backend
  // faz merge raso, entao chamadas parciais (so { sidebarCollapsed: true })
  // preservam outras chaves.
  salvarPreferencias: (body: Record<string, unknown>) =>
    request("/auth/preferencias", { method: "PUT", body }),

  listarClientes: (filtros: StringDict = {}) =>
    request(`/clientes${qsFrom(filtros)}`),
  obterCliente: (id: string) => request(`/clientes/${id}`),
  perfilCliente: (id: string) => request(`/clientes/${id}/perfil`),
  // Lead score individual (0-100) com breakdown por componente. Usa a mesma
  // mediaTotal global de /clientes/segmentos para consistencia entre telas.
  obterScoreCliente: (id: string) => request(`/clientes/${id}/score`),
  listarInteracoes: (clienteId: string) => request(`/clientes/${clienteId}/interacoes`),
  criarInteracao: (clienteId: string, data: unknown) =>
    request(`/clientes/${clienteId}/interacoes`, { method: "POST", body: data }),
  excluirInteracao: (clienteId: string, id: string) =>
    request(`/clientes/${clienteId}/interacoes/${id}`, { method: "DELETE" }),

  listarContatos: (clienteId: string) => request(`/clientes/${clienteId}/contatos`),
  criarContato: (clienteId: string, data: unknown) =>
    request(`/clientes/${clienteId}/contatos`, { method: "POST", body: data }),
  atualizarContato: (clienteId: string, id: string, data: unknown) =>
    request(`/clientes/${clienteId}/contatos/${id}`, { method: "PUT", body: data }),
  excluirContato: (clienteId: string, id: string) =>
    request(`/clientes/${clienteId}/contatos/${id}`, { method: "DELETE" }),
  criarCliente: (data: unknown) => request("/clientes", { method: "POST", body: data }),
  atualizarCliente: (id: string, data: unknown) =>
    request(`/clientes/${id}`, { method: "PUT", body: data }),
  excluirCliente: (id: string) => request(`/clientes/${id}`, { method: "DELETE" }),

  listarFornecedores: (filtros: StringDict = {}) =>
    request(`/fornecedores${qsFrom(filtros)}`),
  obterFornecedor: (id: string) => request(`/fornecedores/${id}`),
  criarFornecedor: (data: unknown) => request("/fornecedores", { method: "POST", body: data }),
  atualizarFornecedor: (id: string, data: unknown) =>
    request(`/fornecedores/${id}`, { method: "PUT", body: data }),
  excluirFornecedor: (id: string) => request(`/fornecedores/${id}`, { method: "DELETE" }),

  listarCategorias: () => request("/categorias"),
  criarCategoria: (data: unknown) => request("/categorias", { method: "POST", body: data }),
  atualizarCategoria: (id: string, data: unknown) =>
    request(`/categorias/${id}`, { method: "PUT", body: data }),
  excluirCategoria: (id: string) => request(`/categorias/${id}`, { method: "DELETE" }),

  listarFormasPagamento: (filtros: StringDict = {}) =>
    request(`/formas-pagamento${qsFrom(filtros)}`),
  criarFormaPagamento: (data: unknown) =>
    request("/formas-pagamento", { method: "POST", body: data }),
  atualizarFormaPagamento: (id: string, data: unknown) =>
    request(`/formas-pagamento/${id}`, { method: "PUT", body: data }),
  excluirFormaPagamento: (id: string) =>
    request(`/formas-pagamento/${id}`, { method: "DELETE" }),

  listarProdutos: (filtros: StringDict = {}) =>
    request(`/produtos${qsFrom(filtros)}`),
  obterProduto: (id: string) => request(`/produtos/${id}`),
  criarProduto: (data: unknown) => request("/produtos", { method: "POST", body: data }),
  atualizarProduto: (id: string, data: unknown) =>
    request(`/produtos/${id}`, { method: "PUT", body: data }),
  excluirProduto: (id: string) => request(`/produtos/${id}`, { method: "DELETE" }),
  enviarImagemProduto: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("imagem", file);
    return uploadForm(`/produtos/${id}/imagem`, fd);
  },
  excluirImagemProduto: (id: string) =>
    request(`/produtos/${id}/imagem`, { method: "DELETE" }),

  listarMovimentacoes: (filtros: StringDict = {}) =>
    request(`/estoque/movimentacoes${qsFrom(filtros)}`),
  criarMovimentacao: (data: unknown) =>
    request("/estoque/movimentacoes", { method: "POST", body: data }),

  listarCompras: (filtros: StringDict = {}) =>
    request(`/compras${qsFrom(filtros)}`),
  obterCompra: (id: string) => request(`/compras/${id}`),
  criarCompra: (data: unknown) => request("/compras", { method: "POST", body: data }),
  estornarCompra: (id: string, motivo: string) =>
    request(`/compras/${id}/estornar`, { method: "POST", body: { motivo } }),

  // ==================== INVENTARIO COM CONTAGEM CEGA ====================
  // O backend NUNCA expoe estoqueLogico ao operador da contagem — a
  // resposta de getFolhaContagem ja vem filtrada. So o gestor (obter)
  // recebe divergencias e impacto financeiro.
  listarInventarios: (filtros: StringDict = {}) =>
    request(`/inventarios${qsFrom(filtros)}`),
  obterInventario: (id: string) => request(`/inventarios/${id}`),
  abrirInventario: (data: unknown) =>
    request("/inventarios", { method: "POST", body: data }),
  folhaInventario: (id: string) => request(`/inventarios/${id}/folha`),
  salvarContagensInventario: (id: string, contagens: unknown) =>
    request(`/inventarios/${id}/contagens`, { method: "POST", body: { contagens } }),
  consolidarInventario: (id: string) =>
    request(`/inventarios/${id}/consolidar`, { method: "POST" }),
  cancelarInventario: (id: string) =>
    request(`/inventarios/${id}/cancelar`, { method: "POST" }),

  // Lista enxuta de usuarios ativos {id, nome, role} para selects de
  // "responsavel" — disponivel para todos (nao exige modulo FUNCIONARIOS).
  listarResponsaveis: () => request("/funcionarios/responsaveis"),
  listarFuncionarios: (filtros: StringDict = {}) =>
    request(`/funcionarios${qsFrom(filtros)}`),
  obterFuncionario: (id: string) => request(`/funcionarios/${id}`),
  criarFuncionario: (data: unknown) => request("/funcionarios", { method: "POST", body: data }),
  atualizarFuncionario: (id: string, data: unknown) =>
    request(`/funcionarios/${id}`, { method: "PUT", body: data }),
  excluirFuncionario: (id: string) => request(`/funcionarios/${id}`, { method: "DELETE" }),

  listarVendas: (filtros: StringDict = {}) =>
    request(`/vendas${qsFrom(filtros)}`),
  obterVenda: (id: string) => request(`/vendas/${id}`),
  criarVenda: (data: unknown) => request("/vendas", { method: "POST", body: data }),
  cancelarVenda: (id: string) => request(`/vendas/${id}/cancelar`, { method: "POST" }),
  reabrirVenda: (id: string, autorizacao?: { emailAutorizacao?: string } | null) =>
    request(`/vendas/${id}/reabrir`, {
      method: "POST",
      body: autorizacao && autorizacao.emailAutorizacao ? autorizacao : undefined,
    }),
  refinalizarVenda: (id: string, data: unknown) =>
    request(`/vendas/${id}/refinalizar`, { method: "POST", body: data }),

  // ==================== ORCAMENTOS / ORDENS DE SERVICO ====================
  listarOrcamentos: (filtros: StringDict = {}) =>
    request(`/orcamentos${qsFrom(filtros)}`),
  obterOrcamento: (id: string) => request(`/orcamentos/${id}`),
  criarOrcamento: (data: unknown) => request("/orcamentos", { method: "POST", body: data }),
  atualizarOrcamento: (id: string, data: unknown) =>
    request(`/orcamentos/${id}`, { method: "PUT", body: data }),
  alterarStatusOrcamento: (id: string, status: string, motivo?: string) =>
    request(`/orcamentos/${id}/status`, { method: "POST", body: { status, motivo } }),
  converterOrcamentoEmVenda: (id: string, formaPagamento: string) =>
    request(`/orcamentos/${id}/converter-venda`, { method: "POST", body: { formaPagamento } }),
  excluirOrcamento: (id: string) => request(`/orcamentos/${id}`, { method: "DELETE" }),

  // ==================== NPS POS-VENDA ====================
  // Endpoints publicos (sem auth): cliente acessa pela URL ?nps=<token>
  obterPesquisaNpsPublica: (token: string) =>
    request(`/nps/publico/${token}`, { auth: false }),
  responderPesquisaNps: (token: string, data: unknown) =>
    request(`/nps/publico/${token}`, { method: "POST", body: data, auth: false }),
  // Privados
  resumoNps: (filtros: StringDict = {}) =>
    request(`/nps/resumo${qsFrom(filtros)}`),
  listarPesquisasNps: (filtros: StringDict = {}) =>
    request(`/nps${qsFrom(filtros)}`),
  // Retorna { token, criadaEm, vendaId } da pesquisa NPS pendente mais
  // recente do cliente. 404 quando o cliente nao tem pesquisa pendente.
  obterLinkNpsPendente: (clienteId: string) =>
    request<{ token: string; criadaEm: string; vendaId: string }>(
      `/nps/cliente/${clienteId}/link-pendente`,
    ),

  // ==================== AUTOMACOES (CRM) ====================
  listarAutomacoes: (filtros: StringDict = {}) =>
    request(`/automacoes${qsFrom(filtros)}`),
  obterAutomacao: (id: string) => request(`/automacoes/${id}`),
  criarAutomacao: (data: unknown) => request("/automacoes", { method: "POST", body: data }),
  atualizarAutomacao: (id: string, data: unknown) =>
    request(`/automacoes/${id}`, { method: "PUT", body: data }),
  excluirAutomacao: (id: string) => request(`/automacoes/${id}`, { method: "DELETE" }),
  executarAutomacao: (id: string) => request(`/automacoes/${id}/executar`, { method: "POST" }),
  executarTodasAutomacoes: () => request("/automacoes/executar", { method: "POST" }),
  listarLogsAutomacao: (filtros: StringDict = {}) =>
    request(`/automacoes/logs${qsFrom(filtros)}`),

  // ==================== TEMPLATES DE MENSAGEM ====================
  listarTemplates: (filtros: StringDict = {}) =>
    request(`/templates${qsFrom(filtros)}`),
  obterTemplate: (id: string) => request(`/templates/${id}`),
  criarTemplate: (data: unknown) => request("/templates", { method: "POST", body: data }),
  atualizarTemplate: (id: string, data: unknown) =>
    request(`/templates/${id}`, { method: "PUT", body: data }),
  excluirTemplate: (id: string) => request(`/templates/${id}`, { method: "DELETE" }),

  // ==================== TAGS / SEGMENTACAO RFM ====================
  listarTags: () => request("/tags"),
  criarTag: (data: unknown) => request("/tags", { method: "POST", body: data }),
  atualizarTag: (id: string, data: unknown) =>
    request(`/tags/${id}`, { method: "PUT", body: data }),
  excluirTag: (id: string) => request(`/tags/${id}`, { method: "DELETE" }),
  atribuirTagCliente: (clienteId: string, tagId: string) =>
    request(`/tags/clientes/${clienteId}/${tagId}`, { method: "POST" }),
  removerTagCliente: (clienteId: string, tagId: string) =>
    request(`/tags/clientes/${clienteId}/${tagId}`, { method: "DELETE" }),
  segmentosClientes: (filtros: StringDict = {}) =>
    request(`/clientes/segmentos${qsFrom(filtros)}`),
  aniversariantes: (filtros: StringDict = {}) =>
    request(`/clientes/aniversariantes${qsFrom(filtros)}`),
  clientesReativacao: (filtros: StringDict = {}) =>
    request(`/clientes/reativacao${qsFrom(filtros)}`),

  // ==================== OPORTUNIDADES (FUNIL CRM) ====================
  listarOportunidades: (filtros: StringDict = {}) =>
    request(`/oportunidades${qsFrom(filtros)}`),
  resumoFunilOportunidades: (filtros: StringDict = {}) =>
    request(`/oportunidades/resumo${qsFrom(filtros)}`),
  obterOportunidade: (id: string) => request(`/oportunidades/${id}`),
  criarOportunidade: (data: unknown) => request("/oportunidades", { method: "POST", body: data }),
  atualizarOportunidade: (id: string, data: unknown) =>
    request(`/oportunidades/${id}`, { method: "PUT", body: data }),
  moverEtapaOportunidade: (id: string, etapa: string, extras: Record<string, unknown> = {}) =>
    request(`/oportunidades/${id}/mover`, { method: "POST", body: { etapa, ...extras } }),
  excluirOportunidade: (id: string) => request(`/oportunidades/${id}`, { method: "DELETE" }),

  listarTarefas: (filtros: StringDict = {}) =>
    request(`/tarefas${qsFrom(filtros)}`),
  obterTarefa: (id: string) => request(`/tarefas/${id}`),
  criarTarefa: (data: unknown) => request("/tarefas", { method: "POST", body: data }),
  atualizarTarefa: (id: string, data: unknown) =>
    request(`/tarefas/${id}`, { method: "PUT", body: data }),
  concluirTarefa: (id: string) => request(`/tarefas/${id}/concluir`, { method: "POST" }),
  reabrirTarefa: (id: string) => request(`/tarefas/${id}/reabrir`, { method: "POST" }),
  excluirTarefa: (id: string) => request(`/tarefas/${id}`, { method: "DELETE" }),

  obterDashboard: () => request("/dashboard/resumo"),
  obterDashboardCrm: (filtros: StringDict = {}) =>
    request(`/dashboard/crm${qsFrom(filtros)}`),
  obterAlertas: () => request("/alertas"),

  relatorioVendas: (filtros: StringDict = {}) =>
    request(`/relatorios/vendas${qsFrom(filtros)}`),
  relatorioCompras: (filtros: StringDict = {}) =>
    request(`/relatorios/compras${qsFrom(filtros)}`),
  relatorioFinanceiro: (filtros: StringDict = {}) =>
    request(`/relatorios/financeiro${qsFrom(filtros)}`),
  relatorioEstoque: (filtros: StringDict = {}) =>
    request(`/relatorios/estoque${qsFrom(filtros)}`),
  relatorioCaixas: (filtros: StringDict = {}) =>
    request(`/relatorios/caixas${qsFrom(filtros)}`),
  relatorioFunilCrm: (filtros: StringDict = {}) =>
    request(`/relatorios/crm/funil${qsFrom(filtros)}`),
  relatorioPerformanceCrm: (filtros: StringDict = {}) =>
    request(`/relatorios/crm/performance${qsFrom(filtros)}`),
  relatorioCarteiraCrm: (filtros: StringDict = {}) =>
    request(`/relatorios/crm/carteira${qsFrom(filtros)}`),
  relatorioNpsCrm: (filtros: StringDict = {}) =>
    request(`/relatorios/crm/nps${qsFrom(filtros)}`),
  relatorioAtividadesCrm: (filtros: StringDict = {}) =>
    request(`/relatorios/crm/atividades${qsFrom(filtros)}`),
  relatorioForecastCrm: (filtros: StringDict = {}) =>
    request(`/relatorios/crm/forecast${qsFrom(filtros)}`),
  relatorioPerdasCrm: (filtros: StringDict = {}) =>
    request(`/relatorios/crm/perdas${qsFrom(filtros)}`),

  listarContasPagar: (filtros: StringDict = {}) =>
    request(`/contas-pagar${qsFrom(filtros)}`),
  obterContaPagar: (id: string) => request(`/contas-pagar/${id}`),
  criarContaPagar: (data: unknown) => request("/contas-pagar", { method: "POST", body: data }),
  atualizarContaPagar: (id: string, data: unknown) =>
    request(`/contas-pagar/${id}`, { method: "PUT", body: data }),
  pagarConta: (id: string, body?: string | Date | Record<string, unknown> | null) => {
    const payload = typeof body === "string" || body instanceof Date
      ? { pagamento: body }
      : (body || {});
    return request(`/contas-pagar/${id}/pagar`, { method: "POST", body: payload });
  },
  reabrirContaPagar: (id: string) => request(`/contas-pagar/${id}/reabrir`, { method: "POST" }),
  cancelarContaPagar: (id: string) => request(`/contas-pagar/${id}/cancelar`, { method: "POST" }),
  excluirContaPagar: (id: string) => request(`/contas-pagar/${id}`, { method: "DELETE" }),
  anexarContaPagar: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("arquivo", file);
    return uploadForm(`/contas-pagar/${id}/anexos`, fd);
  },
  excluirAnexoContaPagar: (id: string, anexoId: string) =>
    request(`/contas-pagar/${id}/anexos/${anexoId}`, { method: "DELETE" }),

  listarContasReceber: (filtros: StringDict = {}) =>
    request(`/contas-receber${qsFrom(filtros)}`),
  obterContaReceber: (id: string) => request(`/contas-receber/${id}`),
  criarContaReceber: (data: unknown) => request("/contas-receber", { method: "POST", body: data }),
  atualizarContaReceber: (id: string, data: unknown) =>
    request(`/contas-receber/${id}`, { method: "PUT", body: data }),
  receberConta: (id: string, body?: string | Date | Record<string, unknown> | null) => {
    const payload = typeof body === "string" || body instanceof Date
      ? { recebimento: body }
      : (body || {});
    return request(`/contas-receber/${id}/receber`, { method: "POST", body: payload });
  },
  reabrirContaReceber: (id: string) => request(`/contas-receber/${id}/reabrir`, { method: "POST" }),
  cancelarContaReceber: (id: string) => request(`/contas-receber/${id}/cancelar`, { method: "POST" }),
  excluirContaReceber: (id: string) => request(`/contas-receber/${id}`, { method: "DELETE" }),
  anexarContaReceber: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("arquivo", file);
    return uploadForm(`/contas-receber/${id}/anexos`, fd);
  },
  excluirAnexoContaReceber: (id: string, anexoId: string) =>
    request(`/contas-receber/${id}/anexos/${anexoId}`, { method: "DELETE" }),

  resetarSistema: (confirmacao: string) =>
    request("/admin/reset", { method: "POST", body: { confirmacao } }),

  // ==================== FIDELIDADE ====================
  obterConfiguracaoFidelidade: () => request("/fidelidade/configuracao"),
  salvarConfiguracaoFidelidade: (data: unknown) =>
    request("/fidelidade/configuracao", { method: "PUT", body: data }),
  pontosFidelidade: (clienteId: string) => request(`/fidelidade/pontos/${clienteId}`),
  ajustarPontosFidelidade: (clienteId: string, data: unknown) =>
    request(`/fidelidade/pontos/${clienteId}/ajustar`, { method: "POST", body: data }),

  // ==================== CONFIGURACAO DA EMPRESA ====================
  obterConfiguracao: () => request("/configuracao"),
  salvarConfiguracao: (dados: unknown) => request("/configuracao", { method: "PUT", body: dados }),
  enviarLogotipo: (file: File) => {
    const fd = new FormData();
    fd.append("logotipo", file);
    return uploadForm("/configuracao/logotipo", fd);
  },
  excluirLogotipo: () => request("/configuracao/logotipo", { method: "DELETE" }),

  // ==================== CONFIGURACAO IMPRESSORA NAO-FISCAL ====================
  obterConfiguracaoImpressora: () => request("/configuracao-impressora"),
  salvarConfiguracaoImpressora: (dados: unknown) =>
    request("/configuracao-impressora", { method: "PUT", body: dados }),

  // ==================== MERCADO PAGO POINT (MAQUININHA) ====================
  // GET retorna estado da config (token sempre mascarado). PUT permite
  // partial update: omitir um campo o preserva, passar "" em mpAccessToken
  // limpa a credencial. mpAtivo controla se o botao "Cobrar na maquininha"
  // aparece no PDV.
  obterConfigMp: () => request("/pagamentos-mp/config"),
  salvarConfigMp: (dados: {
    mpAccessToken?: string | null;
    mpDeviceId?: string | null;
    mpUserIdMp?: string | null;
    mpAtivo?: boolean;
    mpPixAtivo?: boolean;
  }) => request("/pagamentos-mp/config", { method: "PUT", body: dados }),
  listarDevicesMp: () => request("/pagamentos-mp/devices"),
  cobrarMp: (dados: { tipo: "CREDIT" | "DEBIT" | "PIX"; vendaPayload: unknown }) =>
    request("/pagamentos-mp/cobrar", { method: "POST", body: dados }),
  statusMp: (id: string) => request(`/pagamentos-mp/status/${id}`),
  cancelarMp: (id: string) =>
    request(`/pagamentos-mp/status/${id}/cancelar`, { method: "POST" }),

  // ==================== CAIXA ====================
  obterCaixaAtual: () => request("/caixas/atual"),
  obterPainelPDV: () => request("/pdv/inicio"),
  sugerirTrocoCaixa: () => request("/caixas/sugestao-troco"),
  listarCaixas: (params: StringDict = {}) =>
    request(`/caixas${qsFrom(params)}`),
  obterExtratoCaixa: (id: string) => request(`/caixas/${id}/extrato`),
  abrirCaixa: (
    { saldoInicial, observacoesAbertura }:
      { saldoInicial: number; observacoesAbertura?: string }
  ) =>
    request("/caixas/abrir", {
      method: "POST",
      body: { saldoInicial, observacoesAbertura },
    }),
  fecharCaixa: (
    id: string,
    { saldoFinalContado, trocoProximoDia, observacoesFechamento, emailAutorizacao, senhaAutorizacao }:
      { saldoFinalContado: number; trocoProximoDia?: number;
        observacoesFechamento?: string; emailAutorizacao?: string; senhaAutorizacao?: string }
  ) =>
    request(`/caixas/${id}/fechar`, {
      method: "POST",
      body: { saldoFinalContado, trocoProximoDia, observacoesFechamento, emailAutorizacao, senhaAutorizacao },
    }),
  sangriaCaixa: (
    id: string,
    { valor, descricao, emailAutorizacao, senhaAutorizacao }:
      { valor: number; descricao: string; emailAutorizacao?: string; senhaAutorizacao?: string }
  ) =>
    request(`/caixas/${id}/sangria`, {
      method: "POST",
      body: { valor, descricao, emailAutorizacao, senhaAutorizacao },
    }),
  suprimentoCaixa: (
    id: string,
    { valor, descricao }: { valor: number; descricao: string }
  ) =>
    request(`/caixas/${id}/suprimento`, { method: "POST", body: { valor, descricao } }),

  // Comissoes
  listarComissoes: (filtros: StringDict = {}) =>
    request(`/comissoes${qsFrom(filtros)}`),
  listarVendedoresComissao: () => request("/comissoes/vendedores"),
  obterComissao: (userId: string) => request(`/comissoes/${userId}`),
  salvarComissao: (userId: string, dados: unknown) =>
    request(`/comissoes/${userId}`, { method: "PUT", body: dados }),
  excluirComissao: (userId: string) =>
    request(`/comissoes/${userId}`, { method: "DELETE" }),
  relatorioComissoes: (filtros: StringDict = {}) =>
    request(`/comissoes/relatorio${qsFrom(filtros)}`),

  // ETAPA#9b: Atendimento Inteligente WhatsApp + IA
  obterConfigWhatsapp: () => request("/whatsapp/config"),
  salvarConfigWhatsapp: (dados: unknown) =>
    request("/whatsapp/config", { method: "PUT", body: dados }),
  removerConfigWhatsapp: () =>
    request("/whatsapp/config", { method: "DELETE" }),
  obterQrCodeWhatsapp: () => request("/whatsapp/qrcode"),
  obterStatusWhatsapp: () => request("/whatsapp/status"),
  listarLogsWhatsapp: (filtros: StringDict = {}) =>
    request(`/whatsapp/logs${qsFrom(filtros)}`),

  // ETAPA#8b: Central de Comandas
  listarComandas: (filtros: StringDict = {}) =>
    request(`/comandas${qsFrom(filtros)}`),
  obterComanda: (id: string) => request(`/comandas/${id}`),
  comandasAbertasPorMesa: (mesa: string) =>
    request(`/comandas/abertas${qsFrom({ mesa })}`),
  criarComanda: (data: unknown) =>
    request("/comandas", { method: "POST", body: data }),
  adicionarItensComanda: (id: string, data: unknown) =>
    request(`/comandas/${id}/itens`, { method: "POST", body: data }),
  aceitarComanda: (id: string) =>
    request(`/comandas/${id}/aceitar`, { method: "PATCH" }),
  prontoComanda: (id: string) =>
    request(`/comandas/${id}/pronto`, { method: "PATCH" }),
  servindoComanda: (id: string) =>
    request(`/comandas/${id}/servindo`, { method: "PATCH" }),
  emEntregaComanda: (id: string, entregadorNome?: string) =>
    request(`/comandas/${id}/em-entrega`, { method: "PATCH", body: entregadorNome ? { entregadorNome } : undefined }),
  cancelarComanda: (id: string, motivo?: string) =>
    request(`/comandas/${id}/cancelar`, { method: "PATCH", body: { motivo } }),
  finalizarComanda: (id: string, dados: { formaPagamento: string; idTransacao?: string }) =>
    request(`/comandas/${id}/finalizar`, { method: "POST", body: dados }),
  resumoComandas: () => request("/comandas/resumo"),

  // Logout server-side. Best-effort: limpa sessao local mesmo se falhar.
  logout: () => request("/auth/logout", { method: "POST" }).catch(() => null),

  // Auditoria — ADMIN only.
  listarLogs: (filtros: StringDict & { pagina?: number; tamanho?: number } = {}) => {
    const { pagina = 1, tamanho = 50, ...rest } = filtros;
    return request(`/logs${qsFrom({ ...rest, pagina, tamanho })}`);
  },
  resumoLogs: () => request("/logs/resumo"),
  filtrosLogs: () => request("/logs/filtros"),
};
