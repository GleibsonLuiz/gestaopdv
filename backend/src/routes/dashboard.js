import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import { resumo } from "../controllers/dashboardController.js";

const router = Router();

router.use(authRequired);

router.get("/resumo", resumo);

export default router;
