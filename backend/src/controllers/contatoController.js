import prisma from "../lib/prisma.js";

const norm = (v) => (v === undefined || v === null || v === "" ? null : v);

// Garante que apenas um contato de um cliente fique como principal.
// Se `novoPrincipalId` for fornecido, ele permanece como principal; os
// demais sao zerados.
async function manterUnicoPrincipal(tx, clienteId, novoPrincipalId) {
  await tx.contato.updateMany({
    where: {
      clienteId,
      principal: true,
      ...(novoPrincipalId ? { NOT: { id: novoPrincipalId } } : {}),
    },
    data: { principal: false },
  });
}

export async function listar(req, res, next) {
  try {
    const { clienteId } = req.params;
    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) return res.status(404).json({ erro: "Cliente nao encontrado" });

    const contatos = await prisma.contato.findMany({
      where: { clienteId },
      orderBy: [{ principal: "desc" }, { nome: "asc" }],
    });
    res.json(contatos);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const { clienteId } = req.params;
    const { nome, cargo, email, telefone, principal, observacoes } = req.body;

    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ erro: "Nome e obrigatorio" });
    }

    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) return res.status(404).json({ erro: "Cliente nao encontrado" });

    const contato = await prisma.$transaction(async (tx) => {
      const criado = await tx.contato.create({
        data: {
          clienteId,
          nome: String(nome).trim(),
          cargo: norm(cargo),
          email: norm(email),
          telefone: norm(telefone),
          observacoes: norm(observacoes),
          principal: !!principal,
        },
      });
      if (criado.principal) {
        await manterUnicoPrincipal(tx, clienteId, criado.id);
      }
      return criado;
    });

    res.status(201).json(contato);
  } catch (err) {
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const { clienteId, id } = req.params;
    const existente = await prisma.contato.findUnique({ where: { id } });
    if (!existente || existente.clienteId !== clienteId) {
      return res.status(404).json({ erro: "Contato nao encontrado" });
    }

    const b = req.body;
    const data = {};
    if (b.nome !== undefined) {
      const n = String(b.nome).trim();
      if (!n) return res.status(400).json({ erro: "Nome nao pode ser vazio" });
      data.nome = n;
    }
    if (b.cargo !== undefined) data.cargo = norm(b.cargo);
    if (b.email !== undefined) data.email = norm(b.email);
    if (b.telefone !== undefined) data.telefone = norm(b.telefone);
    if (b.observacoes !== undefined) data.observacoes = norm(b.observacoes);
    if (b.principal !== undefined) data.principal = !!b.principal;

    const contato = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.contato.update({ where: { id }, data });
      if (atualizado.principal) {
        await manterUnicoPrincipal(tx, clienteId, atualizado.id);
      }
      return atualizado;
    });

    res.json(contato);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Contato nao encontrado" });
    next(err);
  }
}

export async function excluir(req, res, next) {
  try {
    const { clienteId, id } = req.params;
    const existente = await prisma.contato.findUnique({ where: { id } });
    if (!existente || existente.clienteId !== clienteId) {
      return res.status(404).json({ erro: "Contato nao encontrado" });
    }
    await prisma.contato.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Contato nao encontrado" });
    next(err);
  }
}
