import prisma from "../lib/prisma.js";
import { obterUsoELimites } from "../lib/planoLimites.js";

// ============ EMPRESA (TENANT) DO USUARIO LOGADO ============
//
// Distinto de configuracaoController (que cuida da ConfiguracaoEmpresa,
// dados editaveis usados em PDF/recibos). Este controller opera na
// entidade Empresa que representa o tenant em si — nome de exibicao,
// CNPJ legal, status ativo, e estatisticas basicas (usuarios, criada em).
//
// Graças ao Prisma extension da ETAPA 3, GET/PUT operam automaticamente
// na empresa do tenant atual (req.tenantId injetado pelo authRequired).
// findFirst sem where retorna so a Empresa do tenant logado.

const REGEX_CNPJ = /^\d{14}$/;

export async function obter(req, res, next) {
  try {
    // O extension filtra automaticamente, mas Empresa NAO esta em
    // MODELOS_COM_TENANT (e o proprio tenant root). Buscamos via id =
    // req.tenantId que vem do middleware.
    const empresa = await prisma.empresa.findUnique({
      where: { id: req.tenantId },
      include: {
        _count: {
          select: { users: true, clientes: true, produtos: true, vendas: true },
        },
      },
    });
    if (!empresa) return res.status(404).json({ erro: "Empresa nao encontrada" });

    // ETAPA 13: snapshot de uso vs limites por plano
    const planoInfo = await obterUsoELimites(req.tenantId);

    res.json({
      id: empresa.id,
      nome: empresa.nome,
      cnpj: empresa.cnpj,
      ativo: empresa.ativo,
      criadaEm: empresa.createdAt,
      atualizadaEm: empresa.updatedAt,
      estatisticas: {
        usuarios: empresa._count.users,
        clientes: empresa._count.clientes,
        produtos: empresa._count.produtos,
        vendas: empresa._count.vendas,
      },
      plano: planoInfo.plano,
      expiraEm: planoInfo.expiraEm,
      limites: planoInfo.limites,
      uso: planoInfo.uso,
      // ETAPA#6: segmento e read-only para usuario comum (so super-admin altera).
      // Frontend usa pra renderizar campos extras no cadastro de produto.
      segmento: empresa.segmento,
    });
  } catch (err) {
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ erro: "Apenas administradores podem editar a empresa" });
    }

    const data = {};

    if (req.body?.nome !== undefined) {
      const nome = String(req.body.nome).trim();
      if (!nome || nome.length < 3) {
        return res.status(400).json({ erro: "Nome da empresa e obrigatorio (min 3 caracteres)" });
      }
      if (nome.length > 120) {
        return res.status(400).json({ erro: "Nome da empresa muito longo (max 120)" });
      }
      data.nome = nome;
    }

    if (req.body?.cnpj !== undefined) {
      if (req.body.cnpj === null || req.body.cnpj === "") {
        data.cnpj = null;
      } else {
        const cnpjLimpo = String(req.body.cnpj).replace(/\D/g, "");
        if (!REGEX_CNPJ.test(cnpjLimpo)) {
          return res.status(400).json({ erro: "CNPJ invalido (use 14 digitos)" });
        }
        data.cnpj = cnpjLimpo;
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ erro: "Nenhum campo informado para atualizar" });
    }

    const atualizada = await prisma.empresa.update({
      where: { id: req.tenantId },
      data,
    });

    res.json({
      id: atualizada.id,
      nome: atualizada.nome,
      cnpj: atualizada.cnpj,
      ativo: atualizada.ativo,
      criadaEm: atualizada.createdAt,
      atualizadaEm: atualizada.updatedAt,
    });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ erro: "CNPJ ja cadastrado em outra empresa" });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ erro: "Empresa nao encontrada" });
    }
    next(err);
  }
}
