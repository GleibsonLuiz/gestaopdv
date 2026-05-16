import { Router } from "express";
import { authRequired, requireSuperAdmin } from "../middlewares/auth.js";
import { signup } from "../controllers/tenantController.js";

const router = Router();

// ETAPA 10 multi-tenant: endpoint anteriormente publico, agora exige
// super-admin. Apenas o desenvolvedor do sistema (User.superAdmin=true)
// pode criar novas empresas. Decisao do produto: signup publico foi
// removido. Para fluxo equivalente via tela do dev, ver
// /admin-master/empresas (POST).
router.post("/signup", authRequired, requireSuperAdmin, signup);

export default router;
