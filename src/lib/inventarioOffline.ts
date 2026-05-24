// ETAPA#1: persistencia local das contagens em andamento.
// Usa localStorage simples (chave por sessao de inventario) — para 100-1000
// itens por sessao isso e mais que suficiente e nao adiciona dependencia
// nova (Dexie/IndexedDB so traria valor a partir de 10k+ itens).
//
// Cada contagem fica como { itemId -> quantidade } no localStorage. Quando
// online + usuario clica "Sincronizar", enviamos em lote via POST batch
// (api.salvarContagensInventario) e limpamos as chaves locais.

const PREFIX = "gestaopro_inv_contagem_";
const FILA_KEY = "gestaopro_inv_fila"; // lista de sessoes com pendencias

export interface ContagemPendente {
  inventarioItemId: string;
  quantidadeContada: number;
  observacoes?: string | null;
  ts: number; // momento da captura
}

function chaveDaSessao(inventarioId: string): string {
  return PREFIX + inventarioId;
}

function lerJson<T>(chave: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(chave);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function escreverJson(chave: string, valor: unknown): void {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // QuotaExceededError: silencioso. Pior caso, perdemos o cache local
    // e o usuario tem que reentrar — backend nao foi afetado.
  }
}

export function lerContagensLocais(inventarioId: string): Record<string, ContagemPendente> {
  return lerJson(chaveDaSessao(inventarioId), {});
}

export function salvarContagemLocal(
  inventarioId: string,
  inventarioItemId: string,
  quantidadeContada: number,
  observacoes?: string | null,
): void {
  const atual = lerContagensLocais(inventarioId);
  atual[inventarioItemId] = {
    inventarioItemId,
    quantidadeContada,
    observacoes: observacoes ?? null,
    ts: Date.now(),
  };
  escreverJson(chaveDaSessao(inventarioId), atual);
  // marca a sessao como pendente de sync
  const fila = lerJson<string[]>(FILA_KEY, []);
  if (!fila.includes(inventarioId)) {
    fila.push(inventarioId);
    escreverJson(FILA_KEY, fila);
  }
}

export function removerContagemLocal(inventarioId: string, inventarioItemId: string): void {
  const atual = lerContagensLocais(inventarioId);
  delete atual[inventarioItemId];
  escreverJson(chaveDaSessao(inventarioId), atual);
}

export function limparSessaoLocal(inventarioId: string): void {
  localStorage.removeItem(chaveDaSessao(inventarioId));
  const fila = lerJson<string[]>(FILA_KEY, []).filter(id => id !== inventarioId);
  escreverJson(FILA_KEY, fila);
}

export function totalPendentesLocal(inventarioId: string): number {
  return Object.keys(lerContagensLocais(inventarioId)).length;
}

export function sessoesPendentes(): string[] {
  return lerJson<string[]>(FILA_KEY, []);
}
