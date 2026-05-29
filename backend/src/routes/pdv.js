import { Router } from "express";
import { authRequired, requirePermissao } from "../middlewares/auth.js";
import { inicio } from "../controllers/pdvController.js";
import {
  listar as listarEspera,
  criar as criarEspera,
  excluir as excluirEspera,
} from "../controllers/vendaEsperaController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("PDV"));

router.get("/inicio", inicio);

// Vendas em espera (park/hold): salvar o atendimento atual para retomar depois.
router.get("/vendas-espera", listarEspera);
router.post("/vendas-espera", criarEspera);
router.delete("/vendas-espera/:id", excluirEspera);

export default router;
