import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, obter, criar, atualizar, excluir } from "../controllers/funcionarioController.js";

const router = Router();

router.use(authRequired);
// FUNCIONARIOS so admin (requirePermissao bloqueia non-ADMIN para este modulo).
router.use(requirePermissao("FUNCIONARIOS"));

router.get("/", listar);
router.get("/:id", obter);
router.post("/", requireRole("ADMIN"), criar);
router.put("/:id", requireRole("ADMIN"), atualizar);
router.delete("/:id", requireRole("ADMIN"), excluir);

export default router;
