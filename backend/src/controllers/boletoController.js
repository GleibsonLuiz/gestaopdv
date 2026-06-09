// ============ BOLETO HIBRIDO (BOLETO + PIX) VIA ASAAS ============
//
// O LOJISTA emite boleto para cobrar o CLIENTE FINAL, pela conta Asaas DELE
// (credencial por-tenant cifrada em ConfiguracaoEmpresa.asaas*). Espelha o
// pagamentoMpController: credencial cifrada, webhook autenticado por secret na
// URL + claim atomico para idempotencia. O boleto e um MEIO de cobranca de uma
// ContaReceber — quando pago, quita o titulo vinculado.
//
// NAO confundir com billingController: aquele cobra a ASSINATURA do SaaS
// (plataforma -> tenant) com a NOSSA conta Asaas via env vars.

import crypto from "node:crypto";
import prisma, { prismaRaw, tenantStorage } from "../lib/prisma.js";
import { cifrar, decifrar, mascarar } from "../lib/cripto.js";
import { compararSegredo } from "../lib/timingSafe.js";
import { validarCpfCnpj } from "../lib/fiscal/validarPayload.js";
import {
  AsaasError,
  garantirCliente,
  criarBoleto,
  obterBoleto,
  cancelarBoleto,
  interpretarWebhook,
} from "../lib/asaasCobranca.js";

// Idade minima (ms) antes de o GET de status consultar o Asaas como fallback
// do webhook. Boleto e pago em dias, entao nao precisa ser agressivo.
const POLLING_FALLBACK_MS = 15000;

// ============ HELPERS ============

function safeDecifrarPrefixo(blob) {
  try { return decifrar(blob); } catch { return "***"; }
}

// Carrega a config Asaas do tenant e valida que esta pronta para emitir.
// Lanca 412 se desativada ou sem credencial. Devolve a apiKey decifrada.
async function obterConfigInterna() {
  const cfg = await prisma.configuracaoEmpresa.findFirst({
    select: {
      id: true, tenantId: true,
      asaasApiKeyEnc: true, asaasAmbiente: true, asaasAtivo: true,
      asaasWebhookSecret: true, repassarTaxaBoleto: true, valorTaxaBoleto: true,
    },
  });
  if (!cfg || !cfg.asaasApiKeyEnc || !cfg.asaasAtivo) {
    const e = new Error("Boleto Asaas nao configurado/ativo. Acesse Configuracoes > Boleto (Asaas).");
    e.status = 412;
    throw e;
  }
  let apiKey;
  try {
    apiKey = decifrar(cfg.asaasApiKeyEnc);
  } catch (err) {
    const e = new Error("Falha ao decifrar a credencial Asaas. Refaca a configuracao.");
    e.status = 500;
    e.cause = err;
    throw e;
  }
  return { cfg, apiKey };
}

// Calcula a taxa repassada e o valor cobrado a partir da config do tenant.
function calcularValores({ valorOriginal, repassar, valorTaxa }) {
  const original = Math.round(Number(valorOriginal) * 100) / 100;
  const taxa = repassar ? Math.round(Number(valorTaxa || 0) * 100) / 100 : 0;
  const cobrado = Math.round((original + taxa) * 100) / 100;
  return { valorOriginal: original, taxa, valorCobrado: cobrado };
}

// ============ CONFIG ============

