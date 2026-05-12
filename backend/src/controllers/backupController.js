import prisma from "../lib/prisma.js";

const PALAVRA_CHAVE_RESTORE = "CONFIRMAR_RESTORE";
const VERSAO_BACKUP = "1.0";

// Tabelas exportadas/restauradas em ordem segura para FKs.
//
// As entidades em PAIS aparecem antes que as FILHAS na ordem de IMPORT
// e na ordem reversa no DELETE. As funcoes restaurar()/exportar() usam
// esta lista — alterar aqui afeta os dois lados automaticamente.
//
// Cada item: { tabela: nome no JSON, model: Prisma delegate, prepara?: fn }.
//
// 'prepara' permite saneamento por linha antes de inserir (ex: garantir
// que campos opcionais nao venham como undefined).

// ============ EXPORTAR ============
//
// Retorna um JSON com snapshot completo dos dados operacionais. O download
// e iniciado pelo navegador via Content-Disposition.

export async function exportar(req, res, next) {
  try {
    const [
      configuracaoEmpresa,
      users,
      categorias,
      fornecedores,
      clientes,
      formaPagamentoCustom,
      produtos,
      caixas,
      vendas,
      itensVenda,
      compras,
      itensCompra,
      contasPagar,
      contasReceber,
      movimentacoesEstoque,
      movimentacoesCaixa,
      anexos,
      orcamentos,
      itensOrcamento,
    ] = await Promise.all([
      prisma.configuracaoEmpresa.findFirst(),
      prisma.user.findMany(),
      prisma.categoria.findMany(),
      prisma.fornecedor.findMany(),
      prisma.cliente.findMany(),
      prisma.formaPagamentoCustom.findMany(),
      prisma.produto.findMany(),
      prisma.caixa.findMany(),
      prisma.venda.findMany(),
      prisma.itemVenda.findMany(),
      prisma.compra.findMany(),
      prisma.itemCompra.findMany(),
      prisma.contaPagar.findMany(),
      prisma.contaReceber.findMany(),
      prisma.movimentacaoEstoque.findMany(),
      prisma.movimentacaoCaixa.findMany(),
      prisma.anexo.findMany(),
      prisma.orcamento.findMany(),
      prisma.itemOrcamento.findMany(),
    ]);

    const backup = {
      versao: VERSAO_BACKUP,
      exportadoEm: new Date().toISOString(),
      exportadoPor: { id: req.user.sub, nome: req.user.nome || null },
      contagem: {
        users: users.length,
        clientes: clientes.length,
        fornecedores: fornecedores.length,
        produtos: produtos.length,
        vendas: vendas.length,
        compras: compras.length,
        contasPagar: contasPagar.length,
        contasReceber: contasReceber.length,
        orcamentos: orcamentos.length,
      },
      dados: {
        configuracaoEmpresa,
        users,
        categorias,
        fornecedores,
        clientes,
        formaPagamentoCustom,
        produtos,
        caixas,
        vendas,
        itensVenda,
        compras,
        itensCompra,
        contasPagar,
        contasReceber,
        movimentacoesEstoque,
        movimentacoesCaixa,
        anexos,
        orcamentos,
        itensOrcamento,
      },
    };

    const dataYMD = new Date().toISOString().slice(0, 10);
    const nomeArquivo = `backup-gestaopro-${dataYMD}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    next(err);
  }
}

// ============ RESTAURAR ============
//
// Substitui todos os dados operacionais pelos do backup. Em transacao —
// se algo falhar, nada e alterado. Para evitar lockout do usuario que
// dispara a restauracao, validamos que o user atual existe no backup
// (pelo id) antes de comecar.

export async function restaurar(req, res, next) {
  try {
    const { confirmacao, backup } = req.body || {};

    if (confirmacao !== PALAVRA_CHAVE_RESTORE) {
      return res.status(400).json({
        erro: `Palavra-chave invalida. Envie { "confirmacao": "${PALAVRA_CHAVE_RESTORE}", "backup": ... }`,
      });
    }
    if (!backup || typeof backup !== "object") {
      return res.status(400).json({ erro: "Campo 'backup' ausente ou invalido" });
    }
    if (!backup.versao || !backup.dados) {
      return res.status(400).json({ erro: "Estrutura de backup invalida (faltam campos versao/dados)" });
    }
    if (backup.versao !== VERSAO_BACKUP) {
      return res.status(400).json({
        erro: `Versao de backup incompativel: arquivo ${backup.versao}, esperado ${VERSAO_BACKUP}`,
      });
    }

    const d = backup.dados;
    const usersBackup = Array.isArray(d.users) ? d.users : [];
    const usuarioAtualNoBackup = usersBackup.some(u => u.id === req.user.sub);
    if (!usuarioAtualNoBackup) {
      return res.status(400).json({
        erro: "Seu usuario nao existe neste backup — restaurar deixaria voce sem acesso. " +
              "Use um backup que inclua sua conta ou peça para outro admin restaurar.",
      });
    }

    // Sanitiza arrays: garante que todos sao arrays, mesmo se o JSON
    // estiver com algum campo ausente (compatibilidade com versoes futuras).
    const arr = (v) => Array.isArray(v) ? v : [];

    const resumo = await prisma.$transaction(async (tx) => {
      // ============ DELETE em ordem reversa de FKs ============
      await tx.itemOrcamento.deleteMany();
      await tx.orcamento.deleteMany();
      await tx.anexo.deleteMany();
      await tx.movimentacaoCaixa.deleteMany();
      await tx.itemVenda.deleteMany();
      await tx.venda.deleteMany();
      await tx.itemCompra.deleteMany();
      await tx.compra.deleteMany();
      await tx.contaPagar.deleteMany();
      await tx.contaReceber.deleteMany();
      await tx.movimentacaoEstoque.deleteMany();
      await tx.caixa.deleteMany();
      await tx.produto.deleteMany();
      await tx.categoria.deleteMany();
      await tx.cliente.deleteMany();
      await tx.fornecedor.deleteMany();
      await tx.formaPagamentoCustom.deleteMany();
      // Users e ConfiguracaoEmpresa: nao deletam tudo. Faremos upsert
      // (createMany com skipDuplicates nao serve porque os IDs devem ser
      // mantidos). Para simplificar: deleta tudo EXCETO o user atual.
      await tx.user.deleteMany({ where: { id: { not: req.user.sub } } });
      await tx.configuracaoEmpresa.deleteMany();

      // ============ INSERT em ordem direta de FKs ============

      // ConfiguracaoEmpresa: singleton — pega o primeiro do backup (se existir)
      if (d.configuracaoEmpresa) {
        const cfg = d.configuracaoEmpresa;
        await tx.configuracaoEmpresa.create({ data: limparTimestamps(cfg) });
      }

      // Users: upsert para preservar o usuario atual sem perder a sessao.
      for (const u of usersBackup) {
        const dados = limparTimestamps(u);
        await tx.user.upsert({
          where: { id: u.id },
          update: dados,
          create: dados,
        });
      }

      // Cadastros sem dependencias
      for (const c of arr(d.categorias)) {
        await tx.categoria.create({ data: limparTimestamps(c) });
      }
      for (const f of arr(d.fornecedores)) {
        await tx.fornecedor.create({ data: limparTimestamps(f) });
      }
      for (const c of arr(d.clientes)) {
        await tx.cliente.create({ data: limparTimestamps(c) });
      }
      for (const fp of arr(d.formaPagamentoCustom)) {
        await tx.formaPagamentoCustom.create({ data: limparTimestamps(fp) });
      }

      // Produtos (depende de categoria + fornecedor)
      for (const p of arr(d.produtos)) {
        await tx.produto.create({ data: limparTimestamps(p) });
      }

      // Caixas (depende de user)
      for (const c of arr(d.caixas)) {
        await tx.caixa.create({ data: limparTimestamps(c) });
      }

      // Vendas + itens
      for (const v of arr(d.vendas)) {
        await tx.venda.create({ data: limparTimestamps(v) });
      }
      for (const iv of arr(d.itensVenda)) {
        await tx.itemVenda.create({ data: limparTimestamps(iv) });
      }

      // Compras + itens
      for (const c of arr(d.compras)) {
        await tx.compra.create({ data: limparTimestamps(c) });
      }
      for (const ic of arr(d.itensCompra)) {
        await tx.itemCompra.create({ data: limparTimestamps(ic) });
      }

      // Contas a pagar/receber
      for (const cp of arr(d.contasPagar)) {
        await tx.contaPagar.create({ data: limparTimestamps(cp) });
      }
      for (const cr of arr(d.contasReceber)) {
        await tx.contaReceber.create({ data: limparTimestamps(cr) });
      }

      // Movimentacoes
      for (const me of arr(d.movimentacoesEstoque)) {
        await tx.movimentacaoEstoque.create({ data: limparTimestamps(me) });
      }
      for (const mc of arr(d.movimentacoesCaixa)) {
        await tx.movimentacaoCaixa.create({ data: limparTimestamps(mc) });
      }

      // Anexos (FK para conta a pagar/receber)
      for (const a of arr(d.anexos)) {
        await tx.anexo.create({ data: limparTimestamps(a) });
      }

      // Orcamentos + itens
      for (const o of arr(d.orcamentos)) {
        await tx.orcamento.create({ data: limparTimestamps(o) });
      }
      for (const io of arr(d.itensOrcamento)) {
        await tx.itemOrcamento.create({ data: limparTimestamps(io) });
      }

      return {
        users: usersBackup.length,
        categorias: arr(d.categorias).length,
        fornecedores: arr(d.fornecedores).length,
        clientes: arr(d.clientes).length,
        produtos: arr(d.produtos).length,
        caixas: arr(d.caixas).length,
        vendas: arr(d.vendas).length,
        itensVenda: arr(d.itensVenda).length,
        compras: arr(d.compras).length,
        itensCompra: arr(d.itensCompra).length,
        contasPagar: arr(d.contasPagar).length,
        contasReceber: arr(d.contasReceber).length,
        movimentacoesEstoque: arr(d.movimentacoesEstoque).length,
        movimentacoesCaixa: arr(d.movimentacoesCaixa).length,
        anexos: arr(d.anexos).length,
        orcamentos: arr(d.orcamentos).length,
        itensOrcamento: arr(d.itensOrcamento).length,
      };
    }, {
      // Restauracao pode demorar — aumentamos os timeouts da transacao
      // (default e 5s para inicio + 5s execucao). Vercel Hobby permite
      // ate 300s por funcao, entao 60s aqui e seguro.
      maxWait: 10_000,
      timeout: 60_000,
    });

    res.json({ ok: true, restaurados: resumo, exportadoEm: backup.exportadoEm });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(400).json({
        erro: "Conflito de chave unica no backup — verifique se o arquivo nao esta corrompido",
      });
    }
    if (err.code === "P2003") {
      return res.status(400).json({
        erro: "Conflito de relacionamento no backup — algum ID referenciado nao existe",
      });
    }
    next(err);
  }
}

// Remove campos que o Prisma calcula sozinho ao inserir (createdAt e
// updatedAt). Manter as datas originais e desejavel — Prisma respeita
// quando voce passa o valor explicitamente, mas algumas instancias antigas
// podem ter inconsistencias. Mantemos createdAt mas removemos updatedAt
// (Prisma sempre seta @updatedAt no insert).
function limparTimestamps(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const copia = { ...obj };
  // Mantemos createdAt para preservar historico. updatedAt o Prisma seta
  // automaticamente, entao removemos para evitar conflito.
  delete copia.updatedAt;
  return copia;
}
