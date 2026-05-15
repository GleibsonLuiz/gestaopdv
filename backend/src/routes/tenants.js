import { Router } from "express";
import { signup } from "../controllers/tenantController.js";

const router = Router();

// Endpoint publico — NAO usa authRequired.
// Signup cria nova Empresa + admin User em transacao atomica.
router.post("/signup", signup);

export default router;
