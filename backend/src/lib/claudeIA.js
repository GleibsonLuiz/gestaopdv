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

/**
 * Le um comprovante (cupom fiscal / recibo) e extrai os campos de uma despesa
 * usando o Claude com visao (imagens) ou bloco de documento (PDF). Usado para
 * pre-preencher o formulario de despesa — o usuario confere antes de salvar.
 *
 * Modelo: ANTHROPIC_MODEL_VISION (ou o default). Haiku ja le cupom bem e custa
 * centavos. NUNCA grava sozinho — so devolve a sugestao.
 *
 * @param {Buffer} buffer conteudo do arquivo (multer memoryStorage)
 * @param {string} mimeType "image/jpeg" | "image/png" | "application/pdf"
 * @param {Array<{id:string, nome:string}>} categorias categorias analiticas
 *        de despesa do tenant, para o modelo sugerir a mais provavel
 * @returns {Promise<{valor:number|null, data:string|null, descricao:string|null,
 *          cnpj:string|null, planoContaSugeridaId:string|null}>}
 */
export async function extrairDadosComprovante(buffer, mimeType, categorias = []) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ClaudeIAError("ANTHROPIC_API_KEY nao configurada no servidor");

  const ehPdf = mimeType === "application/pdf";
  const bloco = ehPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } }
    : { type: "image", source: { type: "base64", media_type: mimeType, data: buffer.toString("base64") } };

  const catLista = (categorias || []).map(c => ({ id: c.id, nome: c.nome })).slice(0, 60);

  const instrucao = `Voce le cupons fiscais e recibos brasileiros. Extraia os dados do comprovante.
Responda SOMENTE com um JSON valido (sem markdown, sem texto fora do JSON):
{"valor": number|null, "data": "YYYY-MM-DD"|null, "descricao": string|null, "cnpj": string|null, "planoContaSugeridaId": string|null}
- valor: valor TOTAL pago (ponto como separador decimal).
- data: data da compra/emissao.
- descricao: nome do estabelecimento ou resumo curto.
- cnpj: CNPJ do estabelecimento (so digitos) ou null.
- planoContaSugeridaId: o "id" da categoria MAIS provavel desta lista, ou null se nenhuma encaixa: ${JSON.stringify(catLista)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": apiKey, "anthropic-version": VERSAO, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL_VISION || MODELO_DEFAULT,
        max_tokens: 400,
        messages: [{ role: "user", content: [bloco, { type: "text", text: instrucao }] }],
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      throw new ClaudeIAError(`Anthropic ${r.status}: ${body.slice(0, 200)}`, { status: r.status, body });
    }
    const json = await r.json();
    const blocos = Array.isArray(json?.content) ? json.content : [];
    const texto = blocos.filter(b => b?.type === "text").map(b => b.text).join("\n").trim();
    return parseJsonComprovante(texto);
  } catch (err) {
    if (err.name === "AbortError") throw new ClaudeIAError("Timeout ao ler comprovante (25s)");
    if (err instanceof ClaudeIAError) throw err;
    throw new ClaudeIAError("Falha ao ler comprovante: " + err.message);
  } finally {
    clearTimeout(timer);
  }
}

// Extrai e normaliza o JSON da resposta do modelo (que as vezes vem embrulhado
// em ```json ... ``` ou com texto ao redor). Best-effort: devolve {} se falhar.
function parseJsonComprovante(texto) {
  if (!texto) return {};
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) return {};
  try {
    const o = JSON.parse(m[0]);
    const valorNum = typeof o.valor === "number"
      ? o.valor
      : (o.valor ? Number(String(o.valor).replace(/[^0-9.,]/g, "").replace(",", ".")) : null);
    return {
      valor: Number.isFinite(valorNum) ? valorNum : null,
      data: typeof o.data === "string" && /^\d{4}-\d{2}-\d{2}/.test(o.data) ? o.data.slice(0, 10) : null,
      descricao: o.descricao ? String(o.descricao).slice(0, 200) : null,
      cnpj: o.cnpj ? String(o.cnpj).replace(/\D/g, "") : null,
      planoContaSugeridaId: o.planoContaSugeridaId ? String(o.planoContaSugeridaId) : null,
    };
  } catch {
    return {};
  }
}
