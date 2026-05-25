import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import {
  obterConfig,
  salvarConfig,
  cobrar,
  obterStatus,
  cancelar,
  webhook,
  listarDispositivos,
} from "../controllers/pagamentoMpController.js";

const router = Router();

// ============ WEBHOOK PUBLICO ============
// IMPORTANTE: este endpoint NAO usa authRequired. Validacao de autenticidade
// e feita pelo controller (resolve via external_reference da intencao). Tem
// que ser declarado ANTES de router.use(authRequired) abaixo.
router.post("/webhook", webhook);

// ============ ROTAS AUTENTICADAS ============
router.use(authRequired);

// Config — ADMIN/GERENTE (acessa via Configuracoes da empresa, leitura
// disponivel para todos os autenticados pra UI conferir o estado).
router.get("/config", obterConfig);
router.put("/config", requireRole("ADMIN", "GERENTE"), salvarConfig);
router.get("/devices", requireRole("ADMIN", "GERENTE"), listarDispositivos);

// Operacao da maquininha — exige permissao PDV (mesmo guard das vendas).
router.post("/cobrar", requirePermissao("PDV"), cobrar);
router.get("/status/:id", requirePermissao("PDV"), obterStatus);
router.post("/status/:id/cancelar", requirePermissao("PDV"), cancelar);

export default router;
