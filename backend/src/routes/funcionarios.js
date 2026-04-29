import { Router } from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import { listar, obter, criar, atualizar, excluir } from "../controllers/funcionarioController.js";

const router = Router();

router.use(authRequired);

router.get("/", listar);
router.get("/:id", obter);
router.post("/", requireRole("ADMIN"), criar);
router.put("/:id", requireRole("ADMIN"), atualizar);
router.delete("/:id", requireRole("ADMIN"), excluir);

export default router;
