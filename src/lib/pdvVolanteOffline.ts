// =====================================================================
// ETAPA#7 — Estado local do PDV Volante Mobile.
//
// 1. Carrinho atual (com 1 sessao por aba/dispositivo): localStorage.
// 2. Fila de vendas pendentes (sync quando online): localStorage com
//    array de payloads. retry automatico ao detectar evento "online".
// =====================================================================

const CARRINHO_KEY = "gestaopro_pdvvol_carrinho";
const FILA_VENDAS_KEY = "gestaopro_pdvvol_fila";
const CACHE_PRODUTOS_KEY = "gestaopro_pdvvol_produtos";
const HISTORICO_KEY = "gestaopro_pdvvol_historico";
const HISTORICO_LIMITE = 20;

export interface ItemCarrinhoVol {
  produtoId: string;
  codigo: string;
  nome: string;
  unidade?: string | null;
  precoUnitario: number;
  quantidade: number;
  // Estoque visto no momento da adicao — para mostrar warn no offline.
  estoque?: number;
  // Observacao do item (ex.: "sem cebola"). Vai pro backend em
  // itens[i].observacoes (ItemComanda.observacoes — 300 chars).
  observacoes?: string;
}

export interface VendaPendente {
  /** ID local — UUID gerado no cliente para evitar duplicacao em retry. */
  idLocal: string;
  /** Payload completo aceito por POST /vendas. */
  payload: unknown;
  /** Quando foi enfileirada. */
  ts: number;
  /** Tentativas de envio. */
  tentativas: number;
  /** Ultima mensagem de erro do servidor (se houver). */
  ultimoErro?: string | null;
}

function lerJson<T>(chave: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(chave);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function escreverJson(chave: string, valor: unknown): void {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch {}
}

// ============ CARRINHO ============

export function lerCarrinho(): ItemCarrinhoVol[] {
  return lerJson(CARRINHO_KEY, []);
}

export function salvarCarrinho(itens: ItemCarrinhoVol[]): void {
  escreverJson(CARRINHO_KEY, itens);
}

export function limparCarrinho(): void {
  try { localStorage.removeItem(CARRINHO_KEY); } catch {}
}

// ============ CACHE DE PRODUTOS (offline-first) ============

interface CacheProdutos<T> {
  ts: number;
  produtos: T[];
}

export function lerCacheProdutos<T>(): { ts: number; produtos: T[] } | null {
  return lerJson<CacheProdutos<T> | null>(CACHE_PRODUTOS_KEY, null);
}

export function salvarCacheProdutos<T>(produtos: T[]): void {
  escreverJson(CACHE_PRODUTOS_KEY, { ts: Date.now(), produtos });
}

// ============ FILA DE VENDAS PENDENTES ============

export function lerFila(): VendaPendente[] {
  return lerJson(FILA_VENDAS_KEY, []);
}

export function enfileirarVenda(payload: unknown): VendaPendente {
  const fila = lerFila();
  const idLocal = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8);
  const item: VendaPendente = { idLocal, payload, ts: Date.now(), tentativas: 0, ultimoErro: null };
  fila.push(item);
  escreverJson(FILA_VENDAS_KEY, fila);
  return item;
}

export function removerDaFila(idLocal: string): void {
  const fila = lerFila().filter(v => v.idLocal !== idLocal);
  escreverJson(FILA_VENDAS_KEY, fila);
}

export function marcarFalha(idLocal: string, mensagem: string): void {
  const fila = lerFila();
  const idx = fila.findIndex(v => v.idLocal === idLocal);
  if (idx === -1) return;
  fila[idx].tentativas += 1;
  fila[idx].ultimoErro = mensagem;
  escreverJson(FILA_VENDAS_KEY, fila);
}

export function totalPendentesFila(): number {
  return lerFila().length;
}

// ============ HISTORICO LOCAL (ultimas 20 comandas enviadas) ============

export interface ComandaHistorico {
  /** Numero sequencial da comanda no backend (ou null se foi enfileirada offline). */
  numero: number | null;
  /** Total final (apos desconto). */
  total: number;
  /** Quantidade de itens distintos. */
  qtdItens: number;
  /** Mesa/balcao registrado. */
  mesa?: string | null;
  /** Cliente vinculado (nome). */
  cliente?: string | null;
  /** Timestamp do envio (Date.now). */
  ts: number;
  /** "enviada" se backend confirmou, "fila" se foi pra fila offline. */
  origem: "enviada" | "fila";
}

export function lerHistorico(): ComandaHistorico[] {
  return lerJson<ComandaHistorico[]>(HISTORICO_KEY, []);
}

export function registrarHistorico(item: ComandaHistorico): void {
  const lista = lerHistorico();
  lista.unshift(item);
  escreverJson(HISTORICO_KEY, lista.slice(0, HISTORICO_LIMITE));
}

export function limparHistorico(): void {
  try { localStorage.removeItem(HISTORICO_KEY); } catch {}
}
