import prisma from "../lib/prisma.js";
import { exigirCaixaAberto, registrarNoCaixaAberto } from "./caixaController.js";
import { criarComNumeroRetry } from "../lib/proximoNumero.js";

const TIPOS_VALIDOS = new Set(["ORCAMENTO", "ORDEM_SERVICO"]);
const STATUS_VALIDOS = new Set([
  "RASCUNHO", "AGUARDANDO_APROVACAO", "APROVADO", "REJEITADO", "ENTREGUE", "CANCELADO",
]);
const TABELAS_VALIDAS = new Set(["AV", "PZ", "AT"]);
const FORMAS_VALIDAS = new Set([
  "DINHEIRO", "CARTAO_CREDITO", "CARTAO_DEBITO", "PIX", "BOLETO", "CREDIARIO",
]);

// Status que ainda permitem edicao livre dos itens. Apos aprovacao,
// alteracoes sao bloqueadas (a O.S. ja "saiu" para producao).
const STATUS_EDITAVEIS = new Set(["RASCUNHO", "AGUARDANDO_APROVACAO"]);

const INCLUDE_LISTA = {
  cliente: { select: { id: true, nome: true, cpfCnpj: true } },
  user: { select: { id: true, nome: true } },
  responsavel: { select: { id: true, nome: true } },
  _count: { select: { itens: true } },
};

const INCLUDE_DETALHE = {
  cliente: {
    select: { id: true, nome: true, cpfCnpj: true, telefone: true, email: true, endereco: true, cidade: true },
  },
  user: { select: { id: true, nome: true, role: true } },
  responsavel: { select: { id: true, nome: true } },
  venda: { select: { id: true, numero: true, createdAt: true, total: true, status: true } },
  itens: {
    orderBy: { ordem: "asc" },
    include: {
      produto: {
        select: { id: true, codigo: true, referencia: true, nome: true, unidade: true, tipoItem: true, precoVenda: true },
      },
    },
  },
};

function toNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function arred(v, casas = 2) {
  const m = Math.pow(10, casas);
  return Math.round(Number(v) * m) / m;
}

function up(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.toUpperCase() : null;
}

function trimOrNull(v, max = 500) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

// Normaliza UM item recebido do front. Retorna { ok, erro?, dados? } onde
// dados ja contem o subtotal calculado e a descricao snapshot. O calculo
// segue a tela original:
//   * Se largura > 0 E altura > 0 -> totalEm = largura*altura, e o
//     subtotal e (totalEm * valorUnitario * quantidade) + acertoTotal
//   * Caso contrario -> subtotal = quantidade * valorUnitario
function normalizarItem(it, idx, mapaProdutos) {
  const i = idx + 1;
  if (!it?.produtoId) return { ok: false, erro: `Item ${i}: produtoId obrigatorio` };

  const produto = mapaProdutos.get(it.produtoId);
  if (!produto) return { ok: false, erro: `Item ${i}: produto nao encontrado` };
  if (!produto.ativo) return { ok: false, erro: `Item ${i}: produto "${produto.nome}" inativo` };

  const qtd = toNumber(it.quantidade);
  if (qtd === null || Number.isNaN(qtd) || qtd <= 0) {
    return { ok: false, erro: `Item ${i}: quantidade deve ser > 0` };
  }

  const valorUnitario = toNumber(it.valorUnitario);
  if (valorUnitario === null || Number.isNaN(valorUnitario) || valorUnitario < 0) {
    return { ok: false, erro: `Item ${i}: valor unitario invalido` };
  }

  const largura = toNumber(it.largura);
  const altura = toNumber(it.altura);
  const acertoTotal = toNumber(it.acertoTotal) || 0;

  let totalEm = 0;
  let subtotal;
  if (largura !== null && altura !== null && !Number.isNaN(largura) && !Number.isNaN(altura)
      && largura > 0 && altura > 0) {
    totalEm = arred(largura * altura, 4);
    subtotal = arred(totalEm * valorUnitario * qtd + acertoTotal, 2);
  } else {
    subtotal = arred(qtd * valorUnitario + acertoTotal, 2);
  }

  return {
    ok: true,
    dados: {
      produtoId: it.produtoId,
      descricao: trimOrNull(it.descricao, 200) || produto.nome,
      quantidade: qtd,
      valorUnitario: arred(valorUnitario, 4),
      largura: largura !== null && !Number.isNaN(largura) ? arred(largura, 3) : null,
      altura: altura !== null && !Number.isNaN(altura) ? arred(altura, 3) : null,
      totalEm,
      acertoTotal: arred(acertoTotal, 2),
      subtotal,
      formato: trimOrNull(it.formato, 100),
      vias: trimOrNull(it.vias, 50),
      cores: trimOrNull(it.cores, 50),
      complemento: trimOrNull(it.complemento, 500),
      ordem: Number.isFinite(parseInt(it.ordem, 10)) ? parseInt(it.ordem, 10) : idx,
      tipoItem: produto.tipoItem,
    },
  };
}

