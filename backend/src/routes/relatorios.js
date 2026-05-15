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

export default router;
