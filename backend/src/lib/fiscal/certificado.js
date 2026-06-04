// ============ MONITOR DE VALIDADE DO CERTIFICADO A1 (Onda 5) ============
//
// O certificado A1 (.pfx) NAO fica no nosso banco — ele vive no gateway
// (NuvemFiscal). Entao "monitorar a validade" = consultar o gateway
// (provedor.consultarCertificado) e cachear a data em ConfiguracaoEmpresa
// (certificadoValidade). Este modulo e a parte PURA: dada a validade, decide
// se ha alerta e monta a mensagem em pt-BR. O cron (fiscalCronController) usa
// isto + o cache + o sistema de Notificacao.
//
// Bandas de alerta (dias restantes): 30, 15, 7, 1 e vencido (0). Quanto MENOR
// a banda, mais urgente — o cron usa isso pra so re-notificar ao entrar numa
// banda mais critica (sem spam diario).

export const LIMIARES_DIAS = [30, 15, 7, 1];

function ddmmaaaa(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()}`;
}

// Banda de alerta a partir dos dias restantes. 0 = vencido; null = sem alerta.
export function nivelAlerta(diasRestantes) {
  if (diasRestantes <= 0) return 0;
  if (diasRestantes <= 1) return 1;
  if (diasRestantes <= 7) return 7;
  if (diasRestantes <= 15) return 15;
  if (diasRestantes <= 30) return 30;
  return null;
}

// Avalia a validade (Date | string ISO | null) e devolve o estado do alerta.
export function avaliarCertificado(validade, agora = new Date()) {
  if (!validade) {
    return { temData: false, validade: null, diasRestantes: null, vencido: false,
      nivelAlerta: null, alerta: false, titulo: null, mensagem: null };
  }
  const dt = validade instanceof Date ? validade : new Date(validade);
  if (Number.isNaN(dt.getTime())) {
    return { temData: false, validade: null, diasRestantes: null, vencido: false,
      nivelAlerta: null, alerta: false, titulo: null, mensagem: null };
  }

  const diasRestantes = Math.ceil((dt.getTime() - agora.getTime()) / 86400000);
  const vencido = diasRestantes <= 0;
  const nivel = nivelAlerta(diasRestantes);

  let titulo = null, mensagem = null;
  if (vencido) {
    titulo = "Certificado digital vencido";
    mensagem = `Seu certificado digital venceu em ${ddmmaaaa(dt)}. A emissao de notas fiscais esta bloqueada ate a renovacao do certificado no provedor fiscal.`;
  } else if (nivel != null) {
    titulo = "Certificado digital proximo do vencimento";
    mensagem = `Seu certificado digital vence em ${diasRestantes} dia(s), em ${ddmmaaaa(dt)}. Renove-o no provedor fiscal para nao interromper a emissao de notas.`;
  }

  return {
    temData: true,
    validade: dt.toISOString(),
    diasRestantes,
    vencido,
    nivelAlerta: nivel,
    alerta: nivel != null,
    titulo,
    mensagem,
  };
}
