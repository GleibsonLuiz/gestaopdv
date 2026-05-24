import { Router } from "express";
import { authRequired, requireSuperAdmin } from "../middlewares/auth.js";
import {
  listarEmpresas, estatisticasGlobais, criarEmpresa, alterarStatus,
  resetarEmpresa, listarUsers, alterarSuperAdmin, impersonate,
  logsGlobal, metricas, alterarPlano, alterarSegmento, exportarEmpresa,
  financeiroDashboard,
} from "../controllers/adminMasterController.js";
import {
  criar as criarNotificacao, listarTodas as listarTodasNotificacoes,
  alterarAtiva as alterarAtivaNotificacao, deletar as deletarNotificacao,
} from "../controllers/notificacaoController.js";

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

// ETAPA 12 — plano + notificacoes + export
router.patch("/empresas/:id/plano", alterarPlano);
router.get("/empresas/:id/export", exportarEmpresa);

// ETAPA#6 — segmento de negocio (define se cadastro de produto exibe
// campos extras para Auto-Pecas / Farmacia / Papelaria).
router.patch("/empresas/:id/segmento", alterarSegmento);
router.get("/notificacoes", listarTodasNotificacoes);
router.post("/notificacoes", criarNotificacao);
router.patch("/notificacoes/:id", alterarAtivaNotificacao);
router.delete("/notificacoes/:id", deletarNotificacao);

// Dashboard financeiro do SaaS
router.get("/financeiro", financeiroDashboard);

export default router;
