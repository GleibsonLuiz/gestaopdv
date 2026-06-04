import prisma from "../lib/prisma.js";
import { getProvedor, ErroFiscal } from "../lib/fiscal/provedor.js";
import { montarNfse } from "../lib/fiscal/montarNfse.js";
import { corpoErroFiscal } from "../lib/fiscal/rejeicoes.js";
import { registrarEventoFiscal, classificarFalhaTransmissao } from "../lib/fiscal/eventos.js";
import { validarNfse } from "../lib/fiscal/validarPayload.js";
import { checarPrazoCancelamento } from "../lib/fiscal/prazoCancelamento.js";
import { avaliarProntidaoNfse } from "./configuracaoFiscalController.js";

// ============ EMISSAO DE NFS-e (servicos / ISS — modelo NFSE) ============
//
// POST /fiscal/nfse              emite a NFS-e (origem: Ordem de Servico OU avulsa)
// GET  /fiscal/nfse              lista as NFS-e do tenant
// GET  /fiscal/nfse/:id          detalha uma NFS-e
// POST /fiscal/nfse/:id/consultar  re-sincroniza com o gateway (PROCESSANDO)
// POST /fiscal/nfse/:id/cancelar   cancela uma NFS-e AUTORIZADA
// GET  /fiscal/nfse/:id/pdf      baixa o DANFSE (PDF do gateway)
//
// Espelha o fiscalController (NFC-e): mesma reserva de numeracao contigua por
// serie no @@unique[tenantId, modelo, serie, numeroFiscal], agora com
// modelo=NFSE e contador proprio (serieNfse/proximoNumeroNfse). NFS-e NAO tem
// inutilizacao; o numero/codigo de verificacao sao atribuidos pela prefeitura.

const MODELO = "NFSE";

// Mapeia o ResultadoEmissaoNfse do provedor para os campos persistidos.
// Exportado p/ o worker de reconsulta (fiscalCronController) reusar sem drift.
export function dadosDoResultado(resultado) {
  return {
    status: resultado.status,
    cStat: resultado.cStat || null,
    xMotivo: resultado.xMotivo || null,
    numeroNfse: resultado.numeroNfse || null,
    codigoVerificacao: resultado.codigoVerificacao || null,
    protocolo: resultado.protocolo || null,
    dataAutorizacao: resultado.dataAutorizacao ? new Date(resultado.dataAutorizacao) : null,
    idIntegracaoProvedor: resultado.idIntegracao || null,
    mensagemErro: null,
  };
}

// Resolve { prestacao, tomador, ordemServicoId } a partir do body.
// body: { ordemServicoId } OU { avulsa: {...} }, com overrides opcionais de
// classificacao (itemListaServico, codTributacaoMunicipio, aliquotaIss, ...).
async function montarEntrada(body) {
  const override = {
    itemListaServico: body.itemListaServico,
    codTributacaoMunicipio: body.codTributacaoMunicipio,
    codMunicipioPrestacao: body.codMunicipioPrestacao,
    aliquotaIss: body.aliquotaIss,
    issRetido: body.issRetido,
    valorDeducoes: body.valorDeducoes,
  };

  if (body.ordemServicoId) {
    const os = await prisma.ordemServico.findUnique({
      where: { id: body.ordemServicoId },
      include: { cliente: true, itens: true },
    });
    if (!os) throw new ErroFiscal("Ordem de servico nao encontrada.");

    const servicos = (os.itens || []).filter((i) => i.tipo === "SERVICO");
    const valorServicos = body.valorServicos != null
      ? Number(body.valorServicos)
      : Number(os.valorServicos) || servicos.reduce((a, i) => a + Number(i.subtotal), 0);

    const discriminacao = String(
      body.discriminacao ||
      servicos.map((i) => i.descricao).filter(Boolean).join("; ") ||
      os.diagnostico || os.defeitoRelatado || os.equipamento || "Servico prestado"
    );

    const tomador = os.cliente
      ? { cpfCnpj: os.cliente.cpfCnpj, nome: os.cliente.nome }
      : (os.descricaoCliente ? { nome: os.descricaoCliente } : null);

    return {
      ordemServicoId: os.id,
      tomador,
      prestacao: { ...override, valorServicos, discriminacao },
    };
  }

  const a = body.avulsa || body;
  if (a.valorServicos == null) throw new ErroFiscal("Informe o valor do servico.");
  const tomador = a.tomador || (a.tomadorCpfCnpj || a.tomadorNome
    ? { cpfCnpj: a.tomadorCpfCnpj, nome: a.tomadorNome }
    : null);
  return {
    ordemServicoId: null,
    tomador,
    prestacao: {
      ...override,
      valorServicos: a.valorServicos,
      discriminacao: a.discriminacao,
      itemListaServico: a.itemListaServico ?? override.itemListaServico,
      codTributacaoMunicipio: a.codTributacaoMunicipio ?? override.codTributacaoMunicipio,
      codMunicipioPrestacao: a.codMunicipioPrestacao ?? override.codMunicipioPrestacao,
      aliquotaIss: a.aliquotaIss ?? override.aliquotaIss,
      issRetido: a.issRetido ?? override.issRetido,
      valorDeducoes: a.valorDeducoes ?? override.valorDeducoes,
    },
  };
}

