// ============ CATALOGO DE PLANOS / PRECOS (SaaS) ============
//
// Fonte de verdade do PRECO de cada plano no backend — usado para criar a
// assinatura no gateway (valor cobrado) e para a tela "Minha Assinatura".
// O frontend (AdminMasterApp) tem um PRECO_PLANO_MES de DISPLAY; este aqui
// e o que vale na cobranca real. Mantenha os dois alinhados.
//
// Os LIMITES de cada plano continuam em lib/planoLimites.js (LIMITES_PLANO) —
// aqui cuidamos so de preco/rotulo/o que e cobravel.

// Planos que geram cobranca recorrente (assinaveis pelo proprio cliente).
// TRIAL e FREE nao entram: TRIAL e o periodo gratis inicial; FREE e um
// rebaixamento sem cobranca. ENTERPRISE e "sob consulta" (negociado pelo
// super-admin), entao nao fica auto-assinavel pelo cliente.
export const PRECOS_PLANO = {
  STARTER: {
    valorMensal: 49.9,
    rotulo: "Starter",
    descricao: "PDV, estoque e cadastros para comecar a vender.",
    assinavel: true,
  },
  PRO: {
    valorMensal: 149.9,
    rotulo: "Pro",
    descricao: "Tudo do Starter + NFC-e, CRM, relatorios e vendas ilimitadas.",
    assinavel: true,
  },
  ENTERPRISE: {
    valorMensal: 499.9,
    rotulo: "Enterprise",
    descricao: "Multi-loja e suporte prioritario. Sob consulta.",
    assinavel: false, // negociado com o suporte/super-admin
  },
};

// Planos gratuitos (sem cobranca). Uteis para validacao em varios pontos.
export const PLANOS_GRATUITOS = new Set(["TRIAL", "FREE"]);

// Dias de carencia apos o vencimento antes de suspender o acesso. Durante a
// carencia a empresa fica INADIMPLENTE mas ainda loga (banner de aviso).
export const DIAS_CARENCIA = 5;

// Periodo do trial inicial (informativo; o expiraEm e setado no signup/admin).
export const DIAS_TRIAL = 14;

export function ehPlanoAssinavel(plano) {
  const p = PRECOS_PLANO[String(plano || "").toUpperCase()];
  return Boolean(p && p.assinavel);
}

export function valorDoPlano(plano) {
  const p = PRECOS_PLANO[String(plano || "").toUpperCase()];
  return p ? p.valorMensal : null;
}

// Reverse-lookup: plano cujo valorMensal bate com o valor informado. Usado pelo
// webhook para promover o plano (entitlement) SO quando o pagamento confirma —
// nunca antes. Retorna null se nenhum plano bater (ex: valor negociado pelo
// super-admin); nesse caso o webhook mantem o plano atual. Depende de os precos
// em PRECOS_PLANO serem UNICOS — mantenha assim.
export function planoPorValor(valorMensal) {
  if (valorMensal == null) return null;
  const v = Number(valorMensal);
  if (!Number.isFinite(v)) return null;
  for (const [plano, info] of Object.entries(PRECOS_PLANO)) {
    if (Math.abs(Number(info.valorMensal) - v) < 0.005) return plano;
  }
  return null;
}

// Catalogo pronto para o frontend montar a tela de escolha de plano.
export function catalogoPublico() {
  return Object.entries(PRECOS_PLANO).map(([plano, info]) => ({
    plano,
    valorMensal: info.valorMensal,
    rotulo: info.rotulo,
    descricao: info.descricao,
    assinavel: info.assinavel,
  }));
}
