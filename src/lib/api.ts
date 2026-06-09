// URL do backend. Em producao (Vercel), VITE_API_URL e injetado pela
// variavel de ambiente do projeto. Em dev, default para o backend local.
import { setModulosHabilitados } from "./permissoes";

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
  // Modulos efetivos liberados pelo plano (+ overrides). Usado para gatear a
  // sidebar via permissoes.setModulosHabilitados().
  modulos?: string[];
  [extra: string]: unknown;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  // Timeout customizado em ms. Default TIMEOUT_PADRAO_MS (15s). Operacoes
  // pesadas (backup completo, restore, exports grandes) usam valores maiores.
  timeoutMs?: number;
}

export type ApiErroKind = "NETWORK" | "TIMEOUT" | "SERVER_5XX" | "CLIENT_4XX" | "AUTH" | "ABORT";

export class ApiError extends Error {
  status: number;
  data: unknown;
  kind: ApiErroKind;
  constructor(message: string, status: number, data: unknown, kind: ApiErroKind = "CLIENT_4XX") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.kind = kind;
  }
}

// Timeout padrao para qualquer request HTTP em ms. Cobre o caso comum de
// conexao instavel sem deixar o usuario travado eternamente esperando.
const TIMEOUT_PADRAO_MS = 15_000;

// Emite "api:ok" / "api:falha" para o useNetworkStatus monitorar saude
// do backend sem precisar de polling. Mensagens amigaveis vao para o
// usuario via emitirToast (em toast.ts). Mantemos a comunicacao por
// CustomEvent para nao criar dependencia circular entre api.ts e toast.ts.
function notificarFalha(kind: ApiErroKind, detalhe?: { status?: number; path?: string }) {
  try {
    window.dispatchEvent(new CustomEvent("api:falha", { detail: { kind, ...detalhe } }));
  } catch { /* SSR/jest safety */ }
}
function notificarOk() {
  try { window.dispatchEvent(new Event("api:ok")); } catch {}
}

// Emite toast amigavel ao usuario classificado por tipo de falha. Evita
// flood: deduplica por kind+path durante uma janela curta (1.5s) — uma
// rajada de 5 requests falhando vira 1 toast.
const ultimosToasts = new Map<string, number>();
function avisarUsuarioFalha(kind: ApiErroKind, path: string) {
  const chave = `${kind}:${path}`;
  const agora = Date.now();
  const ultimo = ultimosToasts.get(chave) || 0;
  if (agora - ultimo < 1500) return;
  ultimosToasts.set(chave, agora);

  // Respeita preferencia per-browser do usuario: se ele desligou os avisos
  // de servidor (Empresa > Avisos de conexao), nao emite toasts automaticos
  // de rede. Erros 4xx continuam aparecendo via try/catch das telas.
  import("./preferenciasUI").then(({ getAvisosRedeAtivos }) => {
    if (!getAvisosRedeAtivos()) return;
    return import("./toast").then(({ emitirToast }) => {
    if (kind === "NETWORK") {
      emitirToast({
        tipo: "aviso",
        titulo: "Sem conexao com o servidor",
        mensagem: "Verifique sua internet e tente novamente.",
        duracao: 6000,
      });
    } else if (kind === "TIMEOUT") {
      emitirToast({
        tipo: "aviso",
        titulo: "Servidor demorou a responder",
        mensagem: "A operacao expirou. Tente novamente em alguns segundos.",
        duracao: 6000,
      });
    } else if (kind === "SERVER_5XX") {
      emitirToast({
        tipo: "erro",
        titulo: "Servidor com problemas",
        mensagem: "Falha temporaria no servidor. Tente novamente.",
        duracao: 6000,
      });
    }
    // CLIENT_4XX nao gera toast automatico — cada tela ja trata sua
    // mensagem de validacao especifica via try/catch.
    });
  }).catch(() => { /* sem UI disponivel */ });
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
    sincronizarModulos(empresa);
  }
}

