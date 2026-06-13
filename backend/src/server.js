// PRIMEIRO import: instrumenta o Sentry antes de qualquer outro modulo.
import "./instrument.js";
import * as Sentry from "@sentry/node";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import authRoutes from "./routes/auth.js";
import clientesRoutes from "./routes/clientes.js";
import fornecedoresRoutes from "./routes/fornecedores.js";
import categoriasRoutes from "./routes/categorias.js";
import fabricantesRoutes from "./routes/fabricantes.js";
import produtosRoutes from "./routes/produtos.js";
import estoqueRoutes from "./routes/estoque.js";
import inventariosRoutes from "./routes/inventarios.js";
import comprasRoutes from "./routes/compras.js";
import sugestoesCompraRoutes from "./routes/sugestoes-compra.js";
import funcionariosRoutes from "./routes/funcionarios.js";
import vendasRoutes from "./routes/vendas.js";
import dashboardRoutes from "./routes/dashboard.js";
import contasPagarRoutes from "./routes/contas-pagar.js";
import contasReceberRoutes from "./routes/contas-receber.js";
import planosContasRoutes from "./routes/planos-contas.js";
import despesasRoutes from "./routes/despesas.js";
import contabilidadeRoutes from "./routes/contabilidade.js";
import alertasRoutes from "./routes/alertas.js";
import relatoriosRoutes from "./routes/relatorios.js";
import adminRoutes from "./routes/admin.js";
import caixasRoutes from "./routes/caixas.js";
import configuracaoRoutes from "./routes/configuracao.js";
import configuracaoImpressoraRoutes from "./routes/configuracaoImpressora.js";
import qzAssinaturaRoutes from "./routes/qzAssinatura.js";
import pdvRoutes from "./routes/pdv.js";
import formasPagamentoRoutes from "./routes/formas-pagamento.js";
import orcamentosRoutes from "./routes/orcamentos.js";
import oportunidadesRoutes from "./routes/oportunidades.js";
import tagsRoutes from "./routes/tags.js";
import templatesRoutes from "./routes/templates.js";
import automacoesRoutes from "./routes/automacoes.js";
import npsRoutes from "./routes/nps.js";
import comissoesRoutes from "./routes/comissoes.js";
import comandasRoutes from "./routes/comandas.js";
import tarefasRoutes from "./routes/tarefas.js";
import fidelidadeRoutes from "./routes/fidelidade.js";
import logsRoutes from "./routes/logs.js";
import cronRoutes from "./routes/cron.js";
import tenantsRoutes from "./routes/tenants.js";
import empresaRoutes from "./routes/empresa.js";
import adminMasterRoutes from "./routes/admin-master.js";
import notificacoesRoutes from "./routes/notificacoes.js";
import pagamentosMpRoutes from "./routes/pagamentos-mp.js";
import boletosRoutes from "./routes/boletos.js";
import whatsappRoutes, { webhookRouter as whatsappWebhookRouter } from "./routes/whatsapp.js";
import backupRoutes from "./routes/backup.js";
import fiscalRoutes from "./routes/fiscal.js";
import billingRoutes, { webhookRouter as billingWebhookRouter } from "./routes/billing.js";
import crediarioRoutes from "./routes/crediario.js";
import cardapioRoutes from "./routes/cardapio.js";
import ordensServicoRoutes from "./routes/ordens-servico.js";
import { auditoria } from "./middlewares/auditoria.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3333;

// Cabecalhos de seguranca (HSTS, X-Content-Type-Options, X-Frame-Options,
// no-sniff, etc). API serve JSON; CORP fica "cross-origin" para nao quebrar
// o carregamento de imagens de /uploads pelo frontend (origem diferente)
// em dev. CSP fica desligada — esta API nao serve HTML interativo.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS: libera o dominio do front (FRONTEND_URL), os deploys do PROPRIO
// projeto na Vercel e localhost (dev). Requests sem header Origin (curl,
// health checks, server-to-server) passam. FRONTEND_URL="*" mantem o modo
// "libera geral" como escape de emergencia.
// Antes aceitava QUALQUER *.vercel.app — um app de terceiro hospedado na
// Vercel podia chamar esta API do navegador de um usuario logado. Agora so
// o dominio de producao do front e os previews do proprio projeto
// (gestaopdv-<hash>-gleibsonluizs-projects.vercel.app / -git-<branch>-).
const FRONTEND_URL = process.env.FRONTEND_URL;
const PREVIEW_RE = /^gestaopdv(-[a-z0-9-]+)?-gleibsonluizs-projects\.vercel\.app$/;

function origemPermitida(origin) {
  if (!origin) return true;               // sem Origin (curl, same-origin, SSR)
  if (FRONTEND_URL === "*") return true;  // escape explicito: libera geral
  if (FRONTEND_URL && origin === FRONTEND_URL) return true;
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host === "gestaopdv.vercel.app") return true;
    if (PREVIEW_RE.test(host)) return true;
  } catch { /* origin malformado — nega */ }
  return false;
}

