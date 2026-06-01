import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import {
  listar, obter, criar, atualizar, alterarStatus, converterEmVenda, excluir,
  gerarLinkPublico, obterPublico, responderPublico,
} from "../controllers/orcamentoController.js";

const router = Router();

// ===== Rotas publicas (aceite online, SEM auth) =====
// Token unico globalmente e a chave de seguranca; nao ha tenantStorage aqui.
// Precisam vir ANTES de router.use(authRequired) e antes de "/:id" para nao
// serem capturadas pelo matcher generico.
router.get("/publico/:token", obterPublico);
router.post("/publico/:token", responderPublico);

router.use(authRequired);
router.use(requirePermissao("ORCAMENTOS"));

router.get("/", listar);
router.get("/:id", obter);
router.post("/", requireRole("ADMIN", "GERENTE", "VENDEDOR"), criar);
router.put("/:id", requireRole("ADMIN", "GERENTE", "VENDEDOR"), atualizar);
router.post("/:id/status", requireRole("ADMIN", "GERENTE", "VENDEDOR"), alterarStatus);
router.post("/:id/link-publico", requireRole("ADMIN", "GERENTE", "VENDEDOR"), gerarLinkPublico);
router.post("/:id/converter-venda", requireRole("ADMIN", "GERENTE", "VENDEDOR"), converterEmVenda);
router.delete("/:id", requireRole("ADMIN", "GERENTE"), excluir);

export default router;
