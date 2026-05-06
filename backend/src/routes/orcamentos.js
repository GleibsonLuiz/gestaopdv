import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import {
  listar, obter, criar, atualizar, alterarStatus, converterEmVenda, excluir,
} from "../controllers/orcamentoController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("ORCAMENTOS"));

router.get("/", listar);
router.get("/:id", obter);
router.post("/", requireRole("ADMIN", "GERENTE", "VENDEDOR"), criar);
router.put("/:id", requireRole("ADMIN", "GERENTE", "VENDEDOR"), atualizar);
router.post("/:id/status", requireRole("ADMIN", "GERENTE", "VENDEDOR"), alterarStatus);
router.post("/:id/converter-venda", requireRole("ADMIN", "GERENTE", "VENDEDOR"), converterEmVenda);
router.delete("/:id", requireRole("ADMIN", "GERENTE"), excluir);

export default router;
