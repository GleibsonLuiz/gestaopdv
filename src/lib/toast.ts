// Mini event bus para toasts globais. Qualquer modulo pode chamar
// emitirToast(...) sem ter que importar React/Context — o componente
// <ContainerToasts /> (em IndicadorRede) escuta e renderiza.
//
// Tipos:
//   - erro:    fundo vermelho — falha sem retry
//   - aviso:   fundo amarelo — degradacao reversivel (timeout, 5xx)
//   - sucesso: fundo verde — confirmacoes
//   - info:    fundo azul — mensagens neutras

export type TipoToast = "erro" | "aviso" | "sucesso" | "info";

export interface ToastPayload {
  id: string;
  tipo: TipoToast;
  titulo: string;
  mensagem?: string;
  acaoLabel?: string;
  onAcao?: () => void;
  // ms ate auto-fechar. 0 = persistente (precisa do X). Default 5000.
  duracao?: number;
}

const EVENTO = "app:toast";

export function emitirToast(input: Omit<ToastPayload, "id"> & { id?: string }) {
  const payload: ToastPayload = {
    id: input.id || `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    tipo: input.tipo,
    titulo: input.titulo,
    mensagem: input.mensagem,
    acaoLabel: input.acaoLabel,
    onAcao: input.onAcao,
    duracao: input.duracao,
  };
  window.dispatchEvent(new CustomEvent<ToastPayload>(EVENTO, { detail: payload }));
  return payload.id;
}

export function ouvirToasts(handler: (t: ToastPayload) => void) {
  function fn(e: Event) { handler((e as CustomEvent<ToastPayload>).detail); }
  window.addEventListener(EVENTO, fn);
  return () => window.removeEventListener(EVENTO, fn);
}
