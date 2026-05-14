import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import {
  listar, obter, criar, atualizar, excluir,
  listarLogs, executar, executarTodas,
} from "../controllers/automacaoController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("AUTOMACOES"));

router.get("/", listar);
router.get("/logs", listarLogs);
router.get("/:id", obter);

// Mutacoes apenas ADMIN/GERENTE — automacoes sao configuracao critica.
router.post("/", requireRole("ADMIN", "GERENTE"), criar);
router.put("/:id", requireRole("ADMIN", "GERENTE"), atualizar);
router.delete("/:id", requireRole("ADMIN"), excluir);

// Execucao — qualquer um com permissao AUTOMACOES pode disparar manualmente.
router.post("/executar", executarTodas);
router.post("/:id/executar", executar);

export default router;
