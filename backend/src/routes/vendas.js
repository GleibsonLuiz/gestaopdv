import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { validarBody, criarVendaSchema } from "../middlewares/validarBody.js";
import { listar, obter, criar, cancelar, reabrir, refinalizar } from "../controllers/vendaController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("PDV"));

router.get("/", listar);
router.get("/:id", obter);
router.post("/", validarBody(criarVendaSchema), criar);
router.post("/:id/cancelar", requireRole("ADMIN", "GERENTE"), cancelar);
// VENDEDOR pode reabrir/refinalizar desde que apresente autorizacao
// (email + senha) de um ADMIN/GERENTE — verificado no controller via
// exigirAutorizacaoGerencial.
router.post("/:id/reabrir", reabrir);
router.post("/:id/refinalizar", refinalizar);

export default router;
