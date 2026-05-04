import { Router } from "express";
import { authRequired, requirePermissao } from "../middlewares/auth.js";
import {
  relatorioVendas,
  relatorioCompras,
  relatorioFinanceiro,
  relatorioEstoque,
  relatorioCaixas,
} from "../controllers/relatoriosController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("RELATORIOS"));

router.get("/vendas", relatorioVendas);
router.get("/compras", relatorioCompras);
router.get("/financeiro", relatorioFinanceiro);
router.get("/estoque", relatorioEstoque);
router.get("/caixas", relatorioCaixas);

export default router;
