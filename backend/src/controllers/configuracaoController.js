import prisma from "../lib/prisma.js";

const norm = (v) => (v === undefined || v === null || v === "" ? null : String(v).trim());

const TIPOS_CAIXA_VALIDOS = new Set(["INDEPENDENTE", "COMPARTILHADO"]);

// Singleton: sempre opera no PRIMEIRO registro encontrado. Se nao houver, o
// proprio salvar() cria. GET retorna null se ainda nao foi configurado.

export async function obter(req, res, next) {
  try {
    const cfg = await prisma.configuracaoEmpresa.findFirst();
    res.json(cfg);
  } catch (err) {
    next(err);
  }
}

export async function salvar(req, res, next) {
  try {
    // Partial update: so toca em campos efetivamente presentes no body. Isso
    // permite chamadas pontuais (ex: trocar so telefone) sem precisar reenviar
    // a config inteira.
    const data = {};
    const camposTextoUpper = ["razaoSocial", "nomeFantasia", "endereco", "bairro", "cidade", "observacoes"];
    const camposTextoLivre = ["cnpj", "inscEstadual", "telefone", "email", "numero", "cep"];

    for (const k of camposTextoUpper) {
      if (req.body?.[k] !== undefined) {
        data[k] = norm(req.body[k])?.toUpperCase() ?? null;
      }
    }
    for (const k of camposTextoLivre) {
      if (req.body?.[k] !== undefined) {
        data[k] = norm(req.body[k]);
      }
    }
    if (req.body?.estado !== undefined) {
      data.estado = norm(req.body.estado)?.toUpperCase().slice(0, 2) ?? null;
    }

    // tipoCaixa controla a politica de caixa do sistema. Bloqueia mudanca
    // quando ha caixa ABERTO — trocar a politica com caixa aberto deixaria
    // o estado inconsistente entre os dois modos.
    if (req.body?.tipoCaixa !== undefined) {
      const tc = String(req.body.tipoCaixa).toUpperCase().trim();
      if (!TIPOS_CAIXA_VALIDOS.has(tc)) {
        return res.status(400).json({
          erro: "Tipo de caixa invalido. Use INDEPENDENTE ou COMPARTILHADO.",
        });
      }
      data.tipoCaixa = tc;
    }

    const existente = await prisma.configuracaoEmpresa.findFirst();

    if (data.tipoCaixa && existente && existente.tipoCaixa !== data.tipoCaixa) {
      const algumAberto = await prisma.caixa.findFirst({
        where: { status: "ABERTO" },
        select: { id: true, numero: true, user: { select: { nome: true } } },
      });
      if (algumAberto) {
        return res.status(409).json({
          erro: `Existe caixa aberto (#${algumAberto.numero}` +
            (algumAberto.user?.nome ? ` — ${algumAberto.user.nome}` : "") +
            "). Feche todos os caixas antes de alterar a politica de caixa.",
        });
      }
    }

    // Validacao de razaoSocial: obrigatoria so na CRIACAO ou se for limpada.
    if (!existente) {
      const rs = data.razaoSocial?.trim();
      if (!rs) return res.status(400).json({ erro: "Razao social e obrigatoria" });
    } else if (data.razaoSocial !== undefined && !data.razaoSocial?.trim()) {
      return res.status(400).json({ erro: "Razao social nao pode ser vazia" });
    }

    const cfg = existente
      ? await prisma.configuracaoEmpresa.update({ where: { id: existente.id }, data })
      : await prisma.configuracaoEmpresa.create({ data });

    res.json(cfg);
  } catch (err) {
    next(err);
  }
}
