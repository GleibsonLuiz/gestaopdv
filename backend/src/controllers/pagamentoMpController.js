import crypto from "node:crypto";
import prisma, { prismaRaw, tenantStorage } from "../lib/prisma.js";
import { cifrar, decifrar, mascarar } from "../lib/cripto.js";
import {
  MercadoPagoError,
  criarPaymentIntent,
  obterPaymentIntent,
  cancelarPaymentIntent,
  obterPayment,
} from "../lib/mercadoPago.js";
import { criar as criarVendaController } from "./vendaController.js";

const TIPOS_MP_VALIDOS = new Set(["CREDIT", "DEBIT", "PIX"]);

// Mapeia o tipo escolhido na maquininha para a FormaPagamento canonica do
// sistema. Usado para sobrescrever pagamentos[0].forma no vendaPayload, de
// forma que quando o webhook aprovar e a Venda for criada, ela registre a
// forma correta (sem depender do que o PDV chutou ao abrir o modal).
const TIPO_PARA_FORMA = {
  CREDIT: "CARTAO_CREDITO",
  DEBIT:  "CARTAO_DEBITO",
  PIX:    "PIX",
};

// ============ HELPERS ============

function somarPagamentos(pagamentos) {
  if (!Array.isArray(pagamentos)) return 0;
  return pagamentos.reduce((acc, p) => acc + (Number(p?.valor) || 0), 0);
}

// Recupera config + valida que esta configurada. Lanca 412 se nao.
async function obterConfigInterna() {
  const cfg = await prisma.configuracaoEmpresa.findFirst({
    select: {
      id: true, mpAccessTokenEnc: true, mpDeviceId: true,
      mpUserIdMp: true, mpAtivo: true, mpWebhookSecret: true, tenantId: true,
    },
  });
  if (!cfg || !cfg.mpAtivo || !cfg.mpAccessTokenEnc || !cfg.mpDeviceId) {
    const e = new Error("Maquininha Mercado Pago nao configurada. Acesse Configuracoes > Maquininha.");
    e.status = 412;
    throw e;
  }
  let accessToken;
  try {
    accessToken = decifrar(cfg.mpAccessTokenEnc);
  } catch (err) {
    const e = new Error("Falha ao decifrar credencial MP. Refacar configuracao.");
    e.status = 500;
    e.cause = err;
    throw e;
  }
  return { cfg, accessToken };
}

// ============ CONFIG ============

// GET /pagamentos-mp/config
// Retorna estado da config (token sempre mascarado).
export async function obterConfig(req, res, next) {
  try {
    const cfg = await prisma.configuracaoEmpresa.findFirst({
      select: {
        mpDeviceId: true,
        mpUserIdMp: true,
        mpAtivo: true,
        mpAccessTokenEnc: true,
      },
    });
    res.json({
      configurada: !!(cfg && cfg.mpAccessTokenEnc && cfg.mpDeviceId),
      mpAtivo: !!cfg?.mpAtivo,
      mpDeviceId: cfg?.mpDeviceId || null,
      mpUserIdMp: cfg?.mpUserIdMp || null,
      mpAccessTokenMascarado: cfg?.mpAccessTokenEnc
        ? mascarar(safeDecifrarPrefixo(cfg.mpAccessTokenEnc))
        : null,
    });
  } catch (err) { next(err); }
}

// Helper para a UI: decifra so o "prefixo+sufixo" pra mascarar. Se falhar
// (chave errada, valor corrompido), retorna um placeholder, sem expor o erro.
function safeDecifrarPrefixo(blob) {
  try { return decifrar(blob); }
  catch { return "***"; }
}

