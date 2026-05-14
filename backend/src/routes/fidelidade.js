import { Router } from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import { obterConfig, salvarConfig, pontosPorCliente, ajustarPontos } from "../controllers/fidelidadeController.js";

const router = Router();
router.use(authRequired);

router.get("/configuracao", obterConfig);
router.put("/configuracao", requireRole("ADMIN"), salvarConfig);
router.get("/pontos/:clienteId", pontosPorCliente);
router.post("/pontos/:clienteId/ajustar", requireRole("ADMIN", "GERENTE"), ajustarPontos);

export default router;
