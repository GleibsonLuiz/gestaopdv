import prisma, { prismaRaw } from "../lib/prisma.js";
import { registrarEvento } from "../middlewares/auditoria.js";
import { compararSegredo } from "../lib/timingSafe.js";
import {
  PRECOS_PLANO, catalogoPublico, ehPlanoAssinavel, valorDoPlano, DIAS_CARENCIA,
} from "../lib/billing/precos.js";
import { getProvedor, provedorAtivo, cobrancaHabilitada } from "../lib/billing/provedor.js";

// ============ MODULO ASSINATURA (billing do SaaS) ============
//
// A plataforma cobra a EMPRESA-cliente uma mensalidade recorrente via gateway
// (Asaas em producao, mock em dev). A "verdade" do acesso e Empresa.expiraEm
// (login bloqueia quando vence — ja existia). Aqui adicionamos o motor que
// EMPURRA esse expiraEm automaticamente quando o pagamento confirma, sem o
// super-admin renovar na mao.
//
// Fluxo:
//   cliente escolhe plano  -> POST /billing/assinar  -> cria assinatura no
//     gateway, salva ids, grava 1a cobranca. Mock ativa na hora; Asaas devolve
//     link e ativa no webhook.
//   gateway confirma pagto  -> POST /webhooks/billing -> expiraEm += 30d, ATIVA
//   gateway avisa atraso    -> POST /webhooks/billing -> INADIMPLENTE
//   rede de seguranca       -> GET /cron/assinaturas  -> marca vencidos e
//     suspende quem passou da carencia (caso um webhook se perca)

const CICLO_DIAS = 30;

function maisDias(base, dias) {
  return new Date(base.getTime() + dias * 86400000);
}

// Empurra a validade do acesso. Se ainda esta no futuro, soma a partir dela
// (nao "perde" dias pagos); se ja venceu, soma a partir de agora.
function proximaValidade(expiraEmAtual) {
  const agora = new Date();
  const base = expiraEmAtual && new Date(expiraEmAtual) > agora ? new Date(expiraEmAtual) : agora;
  return maisDias(base, CICLO_DIAS);
}

function serializarCobranca(c) {
  return {
    id: c.id,
    valor: Number(c.valor),
    status: c.status,
    vencimento: c.vencimento,
    pagoEm: c.pagoEm,
    metodo: c.metodo,
    linkPagamento: c.linkPagamento,
    descricao: c.descricao,
    criadaEm: c.createdAt,
  };
}

// GET /billing/planos — catalogo de planos assinaveis + estado atual da empresa.
export async function listarPlanos(req, res, next) {
  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: req.tenantId },
      select: { plano: true, statusAssinatura: true, valorMensal: true },
    });
    res.json({
      planos: catalogoPublico(),
      // Cobranca online liberada? (false = provedor mock sem override → o front
      // desabilita o botao "Assinar" e mostra "fale com o suporte").
      cobrancaHabilitada: cobrancaHabilitada(),
      atual: empresa ? {
        plano: empresa.plano,
        statusAssinatura: empresa.statusAssinatura,
        valorMensal: empresa.valorMensal != null ? Number(empresa.valorMensal) : null,
      } : null,
    });
  } catch (err) {
    next(err);
  }
}

// GET /billing/assinatura — estado da assinatura da empresa logada + historico.
export async function minhaAssinatura(req, res, next) {
  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: req.tenantId },
      select: {
        plano: true, expiraEm: true, statusAssinatura: true,
        gatewayProvedor: true, valorMensal: true,
        ultimoPagamentoEm: true, proximaCobrancaEm: true,
      },
    });
    if (!empresa) return res.status(404).json({ erro: "Empresa nao encontrada" });

    // CobrancaAssinatura esta em MODELOS_COM_TENANT — filtra pelo tenant logado.
    const cobrancas = await prisma.cobrancaAssinatura.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
    });

    // Cobranca em aberto (pendente) com link — o front mostra "pagar agora".
    const pendente = cobrancas.find(c => c.status === "PENDENTE" && c.linkPagamento) || null;

    res.json({
      plano: empresa.plano,
      expiraEm: empresa.expiraEm,
      statusAssinatura: empresa.statusAssinatura,
      provedor: empresa.gatewayProvedor,
      valorMensal: empresa.valorMensal != null ? Number(empresa.valorMensal) : null,
      ultimoPagamentoEm: empresa.ultimoPagamentoEm,
      proximaCobrancaEm: empresa.proximaCobrancaEm,
      cobrancaPendente: pendente ? serializarCobranca(pendente) : null,
      historico: cobrancas.map(serializarCobranca),
    });
  } catch (err) {
    next(err);
  }
}

