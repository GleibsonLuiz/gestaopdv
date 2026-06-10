import { Router } from "express";
import {
  login, me, trocarSenha, logout, salvarPreferencias, revogarDispositivoSelfService,
  totpSetup, totpAtivar, totpDesativar,
} from "../controllers/authController.js";
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
// 2FA TOTP (verificacao em duas etapas) — self-service do usuario logado.
router.post("/totp/setup", authRequired, totpSetup);
router.post("/totp/ativar", authRequired, totpAtivar);
router.post("/totp/desativar", authRequired, totpDesativar);

export default router;