// GET /boletos/config
export async function obterConfig(req, res, next) {
  try {
    const cfg = await prisma.configuracaoEmpresa.findFirst({
      select: {
        asaasApiKeyEnc: true, asaasAmbiente: true, asaasAtivo: true,
        asaasWebhookSecret: true, repassarTaxaBoleto: true, valorTaxaBoleto: true,
      },
    });

    // A URL do webhook carrega o secret que ROTEIA a notificacao ao tenant —
    // so exposta a quem administra a config (ADMIN/GERENTE).
    const podeVerSecret = req.user?.role === "ADMIN" || req.user?.role === "GERENTE";
    let webhookUrl = null;
    if (podeVerSecret && cfg?.asaasWebhookSecret) {
      const proto = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.get("host");
      webhookUrl = `${proto}://${host}/boletos/webhook?secret=${cfg.asaasWebhookSecret}`;
    }

    res.json({
      configurada: !!cfg?.asaasApiKeyEnc,
      asaasAtivo: !!cfg?.asaasAtivo,
      asaasAmbiente: cfg?.asaasAmbiente || "sandbox",
      asaasApiKeyMascarada: cfg?.asaasApiKeyEnc
        ? mascarar(safeDecifrarPrefixo(cfg.asaasApiKeyEnc))
        : null,
      repassarTaxaBoleto: !!cfg?.repassarTaxaBoleto,
      valorTaxaBoleto: cfg?.valorTaxaBoleto != null ? Number(cfg.valorTaxaBoleto) : null,
      webhookUrl,
    });
  } catch (err) { next(err); }
}

// PUT /boletos/config
// Body: { asaasApiKey?, asaasAmbiente?, asaasAtivo?, repassarTaxaBoleto?,
//         valorTaxaBoleto? }. Passe asaasApiKey "" para limpar a credencial.
export async function salvarConfig(req, res, next) {
  try {
    const data = {};

    if (req.body?.asaasApiKey !== undefined) {
      const k = req.body.asaasApiKey;
      if (k === null || k === "") {
        data.asaasApiKeyEnc = null;
        data.asaasAtivo = false; // sem credencial nao tem como ativar
      } else if (typeof k === "string") {
        const limpo = k.trim();
        // Chaves do Asaas tem prefixo $aact_ e sao longas.
        if (limpo.length < 20) {
          return res.status(400).json({ erro: "API Key do Asaas parece invalida (esperado prefixo $aact_...)." });
        }
        data.asaasApiKeyEnc = cifrar(limpo);
      }
    }

    if (req.body?.asaasAmbiente !== undefined) {
      const amb = String(req.body.asaasAmbiente).toLowerCase();
      data.asaasAmbiente = amb === "producao" ? "producao" : "sandbox";
    }
    if (req.body?.asaasAtivo !== undefined) data.asaasAtivo = !!req.body.asaasAtivo;
    if (req.body?.repassarTaxaBoleto !== undefined) {
      data.repassarTaxaBoleto = !!req.body.repassarTaxaBoleto;
    }
    if (req.body?.valorTaxaBoleto !== undefined) {
      const v = req.body.valorTaxaBoleto;
      data.valorTaxaBoleto = (v === null || v === "") ? null : Number(v);
      if (data.valorTaxaBoleto != null && !(data.valorTaxaBoleto >= 0)) {
        return res.status(400).json({ erro: "valorTaxaBoleto invalido." });
      }
    }

    const existente = await prisma.configuracaoEmpresa.findFirst();
    if (!existente) {
      return res.status(412).json({
        erro: "Cadastre os dados da empresa (Configuracoes) antes de configurar o boleto.",
      });
    }

    // Gera o webhook secret na primeira vez que houver credencial. Reutilizado
    // depois (nao re-rotaciona sem pedido explicito — quebraria a URL ja
    // registrada no painel do Asaas).
    if (data.asaasApiKeyEnc && !existente.asaasWebhookSecret) {
      data.asaasWebhookSecret = crypto.randomBytes(24).toString("hex");
    }

    const cfg = await prisma.configuracaoEmpresa.update({
      where: { id: existente.id }, data,
    });

    res.json({
      configurada: !!cfg.asaasApiKeyEnc,
      asaasAtivo: cfg.asaasAtivo,
      asaasAmbiente: cfg.asaasAmbiente,
      asaasApiKeyMascarada: cfg.asaasApiKeyEnc
        ? mascarar(safeDecifrarPrefixo(cfg.asaasApiKeyEnc))
        : null,
      repassarTaxaBoleto: cfg.repassarTaxaBoleto,
      valorTaxaBoleto: cfg.valorTaxaBoleto != null ? Number(cfg.valorTaxaBoleto) : null,
    });
  } catch (err) { next(err); }
}

// ============ EMISSAO ============

