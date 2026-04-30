// Helpers compartilhados entre contaPagarController e contaReceberController.
// Lida com normalizacao de valores monetarios, calculo do liquido e geracao
// de series de parcelas/recorrencia.

import crypto from "node:crypto";

export const TIPOS_RECORRENCIA = new Set(["NENHUMA", "PARCELADA", "RECORRENTE"]);

const PARCELAS_RECORRENTE_PADRAO = 12;
const PARCELAS_MAX = 60;

export function toNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

export function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// Recebe os 4 campos brutos vindos do request (qualquer um pode faltar) e
// retorna { ok, erro, valores: { valorBruto, juros, multa, desconto, valor } }.
// `valor` aqui e o liquido = bruto + juros + multa - desconto.
export function calcularValores({ valorBruto, juros, multa, desconto }) {
  const vb = toNumber(valorBruto);
  if (vb === null || Number.isNaN(vb) || vb <= 0) {
    return { ok: false, erro: "Valor bruto deve ser maior que zero" };
  }
  const j = toNumber(juros) ?? 0;
  const m = toNumber(multa) ?? 0;
  const d = toNumber(desconto) ?? 0;
  if ([j, m, d].some(x => Number.isNaN(x) || x < 0)) {
    return { ok: false, erro: "Juros, multa e desconto nao podem ser negativos" };
  }
  const liquido = round2(vb + j + m - d);
  if (liquido <= 0) {
    return { ok: false, erro: "Valor liquido (bruto + juros + multa - desconto) deve ser maior que zero" };
  }
  return {
    ok: true,
    valores: {
      valorBruto: round2(vb), juros: round2(j), multa: round2(m),
      desconto: round2(d), valor: liquido,
    },
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Adiciona N meses preservando o dia (se o mes destino tem menos dias, ajusta).
export function adicionarMeses(data, n) {
  const d = new Date(data);
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimoDia));
  return d;
}

// Gera array de objetos prontos para createMany. dadosBase contem as colunas
// comuns (descricao, fornecedorId/clienteId, observacoes, etc.). Para
// PARCELADA: divide o valor bruto entre parcelas; ultima parcela ajusta o
// arredondamento. Para RECORRENTE: mesmo valor em todas. Todas compartilham
// grupoRecorrenciaId.
export function gerarSerieRecorrencia({
  tipoRecorrencia,
  parcelaTotal,
  valores,           // { valorBruto, juros, multa, desconto, valor } da conta
  vencimento,        // Date
  dadosBase,         // restante das colunas (descricao, fornecedorId, etc.)
}) {
  if (tipoRecorrencia === "NENHUMA") {
    return {
      ok: true,
      registros: [{
        ...dadosBase, ...valores, vencimento,
        tipoRecorrencia: "NENHUMA",
        grupoRecorrenciaId: null, parcelaAtual: null, parcelaTotal: null,
      }],
    };
  }

  if (!TIPOS_RECORRENCIA.has(tipoRecorrencia)) {
    return { ok: false, erro: "Tipo de recorrencia invalido" };
  }

  let total = Number(parcelaTotal);
  if (tipoRecorrencia === "RECORRENTE" && (!total || total <= 0)) {
    total = PARCELAS_RECORRENTE_PADRAO;
  }
  if (!Number.isInteger(total) || total < 2 || total > PARCELAS_MAX) {
    return { ok: false, erro: `Numero de parcelas deve estar entre 2 e ${PARCELAS_MAX}` };
  }

  const grupoId = crypto.randomUUID();
  const registros = [];

  if (tipoRecorrencia === "PARCELADA") {
    // Divide o valor bruto entre as parcelas. Outras componentes (juros/multa/
    // desconto) ficam apenas na primeira (cobrancas pontuais nao se repetem).
    const valorParcelaBruto = round2(valores.valorBruto / total);
    const totalDistribuido = round2(valorParcelaBruto * total);
    const ajuste = round2(valores.valorBruto - totalDistribuido);
    for (let i = 0; i < total; i++) {
      const ehPrimeira = i === 0;
      const ehUltima = i === total - 1;
      const bruto = ehUltima ? round2(valorParcelaBruto + ajuste) : valorParcelaBruto;
      const juros = ehPrimeira ? valores.juros : 0;
      const multa = ehPrimeira ? valores.multa : 0;
      const desconto = ehPrimeira ? valores.desconto : 0;
      const liquido = round2(bruto + juros + multa - desconto);
      registros.push({
        ...dadosBase,
        valorBruto: bruto, juros, multa, desconto, valor: liquido,
        vencimento: adicionarMeses(vencimento, i),
        tipoRecorrencia: "PARCELADA",
        grupoRecorrenciaId: grupoId,
        parcelaAtual: i + 1, parcelaTotal: total,
      });
    }
  } else { // RECORRENTE: cada mes repete o mesmo valor
    for (let i = 0; i < total; i++) {
      registros.push({
        ...dadosBase, ...valores,
        vencimento: adicionarMeses(vencimento, i),
        tipoRecorrencia: "RECORRENTE",
        grupoRecorrenciaId: grupoId,
        parcelaAtual: i + 1, parcelaTotal: total,
      });
    }
  }

  return { ok: true, registros, grupoId };
}
