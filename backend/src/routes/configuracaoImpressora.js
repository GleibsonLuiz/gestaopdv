import { Router } from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import { obter, salvar } from "../controllers/configuracaoImpressoraController.js";

const router = Router();

router.use(authRequired);

// GET livre: o helper de impressao do frontend (src/lib/impressora.js) le
// essa config antes de cada window.print() — qualquer usuario que opere
// o PDV precisa enxergar.
router.get("/", obter);

// Mutacao restrita a ADMIN/GERENTE — mesmo padrao da ConfiguracaoEmpresa.
router.put("/", requireRole("ADMIN", "GERENTE"), salvar);

export default router;
