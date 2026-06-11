// ============ SPLIT DE PAGAMENTOS DO PDV (logica pura) ============
// Extraido de PDV.tsx no fatiamento (Fase 5). Usado pelo modal de fechamento
// de NovaVenda e pelo RefinalizarVendaModal do Historico.
//
// Por pagamento:
//   - id              chave estavel (crypto.randomUUID — n unique por modal)
//   - forma           FormaPagamento enum
//   - formaCustomId   id de FormaPagamentoCustom (se variante personalizada)
//   - formaCustomNome snapshot textual da forma custom (envia ao backend)
//   - valor           o que efetivamente entra na venda (== vai no payload)
//   - valorEntregue   so DINHEIRO: o que o cliente entregou (default = valor);
//                     se > valor, vira troco — exibido na UI mas NAO persiste

export interface Pagamento {
  id: string;
  forma: string;
  formaCustomId: string | null;
  formaCustomNome: string | null;
  valor: number;
  valorEntregue: number | undefined;
}

type AcaoPagamentos =
  | { type: "add"; pagamento: Pagamento }
  | { type: "remove"; id: string }
  | { type: "update"; id: string; patch: Partial<Pagamento> }
  | { type: "reset" }
  | { type: "reconcileTotal"; total: number };

// O reducer mantem apenas a lista — derivados (pago, restante, troco,
// valorAPrazo) ficam em useMemo do componente, garantindo estado minimo.
export function pagamentosReducer(state: Pagamento[], action: AcaoPagamentos): Pagamento[] {
  switch (action.type) {
    case "add":
      return [...state, action.pagamento];
    case "remove":
      return state.filter(p => p.id !== action.id);
    case "update":
      return state.map(p => p.id === action.id ? { ...p, ...action.patch } : p);
    case "reset":
      return [];
    case "reconcileTotal": {
      // Total mudou DEPOIS de semear/digitar os pagamentos (caso classico:
      // operador aplica um desconto com o modal de pagamento ja aberto). Se a
      // soma dos `valor` passou a exceder o novo total, apara o excedente do
      // ultimo pagamento para o primeiro. Em DINHEIRO o `valorEntregue` e
      // preservado de proposito: o excesso vira TROCO em vez de bloquear o
      // botao "Confirmar pagamento".
      const totalAlvo = Math.max(0, Number(action.total) || 0);
      const soma = state.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
      let excedente = Math.round((soma - totalAlvo) * 100) / 100;
      if (excedente <= 0.001) return state;
      const next = state.map(p => ({ ...p }));
      for (let i = next.length - 1; i >= 0 && excedente > 0.001; i--) {
        const reduz = Math.min(Number(next[i].valor) || 0, excedente);
        next[i].valor = Math.round(((Number(next[i].valor) || 0) - reduz) * 100) / 100;
        excedente = Math.round((excedente - reduz) * 100) / 100;
      }
      return next;
    }
    default:
      return state;
  }
}

export const novoId = (): string =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

export function criarPagamento(
  forma: string,
  valor: number,
  opts: { formaCustomId?: string | null; formaCustomNome?: string | null } = {},
): Pagamento {
  return {
    id: novoId(),
    forma,
    formaCustomId: opts.formaCustomId || null,
    formaCustomNome: opts.formaCustomNome || null,
    valor: Math.max(0, Number(valor) || 0),
    // "Recebi" comeca VAZIO (undefined), nao espelhando o valor. So e
    // preenchido quando o cliente entrega mais que o devido — ai vira troco.
    // Vazio = pagamento exato (sem troco). Evita o "0" confuso no campo.
    valorEntregue: undefined,
  };
}
