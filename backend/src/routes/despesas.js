import { Router } from "express";
import { authRequired, requirePermissao } from "../middlewares/auth.js";
import {
  listar, obter, criar, atualizar, excluir, anexar, excluirAnexo, ocr,
  previstoRealizado,
} from "../controllers/despesaController.js";
import { upload, tratarErroUpload, uploadOcr, tratarErroUploadOcr } from "../controllers/anexoController.js";

const router = Router();

router.use(authRequired);
// Quem tem o modulo DESPESAS liberado pode tudo nesta rota (listar, criar,
// editar, excluir, anexar e OCR). Antes criar/editar/excluir exigiam tambem
// cargo ADMIN/GERENTE; passamos a confiar so na permissao do modulo, para que
// um VENDEDOR com Despesas liberado consiga lancar suas despesas.
router.use(requirePermissao("DESPESAS"));

router.get("/", listar);

// Relatorio Previsto x Realizado + ledger de contas pagas (leitura). Antes de
// "/:id" para o segmento fixo nao ser capturado pelo parametro.
router.get("/previsto-realizado", previstoRealizado);

// OCR de comprovante (le e devolve campos sugeridos; nao cria despesa). Usa
// um upload mais permissivo (15 MB, aceita WEBP/GIF) — o arquivo so vai para a
// IA, nao e persistido como anexo.
router.post(
  "/ocr",
  (req, res, next) => uploadOcr.single("arquivo")(req, res, err => tratarErroUploadOcr(err, req, res, next)),
  ocr,
);

router.get("/:id", obter);

// Criacao aceita multipart (comprovante opcional no campo "arquivo").
router.post(
  "/",
  (req, res, next) => upload.single("arquivo")(req, res, err => tratarErroUpload(err, req, res, next)),
  criar,
);

router.put("/:id", atualizar);
router.delete("/:id", excluir);

router.post(
  "/:id/anexos",
  (req, res, next) => upload.single("arquivo")(req, res, err => tratarErroUpload(err, req, res, next)),
  anexar,
);
router.delete("/:id/anexos/:anexoId", excluirAnexo);

export default router;