// POST /fiscal/nfse
export async function emitirNfse(req, res, next) {
  try {
    const config = await prisma.configuracaoEmpresa.findFirst();
    if (!config?.nfseAtivo) {
      return res.status(400).json({ erro: "Emissao de NFS-e nao esta ativa. Configure em Configuracoes > Emissao Fiscal." });
    }
    const prontidao = avaliarProntidaoNfse(config);
    if (!prontidao.pronta) {
      return res.status(400).json({ erro: "Cadastro fiscal (NFS-e) incompleto.", faltando: prontidao.faltando });
    }

    const { ordemServicoId, tomador, prestacao } = await montarEntrada(req.body || {});

    // Idempotencia: se a OS ja tem NFS-e AUTORIZADA, devolve ela.
    if (ordemServicoId) {
      const existenteOk = await prisma.notaFiscal.findFirst({
        where: { ordemServicoId, modelo: MODELO, status: "AUTORIZADA" },
        orderBy: { createdAt: "desc" },
      });
      if (existenteOk) return res.json({ nota: existenteOk, aviso: "Esta OS ja possui NFS-e autorizada." });
    }

    const ambiente = config.ambienteFiscal || "HOMOLOGACAO";
    const serie = config.serieNfse ?? 1;

    // Re-emissao de NFS-e nao autorizada da mesma OS: reaproveita a numeracao.
    const existente = ordemServicoId
      ? await prisma.notaFiscal.findFirst({
          where: { ordemServicoId, modelo: MODELO, status: { in: ["REJEITADA", "ERRO", "PENDENTE", "PROCESSANDO"] } },
          orderBy: { createdAt: "desc" },
        })
      : null;

    const argsBase = { config, prestacao, tomador, ambiente, serie };

    // --- Gate A: validacao semantica ANTES de reservar numero (Onda 3) ---
    try {
      const previa = montarNfse({ ...argsBase, numeroFiscal: existente?.numeroFiscal || 1 });
      const gate = validarNfse(previa.payload);
      if (!gate.ok) {
        const lista = [...new Set(gate.erros.map((e) => e.msg))];
        return res.status(422).json({
          erro: "Corrija antes de emitir a NFS-e: " + lista.join("; "),
          erros: gate.erros,
        });
      }
    } catch (err) {
      if (err instanceof ErroFiscal) return res.status(422).json(corpoErroFiscal(err));
      throw err;
    }

    let nota, built;

    if (existente) {
      built = montarNfse({ ...argsBase, serie: existente.serie, numeroFiscal: existente.numeroFiscal });
      nota = await prisma.notaFiscal.update({
        where: { id: existente.id },
        data: {
          status: "PROCESSANDO", ambiente, provedorFiscal: config.provedorFiscal,
          cStat: null, xMotivo: null, mensagemErro: null,
          numeroNfse: null, codigoVerificacao: null, protocolo: null, dataAutorizacao: null, xmlAutorizado: null,
          destCpfCnpj: tomador?.cpfCnpj || null,
          destNome: tomador?.nome || null,
          valorTotal: built.totais.valorServicos,
          ...built.snapshot,
        },
      });
    } else {
      const maxAgg = await prisma.notaFiscal.aggregate({
        where: { modelo: MODELO, serie }, _max: { numeroFiscal: true },
      });
      const piso = Math.max((maxAgg._max?.numeroFiscal || 0) + 1, config.proximoNumeroNfse || 1);

      for (let tentativa = 0; tentativa < 5; tentativa++) {
        const numeroFiscal = piso + tentativa;
        built = montarNfse({ ...argsBase, serie, numeroFiscal });
        try {
          nota = await prisma.notaFiscal.create({
            data: {
              modelo: MODELO, serie, numeroFiscal, ambiente, status: "PROCESSANDO",
              provedorFiscal: config.provedorFiscal,
              valorTotal: built.totais.valorServicos,
              destCpfCnpj: tomador?.cpfCnpj || null,
              destNome: tomador?.nome || null,
              ordemServicoId, userId: req.user.sub,
              ...built.snapshot,
            },
          });
          await prisma.configuracaoEmpresa.update({
            where: { id: config.id }, data: { proximoNumeroNfse: numeroFiscal + 1 },
          }).catch(() => {});
          break;
        } catch (e) {
          if (e.code === "P2002") continue;
          throw e;
        }
      }
      if (!nota) return res.status(409).json({ erro: "Nao foi possivel reservar numero da NFS-e. Tente novamente." });
    }

    // --- Transmissao (sincrona) ---
    const prov = getProvedor(config.provedorFiscal);
    let resultado;
    try {
      resultado = await prov.emitirNfse({
        cnpjEmitente: config.cnpj, ambiente, payload: built.payload, referencia: nota.id,
      });
    } catch (err) {
      if (err instanceof ErroFiscal) {
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
          aviso: "NFS-e enviada, mas sem confirmacao do provedor. Consulte o status em instantes.",
        });
      }
      throw err;
    }

    const dados = dadosDoResultado(resultado);
    if (resultado.status === "AUTORIZADA" && resultado.idIntegracao) {
      try { dados.xmlAutorizado = await prov.obterXmlNfse({ idIntegracao: resultado.idIntegracao }); }
      catch { /* XML best-effort */ }
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

// GET /fiscal/nfse
export async function listarNfse(req, res, next) {
  try {
    const status = req.query?.status ? String(req.query.status) : undefined;
    const take = Math.min(Number(req.query?.limit) || 100, 500);
    const notas = await prisma.notaFiscal.findMany({
      where: { modelo: MODELO, ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true, serie: true, numeroFiscal: true, status: true, ambiente: true,
        numeroNfse: true, codigoVerificacao: true, protocolo: true, dataAutorizacao: true,
        cStat: true, xMotivo: true, valorTotal: true, valorServicos: true, valorIss: true,
        destCpfCnpj: true, destNome: true, discriminacao: true, ordemServicoId: true, createdAt: true,
      },
    });
    res.json(notas);
  } catch (err) { next(err); }
}

// GET /fiscal/nfse/:id
export async function obterNfse(req, res, next) {
  try {
    const incluirXml = req.query?.xml === "1";
    const nota = await prisma.notaFiscal.findUnique({ where: { id: req.params.id } });
    if (!nota || nota.modelo !== MODELO) return res.status(404).json({ erro: "NFS-e nao encontrada." });
    if (!incluirXml) { nota.xmlAutorizado = undefined; nota.xmlCancelamento = undefined; }
    res.json(nota);
  } catch (err) { next(err); }
}

// POST /fiscal/nfse/:id/consultar
export async function consultarNfse(req, res, next) {
  try {
    const nota = await prisma.notaFiscal.findUnique({ where: { id: req.params.id } });
    if (!nota || nota.modelo !== MODELO) return res.status(404).json({ erro: "NFS-e nao encontrada." });
    if (!nota.idIntegracaoProvedor) {
      return res.status(400).json({ erro: "NFS-e sem id de integracao — nada a consultar." });
    }
    const config = await prisma.configuracaoEmpresa.findFirst();
    const prov = getProvedor(nota.provedorFiscal || config?.provedorFiscal);
    const resultado = await prov.consultarNfse({
      cnpjEmitente: config?.cnpj, idIntegracao: nota.idIntegracaoProvedor,
    });
    const dados = dadosDoResultado(resultado);
    if (resultado.status === "AUTORIZADA" && !nota.xmlAutorizado) {
      try { dados.xmlAutorizado = await prov.obterXmlNfse({ idIntegracao: nota.idIntegracaoProvedor }); }
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

// POST /fiscal/nfse/:id/cancelar  — body: { justificativa }
export async function cancelarNfse(req, res, next) {
  try {
    const justificativa = String(req.body?.justificativa || "").trim();
    if (justificativa.length < 15 || justificativa.length > 255) {
      return res.status(400).json({ erro: "Justificativa deve ter entre 15 e 255 caracteres." });
    }
    const nota = await prisma.notaFiscal.findUnique({ where: { id: req.params.id } });
    if (!nota || nota.modelo !== MODELO) return res.status(404).json({ erro: "NFS-e nao encontrada." });
    if (nota.status === "CANCELADA") return res.json({ nota, aviso: "NFS-e ja esta cancelada." });
    if (nota.status !== "AUTORIZADA") {
      return res.status(400).json({ erro: "So e possivel cancelar uma NFS-e AUTORIZADA." });
    }
    // Pre-bloqueio por prazo (Onda 4). NFS-e: prazo definido pela prefeitura
    // (PRAZO_CANCELAMENTO_MIN.NFSE = null), entao hoje e no-op — fica pronto
    // caso um prazo municipal seja configurado no futuro.
    const prazo = checarPrazoCancelamento(nota);
    if (!prazo.permitido) {
      return res.status(409).json({
        erro: `${prazo.mensagem} ${prazo.alternativa}`,
        prazoExpirado: true, decorridoMin: prazo.decorridoMin, limiteMin: prazo.limiteMin,
      });
    }
    if (!nota.idIntegracaoProvedor) {
      return res.status(400).json({ erro: "NFS-e sem id de integracao no provedor." });
    }

    const config = await prisma.configuracaoEmpresa.findFirst();
    const prov = getProvedor(nota.provedorFiscal || config?.provedorFiscal);
    const r = await prov.cancelarNfse({
      cnpjEmitente: config?.cnpj, idIntegracao: nota.idIntegracaoProvedor, justificativa,
    });

    let xmlCancelamento = null;
    try { xmlCancelamento = await prov.obterXmlNfse({ idIntegracao: nota.idIntegracaoProvedor }); }
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

// GET /fiscal/nfse/:id/pdf  — stream do DANFSE (PDF gerado pelo gateway).
export async function baixarPdfNfse(req, res, next) {
  try {
    const nota = await prisma.notaFiscal.findUnique({ where: { id: req.params.id } });
    if (!nota || nota.modelo !== MODELO) return res.status(404).json({ erro: "NFS-e nao encontrada." });
    if (!nota.idIntegracaoProvedor) {
      return res.status(400).json({ erro: "NFS-e sem id de integracao no provedor." });
    }
    const config = await prisma.configuracaoEmpresa.findFirst();
    const prov = getProvedor(nota.provedorFiscal || config?.provedorFiscal);
    const pdf = await prov.obterPdfNfse({ idIntegracao: nota.idIntegracaoProvedor });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="nfse-${nota.numeroNfse || nota.numeroFiscal}.pdf"`);
    res.send(pdf);
  } catch (err) {
    if (err instanceof ErroFiscal) {
      return res.status(422).json(corpoErroFiscal(err));
    }
    next(err);
  }
}
