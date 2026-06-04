import { Router } from "express";
import { authRequired, requireRole, requireModulo } from "../middlewares/auth.js";
import { obterConfig, salvarConfig } from "../controllers/configuracaoFiscalController.js";
import {
  emitirNfce, listarNfce, obterNfce, consultarNfce,
  cancelarNfce, inutilizarNumeracao, statusServico,
} from "../controllers/fiscalController.js";
import {
  emitirNfse, listarNfse, obterNfse, consultarNfse,
  cancelarNfse, baixarPdfNfse,
} from "../controllers/nfseController.js";
import {
  uploadEntrada, listarEntradas, obterEntrada, efetivarEntrada, estornarEntrada, descartarEntrada,
} from "../controllers/notaEntradaController.js";
import {
  sincronizarDFe, listarDFe, baixarDFe, ignorarDFe,
} from "../controllers/dfeController.js";

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

// ============ NFS-e (servicos / ISS) ============
// Gate de PLANO proprio: NFS-e e o modulo NFSE (Enterprise por padrao), separado
// do FISCAL (NFC-e). Emitir/consultar/listar liberado a qualquer usuario
// autenticado; cancelar restrito a ADMIN/GERENTE.
const gateNfse = requireModulo("NFSE");

router.get("/nfse", gateNfse, listarNfse);
router.get("/nfse/:id", gateNfse, obterNfse);
router.get("/nfse/:id/pdf", gateNfse, baixarPdfNfse);
router.post("/nfse", gateNfse, emitirNfse);
router.post("/nfse/:id/consultar", gateNfse, consultarNfse);
router.post("/nfse/:id/cancelar", gateNfse, requireRole("ADMIN", "GERENTE"), cancelarNfse);

// ============ ENTRADA de NF-e de fornecedor (importacao de compra) ============
// Gate FISCAL (processamento de NF-e). Upload/list/detalhe a qualquer usuario
// autenticado; efetivar/descartar (mexem em estoque + financeiro) so ADMIN/GERENTE.
router.post("/entrada", gateFiscal, uploadEntrada);
router.get("/entrada", gateFiscal, listarEntradas);
router.get("/entrada/:id", gateFiscal, obterEntrada);
router.post("/entrada/:id/efetivar", gateFiscal, requireRole("ADMIN", "GERENTE"), efetivarEntrada);
router.post("/entrada/:id/estornar", gateFiscal, requireRole("ADMIN", "GERENTE"), estornarEntrada);
router.post("/entrada/:id/descartar", gateFiscal, requireRole("ADMIN", "GERENTE"), descartarEntrada);

// ============ DISTRIBUICAO DF-e (NF-e recebidas contra o CNPJ) ============
// Caixa de entrada da SEFAZ. Listar liberado a usuario autenticado; sincronizar/
// baixar/ignorar (mexem em dados fiscais) restritos a ADMIN/GERENTE.
router.get("/dfe", gateFiscal, listarDFe);
router.post("/dfe/sincronizar", gateFiscal, requireRole("ADMIN", "GERENTE"), sincronizarDFe);
router.post("/dfe/:id/baixar", gateFiscal, requireRole("ADMIN", "GERENTE"), baixarDFe);
router.post("/dfe/:id/ignorar", gateFiscal, requireRole("ADMIN", "GERENTE"), ignorarDFe);

export default router;
