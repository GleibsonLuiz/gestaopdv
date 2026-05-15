import { Router } from "express";
import { authRequired, requirePermissao } from "../middlewares/auth.js";
import {
  relatorioVendas,
  relatorioCompras,
  relatorioFinanceiro,
  relatorioEstoque,
  relatorioCaixas,
} from "../controllers/relatoriosController.js";
import {
  relatorioFunilCrm,
  relatorioPerformanceCrm,
  relatorioCarteiraCrm,
  relatorioNpsCrm,
  relatorioAtividadesCrm,
  relatorioForecastCrm,
  relatorioPerdasCrm,
} from "../controllers/relatoriosCrmController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("RELATORIOS"));

router.get("/vendas", relatorioVendas);
router.get("/compras", relatorioCompras);
router.get("/financeiro", relatorioFinanceiro);
router.get("/estoque", relatorioEstoque);
router.get("/caixas", relatorioCaixas);
router.get("/crm/funil", relatorioFunilCrm);
router.get("/crm/performance", relatorioPerformanceCrm);
router.get("/crm/carteira", relatorioCarteiraCrm);
router.get("/crm/nps", relatorioNpsCrm);
router.get("/crm/atividades", relatorioAtividadesCrm);
router.get("/crm/forecast", relatorioForecastCrm);
router.get("/crm/perdas", relatorioPerdasCrm);

export default router;
