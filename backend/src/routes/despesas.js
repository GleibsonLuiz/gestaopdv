import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import {
  listar, obter, criar, atualizar, excluir, anexar, excluirAnexo, ocr,
  previstoRealizado,
} from "../controllers/despesaController.js";
import { upload, tratarErroUpload } from "../controllers/anexoController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("DESPESAS"));

router.get("/", listar);

// Relatorio Previsto x Realizado + ledger de contas pagas (leitura). Antes de
// "/:id" para o segmento fixo nao ser capturado pelo parametro.
router.get("/previsto-realizado", previstoRealizado);

// OCR de comprovante (le e devolve campos sugeridos; nao cria despesa).
router.post(
  "/ocr",
  requireRole("ADMIN", "GERENTE"),
  (req, res, next) => upload.single("arquivo")(req, res, err => tratarErroUpload(err, req, res, next)),
  ocr,
);

router.get("/:id", obter);

// Criacao aceita multipart (comprovante opcional no campo "arquivo").
router.post(
  "/",
  requireRole("ADMIN", "GERENTE"),
  (req, res, next) => upload.single("arquivo")(req, res, err => tratarErroUpload(err, req, res, next)),
  criar,
);

router.put("/:id", requireRole("ADMIN", "GERENTE"), atualizar);
router.delete("/:id", requireRole("ADMIN", "GERENTE"), excluir);

router.post(
  "/:id/anexos",
  requireRole("ADMIN", "GERENTE"),
  (req, res, next) => upload.single("arquivo")(req, res, err => tratarErroUpload(err, req, res, next)),
  anexar,
);
router.delete("/:id/anexos/:anexoId", requireRole("ADMIN", "GERENTE"), excluirAnexo);

export default router;
