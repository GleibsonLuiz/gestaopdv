import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import { listar } from "../controllers/alertasController.js";

const router = Router();

router.use(authRequired);

router.get("/", listar);

export default router;
