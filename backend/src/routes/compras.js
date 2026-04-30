import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, obter, criar } from "../controllers/compraController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("COMPRAS"));

router.get("/", listar);
router.get("/:id", obter);
router.post("/", requireRole("ADMIN", "GERENTE"), criar);

export default router;
