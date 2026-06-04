import prisma from "../lib/prisma.js";
import { getProvedor, ErroFiscal } from "../lib/fiscal/provedor.js";
import { montarNfce } from "../lib/fiscal/montarNfce.js";
import { corpoErroFiscal } from "../lib/fiscal/rejeicoes.js";
import { registrarEventoFiscal, classificarFalhaTransmissao } from "../lib/fiscal/eventos.js";
import { validarNfce } from "../lib/fiscal/validarPayload.js";
import { checarPrazoCancelamento } from "../lib/fiscal/prazoCancelamento.js";
import { avaliarProntidao } from "./configuracaoFiscalController.js";

// ============ EMISSAO DE NFC-e (modelo 65) — Fase 3 ============
//
// POST /fiscal/nfce         emite a NFC-e de uma venda (sincrono)
// GET  /fiscal/nfce         lista as notas do tenant
// GET  /fiscal/nfce/:id     detalha uma nota
// POST /fiscal/nfce/:id/consultar  re-sincroniza com o gateway (timeout/PROCESSANDO)
//
// A numeracao fiscal (numeroFiscal) e contigua por serie e independente de
// Venda.numero. E consumida SO quando a linha NotaFiscal e criada com sucesso
// (loop com retry no @@unique[tenantId,modelo,serie,numeroFiscal]) — evita
// buracos por falha de montagem. O piso e ConfiguracaoEmpresa.proximoNumeroNfce.

const MODELO = "NFCE_65";

// cNF: 8 digitos aleatorios, diferente do nNF (regra de validacao da chave).
function gerarCNF(nNF) {
  let c;
  do {
    c = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  } while (Number(c) === Number(nNF));
  return c;
}

// Mapeia o ResultadoEmissao do provedor para os campos persistidos.
// Exportado p/ o worker de reconsulta (fiscalCronController) reusar sem drift.
export function dadosDoResultado(resultado) {
  return {
    status: resultado.status,
    cStat: resultado.cStat || null,
    xMotivo: resultado.xMotivo || null,
    chaveAcesso: resultado.chaveAcesso || null,
    protocolo: resultado.protocolo || null,
    dataAutorizacao: resultado.dataAutorizacao ? new Date(resultado.dataAutorizacao) : null,
    digestValue: resultado.digestValue || null,
    qrCode: resultado.qrCode || null,
    urlConsulta: resultado.urlConsulta || null,
    idIntegracaoProvedor: resultado.idIntegracao || null,
    mensagemErro: null,
  };
}

