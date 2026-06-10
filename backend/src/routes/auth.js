import { Router } from "express";
import { login, me, trocarSenha, logout, salvarPreferencias, revogarDispositivoSelfService } from "../controllers/authController.js";
import { authRequired } from "../middlewares/auth.js";
import { rateLimitLogin } from "../middlewares/rateLimitLogin.js";

const router = Router();

router.post("/login", rateLimitLogin, login);
// Auto-derrubada de dispositivo a partir da tela de bloqueio (sem auth — valida
// email+senha no controller). Rate-limitada como o login.
router.post("/dispositivos/revogar", rateLimitLogin, revogarDispositivoSelfService);
router.post("/logout", authRequired, logout);
router.get("/me", authRequired, me);
router.put("/senha", authRequired, trocarSenha);
router.put("/preferencias", authRequired, salvarPreferencias);

export default router;
