import { Router } from "express";
import { cronExecutarTodos } from "../controllers/automacaoController.js";
import { cronReconciliarAssinaturas } from "../controllers/billingController.js";
import { cronReconsultarPendentes, cronVerificarCertificados } from "../controllers/fiscalCronController.js";
import { cronDistribuirDFe } from "../controllers/dfeController.js";
import { cronFechamentoMensal } from "../controllers/contabilidadeCronController.js";

// Rotas de cron — propositalmente SEM authRequired/requirePermissao.
// Cada handler valida internamente o header Authorization: Bearer ${CRON_SECRET}.
// Montado fora do prefixo /automacoes pra deixar claro que e canal de
// schedule (Vercel Cron / cron externo), nao endpoint de usuario.
const router = Router();

// /cron/automacoes — executa todas as regras ativas de todos os tenants
// ativos e nao expirados. Idempotente em principio (cada regra tem deduplicacao
// propria — ex: nao re-disparar pra mesmo cliente no mesmo dia).
//
// Aceita GET (default do Vercel Cron) e POST (chamada manual/scripts externos).
router.get("/automacoes", cronExecutarTodos);
router.post("/automacoes", cronExecutarTodos);

// /cron/assinaturas — rede de seguranca diaria do billing: marca assinaturas
// vencidas como inadimplentes e suspende quem passou da carencia. Cobre
// eventuais webhooks perdidos. Mesma auth (Bearer ${CRON_SECRET}).
router.get("/assinaturas", cronReconciliarAssinaturas);
router.post("/assinaturas", cronReconciliarAssinaturas);

// /cron/fiscal-pendentes — rede de seguranca da emissao: reconsulta no gateway
// as notas que ficaram PROCESSANDO (timeout/SEFAZ fora do ar) com backoff
// exponencial. NUNCA reenvia. Esgotado o ciclo, marca CONTINGENCIA. Mesma auth
// (Bearer ${CRON_SECRET}). Idempotente.
router.get("/fiscal-pendentes", cronReconsultarPendentes);
router.post("/fiscal-pendentes", cronReconsultarPendentes);

// /cron/fiscal-certificados — monitora a validade do certificado A1 (no
// gateway) e notifica o tenant 30/15/7/1 dias antes do vencimento. Diario.
router.get("/fiscal-certificados", cronVerificarCertificados);
router.post("/fiscal-certificados", cronVerificarCertificados);

// /cron/fiscal-dfe — distribuicao automatica de NF-e recebidas (caixa SEFAZ),
// com backoff de 1h por tenant (anti cStat 656). Mesma auth (Bearer CRON_SECRET).
router.get("/fiscal-dfe", cronDistribuirDFe);
router.post("/fiscal-dfe", cronDistribuirDFe);

// /cron/contabilidade-fechamento — mensal (dia 1): apura o mes anterior por
// tenant e notifica que o pacote do contador esta pronto. Idempotente.
router.get("/contabilidade-fechamento", cronFechamentoMensal);
router.post("/contabilidade-fechamento", cronFechamentoMensal);

export default router;
