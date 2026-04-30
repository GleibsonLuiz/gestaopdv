import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, obter, criar, atualizar, excluir } from "../controllers/fornecedorController.js";

const router = Router();

router.use(authRequired);

// GETs liberados (Compras/Produtos consultam fornecedores).
router.get("/", listar);
router.get("/:id", obter);
router.post("/", requirePermissao("FORNECEDORES"), criar);
router.put("/:id", requirePermissao("FORNECEDORES"), requireRole("ADMIN", "GERENTE"), atualizar);
router.delete("/:id", requirePermissao("FORNECEDORES"), requireRole("ADMIN"), excluir);

export default router;