// POST /boletos
// Body: { clienteId, contaReceberId?, vendaId?, valor?, vencimento?, descricao? }
// - Se contaReceberId vier, valor/vencimento/cliente saem do titulo (a menos
//   que sobrescritos no body). Senao, valor e vencimento sao obrigatorios.
export async function criar(req, res, next) {
  try {
    const { cfg, apiKey } = await obterConfigInterna();

    const clienteIdBody = req.body?.clienteId;
    const contaReceberId = req.body?.contaReceberId || null;

    // 1) Resolve o titulo financeiro (quando informado) — fonte de valor/cliente.
    let conta = null;
    if (contaReceberId) {
      conta = await prisma.contaReceber.findUnique({ where: { id: contaReceberId } });
      if (!conta) return res.status(404).json({ erro: "Conta a receber nao encontrada." });
      if (conta.status === "PAGA") {
        return res.status(409).json({ erro: "Esta conta ja foi recebida." });
      }
      if (conta.status === "CANCELADA") {
        return res.status(409).json({ erro: "Conta cancelada nao pode gerar boleto." });
      }
      // Boleto ja emitido e ainda valido para esta conta? Evita duplicar.
      const jaExiste = await prisma.boletoAsaas.findFirst({
        where: { contaReceberId, status: { in: ["PENDENTE", "PAGO"] } },
        orderBy: { createdAt: "desc" },
      });
      if (jaExiste) {
        return res.status(409).json({
          erro: "Esta conta ja possui um boleto ativo.",
          boletoId: jaExiste.id,
        });
      }
    }

    // 2) Resolve o cliente (do titulo ou do body).
    const clienteId = clienteIdBody || conta?.clienteId || null;
    if (!clienteId) {
      return res.status(400).json({ erro: "Informe o cliente do boleto." });
    }
    const cliente = await prisma.cliente.findUnique({ where: { id: String(clienteId) } });
    if (!cliente) return res.status(404).json({ erro: "Cliente nao encontrado." });

    // 3) Pre-validacao LOCAL (falha antes da rede). CPF/CNPJ por digito
    //    verificador + campos minimos exigidos pelo Asaas para boleto.
    const faltando = [];
    if (!cliente.nome || !cliente.nome.trim()) faltando.push({ campo: "nome", erro: "Cliente sem nome." });
    if (!cliente.cpfCnpj) {
      faltando.push({ campo: "cpfCnpj", erro: "Cliente sem CPF/CNPJ." });
    } else if (!validarCpfCnpj(cliente.cpfCnpj)) {
      faltando.push({ campo: "cpfCnpj", erro: "CPF/CNPJ do cliente e invalido." });
    }
    if (faltando.length) {
      return res.status(422).json({
        erro: "Complete o cadastro do cliente para emitir o boleto.",
        campos: faltando,
      });
    }

    // 4) Valor e vencimento.
    const valorOriginalRaw = req.body?.valor != null
      ? Number(req.body.valor)
      : (conta ? Number(conta.valor) : NaN);
    if (!(valorOriginalRaw > 0)) {
      return res.status(400).json({ erro: "Valor do boleto invalido." });
    }
    const vencimentoRaw = req.body?.vencimento || conta?.vencimento;
    const vencimento = vencimentoRaw ? new Date(vencimentoRaw) : null;
    if (!vencimento || Number.isNaN(vencimento.getTime())) {
      return res.status(400).json({ erro: "Vencimento invalido." });
    }

    const { valorOriginal, taxa, valorCobrado } = calcularValores({
      valorOriginal: valorOriginalRaw,
      repassar: cfg.repassarTaxaBoleto,
      valorTaxa: cfg.valorTaxaBoleto,
    });

    // 5) Cria o registro local PENDENTE primeiro (igual IntencaoPagamentoMP).
    //    Se o Asaas recusar, marcamos ERRO — nunca fica registro "meio gerado".
    const descricao = String(
      req.body?.descricao || conta?.descricao || `Cobranca ${cliente.nome}`,
    ).slice(0, 200);

    const boleto = await prisma.boletoAsaas.create({
      data: {
        status: "PENDENTE",
        valorOriginal, valorCobrado, taxa,
        vencimento,
        clienteId: cliente.id,
        contaReceberId: conta?.id || null,
        vendaId: req.body?.vendaId || conta?.vendaId || null,
        userId: req.user?.sub || null,
        // tenantId injetado pelo extension.
      },
    });

    // 6) Reusa o customer do Asaas se este cliente ja teve um boleto.
    const anterior = await prisma.boletoAsaas.findFirst({
      where: { clienteId: cliente.id, asaasCustomerId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { asaasCustomerId: true },
    });

    try {
      const customerId = await garantirCliente({
        apiKey, ambiente: cfg.asaasAmbiente, cliente,
        asaasCustomerId: anterior?.asaasCustomerId || null,
      });

      const resultado = await criarBoleto({
        apiKey, ambiente: cfg.asaasAmbiente,
        customerId,
        valor: valorCobrado,
        vencimento,
        descricao,
        externalReference: boleto.id,
      });

      const atualizado = await prisma.boletoAsaas.update({
        where: { id: boleto.id },
        data: {
          asaasCustomerId: customerId,
          asaasPaymentId: resultado.asaasPaymentId,
          status: resultado.status, // normalmente PENDENTE
          urlBoleto: resultado.urlBoleto,
          linhaDigitavel: resultado.linhaDigitavel,
          codigoBarras: resultado.codigoBarras,
          pixCopiaECola: resultado.pixCopiaECola,
          pixQrCodeBase64: resultado.pixQrCodeBase64,
          rawAsaas: resultado.raw,
        },
      });

      return res.status(201).json(serializar(atualizado));
    } catch (err) {
      // Falha no Asaas: marca ERRO com o detalhe e devolve mensagem acionavel.
      const detalhe = err instanceof AsaasError ? err.message : String(err?.message || err);
      await prisma.boletoAsaas.update({
        where: { id: boleto.id },
        data: { status: "ERRO", detalhe },
      });

      if (err instanceof AsaasError && (err.httpStatus === 400 || err.httpStatus === 422)) {
        return res.status(422).json({
          erro: detalhe,
          campos: err.campo ? [{ campo: err.campo, erro: detalhe }] : undefined,
          boletoId: boleto.id,
        });
      }
      return res.status(502).json({
        erro: "Falha ao gerar o boleto no Asaas.",
        detalhe,
        boletoId: boleto.id,
      });
    }
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.message });
    next(err);
  }
}

