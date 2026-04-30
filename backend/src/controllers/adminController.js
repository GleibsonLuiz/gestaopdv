import path from "node:path";
import fs from "node:fs/promises";
import prisma from "../lib/prisma.js";

const PALAVRA_CHAVE = "CONFIRMAR_RESET";
const PASTA_UPLOADS = path.resolve("uploads");

// Limpeza total dos dados operacionais. Mantem usuarios e suas permissoes.
// Ordem segue dependencia reversa de FKs para evitar P2003.
export async function resetarSistema(req, res, next) {
  try {
    if (req.body?.confirmacao !== PALAVRA_CHAVE) {
      return res.status(400).json({
        erro: `Palavra-chave invalida. Envie { "confirmacao": "${PALAVRA_CHAVE}" }`,
      });
    }

    const removidos = await prisma.$transaction(async (tx) => {
      const itensVenda = await tx.itemVenda.deleteMany();
      const vendas = await tx.venda.deleteMany();
      const itensCompra = await tx.itemCompra.deleteMany();
      const compras = await tx.compra.deleteMany();
      const movimentacoes = await tx.movimentacaoEstoque.deleteMany();
      const anexos = await tx.anexo.deleteMany();
      const contasPagar = await tx.contaPagar.deleteMany();
      const contasReceber = await tx.contaReceber.deleteMany();
      const produtos = await tx.produto.deleteMany();
      const categorias = await tx.categoria.deleteMany();
      const fornecedores = await tx.fornecedor.deleteMany();
      const clientes = await tx.cliente.deleteMany();
      return {
        itensVenda: itensVenda.count, vendas: vendas.count,
        itensCompra: itensCompra.count, compras: compras.count,
        movimentacoesEstoque: movimentacoes.count,
        anexos: anexos.count,
        contasPagar: contasPagar.count, contasReceber: contasReceber.count,
        produtos: produtos.count, categorias: categorias.count,
        fornecedores: fornecedores.count, clientes: clientes.count,
      };
    });

    // Apaga arquivos fisicos de uploads. Nao bloqueia o response se falhar —
    // o registro Anexo no DB ja sumiu na transacao, e o disco vai ficar com
    // orfaos no maximo.
    let arquivosRemovidos = 0;
    try {
      const arquivos = await fs.readdir(PASTA_UPLOADS);
      for (const nome of arquivos) {
        try {
          await fs.unlink(path.join(PASTA_UPLOADS, nome));
          arquivosRemovidos++;
        } catch { /* ignora */ }
      }
    } catch { /* pasta inexistente — sem problema */ }

    res.json({ ok: true, removidos, arquivosRemovidos });
  } catch (err) {
    next(err);
  }
}
