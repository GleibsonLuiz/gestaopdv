import { Router } from "express";
import { authRequired, requireRole, requireModulo } from "../middlewares/auth.js";
import { obter, atualizar } from "../controllers/empresaController.js";
import { statusCardapio, configurarCardapio } from "../controllers/cardapioController.js";

const router = Router();

// Toda rota exige autenticacao. authRequired ja injeta req.tenantId.
router.use(authRequired);

router.get("/", obter);
router.put("/", atualizar);

// Cardapio digital (admin do tenant). Gateado por plano (modulo CARDAPIO).
router.get("/cardapio", requireModulo("CARDAPIO"), statusCardapio);
router.patch("/cardapio", requireModulo("CARDAPIO"), requireRole("ADMIN", "GERENTE"), configurarCardapio);

export default router;
