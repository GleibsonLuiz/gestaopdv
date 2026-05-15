import { Router } from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import { obter, salvar } from "../controllers/configuracaoController.js";
import {
  uploadLogotipo, tratarErroUploadLogotipo,
  enviarLogotipo, excluirLogotipo,
} from "../controllers/configuracaoLogotipoController.js";

const router = Router();

router.use(authRequired);

// GET livre — todos os usuarios autenticados precisam ler para popular
// cabecalhos de relatorios, recibos e impressoes.
router.get("/", obter);

// Mutacoes liberadas para ADMIN e GERENTE — ambos administram a empresa.
router.put("/", requireRole("ADMIN", "GERENTE"), salvar);
router.post("/logotipo",
  requireRole("ADMIN", "GERENTE"),
  uploadLogotipo.single("logotipo"),
  tratarErroUploadLogotipo,
  enviarLogotipo,
);
router.delete("/logotipo", requireRole("ADMIN", "GERENTE"), excluirLogotipo);

export default router;
