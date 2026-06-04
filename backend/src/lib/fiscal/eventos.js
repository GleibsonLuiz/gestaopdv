// ============ TRILHA DE EVENTOS FISCAIS (auditoria + retry) ============
//
// Grava uma linha em DocumentoFiscalEvento por interacao com a SEFAZ/gateway
// (transmissao, consulta, cancelamento, inutilizacao). Serve a TRES fins:
//
//   1. Log legivel — a tela de detalhe da nota mostra a timeline em pt-BR
//      (mensagemAmigavel), nao so o xMotivo cru (Ponto 4 do plano).
//   2. Retry — o worker de reconsulta (Onda 3) varre por
//      (resultado, proximaTentativaEm) para drenar notas PROCESSANDO.
//   3. Idempotencia — payloadHash detecta reenvio acidental no timeout.
//
// REGRA: registrar evento e BEST-EFFORT. Nunca pode derrubar a emissao — se a
// gravacao do log falhar, a nota ja esta (ou nao) autorizada de qualquer jeito.
// Por isso todo erro aqui e engolido.
//
// O tenantId e preenchido automaticamente pelo extension de tenancy
// (lib/prisma.js) a partir do contexto do request — DocumentoFiscalEvento esta
// em MODELOS_COM_TENANT.

import prisma, { prismaRaw } from "../prisma.js";
import { traduzir } from "./rejeicoes.js";

// resultado ∈ "OK" | "REJEITADO" | "TIMEOUT" | "ERRO_REDE" | "OFFLINE" | "ERRO"
// tipo      ∈ "VALIDACAO" | "TRANSMISSAO" | "CONSULTA" | "CANCELAMENTO" | "INUTILIZACAO" | "RETRY"
//
// tenantId: dentro de um request HTTP, deixe null — o extension de tenancy
// preenche pelo contexto. No CRON (worker de reconsulta) NAO ha contexto de
// tenant: passe tenantId explicito; usamos prismaRaw para gravar cross-tenant.
export async function registrarEventoFiscal({
  notaFiscalId,
  tipo,
  resultado,
  cStat = null,
  xMotivo = null,
  tentativa = 1,
  proximaTentativaEm = null,
  payloadHash = null,
  tenantId = null,
}) {
  if (!notaFiscalId) return null;

  // So traduz quando houve problema — evento OK nao precisa de mensagem.
  let mensagemAmigavel = null;
  if (resultado && resultado !== "OK" && (cStat || xMotivo)) {
    const t = traduzir(cStat, xMotivo);
    mensagemAmigavel = `${t.titulo} — ${t.comoResolver}`;
  }

  const client = tenantId ? prismaRaw : prisma;
  try {
    return await client.documentoFiscalEvento.create({
      data: {
        notaFiscalId,
        tipo,
        resultado: resultado || "ERRO",
        cStat: cStat ? String(cStat) : null,
        xMotivo: xMotivo || null,
        mensagemAmigavel,
        tentativa,
        proximaTentativaEm,
        payloadHash,
        ...(tenantId ? { tenantId } : {}),
      },
    });
  } catch {
    return null; // log e best-effort — nunca propaga
  }
}

// Deriva o `resultado` do evento a partir de um ErroFiscal de transmissao.
// Erros de transporte (rede/timeout/5xx) sao retriaveis via reconsulta; uma
// rejeicao com cStat e de negocio (terminal). Usado pelos controllers.
export function classificarFalhaTransmissao(err) {
  if (err?.cStat) return "REJEITADO"; // a SEFAZ respondeu com um motivo
  const msg = String(err?.message || "").toLowerCase();
  if (msg.includes("rede") || msg.includes("network")) return "ERRO_REDE";
  if (msg.includes("timeout") || msg.includes("tempo")) return "TIMEOUT";
  return "ERRO";
}
