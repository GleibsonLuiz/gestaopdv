import { Router } from "express";
import { login, me, trocarSenha, logout, salvarPreferencias } from "../controllers/authController.js";
import { authRequired } from "../middlewares/auth.js";
import { rateLimitLogin } from "../middlewares/rateLimitLogin.js";

const router = Router();

router.post("/login", rateLimitLogin, login);
router.post("/logout", authRequired, logout);
router.get("/me", authRequired, me);
router.put("/senha", authRequired, trocarSenha);
router.put("/preferencias", authRequired, salvarPreferencias);

export default router;
