// ============ ENTRADA DE NF-e DE FORNECEDOR (importacao de compra) ============
//
// Fluxo: upload do XML -> validacao (buffer) -> staging RECEBIDA -> conciliacao
// (de-para fornecedor/produtos) -> efetivar (vira Compra + estoque + ContaPagar).
//
//   POST /fiscal/entrada              upload+valida+stage do XML
//   GET  /fiscal/entrada              lista as notas em staging
//   GET  /fiscal/entrada/:id          detalhe + sugestoes de de-para
//   POST /fiscal/entrada/:id/efetivar transforma em Compra (transacao)
//   POST /fiscal/entrada/:id/descartar marca DESCARTADA
//
// Reusa o padrao do compraController (criarComNumeroRetry + estoque +
// MovimentacaoEstoque ENTRADA + ContaPagar) na efetivacao.

import prisma from "../lib/prisma.js";
import { validarEntradaNfe } from "../lib/fiscal/validarEntradaNfe.js";
import { casarItens, contarPendentes } from "../lib/fiscal/casarEntrada.js";
import { criarComNumeroRetry } from "../lib/proximoNumero.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const arredQtd = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

// Casa o emitente da NF-e a um Fornecedor por CNPJ comparando SO os digitos:
// o XML traz o CNPJ sem mascara, mas o cadastro pode te-lo salvo com pontos/
// barra. Cobrimos os dois formatos comuns (digitos puros e XX.XXX.XXX/XXXX-XX)
// num unico findFirst indexado, sem varrer a tabela.
async function acharFornecedorPorCnpj(cnpjDigitos) {
  if (!cnpjDigitos || cnpjDigitos.length !== 14) return null;
  const mascarado = cnpjDigitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return prisma.fornecedor.findFirst({ where: { cnpj: { in: [cnpjDigitos, mascarado] } } });
}

// Monta os mapas de lookup do tenant e devolve as sugestoes de de-para + o
// detalhe dos produtos sugeridos (p/ a UI montar a tela de conciliacao).
async function montarConciliacao(nota) {
  const dados = nota.dadosJson || {};
  const itens = Array.isArray(dados.itens) ? dados.itens : [];

  // 1. memoria de-para do fornecedor (se ja conhecido)
  const dePara = new Map();
  if (nota.fornecedorId) {
    const vinculos = await prisma.deParaProdutoFornecedor.findMany({
      where: { fornecedorId: nota.fornecedorId },
      select: { cProdFornecedor: true, produtoId: true },
    });
    for (const v of vinculos) dePara.set(String(v.cProdFornecedor), v.produtoId);
  }

  // 2. lookup por GTIN e por codigo (uma query cada, com os valores do XML)
  const eans = itens.map((i) => i.cEAN).filter(Boolean);
  const cprods = itens.map((i) => i.cProdFornecedor).filter(Boolean);
  const porEan = new Map();
  const porCodigo = new Map();
  if (eans.length) {
    const ps = await prisma.produto.findMany({
      where: { codigoBarras: { in: eans } }, select: { id: true, codigoBarras: true },
    });
    for (const p of ps) if (p.codigoBarras) porEan.set(String(p.codigoBarras), p.id);
  }
  if (cprods.length) {
    const ps = await prisma.produto.findMany({
      where: { codigo: { in: cprods } }, select: { id: true, codigo: true },
    });
    for (const p of ps) porCodigo.set(String(p.codigo), p.id);
  }

  const sugestoes = casarItens(itens, { dePara, porEan, porCodigo });

  // 3. detalhe dos produtos sugeridos (nome/codigo/preco/estoque) p/ exibir
  const ids = [...new Set(sugestoes.map((s) => s.produtoIdSugerido).filter(Boolean))];
  const produtosPorId = {};
  if (ids.length) {
    const ps = await prisma.produto.findMany({
      where: { id: { in: ids } },
      select: { id: true, codigo: true, nome: true, unidade: true, precoVenda: true, precoCusto: true, estoque: true },
    });
    for (const p of ps) produtosPorId[p.id] = p;
  }

  // Junta sugestao + dado bruto do item p/ a UI nao precisar cruzar
  const itensConciliacao = itens.map((it, i) => ({
    ...it,
    sugestao: sugestoes[i],
    produtoSugerido: sugestoes[i].produtoIdSugerido ? produtosPorId[sugestoes[i].produtoIdSugerido] || null : null,
  }));

  return { itens: itensConciliacao, pendentes: contarPendentes(sugestoes) };
}

