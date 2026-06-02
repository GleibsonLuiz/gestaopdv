import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, obter, criar, atualizar, excluir, historicoCompras, consultarNcm, buscarNcm, buscarCest } from "../controllers/produtoController.js";
import {
  uploadImagem, tratarErroUploadImagem, enviarImagem, excluirImagem,
} from "../controllers/produtoImagemController.js";

const router = Router();

router.use(authRequired);

// GETs liberados (PDV/Compras/Estoque consultam produtos).
router.get("/", listar);
// Consulta de NCM (BrasilAPI) — usada no cadastro p/ validar/descrever o NCM.
// Vem antes de "/:id" para que "ncm" nao seja interpretado como um id.
// Busca por descricao (?q=) vem antes de "/ncm/:codigo" para nao colidir.
router.get("/ncm", buscarNcm);
router.get("/ncm/:codigo", consultarNcm);
// Sugestao de CEST a partir do NCM (tabela local Conv. 142/2018).
router.get("/cest", buscarCest);
router.get("/:id/compras", historicoCompras);
router.get("/:id", obter);
router.post("/", requirePermissao("PRODUTOS"), requireRole("ADMIN", "GERENTE"), criar);
router.put("/:id", requirePermissao("PRODUTOS"), requireRole("ADMIN", "GERENTE"), atualizar);
// "Excluir" e soft-delete (marca ativo=false); por isso GERENTE tambem pode inativar.
router.delete("/:id", requirePermissao("PRODUTOS"), requireRole("ADMIN", "GERENTE"), excluir);

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
