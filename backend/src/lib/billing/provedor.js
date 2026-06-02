// ============ CAMADA DE PROVEDOR DE COBRANCA (GATEWAY DE PAGAMENTO) ============
//
// Abstrai o gateway que cobra a ASSINATURA do SaaS (Asaas / mock) atras de
// uma interface unica. O billingController fala SO com esta interface — nunca
// com a API de um gateway especifico. Trocar de gateway = adicionar um adapter
// aqui, sem tocar no controller. Mesmo padrao da camada fiscal (lib/fiscal).
//
// IMPORTANTE: este gateway cobra a PLATAFORMA -> EMPRESA-cliente (mensalidade
// do sistema). NAO confundir com lib/mercadoPago.js, que e o gateway das
// VENDAS do lojista (maquininha Point). Sao dois fluxos de dinheiro distintos.
//
// As credenciais do gateway sao da PLATAFORMA (env vars) — uma conta nossa
// cobra todos os tenants. O vinculo de cada tenant e o customer/subscription
// id retornado na criacao da assinatura (salvo em Empresa.gateway*).
//
// Contrato normalizado (o que todo adapter implementa):
//
//   criarAssinatura({ empresa, plano, valorMensal, ciclo, emailCobranca })
//     -> { provedor, clienteId, assinaturaId, status, linkPagamento,
//          proximaCobrancaEm }
//
//   cancelarAssinatura({ assinaturaId })            -> { ok }
//
//   interpretarWebhook({ headers, body })
//     -> null  (evento que nao nos interessa / invalido)
//     -> { evento, assinaturaId, cobrancaId, valor, status, pagoEm,
//          vencimento, metodo, linkPagamento }
//        status: um valor do enum StatusCobranca (PAGA/VENCIDA/...).
//
//   verificarAssinaturaWebhook({ headers, body }) -> boolean
//     (valida o segredo/assinatura do webhook ANTES de processar)

import * as mock from "./mock.js";
import * as asaas from "./asaas.js";

export class ErroCobranca extends Error {
  constructor(message, { status = null, detalhe = null } = {}) {
    super(message);
    this.name = "ErroCobranca";
    this.httpStatus = status; // status HTTP do gateway, p/ diagnostico
    this.detalhe = detalhe;   // corpo cru do erro (logs), nunca exposto ao cliente
  }
}

const ADAPTERS = {
  mock,  // simulador (dev/demo) — ativa na hora, sem gateway real
  asaas, // gateway real (PIX/boleto/cartao recorrente)
};

// Provedor ativo da plataforma. Default "mock" para o sistema rodar/demonstrar
// sem credencial. Em producao, defina BILLING_PROVEDOR=asaas + ASAAS_API_KEY.
export function provedorAtivo() {
  return String(process.env.BILLING_PROVEDOR || "mock").toLowerCase();
}

// A cobranca self-service (cliente clicando "Assinar") so e liberada quando ha
// um provedor REAL configurado. Com o mock a assinatura ativaria de graca na
// hora — perigoso em producao. Para testar o fluxo mock em dev/homolog, defina
// BILLING_PERMITIR_MOCK=true explicitamente.
export function cobrancaHabilitada() {
  if (provedorAtivo() !== "mock") return true;
  return process.env.BILLING_PERMITIR_MOCK === "true";
}

export function getProvedor(nome = provedorAtivo()) {
  const adapter = ADAPTERS[String(nome).toLowerCase()];
  if (!adapter) {
    throw new ErroCobranca(`Provedor de cobranca "${nome}" nao suportado.`);
  }
  return adapter;
}
