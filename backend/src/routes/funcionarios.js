import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, listarResponsaveis, obter, criar, atualizar, excluir } from "../controllers/funcionarioController.js";

const router = Router();

router.use(authRequired);
// Lista enxuta para selects de "responsavel" (CRM, tarefas). Fica fora
// do requirePermissao("FUNCIONARIOS") pois e usada por VENDEDOR para
// preencher dropdowns — nao expoe email/permissoes.
router.get("/responsaveis", listarResponsaveis);
// FUNCIONARIOS so admin (requirePermissao bloqueia non-ADMIN para este modulo).
router.use(requirePermissao("FUNCIONARIOS"));

router.get("/", listar);
router.get("/:id", obter);
router.post("/", requireRole("ADMIN"), criar);
router.put("/:id", requireRole("ADMIN"), atualizar);
router.delete("/:id", requireRole("ADMIN"), excluir);

export default router;
