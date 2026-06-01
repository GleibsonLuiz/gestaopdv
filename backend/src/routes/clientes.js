import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import { listar, obter, obterScore, criar, atualizar, excluir, perfil, timeline, segmentos, aniversariantes, reativacao } from "../controllers/clienteController.js";
import { listar as listarInteracoes, criar as criarInteracao, excluir as excluirInteracao } from "../controllers/interacaoController.js";
import { listar as listarContatos, criar as criarContato, atualizar as atualizarContato, excluir as excluirContato } from "../controllers/contatoController.js";

const router = Router();

router.use(authRequired);

// GETs liberados (PDV e outros modulos consultam clientes).
router.get("/", listar);
router.get("/segmentos", segmentos);
router.get("/aniversariantes", aniversariantes);
router.get("/reativacao", reativacao);
router.get("/:id/perfil", perfil);
router.get("/:id/timeline", timeline);
router.get("/:id/score", obterScore);
router.get("/:id", obter);
router.post("/", requirePermissao("CLIENTES"), criar);
router.put("/:id", requirePermissao("CLIENTES"), requireRole("ADMIN", "GERENTE"), atualizar);
router.delete("/:id", requirePermissao("CLIENTES"), requireRole("ADMIN"), excluir);

// Interacoes CRM — qualquer usuario autenticado pode listar/criar;
// apenas ADMIN pode excluir (para preservar o historico).
router.get("/:clienteId/interacoes", listarInteracoes);
router.post("/:clienteId/interacoes", criarInteracao);
router.delete("/:clienteId/interacoes/:id", requireRole("ADMIN"), excluirInteracao);

// Contatos (B2B): qualquer um autenticado pode listar. Mutacoes seguem
// a regra de CLIENTES (permissao + ADMIN/GERENTE para criar/editar,
// ADMIN para excluir).
router.get("/:clienteId/contatos", listarContatos);
router.post("/:clienteId/contatos", requirePermissao("CLIENTES"), requireRole("ADMIN", "GERENTE"), criarContato);
router.put("/:clienteId/contatos/:id", requirePermissao("CLIENTES"), requireRole("ADMIN", "GERENTE"), atualizarContato);
router.delete("/:clienteId/contatos/:id", requirePermissao("CLIENTES"), requireRole("ADMIN"), excluirContato);

export default router;
