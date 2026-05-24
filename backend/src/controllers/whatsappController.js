// =====================================================================
// ETAPA#9b — Controller do Atendimento Inteligente.
//
// CRUD da configuracao (singleton por tenant), endpoint pra obter QR
// Code/status do gateway, webhook publico que recebe mensagens do
// WhatsApp, processa via Claude e responde.
// =====================================================================
import prisma, { prismaRaw, tenantStorage } from "../lib/prisma.js";
import { cifrar, decifrar, mascarar } from "../lib/cripto.js";
import { gerarResposta, ClaudeIAError } from "../lib/claudeIA.js";
import {
  enviarTexto, obterQrCode, obterStatus, WhatsappGatewayError,
} from "../lib/whatsappGateway.js";

const norm = (v) => (v === undefined || v === null || v === "" ? null : String(v));

// GET /whatsapp/config — devolve config do tenant (sem expor token completo).
export async function obterConfig(req, res, next) {
  try {
    const s = await prisma.whatsappSettings.findUnique({
      where: { tenantId: req.tenantId },
    });
    if (!s) {
      return res.json({
        configurada: false,
        instanceName: null,
        instanceTokenMascarado: null,
        webhookSecret: null,
        aiSystemPrompt: null,
        isActive: false,
        statusConexao: null,
      });
    }
    let tokenDecifrado = null;
    try { tokenDecifrado = decifrar(s.instanceToken); } catch { /* ignora */ }
    res.json({
      configurada: true,
      instanceName: s.instanceName,
      instanceTokenMascarado: tokenDecifrado ? mascarar(tokenDecifrado) : "(cifrado, recifre se necessario)",
      webhookSecret: s.webhookSecret,
      aiSystemPrompt: s.aiSystemPrompt,
      isActive: s.isActive,
      statusConexao: s.statusConexao,
    });
  } catch (err) { next(err); }
}

// PUT /whatsapp/config — cria/atualiza. Token nao informado preserva o existente.
export async function salvarConfig(req, res, next) {
  try {
    const {
      instanceName, instanceToken, webhookSecret, aiSystemPrompt, isActive,
    } = req.body || {};

    if (!instanceName || String(instanceName).trim().length < 3) {
      return res.status(400).json({ erro: "instanceName obrigatorio (min 3 caracteres)" });
    }

    const existente = await prisma.whatsappSettings.findUnique({
      where: { tenantId: req.tenantId },
    });

    let tokenCifrado = existente?.instanceToken || null;
    if (instanceToken && String(instanceToken).trim()) {
      tokenCifrado = cifrar(String(instanceToken).trim());
    }
    if (!tokenCifrado) {
      return res.status(400).json({ erro: "instanceToken obrigatorio na primeira configuracao" });
    }

    const data = {
      instanceName: String(instanceName).trim().slice(0, 80),
      instanceToken: tokenCifrado,
      webhookSecret: norm(webhookSecret),
      aiSystemPrompt: norm(aiSystemPrompt),
      isActive: !!isActive,
    };

    const salvo = existente
      ? await prisma.whatsappSettings.update({ where: { tenantId: req.tenantId }, data })
      : await prisma.whatsappSettings.create({ data: { ...data, tenantId: req.tenantId } });

    res.json({ ok: true, id: salvo.id });
  } catch (err) { next(err); }
}

