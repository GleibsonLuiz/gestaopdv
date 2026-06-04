import prisma from "../lib/prisma.js";
import { toNumber, parseDate } from "../lib/contas.js";
import { criarComNumeroRetry } from "../lib/proximoNumero.js";
import { registrarEmCaixa, registrarNoCaixaAberto } from "./caixaController.js";
import { salvarArquivo, removerArquivo } from "../lib/storage.js";
import { extrairDadosComprovante, ClaudeIAError } from "../lib/claudeIA.js";

const FORMAS_VALIDAS = new Set([
  "DINHEIRO", "CARTAO_CREDITO", "CARTAO_DEBITO", "PIX", "BOLETO", "CREDIARIO",
]);

const INCLUDE = {
  planoConta: { select: { id: true, codigo: true, nome: true, natureza: true } },
  fornecedor: { select: { id: true, nome: true, cnpj: true } },
  anexos: { orderBy: { createdAt: "asc" } },
};

export async function listar(req, res, next) {
  try {
    const { search, planoContaId, fornecedorId, dataInicio, dataFim } = req.query;
    const where = {};
    if (planoContaId) where.planoContaId = planoContaId;
    if (fornecedorId) where.fornecedorId = fornecedorId;
    if (search) {
      where.OR = [
        { descricao: { contains: search, mode: "insensitive" } },
        { observacoes: { contains: search, mode: "insensitive" } },
      ];
    }
    if (dataInicio || dataFim) {
      where.data = {};
      if (dataInicio) where.data.gte = parseDate(dataInicio);
      if (dataFim) where.data.lte = new Date(dataFim + "T23:59:59.999Z");
    }

    const despesas = await prisma.despesa.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ data: "desc" }, { numero: "desc" }],
    });
    res.json(despesas);
  } catch (err) {
    next(err);
  }
}

export async function obter(req, res, next) {
  try {
    const despesa = await prisma.despesa.findUnique({
      where: { id: req.params.id },
      include: INCLUDE,
    });
    if (!despesa) return res.status(404).json({ erro: "Despesa nao encontrada" });
    res.json(despesa);
  } catch (err) {
    next(err);
  }
}

