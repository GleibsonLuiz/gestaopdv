import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, obter, criar, atualizar, excluir } from "../controllers/produtoController.js";
import {
  uploadImagem, tratarErroUploadImagem, enviarImagem, excluirImagem,
} from "../controllers/produtoImagemController.js";

const router = Router();

router.use(authRequired);

// GETs liberados (PDV/Compras/Estoque consultam produtos).
router.get("/", listar);
router.get("/:id", obter);
router.post("/", requirePermissao("PRODUTOS"), requireRole("ADMIN", "GERENTE"), criar);
router.put("/:id", requirePermissao("PRODUTOS"), requireRole("ADMIN", "GERENTE"), atualizar);
router.delete("/:id", requirePermissao("PRODUTOS"), requireRole("ADMIN"), excluir);

router.post(
  "/:id/imagem",
  requirePermissao("PRODUTOS"),
  requireRole("ADMIN", "GERENTE"),
  (req, res, next) => uploadImagem.single("imagem")(req, res, err => tratarErroUploadImagem(err, req, res, next)),
  enviarImagem,
);
router.delete(
  "/:id/imagem",
  requirePermissao("PRODUTOS"),
  requireRole("ADMIN", "GERENTE"),
  excluirImagem,
);

export default router;
