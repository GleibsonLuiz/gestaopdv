import { Router } from "express";
import { authRequired, requirePermissao } from "../middlewares/auth.js";
import {
  obterPublico, responderPublico, resumo, listar,
} from "../controllers/npsController.js";

const router = Router();

// ============ ENDPOINTS PUBLICOS (sem autenticacao) ============
//
// IMPORTANTE: estes vem ANTES dos middlewares de auth para que clientes
// possam responder sem login.
router.get("/publico/:token", obterPublico);
router.post("/publico/:token", responderPublico);

// ============ ENDPOINTS PRIVADOS ============
router.use(authRequired);
router.use(requirePermissao("NPS"));

router.get("/resumo", resumo);
router.get("/", listar);

export default router;
