import { Router } from "express";
import { login, me, trocarSenha } from "../controllers/authController.js";
import { authRequired } from "../middlewares/auth.js";
import { rateLimitLogin } from "../middlewares/rateLimitLogin.js";

const router = Router();

router.post("/login", rateLimitLogin, login);
router.get("/me", authRequired, me);
router.put("/senha", authRequired, trocarSenha);

export default router;