// Atualiza so o cache da empresa (sem mexer em token/user). Usado no boot
// apos /auth/me para refletir mudancas feitas no Admin Master (ex: troca de
// segmento) sem exigir logout/login. Produtos.tsx e outras telas leem
// segmento de getEmpresa() entao precisam do cache atualizado.
export function setEmpresa(empresa: SessionEmpresa | null): void {
  if (empresa) {
    localStorage.setItem(EMPRESA_KEY, JSON.stringify(empresa));
    sincronizarModulos(empresa);
  } else {
    localStorage.removeItem(EMPRESA_KEY);
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EMPRESA_KEY);
  setModulosHabilitados(null);
}

// Aplica os modulos efetivos da empresa no gate da sidebar (permissoes.ts).
// Chamado sempre que a sessao/empresa e salva (login, /auth/me no boot).
function sincronizarModulos(empresa: SessionEmpresa): void {
  setModulosHabilitados(Array.isArray(empresa.modulos) ? empresa.modulos : null);
}

// Restaura o gate de modulos a partir do cache no carregamento do modulo, para
// a sidebar ja nascer correta antes de /auth/me resolver (evita "piscar" itens).
{
  const cache = getEmpresa();
  if (cache) setModulosHabilitados(Array.isArray(cache.modulos) ? cache.modulos : null);
}

// Interceptor de autenticacao multi-tenant: cada chamada autenticada
// injeta automaticamente o JWT (lido do localStorage) no header
// Authorization. Em 401 o backend ja invalidou o token, entao
// limpamos a sessao localmente e disparamos auth:logout para o
// App.jsx redirecionar pro Login.
async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, timeoutMs = TIMEOUT_PADRAO_MS } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  // AbortController: corta a request se ultrapassar timeoutMs.
  // Diferencia "servidor lento" (timeout) de "sem internet" (NETWORK).
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ac.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const ehTimeout = (err as Error)?.name === "TimeoutError" || ac.signal.aborted;
    const kind: ApiErroKind = ehTimeout ? "TIMEOUT" : "NETWORK";
    notificarFalha(kind, { path });
    avisarUsuarioFalha(kind, path);
    const msg = ehTimeout
      ? "O servidor demorou a responder. Tente novamente."
      : "Sem conexao com o servidor. Verifique sua internet.";
    throw new ApiError(msg, 0, null, kind);
  }
  clearTimeout(timer);

  if (res.status === 401 && auth) {
    clearSession();
    window.dispatchEvent(new Event("auth:logout"));
  }

  if (res.status === 204) {
    notificarOk();
    return null as T;
  }

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { erro: text }; }
  }

  if (!res.ok) {
    const d = data as { erro?: string; message?: string } | null;
    const msg = (d && (d.erro || d.message)) || `Erro ${res.status}`;
    const kind: ApiErroKind = res.status === 401 ? "AUTH"
      : res.status >= 500 ? "SERVER_5XX"
      : "CLIENT_4XX";
    if (kind === "SERVER_5XX") {
      notificarFalha(kind, { status: res.status, path });
      avisarUsuarioFalha(kind, path);
    } else {
      // 4xx ainda significa que o servidor RESPONDEU — saude OK.
      notificarOk();
    }
    throw new ApiError(msg, res.status, data, kind);
  }

  notificarOk();
  return data as T;
}

