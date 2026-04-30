import { Router } from "express";
import { authRequired, requirePermissao } from "../middlewares/auth.js";
import { resumo } from "../controllers/dashboardController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("DASHBOARD"));

router.get("/resumo", resumo);

export default router;
