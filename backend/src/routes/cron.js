import { Router } from "express";
import { cronExecutarTodos } from "../controllers/automacaoController.js";
import { cronReconciliarAssinaturas } from "../controllers/billingController.js";

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

export default router;
