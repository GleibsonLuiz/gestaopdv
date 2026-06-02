import { Router } from "express";
import { authRequired, requireRole, requireModulo } from "../middlewares/auth.js";
import { obterConfig, salvarConfig } from "../controllers/configuracaoFiscalController.js";
import {
  emitirNfce, listarNfce, obterNfce, consultarNfce,
  cancelarNfce, inutilizarNumeracao, statusServico,
} from "../controllers/fiscalController.js";

const router = Router();

router.use(authRequired);

// Gate de PLANO: NFC-e e cobrada por plano. `fiscal` so abre nos planos que
// incluem o modulo FISCAL (Pro/Enterprise por padrao, ou liberacao avulsa).
// GET /config e /status-servico ficam de fora do gate: a UI precisa saber se
// a emissao esta disponivel para decidir o que mostrar (inclusive o aviso de
// "disponivel no plano X").
const gateFiscal = requireModulo("FISCAL");

// Configuracao fiscal do emitente (NFC-e modelo 65).
// GET livre p/ usuarios autenticados (a UI precisa saber se a emissao esta
// ativa). CSC nunca retornado decifrado. Mutacao so ADMIN/GERENTE + plano.
router.get("/config", obterConfig);
router.put("/config", gateFiscal, requireRole("ADMIN", "GERENTE"), salvarConfig);

// Emissao de NFC-e — exige o plano incluir fiscal. Emitir/consultar liberado a
// qualquer usuario autenticado (mesma politica das vendas). Listagem/detalhe idem.
router.get("/nfce", gateFiscal, listarNfce);
router.get("/nfce/:id", gateFiscal, obterNfce);
router.post("/nfce", gateFiscal, emitirNfce);
router.post("/nfce/:id/consultar", gateFiscal, consultarNfce);

// Status do servico da SEFAZ (consciencia de contingencia) — leitura, livre.
router.get("/status-servico", statusServico);

// Eventos fiscais — acoes sensiveis, restritas a ADMIN/GERENTE + plano.
router.post("/nfce/:id/cancelar", gateFiscal, requireRole("ADMIN", "GERENTE"), cancelarNfce);
router.post("/inutilizar", gateFiscal, requireRole("ADMIN", "GERENTE"), inutilizarNumeracao);

export default router;