// ============ LISTAGEM / STATUS ============

// GET /boletos?contaReceberId=&clienteId=
export async function listar(req, res, next) {
  try {
    const where = {};
    if (req.query.contaReceberId) where.contaReceberId = String(req.query.contaReceberId);
    if (req.query.clienteId) where.clienteId = String(req.query.clienteId);
    if (req.query.status) where.status = String(req.query.status);
    const boletos = await prisma.boletoAsaas.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(boletos.map(serializar));
  } catch (err) { next(err); }
}

// GET /boletos/:id
// Devolve o estado atual. Se ainda PENDENTE e ja velho, consulta o Asaas como
// fallback do webhook (defesa em profundidade — nunca confia so no body).
export async function obter(req, res, next) {
  try {
    let boleto = await prisma.boletoAsaas.findUnique({ where: { id: req.params.id } });
    if (!boleto) return res.status(404).json({ erro: "Boleto nao encontrado." });

    const idadeMs = Date.now() - new Date(boleto.atualizadoEm).getTime();
    if (boleto.status === "PENDENTE" && boleto.asaasPaymentId && idadeMs > POLLING_FALLBACK_MS) {
      try {
        const { cfg, apiKey } = await obterConfigInterna();
        const atual = await obterBoleto({
          apiKey, ambiente: cfg.asaasAmbiente, asaasPaymentId: boleto.asaasPaymentId,
        });
        const novoStatus = atual.status;
        if (novoStatus !== "PENDENTE") {
          await aplicarStatus({
            tenantId: boleto.tenantId, boletoId: boleto.id,
            novoStatus, pagoEm: atual.pagoEm, raw: atual.raw,
          });
          boleto = await prisma.boletoAsaas.findUnique({ where: { id: req.params.id } });
        }
      } catch { /* fallback silencioso — proximo polling tenta de novo */ }
    }

    res.json(serializar(boleto));
  } catch (err) { next(err); }
}