// Cria uma despesa. Aceita multipart (campos + arquivo opcional "arquivo") OU
// JSON puro. Regras de caixa (espelham contaPagarController.pagar):
//   registrarCaixa !== "false" -> tenta baixar de um caixa aberto
//   caixaId          -> baixa naquele caixa especifico (precisa estar ABERTO)
//   sem caixa aberto -> a despesa e criada mesmo assim (so registro contabil)
export async function criar(req, res, next) {
  try {
    const { descricao, planoContaId, fornecedorId, observacoes,
            formaPagamento = "DINHEIRO" } = req.body;

    if (!descricao || !String(descricao).trim()) {
      return res.status(400).json({ erro: "Descricao e obrigatoria" });
    }
    if (!planoContaId) {
      return res.status(400).json({ erro: "Categoria (plano de contas) e obrigatoria" });
    }
    const valor = toNumber(req.body.valor);
    if (valor === null || Number.isNaN(valor) || valor <= 0) {
      return res.status(400).json({ erro: "Valor deve ser maior que zero" });
    }
    if (!FORMAS_VALIDAS.has(formaPagamento)) {
      return res.status(400).json({ erro: "Forma de pagamento invalida" });
    }
    const dataGasto = req.body.data ? parseDate(req.body.data) : new Date();
    if (!dataGasto) return res.status(400).json({ erro: "Data invalida" });

    // A conta precisa existir, estar ativa e ser analitica (folha). Contas
    // sinteticas so agrupam — nao recebem lancamento.
    const pc = await prisma.planoConta.findUnique({ where: { id: planoContaId } });
    if (!pc) return res.status(400).json({ erro: "Categoria inexistente" });
    if (!pc.ativo) return res.status(400).json({ erro: "Categoria inativa" });
    if (!pc.analitica) {
      return res.status(400).json({ erro: "Selecione uma categoria analitica (nao um grupo)" });
    }

    const registrarCaixa = req.body.registrarCaixa !== "false" && req.body.registrarCaixa !== false;
    const caixaIdInformado = req.body.caixaId && String(req.body.caixaId).trim()
      ? String(req.body.caixaId).trim() : null;

    // Persiste o comprovante (se enviado) ANTES da transacao — escrita em Blob/FS
    // e externa ao banco; se a tx falhar depois, removemos o arquivo no catch.
    let anexoData = null;
    if (req.file) {
      const ext = (req.file.originalname.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
      const salvo = await salvarArquivo({
        pasta: "comprovantes",
        buffer: req.file.buffer,
        extensao: ext,
        mimeType: req.file.mimetype,
      });
      anexoData = {
        nomeOriginal: req.file.originalname,
        nomeArmazenado: salvo.nomeArmazenado,
        mimeType: req.file.mimetype,
        tamanho: req.file.size,
        url: salvo.url,
      };
    }

    try {
      const despesa = await prisma.$transaction(async (tx) => {
        const criada = await criarComNumeroRetry(tx.despesa, req.tenantId, (numero) =>
          tx.despesa.create({
            data: {
              numero,
              data: dataGasto,
              valor,
              descricao: String(descricao).trim(),
              observacoes: observacoes ? String(observacoes).trim() : null,
              formaPagamento,
              origem: req.body.origem === "OCR" ? "OCR" : "MANUAL",
              planoContaId,
              fornecedorId: fornecedorId || null,
              userId: req.user.sub,
              ...(anexoData ? { anexos: { create: [anexoData] } } : {}),
            },
          })
        );

        let caixaIdFinal = null;
        if (registrarCaixa) {
          const dadosMov = {
            tipo: "DESPESA",
            formaPagamento,
            valor,
            descricao: `DESPESA: ${criada.descricao}`.toUpperCase().slice(0, 200),
            despesaId: criada.id,
          };
          const mov = caixaIdInformado
            ? await registrarEmCaixa(tx, caixaIdInformado, req.user.sub, dadosMov)
            : await registrarNoCaixaAberto(tx, req.user.sub, dadosMov);
          if (mov) caixaIdFinal = mov.caixaId;
        }

        if (caixaIdFinal) {
          return tx.despesa.update({
            where: { id: criada.id },
            data: { caixaId: caixaIdFinal },
            include: INCLUDE,
          });
        }
        return tx.despesa.findUnique({ where: { id: criada.id }, include: INCLUDE });
      });

      res.status(201).json(despesa);
    } catch (err) {
      // Rollback do arquivo orfao (a tx nao persistiu o anexo).
      if (anexoData) await removerArquivo(anexoData.url);
      if (err.status) return res.status(err.status).json({ erro: err.message });
      if (err.code === "P2003") return res.status(400).json({ erro: "Categoria ou fornecedor inexistente" });
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

// OCR do comprovante: recebe a foto/PDF, le com a IA e devolve os campos
// sugeridos { valor, data, descricao, cnpj, planoContaSugeridaId } para o
// frontend pre-preencher. NAO cria a despesa — o usuario confere e confirma.
export async function ocr(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ erro: "Arquivo nao enviado" });

    // Categorias analiticas de despesa do tenant, para a IA sugerir a melhor.
    const categorias = await prisma.planoConta.findMany({
      where: { analitica: true, ativo: true, natureza: "DESPESA" },
      select: { id: true, nome: true },
    });

    const dados = await extrairDadosComprovante(req.file.buffer, req.file.mimetype, categorias);

    // So devolve a sugestao de categoria se o id realmente existe no tenant.
    if (dados.planoContaSugeridaId && !categorias.some(c => c.id === dados.planoContaSugeridaId)) {
      dados.planoContaSugeridaId = null;
    }
    res.json(dados);
  } catch (err) {
    if (err instanceof ClaudeIAError) {
      return res.status(502).json({ erro: err.message });
    }
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const existente = await prisma.despesa.findUnique({ where: { id: req.params.id } });
    if (!existente) return res.status(404).json({ erro: "Despesa nao encontrada" });

    const data = {};
    if (req.body.descricao !== undefined) {
      const d = String(req.body.descricao).trim();
      if (!d) return res.status(400).json({ erro: "Descricao nao pode ser vazia" });
      data.descricao = d;
    }
    if (req.body.valor !== undefined) {
      const v = toNumber(req.body.valor);
      if (v === null || Number.isNaN(v) || v <= 0) {
        return res.status(400).json({ erro: "Valor deve ser maior que zero" });
      }
      data.valor = v;
    }
    if (req.body.data !== undefined) {
      const dt = parseDate(req.body.data);
      if (!dt) return res.status(400).json({ erro: "Data invalida" });
      data.data = dt;
    }
    if (req.body.formaPagamento !== undefined) {
      if (!FORMAS_VALIDAS.has(req.body.formaPagamento)) {
        return res.status(400).json({ erro: "Forma de pagamento invalida" });
      }
      data.formaPagamento = req.body.formaPagamento;
    }
    if (req.body.observacoes !== undefined) {
      data.observacoes = req.body.observacoes ? String(req.body.observacoes).trim() : null;
    }
    if (req.body.fornecedorId !== undefined) {
      data.fornecedorId = req.body.fornecedorId || null;
    }
    if (req.body.planoContaId !== undefined) {
      const pc = await prisma.planoConta.findUnique({ where: { id: req.body.planoContaId } });
      if (!pc) return res.status(400).json({ erro: "Categoria inexistente" });
      if (!pc.analitica) return res.status(400).json({ erro: "Selecione uma categoria analitica" });
      data.planoContaId = req.body.planoContaId;
    }

    // Nota: editar valor/forma NAO reescreve a movimentacao de caixa ja gerada.
    // Para corrigir o caixa, exclua e relance (mesma politica do financeiro).
    const despesa = await prisma.despesa.update({
      where: { id: req.params.id },
      data,
      include: INCLUDE,
    });
    res.json(despesa);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Despesa nao encontrada" });
    if (err.code === "P2003") return res.status(400).json({ erro: "Categoria ou fornecedor inexistente" });
    next(err);
  }
}

// Exclui a despesa. Estorna no caixa as movimentacoes DESPESA ainda nao
// estornadas (em caixas ABERTOS) e remove os arquivos de comprovante. Caixas
// fechados nao sao tocados (regra do negocio — historico fechado e imutavel).
export async function excluir(req, res, next) {
  try {
    const despesa = await prisma.despesa.findUnique({
      where: { id: req.params.id },
      include: { anexos: true },
    });
    if (!despesa) return res.status(404).json({ erro: "Despesa nao encontrada" });

    await prisma.$transaction(async (tx) => {
      const movs = await tx.movimentacaoCaixa.findMany({
        where: { despesaId: despesa.id, tipo: "DESPESA" },
        include: { caixa: { select: { id: true, status: true } } },
      });
      for (const mov of movs) {
        const ja = await tx.movimentacaoCaixa.findFirst({
          where: { despesaId: despesa.id, tipo: "ESTORNO_DESPESA", caixaId: mov.caixaId },
        });
        if (ja) continue;
        if (mov.caixa.status !== "ABERTO") continue;
        await registrarEmCaixa(tx, mov.caixaId, req.user.sub, {
          tipo: "ESTORNO_DESPESA",
          formaPagamento: mov.formaPagamento,
          valor: Number(mov.valor),
          descricao: `ESTORNO DESPESA: ${despesa.descricao}`.toUpperCase().slice(0, 200),
          despesaId: despesa.id,
        });
      }
      await tx.despesa.delete({ where: { id: despesa.id } });
    });

    // Remove os arquivos fora da tx (Blob/FS). Anexos do banco caem por cascade.
    for (const a of despesa.anexos) await removerArquivo(a.url);
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Despesa nao encontrada" });
    next(err);
  }
}

// Anexa um comprovante adicional a uma despesa existente (alem do enviado na
// criacao). Usa o mesmo multer/storage do anexoController.
export async function anexar(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ erro: "Arquivo nao enviado" });
    const despesa = await prisma.despesa.findUnique({ where: { id: req.params.id } });
    if (!despesa) return res.status(404).json({ erro: "Despesa nao encontrada" });

    const ext = (req.file.originalname.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
    const salvo = await salvarArquivo({
      pasta: "comprovantes",
      buffer: req.file.buffer,
      extensao: ext,
      mimeType: req.file.mimetype,
    });
    const anexo = await prisma.anexo.create({
      data: {
        nomeOriginal: req.file.originalname,
        nomeArmazenado: salvo.nomeArmazenado,
        mimeType: req.file.mimetype,
        tamanho: req.file.size,
        url: salvo.url,
        despesaId: despesa.id,
      },
    });
    res.status(201).json(anexo);
  } catch (err) {
    next(err);
  }
}

export async function excluirAnexo(req, res, next) {
  try {
    const anexo = await prisma.anexo.findUnique({ where: { id: req.params.anexoId } });
    if (!anexo || anexo.despesaId !== req.params.id) {
      return res.status(404).json({ erro: "Anexo nao encontrado" });
    }
    await prisma.anexo.delete({ where: { id: anexo.id } });
    await removerArquivo(anexo.url);
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Anexo nao encontrado" });
    next(err);
  }
}
