import { Router } from "express";
import { authRequired, requireRole, requireModulo } from "../middlewares/auth.js";
import {
  obter, atualizar,
  listarDispositivosEmpresa, revogarDispositivoEmpresa, renomearDispositivoEmpresa,
} from "../controllers/empresaController.js";
import { statusCardapio, configurarCardapio } from "../controllers/cardapioController.js";

const router = Router();

// Toda rota exige autenticacao. authRequired ja injeta req.tenantId.
router.use(authRequired);

router.get("/", obter);
router.put("/", atualizar);

// Autogestao de dispositivos (licenca por maquina) pelo proprio lojista.
router.get("/dispositivos", listarDispositivosEmpresa);
router.post("/dispositivos/:id/revogar", revogarDispositivoEmpresa);
router.patch("/dispositivos/:id", renomearDispositivoEmpresa);

// Cardapio digital (admin do tenant). Gateado por plano (modulo CARDAPIO).
router.get("/cardapio", requireModulo("CARDAPIO"), statusCardapio);
router.patch("/cardapio", requireModulo("CARDAPIO"), requireRole("ADMIN", "GERENTE"), configurarCardapio);

export default router;
