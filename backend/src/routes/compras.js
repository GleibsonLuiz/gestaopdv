import { Router } from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import { listar, obter, criar } from "../controllers/compraController.js";

const router = Router();

router.use(authRequired);

router.get("/", listar);
router.get("/:id", obter);
router.post("/", requireRole("ADMIN", "GERENTE"), criar);

export default router;