// Valida um XML de NF-e de entrada e materializa uma NotaFiscalEntrada RECEBIDA
// (ou devolve a existente — idempotente pela chave). Reusado pelo upload manual
// e pela distribuicao DF-e (dfeController.baixarDFe). Lanca Error com .status=422
// se o XML reprovar na validacao. Escopo de request (tenant via extension).
export async function materializarEntradaDoXml(xml, { userId = null } = {}) {
  const v = validarEntradaNfe(xml);
  if (!v.ok) {
    const e = new Error("XML da NF-e reprovado: " + [...new Set(v.erros.map((x) => x.msg))].join("; "));
    e.status = 422;
    throw e;
  }
  const dados = v.dados;
  const existente = await prisma.notaFiscalEntrada.findFirst({ where: { chaveAcesso: dados.chave } });
  if (existente) return { nota: existente, jaExistia: true, dados };

  let fornecedor = null;
  if (dados.emitente?.cnpj) fornecedor = await acharFornecedorPorCnpj(dados.emitente.cnpj);

  const nota = await prisma.notaFiscalEntrada.create({
    data: {
      chaveAcesso: dados.chave, status: "RECEBIDA",
      numero: dados.numero || null, serie: dados.serie || null,
      dataEmissao: dados.dataEmissao ? new Date(dados.dataEmissao) : null,
      emitenteCnpj: dados.emitente?.cnpj || null, emitenteNome: dados.emitente?.nome || null,
      valorTotal: dados.totais?.valorNota ?? null,
      xml, dadosJson: dados,
      fornecedorId: fornecedor?.id || null, userId,
    },
  });
  return { nota, jaExistia: false, dados };
}

// POST /fiscal/entrada — body: { xml }
export async function uploadEntrada(req, res, next) {
  try {
    const xml = req.body?.xml;
    if (!xml || typeof xml !== "string") {
      return res.status(400).json({ erro: "Envie o conteudo do XML da NF-e no campo 'xml'." });
    }

    // Buffer de validacao: bloqueia ANTES de persistir.
    const v = validarEntradaNfe(xml);
    if (!v.ok) {
      const lista = [...new Set(v.erros.map((e) => e.msg))];
      return res.status(422).json({
        erro: "NF-e reprovada na validacao: " + lista.join("; "),
        erros: v.erros,
      });
    }
    const dados = v.dados;
    const chave = dados.chave;

    // Idempotencia pela chave de acesso (escopo do tenant via extension).
    const existente = await prisma.notaFiscalEntrada.findFirst({ where: { chaveAcesso: chave } });
    if (existente) {
      if (existente.status === "IMPORTADA") {
        return res.status(409).json({
          erro: "Esta NF-e ja foi importada.", notaId: existente.id, compraId: existente.compraId,
        });
      }
      // Re-upload de uma nota ainda nao importada: devolve a existente.
      const conc = await montarConciliacao(existente);
      return res.json({ nota: existente, conciliacao: conc, aviso: "NF-e ja estava em processamento." });
    }

    // Tenta casar o fornecedor pelo CNPJ do emitente (so digitos, tolera mascara).
    let fornecedor = null;
    if (dados.emitente?.cnpj) {
      fornecedor = await acharFornecedorPorCnpj(dados.emitente.cnpj);
    }

    const nota = await prisma.notaFiscalEntrada.create({
      data: {
        chaveAcesso: chave,
        status: "RECEBIDA",
        numero: dados.numero || null,
        serie: dados.serie || null,
        dataEmissao: dados.dataEmissao ? new Date(dados.dataEmissao) : null,
        emitenteCnpj: dados.emitente?.cnpj || null,
        emitenteNome: dados.emitente?.nome || null,
        valorTotal: dados.totais?.valorNota ?? null,
        xml,
        dadosJson: dados,
        fornecedorId: fornecedor?.id || null,
        userId: req.user.sub,
      },
    });

    const conciliacao = await montarConciliacao(nota);
    res.status(201).json({
      nota,
      fornecedorEncontrado: fornecedor ? { id: fornecedor.id, nome: fornecedor.nome } : null,
      conciliacao,
    });
  } catch (err) {
    next(err);
  }
}

// GET /fiscal/entrada — lista (filtro opcional por status)
export async function listarEntradas(req, res, next) {
  try {
    const status = req.query?.status ? String(req.query.status) : undefined;
    const take = Math.min(Number(req.query?.limit) || 100, 500);
    const notas = await prisma.notaFiscalEntrada.findMany({
      where: { ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true, chaveAcesso: true, status: true, numero: true, serie: true,
        emitenteCnpj: true, emitenteNome: true, valorTotal: true, dataEmissao: true,
        fornecedorId: true, compraId: true, createdAt: true,
      },
    });
    res.json(notas);
  } catch (err) {
    next(err);
  }
}

