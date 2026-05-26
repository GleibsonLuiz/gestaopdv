import { Router } from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import { exportar, restaurar } from "../controllers/backupController.js";

const router = Router();

// Backup e operacao critica (le tudo) e restaurar e destrutivo (sobrescreve
// tudo) — exige ADMIN. Mesmo padrao do /admin/reset.
router.use(authRequired);
router.use(requireRole("ADMIN"));

router.post("/exportar", exportar);
router.post("/restaurar", restaurar);

export default router;