// Upload multipart (anexos). Nao seta Content-Type — o browser monta o
// boundary correto automaticamente quando recebe FormData.
async function uploadForm<T = unknown>(path: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // Upload pode ser pesado: timeout 60s. Mesmo padrao de classificacao do request().
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new DOMException("Timeout", "TimeoutError")), 60_000);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: formData, signal: ac.signal });
  } catch (err) {
    clearTimeout(timer);
    const ehTimeout = (err as Error)?.name === "TimeoutError" || ac.signal.aborted;
    const kind: ApiErroKind = ehTimeout ? "TIMEOUT" : "NETWORK";
    notificarFalha(kind, { path });
    avisarUsuarioFalha(kind, path);
    const msg = ehTimeout
      ? "Upload demorou demais. Tente novamente."
      : "Sem conexao com o servidor.";
    throw new ApiError(msg, 0, null, kind);
  }
  clearTimeout(timer);

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
    const kind: ApiErroKind = res.status === 401 ? "AUTH"
      : res.status >= 500 ? "SERVER_5XX"
      : "CLIENT_4XX";
    if (kind === "SERVER_5XX") {
      notificarFalha(kind, { status: res.status, path });
      avisarUsuarioFalha(kind, path);
    } else {
      notificarOk();
    }
    throw new ApiError(msg, res.status, data, kind);
  }
  notificarOk();
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

  // ============ ASSINATURA (billing do SaaS) ============
  // Estado da assinatura da empresa logada, catalogo de planos e contratacao.
  billingPlanos: () => request("/billing/planos"),
  billingAssinatura: () => request("/billing/assinatura"),
  billingAssinar: (plano: string) =>
    request("/billing/assinar", { method: "POST", body: { plano } }),

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
  // Assinatura / cobrancas por empresa (super-admin)
  adminMasterCobrancasEmpresa: (id: string) =>
    request(`/admin-master/empresas/${id}/cobrancas`),
  adminMasterMarcarCobrancaPaga: (id: string, cobrancaId: string) =>
    request(`/admin-master/empresas/${id}/cobrancas/${cobrancaId}/marcar-paga`, { method: "POST" }),
  adminMasterCancelarAssinatura: (id: string) =>
    request(`/admin-master/empresas/${id}/assinatura/cancelar`, { method: "POST" }),
  // Entitlements: define os modulos liberados de uma empresa. modulos=null
  // volta ao pacote padrao do plano.
  adminMasterAlterarModulos: (id: string, modulos: string[] | null) =>
    request(`/admin-master/empresas/${id}/modulos`, { method: "PATCH", body: { modulos } }),

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
  // Timeline unificada (Customer 360): feed cronologico de todos os eventos
  // do cliente (vendas, orcamentos, contas, interacoes, oportunidades, NPS,
  // pontos, tarefas).
  timelineCliente: (id: string) => request(`/clientes/${id}/timeline`),
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

  listarFabricantes: () => request("/fabricantes"),
  criarFabricante: (data: unknown) => request("/fabricantes", { method: "POST", body: data }),
  atualizarFabricante: (id: string, data: unknown) =>
    request(`/fabricantes/${id}`, { method: "PUT", body: data }),
  excluirFabricante: (id: string) => request(`/fabricantes/${id}`, { method: "DELETE" }),

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

  historicoComprasProduto: (id: string) =>
    request(`/produtos/${id}/compras`),
  // Valida um NCM (8 digitos) na BrasilAPI e devolve a descricao oficial.
  // Usado no cadastro de produto (aba Tributacao) ao sair do campo NCM.
  consultarNcm: (codigo: string) =>
    request<{ ncm: string; codigoFormatado: string; descricao: string }>(
      `/produtos/ncm/${encodeURIComponent(codigo)}`,
    ),
  // Sugere NCMs pelo nome/descricao do produto (proxy da BrasilAPI por termo).
  // Usado no cadastro (aba Tributacao) por quem nao sabe o codigo de cabeca.
  buscarNcm: (q: string) =>
    request<{
      termo: string | null;
      resultados: { ncm: string; codigoFormatado: string; descricao: string }[];
    }>(`/produtos/ncm?q=${encodeURIComponent(q)}`),
  // Sugere CEST a partir do NCM (tabela local Conv. 142/2018). CEST so se
  // aplica a itens com Substituicao Tributaria — lista vazia e comum/correto.
  sugerirCest: (ncm: string) =>
    request<{
      ncm: string;
      sugestoes: { cest: string; cestFormatado: string; descricao: string }[];
    }>(`/produtos/cest?ncm=${encodeURIComponent(ncm)}`),

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

  // ==================== SUGESTOES DE COMPRA (reposicao) ====================
  // A lista mescla sugestoes do sistema (estoque <= minimo, calculadas) com
  // itens adicionados manualmente. Ver sugestaoCompraController.js.
  listarSugestoesCompra: () => request("/sugestoes-compra"),
  adicionarSugestaoCompra: (data: unknown) =>
    request("/sugestoes-compra", { method: "POST", body: data }),
  atualizarSugestaoCompra: (produtoId: string, data: unknown) =>
    request(`/sugestoes-compra/${produtoId}`, { method: "PATCH", body: data }),
  descartarSugestaoCompra: (produtoId: string) =>
    request(`/sugestoes-compra/${produtoId}/descartar`, { method: "POST" }),
  removerSugestaoCompra: (produtoId: string) =>
    request(`/sugestoes-compra/${produtoId}`, { method: "DELETE" }),
  limparSugestoesCompra: (produtoIds: string[]) =>
    request("/sugestoes-compra/limpar", { method: "POST", body: { produtoIds } }),

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
  // Aceite online: gera/retorna o token publico e sobe RASCUNHO -> AGUARDANDO.
  gerarLinkPublicoOrcamento: (id: string) =>
    request(`/orcamentos/${id}/link-publico`, { method: "POST" }),
  // Endpoints publicos (sem auth): cliente acessa pela URL ?orc=<token>
  obterOrcamentoPublico: (token: string) =>
    request(`/orcamentos/publico/${token}`, { auth: false }),
  responderOrcamentoPublico: (token: string, data: unknown) =>
    request(`/orcamentos/publico/${token}`, { method: "POST", body: data, auth: false }),

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
  relatorioProdutosPorFabricante: (filtros: StringDict = {}) =>
    request(`/relatorios/produtos-fabricante${qsFrom(filtros)}`),
  relatorioCaixas: (filtros: StringDict = {}) =>
    request(`/relatorios/caixas${qsFrom(filtros)}`),
  relatorioLucratividade: (filtros: StringDict = {}) =>
    request(`/relatorios/lucratividade${qsFrom(filtros)}`),
  relatorioCurvaAbc: (filtros: StringDict = {}) =>
    request(`/relatorios/curva-abc${qsFrom(filtros)}`),
  relatorioGiroEstoque: (filtros: StringDict = {}) =>
    request(`/relatorios/giro-estoque${qsFrom(filtros)}`),
  relatorioSazonalidade: (filtros: StringDict = {}) =>
    request(`/relatorios/sazonalidade${qsFrom(filtros)}`),
  relatorioAgingReceber: (filtros: StringDict = {}) =>
    request(`/relatorios/aging-receber${qsFrom(filtros)}`),
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

  // ============ CONTABILIDADE: PLANO DE CONTAS + DESPESAS ============
  // Plano de contas (categorias). A primeira chamada cria o plano padrao.
  listarPlanosContas: (filtros: StringDict = {}) =>
    request(`/planos-contas${qsFrom(filtros)}`),
  arvorePlanosContas: () => request("/planos-contas/arvore"),
  criarPlanoConta: (data: unknown) => request("/planos-contas", { method: "POST", body: data }),
  atualizarPlanoConta: (id: string, data: unknown) =>
    request(`/planos-contas/${id}`, { method: "PUT", body: data }),
  excluirPlanoConta: (id: string) => request(`/planos-contas/${id}`, { method: "DELETE" }),
  restaurarPlanoContasPadrao: () =>
    request("/planos-contas/restaurar-padrao", { method: "POST" }),

  // Despesas operacionais. A criacao aceita comprovante (File) opcional e vai
  // como multipart (mesmo padrao dos anexos de contas).
  listarDespesas: (filtros: StringDict = {}) =>
    request(`/despesas${qsFrom(filtros)}`),
  // Relatorio Previsto x Realizado por categoria + contas a pagar pagas no
  // periodo (para o ledger unificado da tela de Despesas).
  previstoRealizado: (filtros: StringDict = {}) =>
    request(`/despesas/previsto-realizado${qsFrom(filtros)}`),
  obterDespesa: (id: string) => request(`/despesas/${id}`),
  criarDespesa: (data: Record<string, unknown>, file?: File | null) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined || v === null || v === "") continue;
      fd.append(k, String(v));
    }
    if (file) fd.append("arquivo", file);
    return uploadForm("/despesas", fd);
  },
  atualizarDespesa: (id: string, data: unknown) =>
    request(`/despesas/${id}`, { method: "PUT", body: data }),
  excluirDespesa: (id: string) => request(`/despesas/${id}`, { method: "DELETE" }),
  anexarDespesa: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("arquivo", file);
    return uploadForm(`/despesas/${id}/anexos`, fd);
  },
  excluirAnexoDespesa: (id: string, anexoId: string) =>
    request(`/despesas/${id}/anexos/${anexoId}`, { method: "DELETE" }),
  // OCR de comprovante: envia a foto/PDF e recebe campos sugeridos
  // { valor, data, descricao, cnpj, planoContaSugeridaId } para pre-preencher.
  lerComprovanteOCR: (file: File) => {
    const fd = new FormData();
    fd.append("arquivo", file);
    return uploadForm("/despesas/ocr", fd);
  },

  // Consolidacao contabil do periodo (portal do contador). Retorna
  // { inicio, fim, resumo, linhas[] }. O CSV/layout Dominio sai client-side.
  contabilidadeLancamentos: (filtros: StringDict = {}) =>
    request(`/contabilidade/lancamentos${qsFrom(filtros)}`),

  // Painel financeiro executivo (KPIs, distribuicao de despesas, ponto de
  // equilibrio e projecao de fluxo de caixa 30d). Tudo agregado no banco.
  contabilidadeDashboard: (filtros: StringDict = {}) =>
    request(`/contabilidade/dashboard${qsFrom(filtros)}`),

  // ============ ORDEM DE SERVICO ============
  osListar: (filtros: StringDict = {}) => request(`/ordens-servico${qsFrom(filtros)}`),
  osObter: (id: string) => request(`/ordens-servico/${id}`),
  osCriar: (dados: unknown) => request("/ordens-servico", { method: "POST", body: dados }),
  osAtualizar: (id: string, dados: unknown) => request(`/ordens-servico/${id}`, { method: "PUT", body: dados }),
  osMudarStatus: (id: string, status: string) => request(`/ordens-servico/${id}/status`, { method: "PATCH", body: { status } }),
  osExcluir: (id: string) => request(`/ordens-servico/${id}`, { method: "DELETE" }),

  // ============ CARDAPIO DIGITAL ============
  // Admin (autenticado)
  cardapioStatus: () => request("/empresa/cardapio"),
  cardapioConfigurar: (body: { ativo?: boolean; rotacionarToken?: boolean }) =>
    request("/empresa/cardapio", { method: "PATCH", body }),
  // Publico (sem auth) — pagina de pedido online
  cardapioPublicoObter: (token: string) =>
    request(`/cardapio/${encodeURIComponent(token)}`, { auth: false }),
  cardapioPublicoPedido: (token: string, body: unknown) =>
    request(`/cardapio/${encodeURIComponent(token)}/pedido`, { method: "POST", body, auth: false }),

  // ============ CREDIARIO (FIADO) ============
  crediarioListar: () => request("/crediario"),
  crediarioCaderneta: (clienteId: string) => request(`/crediario/${clienteId}`),
  crediarioLancar: (clienteId: string, dados: { valor: number; descricao?: string; vencimento?: string }) =>
    request(`/crediario/${clienteId}/lancar`, { method: "POST", body: dados }),
  crediarioDefinirLimite: (clienteId: string, limite: number | null) =>
    request(`/crediario/${clienteId}/limite`, { method: "PATCH", body: { limite } }),

  resetarSistema: (confirmacao: string) =>
    request("/admin/reset", { method: "POST", body: { confirmacao } }),

  // Backup/restore JSON via HTTP. Timeout 60s para cobrir bancos maiores —
  // o controller le todas as tabelas em paralelo via Prisma. Restore tem
  // timeout maior (120s) porque insere todos os registros em transacao.
  exportarBackup: () =>
    request("/backup/exportar", { method: "POST", timeoutMs: 60_000 }),
  restaurarBackup: (confirmacao: string, backup: unknown) =>
    request("/backup/restaurar", {
      method: "POST",
      body: { confirmacao, backup },
      timeoutMs: 120_000,
    }),

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

  // ==================== BOLETO HIBRIDO (BOLETO + PIX) VIA ASAAS ====================
  // Cobranca do LOJISTA ao CLIENTE FINAL pela conta Asaas do lojista (credencial
  // por-tenant). GET config retorna a chave sempre mascarada; PUT e partial
  // (passar "" em asaasApiKey limpa a credencial). O boleto e um meio de cobranca
  // de uma ContaReceber — quando pago, o webhook quita o titulo.
  obterConfigBoleto: () => request("/boletos/config"),
  salvarConfigBoleto: (dados: {
    asaasApiKey?: string | null;
    asaasAmbiente?: "producao" | "sandbox";
    asaasAtivo?: boolean;
    repassarTaxaBoleto?: boolean;
    valorTaxaBoleto?: number | null;
  }) => request("/boletos/config", { method: "PUT", body: dados }),
  listarBoletos: (filtro?: { contaReceberId?: string; clienteId?: string; status?: string }) => {
    const qs = new URLSearchParams(
      Object.entries(filtro || {}).filter(([, v]) => v) as [string, string][],
    ).toString();
    return request(`/boletos${qs ? `?${qs}` : ""}`);
  },
  criarBoleto: (dados: {
    clienteId?: string;
    contaReceberId?: string;
    vendaId?: string;
    valor?: number;
    vencimento?: string;
    descricao?: string;
  }) => request("/boletos", { method: "POST", body: dados }),
  statusBoleto: (id: string) => request(`/boletos/${id}`),
  cancelarBoleto: (id: string) =>
    request(`/boletos/${id}/cancelar`, { method: "POST" }),

  // ==================== FISCAL — NFC-e (modelo 65) ====================
  // Config do emitente. GET devolve o CSC sempre mascarado + prontidao
  // (lista de campos faltantes p/ ativar). PUT e partial: omitir mantem,
  // passar "" em csc limpa. fiscalAtivo so liga se a prontidao estiver ok.
  obterConfigFiscal: () => request("/fiscal/config"),
  salvarConfigFiscal: (dados: {
    provedorFiscal?: string | null;
    ambienteFiscal?: "HOMOLOGACAO" | "PRODUCAO";
    crt?: number | null;
    cnae?: string | null;
    inscMunicipal?: string | null;
    ieSubstitutoTrib?: string | null;
    regimeEspecialISSQN?: number | null;
    codMunicipioIBGE?: string | null;
    codUFIBGE?: string | null;
    codPais?: string | null;
    nomePais?: string | null;
    serieNfce?: number;
    proximoNumeroNfce?: number;
    cscId?: string | null;
    csc?: string | null;
    fiscalAtivo?: boolean;
    // NFS-e (servicos / ISS)
    nfseAtivo?: boolean;
    serieNfse?: number;
    proximoNumeroNfse?: number;
    itemListaServicoPadrao?: string | null;
    codTributacaoMunicipioPadrao?: string | null;
    aliquotaIssPadrao?: number | null;
  }) => request("/fiscal/config", { method: "PUT", body: dados }),

  // Emissao / consulta de NFC-e (modelo 65).
  emitirNfce: (vendaId: string) =>
    request("/fiscal/nfce", { method: "POST", body: { vendaId } }),
  listarNotasFiscais: (params?: { status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    const s = qs.toString();
    return request(`/fiscal/nfce${s ? `?${s}` : ""}`);
  },
  obterNotaFiscal: (id: string, comXml = false) =>
    request(`/fiscal/nfce/${id}${comXml ? "?xml=1" : ""}`),
  consultarNotaFiscal: (id: string) =>
    request(`/fiscal/nfce/${id}/consultar`, { method: "POST" }),
  cancelarNotaFiscal: (id: string, justificativa: string) =>
    request(`/fiscal/nfce/${id}/cancelar`, { method: "POST", body: { justificativa } }),
  inutilizarNumeracaoFiscal: (dados: {
    serie: number; numeroInicial: number; numeroFinal: number; justificativa: string;
  }) => request("/fiscal/inutilizar", { method: "POST", body: dados }),
  statusServicoFiscal: () => request("/fiscal/status-servico"),

  // ==================== FISCAL — NFS-e (servicos / ISS) ====================
  // Emissao a partir de uma Ordem de Servico ({ ordemServicoId }) ou avulsa
  // ({ avulsa: { tomador, valorServicos, discriminacao, ... } }). Overrides de
  // classificacao (itemListaServico, aliquotaIss, ...) podem ir no nivel raiz.
  emitirNfse: (dados: {
    ordemServicoId?: string;
    avulsa?: Record<string, unknown>;
    valorServicos?: number;
    discriminacao?: string;
    itemListaServico?: string;
    codTributacaoMunicipio?: string;
    codMunicipioPrestacao?: string;
    aliquotaIss?: number;
    issRetido?: boolean;
    valorDeducoes?: number;
    tomadorCpfCnpj?: string;
    tomadorNome?: string;
  }) => request("/fiscal/nfse", { method: "POST", body: dados }),
  listarNfse: (params?: { status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    const s = qs.toString();
    return request(`/fiscal/nfse${s ? `?${s}` : ""}`);
  },
  obterNfse: (id: string, comXml = false) =>
    request(`/fiscal/nfse/${id}${comXml ? "?xml=1" : ""}`),
  consultarNfse: (id: string) =>
    request(`/fiscal/nfse/${id}/consultar`, { method: "POST" }),
  cancelarNfse: (id: string, justificativa: string) =>
    request(`/fiscal/nfse/${id}/cancelar`, { method: "POST", body: { justificativa } }),
  // Baixa o DANFSE (PDF do gateway) com Authorization e abre numa nova aba.
  abrirPdfNfse: async (id: string): Promise<void> => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}/fiscal/nfse/${id}/pdf`, { headers });
    if (!res.ok) throw new Error("Falha ao baixar o DANFSE.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  // ============ FISCAL — ENTRADA de NF-e de fornecedor (importacao de compra) ============
  // Upload do XML -> valida (422 com `erros` se reprovar) -> staging RECEBIDA
  // com `conciliacao` (sugestoes de de-para). efetivar transforma em Compra.
  uploadEntradaNfe: (xml: string) =>
    request("/fiscal/entrada", { method: "POST", body: { xml } }),
  listarEntradasNfe: (params?: { status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    const s = qs.toString();
    return request(`/fiscal/entrada${s ? `?${s}` : ""}`);
  },
  obterEntradaNfe: (id: string) => request(`/fiscal/entrada/${id}`),
  efetivarEntradaNfe: (
    id: string,
    body: { fornecedorId?: string; itens: { numero: number; produtoId: string; precoUnitario?: number }[] },
  ) => request(`/fiscal/entrada/${id}/efetivar`, { method: "POST", body }),
  estornarEntradaNfe: (id: string, motivo?: string) =>
    request(`/fiscal/entrada/${id}/estornar`, { method: "POST", body: { motivo } }),
  descartarEntradaNfe: (id: string) =>
    request(`/fiscal/entrada/${id}/descartar`, { method: "POST" }),

  // Distribuicao DF-e — NF-e recebidas contra o CNPJ (caixa de entrada da SEFAZ).
  sincronizarDfe: () => request("/fiscal/dfe/sincronizar", { method: "POST" }),
  listarDfe: (params?: { status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    const s = qs.toString();
    return request(`/fiscal/dfe${s ? `?${s}` : ""}`);
  },
  baixarDfe: (id: string) => request(`/fiscal/dfe/${id}/baixar`, { method: "POST" }),
  ignorarDfe: (id: string) => request(`/fiscal/dfe/${id}/ignorar`, { method: "POST" }),

  // ==================== CAIXA ====================
  obterCaixaAtual: () => request("/caixas/atual"),
  obterPainelPDV: () => request("/pdv/inicio"),

  // Vendas em espera (park/hold do PDV): congelar o atendimento atual para
  // retomar depois. Visivel para todo o tenant.
  listarVendasEspera: () => request("/pdv/vendas-espera"),
  salvarVendaEspera: (data: unknown) =>
    request("/pdv/vendas-espera", { method: "POST", body: data }),
  excluirVendaEspera: (id: string) =>
    request(`/pdv/vendas-espera/${id}`, { method: "DELETE" }),
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
  // Painel de metas do mes (pacing + ranking). mes opcional (YYYY-MM).
  metasMesComissoes: (filtros: StringDict = {}) =>
    request(`/comissoes/metas-mes${qsFrom(filtros)}`),

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
