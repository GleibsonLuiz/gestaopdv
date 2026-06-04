// ============ DISTRIBUICAO DF-e (NF-e recebidas contra o CNPJ) — Fase A ============
//
// "Caixa de entrada" da SEFAZ. sincronizarDFe consulta o gateway a partir do
// cursor NSU (ConfiguracaoEmpresa.dfeUltimoNSU), grava os resumos novos em
// DocumentoRecebidoDFe e avanca o cursor. baixarDFe manifesta ciencia + baixa o
// XML completo + materializa uma NotaFiscalEntrada (RECEBIDA) — daí segue o
// fluxo de conciliacao normal. Na Fase A o provedor e o `mock`; o adapter real
// (NuvemFiscal) so liga na Fase B (requer certificado A1).

import prisma, { prismaRaw } from "../lib/prisma.js";
import { getProvedor, ErroFiscal } from "../lib/fiscal/provedor.js";
import { corpoErroFiscal } from "../lib/fiscal/rejeicoes.js";
import { compararSegredo } from "../lib/timingSafe.js";
import { materializarEntradaDoXml } from "./notaEntradaController.js";

// Backoff anti "consumo indevido" (cStat 656): nao reconsultar a distribuicao
// com menos de 1h de intervalo quando o cron roda automaticamente.
const INTERVALO_DFE_MIN = 60;
const MAX_PAGINAS = 50; // teto de paginacao por execucao (seguranca)

// Drena a distribuicao a partir do cursor do tenant, gravando resumos novos.
// client = prisma (request, tenant via extension) ou prismaRaw (cron, tenantId
// explicito). Avanca dfeUltimoNSU/dfeUltimaConsulta. Idempotente pelo NSU.
async function drenarDistribuicao({ config, prov, client, tenantId }) {
  let cursor = config.dfeUltimoNSU || "0";
  let novos = 0, vistos = 0;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const r = await prov.distribuirDFe({ cnpjEmitente: config.cnpj, ultimoNSU: cursor });
    for (const doc of r.documentos || []) {
      vistos++;
      try {
        await client.documentoRecebidoDFe.create({
          data: {
            nsu: String(doc.nsu),
            tipo: doc.tipo || "RESUMO_NFE",
            chaveAcesso: doc.chave || null,
            status: "PENDENTE",
            emitenteCnpj: doc.emitenteCnpj || null,
            emitenteNome: doc.emitenteNome || null,
            valorTotal: doc.valorTotal ?? null,
            dataEmissao: doc.dataEmissao ? new Date(doc.dataEmissao) : null,
            resumoJson: doc,
            ...(tenantId ? { tenantId } : {}),
          },
        });
        novos++;
      } catch (e) {
        if (e.code !== "P2002") throw e; // NSU ja gravado — pula (idempotente)
      }
    }

    const novoCursor = r.ultimoNSU || cursor;
    await client.configuracaoEmpresa.update({
      where: { id: config.id },
      data: { dfeUltimoNSU: novoCursor, dfeUltimaConsulta: new Date() },
    });

    const drenou = !(r.documentos && r.documentos.length) || Number(novoCursor) >= Number(r.maxNSU || novoCursor);
    cursor = novoCursor;
    if (drenou) break;
  }

  return { novos, vistos, ultimoNSU: cursor };
}

// POST /fiscal/dfe/sincronizar — consulta manual (ADMIN/GERENTE). Sem backoff.
export async function sincronizarDFe(req, res, next) {
  try {
    const config = await prisma.configuracaoEmpresa.findFirst();
    if (!config?.provedorFiscal) return res.status(400).json({ erro: "Provedor fiscal nao configurado." });
    if (!config.cnpj) return res.status(400).json({ erro: "CNPJ da empresa nao configurado." });
    const prov = getProvedor(config.provedorFiscal);
    if (typeof prov.distribuirDFe !== "function") {
      return res.status(400).json({ erro: "O provedor configurado nao suporta distribuicao de DF-e." });
    }
    const r = await drenarDistribuicao({ config, prov, client: prisma, tenantId: null });
    res.json({ ok: true, novos: r.novos, vistos: r.vistos, ultimoNSU: r.ultimoNSU });
  } catch (err) {
    if (err instanceof ErroFiscal) return res.status(422).json(corpoErroFiscal(err));
    next(err);
  }
}

