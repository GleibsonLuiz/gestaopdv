// =====================================================================
// ETAPA#9b — Chamada direta a API Anthropic (sem SDK).
//
// Por que sem SDK: o backend ja usa fetch nativo em outros lugares
// (Mercado Pago, ViaCEP). Adicionar @anthropic-ai/sdk seria uma dep
// nova so para este caso. fetch + JSON cobre 100% do que precisamos.
//
// Modelo default: claude-haiku-4-5 (rapido + barato + suficiente para
// respostas curtas de atendimento). Usuario pode trocar via env
// ANTHROPIC_MODEL.
//
// Timeout: 25s (Vercel Functions default e 300s, mas resposta de IA
// que demora >25s da experiencia ruim no WhatsApp — preferimos abortar).
// =====================================================================

const API_URL = "https://api.anthropic.com/v1/messages";
const VERSAO = "2023-06-01";
const MODELO_DEFAULT = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const TIMEOUT_MS = 25_000;

export class ClaudeIAError extends Error {
  constructor(msg, { status, body } = {}) {
    super(msg);
    this.name = "ClaudeIAError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Gera resposta usando Claude.
 * @param {string} systemPrompt instrucoes do agente (vem de WhatsappSettings.aiSystemPrompt)
 * @param {string} mensagemUsuario mensagem do cliente
 * @param {Array<{role:"user"|"assistant", content:string}>} [historico] (opcional, ETAPA futura)
 * @returns {Promise<string>} texto da resposta
 */
export async function gerarResposta(systemPrompt, mensagemUsuario, historico = []) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ClaudeIAError("ANTHROPIC_API_KEY nao configurada no servidor");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": VERSAO,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO_DEFAULT,
        max_tokens: 512,
        system: systemPrompt || "Voce e um assistente de atendimento. Seja breve e cordial.",
        messages: [
          ...historico,
          { role: "user", content: mensagemUsuario },
        ],
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new ClaudeIAError(`Anthropic ${r.status}: ${body.slice(0, 200)}`, { status: r.status, body });
    }
    const json = await r.json();
    // Resposta: { content: [{ type: "text", text: "..." }, ...] }
    const blocos = Array.isArray(json?.content) ? json.content : [];
    const texto = blocos.filter(b => b?.type === "text").map(b => b.text).join("\n").trim();
    if (!texto) throw new ClaudeIAError("Resposta vazia da Anthropic");
    return texto;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ClaudeIAError("Timeout na resposta da IA (25s)");
    }
    if (err instanceof ClaudeIAError) throw err;
    throw new ClaudeIAError("Falha ao chamar IA: " + err.message);
  } finally {
    clearTimeout(timer);
  }
}