// POST /billing/assinar — cliente escolhe um plano pago e inicia a assinatura.
// Apenas ADMIN. Cria a assinatura no gateway, salva o vinculo e a 1a cobranca.
export async function assinarPlano(req, res, next) {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ erro: "Apenas administradores podem contratar planos" });
    }
    const plano = String(req.body?.plano || "").toUpperCase();
    if (!PRECOS_PLANO[plano]) {
      return res.status(400).json({ erro: "Plano invalido" });
    }
    if (!ehPlanoAssinavel(plano)) {
      return res.status(400).json({
        erro: `O plano ${plano} nao e auto-contratavel. Fale com o suporte.`,
      });
    }
    // Guarda critica: sem provedor real configurado, NAO permite auto-contratar
    // (o mock ativaria de graca). Protege producao mesmo se o front escapar.
    if (!cobrancaHabilitada()) {
      return res.status(503).json({
        erro: "Pagamento online ainda nao habilitado. Fale com o suporte para contratar.",
        cobrancaHabilitada: false,
      });
    }
    const valorMensal = valorDoPlano(plano);

    const empresa = await prisma.empresa.findUnique({ where: { id: req.tenantId } });
    if (!empresa) return res.status(404).json({ erro: "Empresa nao encontrada" });

    // Email de cobranca = email do admin que esta contratando.
    const usuario = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { email: true },
    });

    const provedor = getProvedor();
    const resultado = await provedor.criarAssinatura({
      empresa,
      plano,
      valorMensal,
      emailCobranca: usuario?.email || null,
    });

    const cobranca = resultado.primeiraCobranca;
    const pago = cobranca?.status === "PAGA";

    // Atualiza o vinculo + plano. Se a 1a cobranca ja foi paga (mock), ativa e
    // empurra expiraEm. Se PENDENTE (asaas), mantem o acesso atual — a ativacao
    // vem pelo webhook quando o cliente pagar.
    const dataEmpresa = {
      plano,
      valorMensal,
      gatewayProvedor: resultado.provedor,
      gatewayClienteId: resultado.clienteId,
      gatewayAssinaturaId: resultado.assinaturaId,
      proximaCobrancaEm: resultado.proximaCobrancaEm || null,
    };
    if (pago) {
      dataEmpresa.statusAssinatura = "ATIVA";
      dataEmpresa.ativo = true;
      dataEmpresa.ultimoPagamentoEm = cobranca.pagoEm || new Date();
      dataEmpresa.expiraEm = proximaValidade(empresa.expiraEm);
    }

    await prisma.empresa.update({ where: { id: req.tenantId }, data: dataEmpresa });

    // Grava a 1a cobranca no historico (se o gateway gerou uma).
    if (cobranca) {
      await prisma.cobrancaAssinatura.create({
        data: {
          gatewayCobrancaId: cobranca.gatewayCobrancaId || null,
          valor: cobranca.valor,
          status: cobranca.status,
          vencimento: cobranca.vencimento || null,
          pagoEm: cobranca.pagoEm || null,
          metodo: cobranca.metodo || null,
          linkPagamento: cobranca.linkPagamento || null,
          descricao: cobranca.descricao || `Assinatura ${plano}`,
        },
      });
    }

    registrarEvento({
      acao: "ASSINATURA_CRIADA", modulo: "BILLING", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome,
      tenantId: req.tenantId,
      mensagem: `Assinatura do plano ${plano} criada (${resultado.provedor})${pago ? " — paga/ativada" : " — aguardando pagamento"}`,
      req,
    });

    res.status(201).json({
      ok: true,
      plano,
      valorMensal,
      statusAssinatura: pago ? "ATIVA" : empresa.statusAssinatura,
      ativada: pago,
      linkPagamento: cobranca?.linkPagamento || null,
      proximaCobrancaEm: resultado.proximaCobrancaEm || null,
    });
  } catch (err) {
    // Erros do gateway viram 502 (problema externo), nao 500 generico.
    if (err.name === "ErroCobranca") {
      console.error("Erro no gateway de cobranca:", err.message, err.detalhe || "");
      return res.status(502).json({ erro: `Falha no gateway de pagamento: ${err.message}` });
    }
    next(err);
  }
}

