import prisma from "../lib/prisma.js";
import bcrypt from "bcryptjs";

const FORMAS_VALIDAS = new Set([
  "DINHEIRO", "CARTAO_CREDITO", "CARTAO_DEBITO", "PIX", "BOLETO", "CREDIARIO",
]);

// Operacoes sensiveis (sangria, fechamento) feitas por VENDEDOR exigem
// senha de um ADMIN/GERENTE ativo. ADMIN/GERENTE passam direto.
async function exigirAutorizacaoGerencial(req) {
  if (req.user.role !== "VENDEDOR") return; // ADMIN/GERENTE passam
  const { senhaAutorizacao, emailAutorizacao } = req.body || {};
  if (!senhaAutorizacao || !emailAutorizacao) {
    const e = new Error("Esta operacao requer autorizacao de um gerente ou administrador");
    e.status = 403;
    throw e;
  }
  const aut = await prisma.user.findUnique({ where: { email: emailAutorizacao } });
  if (!aut || !aut.ativo || (aut.role !== "ADMIN" && aut.role !== "GERENTE")) {
    const e = new Error("Usuario autorizador invalido (precisa ser ADMIN ou GERENTE ativo)");
    e.status = 403;
    throw e;
  }
  const ok = await bcrypt.compare(senhaAutorizacao, aut.senha);
  if (!ok) {
    const e = new Error("Senha do autorizador incorreta");
    e.status = 403;
    throw e;
  }
}

function toNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function toDecimal(v) {
  // Prisma Decimal aceita number ou string — devolvemos number arredondado a 2.
  return Math.round(Number(v) * 100) / 100;
}

const INCLUDE_RESUMO = {
  user: { select: { id: true, nome: true } },
  _count: { select: { vendas: true, movimentacoes: true } },
};

// ============ CAIXA ATUAL DO USUARIO LOGADO ============

export async function obterAtual(req, res, next) {
  try {
    const caixa = await prisma.caixa.findFirst({
      where: { userId: req.user.sub, status: "ABERTO" },
      include: INCLUDE_RESUMO,
    });
    if (!caixa) return res.json({ caixa: null });

    const totais = await calcularTotaisCaixa(caixa.id, Number(caixa.saldoInicial));
    res.json({ caixa: { ...caixa, totais } });
  } catch (err) {
    next(err);
  }
}

// ============ SUGESTAO DE TROCO ============
// Retorna o ultimo trocoProximoDia do user (ou 0 se nunca fechou um caixa).

export async function sugerirTroco(req, res, next) {
  try {
    const ultimo = await prisma.caixa.findFirst({
      where: { userId: req.user.sub, status: "FECHADO", trocoProximoDia: { not: null } },
      orderBy: { fechadoEm: "desc" },
      select: { trocoProximoDia: true, fechadoEm: true, numero: true },
    });
    res.json({
      sugestao: ultimo ? Number(ultimo.trocoProximoDia) : 0,
      origem: ultimo
        ? { caixaNumero: ultimo.numero, fechadoEm: ultimo.fechadoEm }
        : null,
    });
  } catch (err) {
    next(err);
  }
}

// ============ ABRIR CAIXA ============

export async function abrir(req, res, next) {
  try {
    const saldoInicial = toNumber(req.body.saldoInicial);
    if (saldoInicial === null || Number.isNaN(saldoInicial) || saldoInicial < 0) {
      return res.status(400).json({ erro: "Saldo inicial invalido" });
    }

    // Bloqueia abertura se ja existe um caixa ABERTO para esse user.
    const aberto = await prisma.caixa.findFirst({
      where: { userId: req.user.sub, status: "ABERTO" },
      select: { id: true, numero: true },
    });
    if (aberto) {
      return res.status(409).json({
        erro: `Voce ja tem um caixa aberto (#${aberto.numero}). Feche-o antes de abrir outro.`,
      });
    }

    const caixa = await prisma.$transaction(async (tx) => {
      const novo = await tx.caixa.create({
        data: {
          userId: req.user.sub,
          status: "ABERTO",
          saldoInicial: toDecimal(saldoInicial),
          observacoesAbertura: req.body.observacoesAbertura
            ? String(req.body.observacoesAbertura).trim().toUpperCase()
            : null,
        },
        include: INCLUDE_RESUMO,
      });

      await tx.movimentacaoCaixa.create({
        data: {
          caixaId: novo.id,
          userId: req.user.sub,
          tipo: "ABERTURA",
          formaPagamento: "DINHEIRO",
          valor: toDecimal(saldoInicial),
          descricao: "ABERTURA DE CAIXA — TROCO INICIAL",
          saldoAntes: 0,
          saldoDepois: toDecimal(saldoInicial),
        },
      });

      return novo;
    });

    res.status(201).json(caixa);
  } catch (err) {
    next(err);
  }
}

