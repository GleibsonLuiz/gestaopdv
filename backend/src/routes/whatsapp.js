import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import {
  obterConfig, salvarConfig, removerConfig,
  obterQrCodeEndpoint, obterStatusEndpoint,
  listarLogs, webhook,
} from "../controllers/whatsappController.js";

// Rota PUBLICA do webhook — sem auth (gateway externo chama).
export const webhookRouter = Router();
webhookRouter.post("/whatsapp", webhook);

// Rotas autenticadas da configuracao + status.
const router = Router();
router.use(authRequired);
router.use(requirePermissao("WHATSAPP"));

router.get("/config", obterConfig);
router.put("/config", requireRole("ADMIN", "GERENTE"), salvarConfig);
router.delete("/config", requireRole("ADMIN", "GERENTE"), removerConfig);

router.get("/qrcode", obterQrCodeEndpoint);
router.get("/status", obterStatusEndpoint);
router.get("/logs", listarLogs);

export default router;
