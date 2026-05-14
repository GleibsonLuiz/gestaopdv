// Helpers para templates de mensagem (CRM).
//
// Variaveis suportadas no corpo/assunto:
//   {{nome}}         nome completo
//   {{primeiroNome}} primeira palavra do nome
//   {{telefone}}
//   {{email}}
//   {{cidade}}
//   {{estado}}
//   {{ultimaCompra}} ultima compra (DD/MM/AAAA) ou "—"
//   {{totalGasto}}   total gasto formatado em R$
//   {{valorEmAberto}} contas a receber em aberto formatado em R$
//   {{recenciaDias}} dias desde a ultima compra ou "—"

const fmtBRL = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
};

// Recebe um cliente com `tags` e (opcional) `rfm`/`kpis`. Aceita tambem a
// forma rasa retornada por /clientes/segmentos (cliente + rfm).
export function aplicarVariaveis(texto, cliente, kpis = null) {
  if (!texto) return "";
  const c = cliente || {};
  const k = kpis || c.kpis || c.rfm || {};

  const nome = c.nome || "";
  const primeiroNome = nome.trim().split(/\s+/)[0] || "";
  const totalGasto = k.totalGasto ?? k.monetario ?? 0;
  const ultimaCompraData = k.ultimaCompra ?? null;
  const valorEmAberto = k.valorInadimplente ?? k.valorEmAberto ?? 0;
  const recenciaDias = k.recenciaDias ?? null;

  const valores = {
    nome,
    primeiroNome,
    telefone: c.telefone || "",
    email: c.email || "",
    cidade: c.cidade || "",
    estado: c.estado || "",
    ultimaCompra: fmtData(ultimaCompraData),
    totalGasto: fmtBRL(totalGasto),
    valorEmAberto: fmtBRL(valorEmAberto),
    recenciaDias: recenciaDias != null ? String(recenciaDias) : "—",
  };

  return String(texto).replace(/\{\{(\w+)\}\}/g, (_, chave) => {
    return chave in valores ? valores[chave] : `{{${chave}}}`;
  });
}

// Lista de variaveis disponiveis (para mostrar no editor de template).
export const VARIAVEIS_DISPONIVEIS = [
  { chave: "nome", desc: "Nome completo do cliente" },
  { chave: "primeiroNome", desc: "Primeiro nome" },
  { chave: "telefone", desc: "Telefone" },
  { chave: "email", desc: "Email" },
  { chave: "cidade", desc: "Cidade" },
  { chave: "estado", desc: "Estado (UF)" },
  { chave: "ultimaCompra", desc: "Data da última compra" },
  { chave: "totalGasto", desc: "Total gasto (R$)" },
  { chave: "valorEmAberto", desc: "Valor em aberto (R$)" },
  { chave: "recenciaDias", desc: "Dias desde a última compra" },
];

// Gera o link final para abrir a mensagem.
export function gerarLink({ tipo, telefone, email, assunto, corpo }) {
  const corpoEnc = encodeURIComponent(corpo || "");
  if (tipo === "WHATSAPP") {
    if (!telefone) return null;
    const digits = String(telefone).replace(/\D/g, "");
    if (!digits) return null;
    const numero = digits.length <= 11 ? `55${digits}` : digits;
    return `https://wa.me/${numero}${corpo ? `?text=${corpoEnc}` : ""}`;
  }
  if (tipo === "EMAIL") {
    if (!email) return null;
    const params = [];
    if (assunto) params.push(`subject=${encodeURIComponent(assunto)}`);
    if (corpo) params.push(`body=${corpoEnc}`);
    return `mailto:${email}${params.length ? `?${params.join("&")}` : ""}`;
  }
  if (tipo === "SMS") {
    if (!telefone) return null;
    const digits = String(telefone).replace(/\D/g, "");
    if (!digits) return null;
    return `sms:${digits}${corpo ? `?body=${corpoEnc}` : ""}`;
  }
  return null;
}
