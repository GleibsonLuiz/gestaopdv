import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import {
  listar,
  obter,
  abrir,
  getFolhaContagem,
  salvarContagens,
  consolidar,
  cancelar,
} from "../controllers/inventarioController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("INVENTARIO"));

// LISTAGEM / DETALHE (gestor)
router.get("/", listar);
router.get("/:id", requireRole("ADMIN", "GERENTE"), obter);

// FOLHA DE CONTAGEM (operador — payload nao expoe estoque logico)
router.get("/:id/folha", getFolhaContagem);
router.post("/:id/contagens", salvarContagens);

// ABERTURA / CONSOLIDACAO / CANCELAMENTO (gestor)
router.post("/", requireRole("ADMIN", "GERENTE"), abrir);
router.post("/:id/consolidar", requireRole("ADMIN", "GERENTE"), consolidar);
router.post("/:id/cancelar", requireRole("ADMIN", "GERENTE"), cancelar);

export default router;
