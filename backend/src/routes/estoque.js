import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, criar, registrarProducao } from "../controllers/estoqueController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("ESTOQUE"));

router.get("/movimentacoes", listar);
router.post("/movimentacoes", requireRole("ADMIN", "GERENTE"), criar);
// Producao propria (padaria/lanchonete): explode a ficha tecnica do produto —
// ENTRADA no produto final + SAIDA nos insumos, numa transacao.
router.post("/producao", requireRole("ADMIN", "GERENTE"), registrarProducao);

export default router;
