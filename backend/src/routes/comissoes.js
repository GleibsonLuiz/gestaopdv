import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, listarVendedores, obter, salvar, excluir, relatorio, metasMes } from "../controllers/comissaoController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("COMISSOES"));

router.get("/", listar);
router.get("/vendedores", listarVendedores);
router.get("/relatorio", relatorio);
router.get("/metas-mes", metasMes);
router.get("/:userId", obter);
router.put("/:userId", requireRole("ADMIN", "GERENTE"), salvar);
router.delete("/:userId", requireRole("ADMIN"), excluir);

export default router;
