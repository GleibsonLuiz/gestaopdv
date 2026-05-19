// Middleware de auditoria. Captura todas as mutacoes (POST/PUT/PATCH/DELETE)
// e grava em logs_auditoria depois da resposta. Tenta carregar o estado
// anterior para entidades conhecidas (UPDATE/DELETE) e calcular o diff.
//
// Implementacao fire-and-forget: a gravacao do log nunca segura a resposta
// e qualquer falha so vai pro console.error.
import prisma, { tenantStorage } from "../lib/prisma.js";

const METODOS_MUTACAO = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Rotas a NAO logar (saude, raiz, e auth que tem log explicito no controller).
// /auth/preferencias eh ignorado porque preferencia de UI nao eh evento
// auditavel — virou ruido em log.
const ROTAS_IGNORADAS = [
  "/health",
  "/auth/login",
  "/auth/logout",
  "/auth/trocar-senha",
  "/auth/preferencias",
];

// Mapeia primeiro segmento da rota -> { modulo, modelo (chave em prisma) }.
// Modelo permite carregar o estado anterior em UPDATE/DELETE para gerar diff.
// Quando nao mapeado, o log e gravado sem dadosAntes/diff.
const MAPA_ROTAS = {
  clientes:         { modulo: "CLIENTES",      modelo: "cliente" },
  fornecedores:     { modulo: "FORNECEDORES",  modelo: "fornecedor" },
  produtos:         { modulo: "PRODUTOS",      modelo: "produto" },
  categorias:       { modulo: "PRODUTOS",      modelo: "categoria" },
  estoque:          { modulo: "ESTOQUE",       modelo: "movimentacaoEstoque" },
  compras:          { modulo: "COMPRAS",       modelo: "compra" },
  vendas:           { modulo: "PDV",           modelo: "venda" },
  pdv:              { modulo: "PDV",           modelo: null },
  funcionarios:     { modulo: "FUNCIONARIOS",  modelo: "user" },
  "contas-pagar":   { modulo: "FINANCEIRO",    modelo: "contaPagar" },
  "contas-receber": { modulo: "FINANCEIRO",    modelo: "contaReceber" },
  caixas:           { modulo: "CAIXA",         modelo: "caixa" },
  orcamentos:       { modulo: "ORCAMENTOS",    modelo: "orcamento" },
  oportunidades:    { modulo: "OPORTUNIDADES", modelo: "oportunidade" },
  tags:             { modulo: "OPORTUNIDADES", modelo: "tag" },
  templates:        { modulo: "AUTOMACOES",    modelo: "templateMensagem" },
  automacoes:       { modulo: "AUTOMACOES",    modelo: "regraAutomacao" },
  nps:              { modulo: "NPS",           modelo: "pesquisaNps" },
  comissoes:        { modulo: "COMISSOES",     modelo: "configuracaoComissao" },
  tarefas:          { modulo: "CLIENTES",      modelo: "tarefa" },
  fidelidade:       { modulo: "CLIENTES",      modelo: null },
  alertas:          { modulo: "DASHBOARD",     modelo: null },
  configuracao:     { modulo: "FUNCIONARIOS",  modelo: null },
  "formas-pagamento": { modulo: "FINANCEIRO",  modelo: "formaPagamentoCustom" },
  admin:            { modulo: "FUNCIONARIOS",  modelo: null },
};

const CAMPOS_SENSIVEIS = new Set([
  "senha", "senhaAtual", "senhaNova", "password", "passwordHash",
  "token", "secret",
]);

function sanitizar(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizar);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (CAMPOS_SENSIVEIS.has(k)) out[k] = "***";
    else if (v && typeof v === "object") out[k] = sanitizar(v);
    else out[k] = v;
  }
  return out;
}

function calcularDiff(antes, depois) {
  if (!antes || !depois || typeof depois !== "object") return null;
  const diff = {};
  for (const k of Object.keys(depois)) {
    if (CAMPOS_SENSIVEIS.has(k)) continue;
    const va = antes[k];
    const vd = depois[k];
    // Compara via JSON para lidar com Date/Decimal/array.
    if (JSON.stringify(va) !== JSON.stringify(vd)) {
      diff[k] = { antes: va ?? null, depois: vd ?? null };
    }
  }
  return Object.keys(diff).length ? diff : null;
}

function inferirAcao(metodo) {
  if (metodo === "POST") return "CREATE";
  if (metodo === "PUT" || metodo === "PATCH") return "UPDATE";
  if (metodo === "DELETE") return "DELETE";
  return "OUTRA";
}

function extrairSegmentos(rota) {
  // Remove query string e prefixo, divide em segmentos.
  const semQuery = (rota || "").split("?")[0];
  return semQuery.split("/").filter(Boolean);
}

function extrairIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) {
    return xff.split(",")[0].trim().slice(0, 50);
  }
  return (req.socket?.remoteAddress || req.ip || "").slice(0, 50);
}

export async function auditoria(req, res, next) {
  // Filtros rapidos: so loga mutacoes em rotas relevantes.
  if (!METODOS_MUTACAO.has(req.method)) return next();
  const path = req.path || req.url || "";
  if (ROTAS_IGNORADAS.some(r => path === r || path.startsWith(r + "/"))) return next();

  const segs = extrairSegmentos(path);
  const primeiroSeg = segs[0] || "";
  const mapa = MAPA_ROTAS[primeiroSeg];

  // Quando o segundo segmento parece um id (uuid ou numero), considera-o
  // como entidadeId; rotas /clientes/:id/sub-acao tambem caem aqui.
  const possivelId = segs[1] && !/^[a-z-]+$/.test(segs[1]) ? segs[1] : null;
  const entidadeId = possivelId || null;

  let dadosAntes = null;
  if (mapa?.modelo && entidadeId && (req.method !== "POST")) {
    try {
      const registro = await prisma[mapa.modelo].findUnique({ where: { id: entidadeId } });
      if (registro) dadosAntes = JSON.parse(JSON.stringify(registro));
    } catch {
      // Modelo nao tem findUnique por id ou id nao existe — ignora.
    }
  }

  const inicio = Date.now();
  const ip = extrairIp(req);
  const userAgent = (req.headers["user-agent"] || "").slice(0, 500);

  res.on("finish", () => {
    // So loga requisicoes autenticadas (req.user populado por authRequired).
    const usuarioId = req.user?.sub || null;
    if (!usuarioId) return;

    const status = res.statusCode;
    const sucesso = status >= 200 && status < 400;
    const acao = inferirAcao(req.method);

    let dadosDepois = null;
    if (req.method !== "DELETE" && req.body && typeof req.body === "object") {
      try { dadosDepois = sanitizar(req.body); } catch { dadosDepois = null; }
    }
    const diff = (acao === "UPDATE" && dadosAntes) ? calcularDiff(dadosAntes, dadosDepois) : null;

    // tenantId: prefere o req.tenantId injetado pelo authRequired (ETAPA 3),
    // fallback no JWT decodificado (req.user.tid). Em rotas autenticadas sempre
    // tem; rotas livres caem em null (e o caller usa registrarEvento direto).
    const tenantId = req.tenantId || req.user?.tid || null;

    prisma.logAuditoria.create({
      data: {
        usuarioId,
        usuarioNome: req.user?.nome || null,
        usuarioEmail: req.user?.email || null,
        acao,
        modulo: mapa?.modulo || (primeiroSeg ? primeiroSeg.toUpperCase() : "OUTRO"),
        entidadeId,
        metodo: req.method,
        rota: (req.originalUrl || path).slice(0, 500),
        statusCode: status,
        sucesso,
        ip: ip || null,
        userAgent: userAgent || null,
        dadosAntes: dadosAntes ? sanitizar(dadosAntes) : null,
        dadosDepois,
        diff,
        duracaoMs: Date.now() - inicio,
        tenantId,
      },
    }).catch(err => {
      console.error("[auditoria] falha ao gravar log:", err?.message || err);
    });
  });

  next();
}

// Helper para logar eventos especiais (login, logout, login falho).
//
// tenantId pode ser passado explicitamente quando o caller ja resolveu
// o user (ex: login com senha correta) — caso contrario tenta ler do
// tenantStorage (sera null em rotas pre-auth como POST /auth/login).
// Para login com email inexistente, ambos sao null - log fica com
// tenantId nulo, que e o unico caso aceito (LogAuditoria.tenantId
// continua nullable de proposito na ETAPA 6).
export async function registrarEvento({
  acao, modulo = "AUTH", usuarioId = null, usuarioNome = null,
  usuarioEmail = null, sucesso = true, mensagem = null, req = null,
  tenantId = undefined,
}) {
  try {
    const finalTenantId = tenantId !== undefined
      ? tenantId
      : (tenantStorage.getStore()?.tenantId || null);
    await prisma.logAuditoria.create({
      data: {
        acao,
        modulo,
        usuarioId,
        usuarioNome,
        usuarioEmail,
        sucesso,
        mensagem: mensagem ? String(mensagem).slice(0, 500) : null,
        ip: req ? extrairIp(req) : null,
        userAgent: req ? (req.headers["user-agent"] || "").slice(0, 500) : null,
        rota: req ? (req.originalUrl || req.path || "").slice(0, 500) : null,
        metodo: req?.method || null,
        statusCode: null,
        tenantId: finalTenantId,
      },
    });
  } catch (err) {
    console.error("[auditoria] falha ao registrar evento:", err?.message || err);
  }
}
