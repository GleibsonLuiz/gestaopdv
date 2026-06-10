import { Router } from "express";
import { authRequired, requirePermissao } from "../middlewares/auth.js";
import {
  validarBody, abrirCaixaSchema, fecharCaixaSchema, movimentoCaixaSchema,
} from "../middlewares/validarBody.js";
import * as caixa from "../controllers/caixaController.js";

const router = Router();

router.use(authRequired);
router.use(requirePermissao("CAIXA"));

// Caixa atual do usuario logado (pode ser null).
router.get("/atual", caixa.obterAtual);

// Sugestao de troco baseada no ultimo fechamento do user.
router.get("/sugestao-troco", caixa.sugerirTroco);

// Historico de caixas.
router.get("/", caixa.listar);

// Extrato de um caixa especifico.
router.get("/:id/extrato", caixa.extrato);

// Operacoes.
router.post("/abrir", validarBody(abrirCaixaSchema), caixa.abrir);
router.post("/:id/fechar", validarBody(fecharCaixaSchema), caixa.fechar);
router.post("/:id/sangria", validarBody(movimentoCaixaSchema), caixa.sangria);
router.post("/:id/suprimento", validarBody(movimentoCaixaSchema), caixa.suprimento);

export default router;
