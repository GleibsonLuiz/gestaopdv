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

// Limpeza total dos dados operacionais do tenant atual.
//
// IMPORTANTE (multi-tenant): graças ao Prisma Extension (ETAPA 3), todos os
// deleteMany() abaixo sao automaticamente filtrados por req.tenantId — ou
// seja, este endpoint apaga APENAS os dados da empresa do user logado.
// Outros tenants nao sao afetados.
//
// O que e preservado no tenant:
//   - Funcionarios (User) e suas permissoes
//   - ConfiguracaoComissao (atrelada a cada funcionario)
//   - ConfiguracaoEmpresa (razao social, CNPJ, logotipo, etc)
//   - A Empresa em si (o tenant continua existindo)
//   - LogAuditoria (preservado para historico forense)
//
// Ordem das deletes segue a dependencia reversa de FKs para evitar P2003.
export async function resetarSistema(req, res, next) {
  try {
    if (req.body?.confirmacao !== PALAVRA_CHAVE) {
      return res.status(400).json({
        erro: `Palavra-chave invalida. Envie { "confirmacao": "${PALAVRA_CHAVE}" }`,
      });
    }

    const removidos = await prisma.$transaction(async (tx) => {
      // ===== CRM — automacoes e templates =====
      // LogAutomacao e filho de RegraAutomacao (Cascade), entao basta deletar
      // a regra; explicitamos por contagem.
      const logsAutomacao = await tx.logAutomacao.deleteMany();
      const regrasAutomacao = await tx.regraAutomacao.deleteMany();
      const templates = await tx.templateMensagem.deleteMany();

      // ===== CRM — Funil de Oportunidades =====
      // HistoricoOportunidade e filho de Oportunidade (Cascade).
      const historicoOportunidades = await tx.historicoOportunidade.deleteMany();
      const oportunidades = await tx.oportunidade.deleteMany();

      // ===== CRM — Tarefas =====
      const tarefas = await tx.tarefa.deleteMany();

      // ===== CRM — Tags =====
      // ClienteTag e cascata via Cliente E via Tag. Deletamos explicitamente
      // antes pra evitar erros caso a ordem mude.
      const clienteTags = await tx.clienteTag.deleteMany();
      const tags = await tx.tag.deleteMany();

      // ===== CRM — Interacoes e Contatos de Cliente =====
      // Ambos sao cascata de Cliente, mas explicitar evita problemas de
      // ordem caso a relacao mude no schema.
      const interacoes = await tx.interacao.deleteMany();
      const contatos = await tx.contato.deleteMany();

      // ===== Fidelidade =====
      // MovimentacaoPontos e cascata de Cliente. PontosCliente tambem.
      // ConfiguracaoFidelidade e singleton por tenant — deletamos pra
      // resetar parametros.
      const movimentacoesPontos = await tx.movimentacaoPontos.deleteMany();
      const pontosCliente = await tx.pontosCliente.deleteMany();
      const configFidelidade = await tx.configuracaoFidelidade.deleteMany();

      // ===== Pesquisas NPS =====
      // Cascade de Venda, mas deletar antes garante ordem segura.
      const pesquisasNps = await tx.pesquisaNps.deleteMany();

      // ===== Vendas / Orcamentos / Caixas =====
      const itensVenda = await tx.itemVenda.deleteMany();
      const itensOrcamento = await tx.itemOrcamento.deleteMany();
      const movimentacoesCaixa = await tx.movimentacaoCaixa.deleteMany();
      const vendas = await tx.venda.deleteMany();
      const orcamentos = await tx.orcamento.deleteMany();
      const caixas = await tx.caixa.deleteMany();

      // ===== Compras =====
      const itensCompra = await tx.itemCompra.deleteMany();
      const compras = await tx.compra.deleteMany();

      // ===== Estoque (movimentacoes — filhas de produto + user) =====
      const movimentacoesEstoque = await tx.movimentacaoEstoque.deleteMany();

      // ===== Financeiro (anexos sao filhos de conta) =====
      const anexos = await tx.anexo.deleteMany();
      const contasPagar = await tx.contaPagar.deleteMany();
      const contasReceber = await tx.contaReceber.deleteMany();

      // ===== Cadastros (produtos antes de categorias/fornecedores; clientes
      //       depois das oportunidades/tarefas que os referenciam) =====
      const produtos = await tx.produto.deleteMany();
      const categorias = await tx.categoria.deleteMany();
      const fornecedores = await tx.fornecedor.deleteMany();
      const clientes = await tx.cliente.deleteMany();

      // ===== Formas de pagamento personalizadas =====
      const formasPagamentoCustom = await tx.formaPagamentoCustom.deleteMany();

      return {
        // CRM
        logsAutomacao: logsAutomacao.count,
        regrasAutomacao: regrasAutomacao.count,
        templates: templates.count,
        historicoOportunidades: historicoOportunidades.count,
        oportunidades: oportunidades.count,
        tarefas: tarefas.count,
        clienteTags: clienteTags.count,
        tags: tags.count,
        interacoes: interacoes.count,
        contatos: contatos.count,
        // Fidelidade
        movimentacoesPontos: movimentacoesPontos.count,
        pontosCliente: pontosCliente.count,
        configFidelidade: configFidelidade.count,
        pesquisasNps: pesquisasNps.count,
        // Operacional
        itensVenda: itensVenda.count, itensOrcamento: itensOrcamento.count,
        vendas: vendas.count, orcamentos: orcamentos.count,
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
