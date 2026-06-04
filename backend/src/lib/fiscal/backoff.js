// ============ BACKOFF DE RECONSULTA FISCAL (Onda 2) ============
//
// Quando a SEFAZ/gateway nao confirma uma nota (timeout, rede, servico fora do
// ar), a nota fica PROCESSANDO e o worker (cron) a RECONSULTA — NUNCA reenvia
// (reenvio duplicaria a nota: rejeicao 539). A cadencia das reconsultas cresce
// exponencialmente para nao martelar a SEFAZ nem estourar cota do gateway.
//
// A "tentativa" e quantas reconsultas (CONSULTA/RETRY) ja ocorreram para a nota.
// O agendamento e DERIVADO de (tentativas, ultimaTentativa) — nao depende de um
// timer; cada execucao do cron reavalia quem venceu. proximaTentativaEm() so
// produz o carimbo informativo que a UI mostra ("proxima checagem ~HH:MM").

// Escala em segundos: 30s, 2m, 5m, 15m, 30m, 1h, 2h, 4h, 8h, 12h, 24h.
// Apos a ultima, desiste e joga para CONTINGENCIA (intervencao manual).
export const ESCALA_SEGUNDOS = [30, 120, 300, 900, 1800, 3600, 7200, 14400, 28800, 43200, 86400];
export const MAX_TENTATIVAS = ESCALA_SEGUNDOS.length;

// Intervalo (sem jitter) que deve transcorrer ANTES da proxima tentativa, dado
// quantas reconsultas ja houve. Saturado no ultimo degrau.
export function intervaloSegundos(tentativasFeitas) {
  const i = Math.max(0, Math.min(tentativasFeitas, ESCALA_SEGUNDOS.length - 1));
  return ESCALA_SEGUNDOS[i];
}

// Esgotou o ciclo de reconsulta? (vai para CONTINGENCIA)
export function deveDesistir(tentativasFeitas) {
  return tentativasFeitas >= MAX_TENTATIVAS;
}

// A nota esta vencida para nova reconsulta? agora >= ultimaTentativa + intervalo.
export function estaVencida(tentativasFeitas, ultimaTentativa, agora = new Date()) {
  if (!ultimaTentativa) return true;
  const dueMs = ultimaTentativa.getTime() + intervaloSegundos(tentativasFeitas) * 1000;
  return agora.getTime() >= dueMs;
}

// Jitter +-15% para evitar thundering herd (varias notas vencendo juntas).
function jitterPadrao() {
  return 0.85 + Math.random() * 0.3;
}

// Carimbo informativo da proxima tentativa (com jitter). jitterFn injetavel p/ teste.
export function proximaTentativaEm(tentativasFeitas, { desde = new Date(), jitterFn = jitterPadrao } = {}) {
  const seg = intervaloSegundos(tentativasFeitas) * jitterFn();
  return new Date(desde.getTime() + Math.round(seg) * 1000);
}
