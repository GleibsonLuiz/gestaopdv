// ============ ADAPTER: SIMULADOR DE COBRANCA (mock) ============
//
// Gateway FICTICIO para desenvolvimento/demonstracao SEM conta em gateway real
// e SEM cobranca de verdade. "Aprova" a assinatura na hora: a primeira cobranca
// ja volta PAGA, o controller ativa a empresa e empurra expiraEm +30d. NAO
// movimenta dinheiro. Implementa o mesmo contrato de provedor.js.
//
// Use com BILLING_PROVEDOR=mock (default). Para cobranca real, configure
// BILLING_PROVEDOR=asaas + ASAAS_API_KEY.

import crypto from "node:crypto";

const CICLO_DIAS = 30;

function maisDias(dias) {
  return new Date(Date.now() + dias * 86400000);
}

// Cria uma "assinatura" instantaneamente aprovada. Gera ids plausiveis para
// que o resto do fluxo (salvar gateway ids, historico de cobranca) funcione
// igual ao gateway real.
export async function criarAssinatura({ empresa, plano, valorMensal }) {
  const clienteId = `mock_cus_${crypto.randomBytes(6).toString("hex")}`;
  const assinaturaId = `mock_sub_${crypto.randomBytes(6).toString("hex")}`;
  const cobrancaId = `mock_pay_${crypto.randomBytes(6).toString("hex")}`;
  const agora = new Date();

  return {
    provedor: "mock",
    clienteId,
    assinaturaId,
    proximaCobrancaEm: maisDias(CICLO_DIAS),
    // No mock a primeira cobranca ja nasce PAGA (ativacao imediata).
    primeiraCobranca: {
      gatewayCobrancaId: cobrancaId,
      status: "PAGA",
      valor: Number(valorMensal),
      vencimento: agora,
      pagoEm: agora,
      metodo: "PIX",
      linkPagamento: null,
      descricao: `Assinatura ${plano} — ${empresa?.nome || ""} (simulado)`.trim(),
    },
  };
}

export async function cancelarAssinatura(/* { assinaturaId } */) {
  // Nada a chamar — assinatura simulada nao existe no gateway.
  return { ok: true };
}

// O mock nao recebe webhooks reais. Mantemos as funcoes para o contrato ficar
// completo: sempre valido (sem segredo) e sem evento a interpretar.
export function verificarAssinaturaWebhook() {
  return true;
}

export function interpretarWebhook() {
  return null;
}
