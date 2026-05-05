import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, obter, criar, estornar } from "../controllers/compraController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("COMPRAS"));

router.get("/", listar);
router.get("/:id", obter);
router.post("/", requireRole("ADMIN", "GERENTE"), criar);
router.post("/:id/estornar", requireRole("ADMIN", "GERENTE"), estornar);

export default router;