app.use(cors({
  origin(origin, cb) { cb(null, origemPermitida(origin)); },
  credentials: true,
}));
// 1mb: comporta o XML de NF-e de entrada (upload) com muitos itens — o default
// (100kb) poderia rejeitar notas grandes com 413.
app.use(express.json({ limit: "1mb" }));

// Em dev (sem Vercel Blob configurado) servimos os uploads do filesystem
// para preservar o fluxo local. Em producao, as URLs no banco apontam
// direto para o blob.vercel-storage.com — esse middleware fica inerte.
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  app.use("/uploads", express.static(path.resolve("uploads")));
}

app.get("/", (req, res) => {
  res.json({
    nome: "Gestao + PDV API",
    versao: "1.0.0",
    status: "online",
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Rota de verificacao do Sentry: dispara um erro de proposito para confirmar
// que o DSN esta configurado e os eventos chegam no painel. So existe quando
// o Sentry esta ativo (SENTRY_DSN definido) — em dev/testes nem aparece.
// Pode remover depois de validar; e inofensiva (retorna 500 generico).
if (process.env.SENTRY_DSN) {
  app.get("/debug-sentry", () => {
    throw new Error("Teste do Sentry (backend) — se voce ve isso no painel, esta funcionando!");
  });
}

// Middleware de auditoria roda antes das rotas: captura mutacoes via
// res.on("finish") (quando req.user ja foi populado pelos authRequired
// das rotas). Filtros internos garantem que so mutacoes autenticadas
// viram log.
app.use(auditoria);

app.use("/auth", authRoutes);
app.use("/tenants", tenantsRoutes);
app.use("/empresa", empresaRoutes);
app.use("/admin-master", adminMasterRoutes);
app.use("/notificacoes", notificacoesRoutes);
app.use("/clientes", clientesRoutes);
app.use("/fornecedores", fornecedoresRoutes);
app.use("/categorias", categoriasRoutes);
app.use("/fabricantes", fabricantesRoutes);
app.use("/produtos", produtosRoutes);
app.use("/estoque", estoqueRoutes);
app.use("/inventarios", inventariosRoutes);
app.use("/compras", comprasRoutes);
app.use("/sugestoes-compra", sugestoesCompraRoutes);
app.use("/funcionarios", funcionariosRoutes);
app.use("/vendas", vendasRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/contas-pagar", contasPagarRoutes);
app.use("/contas-receber", contasReceberRoutes);
app.use("/planos-contas", planosContasRoutes);
app.use("/despesas", despesasRoutes);
app.use("/contabilidade", contabilidadeRoutes);
app.use("/alertas", alertasRoutes);
app.use("/relatorios", relatoriosRoutes);
app.use("/admin", adminRoutes);
app.use("/caixas", caixasRoutes);
app.use("/configuracao", configuracaoRoutes);
app.use("/configuracao-impressora", configuracaoImpressoraRoutes);
app.use("/impressao-qz", qzAssinaturaRoutes);
app.use("/pdv", pdvRoutes);
app.use("/formas-pagamento", formasPagamentoRoutes);
app.use("/orcamentos", orcamentosRoutes);
app.use("/oportunidades", oportunidadesRoutes);
app.use("/tags", tagsRoutes);
app.use("/templates", templatesRoutes);
app.use("/automacoes", automacoesRoutes);
app.use("/nps", npsRoutes);
app.use("/comissoes", comissoesRoutes);
app.use("/comandas", comandasRoutes);
app.use("/tarefas", tarefasRoutes);
app.use("/fidelidade", fidelidadeRoutes);
app.use("/pagamentos-mp", pagamentosMpRoutes);
app.use("/boletos", boletosRoutes);
// Webhooks publicos (sem auth — gateways externos chamam; validacao por
// segredo dentro de cada handler).
app.use("/webhooks", whatsappWebhookRouter);
app.use("/webhooks", billingWebhookRouter);
// Cardapio digital — pagina/pedido publico (sem auth; chave = cardapioToken).
app.use("/cardapio", cardapioRoutes);
// Rotas autenticadas de config/status do WhatsApp.
app.use("/whatsapp", whatsappRoutes);
app.use("/logs", logsRoutes);
app.use("/backup", backupRoutes);
app.use("/fiscal", fiscalRoutes);
app.use("/billing", billingRoutes);
app.use("/crediario", crediarioRoutes);
app.use("/ordens-servico", ordensServicoRoutes);
// Cron endpoints — auth via header Bearer ${CRON_SECRET}, fora do middleware
// authRequired/permissoes. Pensado pra Vercel Cron / scheduler externo.
app.use("/cron", cronRoutes);

// Handler de erro do Sentry: captura a excecao e a envia ao painel ANTES do
// nosso handler responder. No-op quando o Sentry nao foi inicializado.
Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor" });
});

// Listen apenas quando rodado direto (npm run dev). Quando importado pelo
// Vercel (api/index.js), nao tenta abrir porta — o runtime ja gerencia.
const ehExecucaoDireta = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (ehExecucaoDireta) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

export default app;
