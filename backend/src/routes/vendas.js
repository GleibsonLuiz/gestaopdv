import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, obter, criar, cancelar, reabrir, refinalizar } from "../controllers/vendaController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("PDV"));

router.get("/", listar);
router.get("/:id", obter);
router.post("/", criar);
router.post("/:id/cancelar", requireRole("ADMIN", "GERENTE"), cancelar);
router.post("/:id/reabrir", requireRole("ADMIN", "GERENTE"), reabrir);
router.post("/:id/refinalizar", requireRole("ADMIN", "GERENTE"), refinalizar);

export default router;
