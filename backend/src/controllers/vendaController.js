import crypto from "node:crypto";
import prisma from "../lib/prisma.js";
import { exigirCaixaAberto, registrarNoCaixaAberto, calcularTotaisCaixa, exigirAutorizacaoGerencial } from "./caixaController.js";
import { parseDate, calcularValores, gerarSerieRecorrencia } from "../lib/contas.js";
import { criarComNumeroRetry } from "../lib/proximoNumero.js";
import { verificarLimite } from "../lib/planoLimites.js";

const FORMAS_VALIDAS = new Set([
  "DINHEIRO", "CARTAO_CREDITO", "CARTAO_DEBITO", "PIX", "BOLETO", "CREDIARIO",
]);

// Formas que representam venda a prazo: o cliente (ou a operadora) ainda
// nao pagou no ato — gera ContaReceber automatica quando o caixa enviar
// gerarContaReceber no payload.
const FORMAS_GERA_RECEBER = new Set(["CARTAO_CREDITO", "BOLETO", "CREDIARIO"]);

// Tolerancia de comparacao monetaria (1 centavo). Evita rejeitar pagamentos
// por arredondamento de Decimal em parcelas (ex: 1/3 de 10.00 = 3.33+3.33+3.34).
const EPS_CENTAVO = 0.005;

// Opcoes das transacoes interativas. O default do Prisma (timeout 5s) e
// curto demais quando a Function roda longe do banco: cada venda faz ~10
// queries sequenciais e, com latencia de rede alta (ex: Function em iad1 e
// Neon em sa-east-1), o corpo da transacao estoura 5s em cold start e o
// Prisma aborta com P2028 ("Transaction already closed") — que vira "Erro
// interno do servidor". Margem ampla evita esse 500 mesmo no pior caso.
const TX_OPTS = { maxWait: 15_000, timeout: 30_000 };

// Normaliza/valida o array de pagamentos (split de pagamento). Aceita:
//   1) body.pagamentos[] com [{forma, valor, formaCustomNome?, ordem?}]
//   2) Legado: body.formaPagamento + valor implicito = total (split de 1)
// Retorna { pagamentos, formaPrincipal, valorAPrazo } ou lanca {status, message}.
//
// Regras:
//   - soma dos valores ~= total (tolerancia 1 centavo)
//   - cada valor > 0 e forma valida
//   - formaPrincipal = forma do pagamento de MAIOR valor (gravada em
//     Venda.formaPagamento por compat com filtros/relatorios existentes)
//   - valorAPrazo = soma dos valores cuja forma esta em FORMAS_GERA_RECEBER
function normalizarPagamentos(body, total) {
  let lista = [];
  if (Array.isArray(body?.pagamentos) && body.pagamentos.length > 0) {
    lista = body.pagamentos;
  } else if (body?.formaPagamento) {
    // Legado: 1 forma so. Continua funcionando para clientes externos
    // (API publica) e para o proprio frontend antes de migrar.
    lista = [{ forma: body.formaPagamento, valor: total }];
  } else {
    const e = new Error("Informe ao menos uma forma de pagamento"); e.status = 400; throw e;
  }

  if (lista.length > 10) {
    const e = new Error("Maximo de 10 formas de pagamento por venda"); e.status = 400; throw e;
  }

  const pagamentos = [];
  let soma = 0;
  let valorAPrazo = 0;
  let formaPrincipal = null;
  let maiorValor = -1;

  for (let i = 0; i < lista.length; i++) {
    const p = lista[i] || {};
    const idx = i + 1;
    const forma = String(p.forma || p.formaPagamento || "").trim();
    if (!forma || !FORMAS_VALIDAS.has(forma)) {
      const e = new Error(`Pagamento ${idx}: forma "${forma}" invalida`); e.status = 400; throw e;
    }
    const valor = toNumber(p.valor);
    if (valor === null || Number.isNaN(valor) || valor <= 0) {
      const e = new Error(`Pagamento ${idx}: valor deve ser > 0`); e.status = 400; throw e;
    }
    const valorR = Math.round(valor * 100) / 100;
    const formaCustomNome = p.formaCustomNome
      ? String(p.formaCustomNome).trim().toUpperCase().slice(0, 60) || null
      : null;
    pagamentos.push({
      forma,
      valor: valorR,
      formaCustomNome,
      ordem: Number.isFinite(p.ordem) ? Number(p.ordem) : i,
    });
    soma += valorR;
    if (FORMAS_GERA_RECEBER.has(forma)) valorAPrazo += valorR;
    if (valorR > maiorValor) { maiorValor = valorR; formaPrincipal = forma; }
  }

  const somaR = Math.round(soma * 100) / 100;
  const totalR = Math.round(total * 100) / 100;
  if (Math.abs(somaR - totalR) > EPS_CENTAVO) {
    const e = new Error(
      `Soma dos pagamentos (${somaR.toFixed(2)}) nao bate com o total da venda (${totalR.toFixed(2)})`
    );
    e.status = 400; throw e;
  }

  return {
    pagamentos,
    formaPrincipal,
    valorAPrazo: Math.round(valorAPrazo * 100) / 100,
  };
}

const INCLUDE_LISTA = {
  cliente: { select: { id: true, nome: true, cpfCnpj: true } },
  user: { select: { id: true, nome: true } },
  _count: { select: { itens: true } },
};

