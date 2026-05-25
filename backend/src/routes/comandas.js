import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import {
  listar, obter, criar, aceitar, cancelar, finalizar, resumo, stream,
} from "../controllers/comandaController.js";

const router = Router();

// SSE: precisa vir ANTES do authRequired, porque EventSource nao envia
// header Authorization (auth feita via query ?token=... no proprio handler).
router.get("/stream", stream);

router.use(authRequired);
router.use(requirePermissao("COMANDAS"));

router.get("/", listar);
router.get("/resumo", resumo);
router.get("/:id", obter);

// PDV Volante envia pra ca; vendedores tambem podem criar manualmente
// pelo painel da central. Permitido para qualquer role com COMANDAS.
router.post("/", criar);

router.patch("/:id/aceitar", aceitar);
router.patch("/:id/cancelar", cancelar);
// finalizar gera Venda real — restrito a ADMIN/GERENTE/VENDEDOR (todos
// que possam vender — controlado pela permissao COMANDAS + PDV).
router.post("/:id/finalizar", requireRole("ADMIN", "GERENTE", "VENDEDOR"), finalizar);

export default router;
