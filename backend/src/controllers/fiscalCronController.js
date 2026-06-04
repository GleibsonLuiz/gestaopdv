// ============ WORKER DE RECONSULTA FISCAL (Onda 2) ============
//
// Rede de seguranca para notas que ficaram PROCESSANDO — quando a SEFAZ/gateway
// nao confirmou na emissao (timeout, rede caiu, servico fora do ar). O worker
// RECONSULTA o gateway pelo idIntegracao; NUNCA reenvia (reenvio duplicaria a
// nota -> rejeicao 539). Roda cross-tenant (sem contexto de tenant), entao usa
// prismaRaw e passa tenantId explicito.
//
// Cadencia: backoff exponencial derivado de (tentativas, ultimaTentativa) —
// ver lib/fiscal/backoff.js. Esgotado o ciclo, a nota vira CONTINGENCIA
// (intervencao manual). Autenticado por Bearer ${CRON_SECRET}, igual aos demais
// crons (billing/automacoes). Idempotente: rodar de novo so reavalia quem venceu.

import { prismaRaw } from "../lib/prisma.js";
import { compararSegredo } from "../lib/timingSafe.js";
import { getProvedor, ErroFiscal } from "../lib/fiscal/provedor.js";
import { registrarEventoFiscal, classificarFalhaTransmissao } from "../lib/fiscal/eventos.js";
import { dadosDoResultado as dadosNfce } from "./fiscalController.js";
import { dadosDoResultado as dadosNfse } from "./nfseController.js";
import { estaVencida, deveDesistir, proximaTentativaEm } from "../lib/fiscal/backoff.js";
import { avaliarCertificado } from "../lib/fiscal/certificado.js";

const LIMITE_POR_EXECUCAO = 200;

function autorizarCron(req, res) {
  const chave = process.env.CRON_SECRET;
  if (!chave) {
    res.status(503).json({ erro: "CRON_SECRET nao configurado no servidor" });
    return false;
  }
  const header = req.headers.authorization || "";
  const recebido = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!compararSegredo(recebido, chave)) {
    res.status(401).json({ erro: "Chave de cron invalida" });
    return false;
  }
  return true;
}

// Resultado da reconsulta -> rotulo do evento.
function rotuloEvento(status) {
  if (status === "AUTORIZADA") return "OK";
  if (status === "REJEITADA" || status === "DENEGADA") return "REJEITADO";
  return "ERRO"; // ainda PROCESSANDO ou estado inesperado: nao e desfecho
}

// GET/POST /cron/fiscal-pendentes — drena notas PROCESSANDO reconsultando o gateway.
export async function cronReconsultarPendentes(req, res, next) {
  try {
    if (!autorizarCron(req, res)) return;

    const agora = new Date();
    const pendentes = await prismaRaw.notaFiscal.findMany({
      where: { status: "PROCESSANDO", idIntegracaoProvedor: { not: null } },
      orderBy: { updatedAt: "asc" },
      take: LIMITE_POR_EXECUCAO,
    });

    // Cache de config por tenant (evita refetch quando varias notas do mesmo).
    const configCache = new Map();
    async function configDe(tenantId) {
      if (configCache.has(tenantId)) return configCache.get(tenantId);
      const c = await prismaRaw.configuracaoEmpresa.findFirst({ where: { tenantId } });
      configCache.set(tenantId, c);
      return c;
    }

    const stats = { candidatas: pendentes.length, consultadas: 0, resolvidas: 0, contingencia: 0, puladas: 0, falhas: 0 };

    for (const nota of pendentes) {
      // Quantas reconsultas ja houve (HTTP "Consultar" + worker).
      const tentativasFeitas = await prismaRaw.documentoFiscalEvento.count({
        where: { notaFiscalId: nota.id, tipo: { in: ["CONSULTA", "RETRY"] } },
      });

      // Ainda dentro do intervalo de backoff: deixa para a proxima execucao.
      if (!estaVencida(tentativasFeitas, nota.updatedAt, agora)) { stats.puladas++; continue; }

      // Esgotou o ciclo de reconsulta -> CONTINGENCIA (requer verificacao manual).
      if (deveDesistir(tentativasFeitas)) {
        await prismaRaw.notaFiscal.update({ where: { id: nota.id }, data: { status: "CONTINGENCIA" } });
        await registrarEventoFiscal({
          notaFiscalId: nota.id, tenantId: nota.tenantId, tipo: "RETRY", resultado: "ERRO",
          xMotivo: `Sem confirmacao da SEFAZ apos ${tentativasFeitas} tentativas. Requer verificacao manual.`,
          tentativa: tentativasFeitas + 1,
        });
        stats.contingencia++;
        continue;
      }

      const config = await configDe(nota.tenantId);
      const provedor = nota.provedorFiscal || config?.provedorFiscal;
      if (!provedor) { stats.puladas++; continue; }

      const ehNfse = nota.modelo === "NFSE";
      try {
        const prov = getProvedor(provedor);
        const resultado = ehNfse
          ? await prov.consultarNfse({ cnpjEmitente: config?.cnpj, idIntegracao: nota.idIntegracaoProvedor })
          : await prov.consultarNfce({ cnpjEmitente: config?.cnpj, idIntegracao: nota.idIntegracaoProvedor });

        const dados = ehNfse ? dadosNfse(resultado) : dadosNfce(resultado);
        // Autorizou agora: baixa o XML (best-effort).
        if (resultado.status === "AUTORIZADA" && !nota.xmlAutorizado) {
          try {
            dados.xmlAutorizado = ehNfse
              ? await prov.obterXmlNfse({ idIntegracao: nota.idIntegracaoProvedor })
              : await prov.obterXml({ idIntegracao: nota.idIntegracaoProvedor });
          } catch { /* XML best-effort */ }
        }
        await prismaRaw.notaFiscal.update({ where: { id: nota.id }, data: dados });

        const aindaProcessando = resultado.status === "PROCESSANDO";
        await registrarEventoFiscal({
          notaFiscalId: nota.id, tenantId: nota.tenantId, tipo: "RETRY",
          resultado: rotuloEvento(resultado.status),
          cStat: resultado.cStat, xMotivo: resultado.xMotivo,
          tentativa: tentativasFeitas + 1,
          proximaTentativaEm: aindaProcessando ? proximaTentativaEm(tentativasFeitas + 1, { desde: agora }) : null,
        });
        stats.consultadas++;
        if (!aindaProcessando) stats.resolvidas++;
      } catch (err) {
        // Falha de transporte na propria reconsulta: nota segue PROCESSANDO,
        // agenda a proxima. NUNCA reenvia.
        await registrarEventoFiscal({
          notaFiscalId: nota.id, tenantId: nota.tenantId, tipo: "RETRY",
          resultado: err instanceof ErroFiscal ? classificarFalhaTransmissao(err) : "ERRO",
          cStat: err?.cStat, xMotivo: err?.xMotivo || err?.message,
          tentativa: tentativasFeitas + 1,
          proximaTentativaEm: proximaTentativaEm(tentativasFeitas + 1, { desde: agora }),
        });
        stats.falhas++;
      }
    }

    res.json({ ok: true, ...stats, executadoEm: agora.toISOString() });
  } catch (err) {
    next(err);
  }
}

