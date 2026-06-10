import prisma from "../lib/prisma.js";
import { obterUsoELimites, limiteDispositivosEfetivo } from "../lib/planoLimites.js";
import { modulosDaEmpresa } from "../lib/modulosPlano.js";
import { listarDispositivos, revogarDispositivo, renomearDispositivo } from "../lib/dispositivos.js";
import { registrarEvento } from "../middlewares/auditoria.js";

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
      // Modulos efetivos liberados para a empresa (pacote do plano + override).
      modulos: modulosDaEmpresa(empresa),
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

// ============ AUTOGESTAO DE DISPOSITIVOS (LICENCA POR MAQUINA) ============
//
// O proprio lojista (ADMIN/GERENTE do tenant) gerencia as maquinas conectadas
// — sem depender do super-admin. Escopo sempre no tenant logado (req.tenantId).
// O dispositivo da sessao atual e marcado com `atual: true` (claim `did` do JWT)
// para o front avisar antes de a pessoa se auto-desconectar.

// GET /empresa/dispositivos
export async function listarDispositivosEmpresa(req, res, next) {
  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: req.tenantId },
      select: { plano: true, maxDispositivos: true },
    });
    const dispositivos = await listarDispositivos(req.tenantId);
    const atualId = req.user?.did || null;
    res.json({
      limite: limiteDispositivosEfetivo(empresa),         // null = ilimitado
      ativos: dispositivos.filter(d => d.ativo).length,
      dispositivoAtualId: atualId,
      dispositivos: dispositivos.map(d => ({ ...d, atual: d.id === atualId })),
    });
  } catch (err) {
    next(err);
  }
}

// POST /empresa/dispositivos/:id/revogar — ADMIN/GERENTE derruba uma maquina.
export async function revogarDispositivoEmpresa(req, res, next) {
  try {
    if (!["ADMIN", "GERENTE"].includes(req.user.role)) {
      return res.status(403).json({ erro: "Apenas administradores ou gerentes" });
    }
    const revogado = await revogarDispositivo({
      tenantId: req.tenantId, dispositivoId: req.params.id, por: "CLIENTE",
    });
    if (!revogado) return res.status(404).json({ erro: "Dispositivo nao encontrado" });
    registrarEvento({
      acao: "DISPOSITIVO_REVOGADO", modulo: "EMPRESA", sucesso: true,
      usuarioId: req.user.sub, usuarioNome: req.user.nome,
      tenantId: req.tenantId,
      mensagem: `Lojista desconectou o dispositivo ${req.params.id}`,
      req,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// PATCH /empresa/dispositivos/:id — renomeia (apelido). ADMIN/GERENTE.
export async function renomearDispositivoEmpresa(req, res, next) {
  try {
    if (!["ADMIN", "GERENTE"].includes(req.user.role)) {
      return res.status(403).json({ erro: "Apenas administradores ou gerentes" });
    }
    const nome = req.body?.nome;
    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ erro: "Nome e obrigatorio" });
    }
    const d = await renomearDispositivo({
      tenantId: req.tenantId, dispositivoId: req.params.id, nome,
    });
    if (!d) return res.status(404).json({ erro: "Dispositivo nao encontrado" });
    res.json({ ok: true, nome: d.nome });
  } catch (err) {
    next(err);
  }
}
