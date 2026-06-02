import { Router } from "express";
import { obterCardapioPublico, criarPedidoPublico } from "../controllers/cardapioController.js";

// Rotas PUBLICAS do cardapio digital (pedido online) — SEM auth. A chave de
// seguranca e o cardapioToken (unico global); a empresa e resolvida por ele.
// Validacao de modulo/plano/ativo acontece dentro do controller.
const router = Router();

router.get("/:token", obterCardapioPublico);
router.post("/:token/pedido", criarPedidoPublico);

export default router;