// PUT /pagamentos-mp/config
// Body: { mpAccessToken?: string|null, mpDeviceId?: string|null,
//         mpUserIdMp?: string|null, mpAtivo?: boolean }
// - Passe mpAccessToken: "" para LIMPAR a credencial (desconfigurar).
// - Omita um campo para mante-lo inalterado.
export async function salvarConfig(req, res, next) {
  try {
    const data = {};

    if (req.body?.mpAccessToken !== undefined) {
      const t = req.body.mpAccessToken;
      if (t === null || t === "") {
        data.mpAccessTokenEnc = null;
        data.mpAtivo = false; // sem token nao tem como ativar
      } else if (typeof t === "string") {
        const limpo = t.trim();
        if (limpo.length < 20) {
          return res.status(400).json({ erro: "ACCESS_TOKEN parece invalido (esperado prefixo APP_USR-... ou TEST-...)" });
        }
        data.mpAccessTokenEnc = cifrar(limpo);
      }
    }

    if (req.body?.mpDeviceId !== undefined) {
      const d = req.body.mpDeviceId;
      data.mpDeviceId = d ? String(d).trim() : null;
    }
    if (req.body?.mpUserIdMp !== undefined) {
      const u = req.body.mpUserIdMp;
      data.mpUserIdMp = u ? String(u).trim() : null;
    }
    if (req.body?.mpAtivo !== undefined) {
      data.mpAtivo = !!req.body.mpAtivo;
    }

    const existente = await prisma.configuracaoEmpresa.findFirst();

    // mpWebhookSecret gerado na primeira vez que houver token configurado.
    // Reutilizado em todas as proximas writes (nao re-rotacionamos sem pedido
    // explicito — assinaturas antigas continuariam validas).
    if (data.mpAccessTokenEnc && (!existente?.mpWebhookSecret)) {
      data.mpWebhookSecret = crypto.randomBytes(24).toString("hex");
    }

    if (!existente) {
      // Sem ConfiguracaoEmpresa ainda — exige razaoSocial.
      return res.status(412).json({
        erro: "Cadastre os dados da empresa (Configuracoes) antes de configurar a maquininha.",
      });
    }

    const cfg = await prisma.configuracaoEmpresa.update({
      where: { id: existente.id },
      data,
    });

    res.json({
      configurada: !!(cfg.mpAccessTokenEnc && cfg.mpDeviceId),
      mpAtivo: cfg.mpAtivo,
      mpDeviceId: cfg.mpDeviceId,
      mpUserIdMp: cfg.mpUserIdMp,
      mpAccessTokenMascarado: cfg.mpAccessTokenEnc
        ? mascarar(safeDecifrarPrefixo(cfg.mpAccessTokenEnc))
        : null,
    });
  } catch (err) { next(err); }
}

// ============ COBRANCA ============

