import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import {
  listarPlanos, minhaAssinatura, assinarPlano, webhook,
} from "../controllers/billingController.js";

// Rota PUBLICA do webhook — sem auth (gateway de pagamento chama). A validacao
// e feita DENTRO do handler via segredo do gateway (provedor.verificarAssinaturaWebhook).
export const webhookRouter = Router();
webhookRouter.post("/billing", webhook);

// Rotas autenticadas da assinatura. authRequired ja injeta req.tenantId.
const router = Router();
router.use(authRequired);

router.get("/planos", listarPlanos);
router.get("/assinatura", minhaAssinatura);
router.post("/assinar", assinarPlano);

export default router;