// ============ FECHAR CAIXA ============
// Conferencia cega: o operador digita o saldoFinalContado SEM ver o esperado.
// Backend calcula esperado, registra diferenca e seta trocoProximoDia.

export async function fechar(req, res, next) {
  try {
    const id = req.params.id;
    const saldoFinalContado = toNumber(req.body.saldoFinalContado);
    const trocoProximoDia = req.body.trocoProximoDia !== undefined
      ? toNumber(req.body.trocoProximoDia) : 0;

    if (saldoFinalContado === null || Number.isNaN(saldoFinalContado) || saldoFinalContado < 0) {
      return res.status(400).json({ erro: "Saldo final contado invalido" });
    }
    if (trocoProximoDia !== null && (Number.isNaN(trocoProximoDia) || trocoProximoDia < 0)) {
      return res.status(400).json({ erro: "Troco para o proximo dia invalido" });
    }
    if (trocoProximoDia > saldoFinalContado) {
      return res.status(400).json({
        erro: "Troco do proximo dia nao pode ser maior que o saldo contado",
      });
    }

    try {
      await exigirAutorizacaoGerencial(req);
    } catch (err) {
      return res.status(err.status || 403).json({ erro: err.message });
    }

    try {
      const caixa = await prisma.$transaction(async (tx) => {
        const atual = await tx.caixa.findUnique({ where: { id } });
        if (!atual) {
          const e = new Error("Caixa nao encontrado"); e.status = 404; throw e;
        }
        if (atual.status === "FECHADO") {
          const e = new Error("Caixa ja esta fechado"); e.status = 400; throw e;
        }
        // ADMIN/GERENTE pode fechar caixa de terceiros; VENDEDOR so o proprio.
        if (req.user.role === "VENDEDOR" && atual.userId !== req.user.sub) {
          const e = new Error("Voce so pode fechar o seu proprio caixa"); e.status = 403; throw e;
        }

        const totais = await calcularTotaisCaixa(id, Number(atual.saldoInicial), tx);
        const saldoEsperado = totais.saldoEsperadoDinheiro;
        const diferenca = toDecimal(saldoFinalContado - saldoEsperado);

        const fechado = await tx.caixa.update({
          where: { id },
          data: {
            status: "FECHADO",
            saldoFinalContado: toDecimal(saldoFinalContado),
            saldoFinalEsperado: toDecimal(saldoEsperado),
            trocoProximoDia: toDecimal(trocoProximoDia),
            diferenca,
            observacoesFechamento: req.body.observacoesFechamento
              ? String(req.body.observacoesFechamento).trim().toUpperCase()
              : null,
            fechadoEm: new Date(),
          },
          include: INCLUDE_RESUMO,
        });

        await tx.movimentacaoCaixa.create({
          data: {
            caixaId: id,
            userId: req.user.sub,
            tipo: "FECHAMENTO",
            formaPagamento: "DINHEIRO",
            valor: toDecimal(saldoFinalContado),
            descricao: diferenca === 0
              ? "FECHAMENTO DE CAIXA — SEM DIFERENCA"
              : diferenca > 0
                ? `FECHAMENTO DE CAIXA — SOBRA DE R$ ${diferenca.toFixed(2)}`
                : `FECHAMENTO DE CAIXA — QUEBRA DE R$ ${Math.abs(diferenca).toFixed(2)}`,
            saldoAntes: toDecimal(saldoEsperado),
            saldoDepois: toDecimal(saldoFinalContado),
          },
        });

        return { ...fechado, totais };
      });

      res.json(caixa);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

// ============ SANGRIA / SUPRIMENTO ============

async function lancarManual(req, res, next, tipo) {
  try {
    const id = req.params.id;
    const valor = toNumber(req.body.valor);
    const descricao = req.body.descricao
      ? String(req.body.descricao).trim().toUpperCase()
      : (tipo === "SANGRIA" ? "SANGRIA" : "SUPRIMENTO");

    if (valor === null || Number.isNaN(valor) || valor <= 0) {
      return res.status(400).json({ erro: "Valor invalido" });
    }

    // Sangria (saida de dinheiro) exige autorizacao gerencial para VENDEDOR.
    // Suprimento (entrada) nao precisa — nao ha risco de fraude.
    if (tipo === "SANGRIA") {
      try {
        await exigirAutorizacaoGerencial(req);
      } catch (err) {
        return res.status(err.status || 403).json({ erro: err.message });
      }
    }

    try {
      const mov = await prisma.$transaction(async (tx) => {
        const caixa = await tx.caixa.findUnique({ where: { id } });
        if (!caixa) {
          const e = new Error("Caixa nao encontrado"); e.status = 404; throw e;
        }
        if (caixa.status !== "ABERTO") {
          const e = new Error("Caixa fechado nao aceita movimentacoes"); e.status = 400; throw e;
        }
        if (req.user.role === "VENDEDOR" && caixa.userId !== req.user.sub) {
          const e = new Error("Voce so pode movimentar o seu proprio caixa"); e.status = 403; throw e;
        }

        const totais = await calcularTotaisCaixa(id, Number(caixa.saldoInicial), tx);
        const saldoAntes = toDecimal(totais.saldoEsperadoDinheiro);
        const delta = tipo === "SANGRIA" ? -valor : valor;
        const saldoDepois = toDecimal(saldoAntes + delta);

        if (tipo === "SANGRIA" && saldoDepois < 0) {
          const e = new Error(`Saldo do caixa insuficiente. Disponivel em dinheiro: R$ ${saldoAntes.toFixed(2)}`);
          e.status = 400; throw e;
        }

        return await tx.movimentacaoCaixa.create({
          data: {
            caixaId: id,
            userId: req.user.sub,
            tipo,
            formaPagamento: "DINHEIRO",
            valor: toDecimal(valor),
            descricao,
            saldoAntes,
            saldoDepois,
          },
        });
      });

      res.status(201).json(mov);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

export const sangria = (req, res, next) => lancarManual(req, res, next, "SANGRIA");
export const suprimento = (req, res, next) => lancarManual(req, res, next, "SUPRIMENTO");

// ============ EXTRATO ============

export async function extrato(req, res, next) {
  try {
    const id = req.params.id;
    const caixa = await prisma.caixa.findUnique({
      where: { id },
      include: INCLUDE_RESUMO,
    });
    if (!caixa) return res.status(404).json({ erro: "Caixa nao encontrado" });

    const movs = await prisma.movimentacaoCaixa.findMany({
      where: { caixaId: id },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, nome: true } },
        venda: { select: { id: true, numero: true, total: true } },
        contaPagar: { select: { id: true, descricao: true } },
        contaReceber: { select: { id: true, descricao: true } },
      },
    });

    const totais = await calcularTotaisCaixa(id, Number(caixa.saldoInicial));

    res.json({ caixa, movimentacoes: movs, totais });
  } catch (err) {
    next(err);
  }
}

// ============ LISTAGEM / HISTORICO ============

export async function listar(req, res, next) {
  try {
    const { userId, status, dataInicio, dataFim, limite } = req.query;
    const where = {};
    // VENDEDOR ve so o proprio historico; ADMIN/GERENTE veem tudo.
    if (req.user.role === "VENDEDOR") {
      where.userId = req.user.sub;
    } else if (userId) {
      where.userId = userId;
    }
    if (status === "ABERTO" || status === "FECHADO") where.status = status;
    if (dataInicio || dataFim) {
      where.abertoEm = {};
      if (dataInicio) where.abertoEm.gte = new Date(dataInicio);
      if (dataFim) where.abertoEm.lte = new Date(dataFim + "T23:59:59.999Z");
    }
    const take = Math.min(parseInt(limite, 10) || 50, 200);

    const caixas = await prisma.caixa.findMany({
      where,
      include: INCLUDE_RESUMO,
      orderBy: { abertoEm: "desc" },
      take,
    });
    res.json(caixas);
  } catch (err) {
    next(err);
  }
}

// ============ HELPER: TOTAIS DO CAIXA ============
// Calcula entradas, saidas, saldo esperado em dinheiro e total movimentado
// (todas as formas de pagamento). Pode receber um tx para uso dentro de
// transacao, ou usar o prisma global.

export async function calcularTotaisCaixa(caixaId, saldoInicial, tx = prisma) {
  const movs = await tx.movimentacaoCaixa.findMany({
    where: { caixaId },
    select: { tipo: true, valor: true, formaPagamento: true },
  });

  const ehEntrada = (t) => t === "VENDA" || t === "SUPRIMENTO" || t === "RECEBER_CONTA";
  const ehSaida = (t) => t === "SANGRIA" || t === "PAGAR_CONTA" || t === "ESTORNO_VENDA";

  let entradasDinheiro = 0;
  let saidasDinheiro = 0;
  let entradasOutras = 0;
  let saidasOutras = 0;
  const porForma = {};

  for (const m of movs) {
    if (m.tipo === "ABERTURA" || m.tipo === "FECHAMENTO") continue;
    const v = Number(m.valor);
    const dinheiro = m.formaPagamento === "DINHEIRO";
    if (ehEntrada(m.tipo)) {
      if (dinheiro) entradasDinheiro += v; else entradasOutras += v;
    } else if (ehSaida(m.tipo)) {
      if (dinheiro) saidasDinheiro += v; else saidasOutras += v;
    }
    porForma[m.formaPagamento] = (porForma[m.formaPagamento] || 0) + v;
  }

  const saldoEsperadoDinheiro = saldoInicial + entradasDinheiro - saidasDinheiro;

  return {
    saldoInicial,
    entradasDinheiro,
    saidasDinheiro,
    entradasOutras,
    saidasOutras,
    totalEntradas: entradasDinheiro + entradasOutras,
    totalSaidas: saidasDinheiro + saidasOutras,
    saldoEsperadoDinheiro,
    porFormaPagamento: porForma,
  };
}

// ============ HELPER REUTILIZAVEL POR OUTROS CONTROLLERS ============
// Localiza o caixa aberto do user e cria uma movimentacao vinculada.
// Usado pelo vendaController e contaPagar/contaReceber.
//
// Retorna a movimentacao criada ou null se nao havia caixa aberto (ex:
// pagamento financeiro sem caixa aberto — a operacao financeira segue
// normal mas nao gera movimentacao no caixa).

export async function registrarNoCaixaAberto(tx, userId, dados) {
  const caixa = await tx.caixa.findFirst({
    where: { userId, status: "ABERTO" },
    select: { id: true, saldoInicial: true },
  });
  if (!caixa) return null;

  const totais = await calcularTotaisCaixa(caixa.id, Number(caixa.saldoInicial), tx);
  const saldoAntes = toDecimal(totais.saldoEsperadoDinheiro);
  const ehEntrada = dados.tipo === "VENDA" || dados.tipo === "SUPRIMENTO" || dados.tipo === "RECEBER_CONTA";
  const ehDinheiro = (dados.formaPagamento || "DINHEIRO") === "DINHEIRO";
  // Saldo so muda quando e DINHEIRO. Outras formas entram no extrato com
  // saldoAntes == saldoDepois (apenas registro).
  const delta = ehDinheiro ? (ehEntrada ? Number(dados.valor) : -Number(dados.valor)) : 0;
  const saldoDepois = toDecimal(saldoAntes + delta);

  return await tx.movimentacaoCaixa.create({
    data: {
      caixaId: caixa.id,
      userId,
      tipo: dados.tipo,
      formaPagamento: dados.formaPagamento || "DINHEIRO",
      valor: toDecimal(dados.valor),
      descricao: dados.descricao,
      saldoAntes,
      saldoDepois,
      vendaId: dados.vendaId || null,
      contaPagarId: dados.contaPagarId || null,
      contaReceberId: dados.contaReceberId || null,
    },
  });
}

export async function buscarCaixaAberto(userId) {
  return await prisma.caixa.findFirst({
    where: { userId, status: "ABERTO" },
    select: { id: true, numero: true },
  });
}

// Validacao usada pelo vendaController — exige caixa aberto e devolve o id.
export async function exigirCaixaAberto(userId) {
  const caixa = await buscarCaixaAberto(userId);
  if (!caixa) {
    const e = new Error("Voce precisa abrir um caixa antes de registrar vendas. Acesse o modulo Caixa.");
    e.status = 400;
    throw e;
  }
  return caixa;
}

// Re-export para uso no vendaController.
export { FORMAS_VALIDAS };
