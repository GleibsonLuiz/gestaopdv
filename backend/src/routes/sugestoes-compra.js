import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import {
  listar, adicionarManual, atualizar, descartar, remover, limpar,
} from "../controllers/sugestaoCompraController.js";

const router = Router();

// Sugestoes de Compra e parte do dominio de Compras — reusa o mesmo modulo
// de permissao/plano (COMPRAS), sem novo entitlement.
router.use(authRequired);
router.use(requirePermissao("COMPRAS"));

router.get("/", listar);
// Mutacoes (montar/limpar a lista) ficam para ADMIN/GERENTE, como em Compras.
router.post("/", requireRole("ADMIN", "GERENTE"), adicionarManual);
router.post("/limpar", requireRole("ADMIN", "GERENTE"), limpar);
router.patch("/:produtoId", requireRole("ADMIN", "GERENTE"), atualizar);
router.post("/:produtoId/descartar", requireRole("ADMIN", "GERENTE"), descartar);
router.delete("/:produtoId", requireRole("ADMIN", "GERENTE"), remover);

export default router;
