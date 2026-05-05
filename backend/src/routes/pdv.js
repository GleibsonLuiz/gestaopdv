import { Router } from "express";
import { authRequired, requirePermissao } from "../middlewares/auth.js";
import { inicio } from "../controllers/pdvController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("PDV"));

router.get("/inicio", inicio);

export default router;
