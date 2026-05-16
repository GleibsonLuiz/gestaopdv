import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import { minhas, marcarLida } from "../controllers/notificacaoController.js";

const router = Router();
router.use(authRequired);

// Notificacoes globais para o user logado (nao lidas + ativas + nao expiradas)
router.get("/", minhas);
router.post("/:id/marcar-lida", marcarLida);

export default router;