// POST /boletos/:id/cancelar
export async function cancelar(req, res, next) {
  try {
    const boleto = await prisma.boletoAsaas.findUnique({ where: { id: req.params.id } });
    if (!boleto) return res.status(404).json({ erro: "Boleto nao encontrado." });
    if (boleto.status === "PAGO") {
      return res.status(409).json({ erro: "Boleto ja foi pago — nao pode cancelar." });
    }
    if (boleto.status === "CANCELADO") return res.json(serializar(boleto));

    const { cfg, apiKey } = await obterConfigInterna();
    if (boleto.asaasPaymentId) {
      try {
        await cancelarBoleto({
          apiKey, ambiente: cfg.asaasAmbiente, asaasPaymentId: boleto.asaasPaymentId,
        });
      } catch (err) {
        // Se o Asaas recusar (ja pago), nao sobrescreve — o webhook traz o real.
        if (err instanceof AsaasError && err.httpStatus === 400) {
          return res.status(409).json({
            erro: "Nao foi possivel cancelar no Asaas (pode ja ter sido pago). Aguarde o status.",
          });
        }
        return res.status(502).json({ erro: "Falha ao cancelar no Asaas.", detalhe: String(err?.message || err) });
      }
    }

    const atualizado = await prisma.boletoAsaas.update({
      where: { id: boleto.id },
      data: { status: "CANCELADO", detalhe: "Cancelado pelo operador" },
    });
    res.json(serializar(atualizado));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.message });
    next(err);
  }
}

// ============ WEBHOOK (ROTA PUBLICA) ============

// POST /boletos/webhook?secret=<asaasWebhookSecret>
// SEGURANCA EM CAMADAS:
//   1) secret na URL -> roteia ao tenant dono (barra forjados antes de tocar
//      no banco de outro tenant; lookup por igualdade, 24 bytes aleatorios).
//   2) (opcional) token configurado no painel do Asaas no header
//      `asaas-access-token`, comparado timing-safe.
//   3) re-confirmacao via API do Asaas (nunca confia so no body do webhook).
//   4) claim atomico PENDENTE->final (idempotencia dos retries do Asaas).
export async function webhook(req, res, next) {
  try {
    const secretRecebido = req.query.secret || req.headers["x-webhook-secret"];
    if (!secretRecebido) {
      return res.status(401).json({ erro: "Webhook sem secret." });
    }

    const dono = await prismaRaw.configuracaoEmpresa.findFirst({
      where: {
        asaasWebhookSecret: String(secretRecebido),
        asaasAtivo: true,
        asaasApiKeyEnc: { not: null },
      },
      select: { tenantId: true, asaasApiKeyEnc: true, asaasAmbiente: true },
    });

    if (!dono) return res.status(401).json({ erro: "Webhook nao autorizado." });

    // (Opcional) valida o token que o Asaas envia no header, se voce o
    // configurou via env ASAAS_LOJISTA_WEBHOOK_TOKEN. Comparacao timing-safe.
    const tokenEsperado = process.env.ASAAS_LOJISTA_WEBHOOK_TOKEN;
    if (tokenEsperado) {
      const recebido = req.headers["asaas-access-token"] || "";
      if (!compararSegredo(String(recebido), String(tokenEsperado))) {
        return res.status(401).json({ erro: "Token de webhook invalido." });
      }
    }

    const interpretado = interpretarWebhook({ body: req.body });
    if (!interpretado || !interpretado.asaasPaymentId) {
      return res.json({ ignored: true }); // evento que nao nos interessa
    }

    let apiKey;
    try { apiKey = decifrar(dono.asaasApiKeyEnc); }
    catch { return res.json({ processado: false }); }

    // Re-confirma na API (defesa em profundidade). Se a consulta falhar,
    // caimos no status do proprio webhook como fallback.
    let novoStatus = interpretado.status;
    let pagoEm = interpretado.pagoEm;
    let raw = req.body;
    try {
      const atual = await obterBoleto({
        apiKey, ambiente: dono.asaasAmbiente, asaasPaymentId: interpretado.asaasPaymentId,
      });
      novoStatus = atual.status;
      pagoEm = atual.pagoEm || pagoEm;
      raw = atual.raw;
    } catch { /* usa o status do body */ }

    const processado = await aplicarStatus({
      tenantId: dono.tenantId,
      asaasPaymentId: interpretado.asaasPaymentId,
      novoStatus, pagoEm, raw,
    });

    res.json({ processado });
  } catch (err) { next(err); }
}