// DELETE /whatsapp/config — remove credenciais (desativa o atendimento).
export async function removerConfig(req, res, next) {
  try {
    await prisma.whatsappSettings.delete({ where: { tenantId: req.tenantId } })
      .catch(err => { if (err.code !== "P2025") throw err; });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// GET /whatsapp/qrcode — proxy pro Evolution: gera QR Code se desconectado.
export async function obterQrCodeEndpoint(req, res, next) {
  try {
    const s = await prisma.whatsappSettings.findUnique({ where: { tenantId: req.tenantId } });
    if (!s) return res.status(404).json({ erro: "Configure as credenciais antes" });
    const token = decifrar(s.instanceToken);
    const r = await obterQrCode({ instanceName: s.instanceName, token });
    res.json(r);
  } catch (err) {
    if (err instanceof WhatsappGatewayError) {
      return res.status(502).json({ erro: err.message });
    }
    next(err);
  }
}

// GET /whatsapp/status — consulta estado da instancia no gateway.
export async function obterStatusEndpoint(req, res, next) {
  try {
    const s = await prisma.whatsappSettings.findUnique({ where: { tenantId: req.tenantId } });
    if (!s) return res.status(404).json({ erro: "Configure as credenciais antes" });
    const token = decifrar(s.instanceToken);
    const r = await obterStatus({ instanceName: s.instanceName, token });
    // Atualiza statusConexao no banco para refletir na UI sem nova chamada.
    if (r?.state || r?.instance?.state) {
      await prisma.whatsappSettings.update({
        where: { id: s.id },
        data: { statusConexao: String(r.state || r.instance?.state) },
      });
    }
    res.json(r);
  } catch (err) {
    if (err instanceof WhatsappGatewayError) {
      return res.status(502).json({ erro: err.message });
    }
    next(err);
  }
}

// GET /whatsapp/logs — historico (ultimas 100, paginavel via query)
export async function listarLogs(req, res, next) {
  try {
    const take = Math.min(200, Math.max(1, Number(req.query.limite) || 100));
    const numero = req.query.numero ? String(req.query.numero) : undefined;
    const logs = await prisma.whatsappLog.findMany({
      where: numero ? { numero } : {},
      orderBy: { createdAt: "desc" },
      take,
    });
    res.json(logs);
  } catch (err) { next(err); }
}

// ============ WEBHOOK PUBLICO ============
// POST /webhooks/whatsapp
//
// Espera payload padrao Evolution API:
//   {
//     event: "messages.upsert",
//     instance: "nome-da-instancia",
//     data: {
//       key: { remoteJid: "5511...@s.whatsapp.net", fromMe: false },
//       message: { conversation: "ola" } | { extendedTextMessage: { text: "ola" } },
//       pushName: "Joao"
//     }
//   }
//
// Outros gateways podem mandar formatos diferentes — extender aqui se
// necessario. Ignora: mensagens proprias (fromMe=true) e grupos (@g.us).
export async function webhook(req, res, next) {
  try {
    const body = req.body || {};
    // Resposta rapida 200 — gateways tipicamente retentam se nao receberem 2xx logo.
    res.json({ received: true });

    const instanceName = body.instance || body.instanceName;
    if (!instanceName) return;

    // Filtra: so processa upsert de mensagens.
    const event = body.event || body.type || "";
    if (event && !event.includes("message")) return;

    const data = body.data || body.message || body;
    const key = data.key || data;
    if (key?.fromMe === true) return;
    const remoteJid = key?.remoteJid || data?.from;
    if (!remoteJid) return;
    if (remoteJid.endsWith("@g.us")) return; // ignora grupos

    const texto = data.message?.conversation
      || data.message?.extendedTextMessage?.text
      || data.text
      || data.body;
    if (!texto || typeof texto !== "string") return;

    const numero = remoteJid.split("@")[0];
    const nomeContato = data.pushName || null;

    // Localiza tenant pelo instanceName (busca cross-tenant via prismaRaw).
    const settings = await prismaRaw.whatsappSettings.findFirst({
      where: { instanceName },
    });
    if (!settings) return;
    if (!settings.isActive) return;

    // Executa todo o processamento dentro do escopo do tenant para que o
    // extension multi-tenant filtre corretamente (mesmo padrao MP).
    await tenantStorage.run({ tenantId: settings.tenantId }, async () => {
      const inicio = Date.now();
      let resposta = null, erro = null, sucesso = true;
      try {
        resposta = await gerarResposta(settings.aiSystemPrompt || "", texto);
        const token = decifrar(settings.instanceToken);
        await enviarTexto({
          instanceName: settings.instanceName,
          token,
          numero,
          texto: resposta,
        });
      } catch (e) {
        sucesso = false;
        erro = e instanceof ClaudeIAError ? `IA: ${e.message}`
             : e instanceof WhatsappGatewayError ? `Gateway: ${e.message}`
             : `Erro: ${e.message}`;
      }
      await prisma.whatsappLog.create({
        data: {
          numero,
          nomeContato,
          mensagem: texto.slice(0, 4000),
          resposta: resposta ? resposta.slice(0, 4000) : null,
          sucesso, erro,
          duracaoMs: Date.now() - inicio,
          settingsId: settings.id,
        },
      }).catch(() => { /* log falhou — ignora pra nao quebrar webhook */ });
    });
  } catch (err) {
    // res ja foi enviado — apenas logamos pra nao crashar a function.
    console.error("[webhook whatsapp]", err);
  }
}
