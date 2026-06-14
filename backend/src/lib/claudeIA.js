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

  const instrucao = `Voce le cupons fiscais, notas e recibos brasileiros. Extraia os dados do comprovante.
Responda SOMENTE com um JSON valido (sem markdown, sem texto fora do JSON):
{"valor": number|null, "data": "YYYY-MM-DD"|null, "descricao": string|null, "cnpj": string|null, "planoContaSugeridaId": string|null}

Regras:
- valor: o TOTAL efetivamente PAGO (procure "VALOR TOTAL", "TOTAL A PAGAR", "VALOR PAGO").
  NAO use subtotal, troco, valor de itens individuais, desconto nem "TOTAL DE ITENS".
  Se houver desconto, use o total ja com desconto. Use ponto como separador decimal
  e NUNCA separador de milhar (ex.: mil duzentos e trinta e quatro reais e cinquenta = 1234.50).
- data: a data de emissao/compra. Converta de DD/MM/AAAA para AAAA-MM-DD
  (ex.: 03/02/2026 -> "2026-02-03"). Nunca troque dia por mes.
- descricao: nome do estabelecimento (razao social ou nome fantasia) em poucas palavras.
- cnpj: CNPJ do estabelecimento, so digitos (14 numeros), ou null. Se so houver CPF, use null.
- planoContaSugeridaId: o "id" da categoria MAIS provavel desta lista, ou null se nenhuma encaixa: ${JSON.stringify(catLista)}
- Qualquer campo ilegivel ou ausente: null. Nunca invente.

Exemplos (texto do comprovante -> JSON esperado):
1) "SUPERMERCADO BOA COMPRA LTDA / CNPJ 12.345.678/0001-90 / 03/02/2026 / SUBTOTAL 142,80 / DESCONTO 8,80 / TOTAL R$ 134,00"
-> {"valor": 134.00, "data": "2026-02-03", "descricao": "Supermercado Boa Compra", "cnpj": "12345678000190", "planoContaSugeridaId": null}
2) "Posto Sao Jorge / 15/12/2025 / COMBUSTIVEL / VALOR TOTAL 1.234,56 / CNPJ 98.765.432/0001-10"
-> {"valor": 1234.56, "data": "2025-12-15", "descricao": "Posto Sao Jorge", "cnpj": "98765432000110", "planoContaSugeridaId": null}
3) "Recibo - Joao da Silva / CPF 123.456.789-00 / Servico de pintura / 07/01/2026 / Valor: R$ 500,00"
-> {"valor": 500.00, "data": "2026-01-07", "descricao": "Joao da Silva - servico de pintura", "cnpj": null, "planoContaSugeridaId": null}
(Nos exemplos planoContaSugeridaId ficou null; no caso real, escolha o id da lista acima quando alguma categoria encaixar.)`;

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
    const valorNum = typeof o.valor === "number" ? o.valor : parseValorBR(o.valor);
    return {
      valor: Number.isFinite(valorNum) && valorNum > 0 ? valorNum : null,
      data: parseDataBR(o.data),
      descricao: o.descricao ? String(o.descricao).slice(0, 200) : null,
      cnpj: o.cnpj ? String(o.cnpj).replace(/\D/g, "") : null,
      planoContaSugeridaId: o.planoContaSugeridaId ? String(o.planoContaSugeridaId) : null,
    };
  } catch {
    return {};
  }
}

// Numeros podem vir como "1.234,56" (pt-BR), "1234.56" (ja normalizado) ou com
// "R$"/espacos. Decide o separador decimal pelo ultimo simbolo que aparece e
// trata o outro como separador de milhar — assim "1.234,56" e "1,234.56" e
// "1234,5" caem todos certos.
function parseValorBR(v) {
  if (v == null) return null;
  let s = String(v).replace(/[^0-9.,]/g, "");
  if (!s) return null;
  const ultimaVirgula = s.lastIndexOf(",");
  const ultimoPonto = s.lastIndexOf(".");
  if (ultimaVirgula > -1 && ultimoPonto > -1) {
    // O separador decimal e o que aparece por ultimo; o outro e milhar.
    const decimal = ultimaVirgula > ultimoPonto ? "," : ".";
    const milhar = decimal === "," ? "." : ",";
    s = s.split(milhar).join("").replace(decimal, ".");
  } else if (ultimaVirgula > -1) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Aceita ISO "AAAA-MM-DD" ou BR "DD/MM/AAAA" (e DD/MM/AA) e normaliza para ISO.
function parseDataBR(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const dia = m[1].padStart(2, "0");
    const mes = m[2].padStart(2, "0");
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    if (Number(mes) >= 1 && Number(mes) <= 12 && Number(dia) >= 1 && Number(dia) <= 31) {
      return `${ano}-${mes}-${dia}`;
    }
  }
  return null;
}