// POST /pagamentos-mp/cobrar
// Body: { tipo, vendaPayload }
//   vendaPayload tem o MESMO shape de POST /vendas (clienteId, itens[],
//   pagamentos[], desconto, observacoes, ...). A venda real so e criada
//   no webhook quando o MP confirmar APPROVED.
export async function cobrar(req, res, next) {
  try {
    const tipo = String(req.body?.tipo || "").toUpperCase().trim();
    if (!TIPOS_MP_VALIDOS.has(tipo)) {
      return res.status(400).json({ erro: "tipo deve ser CREDIT, DEBIT ou PIX" });
    }
    const payload = req.body?.vendaPayload;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ erro: "vendaPayload e obrigatorio" });
    }
    if (!Array.isArray(payload.itens) || payload.itens.length === 0) {
      return res.status(400).json({ erro: "vendaPayload.itens vazio" });
    }
    const totalReais = somarPagamentos(payload.pagamentos);
    if (!(totalReais > 0)) {
      return res.status(400).json({ erro: "Total da venda invalido" });
    }
    const amountCents = Math.round(totalReais * 100);

    // Sobrescreve pagamentos[] com 1 unico pagamento na forma correspondente
    // ao tipo escolhido na maquininha. Garante que a Venda criada apos
    // aprovacao tenha a forma certa (CARTAO_CREDITO/CARTAO_DEBITO/PIX) sem
    // depender do que o PDV chutou no payload. Split de pagamento nao e
    // suportado nesta v1 — a maquininha sempre cobra o total inteiro.
    const formaCanonica = TIPO_PARA_FORMA[tipo];
    payload.pagamentos = [{
      forma: formaCanonica,
      valor: Math.round(totalReais * 100) / 100,
    }];
    // Se o frontend mandou gerarContaReceber e a forma final NAO gera conta a
    // receber (DEBITO e PIX recebem na hora, so CREDITO/BOLETO/CREDIARIO geram
    // titulo), remove o bloco — o vendaController.criar so cria conta quando
    // formaPrincipal esta em FORMAS_GERA_RECEBER.
    if (payload.gerarContaReceber && formaCanonica !== "CARTAO_CREDITO") {
      delete payload.gerarContaReceber;
    }

    const { cfg, accessToken } = await obterConfigInterna();

    // Caixa atual (apenas para auditoria — nao bloqueia se nao houver,
    // mas em geral o vendaController.criar ja exige caixa aberto).
    let caixaIdAtual = null;
    try {
      const ca = await prisma.caixa.findFirst({
        where: { status: "ABERTO", userId: req.user.sub },
        select: { id: true },
      });
      caixaIdAtual = ca?.id || null;
    } catch { /* ignora */ }

    const intencao = await prisma.intencaoPagamentoMP.create({
      data: {
        status: "PENDING",
        tipo,
        valor: amountCents,
        deviceId: cfg.mpDeviceId,
        vendaPayloadJson: payload,
        userId: req.user.sub,
        caixaId: caixaIdAtual,
        // tenantId injetado automaticamente pelo extension.
      },
      select: { id: true, status: true, tipo: true, valor: true, createdAt: true },
    });

    let intentMp;
    try {
      intentMp = await criarPaymentIntent({
        accessToken,
        deviceId: cfg.mpDeviceId,
        amountCents,
        description: `Venda GestaoPRO #${intencao.id.slice(0, 8)}`,
        externalReference: intencao.id,
        tipo,
        idempotencyKey: intencao.id,
      });
    } catch (errMp) {
      const detalhe = errMp instanceof MercadoPagoError
        ? `[MP ${errMp.status}] ${errMp.message}`
        : `[MP] ${errMp.message}`;
      await prisma.intencaoPagamentoMP.update({
        where: { id: intencao.id },
        data: { status: "ERROR", detalhe },
      });
      return res.status(502).json({
        erro: "Falha ao enviar cobranca para a maquininha",
        detalhe,
        intencaoId: intencao.id,
      });
    }

    // Atualiza com o intent_id recebido pelo MP.
    const intentId = intentMp?.id || null;
    await prisma.intencaoPagamentoMP.update({
      where: { id: intencao.id },
      data: { intentId },
    });

    res.json({
      id: intencao.id,
      status: "PENDING",
      tipo: intencao.tipo,
      valor: intencao.valor,
      intentId,
      mensagem: "Cobranca enviada. Acompanhe o display da maquininha.",
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.message });
    next(err);
  }
}

// ============ STATUS / POLLING ============

