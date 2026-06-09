import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import {
  obterConfig,
  salvarConfig,
  criar,
  listar,
  obter,
  cancelar,
  webhook,
} from "../controllers/boletoController.js";

const router = Router();

// ============ WEBHOOK PUBLICO ============
// NAO usa authRequired. Autenticidade validada no controller pelo secret na
// URL (?secret=...) que roteia ao tenant dono. Declarado ANTES do authRequired.
router.post("/webhook", webhook);

// ============ ROTAS AUTENTICADAS ============
router.use(authRequired);

// Config — leitura para qualquer autenticado (UI conferir estado); escrita
// so ADMIN/GERENTE (a URL do webhook carrega o secret).
router.get("/config", obterConfig);
router.put("/config", requireRole("ADMIN", "GERENTE"), salvarConfig);

// Operacao de cobranca — mesmo guard do modulo Financeiro.
router.use(requirePermissao("FINANCEIRO"));
router.get("/", listar);
router.get("/:id", obter);
router.post("/", requireRole("ADMIN", "GERENTE"), criar);
router.post("/:id/cancelar", requireRole("ADMIN", "GERENTE"), cancelar);

export default router;
