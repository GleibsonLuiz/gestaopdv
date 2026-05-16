import { Router } from "express";
import { authRequired, requireSuperAdmin } from "../middlewares/auth.js";
import {
  listarEmpresas, estatisticasGlobais, criarEmpresa, alterarStatus,
} from "../controllers/adminMasterController.js";

const router = Router();

// Toda rota /admin-master exige super-admin. authRequired valida JWT e
// injeta req.user; requireSuperAdmin verifica claim `sa`.
router.use(authRequired);
router.use(requireSuperAdmin);

router.get("/empresas", listarEmpresas);
router.get("/estatisticas", estatisticasGlobais);
router.post("/empresas", criarEmpresa);
router.patch("/empresas/:id/status", alterarStatus);

export default router;