// GET /fiscal/entrada/:id — detalhe + sugestoes de conciliacao
export async function obterEntrada(req, res, next) {
  try {
    const incluirXml = req.query?.xml === "1";
    const nota = await prisma.notaFiscalEntrada.findUnique({ where: { id: req.params.id } });
    if (!nota) return res.status(404).json({ erro: "NF-e de entrada nao encontrada." });
    const conciliacao = nota.status === "RECEBIDA" ? await montarConciliacao(nota) : null;
    if (!incluirXml) nota.xml = undefined;
    res.json({ nota, conciliacao });
  } catch (err) {
    next(err);
  }
}

// POST /fiscal/entrada/:id/efetivar
// body: { fornecedorId?, itens: [{ numero, produtoId, precoUnitario? }] }
// Transforma a NF-e em Compra (itens + estoque + ContaPagar das duplicatas),
// salva o de-para e marca IMPORTADA. Transacional e idempotente pela chave.
export async function efetivarEntrada(req, res, next) {
  try {
    const body = req.body || {};
    const itensBody = Array.isArray(body.itens) ? body.itens : [];
    if (!itensBody.length) {
      return res.status(400).json({ erro: "Informe o vinculo dos itens em 'itens'." });
    }
    const mapaBody = new Map(itensBody.map((i) => [Number(i.numero), i]));

    try {
      const resultado = await prisma.$transaction(async (tx) => {
        const nota = await tx.notaFiscalEntrada.findUnique({ where: { id: req.params.id } });
        if (!nota) { const e = new Error("NF-e de entrada nao encontrada."); e.status = 404; throw e; }
        if (nota.status === "IMPORTADA") {
          const compra = nota.compraId ? await tx.compra.findUnique({ where: { id: nota.compraId } }) : null;
          return { jaImportada: true, nota, compra };
        }
        if (nota.status === "DESCARTADA") { const e = new Error("NF-e descartada — nao pode ser importada."); e.status = 400; throw e; }

        const dados = nota.dadosJson || {};
        const itensNfe = Array.isArray(dados.itens) ? dados.itens : [];
        if (!itensNfe.length) { const e = new Error("NF-e sem itens."); e.status = 400; throw e; }

        const fornecedorId = body.fornecedorId || nota.fornecedorId;
        if (!fornecedorId) { const e = new Error("Informe o fornecedor (fornecedorId)."); e.status = 400; throw e; }
        const fornecedor = await tx.fornecedor.findUnique({ where: { id: fornecedorId } });
        if (!fornecedor) { const e = new Error("Fornecedor nao encontrado."); e.status = 404; throw e; }

        // Resolve cada item da NF-e -> produtoId + preco (XML e a fonte de qtd/preco).
        const itensNorm = [];
        for (const it of itensNfe) {
          const b = mapaBody.get(Number(it.numero));
          if (!b?.produtoId) {
            const e = new Error(`Item ${it.numero} (${it.descricao || "?"}) sem produto vinculado.`); e.status = 400; throw e;
          }
          const preco = b.precoUnitario != null ? round2(b.precoUnitario) : round2(it.valorUnitario);
          const qtd = arredQtd(it.quantidade);
          if (!(qtd > 0)) { const e = new Error(`Item ${it.numero}: quantidade invalida.`); e.status = 400; throw e; }
          if (!(preco >= 0)) { const e = new Error(`Item ${it.numero}: preco invalido.`); e.status = 400; throw e; }
          itensNorm.push({ numero: it.numero, produtoId: b.produtoId, cProdFornecedor: it.cProdFornecedor, cEAN: it.cEAN, quantidade: qtd, precoUnitario: preco });
        }

        const produtos = await tx.produto.findMany({ where: { id: { in: itensNorm.map((i) => i.produtoId) } } });
        const mapaProd = new Map(produtos.map((p) => [p.id, p]));
        for (const it of itensNorm) {
          const p = mapaProd.get(it.produtoId);
          if (!p) { const e = new Error(`Produto ${it.produtoId} nao encontrado.`); e.status = 404; throw e; }
          if (p.tipoItem === "SERVICO") { const e = new Error(`"${p.nome}" e um servico — nao pode entrar em compra.`); e.status = 400; throw e; }
        }

        const total = round2(itensNorm.reduce((a, it) => a + it.quantidade * it.precoUnitario, 0));

        const compra = await criarComNumeroRetry(tx.compra, req.tenantId, (numero) =>
          tx.compra.create({
            data: {
              numero, fornecedorId, total, desconto: 0,
              observacoes: `Importada da NF-e ${nota.numero || ""} (chave ${nota.chaveAcesso}).`.replace(/\s+/g, " ").trim(),
              itens: {
                create: itensNorm.map((it) => ({
                  produtoId: it.produtoId, quantidade: it.quantidade,
                  precoUnitario: it.precoUnitario, subtotal: round2(it.quantidade * it.precoUnitario),
                })),
              },
            },
          })
        );

        // Estoque + movimentacao ENTRADA + atualiza custo do produto.
        for (const it of itensNorm) {
          const p = mapaProd.get(it.produtoId);
          const antes = Number(p.estoque);
          const depois = arredQtd(antes + it.quantidade);
          await tx.produto.update({ where: { id: it.produtoId }, data: { estoque: depois, precoCusto: it.precoUnitario } });
          await tx.movimentacaoEstoque.create({
            data: {
              tipo: "ENTRADA", quantidade: it.quantidade, estoqueAntes: antes, estoqueDepois: depois,
              motivo: `NF-e entrada ${nota.numero || nota.chaveAcesso} (Compra #${compra.numero})`,
              produtoId: it.produtoId, userId: req.user.sub,
            },
          });
        }

        // ContaPagar a partir das duplicatas da NF-e (financeiro real do fornecedor).
        const dups = Array.isArray(dados.duplicatas) ? dados.duplicatas : [];
        let contasGeradas = 0;
        for (let i = 0; i < dups.length; i++) {
          const d = dups[i];
          const valor = round2(d.valor);
          if (!(valor > 0)) continue;
          const venc = d.vencimento ? new Date(d.vencimento) : new Date();
          if (Number.isNaN(venc.getTime())) continue;
          await tx.contaPagar.create({
            data: {
              descricao: `NF-e ${nota.numero || ""} ${fornecedor.nome} parc ${d.numero || i + 1}`.replace(/\s+/g, " ").trim().toUpperCase().slice(0, 200),
              valor, valorBruto: valor, vencimento: venc,
              fornecedorId, compraId: compra.id,
              parcelaAtual: dups.length > 1 ? i + 1 : null,
              parcelaTotal: dups.length > 1 ? dups.length : null,
              tipoRecorrencia: dups.length > 1 ? "PARCELADA" : "NENHUMA",
              observacoes: `GERADA PELA IMPORTACAO DA NF-e ${nota.chaveAcesso}`,
            },
          });
          contasGeradas++;
        }

        // Memoria de-para p/ as proximas NF-e do mesmo fornecedor virem casadas.
        for (const it of itensNorm) {
          if (!it.cProdFornecedor) continue;
          await tx.deParaProdutoFornecedor.upsert({
            where: { tenantId_fornecedorId_cProdFornecedor: { tenantId: req.tenantId, fornecedorId, cProdFornecedor: String(it.cProdFornecedor) } },
            create: { fornecedorId, cProdFornecedor: String(it.cProdFornecedor), cEAN: it.cEAN || null, produtoId: it.produtoId },
            update: { produtoId: it.produtoId, cEAN: it.cEAN || null },
          });
        }

        const notaAtualizada = await tx.notaFiscalEntrada.update({
          where: { id: nota.id },
          data: { status: "IMPORTADA", compraId: compra.id, fornecedorId },
        });

        return { jaImportada: false, nota: notaAtualizada, compra, contasGeradas, itensImportados: itensNorm.length };
      });

      if (resultado.jaImportada) {
        return res.status(200).json({ ...resultado, aviso: "NF-e ja havia sido importada." });
      }
      res.status(201).json(resultado);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

// POST /fiscal/entrada/:id/estornar  — body: { motivo? }
// Desfaz uma importacao (XML/mapeamento errado): estorna a Compra vinculada
// (reverte o estoque via SAIDA, cancela as contas a pagar PENDENTES/ATRASADAS) e
// devolve a NF-e ao estado RECEBIDA, para o usuario re-conciliar/efetivar de novo
// ou descartar. Bloqueia se alguma conta a pagar ja foi PAGA (o dinheiro saiu —
// reabrir no Financeiro antes). Transacional e idempotente. So ADMIN/GERENTE.
export async function estornarEntrada(req, res, next) {
  try {
    const motivo = req.body?.motivo ? String(req.body.motivo).trim().slice(0, 500) : null;
    try {
      const resultado = await prisma.$transaction(async (tx) => {
        const nota = await tx.notaFiscalEntrada.findUnique({ where: { id: req.params.id } });
        if (!nota) { const e = new Error("NF-e de entrada nao encontrada."); e.status = 404; throw e; }
        if (nota.status !== "IMPORTADA" || !nota.compraId) {
          const e = new Error("Esta NF-e nao esta importada — nada a estornar."); e.status = 400; throw e;
        }

        const compra = await tx.compra.findUnique({
          where: { id: nota.compraId }, include: { itens: true, contasPagar: true },
        });
        if (!compra) { const e = new Error("Compra vinculada nao encontrada."); e.status = 404; throw e; }

        // Reverte a compra (se ainda nao estava cancelada). Mesma logica do
        // compraController.estornar: bloqueia conta paga, gera SAIDA, cancela
        // contas pendentes, marca compra cancelada.
        if (!compra.cancelada) {
          const pagas = compra.contasPagar.filter((c) => c.status === "PAGA");
          if (pagas.length) {
            const e = new Error(`Esta importacao tem ${pagas.length} conta(s) ja paga(s). Reabra-a(s) no Financeiro antes de estornar.`);
            e.status = 400; throw e;
          }

          const produtos = await tx.produto.findMany({ where: { id: { in: compra.itens.map((i) => i.produtoId) } } });
          const mapaProd = new Map(produtos.map((p) => [p.id, p]));
          for (const it of compra.itens) {
            const p = mapaProd.get(it.produtoId);
            if (!p) continue; // produto removido — pula a movimentacao
            const antes = Number(p.estoque);
            const qtd = Number(it.quantidade);
            const depois = arredQtd(antes - qtd);
            await tx.produto.update({ where: { id: it.produtoId }, data: { estoque: depois } });
            await tx.movimentacaoEstoque.create({
              data: {
                tipo: "SAIDA", quantidade: qtd, estoqueAntes: antes, estoqueDepois: depois,
                motivo: `Estorno NF-e entrada ${nota.numero || nota.chaveAcesso} (Compra #${compra.numero})`,
                produtoId: it.produtoId, userId: req.user.sub,
              },
            });
          }

          const idsCancelar = compra.contasPagar
            .filter((c) => c.status === "PENDENTE" || c.status === "ATRASADA")
            .map((c) => c.id);
          let contasCanceladas = 0;
          if (idsCancelar.length) {
            const upd = await tx.contaPagar.updateMany({ where: { id: { in: idsCancelar } }, data: { status: "CANCELADA" } });
            contasCanceladas = upd.count;
          }

          await tx.compra.update({
            where: { id: compra.id },
            data: { cancelada: true, canceladaEm: new Date(), motivoCancelamento: motivo || `Estorno da importacao da NF-e ${nota.chaveAcesso}` },
          });

          const notaAtualizada = await tx.notaFiscalEntrada.update({
            where: { id: nota.id }, data: { status: "RECEBIDA", compraId: null },
          });
          return { nota: notaAtualizada, compraNumero: compra.numero, itensRevertidos: compra.itens.length, contasCanceladas };
        }

        // Compra ja estava cancelada (ex.: estornada em Compras): so solta a nota.
        const notaAtualizada = await tx.notaFiscalEntrada.update({
          where: { id: nota.id }, data: { status: "RECEBIDA", compraId: null },
        });
        return { nota: notaAtualizada, compraNumero: compra.numero, itensRevertidos: 0, contasCanceladas: 0 };
      });

      res.json({ ...resultado, aviso: "Importacao estornada. A NF-e voltou para conciliacao — refaca ou descarte." });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

// POST /fiscal/entrada/:id/descartar
export async function descartarEntrada(req, res, next) {
  try {
    const nota = await prisma.notaFiscalEntrada.findUnique({ where: { id: req.params.id } });
    if (!nota) return res.status(404).json({ erro: "NF-e de entrada nao encontrada." });
    if (nota.status === "IMPORTADA") {
      return res.status(400).json({ erro: "NF-e ja importada — estorne a compra para reverter." });
    }
    const atualizada = await prisma.notaFiscalEntrada.update({
      where: { id: nota.id }, data: { status: "DESCARTADA" },
    });
    res.json({ nota: atualizada });
  } catch (err) {
    next(err);
  }
}
