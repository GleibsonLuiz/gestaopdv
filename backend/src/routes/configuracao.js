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

// Mutacoes restritas a ADMIN — proprietario do sistema.
router.put("/", requireRole("ADMIN"), salvar);
router.post("/logotipo",
  requireRole("ADMIN"),
  uploadLogotipo.single("logotipo"),
  tratarErroUploadLogotipo,
  enviarLogotipo,
);
router.delete("/logotipo", requireRole("ADMIN"), excluirLogotipo);

export default router;
