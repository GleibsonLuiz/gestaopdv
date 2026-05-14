import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import {
  listar, resumoFunil, obter, criar, atualizar, moverEtapa, excluir,
} from "../controllers/oportunidadeController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("OPORTUNIDADES"));

router.get("/", listar);
router.get("/resumo", resumoFunil);
router.get("/:id", obter);
router.post("/", requireRole("ADMIN", "GERENTE", "VENDEDOR"), criar);
router.put("/:id", requireRole("ADMIN", "GERENTE", "VENDEDOR"), atualizar);
router.post("/:id/mover", requireRole("ADMIN", "GERENTE", "VENDEDOR"), moverEtapa);
router.delete("/:id", requireRole("ADMIN", "GERENTE"), excluir);

export default router;
