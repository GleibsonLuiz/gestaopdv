import { Router } from "express";
import { authRequired, requireRole, requirePermissao } from "../middlewares/auth.js";
import {
  listar, obter, criar, aceitar, cancelar, finalizar, resumo, stream,
  adicionarItens, listarAbertas,
  marcarPronto, marcarServindo, marcarEmEntrega,
} from "../controllers/comandaController.js";

const router = Router();

// SSE: precisa vir ANTES do authRequired, porque EventSource nao envia
// header Authorization (auth feita via query ?token=... no proprio handler).
router.get("/stream", stream);

router.use(authRequired);
router.use(requirePermissao("COMANDAS"));

router.get("/", listar);
router.get("/resumo", resumo);
router.get("/abertas", listarAbertas);
router.get("/:id", obter);

// PDV Volante envia pra ca; vendedores tambem podem criar manualmente
// pelo painel da central. Permitido para qualquer role com COMANDAS.
router.post("/", criar);

// Adicionar itens a uma comanda ja aberta (cliente pediu mais).
router.post("/:id/itens", adicionarItens);

router.patch("/:id/aceitar", aceitar);
router.patch("/:id/pronto", marcarPronto);
router.patch("/:id/servindo", marcarServindo);
router.patch("/:id/em-entrega", marcarEmEntrega);
router.patch("/:id/cancelar", cancelar);
// finalizar gera Venda real — restrito a ADMIN/GERENTE/VENDEDOR (todos
// que possam vender — controlado pela permissao COMANDAS + PDV).
router.post("/:id/finalizar", requireRole("ADMIN", "GERENTE", "VENDEDOR"), finalizar);

export default router;