// GET /pagamentos-mp/status/:id
// Retornado pelo PDV a cada 2s. Se ainda PENDING e ja se passaram >5s,
// tambem consulta o MP como fallback do webhook (cobre o caso de webhook
// nao chegar — comum em desenvolvimento sem ngrok).
export async function obterStatus(req, res, next) {
  try {
    const intencao = await prisma.intencaoPagamentoMP.findUnique({
      where: { id: req.params.id },
      include: { /* venda eh via FK opcional, leitura abaixo */ },
    });
    if (!intencao) return res.status(404).json({ erro: "Intencao nao encontrada" });

    let venda = null;
    if (intencao.vendaId) {
      venda = await prisma.venda.findUnique({
        where: { id: intencao.vendaId },
        select: { id: true, numero: true, total: true },
      });
    }

    // Fallback de polling: se ainda PENDING e tem intentId + ja se passaram
    // alguns segundos, consultamos o MP direto. Se finalizou la, processamos
    // como se o webhook tivesse chegado.
    const agora = Date.now();
    const idadeMs = agora - new Date(intencao.createdAt).getTime();
    if (intencao.status === "PENDING" && intencao.intentId && idadeMs > 4000) {
      try {
        const intent = await consultarStatusViaApi(intencao);
        if (intent && intent.processouAlgo) {
          // Recarrega depois do processamento
          const recarregada = await prisma.intencaoPagamentoMP.findUnique({
            where: { id: req.params.id },
          });
          if (recarregada) Object.assign(intencao, recarregada);
          if (recarregada?.vendaId) {
            venda = await prisma.venda.findUnique({
              where: { id: recarregada.vendaId },
              select: { id: true, numero: true, total: true },
            });
          }
        }
      } catch { /* fallback silencioso — proximo polling tenta de novo */ }
    }

    res.json({
      id: intencao.id,
      status: intencao.status,
      tipo: intencao.tipo,
      valor: intencao.valor,
      intentId: intencao.intentId,
      detalhe: intencao.detalhe,
      vendaId: intencao.vendaId,
      vendaNumero: venda?.numero || null,
    });
  } catch (err) { next(err); }
}

// Consulta o MP pelo intent + processa o pagamento se ja existe.
// Retorna { processouAlgo } para o caller saber se vale a pena recarregar.
async function consultarStatusViaApi(intencao) {
  const { cfg, accessToken } = await obterConfigInterna();
  // GET intent — quando a intent ja terminou, ela vira um payment.
  let intent;
  try {
    intent = await obterPaymentIntent({ accessToken, intentId: intencao.intentId });
  } catch {
    return { processouAlgo: false };
  }

  // O Point retorna `state` (OPEN | ON_TERMINAL | PROCESSING | FINISHED | CANCELED).
  // Quando FINISHED, vem `payment.id` populado.
  const state = intent?.state || intent?.status;
  const paymentId = intent?.payment?.id || intent?.payment_id;

  if (state === "CANCELED") {
    await marcarFinal(intencao.id, "CANCELED", "Cancelada no device", intent);
    return { processouAlgo: true };
  }
  if (paymentId) {
    // Garante que o handler nao roda em paralelo varias vezes — usa
    // tenantStorage para que criarVenda e demais leituras filtrem corretamente.
    await processarPaymentNotificacao({
      tenantId: cfg.tenantId,
      paymentId,
      accessToken,
    });
    return { processouAlgo: true };
  }
  return { processouAlgo: false };
}

// ============ CANCELAR ============

// POST /pagamentos-mp/status/:id/cancelar
// Cancela a intent no device (o MP envia comando de aborto). So funciona se
// o operador ainda nao concluiu na maquininha.
export async function cancelar(req, res, next) {
  try {
    const intencao = await prisma.intencaoPagamentoMP.findUnique({
      where: { id: req.params.id },
    });
    if (!intencao) return res.status(404).json({ erro: "Intencao nao encontrada" });
    if (intencao.status !== "PENDING") {
      return res.status(409).json({ erro: `Intencao ja esta em status ${intencao.status}` });
    }

    const { cfg, accessToken } = await obterConfigInterna();

    if (intencao.intentId) {
      try {
        await cancelarPaymentIntent({
          accessToken,
          deviceId: cfg.mpDeviceId,
          intentId: intencao.intentId,
        });
      } catch (err) {
        // Mesmo se MP recusar cancel (ex: ja finalizou), prosseguimos
        // marcando como CANCELED localmente — o webhook eventual vai
        // corrigir o status se aprovar de fato.
        if (err instanceof MercadoPagoError && err.status === 409) {
          // Conflict: ja finalizou. Devolve 409 pro front consultar status.
          return res.status(409).json({
            erro: "Intencao ja finalizou no Mercado Pago. Aguarde o status final.",
          });
        }
      }
    }

    const atualizada = await prisma.intencaoPagamentoMP.update({
      where: { id: intencao.id },
      data: {
        status: "CANCELED",
        detalhe: "Cancelada pelo operador",
      },
    });

    res.json({
      id: atualizada.id,
      status: atualizada.status,
      detalhe: atualizada.detalhe,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.message });
    next(err);
  }
}

