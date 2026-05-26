import { useEffect, useRef } from "react";

// Hook generico para persistir um pedaco de estado no localStorage com
// debounce. Util pra evitar perda de dados quando a request falha (ex:
// finalizar venda com servidor caido) ou quando o usuario recarrega a aba
// sem querer.
//
// Como usar:
//   const [carrinho, setCarrinho] = useState<Item[]>([]);
//   const { restaurar, descartar } = useRascunho("pdv:carrinho", carrinho, {
//     desativar: carrinho.length === 0, // nao polui localStorage com array vazio
//   });
//   // No mount, restaurar() devolve o que estava salvo (ou null).
//
// Filosofia: o hook NAO sobrescreve o estado automaticamente — devolve
// `restaurar()` para o componente decidir quando hidratar (ex: so se o
// usuario confirmar via banner "Tem um rascunho salvo, deseja recuperar?").
// Isso evita race condition entre hidratacao e dados da API que chegam
// depois.

export interface OpcoesUseRascunho<T> {
  // Intervalo de debounce em ms (padrao 800).
  debounceMs?: number;
  // Quando true, nao grava nada (e remove o rascunho existente). Util pra
  // "limpar quando ficar vazio" sem ter que chamar descartar manualmente.
  desativar?: boolean;
  // Serializador customizado (padrao JSON.stringify). Util pra dados nao-JSON
  // como Map/Set.
  serializar?: (v: T) => string;
  // Versao do schema. Se voce mudar a estrutura, bumpe a versao — rascunhos
  // antigos sao descartados silenciosamente.
  versao?: number;
}

interface Payload<T> {
  v: number;
  ts: number;
  data: T;
}

export interface UseRascunhoApi<T> {
  // Le e devolve o rascunho salvo (null se nao houver ou estiver com versao errada).
  restaurar: () => T | null;
  // Remove o rascunho explicitamente (ex: apos sucesso ao finalizar venda).
  descartar: () => void;
  // Idade do rascunho salvo em ms (null se nao houver).
  idadeMs: () => number | null;
}

export function useRascunho<T>(
  chave: string,
  valor: T,
  opts: OpcoesUseRascunho<T> = {},
): UseRascunhoApi<T> {
  const {
    debounceMs = 800,
    desativar = false,
    serializar = JSON.stringify,
    versao = 1,
  } = opts;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versaoRef = useRef(versao);
  // Marca se este hook ja gravou algo nesta sessao. Evita o cenario classico:
  // mount com estado vazio + desativar=true apaga o rascunho persistido
  // ANTES do componente ter chance de restaurar via restaurar(). So permite
  // apagar via efeito automatico quando algo foi gravado por este mount.
  const gravouRef = useRef(false);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (desativar) {
      // So apaga se algo ja foi gravado por esta instancia. Mount com estado
      // vazio nao apaga o rascunho que veio do reload anterior.
      if (gravouRef.current) {
        try { localStorage.removeItem(chave); } catch { /* quota cheia / privado */ }
        gravouRef.current = false;
      }
      return;
    }
    timerRef.current = setTimeout(() => {
      try {
        const payload: Payload<T> = { v: versaoRef.current, ts: Date.now(), data: valor };
        localStorage.setItem(chave, serializar(payload as unknown as T));
        gravouRef.current = true;
      } catch {
        // localStorage pode estourar quota ou estar bloqueado em modo
        // privado — falha silenciosa, melhor que crashar a tela.
      }
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [chave, valor, desativar, debounceMs, serializar]);

  function lerPayload(): Payload<T> | null {
    try {
      const raw = localStorage.getItem(chave);
      if (!raw) return null;
      const p = JSON.parse(raw) as Payload<T>;
      if (!p || typeof p !== "object" || p.v !== versaoRef.current) return null;
      return p;
    } catch { return null; }
  }

  return {
    restaurar: () => lerPayload()?.data ?? null,
    descartar: () => {
      try { localStorage.removeItem(chave); } catch { /* ignore */ }
      gravouRef.current = false;
    },
    idadeMs: () => {
      const p = lerPayload();
      return p ? Date.now() - p.ts : null;
    },
  };
}
