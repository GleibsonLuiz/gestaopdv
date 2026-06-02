import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, caderneta, definirLimite, lancar } from "../controllers/crediarioController.js";

const router = Router();

router.use(authRequired);
// Modulo CREDIARIO — gateado por plano (entitlement) + permissao de usuario.
router.use(requirePermissao("CREDIARIO"));

router.get("/", listar);
router.get("/:clienteId", caderneta);
router.post("/:clienteId/lancar", lancar);
// Definir limite de credito: acao gerencial.
router.patch("/:clienteId/limite", requireRole("ADMIN", "GERENTE"), definirLimite);

export default router;
