import { Router } from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import {
  listar, obter, criar, atualizar, excluir,
} from "../controllers/templateMensagemController.js";

const router = Router();

router.use(authRequired);

// GET livre (qualquer usuario autenticado pode usar templates).
router.get("/", listar);
router.get("/:id", obter);

// Mutacoes apenas ADMIN/GERENTE — templates sao configuracao do estabelecimento.
router.post("/", requireRole("ADMIN", "GERENTE"), criar);
router.put("/:id", requireRole("ADMIN", "GERENTE"), atualizar);
router.delete("/:id", requireRole("ADMIN"), excluir);

export default router;