const INCLUDE_DETALHE = {
  cliente: { select: { id: true, nome: true, cpfCnpj: true, telefone: true, email: true } },
  user: { select: { id: true, nome: true, role: true } },
  itens: {
    include: {
      // ETAPA#8a: camposSegmento exposto para que o cupom (HTML ou ESC/POS)
      // renderize OEM/lote/validade quando a empresa for AUTO_PECAS/FARMACIA.
      produto: { select: { id: true, codigo: true, nome: true, unidade: true, camposSegmento: true } },
    },
  },
  pagamentos: {
    select: { id: true, forma: true, valor: true, formaCustomNome: true, ordem: true },
    orderBy: { ordem: "asc" },
  },
  contasReceber: {
    select: {
      id: true, descricao: true, valor: true, vencimento: true,
      status: true, parcelaAtual: true, parcelaTotal: true,
    },
    orderBy: { vencimento: "asc" },
  },
};

function toNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

// Cria um Error com .status (e opcionalmente .body estruturado) para o
// servico criarVenda sinalizar erros de validacao/regra sem depender de res.
// O wrapper HTTP (criar) e o webhook do MP traduzem isso para a resposta.
function erroVenda(status, message, body) {
  const e = new Error(message);
  e.status = status;
  if (body) e.body = body;
  return e;
}

// Arredonda quantidade para 3 casas decimais — bate com o tipo
// Decimal(12,3) usado no schema (ItemVenda.quantidade, Produto.estoque).
function arredQtd(n) {
  return Math.round(n * 1000) / 1000;
}

export async function listar(req, res, next) {
  try {
    const { clienteId, userId, formaPagamento, status, dataInicio, dataFim, limite } = req.query;
    const where = {};
    if (clienteId) where.clienteId = clienteId;
    // VENDEDOR so ve as proprias vendas (ignora userId da query). ADMIN e
    // GERENTE podem filtrar por qualquer vendedor.
    if (req.user.role === "VENDEDOR") {
      where.userId = req.user.sub;
    } else if (userId) {
      where.userId = userId;
    }
    if (formaPagamento && FORMAS_VALIDAS.has(formaPagamento)) where.formaPagamento = formaPagamento;
    if (status) where.status = status;
    if (dataInicio || dataFim) {
      where.createdAt = {};
      if (dataInicio) where.createdAt.gte = new Date(dataInicio);
      if (dataFim) where.createdAt.lte = new Date(dataFim + "T23:59:59.999Z");
    }
    const take = Math.min(parseInt(limite, 10) || 100, 500);
    const vendas = await prisma.venda.findMany({
      where,
      include: INCLUDE_LISTA,
      orderBy: { createdAt: "desc" },
      take,
    });
    res.json(vendas);
  } catch (err) {
    next(err);
  }
}

export async function obter(req, res, next) {
  try {
    const venda = await prisma.venda.findUnique({
      where: { id: req.params.id },
      include: INCLUDE_DETALHE,
    });
    if (!venda) return res.status(404).json({ erro: "Venda nao encontrada" });
    // VENDEDOR so abre detalhe das proprias vendas (consistente com a
    // listagem). 404 ao inves de 403 para nao revelar existencia.
    if (req.user.role === "VENDEDOR" && venda.userId !== req.user.sub) {
      return res.status(404).json({ erro: "Venda nao encontrada" });
    }
    res.json(venda);
  } catch (err) {
    next(err);
  }
}

// Calcula o total final de uma venda (subtotal dos itens − desconto −
// desconto de fidelidade) e valida itens + regras de fidelidade. FONTE UNICA
// de verdade do total — usada por criarVenda E pela cobranca Mercado Pago
// (validacao pre-charge). Read-only no banco. Lanca erroVenda(.status) em
// payload invalido. Deve rodar com tenantStorage ativo (usa prisma filtrado).
export async function calcularTotalVenda({ itens, descontoRaw, pontosResgatarRaw, clienteId }) {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw erroVenda(400, "Informe ao menos um item");
  }
  const desconto = descontoRaw !== undefined ? toNumber(descontoRaw) : 0;
  if (desconto === null || Number.isNaN(desconto) || desconto < 0) {
    throw erroVenda(400, "Desconto invalido");
  }
  const pontosParsed = parseInt(pontosResgatarRaw, 10);
  const pontosResgatar = Number.isFinite(pontosParsed) && pontosParsed > 0 ? pontosParsed : 0;

  const itensNorm = [];
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i];
    const idx = i + 1;
    if (!it?.produtoId) throw erroVenda(400, `Item ${idx}: produtoId obrigatorio`);
    const qtdRaw = toNumber(it.quantidade);
    if (qtdRaw === null || Number.isNaN(qtdRaw) || qtdRaw <= 0) {
      throw erroVenda(400, `Item ${idx}: quantidade deve ser > 0`);
    }
    const qtd = arredQtd(qtdRaw);
    const preco = toNumber(it.precoUnitario);
    if (preco === null || Number.isNaN(preco) || preco < 0) {
      throw erroVenda(400, `Item ${idx}: precoUnitario invalido`);
    }
    itensNorm.push({ produtoId: it.produtoId, quantidade: qtd, precoUnitario: preco });
  }

  const subtotal = itensNorm.reduce((acc, it) => acc + it.quantidade * it.precoUnitario, 0);

  let configFidelidade = null;
  let descontoFidelidade = 0;
  if (pontosResgatar > 0) {
    if (!clienteId) {
      throw erroVenda(400, "Informe o cliente para resgatar pontos de fidelidade");
    }
    configFidelidade = await prisma.configuracaoFidelidade.findFirst();
    if (!configFidelidade?.ativo) {
      throw erroVenda(400, "Programa de fidelidade nao esta ativo");
    }
    if (pontosResgatar < configFidelidade.minimoResgate) {
      throw erroVenda(400, `Minimo de resgate: ${configFidelidade.minimoResgate} pontos`);
    }
    const pontosDoc = await prisma.pontosCliente.findUnique({ where: { clienteId } });
    const saldoAtual = pontosDoc?.saldo ?? 0;
    if (saldoAtual < pontosResgatar) {
      throw erroVenda(400, `Saldo insuficiente. Disponivel: ${saldoAtual} pontos`);
    }
    descontoFidelidade = Math.floor(pontosResgatar / Number(configFidelidade.pontosParaUmReal) * 100) / 100;
    const limiteDescPct = subtotal * (Number(configFidelidade.maximoDescPct) / 100);
    if (descontoFidelidade > limiteDescPct + 0.005) {
      throw erroVenda(400, `Desconto por fidelidade excede o limite de ${configFidelidade.maximoDescPct}% do subtotal`);
    }
  }

  const total = Math.max(0, subtotal - desconto - descontoFidelidade);
  return { itensNorm, desconto, descontoFidelidade, configFidelidade, pontosResgatar, subtotal, total };
}

