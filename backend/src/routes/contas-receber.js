import { Router } from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import {
  listar, obter, criar, atualizar, receber, reabrir, cancelar, excluir,
} from "../controllers/contaReceberController.js";

const router = Router();

router.use(authRequired);

router.get("/", listar);
router.get("/:id", obter);
router.post("/", requireRole("ADMIN", "GERENTE"), criar);
router.put("/:id", requireRole("ADMIN", "GERENTE"), atualizar);
router.post("/:id/receber", requireRole("ADMIN", "GERENTE"), receber);
router.post("/:id/reabrir", requireRole("ADMIN", "GERENTE"), reabrir);
router.post("/:id/cancelar", requireRole("ADMIN", "GERENTE"), cancelar);
router.delete("/:id", requireRole("ADMIN"), excluir);

export default router;
