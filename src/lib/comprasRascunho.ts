// Rascunhos de compra: permite salvar uma "Nova Compra" pela metade e
// retomar depois para continuar os lancamentos. Persistido no localStorage
// (por dispositivo/navegador) — segue a mesma filosofia do useRascunho, mas
// guarda VARIOS rascunhos nomeados em vez de um unico slot debounced, pra dar
// conta de varias compras em aberto ao mesmo tempo.
//
// Nao confundir com "vendas em espera" (PDV), que e server-side e compartilhada
// pelo tenant. Aqui o dado e local porque sao lancamentos em progresso, ainda
// nao confirmados.

const CHAVE = "gp:compras:rascunhos:v1";

// Mesma forma do ItemForm do modal de compra.
export interface RascunhoItem {
  produtoId: string;
  quantidade: string;
  precoUnitario: string;
}

export interface CompraRascunho {
  id: string;
  ts: number;
  fornecedorId: string;
  fornecedorNome: string;
  observacoes: string;
  dataCompra: string;
  itens: RascunhoItem[];
  desconto: string;
  gerarConta: boolean;
  vencimento: string;
  parcelas: number;
}

export function listarRascunhos(): CompraRascunho[] {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (!raw) return [];
    const arr = JSON.parse(raw) as CompraRascunho[];
    if (!Array.isArray(arr)) return [];
    // Mais recentes primeiro.
    return arr.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  } catch {
    return [];
  }
}

// Insere ou atualiza (upsert por id) e devolve a lista resultante.
export function salvarRascunho(r: CompraRascunho): CompraRascunho[] {
  const atuais = listarRascunhos().filter((x) => x.id !== r.id);
  const lista = [{ ...r, ts: Date.now() }, ...atuais];
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    // quota cheia / modo privado — falha silenciosa
  }
  return lista;
}

export function removerRascunho(id: string): CompraRascunho[] {
  const lista = listarRascunhos().filter((x) => x.id !== id);
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {
    /* ignore */
  }
  return lista;
}

export function novoRascunhoId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fallback abaixo */
  }
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