// POST /fiscal/nfce  — body: { vendaId }
export async function emitirNfce(req, res, next) {
  try {
    const vendaId = req.body?.vendaId;
    if (!vendaId) return res.status(400).json({ erro: "vendaId e obrigatorio." });

    const config = await prisma.configuracaoEmpresa.findFirst();
    if (!config?.fiscalAtivo) {
      return res.status(400).json({ erro: "Emissao fiscal nao esta ativa. Configure em Configuracoes > Emissao Fiscal." });
    }
    const prontidao = avaliarProntidao(config);
    if (!prontidao.pronta) {
      return res.status(400).json({ erro: "Cadastro fiscal incompleto.", faltando: prontidao.faltando });
    }

    const venda = await prisma.venda.findUnique({
      where: { id: vendaId },
      include: {
        itens: { include: { produto: true } },
        pagamentos: { orderBy: { ordem: "asc" } },
        cliente: { select: { cpfCnpj: true, nome: true } },
      },
    });
    if (!venda) return res.status(404).json({ erro: "Venda nao encontrada." });
    if (!venda.itens?.length) return res.status(400).json({ erro: "Venda sem itens." });

    // Idempotencia: se ja existe nota AUTORIZADA para a venda, devolve ela.
    const existente = await prisma.notaFiscal.findFirst({
      where: { vendaId, modelo: MODELO },
      orderBy: { createdAt: "desc" },
    });
    if (existente?.status === "AUTORIZADA") {
      return res.json({ nota: existente, aviso: "Venda ja possui NFC-e autorizada." });
    }

    const ambiente = config.ambienteFiscal || "HOMOLOGACAO";
    const serie = config.serieNfce ?? 1;
    const dest = venda.cliente?.cpfCnpj
      ? { cpfCnpj: venda.cliente.cpfCnpj, nome: venda.cliente.nome }
      : null;

    const argsBase = { config, venda, itens: venda.itens, pagamentos: venda.pagamentos, dest, ambiente, serie };

    // --- Gate A: validacao semantica ANTES de reservar numero (Onda 3) ---
    // Monta uma previa (o numero nao afeta NCM/CFOP/itens/dest) e valida. Se
    // reprovar, devolve os erros sem gastar numeracao nem chamar o gateway —
    // pega o NCM "00000000"/CFOP default que viraria rejeicao na SEFAZ.
    try {
      const numeroPrevia = existente?.numeroFiscal || 1;
      const previa = montarNfce({ ...argsBase, numeroFiscal: numeroPrevia, codigoNumerico: gerarCNF(numeroPrevia) });
      const gate = validarNfce(previa.payload);
      if (!gate.ok) {
        const lista = [...new Set(gate.erros.map((e) => e.msg))];
        return res.status(422).json({
          erro: "Corrija antes de emitir a NFC-e: " + lista.join("; "),
          erros: gate.erros,
        });
      }
    } catch (err) {
      // Guardas do proprio montarNfce (sem itens, pagamento < total, etc).
      if (err instanceof ErroFiscal) return res.status(422).json(corpoErroFiscal(err));
      throw err;
    }

    let nota, built;

    if (existente) {
      // Re-emissao de nota nao autorizada (rejeitada/erro/pendente): reaproveita
      // a MESMA numeracao (nao gera buraco) e reseta a linha.
      const numeroFiscal = existente.numeroFiscal;
      built = montarNfce({ ...argsBase, serie: existente.serie, numeroFiscal, codigoNumerico: gerarCNF(numeroFiscal) });
      await prisma.itemNotaFiscal.deleteMany({ where: { notaFiscalId: existente.id } });
      nota = await prisma.notaFiscal.update({
        where: { id: existente.id },
        data: {
          status: "PROCESSANDO", ambiente, provedorFiscal: config.provedorFiscal,
          cStat: null, xMotivo: null, mensagemErro: null,
          chaveAcesso: null, protocolo: null, dataAutorizacao: null, digestValue: null,
          qrCode: null, urlConsulta: null, xmlAutorizado: null,
          valorTotal: built.totais.valorTotal,
          valorTributos: built.totais.valorTributos,
          baseCalculoIcms: built.totais.baseCalculoIcms,
          valorIcms: built.totais.valorIcms,
          valorPis: built.totais.valorPis,
          valorCofins: built.totais.valorCofins,
          destCpfCnpj: dest?.cpfCnpj || null,
          destNome: dest?.nome || null,
          itens: { create: built.itensSnapshot },
        },
      });
    } else {
      // Nova nota: reserva numero com retry e cria a linha (consumo so no sucesso).
      const maxAgg = await prisma.notaFiscal.aggregate({
        where: { modelo: MODELO, serie }, _max: { numeroFiscal: true },
      });
      const piso = Math.max((maxAgg._max?.numeroFiscal || 0) + 1, config.proximoNumeroNfce || 1);

      for (let tentativa = 0; tentativa < 5; tentativa++) {
        const numeroFiscal = piso + tentativa;
        built = montarNfce({ ...argsBase, serie, numeroFiscal, codigoNumerico: gerarCNF(numeroFiscal) });
        try {
          nota = await prisma.notaFiscal.create({
            data: {
              modelo: MODELO, serie, numeroFiscal, ambiente, status: "PROCESSANDO",
              provedorFiscal: config.provedorFiscal,
              valorTotal: built.totais.valorTotal,
              valorTributos: built.totais.valorTributos,
              baseCalculoIcms: built.totais.baseCalculoIcms,
              valorIcms: built.totais.valorIcms,
              valorPis: built.totais.valorPis,
              valorCofins: built.totais.valorCofins,
              destCpfCnpj: dest?.cpfCnpj || null,
              destNome: dest?.nome || null,
              vendaId, userId: req.user.sub,
              itens: { create: built.itensSnapshot },
            },
          });
          // Avanca o contador de exibicao (best-effort, nao bloqueante).
          await prisma.configuracaoEmpresa.update({
            where: { id: config.id }, data: { proximoNumeroNfce: numeroFiscal + 1 },
          }).catch(() => {});
          break;
        } catch (e) {
          if (e.code === "P2002") continue; // numero corrido por outra venda — tenta o proximo
          throw e;
        }
      }
      if (!nota) return res.status(409).json({ erro: "Nao foi possivel reservar numero fiscal. Tente novamente." });
    }

    // --- Transmissao (sincrona) ---
    const prov = getProvedor(config.provedorFiscal);
    let resultado;
    try {
      resultado = await prov.emitirNfce({
        cnpjEmitente: config.cnpj, ambiente, payload: built.payload, referencia: nota.id,
      });
    } catch (err) {
      if (err instanceof ErroFiscal) {
        // Falha de transporte/HTTP: mantem PROCESSANDO p/ reconsulta posterior
        // (nunca reenviar em loop — Boas Praticas §27).
        const atual = await prisma.notaFiscal.update({
          where: { id: nota.id },
          data: { status: "PROCESSANDO", mensagemErro: err.message, cStat: err.cStat, xMotivo: err.xMotivo },
        });
        await registrarEventoFiscal({
          notaFiscalId: nota.id, tipo: "TRANSMISSAO",
          resultado: classificarFalhaTransmissao(err), cStat: err.cStat, xMotivo: err.xMotivo || err.message,
        });
        return res.status(202).json({
          nota: atual,
          aviso: "NFC-e enviada, mas sem confirmacao do provedor. Consulte o status em instantes.",
        });
      }
      throw err;
    }

    const dados = dadosDoResultado(resultado);
    if (resultado.status === "AUTORIZADA" && resultado.idIntegracao) {
      try { dados.xmlAutorizado = await prov.obterXml({ idIntegracao: resultado.idIntegracao }); }
      catch { /* XML e best-effort — pode ser baixado depois */ }
    }
    const atualizada = await prisma.notaFiscal.update({ where: { id: nota.id }, data: dados });
    await registrarEventoFiscal({
      notaFiscalId: nota.id, tipo: "TRANSMISSAO",
      resultado: resultado.status === "AUTORIZADA" ? "OK" : "REJEITADO",
      cStat: resultado.cStat, xMotivo: resultado.xMotivo,
    });
    res.json({ nota: atualizada });
  } catch (err) {
    if (err instanceof ErroFiscal) {
      return res.status(422).json(corpoErroFiscal(err));
    }
    next(err);
  }
}

