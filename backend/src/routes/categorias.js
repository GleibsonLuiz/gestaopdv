import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, criar, atualizar, excluir } from "../controllers/categoriaController.js";

const router = Router();

router.use(authRequired);

// Categoria e parte do modulo PRODUTOS. GET liberado para outros modulos.
router.get("/", listar);
router.post("/", requirePermissao("PRODUTOS"), criar);
router.put("/:id", requirePermissao("PRODUTOS"), requireRole("ADMIN", "GERENTE"), atualizar);
router.delete("/:id", requirePermissao("PRODUTOS"), requireRole("ADMIN"), excluir);

export default router;