// ============ WEBHOOK (ROTA PUBLICA) ============

// POST /pagamentos-mp/webhook
// MP envia: { id, action, type, data: { id }, ... } — type=payment para os
// pagamentos do device. Resolvemos o payment, achamos external_reference,
// e processamos.
//
// Notas:
//   - Esta rota NAO usa authRequired. A autenticidade e validada por:
//       (a) o paymentId vir de um payment cujo external_reference aponta
//           para uma intencao real do nosso banco
//       (b) (futuro) header x-signature HMAC com mpWebhookSecret
//   - Retorna 200 RAPIDO mesmo quando o processing e async. MP re-tenta em
//     caso de timeout — manter idempotencia no handler.
export async function webhook(req, res, next) {
  try {
    // Aceita formatos comuns: ?type=payment&id=123 ou body { data: { id } }
    const tipo = req.query.type || req.query.topic || req.body?.type || req.body?.topic;
    const paymentId =
      req.body?.data?.id ||
      req.body?.resource?.id ||
      req.query["data.id"] ||
      req.query.id;

    if (!paymentId || (tipo && String(tipo).toLowerCase() !== "payment")) {
      // Topicos diferentes (merchant_order, point_integration_wh, etc.)
      // tambem chegam aqui — ignoramos com 200 pra evitar retries.
      return res.json({ ignored: true });
    }

    // Resolve a intencao SEM filtro de tenant — webhook nao tem JWT.
    // Buscamos o paymentId via API do MP usando o accessToken do tenant
    // DONO da intencao. Para descobrir o tenant, primeiro tentamos casar
    // pelo external_reference depois de uma busca exploratoria: testamos
    // cada config ativa ate encontrar o payment que corresponde.
    //
    // Para evitar varredura, exigimos que o body tambem traga o user_id
    // do MP (algumas notificacoes incluem) — quando vier, casamos contra
    // mpUserIdMp. Senao, fallback varredura curta (poucos tenants).

    const userIdHint =
      req.body?.user_id || req.body?.data?.user_id || req.query.user_id;

    const candidatos = await prismaRaw.configuracaoEmpresa.findMany({
      where: {
        mpAtivo: true,
        mpAccessTokenEnc: { not: null },
        ...(userIdHint ? { mpUserIdMp: String(userIdHint) } : {}),
      },
      select: { tenantId: true, mpAccessTokenEnc: true },
    });

    let processado = false;
    for (const candidato of candidatos) {
      let accessToken;
      try { accessToken = decifrar(candidato.mpAccessTokenEnc); }
      catch { continue; }
      try {
        await processarPaymentNotificacao({
          tenantId: candidato.tenantId,
          paymentId,
          accessToken,
        });
        processado = true;
        break;
      } catch (err) {
        // Pode ser que o payment nao pertence a esse tenant; tenta proximo.
        if (err.status === 404 || err.status === 401) continue;
        throw err;
      }
    }

    // Sempre 200 pro MP nao retentar em loop — eventual falha real ja foi
    // logada no detalhe da intencao.
    res.json({ processado });
  } catch (err) { next(err); }
}

