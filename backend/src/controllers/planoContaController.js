import prisma from "../lib/prisma.js";
import { garantirPlanoContasPadrao, PLANO_CONTAS_PADRAO } from "../lib/planoContasPadrao.js";

const NATUREZAS = new Set(["RECEITA", "DESPESA"]);

// Lista o plano de contas (flat, ordenado por codigo). Na primeira chamada do
// tenant, cria o plano padrao automaticamente (UX: o cliente nunca ve a tela
// vazia). Filtros: ?natureza=DESPESA, ?analitica=true, ?ativo=true.
export async function listar(req, res, next) {
  try {
    await garantirPlanoContasPadrao(prisma, req.tenantId);

    const where = {};
    if (req.query.natureza && NATUREZAS.has(req.query.natureza)) {
      where.natureza = req.query.natureza;
    }
    if (req.query.analitica !== undefined) {
      where.analitica = req.query.analitica === "true";
    }
    if (req.query.ativo !== undefined) {
      where.ativo = req.query.ativo === "true";
    }

    const contas = await prisma.planoConta.findMany({
      where,
      orderBy: { codigo: "asc" },
    });
    res.json(contas);
  } catch (err) {
    next(err);
  }
}

// Mesma lista, porem aninhada em arvore (filhos dentro de cada pai). Util para
// renderizar o plano hierarquico no frontend.
export async function arvore(req, res, next) {
  try {
    await garantirPlanoContasPadrao(prisma, req.tenantId);
    const contas = await prisma.planoConta.findMany({ orderBy: { codigo: "asc" } });

    const porId = new Map();
    for (const c of contas) porId.set(c.id, { ...c, filhos: [] });
    const raizes = [];
    for (const c of porId.values()) {
      if (c.paiId && porId.has(c.paiId)) porId.get(c.paiId).filhos.push(c);
      else raizes.push(c);
    }
    res.json(raizes);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const { codigo, nome, natureza = "DESPESA", analitica = true,
            paiId, codigoContabilExterno } = req.body;

    if (!codigo || !String(codigo).trim()) {
      return res.status(400).json({ erro: "Codigo e obrigatorio" });
    }
    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ erro: "Nome e obrigatorio" });
    }
    if (!NATUREZAS.has(natureza)) {
      return res.status(400).json({ erro: "Natureza invalida (RECEITA ou DESPESA)" });
    }

    // Valida o pai (precisa existir no mesmo tenant). O findUnique do extension
    // ja filtra por tenant.
    if (paiId) {
      const pai = await prisma.planoConta.findUnique({ where: { id: paiId } });
      if (!pai) return res.status(400).json({ erro: "Conta pai inexistente" });
    }

    const conta = await prisma.planoConta.create({
      data: {
        codigo: String(codigo).trim(),
        nome: String(nome).trim(),
        natureza,
        analitica: Boolean(analitica),
        paiId: paiId || null,
        codigoContabilExterno: codigoContabilExterno
          ? String(codigoContabilExterno).trim() : null,
      },
    });
    res.status(201).json(conta);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ erro: "Ja existe uma conta com esse codigo" });
    }
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const existente = await prisma.planoConta.findUnique({ where: { id: req.params.id } });
    if (!existente) return res.status(404).json({ erro: "Conta nao encontrada" });

    const data = {};
    if (req.body.codigo !== undefined) {
      const c = String(req.body.codigo).trim();
      if (!c) return res.status(400).json({ erro: "Codigo nao pode ser vazio" });
      data.codigo = c;
    }
    if (req.body.nome !== undefined) {
      const n = String(req.body.nome).trim();
      if (!n) return res.status(400).json({ erro: "Nome nao pode ser vazio" });
      data.nome = n;
    }
    if (req.body.natureza !== undefined) {
      if (!NATUREZAS.has(req.body.natureza)) {
        return res.status(400).json({ erro: "Natureza invalida" });
      }
      data.natureza = req.body.natureza;
    }
    if (req.body.analitica !== undefined) data.analitica = Boolean(req.body.analitica);
    if (req.body.ativo !== undefined) data.ativo = Boolean(req.body.ativo);
    if (req.body.codigoContabilExterno !== undefined) {
      data.codigoContabilExterno = req.body.codigoContabilExterno
        ? String(req.body.codigoContabilExterno).trim() : null;
    }
    if (req.body.paiId !== undefined) {
      if (req.body.paiId && req.body.paiId === req.params.id) {
        return res.status(400).json({ erro: "Uma conta nao pode ser pai de si mesma" });
      }
      if (req.body.paiId) {
        const pai = await prisma.planoConta.findUnique({ where: { id: req.body.paiId } });
        if (!pai) return res.status(400).json({ erro: "Conta pai inexistente" });
      }
      data.paiId = req.body.paiId || null;
    }

    const conta = await prisma.planoConta.update({ where: { id: req.params.id }, data });
    res.json(conta);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ erro: "Ja existe uma conta com esse codigo" });
    }
    if (err.code === "P2025") return res.status(404).json({ erro: "Conta nao encontrada" });
    next(err);
  }
}

// Remove uma conta. Bloqueia se ela tiver filhos ou lancamentos vinculados
// (despesa/conta a pagar) — nesses casos o correto e desativar (ativo=false).
export async function excluir(req, res, next) {
  try {
    const conta = await prisma.planoConta.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { filhos: true, despesas: true, contasPagar: true } },
      },
    });
    if (!conta) return res.status(404).json({ erro: "Conta nao encontrada" });

    if (conta._count.filhos > 0) {
      return res.status(409).json({ erro: "Conta possui subcontas. Remova-as primeiro ou desative." });
    }
    if (conta._count.despesas > 0 || conta._count.contasPagar > 0) {
      return res.status(409).json({ erro: "Conta possui lancamentos. Desative em vez de excluir." });
    }

    await prisma.planoConta.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Conta nao encontrada" });
    next(err);
  }
}

// (Re)cria o plano padrao explicitamente (botao "restaurar padrao" no front).
// So age se o tenant ainda nao tiver contas.
export async function restaurarPadrao(req, res, next) {
  try {
    const r = await garantirPlanoContasPadrao(prisma, req.tenantId);
    res.json({ ...r, total: PLANO_CONTAS_PADRAO.length });
  } catch (err) {
    next(err);
  }
}