// GET /fiscal/nfce  — lista (filtros simples: status, limit)
export async function listarNfce(req, res, next) {
  try {
    const status = req.query?.status ? String(req.query.status) : undefined;
    const take = Math.min(Number(req.query?.limit) || 100, 500);
    const notas = await prisma.notaFiscal.findMany({
      where: { modelo: MODELO, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true, serie: true, numeroFiscal: true, status: true, ambiente: true,
        chaveAcesso: true, protocolo: true, dataAutorizacao: true, cStat: true, xMotivo: true,
        valorTotal: true, destCpfCnpj: true, destNome: true, vendaId: true, createdAt: true,
      },
    });
    res.json(notas);
  } catch (err) { next(err); }
}

// GET /fiscal/nfce/:id  — detalhe (inclui itens; XML so se pedido ?xml=1)
export async function obterNfce(req, res, next) {
  try {
    const incluirXml = req.query?.xml === "1";
    const nota = await prisma.notaFiscal.findUnique({
      where: { id: req.params.id },
      include: { itens: { orderBy: { numeroItem: "asc" } } },
    });
    if (!nota) return res.status(404).json({ erro: "Nota nao encontrada." });
    if (!incluirXml) { nota.xmlAutorizado = undefined; nota.xmlCancelamento = undefined; }
    // Janela de cancelamento (Onda 4) — p/ a UI mostrar o contador/alerta.
    if (nota.status === "AUTORIZADA") nota.cancelamento = checarPrazoCancelamento(nota);
    res.json(nota);
  } catch (err) { next(err); }
}

