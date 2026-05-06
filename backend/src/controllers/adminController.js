import path from "node:path";
import fs from "node:fs/promises";
import prisma from "../lib/prisma.js";

const PALAVRA_CHAVE = "CONFIRMAR_RESET";
const PASTA_UPLOADS = path.resolve("uploads");

// Pastas que devem ter os arquivos apagados no reset. uploads/logo NAO esta
// aqui de proposito — o logotipo da empresa faz parte da configuracao, nao
// dos dados operacionais.
const PASTAS_PARA_LIMPAR = [
  PASTA_UPLOADS,                                  // anexos do financeiro (raiz)
  path.join(PASTA_UPLOADS, "produtos"),           // fotos de produto
];

// Limpeza total dos dados operacionais. Mantem usuarios + permissoes e a
// configuracao da empresa (incluindo logotipo). Ordem das deletes segue a
// dependencia reversa de FKs para evitar P2003.
export async function resetarSistema(req, res, next) {
  try {
    if (req.body?.confirmacao !== PALAVRA_CHAVE) {
      return res.status(400).json({
        erro: `Palavra-chave invalida. Envie { "confirmacao": "${PALAVRA_CHAVE}" }`,
      });
    }

    const removidos = await prisma.$transaction(async (tx) => {
      // 1. Filhos diretos de Venda (itensVenda) e movimentacoes vinculadas
      //    a venda/caixa precisam sair antes das vendas e dos caixas.
      const itensVenda = await tx.itemVenda.deleteMany();
      const movimentacoesCaixa = await tx.movimentacaoCaixa.deleteMany();

      // 2. Vendas referenciam Caixa via Venda.caixaId — deletar antes do Caixa.
      const vendas = await tx.venda.deleteMany();

      // 3. Caixas (depois das vendas + movimentacoes que apontam pra ele).
      const caixas = await tx.caixa.deleteMany();

      // 4. Compras
      const itensCompra = await tx.itemCompra.deleteMany();
      const compras = await tx.compra.deleteMany();

      // 5. Estoque (movimentacoes sao filhas de produto + user)
      const movimentacoesEstoque = await tx.movimentacaoEstoque.deleteMany();

      // 6. Financeiro (anexos sao filhos de conta)
      const anexos = await tx.anexo.deleteMany();
      const contasPagar = await tx.contaPagar.deleteMany();
      const contasReceber = await tx.contaReceber.deleteMany();

      // 7. Cadastros (produtos antes de categorias e fornecedores por causa
      //    das FKs categoriaId e fornecedorId)
      const produtos = await tx.produto.deleteMany();
      const categorias = await tx.categoria.deleteMany();
      const fornecedores = await tx.fornecedor.deleteMany();
      const clientes = await tx.cliente.deleteMany();

      // 8. Formas de pagamento personalizadas (sem FKs — vendas/contas guardam
      //    apenas o enum base FormaPagamento, nao referenciam o custom).
      const formasPagamentoCustom = await tx.formaPagamentoCustom.deleteMany();

      return {
        itensVenda: itensVenda.count, vendas: vendas.count,
        movimentacoesCaixa: movimentacoesCaixa.count, caixas: caixas.count,
        itensCompra: itensCompra.count, compras: compras.count,
        movimentacoesEstoque: movimentacoesEstoque.count,
        anexos: anexos.count,
        contasPagar: contasPagar.count, contasReceber: contasReceber.count,
        produtos: produtos.count, categorias: categorias.count,
        fornecedores: fornecedores.count, clientes: clientes.count,
        formasPagamentoCustom: formasPagamentoCustom.count,
      };
    });

    // Limpeza de arquivos fisicos:
    //   - Em dev (sem BLOB token): apaga arquivos das pastas operacionais
    //     diretamente do filesystem (best-effort).
    //   - Em prod (Vercel Blob): nao limpa, ja que o filesystem e read-only.
    //     Os arquivos no Blob viram orfaos — podem ser limpos manualmente
    //     no painel do Vercel se incomodarem. Como o reset e raro e os
    //     anexos foram apagados do banco, o link com a UI ja some.
    let arquivosRemovidos = 0;
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      for (const pasta of PASTAS_PARA_LIMPAR) {
        try {
          const arquivos = await fs.readdir(pasta);
          for (const nome of arquivos) {
            const alvo = path.join(pasta, nome);
            try {
              const stat = await fs.stat(alvo);
              if (stat.isFile()) {
                await fs.unlink(alvo);
                arquivosRemovidos++;
              }
            } catch { /* ignora arquivo individual */ }
          }
        } catch { /* pasta inexistente — sem problema */ }
      }
    }

    res.json({ ok: true, removidos, arquivosRemovidos });
  } catch (err) {
    next(err);
  }
}