// Processa uma notificacao de payment do MP. Idempotente: se a intencao
// ja esta em status final, nao faz nada. Atualiza status, e quando approved
// chama vendaController.criar com o payload guardado.
async function processarPaymentNotificacao({ tenantId, paymentId, accessToken }) {
  const payment = await obterPayment({ accessToken, paymentId });
  const externalReference = payment?.external_reference;
  if (!externalReference) {
    const e = new Error("Payment sem external_reference");
    e.status = 404;
    throw e;
  }

  // Resolve a intencao usando o tenantId conhecido (cross-tenant via raw).
  const intencao = await prismaRaw.intencaoPagamentoMP.findFirst({
    where: { id: externalReference, tenantId },
  });
  if (!intencao) {
    const e = new Error("Intencao nao encontrada para esse tenant");
    e.status = 404;
    throw e;
  }
  if (intencao.status !== "PENDING") {
    // Ja processado — webhook duplicado, idempotente.
    return;
  }

  const status = String(payment?.status || "").toLowerCase();
  if (status === "approved") {
    await aprovarIntencao({
      intencao,
      tenantId,
      paymentRaw: payment,
    });
  } else if (status === "rejected" || status === "cancelled" || status === "canceled") {
    await prismaRaw.intencaoPagamentoMP.update({
      where: { id: intencao.id },
      data: {
        status: status === "rejected" ? "REJECTED" : "CANCELED",
        detalhe: payment?.status_detail || `Pagamento ${status}`,
        rawWebhook: payment,
      },
    });
  }
  // Status intermediarios (pending, in_process, in_mediation): mantem PENDING,
  // proximo polling ou webhook resolve.
}

async function aprovarIntencao({ intencao, tenantId, paymentRaw }) {
  // Garante que rodamos a criacao de venda DENTRO do tenantStorage para o
  // Prisma extension filtrar/inserir com o tenantId correto.
  let vendaCriada;
  try {
    vendaCriada = await new Promise((resolve, reject) => {
      let respondeu = false;
      const fakeReq = {
        body: intencao.vendaPayloadJson,
        user: {
          sub: intencao.userId,
          role: "ADMIN", // o controller faz check de role so em alguns lugares;
                         // como veio de uma cobranca ja autorizada, elevamos para
                         // nao bloquear filtros internos. Auditoria fica no
                         // userId real.
          tid: tenantId,
        },
        tenantId,
        query: {},
      };
      const fakeRes = {
        _status: 200,
        status(code) { this._status = code; return this; },
        json(data) {
          if (respondeu) return;
          respondeu = true;
          if (this._status >= 400) {
            reject(Object.assign(new Error(data?.erro || "Erro ao criar venda"), {
              status: this._status, body: data,
            }));
          } else {
            resolve(data);
          }
        },
      };
      const fakeNext = (err) => {
        if (respondeu) return;
        respondeu = true;
        reject(err || new Error("Erro desconhecido em criarVenda"));
      };

      tenantStorage.run({ tenantId }, () => {
        Promise.resolve(criarVendaController(fakeReq, fakeRes, fakeNext))
          .catch((e) => { if (!respondeu) { respondeu = true; reject(e); } });
      });
    });
  } catch (err) {
    // Aprovacao do MP mas falha ao criar a Venda local (ex: estoque
    // insuficiente, conta a receber invalida). Marca a intencao com ERROR
    // pra o operador notar e tratar manualmente. O dinheiro foi cobrado!
    await prismaRaw.intencaoPagamentoMP.update({
      where: { id: intencao.id },
      data: {
        status: "ERROR",
        detalhe: `APROVADO no MP mas falha ao criar Venda: ${err.message}`,
        rawWebhook: paymentRaw,
      },
    });
    return;
  }

  await prismaRaw.intencaoPagamentoMP.update({
    where: { id: intencao.id },
    data: {
      status: "APPROVED",
      detalhe: "Pagamento aprovado",
      vendaId: vendaCriada?.id || null,
      rawWebhook: paymentRaw,
    },
  });
}

// Helper interno usado pelo polling.
async function marcarFinal(id, status, detalhe, rawWebhook) {
  await prismaRaw.intencaoPagamentoMP.update({
    where: { id },
    data: { status, detalhe, rawWebhook },
  });
}
