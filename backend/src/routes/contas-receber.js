import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import {
  listar, obter, criar, atualizar, receber, reabrir, cancelar, excluir,
} from "../controllers/contaReceberController.js";
import { upload, tratarErroUpload, anexarReceber, excluirAnexo } from "../controllers/anexoController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("FINANCEIRO"));

router.get("/", listar);
router.get("/:id", obter);
router.post("/", requireRole("ADMIN", "GERENTE"), criar);
router.put("/:id", requireRole("ADMIN", "GERENTE"), atualizar);
router.post("/:id/receber", requireRole("ADMIN", "GERENTE"), receber);
router.post("/:id/reabrir", requireRole("ADMIN", "GERENTE"), reabrir);
router.post("/:id/cancelar", requireRole("ADMIN", "GERENTE"), cancelar);
router.delete("/:id", requireRole("ADMIN"), excluir);

router.post(
  "/:id/anexos",
  requireRole("ADMIN", "GERENTE"),
  (req, res, next) => upload.single("arquivo")(req, res, err => tratarErroUpload(err, req, res, next)),
  anexarReceber,
);
router.delete(
  "/:id/anexos/:anexoId",
  requireRole("ADMIN", "GERENTE"),
  (req, _res, next) => { req.params.tipo = "receber"; next(); },
  excluirAnexo,
);

export default router;
