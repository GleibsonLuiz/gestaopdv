import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import {
  listar, obter, criar, atualizar, pagar, reabrir, cancelar, excluir,
} from "../controllers/contaPagarController.js";
import { upload, tratarErroUpload, anexarPagar, excluirAnexo } from "../controllers/anexoController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("FINANCEIRO"));

router.get("/", listar);
router.get("/:id", obter);
router.post("/", requireRole("ADMIN", "GERENTE"), criar);
router.put("/:id", requireRole("ADMIN", "GERENTE"), atualizar);
router.post("/:id/pagar", requireRole("ADMIN", "GERENTE"), pagar);
router.post("/:id/reabrir", requireRole("ADMIN", "GERENTE"), reabrir);
router.post("/:id/cancelar", requireRole("ADMIN", "GERENTE"), cancelar);
router.delete("/:id", requireRole("ADMIN"), excluir);

router.post(
  "/:id/anexos",
  requireRole("ADMIN", "GERENTE"),
  (req, res, next) => upload.single("arquivo")(req, res, err => tratarErroUpload(err, req, res, next)),
  anexarPagar,
);
router.delete(
  "/:id/anexos/:anexoId",
  requireRole("ADMIN", "GERENTE"),
  (req, _res, next) => { req.params.tipo = "pagar"; next(); },
  excluirAnexo,
);

export default router;