// GET /fiscal/dfe — caixa de entrada (resumos recebidos)
export async function listarDFe(req, res, next) {
  try {
    const status = req.query?.status ? String(req.query.status) : undefined;
    const take = Math.min(Number(req.query?.limit) || 200, 500);
    const docs = await prisma.documentoRecebidoDFe.findMany({
      where: { ...(status ? { status } : {}) },
      orderBy: { nsu: "desc" },
      take,
      select: {
        id: true, nsu: true, tipo: true, chaveAcesso: true, status: true,
        emitenteCnpj: true, emitenteNome: true, valorTotal: true, dataEmissao: true,
        notaEntradaId: true, createdAt: true,
      },
    });
    res.json(docs);
  } catch (err) { next(err); }
}

// POST /fiscal/dfe/:id/baixar — manifesta ciencia + baixa o XML completo +
// materializa NotaFiscalEntrada (RECEBIDA). Devolve o id da nota p/ conciliar.
export async function baixarDFe(req, res, next) {
  try {
    const doc = await prisma.documentoRecebidoDFe.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ erro: "Documento nao encontrado." });
    if (doc.status === "XML_BAIXADO" && doc.notaEntradaId) {
      return res.json({ doc, notaEntradaId: doc.notaEntradaId, aviso: "XML ja baixado." });
    }
    if (doc.status === "IGNORADO") return res.status(400).json({ erro: "Documento ignorado." });
    if (!doc.chaveAcesso) return res.status(400).json({ erro: "Documento sem chave de acesso — nada a baixar." });

    const config = await prisma.configuracaoEmpresa.findFirst();
    const prov = getProvedor(config?.provedorFiscal);

    // Ciencia da operacao (best-effort — alguns gateways exigem antes do download).
    try { await prov.manifestar({ cnpjEmitente: config?.cnpj, chave: doc.chaveAcesso, tipoEvento: "CIENCIA" }); }
    catch { /* segue para o download mesmo assim */ }

    const xml = await prov.baixarXmlEntrada({ cnpjEmitente: config?.cnpj, chave: doc.chaveAcesso });
    const { nota } = await materializarEntradaDoXml(xml, { userId: req.user.sub });

    const atualizado = await prisma.documentoRecebidoDFe.update({
      where: { id: doc.id },
      data: { status: "XML_BAIXADO", notaEntradaId: nota.id },
    });
    res.json({ doc: atualizado, notaEntradaId: nota.id });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.message });
    if (err instanceof ErroFiscal) return res.status(422).json(corpoErroFiscal(err));
    next(err);
  }
}

// POST /fiscal/dfe/:id/ignorar
export async function ignorarDFe(req, res, next) {
  try {
    const doc = await prisma.documentoRecebidoDFe.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).json({ erro: "Documento nao encontrado." });
    if (doc.status === "XML_BAIXADO") {
      return res.status(400).json({ erro: "Documento ja baixado — gerencie pela Entrada de NF-e." });
    }
    const atualizado = await prisma.documentoRecebidoDFe.update({ where: { id: doc.id }, data: { status: "IGNORADO" } });
    res.json({ doc: atualizado });
  } catch (err) { next(err); }
}

// GET/POST /cron/fiscal-dfe — distribuicao automatica (Bearer CRON_SECRET).
// Cross-tenant, com backoff de 1h por tenant (anti cStat 656). Tenants em `mock`
// recebem as notas simuladas; em provedor real, so na Fase B.
export async function cronDistribuirDFe(req, res, next) {
  try {
    const chave = process.env.CRON_SECRET;
    if (!chave) return res.status(503).json({ erro: "CRON_SECRET nao configurado no servidor" });
    const header = req.headers.authorization || "";
    const recebido = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!compararSegredo(recebido, chave)) return res.status(401).json({ erro: "Chave de cron invalida" });

    const agora = new Date();
    const configs = await prismaRaw.configuracaoEmpresa.findMany({
      where: { fiscalAtivo: true, cnpj: { not: null }, provedorFiscal: { not: null } },
    });

    const stats = { tenants: 0, novos: 0, pulados: 0, erros: 0 };
    for (const cfg of configs) {
      // Backoff: respeita o intervalo minimo entre consultas (SEFAZ cStat 656).
      if (cfg.dfeUltimaConsulta && agora.getTime() - new Date(cfg.dfeUltimaConsulta).getTime() < INTERVALO_DFE_MIN * 60000) {
        stats.pulados++; continue;
      }
      try {
        const prov = getProvedor(cfg.provedorFiscal);
        if (typeof prov.distribuirDFe !== "function") { stats.pulados++; continue; }
        const r = await drenarDistribuicao({ config: cfg, prov, client: prismaRaw, tenantId: cfg.tenantId });
        stats.tenants++; stats.novos += r.novos;
      } catch {
        stats.erros++; // provedor sem suporte/erro (ex.: nuvemfiscal Fase B) — pula
      }
    }
    res.json({ ok: true, ...stats, executadoEm: agora.toISOString() });
  } catch (err) {
    next(err);
  }
}
