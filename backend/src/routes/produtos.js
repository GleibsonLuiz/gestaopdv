import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, obter, criar, atualizar, excluir } from "../controllers/produtoController.js";

const router = Router();

router.use(authRequired);

// GETs liberados (PDV/Compras/Estoque consultam produtos).
router.get("/", listar);
router.get("/:id", obter);
router.post("/", requirePermissao("PRODUTOS"), requireRole("ADMIN", "GERENTE"), criar);
router.put("/:id", requirePermissao("PRODUTOS"), requireRole("ADMIN", "GERENTE"), atualizar);
router.delete("/:id", requirePermissao("PRODUTOS"), requireRole("ADMIN"), excluir);

export default router;
