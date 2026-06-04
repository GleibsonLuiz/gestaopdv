import { Router } from "express";
import { authRequired, requirePermissao } from "../middlewares/auth.js";
import { lancamentos } from "../controllers/contabilidadeController.js";

const router = Router();

router.use(authRequired);
// Modulo de leitura/exportacao para o contador. Um usuario "contador" tem
// apenas esta permissao (sem PDV/config) — enxerga so este portal.
router.use(requirePermissao("CONTABILIDADE"));

router.get("/lancamentos", lancamentos);

export default router;
