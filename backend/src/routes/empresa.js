import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import { obter, atualizar } from "../controllers/empresaController.js";

const router = Router();

// Toda rota exige autenticacao. authRequired ja injeta req.tenantId.
router.use(authRequired);

router.get("/", obter);
router.put("/", atualizar);

export default router;
