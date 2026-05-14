import prisma from "../lib/prisma.js";

const norm = (v) => (v === undefined || v === null || v === "" ? null : v);

export async function listar(req, res, next) {
  try {
    const { search, ativo } = req.query;
    const where = {};
    if (ativo === "true") where.ativo = true;
    if (ativo === "false") where.ativo = false;
    if (search) {
      where.OR = [
        { nome: { contains: search, mode: "insensitive" } },
        { cpfCnpj: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: { nome: "asc" },
    });
    res.json(clientes);
  } catch (err) {
    next(err);
  }
}

export async function obter(req, res, next) {
  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id: req.params.id },
    });
    if (!cliente) return res.status(404).json({ erro: "Cliente nao encontrado" });
    res.json(cliente);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const { nome } = req.body;
    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ erro: "Nome e obrigatorio" });
    }
    const cliente = await prisma.cliente.create({
      data: {
        nome: String(nome).trim(),
        cpfCnpj: norm(req.body.cpfCnpj),
        email: norm(req.body.email),
        telefone: norm(req.body.telefone),
        endereco: norm(req.body.endereco),
        cidade: norm(req.body.cidade),
        estado: norm(req.body.estado),
        cep: norm(req.body.cep),
        observacoes: norm(req.body.observacoes),
      },
    });
    res.status(201).json(cliente);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ erro: "Ja existe um cliente com este CPF/CNPJ" });
    }
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const data = {};
    if (req.body.nome !== undefined) {
      const n = String(req.body.nome).trim();
      if (!n) return res.status(400).json({ erro: "Nome nao pode ser vazio" });
      data.nome = n;
    }
    for (const campo of ["cpfCnpj", "email", "telefone", "endereco", "cidade", "estado", "cep", "observacoes"]) {
      if (req.body[campo] !== undefined) data[campo] = norm(req.body[campo]);
    }
    if (req.body.ativo !== undefined) data.ativo = !!req.body.ativo;

    const cliente = await prisma.cliente.update({
      where: { id: req.params.id },
      data,
    });
    res.json(cliente);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Cliente nao encontrado" });
    if (err.code === "P2002") return res.status(409).json({ erro: "Ja existe um cliente com este CPF/CNPJ" });
    next(err);
  }
}

export async function perfil(req, res, next) {
  try {
    const { id } = req.params;

    const [cliente, vendas, contasReceber, orcamentos] = await Promise.all([
      prisma.cliente.findUnique({ where: { id } }),
      prisma.venda.findMany({
        where: { clienteId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          numero: true,
          total: true,
          desconto: true,
          formaPagamento: true,
          status: true,
          createdAt: true,
          user: { select: { nome: true } },
          itens: {
            select: {
              quantidade: true,
              subtotal: true,
              produto: { select: { nome: true } },
            },
          },
        },
      }),
      prisma.contaReceber.findMany({
        where: { clienteId: id },
        orderBy: { vencimento: "desc" },
        take: 50,
        select: {
          id: true,
          descricao: true,
          valor: true,
          vencimento: true,
          recebimento: true,
          status: true,
          parcelaAtual: true,
          parcelaTotal: true,
          tipoRecorrencia: true,
          createdAt: true,
        },
      }),
      prisma.orcamento.findMany({
        where: { clienteId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          numero: true,
          tipo: true,
          status: true,
          total: true,
          tabelaPreco: true,
          formaCondicaoPagamento: true,
          createdAt: true,
          responsavel: { select: { nome: true } },
          user: { select: { nome: true } },
        },
      }),
    ]);

    if (!cliente) return res.status(404).json({ erro: "Cliente nao encontrado" });

    const vendasConcluidas = vendas.filter((v) => v.status === "CONCLUIDA");
    const totalGasto = vendasConcluidas.reduce((s, v) => s + Number(v.total), 0);
    const qtdCompras = vendasConcluidas.length;
    const ticketMedio = qtdCompras > 0 ? totalGasto / qtdCompras : 0;
    const ultimaCompra = vendasConcluidas.length > 0 ? vendasConcluidas[0].createdAt : null;

    const valorInadimplente = contasReceber
      .filter((c) => c.status === "ATRASADA" || c.status === "PENDENTE")
      .reduce((s, c) => s + Number(c.valor), 0);

    res.json({
      cliente,
      kpis: { totalGasto, qtdCompras, ticketMedio, ultimaCompra, valorInadimplente },
      vendas,
      contasReceber,
      orcamentos,
    });
  } catch (err) {
    next(err);
  }
}

// Soft-delete apenas: marca ativo=false. Hard-delete foi removido para
// preservar a integridade historica de vendas, contas e orcamentos que
// referenciam o cliente.
export async function excluir(req, res, next) {
  try {
    await prisma.cliente.update({
      where: { id: req.params.id },
      data: { ativo: false },
    });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Cliente nao encontrado" });
    if (err.code === "P2003") {
      return res.status(409).json({
        erro: "Cliente possui vendas ou contas vinculados. Inative em vez de excluir.",
      });
    }
    next(err);
  }
}
