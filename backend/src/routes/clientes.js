import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, obter, criar, atualizar, excluir } from "../controllers/clienteController.js";

const router = Router();

router.use(authRequired);

// GETs liberados (PDV e outros modulos consultam clientes).
router.get("/", listar);
router.get("/:id", obter);
router.post("/", requirePermissao("CLIENTES"), criar);
router.put("/:id", requirePermissao("CLIENTES"), requireRole("ADMIN", "GERENTE"), atualizar);
router.delete("/:id", requirePermissao("CLIENTES"), requireRole("ADMIN"), excluir);

export default router;
