import { Router } from "express";
import { cronExecutarTodos } from "../controllers/automacaoController.js";

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

export default router;