// HTTP: POST /vendas — wrapper fino sobre o servico criarVenda.
export async function criar(req, res, next) {
  try {
    const venda = await criarVenda({
      body: req.body,
      userId: req.user.sub,
      tenantId: req.tenantId,
    });
    res.status(201).json(venda);
  } catch (err) {
    // Erros de validacao/regra carregam .status (e as vezes .body estruturado,
    // ex: 402 de limite de plano). O resto vira 500 via next.
    if (err.status) return res.status(err.status).json(err.body || { erro: err.message });
    next(err);
  }
}

// SERVICO puro de criacao de venda. Usado pelo controller HTTP acima E pelo
// webhook do Mercado Pago (aprovacao de pagamento). NAO recebe req/res:
// recebe os dados ja extraidos e LANCA erros com .status (e .body opcional)
// em vez de escrever na resposta. Deve rodar dentro de
// tenantStorage.run({ tenantId }) para o Prisma extension filtrar/inserir
// com o tenant correto. Retorna a Venda criada (com INCLUDE_DETALHE).
//
//   body     — mesmo shape de POST /vendas (clienteId, itens[], pagamentos[],
//              desconto, observacoes, pontosResgatar, gerarContaReceber, ...)
//   userId   — operador que originou a venda (auditoria, caixa, movimentacoes)
//   tenantId — empresa dona da venda
export async function criarVenda({ body, userId, tenantId }) {
  const { clienteId, observacoes, itens, gerarContaReceber, oportunidadeId } = body;

  // Idempotencia: o PDV gera uma chave unica por checkout e a reenvia em
  // qualquer retry (double-click, F10 repetido, retry de rede). Duas
  // requisicoes com a mesma chave NAO podem virar duas vendas. Normaliza
  // (string curta) — chave ausente/invalida = sem protecao (legado/API).
  const idempotencyKey = typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()
    ? body.idempotencyKey.trim().slice(0, 100)
    : null;

  // Fast path: se ja existe uma venda com esta chave no tenant, e um replay
  // (a 1a requisicao ja gravou). Devolve a venda existente — o cliente mostra
  // o recibo normalmente, sem duplicar nem dar erro. O prisma estendido ja
  // filtra por tenant via AsyncLocalStorage.
  if (idempotencyKey) {
    const existente = await prisma.venda.findFirst({
      where: { idempotencyKey },
      include: INCLUDE_DETALHE,
    });
    if (existente) return existente;
  }

  // Conversao Oportunidade GANHO -> Venda: valida fora da transacao para
  // falhar rapido antes de qualquer write. Re-checado dentro da transacao
  // (linha de update) contra race conditions de outro usuario tocando a
  // oportunidade no meio tempo.
  if (oportunidadeId) {
    const op = await prisma.oportunidade.findUnique({
      where: { id: oportunidadeId },
      select: { id: true, etapa: true, vendaId: true, clienteId: true, numero: true },
    });
    if (!op) {
      throw erroVenda(404, "Oportunidade nao encontrada");
    }
    if (op.etapa !== "GANHO") {
      throw erroVenda(400, "So e possivel converter oportunidades em etapa GANHO");
    }
    if (op.vendaId) {
      throw erroVenda(400, "Oportunidade ja foi convertida em outra venda");
    }
    if (op.clienteId && clienteId && op.clienteId !== clienteId) {
      throw erroVenda(400, "Cliente da venda nao bate com o cliente da oportunidade");
    }
  }

  if (!Array.isArray(itens) || itens.length === 0) {
    throw erroVenda(400, "Informe ao menos um item");
  }
  // ETAPA 13: limite mensal de vendas por plano. Sem tenant (cenarios
  // cross-tenant raros) nao ha limite a aplicar.
  if (tenantId) {
    const lim = await verificarLimite(tenantId, "vendasMes");
    if (!lim.ok) {
      const msg = `Limite do plano ${lim.plano} atingido: ${lim.atual}/${lim.limite} vendas no mês. Faça upgrade do plano para criar mais.`;
      throw erroVenda(402, msg, {
        erro: msg,
        recurso: lim.recurso,
        atual: lim.atual,
        limite: lim.limite,
        plano: lim.plano,
        limiteAtingido: true,
      });
    }
  }
  // Total + validacao de itens/desconto/fidelidade. FONTE UNICA de verdade
  // (mesma funcao usada pela cobranca MP para validar o valor pre-charge).
  const { itensNorm, desconto, configFidelidade, pontosResgatar, total } =
    await calcularTotalVenda({
      itens,
      descontoRaw: body.desconto,
      pontosResgatarRaw: body.pontosResgatar,
      clienteId,
    });

    // Validacao basica do bloco financeiro (ContaReceber automatica). A
    // validacao do valor a prazo (baseada no split de pagamentos) acontece
    // depois de calcular o total — feita ANTES da transacao para falhar
    // rapido sem precisar reverter a venda.
    let configConta = null;
    if (gerarContaReceber) {
      const venc = parseDate(gerarContaReceber.vencimento);
      if (!venc) throw erroVenda(400, "Vencimento da conta a receber invalido");
      const parcelas = parseInt(gerarContaReceber.parcelas, 10) || 1;
      if (parcelas < 1 || parcelas > 60) {
        throw erroVenda(400, "Numero de parcelas deve estar entre 1 e 60");
      }
      configConta = {
        vencimento: venc,
        parcelas,
        descricaoCustom: gerarContaReceber.descricao
          ? String(gerarContaReceber.descricao).trim().toUpperCase().slice(0, 200)
          : null,
        observacoesConta: gerarContaReceber.observacoes
          ? String(gerarContaReceber.observacoes).trim().toUpperCase().slice(0, 500)
          : null,
      };
    }

    // Normaliza/valida o split de pagamentos. Lanca erro com .status 400 se
    // algum pagamento for invalido ou se a soma nao bater com o total — o
    // erro propaga para o wrapper HTTP (ou para o webhook do MP).
    const splitPagamentos = normalizarPagamentos(body, total);
    const { pagamentos: pagamentosNorm, formaPrincipal, valorAPrazo } = splitPagamentos;

    // CREDIARIO (fiado): exige cliente identificado e respeita o limite de
    // credito. Distinto de BOLETO/CARTAO a prazo (operadora cobre) — fiado e
    // divida pessoal do cliente. Bloqueia (402) se estourar o limite.
    const valorCrediario = pagamentosNorm
      .filter(p => p.forma === "CREDIARIO")
      .reduce((s, p) => s + Number(p.valor), 0);
    if (valorCrediario > 0) {
      if (!clienteId) {
        throw erroVenda(400, "Selecione o cliente para vender no crediário (fiado).");
      }
      const cli = await prisma.cliente.findUnique({
        where: { id: clienteId },
        select: { id: true, nome: true, limiteCredito: true },
      });
      if (!cli) throw erroVenda(404, "Cliente nao encontrado");
      if (cli.limiteCredito != null) {
        const agg = await prisma.contaReceber.aggregate({
          where: { clienteId, status: { in: ["PENDENTE", "ATRASADA"] } },
          _sum: { valor: true },
        });
        const saldo = Number(agg._sum.valor || 0);
        const limite = Number(cli.limiteCredito);
        if (saldo + valorCrediario > limite + 0.005) {
          throw erroVenda(
            402,
            `Limite de crédito de ${cli.nome} excedido. Limite ${limite.toFixed(2)}, saldo atual ${saldo.toFixed(2)}, disponível ${Math.max(0, limite - saldo).toFixed(2)}.`,
            {
              erro: `Limite de crédito de ${cli.nome} excedido. Limite ${limite.toFixed(2)}, saldo atual ${saldo.toFixed(2)}, disponível ${Math.max(0, limite - saldo).toFixed(2)}.`,
              limiteExcedido: true,
              limite, saldo, disponivel: Math.max(0, limite - saldo),
            },
          );
        }
      }
    }

    // Conta a receber so e gerada se HOUVER pagamento em forma a prazo no
    // split (e o usuario tiver enviado config). O valor da conta e o
    // valorAPrazo, NAO o total — ex: R$ 60 PIX + R$ 40 CREDIARIO gera conta
    // de R$ 40.
    if (configConta && valorAPrazo <= 0) {
      throw erroVenda(400, "Nenhuma forma de pagamento do split permite gerar conta a receber");
    }

    // Defesa explicita: nao deixa registrar venda sem caixa aberto.
    const caixaAtivo = await exigirCaixaAberto(userId);

    let venda;
    try {
      venda = await prisma.$transaction(async (tx) => {
        if (clienteId) {
          const c = await tx.cliente.findUnique({ where: { id: clienteId } });
          if (!c) {
            const e = new Error("Cliente nao encontrado"); e.status = 404; throw e;
          }
        }

        const produtos = await tx.produto.findMany({
          where: { id: { in: itensNorm.map(i => i.produtoId) } },
        });
        const mapaProdutos = new Map(produtos.map(p => [p.id, p]));

        for (const it of itensNorm) {
          const p = mapaProdutos.get(it.produtoId);
          if (!p) {
            const e = new Error(`Produto ${it.produtoId} nao encontrado`); e.status = 404; throw e;
          }
          if (!p.ativo) {
            const e = new Error(`Produto "${p.nome}" esta inativo`); e.status = 400; throw e;
          }
          // Servicos nao tem estoque a validar — venda e sempre permitida.
          if (p.tipoItem === "SERVICO") continue;
          const estoqueAtual = Number(p.estoque);
          if (estoqueAtual < it.quantidade) {
            const e = new Error(`Estoque insuficiente de "${p.nome}". Disponivel: ${estoqueAtual}, solicitado: ${it.quantidade}`);
            e.status = 400; throw e;
          }
        }

        // Numero sequencial por tenant (ETAPA 8). Retry em race condition.
        // Venda.formaPagamento (legado) recebe a forma de MAIOR valor do
        // split — preserva filtros/relatorios existentes.
        const vendaCriada = await criarComNumeroRetry(tx.venda, tenantId, (numero) =>
          tx.venda.create({
            data: {
              numero,
              clienteId: clienteId || null,
              userId,
              caixaId: caixaAtivo.id,
              formaPagamento: formaPrincipal,
              status: "CONCLUIDA",
              idempotencyKey,
              desconto,
              total,
              observacoes: observacoes ? String(observacoes).trim() : null,
              itens: {
                create: itensNorm.map(it => ({
                  produtoId: it.produtoId,
                  quantidade: it.quantidade,
                  precoUnitario: it.precoUnitario,
                  subtotal: it.quantidade * it.precoUnitario,
                })),
              },
              pagamentos: {
                create: pagamentosNorm.map(p => ({
                  forma: p.forma,
                  valor: p.valor,
                  formaCustomNome: p.formaCustomNome,
                  ordem: p.ordem,
                })),
              },
            },
            include: INCLUDE_DETALHE,
          })
        );

        // Registra a venda no extrato do caixa: 1 movimentacao POR pagamento
        // do split (cada forma vira uma linha — apenas DINHEIRO afeta saldo,
        // logica do registrarNoCaixaAberto). Permite ver no extrato a
        // composicao real do recebimento.
        for (const p of pagamentosNorm) {
          const sufixoForma = pagamentosNorm.length > 1 ? ` (${p.forma})` : "";
          await registrarNoCaixaAberto(tx, userId, {
            tipo: "VENDA",
            formaPagamento: p.forma,
            valor: p.valor,
            descricao: `VENDA #${vendaCriada.numero}${clienteId ? "" : " — CONSUMIDOR"}${sufixoForma}`,
            vendaId: vendaCriada.id,
          });
        }

        // Conversao Oportunidade -> Venda: vincula vendaId. updateMany com
        // where defensivo (etapa GANHO + vendaId null) cobre race condition:
        // se outro user moveu/converteu no meio tempo, count=0 e revertemos.
        if (oportunidadeId) {
          const r = await tx.oportunidade.updateMany({
            where: { id: oportunidadeId, etapa: "GANHO", vendaId: null },
            data: { vendaId: vendaCriada.id },
          });
          if (r.count === 0) {
            const e = new Error("Oportunidade foi alterada por outro usuario durante a conversao");
            e.status = 409;
            throw e;
          }
        }

        for (const it of itensNorm) {
          const p = mapaProdutos.get(it.produtoId);
          // Servicos nao baixam estoque nem geram movimentacao — apenas o
          // ItemVenda e o registro financeiro contam.
          if (p.tipoItem === "SERVICO") continue;
          const antes = Number(p.estoque);
          const depois = arredQtd(antes - it.quantidade);
          await tx.produto.update({
            where: { id: it.produtoId },
            data: { estoque: depois },
          });
          await tx.movimentacaoEstoque.create({
            data: {
              tipo: "SAIDA",
              quantidade: it.quantidade,
              estoqueAntes: antes,
              estoqueDepois: depois,
              motivo: `VENDA #${vendaCriada.numero}`,
              produtoId: it.produtoId,
              userId,
            },
          });
        }

        // Fidelidade: resgate de pontos (deducao do saldo)
        if (pontosResgatar > 0 && configFidelidade?.ativo) {
          await tx.pontosCliente.update({
            where: { clienteId },
            data: {
              saldo: { decrement: pontosResgatar },
              totalResgatado: { increment: pontosResgatar },
              updatedAt: new Date(),
            },
          });
          await tx.movimentacaoPontos.create({
            data: {
              tipo: "RESGATE",
              pontos: pontosResgatar,
              descricao: `RESGATE NA VENDA #${vendaCriada.numero}`,
              clienteId,
              vendaId: vendaCriada.id,
              userId,
            },
          });
        }

        // CRM: promove cliente LEAD -> CLIENTE_ATIVO ao concluir 1a venda.
        // Idempotente: o where do update so afeta clientes em LEAD ou PERDIDO,
        // entao reativa quem havia sido marcado como perdido tambem.
        if (clienteId) {
          await tx.cliente.updateMany({
            where: { id: clienteId, statusFunil: { in: ["LEAD", "PERDIDO"] } },
            data: { statusFunil: "CLIENTE_ATIVO" },
          });
        }

        // CRM: gera pesquisa NPS automaticamente para a venda. Token unico
        // permite link publico /?nps=<token>. Vendas sem clienteId nao geram
        // pesquisa (consumidor anonimo).
        if (clienteId) {
          const token = crypto.randomBytes(16).toString("hex");
          await tx.pesquisaNps.create({
            data: {
              token,
              vendaId: vendaCriada.id,
              clienteId,
            },
          });
        }

        // Fidelidade: ganho de pontos (credito baseado no total pos-descontos)
        if (clienteId && total > 0) {
          const cfg = configFidelidade || await tx.configuracaoFidelidade.findFirst();
          if (cfg?.ativo) {
            const pontosGanhos = Math.floor(total / Number(cfg.reaisPorPonto));
            if (pontosGanhos > 0) {
              await tx.pontosCliente.upsert({
                where: { clienteId },
                update: {
                  saldo: { increment: pontosGanhos },
                  totalGanho: { increment: pontosGanhos },
                  updatedAt: new Date(),
                },
                create: {
                  clienteId,
                  saldo: pontosGanhos,
                  totalGanho: pontosGanhos,
                  totalResgatado: 0,
                },
              });
              await tx.movimentacaoPontos.create({
                data: {
                  tipo: "GANHO",
                  pontos: pontosGanhos,
                  descricao: `GANHO NA VENDA #${vendaCriada.numero}`,
                  clienteId,
                  vendaId: vendaCriada.id,
                  userId,
                },
              });
            }
          }
        }

        // ContaReceber automatica: gera 1+ parcelas vinculadas a venda.
        // O VALOR e o valorAPrazo (soma das formas a prazo no split), NAO
        // o total da venda. Ex: R$ 60 PIX + R$ 40 CREDIARIO -> conta de R$ 40.
        if (configConta) {
          const nomeCliente = vendaCriada.cliente?.nome
            ? vendaCriada.cliente.nome.toUpperCase()
            : "CONSUMIDOR";
          const descricao = configConta.descricaoCustom
            || `VENDA #${vendaCriada.numero} - ${nomeCliente}`;
          const calc = calcularValores({
            valorBruto: valorAPrazo, juros: 0, multa: 0, desconto: 0,
          });
          if (!calc.ok) { const e = new Error(calc.erro); e.status = 400; throw e; }
          const serie = gerarSerieRecorrencia({
            tipoRecorrencia: configConta.parcelas > 1 ? "PARCELADA" : "NENHUMA",
            parcelaTotal: configConta.parcelas,
            valores: calc.valores,
            vencimento: configConta.vencimento,
            dadosBase: {
              descricao,
              clienteId: clienteId || null,
              observacoes: configConta.observacoesConta
                || `GERADA AUTOMATICAMENTE PELA VENDA #${vendaCriada.numero}`,
            },
          });
          if (!serie.ok) {
            const e = new Error(serie.erro); e.status = 400; throw e;
          }
          for (const reg of serie.registros) {
            await tx.contaReceber.create({ data: { ...reg, vendaId: vendaCriada.id } });
          }
        }

        // Recarrega para incluir contasReceber recem-criadas no retorno.
        return tx.venda.findUnique({
          where: { id: vendaCriada.id },
          include: INCLUDE_DETALHE,
        });
      }, TX_OPTS);
    } catch (err) {
      // Race de idempotencia: duas requisicoes identicas chegaram quase
      // juntas; ambas passaram o fast-path (nenhuma viu a outra ainda) e a 2a
      // perdeu a corrida do unique (tenantId, idempotencyKey) -> P2002. Em vez
      // de propagar erro, devolve a venda que a 1a gravou. (P2002 de `numero`
      // ja foi tratado/re-tentado dentro de criarComNumeroRetry e nao chega
      // aqui.)
      const alvo = err?.meta?.target;
      const ehIdemKey = err?.code === "P2002" && (
        (Array.isArray(alvo) && alvo.some(t => String(t).includes("idempotencyKey")))
        || (typeof alvo === "string" && alvo.includes("idempotencyKey"))
      );
      if (ehIdemKey && idempotencyKey) {
        const existente = await prisma.venda.findFirst({
          where: { idempotencyKey },
          include: INCLUDE_DETALHE,
        });
        if (existente) return existente;
      }
      throw err;
    }

    return venda;
}