// Calcula os totais agregados. Servicos somam em valorServicos; produtos
// em valorProdutos. Total = produtos + servicos + deslocamento - desconto
// (nao deixa negativo).
function calcularTotais(itens, deslocamento, desconto) {
  let valorProdutos = 0;
  let valorServicos = 0;
  for (const it of itens) {
    if (it.tipoItem === "SERVICO") valorServicos += it.subtotal;
    else valorProdutos += it.subtotal;
  }
  valorProdutos = arred(valorProdutos, 2);
  valorServicos = arred(valorServicos, 2);
  const total = arred(Math.max(0, valorProdutos + valorServicos + (deslocamento || 0) - (desconto || 0)), 2);
  return { valorProdutos, valorServicos, total };
}

// ===================== LISTAR / OBTER =====================

export async function listar(req, res, next) {
  try {
    const { clienteId, status, tipo, dataInicio, dataFim, search, limite } = req.query;
    const where = {};
    if (clienteId) where.clienteId = clienteId;
    if (status && STATUS_VALIDOS.has(status)) where.status = status;
    if (tipo && TIPOS_VALIDOS.has(tipo)) where.tipo = tipo;
    if (dataInicio || dataFim) {
      where.createdAt = {};
      if (dataInicio) where.createdAt.gte = new Date(dataInicio);
      if (dataFim) where.createdAt.lte = new Date(dataFim + "T23:59:59.999Z");
    }
    if (search) {
      const s = String(search).trim();
      // numero pode vir como "#822" — tira o # e tenta parse
      const limpo = s.replace(/^#/, "");
      const numeroBusca = parseInt(limpo, 10);
      where.OR = [
        { descricaoCliente: { contains: s, mode: "insensitive" } },
        { contato: { contains: s, mode: "insensitive" } },
        { cliente: { nome: { contains: s, mode: "insensitive" } } },
      ];
      if (Number.isFinite(numeroBusca)) where.OR.push({ numero: numeroBusca });
    }
    const take = Math.min(parseInt(limite, 10) || 100, 500);
    const orcamentos = await prisma.orcamento.findMany({
      where,
      include: INCLUDE_LISTA,
      orderBy: { createdAt: "desc" },
      take,
    });
    res.json(orcamentos);
  } catch (err) {
    next(err);
  }
}

export async function obter(req, res, next) {
  try {
    const orc = await prisma.orcamento.findUnique({
      where: { id: req.params.id },
      include: INCLUDE_DETALHE,
    });
    if (!orc) return res.status(404).json({ erro: "Orcamento nao encontrado" });
    res.json(orc);
  } catch (err) {
    next(err);
  }
}

// ===================== CRIAR =====================

export async function criar(req, res, next) {
  try {
    const {
      tipo, tabelaPreco, clienteId, descricaoCliente, contato, telefone,
      observacoes, imprimirObservacoes, rodape,
      mostrarValorMetro, imprimirValores,
      via, deslocamento, desconto,
      formaCondicaoPagamento, responsavelId, itens, status,
    } = req.body;

    if (tipo && !TIPOS_VALIDOS.has(tipo)) {
      return res.status(400).json({ erro: "Tipo invalido (use ORCAMENTO ou ORDEM_SERVICO)" });
    }
    if (tabelaPreco && !TABELAS_VALIDAS.has(tabelaPreco)) {
      return res.status(400).json({ erro: "Tabela de preco invalida (use AV, PZ ou AT)" });
    }
    const statusInicial = status && STATUS_VALIDOS.has(status) ? status : "RASCUNHO";
    if (statusInicial !== "RASCUNHO" && statusInicial !== "AGUARDANDO_APROVACAO") {
      return res.status(400).json({ erro: "Status inicial deve ser RASCUNHO ou AGUARDANDO_APROVACAO" });
    }
    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: "Informe ao menos um item" });
    }

    const desl = toNumber(deslocamento) || 0;
    const desc = toNumber(desconto) || 0;
    if (desl < 0) return res.status(400).json({ erro: "Deslocamento nao pode ser negativo" });
    if (desc < 0) return res.status(400).json({ erro: "Desconto nao pode ser negativo" });

    const viaNum = parseInt(via, 10);
    const viaFinal = viaNum === 1 || viaNum === 2 ? viaNum : 1;

    try {
      const orc = await prisma.$transaction(async (tx) => {
        if (clienteId) {
          const c = await tx.cliente.findUnique({ where: { id: clienteId } });
          if (!c) { const e = new Error("Cliente nao encontrado"); e.status = 404; throw e; }
        }
        if (responsavelId) {
          const r = await tx.user.findUnique({ where: { id: responsavelId } });
          if (!r) { const e = new Error("Responsavel nao encontrado"); e.status = 404; throw e; }
        }

        const ids = [...new Set(itens.map(i => i.produtoId).filter(Boolean))];
        const produtos = await tx.produto.findMany({ where: { id: { in: ids } } });
        const mapa = new Map(produtos.map(p => [p.id, p]));

        const itensNorm = [];
        for (let i = 0; i < itens.length; i++) {
          const r = normalizarItem(itens[i], i, mapa);
          if (!r.ok) { const e = new Error(r.erro); e.status = 400; throw e; }
          itensNorm.push(r.dados);
        }

        const totais = calcularTotais(itensNorm, desl, desc);

        const criado = await criarComNumeroRetry(tx.orcamento, req.tenantId, (numero) =>
          tx.orcamento.create({
            data: {
              numero,
              tipo: tipo || "ORCAMENTO",
              status: statusInicial,
              tabelaPreco: tabelaPreco || "AV",
              clienteId: clienteId || null,
              descricaoCliente: up(descricaoCliente),
              contato: up(contato),
              telefone: trimOrNull(telefone, 50),
              via: viaFinal,
              observacoes: up(observacoes),
              imprimirObservacoes: imprimirObservacoes === false ? false : true,
              rodape: up(rodape),
              mostrarValorMetro: !!mostrarValorMetro,
              imprimirValores: imprimirValores === false ? false : true,
              valorProdutos: totais.valorProdutos,
              valorServicos: totais.valorServicos,
              deslocamento: arred(desl, 2),
              desconto: arred(desc, 2),
              total: totais.total,
              formaCondicaoPagamento: up(formaCondicaoPagamento),
              userId: req.user.sub,
              responsavelId: responsavelId || null,
              itens: {
                create: itensNorm.map((it) => {
                  // remove tipoItem antes de salvar (campo so usado no calculo)
                  const { tipoItem, ...rest } = it;
                  return rest;
                }),
              },
            },
            include: INCLUDE_DETALHE,
          })
        );

        return criado;
      });

      res.status(201).json(orc);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

// ===================== ATUALIZAR (substitui itens) =====================

export async function atualizar(req, res, next) {
  try {
    const id = req.params.id;
    const {
      tipo, tabelaPreco, clienteId, descricaoCliente, contato, telefone,
      observacoes, imprimirObservacoes, rodape,
      mostrarValorMetro, imprimirValores,
      via, deslocamento, desconto,
      formaCondicaoPagamento, responsavelId, itens,
    } = req.body;

    try {
      const atualizado = await prisma.$transaction(async (tx) => {
        const atual = await tx.orcamento.findUnique({ where: { id } });
        if (!atual) { const e = new Error("Orcamento nao encontrado"); e.status = 404; throw e; }
        if (!STATUS_EDITAVEIS.has(atual.status)) {
          const e = new Error(`Orcamento com status "${atual.status}" nao pode mais ser editado`);
          e.status = 400; throw e;
        }

        if (tipo && !TIPOS_VALIDOS.has(tipo)) {
          const e = new Error("Tipo invalido"); e.status = 400; throw e;
        }
        if (tabelaPreco && !TABELAS_VALIDAS.has(tabelaPreco)) {
          const e = new Error("Tabela de preco invalida"); e.status = 400; throw e;
        }

        const desl = toNumber(deslocamento);
        const desc = toNumber(desconto);
        if (desl !== null && (Number.isNaN(desl) || desl < 0)) {
          const e = new Error("Deslocamento invalido"); e.status = 400; throw e;
        }
        if (desc !== null && (Number.isNaN(desc) || desc < 0)) {
          const e = new Error("Desconto invalido"); e.status = 400; throw e;
        }

        if (clienteId) {
          const c = await tx.cliente.findUnique({ where: { id: clienteId } });
          if (!c) { const e = new Error("Cliente nao encontrado"); e.status = 404; throw e; }
        }
        if (responsavelId) {
          const r = await tx.user.findUnique({ where: { id: responsavelId } });
          if (!r) { const e = new Error("Responsavel nao encontrado"); e.status = 404; throw e; }
        }

        // Itens: se vieram, substituem todos; se nao vieram, mantem.
        let totais = {
          valorProdutos: Number(atual.valorProdutos),
          valorServicos: Number(atual.valorServicos),
          total: Number(atual.total),
        };
        let recalcular = false;

        if (Array.isArray(itens)) {
          if (itens.length === 0) {
            const e = new Error("Informe ao menos um item"); e.status = 400; throw e;
          }
          const ids = [...new Set(itens.map(i => i.produtoId).filter(Boolean))];
          const produtos = await tx.produto.findMany({ where: { id: { in: ids } } });
          const mapa = new Map(produtos.map(p => [p.id, p]));

          const itensNorm = [];
          for (let i = 0; i < itens.length; i++) {
            const r = normalizarItem(itens[i], i, mapa);
            if (!r.ok) { const e = new Error(r.erro); e.status = 400; throw e; }
            itensNorm.push(r.dados);
          }

          await tx.itemOrcamento.deleteMany({ where: { orcamentoId: id } });
          for (const it of itensNorm) {
            const { tipoItem, ...rest } = it;
            await tx.itemOrcamento.create({ data: { ...rest, orcamentoId: id } });
          }

          totais = calcularTotais(
            itensNorm,
            desl !== null ? desl : Number(atual.deslocamento),
            desc !== null ? desc : Number(atual.desconto),
          );
          recalcular = true;
        } else if (desl !== null || desc !== null) {
          // soh deslocamento/desconto mudou: recalcula com itens existentes
          const itensExistentes = await tx.itemOrcamento.findMany({
            where: { orcamentoId: id },
            include: { produto: { select: { tipoItem: true } } },
          });
          const para = itensExistentes.map(it => ({
            tipoItem: it.produto.tipoItem,
            subtotal: Number(it.subtotal),
          }));
          totais = calcularTotais(
            para,
            desl !== null ? desl : Number(atual.deslocamento),
            desc !== null ? desc : Number(atual.desconto),
          );
          recalcular = true;
        }

        const dataUpdate = {};
        if (tipo) dataUpdate.tipo = tipo;
        if (tabelaPreco) dataUpdate.tabelaPreco = tabelaPreco;
        if (clienteId !== undefined) dataUpdate.clienteId = clienteId || null;
        if (descricaoCliente !== undefined) dataUpdate.descricaoCliente = up(descricaoCliente);
        if (contato !== undefined) dataUpdate.contato = up(contato);
        if (telefone !== undefined) dataUpdate.telefone = trimOrNull(telefone, 50);
        if (observacoes !== undefined) dataUpdate.observacoes = up(observacoes);
        if (typeof imprimirObservacoes === "boolean") dataUpdate.imprimirObservacoes = imprimirObservacoes;
        if (rodape !== undefined) dataUpdate.rodape = up(rodape);
        if (typeof mostrarValorMetro === "boolean") dataUpdate.mostrarValorMetro = mostrarValorMetro;
        if (typeof imprimirValores === "boolean") dataUpdate.imprimirValores = imprimirValores;
        if (via !== undefined) {
          const viaNum = parseInt(via, 10);
          dataUpdate.via = viaNum === 1 || viaNum === 2 ? viaNum : atual.via;
        }
        if (formaCondicaoPagamento !== undefined) dataUpdate.formaCondicaoPagamento = up(formaCondicaoPagamento);
        if (responsavelId !== undefined) dataUpdate.responsavelId = responsavelId || null;

        if (desl !== null) dataUpdate.deslocamento = arred(desl, 2);
        if (desc !== null) dataUpdate.desconto = arred(desc, 2);

        if (recalcular) {
          dataUpdate.valorProdutos = totais.valorProdutos;
          dataUpdate.valorServicos = totais.valorServicos;
          dataUpdate.total = totais.total;
        }

        const upd = await tx.orcamento.update({
          where: { id },
          data: dataUpdate,
          include: INCLUDE_DETALHE,
        });
        return upd;
      });

      res.json(atualizado);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

// ===================== TRANSICOES DE STATUS =====================

// Matriz simples de transicoes permitidas. Mantemos enxuto: o front
// expoe somente as acoes validas para o estado atual.
const TRANSICOES = {
  RASCUNHO: ["AGUARDANDO_APROVACAO", "CANCELADO"],
  AGUARDANDO_APROVACAO: ["APROVADO", "REJEITADO", "CANCELADO", "RASCUNHO"],
  APROVADO: ["ENTREGUE", "CANCELADO"],
  REJEITADO: ["RASCUNHO"],
  ENTREGUE: [],
  CANCELADO: [],
};

export async function alterarStatus(req, res, next) {
  try {
    const { status: novoStatus, motivo } = req.body || {};
    if (!STATUS_VALIDOS.has(novoStatus)) {
      return res.status(400).json({ erro: "Status invalido" });
    }
    try {
      const atualizado = await prisma.$transaction(async (tx) => {
        const atual = await tx.orcamento.findUnique({ where: { id: req.params.id } });
        if (!atual) { const e = new Error("Orcamento nao encontrado"); e.status = 404; throw e; }
        const permitidos = TRANSICOES[atual.status] || [];
        if (!permitidos.includes(novoStatus)) {
          const e = new Error(`Transicao invalida: ${atual.status} -> ${novoStatus}`);
          e.status = 400; throw e;
        }

        const dataUpdate = { status: novoStatus };
        const agora = new Date();
        if (novoStatus === "APROVADO") dataUpdate.dataAprovacao = agora;
        if (novoStatus === "REJEITADO") {
          dataUpdate.dataRejeicao = agora;
          dataUpdate.motivoRejeicao = trimOrNull(motivo, 500);
        }
        if (novoStatus === "CANCELADO") {
          dataUpdate.dataCancelamento = agora;
          dataUpdate.motivoCancelamento = trimOrNull(motivo, 500);
        }
        if (novoStatus === "RASCUNHO") {
          // limpa marcas anteriores se voltou pra rascunho
          dataUpdate.dataRejeicao = null;
          dataUpdate.motivoRejeicao = null;
        }

        return tx.orcamento.update({
          where: { id: atual.id },
          data: dataUpdate,
          include: INCLUDE_DETALHE,
        });
      });
      res.json(atualizado);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

// ===================== CONVERTER EM VENDA (FINALIZAR O.S.) =====================
//
// Transforma o orcamento APROVADO em uma venda real. Baixa o estoque dos
// produtos (servicos sao ignorados) e registra no caixa aberto. Marca o
// orcamento como ENTREGUE com vendaId apontando para a venda criada.
// Requer caixa aberto (mesma regra do PDV).

export async function converterEmVenda(req, res, next) {
  try {
    const { formaPagamento } = req.body || {};
    if (!formaPagamento || !FORMAS_VALIDAS.has(formaPagamento)) {
      return res.status(400).json({ erro: "Forma de pagamento invalida" });
    }

    try {
      const caixaAtivo = await exigirCaixaAberto(req.user.sub);

      const resultado = await prisma.$transaction(async (tx) => {
        const orc = await tx.orcamento.findUnique({
          where: { id: req.params.id },
          include: { itens: { include: { produto: true } } },
        });
        if (!orc) { const e = new Error("Orcamento nao encontrado"); e.status = 404; throw e; }
        if (orc.vendaId) {
          const e = new Error("Este orcamento ja foi convertido em venda"); e.status = 400; throw e;
        }
        if (orc.status !== "APROVADO") {
          const e = new Error("Apenas orcamentos APROVADOS podem ser convertidos em venda");
          e.status = 400; throw e;
        }

        // Valida estoque para itens do tipo PRODUTO. Quantidade pode ser
        // decimal (m, kg) — convertemos pra inteiro arredondando pra cima
        // antes de bater com o estoque (estoque sempre inteiro).
        for (const it of orc.itens) {
          const p = it.produto;
          if (p.tipoItem === "SERVICO") continue;
          const qtdInt = Math.ceil(Number(it.quantidade));
          if (p.estoque < qtdInt) {
            const e = new Error(`Estoque insuficiente de "${p.nome}". Disponivel: ${p.estoque}, solicitado: ${qtdInt}`);
            e.status = 400; throw e;
          }
        }

        const total = Number(orc.total);
        const desconto = Number(orc.desconto);

        const venda = await criarComNumeroRetry(tx.venda, req.tenantId, (numero) =>
          tx.venda.create({
            data: {
              numero,
              clienteId: orc.clienteId,
              userId: req.user.sub,
              caixaId: caixaAtivo.id,
              formaPagamento,
              status: "CONCLUIDA",
              desconto,
              total,
              observacoes: `Gerada do orcamento #${orc.numero}`,
              itens: {
                create: orc.itens.map((it) => {
                  const qtdInt = Math.max(1, Math.ceil(Number(it.quantidade)));
                  const subtotal = Number(it.subtotal);
                  return {
                    produtoId: it.produtoId,
                    quantidade: qtdInt,
                    // Preco unitario calculado a partir do subtotal/qtd para
                    // que (qtd * preco) bata com o subtotal do item.
                    precoUnitario: arred(subtotal / qtdInt, 2),
                    subtotal: arred(subtotal, 2),
                  };
                }),
              },
            },
            include: { itens: true },
          })
        );

        await registrarNoCaixaAberto(tx, req.user.sub, {
          tipo: "VENDA",
          formaPagamento,
          valor: total,
          descricao: `VENDA #${venda.numero} (Orc. #${orc.numero})`,
          vendaId: venda.id,
        });

        // Baixa de estoque + movimentacoes
        for (const it of orc.itens) {
          const p = it.produto;
          if (p.tipoItem === "SERVICO") continue;
          const qtdInt = Math.ceil(Number(it.quantidade));
          const antes = p.estoque;
          const depois = antes - qtdInt;
          await tx.produto.update({
            where: { id: p.id },
            data: { estoque: depois },
          });
          await tx.movimentacaoEstoque.create({
            data: {
              tipo: "SAIDA",
              quantidade: qtdInt,
              estoqueAntes: antes,
              estoqueDepois: depois,
              motivo: `VENDA #${venda.numero} (Orc. #${orc.numero})`,
              produtoId: p.id,
              userId: req.user.sub,
            },
          });
        }

        const orcAtualizado = await tx.orcamento.update({
          where: { id: orc.id },
          data: {
            status: "ENTREGUE",
            dataEntrega: new Date(),
            vendaId: venda.id,
          },
          include: INCLUDE_DETALHE,
        });

        return { orcamento: orcAtualizado, venda };
      });

      res.status(201).json(resultado);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

// ===================== EXCLUIR =====================

export async function excluir(req, res, next) {
  try {
    const orc = await prisma.orcamento.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, vendaId: true },
    });
    if (!orc) return res.status(404).json({ erro: "Orcamento nao encontrado" });
    if (orc.vendaId) {
      return res.status(400).json({
        erro: "Orcamento ja convertido em venda — cancele a venda no PDV antes de excluir",
      });
    }
    // Itens caem em cascata (onDelete: Cascade)
    await prisma.orcamento.delete({ where: { id: orc.id } });
    res.status(204).send();
  } catch (err) {
    if (err.code === "P2025") {
      return res.status(404).json({ erro: "Orcamento nao encontrado" });
    }
    next(err);
  }
}