// POST /fiscal/nfce/:id/consultar  — re-sincroniza notas PROCESSANDO com o gateway
export async function consultarNfce(req, res, next) {
  try {
    const nota = await prisma.notaFiscal.findUnique({ where: { id: req.params.id } });
    if (!nota) return res.status(404).json({ erro: "Nota nao encontrada." });
    if (!nota.idIntegracaoProvedor) {
      return res.status(400).json({ erro: "Nota sem id de integracao — nada a consultar." });
    }
    const config = await prisma.configuracaoEmpresa.findFirst();
    const prov = getProvedor(nota.provedorFiscal || config?.provedorFiscal);
    const resultado = await prov.consultarNfce({
      cnpjEmitente: config?.cnpj, idIntegracao: nota.idIntegracaoProvedor,
    });
    const dados = dadosDoResultado(resultado);
    if (resultado.status === "AUTORIZADA" && !nota.xmlAutorizado) {
      try { dados.xmlAutorizado = await prov.obterXml({ idIntegracao: nota.idIntegracaoProvedor }); }
      catch { /* best-effort */ }
    }
    const atualizada = await prisma.notaFiscal.update({ where: { id: nota.id }, data: dados });
    await registrarEventoFiscal({
      notaFiscalId: nota.id, tipo: "CONSULTA",
      resultado: ["REJEITADA", "DENEGADA"].includes(resultado.status) ? "REJEITADO" : "OK",
      cStat: resultado.cStat, xMotivo: resultado.xMotivo,
    });
    res.json({ nota: atualizada });
  } catch (err) {
    if (err instanceof ErroFiscal) {
      return res.status(422).json(corpoErroFiscal(err));
    }
    next(err);
  }
}

// ============ EVENTOS (Fase 5): cancelamento e inutilizacao ============

// POST /fiscal/nfce/:id/cancelar  — body: { justificativa }
// So cancela nota AUTORIZADA. O prazo legal (NFC-e: definido pela UF) e
// validado pela SEFAZ — se expirado, o gateway devolve rejeicao (tratada
// como ErroFiscal/422). Justificativa: 15 a 255 caracteres.
export async function cancelarNfce(req, res, next) {
  try {
    const justificativa = String(req.body?.justificativa || "").trim();
    if (justificativa.length < 15 || justificativa.length > 255) {
      return res.status(400).json({ erro: "Justificativa deve ter entre 15 e 255 caracteres." });
    }
    const nota = await prisma.notaFiscal.findUnique({ where: { id: req.params.id } });
    if (!nota) return res.status(404).json({ erro: "Nota nao encontrada." });
    if (nota.status === "CANCELADA") return res.json({ nota, aviso: "Nota ja esta cancelada." });
    if (nota.status !== "AUTORIZADA") {
      return res.status(400).json({ erro: "So e possivel cancelar uma NFC-e AUTORIZADA." });
    }
    // Pre-bloqueio por prazo (Onda 4): evita ida inutil a SEFAZ quando o prazo
    // legal ja expirou. A SEFAZ ainda e a autoridade final se passar daqui.
    const prazo = checarPrazoCancelamento(nota);
    if (!prazo.permitido) {
      return res.status(409).json({
        erro: `${prazo.mensagem} ${prazo.alternativa}`,
        prazoExpirado: true, decorridoMin: prazo.decorridoMin, limiteMin: prazo.limiteMin,
      });
    }
    if (!nota.idIntegracaoProvedor) {
      return res.status(400).json({ erro: "Nota sem id de integracao no provedor." });
    }

    const config = await prisma.configuracaoEmpresa.findFirst();
    const prov = getProvedor(nota.provedorFiscal || config?.provedorFiscal);
    const r = await prov.cancelarNfce({
      cnpjEmitente: config?.cnpj, idIntegracao: nota.idIntegracaoProvedor, justificativa,
    });

    // Sem ErroFiscal => o gateway aceitou o cancelamento. Busca o XML do
    // evento (best-effort) e marca a nota como CANCELADA.
    let xmlCancelamento = null;
    try { xmlCancelamento = await prov.obterXml({ idIntegracao: nota.idIntegracaoProvedor }); }
    catch { /* best-effort */ }

    const atualizada = await prisma.notaFiscal.update({
      where: { id: nota.id },
      data: {
        status: "CANCELADA",
        cStat: r.cStat || nota.cStat,
        xMotivo: r.xMotivo || "Cancelamento homologado",
        dataCancelamento: new Date(),
        justificativaCancelamento: justificativa,
        protocoloCancelamento: r.protocolo || null,
        xmlCancelamento,
      },
    });
    await registrarEventoFiscal({
      notaFiscalId: nota.id, tipo: "CANCELAMENTO", resultado: "OK",
      cStat: r.cStat, xMotivo: r.xMotivo || "Cancelamento homologado",
    });
    res.json({ nota: atualizada });
  } catch (err) {
    if (err instanceof ErroFiscal) {
      return res.status(422).json(corpoErroFiscal(err));
    }
    next(err);
  }
}