// Reabre uma venda CONCLUIDA para que ADMIN/GERENTE altere a forma de
// pagamento. Estorna o lancamento no caixa (se aberto) e cancela as contas
// a receber PENDENTE/ATRASADA vinculadas. NAO mexe no estoque — o cliente
// ja saiu com a mercadoria; estamos apenas trocando como ele paga.
// Bloqueia se houver ContaReceber ja PAGA (precisa reabrir no Financeiro
// antes), mesma regra de cancelar().
export async function reabrir(req, res, next) {
  try {
    const id = req.params.id;
    try {
      await exigirAutorizacaoGerencial(req);
      const venda = await prisma.$transaction(async (tx) => {
        const atual = await tx.venda.findUnique({
          where: { id },
          include: { contasReceber: true, pagamentos: true },
        });
        if (!atual) {
          const e = new Error("Venda nao encontrada"); e.status = 404; throw e;
        }
        if (atual.status !== "CONCLUIDA") {
          const e = new Error(
            `So e possivel reabrir vendas CONCLUIDAS (status atual: ${atual.status})`
          );
          e.status = 400; throw e;
        }

        const contasPagas = atual.contasReceber.filter(c => c.status === "PAGA");
        if (contasPagas.length > 0) {
          const e = new Error(
            `Esta venda possui ${contasPagas.length} conta(s) ja recebida(s). ` +
            `Reabra-a(s) no Financeiro antes de alterar a forma de pagamento.`
          );
          e.status = 400; throw e;
        }

        const idsCancelar = atual.contasReceber
          .filter(c => c.status === "PENDENTE" || c.status === "ATRASADA")
          .map(c => c.id);
        if (idsCancelar.length > 0) {
          await tx.contaReceber.updateMany({
            where: { id: { in: idsCancelar } },
            data: { status: "CANCELADA" },
          });
        }

        // Estorno no caixa: 1 movimentacao POR pagamento do split (so DINHEIRO
        // afeta saldo). Fallback usa formaPagamento legado se nao houver
        // pagamentos (vendas pre-migracao tem backfill, entao raramente cai aqui).
        const splitEstorno = atual.pagamentos.length > 0
          ? atual.pagamentos.map(p => ({ forma: p.forma, valor: Number(p.valor) }))
          : [{ forma: atual.formaPagamento, valor: Number(atual.total) }];

        if (atual.caixaId) {
          const caixaVenda = await tx.caixa.findUnique({
            where: { id: atual.caixaId },
            select: { status: true, saldoInicial: true },
          });
          if (caixaVenda?.status === "ABERTO") {
            for (const p of splitEstorno) {
              const totais = await calcularTotaisCaixa(atual.caixaId, Number(caixaVenda.saldoInicial), tx);
              const saldoAntes = Math.round(totais.saldoEsperadoDinheiro * 100) / 100;
              const ehDinheiro = p.forma === "DINHEIRO";
              const saldoDepois = Math.round((saldoAntes - (ehDinheiro ? p.valor : 0)) * 100) / 100;
              const sufixoForma = splitEstorno.length > 1 ? ` (${p.forma})` : "";
              await tx.movimentacaoCaixa.create({
                data: {
                  caixaId: atual.caixaId,
                  userId: req.user.sub,
                  tipo: "ESTORNO_VENDA",
                  formaPagamento: p.forma,
                  valor: p.valor,
                  descricao: `REABERTURA VENDA #${atual.numero} (TROCA DE FORMA)${sufixoForma}`,
                  saldoAntes,
                  saldoDepois,
                  vendaId: atual.id,
                },
              });
            }
          }
        }

        return tx.venda.update({
          where: { id },
          data: { status: "EM_EDICAO" },
          include: INCLUDE_DETALHE,
        });
      }, TX_OPTS);

      res.json(venda);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

// Refinaliza uma venda EM_EDICAO com (eventualmente) nova forma de pagamento.
// Body: { formaPagamento, gerarContaReceber? }. Re-registra a venda no caixa
// de origem (se aberto) e gera nova ContaReceber quando a forma a prazo
// for selecionada. Volta o status para CONCLUIDA.
export async function refinalizar(req, res, next) {
  try {
    const id = req.params.id;
    const { gerarContaReceber } = req.body;

    try {
      await exigirAutorizacaoGerencial(req);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      throw err;
    }

    let configConta = null;
    if (gerarContaReceber) {
      const venc = parseDate(gerarContaReceber.vencimento);
      if (!venc) return res.status(400).json({ erro: "Vencimento da conta a receber invalido" });
      const parcelas = parseInt(gerarContaReceber.parcelas, 10) || 1;
      if (parcelas < 1 || parcelas > 60) {
        return res.status(400).json({ erro: "Numero de parcelas deve estar entre 1 e 60" });
      }
      configConta = {
        vencimento: venc,
        parcelas,
        descricaoCustom: gerarContaReceber.descricao
          ? String(gerarContaReceber.descricao).trim().toUpperCase().slice(0, 200)
          : null,
        observacoesConta: gerarContaReceber.observacoes
          ? String(gerarContaReceber.observacoes).trim().toUpperCase().slice(0, 500)
          : null,
      };
    }

    try {
      const venda = await prisma.$transaction(async (tx) => {
        const atual = await tx.venda.findUnique({
          where: { id },
          include: { cliente: { select: { nome: true } } },
        });
        if (!atual) {
          const e = new Error("Venda nao encontrada"); e.status = 404; throw e;
        }
        if (atual.status !== "EM_EDICAO") {
          const e = new Error(
            `So e possivel refinalizar vendas EM_EDICAO (status atual: ${atual.status})`
          );
          e.status = 400; throw e;
        }

        // Normaliza o split de pagamentos com base no total ja existente da
        // venda (refinalizar nao recalcula itens/desconto — so a forma de
        // pagamento). Lanca 400 se invalido.
        const split = normalizarPagamentos(req.body, Number(atual.total));
        const { pagamentos: pagamentosNorm, formaPrincipal, valorAPrazo } = split;

        if (configConta && valorAPrazo <= 0) {
          const e = new Error("Nenhuma forma de pagamento do split permite gerar conta a receber");
          e.status = 400; throw e;
        }

        // Substitui o split antigo pelo novo. Como VendaPagamento esta com
        // onDelete: Cascade no FK de Venda, o deleteMany simples ja basta.
        await tx.vendaPagamento.deleteMany({ where: { vendaId: id } });
        for (const p of pagamentosNorm) {
          await tx.vendaPagamento.create({
            data: {
              vendaId: id,
              forma: p.forma,
              valor: p.valor,
              formaCustomNome: p.formaCustomNome,
              ordem: p.ordem,
            },
          });
        }

        const atualizada = await tx.venda.update({
          where: { id },
          data: { formaPagamento: formaPrincipal, status: "CONCLUIDA" },
        });

        // Re-registra a venda no caixa de origem se ele ainda esta aberto:
        // 1 movimentacao POR pagamento do split (so DINHEIRO afeta saldo).
        if (atual.caixaId) {
          const caixaVenda = await tx.caixa.findUnique({
            where: { id: atual.caixaId },
            select: { status: true, saldoInicial: true },
          });
          if (caixaVenda?.status === "ABERTO") {
            for (const p of pagamentosNorm) {
              const totais = await calcularTotaisCaixa(atual.caixaId, Number(caixaVenda.saldoInicial), tx);
              const saldoAntes = Math.round(totais.saldoEsperadoDinheiro * 100) / 100;
              const ehDinheiro = p.forma === "DINHEIRO";
              const saldoDepois = Math.round((saldoAntes + (ehDinheiro ? p.valor : 0)) * 100) / 100;
              const sufixoForma = pagamentosNorm.length > 1 ? ` (${p.forma})` : "";
              await tx.movimentacaoCaixa.create({
                data: {
                  caixaId: atual.caixaId,
                  userId: req.user.sub,
                  tipo: "VENDA",
                  formaPagamento: p.forma,
                  valor: p.valor,
                  descricao: `REFINALIZACAO VENDA #${atual.numero} (NOVA FORMA)${sufixoForma}`,
                  saldoAntes,
                  saldoDepois,
                  vendaId: atual.id,
                },
              });
            }
          }
        }

        if (configConta) {
          const nomeCliente = atual.cliente?.nome
            ? atual.cliente.nome.toUpperCase()
            : "CONSUMIDOR";
          const descricao = configConta.descricaoCustom
            || `VENDA #${atual.numero} - ${nomeCliente}`;
          const calc = calcularValores({
            valorBruto: valorAPrazo, juros: 0, multa: 0, desconto: 0,
          });
          if (!calc.ok) { const e = new Error(calc.erro); e.status = 400; throw e; }
          const serie = gerarSerieRecorrencia({
            tipoRecorrencia: configConta.parcelas > 1 ? "PARCELADA" : "NENHUMA",
            parcelaTotal: configConta.parcelas,
            valores: calc.valores,
            vencimento: configConta.vencimento,
            dadosBase: {
              descricao,
              clienteId: atual.clienteId || null,
              observacoes: configConta.observacoesConta
                || `GERADA NA REFINALIZACAO DA VENDA #${atual.numero}`,
            },
          });
          if (!serie.ok) { const e = new Error(serie.erro); e.status = 400; throw e; }
          for (const reg of serie.registros) {
            await tx.contaReceber.create({ data: { ...reg, vendaId: atual.id } });
          }
        }

        return tx.venda.findUnique({
          where: { id: atualizada.id },
          include: INCLUDE_DETALHE,
        });
      }, TX_OPTS);

      res.json(venda);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

export async function cancelar(req, res, next) {
  try {
    const id = req.params.id;
    try {
      const venda = await prisma.$transaction(async (tx) => {
        const atual = await tx.venda.findUnique({
          where: { id },
          include: { itens: true, contasReceber: true, pagamentos: true },
        });
        if (!atual) {
          const e = new Error("Venda nao encontrada"); e.status = 404; throw e;
        }
        if (atual.status === "CANCELADA") {
          const e = new Error("Venda ja esta cancelada"); e.status = 400; throw e;
        }

        // Bloqueia cancelamento se alguma ContaReceber vinculada ja foi
        // recebida (dinheiro entrou no caixa). Usuario precisa reabrir
        // a conta no Financeiro antes de estornar a venda.
        const contasPagas = atual.contasReceber.filter(c => c.status === "PAGA");
        if (contasPagas.length > 0) {
          const e = new Error(
            `Esta venda possui ${contasPagas.length} conta(s) ja recebida(s). ` +
            `Reabra-a(s) no Financeiro antes de cancelar.`
          );
          e.status = 400; throw e;
        }

        // Cancela contas a receber pendentes/atrasadas vinculadas.
        const idsCancelar = atual.contasReceber
          .filter(c => c.status === "PENDENTE" || c.status === "ATRASADA")
          .map(c => c.id);
        if (idsCancelar.length > 0) {
          await tx.contaReceber.updateMany({
            where: { id: { in: idsCancelar } },
            data: { status: "CANCELADA" },
          });
        }

        const cancelada = await tx.venda.update({
          where: { id },
          data: { status: "CANCELADA" },
          include: INCLUDE_DETALHE,
        });

        // Estorno no caixa: 1 movimentacao POR pagamento do split (so DINHEIRO
        // afeta saldo). Se o caixa ja foi fechado, a divergencia fica como
        // "ajuste pos-fechamento" no proprio extrato.
        const splitEstorno = atual.pagamentos.length > 0
          ? atual.pagamentos.map(p => ({ forma: p.forma, valor: Number(p.valor) }))
          : [{ forma: atual.formaPagamento, valor: Number(atual.total) }];

        if (atual.caixaId) {
          const caixaVenda = await tx.caixa.findUnique({
            where: { id: atual.caixaId },
            select: { status: true, userId: true, saldoInicial: true },
          });
          if (caixaVenda?.status === "ABERTO") {
            for (const p of splitEstorno) {
              const totais = await calcularTotaisCaixa(atual.caixaId, Number(caixaVenda.saldoInicial), tx);
              const saldoAntes = Math.round(totais.saldoEsperadoDinheiro * 100) / 100;
              const ehDinheiro = p.forma === "DINHEIRO";
              const saldoDepois = Math.round((saldoAntes - (ehDinheiro ? p.valor : 0)) * 100) / 100;
              const sufixoForma = splitEstorno.length > 1 ? ` (${p.forma})` : "";
              await tx.movimentacaoCaixa.create({
                data: {
                  caixaId: atual.caixaId,
                  userId: req.user.sub,
                  tipo: "ESTORNO_VENDA",
                  formaPagamento: p.forma,
                  valor: p.valor,
                  descricao: `ESTORNO VENDA #${atual.numero}${sufixoForma}`,
                  saldoAntes,
                  saldoDepois,
                  vendaId: atual.id,
                },
              });
            }
          }
        }

        // Estorno: cria ENTRADA para cada item e devolve ao estoque.
        // Servicos nao tem estoque a estornar — pulam silenciosamente.
        for (const it of atual.itens) {
          const prod = await tx.produto.findUnique({ where: { id: it.produtoId } });
          if (prod.tipoItem === "SERVICO") continue;
          const antes = Number(prod.estoque);
          const qtdItem = Number(it.quantidade);
          const depois = arredQtd(antes + qtdItem);
          await tx.produto.update({
            where: { id: it.produtoId },
            data: { estoque: depois },
          });
          await tx.movimentacaoEstoque.create({
            data: {
              tipo: "ENTRADA",
              quantidade: qtdItem,
              estoqueAntes: antes,
              estoqueDepois: depois,
              motivo: `CANCELAMENTO VENDA #${atual.numero}`,
              produtoId: it.produtoId,
              userId: req.user.sub,
            },
          });
        }

        return cancelada;
      }, TX_OPTS);

      res.json(venda);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      throw err;
    }
  } catch (err) {
    next(err);
  }
}
