import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, criar } from "../controllers/estoqueController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("ESTOQUE"));

router.get("/movimentacoes", listar);
router.post("/movimentacoes", requireRole("ADMIN", "GERENTE"), criar);

export default router;
