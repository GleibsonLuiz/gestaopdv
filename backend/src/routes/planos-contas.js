import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import {
  listar, arvore, criar, atualizar, excluir, restaurarPadrao,
} from "../controllers/planoContaController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("DESPESAS"));

router.get("/", listar);
router.get("/arvore", arvore);
router.post("/", requireRole("ADMIN", "GERENTE"), criar);
router.post("/restaurar-padrao", requireRole("ADMIN", "GERENTE"), restaurarPadrao);
router.put("/:id", requireRole("ADMIN", "GERENTE"), atualizar);
router.delete("/:id", requireRole("ADMIN", "GERENTE"), excluir);

export default router;
