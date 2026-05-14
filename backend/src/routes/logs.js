import { Router } from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import { listar, resumo, filtros } from "../controllers/logController.js";

const router = Router();

// Logs de auditoria sao restritos a ADMIN — contem dados sensiveis (IP,
// payloads, diff). Nao expor a outros roles.
router.use(authRequired, requireRole("ADMIN"));

router.get("/",        listar);
router.get("/resumo",  resumo);
router.get("/filtros", filtros);

export default router;
