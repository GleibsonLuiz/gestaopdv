import { Router } from "express";
import { authRequired, requireRole } from "../middlewares/auth.js";
import { obterConfig, salvarConfig } from "../controllers/configuracaoFiscalController.js";
import {
  emitirNfce, listarNfce, obterNfce, consultarNfce,
  cancelarNfce, inutilizarNumeracao, statusServico,
} from "../controllers/fiscalController.js";

const router = Router();

router.use(authRequired);

// Configuracao fiscal do emitente (NFC-e modelo 65).
// GET livre p/ usuarios autenticados (a UI precisa saber se a emissao esta
// ativa). CSC nunca retornado decifrado. Mutacao so ADMIN/GERENTE.
router.get("/config", obterConfig);
router.put("/config", requireRole("ADMIN", "GERENTE"), salvarConfig);

// Emissao de NFC-e. Emitir/consultar exige caixa/vendedor operando — liberado
// a qualquer usuario autenticado (mesma politica das vendas). Listagem/detalhe
// idem. Cancelamento/inutilizacao (Fase 5) terao politica propria.
router.get("/nfce", listarNfce);
router.get("/nfce/:id", obterNfce);
router.post("/nfce", emitirNfce);
router.post("/nfce/:id/consultar", consultarNfce);

// Status do servico da SEFAZ (consciencia de contingencia) — leitura, livre.
router.get("/status-servico", statusServico);

// Eventos fiscais — acoes sensiveis, restritas a ADMIN/GERENTE.
router.post("/nfce/:id/cancelar", requireRole("ADMIN", "GERENTE"), cancelarNfce);
router.post("/inutilizar", requireRole("ADMIN", "GERENTE"), inutilizarNumeracao);

export default router;
