import { Router } from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import { listar, obter, criar, atualizar, concluir, reabrir, excluir } from "../controllers/tarefaController.js";

const router = Router();
router.use(authRequired);

router.get("/", listar);
router.get("/:id", obter);
router.post("/", criar);
router.put("/:id", atualizar);
router.post("/:id/concluir", concluir);
router.post("/:id/reabrir", reabrir);
router.delete("/:id", requireRole("ADMIN", "GERENTE"), excluir);

export default router;
