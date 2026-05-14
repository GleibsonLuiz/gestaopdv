import { Router } from "express";
import { authRequired, requirePermissao } from "../middlewares/auth.js";
import { resumo } from "../controllers/dashboardController.js";
import { resumoCrm } from "../controllers/dashboardCrmController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("DASHBOARD"));

router.get("/resumo", resumo);
router.get("/crm", resumoCrm);

export default router;
