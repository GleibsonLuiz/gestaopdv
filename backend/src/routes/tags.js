import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import {
  listar, criar, atualizar, excluir, atribuirAoCliente, removerDoCliente,
} from "../controllers/tagController.js";

const router = Router();

router.use(authRequired);

// GET livre (qualquer usuario autenticado lista tags para escolher).
router.get("/", listar);

// Mutacoes exigem permissao CLIENTES (tags fazem parte do cadastro).
router.post("/", requirePermissao("CLIENTES"), requireRole("ADMIN", "GERENTE"), criar);
router.put("/:id", requirePermissao("CLIENTES"), requireRole("ADMIN", "GERENTE"), atualizar);
router.delete("/:id", requirePermissao("CLIENTES"), requireRole("ADMIN"), excluir);

// Atribuir / remover tag de cliente
router.post(
  "/clientes/:clienteId/:tagId",
  requirePermissao("CLIENTES"),
  requireRole("ADMIN", "GERENTE", "VENDEDOR"),
  atribuirAoCliente,
);
router.delete(
  "/clientes/:clienteId/:tagId",
  requirePermissao("CLIENTES"),
  requireRole("ADMIN", "GERENTE", "VENDEDOR"),
  removerDoCliente,
);

export default router;
