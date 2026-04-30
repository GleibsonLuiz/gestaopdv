import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, obter, criar, cancelar } from "../controllers/vendaController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("PDV"));

router.get("/", listar);
router.get("/:id", obter);
router.post("/", criar);
router.post("/:id/cancelar", requireRole("ADMIN", "GERENTE"), cancelar);

export default router;