// POST /fiscal/inutilizar  — body: { serie, numeroInicial, numeroFinal, justificativa }
// Inutiliza uma faixa de numeracao NAO usada (buracos na sequencia). Cria
// linhas NotaFiscal com status INUTILIZADA p/ cada numero da faixa — assim a
// numeracao da emissao (MAX+1) pula esses numeros e fica auditavel.
const LIMITE_FAIXA_INUTILIZACAO = 1000;

export async function inutilizarNumeracao(req, res, next) {
  try {
    const serie = Number(req.body?.serie);
    const numeroInicial = Number(req.body?.numeroInicial);
    const numeroFinal = Number(req.body?.numeroFinal);
    const justificativa = String(req.body?.justificativa || "").trim();

    if (!Number.isInteger(serie) || serie < 0) return res.status(400).json({ erro: "Serie invalida." });
    if (!Number.isInteger(numeroInicial) || numeroInicial < 1) return res.status(400).json({ erro: "Numero inicial invalido." });
    if (!Number.isInteger(numeroFinal) || numeroFinal < numeroInicial) {
      return res.status(400).json({ erro: "Numero final deve ser >= numero inicial." });
    }
    if (numeroFinal - numeroInicial + 1 > LIMITE_FAIXA_INUTILIZACAO) {
      return res.status(400).json({ erro: `Faixa muito grande (max ${LIMITE_FAIXA_INUTILIZACAO} numeros por vez).` });
    }
    if (justificativa.length < 15 || justificativa.length > 255) {
      return res.status(400).json({ erro: "Justificativa deve ter entre 15 e 255 caracteres." });
    }

    const config = await prisma.configuracaoEmpresa.findFirst();
    if (!config?.fiscalAtivo) return res.status(400).json({ erro: "Emissao fiscal nao esta ativa." });
    const ambiente = config.ambienteFiscal || "HOMOLOGACAO";
    const prov = getProvedor(config.provedorFiscal);

    const r = await prov.inutilizarNumeracao({
      cnpjEmitente: config.cnpj, ambiente, serie, numeroInicial, numeroFinal, justificativa,
    });

    // Registra a faixa como INUTILIZADA (ignora numeros que ja existem).
    const inutilizadas = [];
    for (let n = numeroInicial; n <= numeroFinal; n++) {
      try {
        await prisma.notaFiscal.create({
          data: {
            modelo: MODELO, serie, numeroFiscal: n, ambiente, status: "INUTILIZADA",
            valorTotal: 0,
            cStat: r.cStat || null,
            xMotivo: r.xMotivo || "Numeracao inutilizada",
            protocolo: r.protocolo || null,
            justificativaCancelamento: justificativa,
            provedorFiscal: config.provedorFiscal,
            userId: req.user.sub,
          },
        });
        inutilizadas.push(n);
      } catch (e) {
        if (e.code === "P2002") continue; // numero ja existe — pula
        throw e;
      }
    }
    res.json({ inutilizadas, resultado: r });
  } catch (err) {
    if (err instanceof ErroFiscal) {
      return res.status(422).json(corpoErroFiscal(err));
    }
    next(err);
  }
}

// GET /fiscal/status-servico  — consulta a disponibilidade da SEFAZ no gateway.
// Util para consciencia de contingencia (Boas Praticas §28-29): a UI pode
// avisar quando a SEFAZ esta fora do ar antes de tentar emitir.
export async function statusServico(req, res, next) {
  try {
    const config = await prisma.configuracaoEmpresa.findFirst();
    if (!config?.provedorFiscal) return res.status(400).json({ erro: "Provedor fiscal nao configurado." });
    const prov = getProvedor(config.provedorFiscal);
    const r = await prov.consultarStatusServico({
      cnpjEmitente: config.cnpj, ambiente: config.ambienteFiscal || "HOMOLOGACAO",
    });
    res.json(r);
  } catch (err) {
    if (err instanceof ErroFiscal) {
      return res.status(422).json(corpoErroFiscal(err));
    }
    next(err);
  }
}