// ============ MONITOR DE CERTIFICADO A1 (Onda 5) ============

// Cria a notificacao in-app de vencimento de certificado para um tenant. O
// model Notificacao exige criadoPorId (User), entao atribuimos a um ADMIN do
// proprio tenant. Sem usuario p/ atribuir, so cacheia (devolve false).
async function criarNotificacaoCertificado(tenantId, aval) {
  const criador =
    (await prismaRaw.user.findFirst({
      where: { tenantId, role: "ADMIN", ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true },
    })) ||
    (await prismaRaw.user.findFirst({
      where: { tenantId }, orderBy: { createdAt: "asc" }, select: { id: true },
    }));
  if (!criador) return false;
  try {
    await prismaRaw.notificacao.create({
      data: {
        titulo: aval.titulo,
        mensagem: aval.mensagem,
        tipo: "AVISO",
        ativa: true,
        // Some 7 dias apos o vencimento (ja renovado/expirado a essa altura).
        expiraEm: aval.validade ? new Date(new Date(aval.validade).getTime() + 7 * 86400000) : null,
        criadoPorId: criador.id,
        destinoTenantId: tenantId,
      },
    });
    return true;
  } catch {
    return false; // notificacao e best-effort — o cache da validade ja foi gravado
  }
}

// GET/POST /cron/fiscal-certificados — consulta a validade do A1 no gateway,
// cacheia em ConfiguracaoEmpresa e notifica o tenant ao entrar numa banda de
// alerta (30/15/7/1 dias / vencido), sem repetir o aviso diariamente.
export async function cronVerificarCertificados(req, res, next) {
  try {
    if (!autorizarCron(req, res)) return;

    const agora = new Date();
    const configs = await prismaRaw.configuracaoEmpresa.findMany({
      where: { fiscalAtivo: true, cnpj: { not: null }, provedorFiscal: { not: null } },
    });

    const stats = { verificados: 0, comAlerta: 0, notificados: 0, pulados: 0, erros: 0 };

    for (const cfg of configs) {
      // Simulador nao tem A1 real — pula.
      if (!cfg.provedorFiscal || cfg.provedorFiscal === "mock") { stats.pulados++; continue; }

      let validade = null;
      try {
        const prov = getProvedor(cfg.provedorFiscal);
        if (typeof prov.consultarCertificado !== "function") { stats.pulados++; continue; }
        const cert = await prov.consultarCertificado({ cnpjEmitente: cfg.cnpj });
        validade = cert?.validade || null;
      } catch {
        stats.erros++; // gateway sem suporte/erro: nao derruba o cron
        continue;
      }
      stats.verificados++;

      const aval = avaliarCertificado(validade, agora);
      const data = {
        certificadoUltimaChecagem: agora,
        certificadoValidade: aval.temData ? new Date(aval.validade) : null,
      };

      if (!aval.alerta) {
        // Folgado (>30 dias) ou sem data: zera a banda p/ re-notificar no futuro.
        data.certificadoAlertaNivel = null;
      } else {
        const ja = cfg.certificadoAlertaNivel; // null | 30 | 15 | 7 | 1 | 0
        const maisUrgente = ja == null || aval.nivelAlerta < ja;
        if (maisUrgente) {
          stats.comAlerta++;
          if (await criarNotificacaoCertificado(cfg.tenantId, aval)) stats.notificados++;
          data.certificadoAlertaNivel = aval.nivelAlerta;
        }
      }

      await prismaRaw.configuracaoEmpresa.update({ where: { id: cfg.id }, data });
    }

    res.json({ ok: true, ...stats, executadoEm: agora.toISOString() });
  } catch (err) {
    next(err);
  }
}
