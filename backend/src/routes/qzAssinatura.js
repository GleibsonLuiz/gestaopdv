import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import { assinar } from "../controllers/qzAssinaturaController.js";

const router = Router();

// Exige login: so quem opera o sistema assina pedidos de impressao.
router.use(authRequired);

router.post("/sign", assinar);

export default router;
