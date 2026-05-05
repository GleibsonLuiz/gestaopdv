import { Router } from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import {
  listar, criar, atualizar, excluir,
} from "../controllers/formaPagamentoCustomController.js";

const router = Router();

router.use(authRequired);

// Listagem livre (qualquer usuario logado precisa para popular dropdowns).
router.get("/", listar);
// Mutacoes restritas a ADMIN/GERENTE.
router.post("/", requireRole("ADMIN", "GERENTE"), criar);
router.put("/:id", requireRole("ADMIN", "GERENTE"), atualizar);
router.delete("/:id", requireRole("ADMIN"), excluir);

export default router;
