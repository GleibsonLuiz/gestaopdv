// ============ PRE-BLOQUEIO DE CANCELAMENTO POR PRAZO (Onda 4) ============
//
// Antes de chamar o gateway para cancelar, checamos LOCALMENTE se o prazo legal
// ja expirou — resposta instantanea e mensagem clara, em vez de esperar a
// rejeicao da SEFAZ. A SEFAZ continua sendo a autoridade FINAL (defesa em
// profundidade): mesmo passando aqui, ela pode recusar; mesmo assim o
// pre-bloqueio cobre o caso obvio sem ida inutil a rede.
//
// O marco e a `dataAutorizacao` (quando a SEFAZ autorizou), NAO o createdAt.
// Sem dataAutorizacao (nota nunca autorizada) nao ha o que checar.
//
// Prazos sao configuraveis por modelo. Confirmados com o usuario (2026-06-03):
// NFC-e 65 = 24h na BA; NF-e 55 = 24h (nacional); NFS-e = prazo da prefeitura
// (sem corte local — varia por municipio).

export const PRAZO_CANCELAMENTO_MIN = {
  NFCE_65: 1440, // 24h
  NFE_55: 1440,  // 24h
  NFSE: null,    // definido pela prefeitura — sem corte local
};

// Formata minutos em "24h", "1h30min" ou "45min".
function formatarDuracao(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h${rem}min`;
}

// Retorno:
//   { permitido: true, restanteMin, limiteMin }                  — dentro do prazo
//   { permitido: true }                                          — sem corte local
//   { permitido: false, titulo, mensagem, alternativa, ... }     — prazo expirado
export function checarPrazoCancelamento(nota, agora = new Date()) {
  const limite = PRAZO_CANCELAMENTO_MIN[nota?.modelo];
  if (limite == null || !nota?.dataAutorizacao) return { permitido: true };

  const autorizacao = new Date(nota.dataAutorizacao);
  if (Number.isNaN(autorizacao.getTime())) return { permitido: true };

  const decorridoMin = (agora.getTime() - autorizacao.getTime()) / 60000;

  if (decorridoMin > limite) {
    const ehNfce = nota.modelo === "NFCE_65";
    return {
      permitido: false,
      decorridoMin: Math.floor(decorridoMin),
      limiteMin: limite,
      titulo: "Prazo de cancelamento expirado",
      mensagem: `Esta nota foi autorizada ha ${formatarDuracao(decorridoMin)}. ` +
        `O prazo de ${formatarDuracao(limite)} para cancelamento ja passou.`,
      alternativa: ehNfce
        ? "Para reverter a venda, emita uma nota de devolucao/entrada ou faca o estorno financeiro."
        : "Avalie emitir uma nota fiscal de devolucao.",
    };
  }

  return { permitido: true, restanteMin: Math.ceil(limite - decorridoMin), limiteMin: limite };
}
