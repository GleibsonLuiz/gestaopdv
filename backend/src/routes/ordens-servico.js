import { Router } from "express";
import { authRequired, requirePermissao, requireRole } from "../middlewares/auth.js";
import { listar, obter, criar, atualizar, mudarStatus, excluir } from "../controllers/osController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("ORDEM_SERVICO"));

router.get("/", listar);
router.get("/:id", obter);
router.post("/", criar);
router.put("/:id", atualizar);
router.patch("/:id/status", mudarStatus);
router.delete("/:id", requireRole("ADMIN", "GERENTE"), excluir);

export default router;
