import { Router } from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import { listar, criar, atualizar, excluir } from "../controllers/categoriaController.js";

const router = Router();

router.use(authRequired);

router.get("/", listar);
router.post("/", criar);
router.put("/:id", requireRole("ADMIN", "GERENTE"), atualizar);
router.delete("/:id", requireRole("ADMIN"), excluir);

export default router;
