import { Router } from "express";
import { authRequired, requireSuperAdmin } from "../middlewares/auth.js";
import {
  listarEmpresas, estatisticasGlobais, criarEmpresa, alterarStatus,
  resetarEmpresa, listarUsers, alterarSuperAdmin, impersonate,
  logsGlobal, metricas,
} from "../controllers/adminMasterController.js";

const router = Router();

router.use(authRequired);
router.use(requireSuperAdmin);

// ETAPA 10 — base
router.get("/empresas", listarEmpresas);
router.get("/estatisticas", estatisticasGlobais);
router.post("/empresas", criarEmpresa);
router.patch("/empresas/:id/status", alterarStatus);

// ETAPA 11 — super-poderes
router.post("/empresas/:id/reset", resetarEmpresa);
router.get("/users", listarUsers);
router.patch("/users/:id/super-admin", alterarSuperAdmin);
router.post("/impersonate/:userId", impersonate);
router.get("/logs", logsGlobal);
router.get("/metricas", metricas);

export default router;