// POST /webhooks/billing — endpoint PUBLICO chamado pelo gateway. Valida o
// segredo do webhook, interpreta o evento e atualiza a assinatura. Roda
// cross-tenant (prismaRaw) pois nao ha tenant logado.
export async function webhook(req, res) {
  try {
    const provedor = getProvedor();

    if (!provedor.verificarAssinaturaWebhook({ headers: req.headers, body: req.body })) {
      return res.status(401).json({ erro: "Assinatura de webhook invalida" });
    }

    const evt = provedor.interpretarWebhook({ headers: req.headers, body: req.body });
    if (!evt || !evt.assinaturaId) {
      // Evento que nao nos interessa — responde 200 para o gateway nao reenviar.
      return res.json({ ignorado: true });
    }

    const empresa = await prismaRaw.empresa.findFirst({
      where: { gatewayAssinaturaId: evt.assinaturaId },
    });
    if (!empresa) {
      // Assinatura desconhecida — 200 para nao gerar retries infinitos.
      return res.json({ ignorado: true, motivo: "assinatura nao vinculada" });
    }

    // Idempotencia: se ja registramos esta cobranca com o mesmo status, nao
    // re-processa (webhooks podem chegar em duplicidade).
    let cobrancaExistente = null;
    if (evt.cobrancaId) {
      cobrancaExistente = await prismaRaw.cobrancaAssinatura.findUnique({
        where: { gatewayCobrancaId: evt.cobrancaId },
      });
    }
    const jaProcessadaComMesmoStatus = cobrancaExistente && cobrancaExistente.status === evt.status;

    // Upsert da cobranca no historico.
    const dadosCobranca = {
      valor: evt.valor != null ? evt.valor : (cobrancaExistente ? Number(cobrancaExistente.valor) : Number(empresa.valorMensal || 0)),
      status: evt.status,
      vencimento: evt.vencimento || cobrancaExistente?.vencimento || null,
      pagoEm: evt.pagoEm || cobrancaExistente?.pagoEm || null,
      metodo: evt.metodo || cobrancaExistente?.metodo || null,
      linkPagamento: evt.linkPagamento || cobrancaExistente?.linkPagamento || null,
    };
    if (cobrancaExistente) {
      await prismaRaw.cobrancaAssinatura.update({
        where: { id: cobrancaExistente.id },
        data: dadosCobranca,
      });
    } else if (evt.cobrancaId) {
      await prismaRaw.cobrancaAssinatura.create({
        data: {
          ...dadosCobranca,
          gatewayCobrancaId: evt.cobrancaId,
          descricao: `Assinatura ${empresa.plano}`,
          tenantId: empresa.id,
        },
      });
    }

    // Atualiza a empresa conforme o status — pulando se ja processado igual.
    if (!jaProcessadaComMesmoStatus) {
      const dataEmpresa = {};
      if (evt.status === "PAGA") {
        dataEmpresa.statusAssinatura = "ATIVA";
        dataEmpresa.ativo = true;
        dataEmpresa.ultimoPagamentoEm = evt.pagoEm || new Date();
        dataEmpresa.expiraEm = proximaValidade(empresa.expiraEm);
        dataEmpresa.proximaCobrancaEm = maisDias(new Date(), CICLO_DIAS);
      } else if (evt.status === "VENCIDA") {
        dataEmpresa.statusAssinatura = "INADIMPLENTE";
      } else if (evt.status === "CANCELADA") {
        dataEmpresa.statusAssinatura = "CANCELADA";
      }
      if (Object.keys(dataEmpresa).length > 0) {
        await prismaRaw.empresa.update({ where: { id: empresa.id }, data: dataEmpresa });
      }
    }

    registrarEvento({
      acao: "WEBHOOK_COBRANCA", modulo: "BILLING", sucesso: true,
      tenantId: empresa.id,
      mensagem: `Webhook ${evt.evento}: cobranca ${evt.status} (assinatura ${evt.assinaturaId})`,
      req,
    });

    res.json({ ok: true });
  } catch (err) {
    // Loga mas responde 200: erro nosso nao deve fazer o gateway reenviar para
    // sempre. A rede de seguranca (cron) reconcilia o que escapar.
    console.error("Erro ao processar webhook de cobranca:", err);
    res.json({ ok: false });
  }
}

// GET/POST /cron/assinaturas — rede de seguranca diaria. Autentica via
// Bearer ${CRON_SECRET}. Marca como INADIMPLENTE quem venceu e suspende quem
// passou da carencia. Cobre webhooks perdidos. Idempotente.
export async function cronReconciliarAssinaturas(req, res, next) {
  try {
    const chave = process.env.CRON_SECRET;
    if (!chave) return res.status(503).json({ erro: "CRON_SECRET nao configurado no servidor" });
    const header = req.headers.authorization || "";
    const recebido = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!compararSegredo(recebido, chave)) {
      return res.status(401).json({ erro: "Chave de cron invalida" });
    }

    const agora = new Date();
    const limiteCarencia = maisDias(agora, -DIAS_CARENCIA);

    // 1. ATIVAS que venceram -> INADIMPLENTE (cliente perdeu o pagamento).
    const inadimplentes = await prismaRaw.empresa.updateMany({
      where: {
        statusAssinatura: "ATIVA",
        expiraEm: { lt: agora },
      },
      data: { statusAssinatura: "INADIMPLENTE" },
    });

    // 2. INADIMPLENTES alem da carencia -> suspende o acesso (ativo=false).
    //    O login ja bloqueia por expiraEm; isto deixa o motivo explicito e
    //    aparece como suspensa no admin-master.
    const suspensas = await prismaRaw.empresa.updateMany({
      where: {
        statusAssinatura: "INADIMPLENTE",
        ativo: true,
        expiraEm: { lt: limiteCarencia },
      },
      data: {
        ativo: false,
        motivoSuspensao: "Assinatura em atraso. Regularize o pagamento para reativar.",
        suspensaEm: agora,
      },
    });

    res.json({
      ok: true,
      marcadasInadimplentes: inadimplentes.count,
      suspensasPorCarencia: suspensas.count,
      executadoEm: agora.toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