// ============ NUCLEO: APLICAR STATUS + QUITAR TITULO ============

// Move o boleto para o status final via claim atomico (idempotente) e, quando
// PAGO, quita a ContaReceber vinculada. Aceita resolver por id OU por
// asaasPaymentId (o webhook nao tem o id local). Roda cross-tenant via
// prismaRaw + tenantStorage para o quitar filtrar pelo tenant correto.
async function aplicarStatus({ tenantId, boletoId, asaasPaymentId, novoStatus, pagoEm, raw }) {
  const where = boletoId
    ? { id: boletoId, tenantId }
    : { asaasPaymentId: String(asaasPaymentId), tenantId };

  const boleto = await prismaRaw.boletoAsaas.findFirst({ where });
  if (!boleto) return false;

  // Idempotencia: se ja esta no status final pedido, no-op.
  if (boleto.status === novoStatus) return true;
  // Nunca "desfaz" um PAGO via webhook tardio de outro evento.
  if (boleto.status === "PAGO" && novoStatus !== "CANCELADO") return true;

  if (novoStatus === "PAGO") {
    // Claim atomico: so UMA execucao move PENDENTE->PAGO (Asaas re-tenta o
    // webhook; o GET de status tambem pode processar em paralelo).
    const claim = await prismaRaw.boletoAsaas.updateMany({
      where: { id: boleto.id, tenantId, status: { not: "PAGO" } },
      data: {
        status: "PAGO",
        pagoEm: pagoEm ? new Date(pagoEm) : new Date(),
        detalhe: "Pago",
        rawAsaas: raw,
      },
    });
    if (claim.count === 0) return true; // outra execucao venceu — idempotente

    // Quita o titulo financeiro. O dinheiro caiu na conta Asaas do lojista
    // (nao no caixa fisico) — por isso marcamos PAGA SEM MovimentacaoCaixa.
    if (boleto.contaReceberId) {
      await tenantStorage.run({ tenantId }, async () => {
        const conta = await prisma.contaReceber.findUnique({
          where: { id: boleto.contaReceberId },
          select: { id: true, status: true },
        });
        if (conta && conta.status !== "PAGA" && conta.status !== "CANCELADA") {
          await prisma.contaReceber.update({
            where: { id: conta.id },
            data: { status: "PAGA", recebimento: pagoEm ? new Date(pagoEm) : new Date() },
          });
        }
      });
    }
    return true;
  }

  // Demais transicoes (VENCIDO, CANCELADO): atualiza direto.
  await prismaRaw.boletoAsaas.updateMany({
    where: { id: boleto.id, tenantId },
    data: { status: novoStatus, rawAsaas: raw },
  });
  return true;
}

// ============ SERIALIZACAO P/ O FRONT ============

function serializar(b) {
  if (!b) return null;
  return {
    id: b.id,
    status: b.status,
    valorOriginal: Number(b.valorOriginal),
    valorCobrado: Number(b.valorCobrado),
    taxa: Number(b.taxa),
    vencimento: b.vencimento,
    pagoEm: b.pagoEm,
    linhaDigitavel: b.linhaDigitavel,
    codigoBarras: b.codigoBarras,
    urlBoleto: b.urlBoleto,
    pixCopiaECola: b.pixCopiaECola,
    pixQrCodeBase64: b.pixQrCodeBase64,
    detalhe: b.detalhe,
    clienteId: b.clienteId,
    contaReceberId: b.contaReceberId,
    vendaId: b.vendaId,
    createdAt: b.createdAt,
  };
}
