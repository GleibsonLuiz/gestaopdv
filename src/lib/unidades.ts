// Conversão de unidades de PESO para o PDV e leitura de etiqueta de balança.
//
// Produtos vendidos por peso têm `unidade` = KG (ou G). O estoque é guardado
// em Decimal(12,3) no banco — ver Produto.estoque no schema — então o saldo
// já aceita frações (0.400 = 400 g). O que falta é a CAMADA DE ENTRADA:
//
//   1. No PDV o vendedor digita o PESO EM GRAMAS (ex.: 400) e o sistema
//      converte para a unidade de estoque (0,400 kg), calcula o valor pelo
//      preço por kg e dá baixa fracionária no estoque (já suportado no
//      backend — vendaController decrementa Decimal).
//   2. Etiqueta de balança (EAN-13 de medida variável, padrão Toledo/
//      Filizola): ao bipar a etiqueta o item entra com o peso embutido,
//      sem digitar nada — é o fluxo de supermercado.

// ============ UNIDADES DE MEDIDA PRÉ-CADASTRADAS ============
//
// Lista única de unidades comerciais/fiscais oferecida nos selects do sistema
// (cadastro de produto: unidade comercial e unidade tributável). Padronizar a
// sigla evita erro de digitação do usuário — que viraria divergência de
// estoque ou rejeição da NF-e (a SEFAZ valida a unidade comercial/tributável).
// As siglas seguem o uso corrente do varejo e da tabela de unidades da NF-e.

export interface UnidadeMedida {
  /** Sigla gravada no produto (≤ 6 caracteres, MAIÚSCULA). */
  sigla: string;
  /** Descrição amigável exibida no dropdown. */
  descricao: string;
}

export const UNIDADES_MEDIDA: UnidadeMedida[] = [
  { sigla: "UN", descricao: "Unidade" },
  { sigla: "PC", descricao: "Peça" },
  { sigla: "CX", descricao: "Caixa" },
  { sigla: "PCT", descricao: "Pacote" },
  { sigla: "FD", descricao: "Fardo" },
  { sigla: "DZ", descricao: "Dúzia" },
  { sigla: "PAR", descricao: "Par" },
  { sigla: "KIT", descricao: "Kit" },
  { sigla: "CJ", descricao: "Conjunto" },
  { sigla: "JG", descricao: "Jogo" },
  { sigla: "KG", descricao: "Quilograma" },
  { sigla: "G", descricao: "Grama" },
  { sigla: "MG", descricao: "Miligrama" },
  { sigla: "TON", descricao: "Tonelada" },
  { sigla: "SC", descricao: "Saco" },
  { sigla: "SACA", descricao: "Saca" },
  { sigla: "L", descricao: "Litro" },
  { sigla: "ML", descricao: "Mililitro" },
  { sigla: "GL", descricao: "Galão" },
  { sigla: "LT", descricao: "Lata" },
  { sigla: "GF", descricao: "Garrafa" },
  { sigla: "FR", descricao: "Frasco" },
  { sigla: "AMP", descricao: "Ampola" },
  { sigla: "BD", descricao: "Balde" },
  { sigla: "M", descricao: "Metro" },
  { sigla: "CM", descricao: "Centímetro" },
  { sigla: "MM", descricao: "Milímetro" },
  { sigla: "M2", descricao: "Metro quadrado" },
  { sigla: "M3", descricao: "Metro cúbico" },
  { sigla: "ROL", descricao: "Rolo" },
  { sigla: "BOB", descricao: "Bobina" },
  { sigla: "RS", descricao: "Resma" },
  { sigla: "TB", descricao: "Tubo" },
  { sigla: "VD", descricao: "Vidro" },
  { sigla: "H", descricao: "Hora (serviço)" },
  { sigla: "DIA", descricao: "Diária" },
  { sigla: "MES", descricao: "Mensal" },
  { sigla: "KWH", descricao: "Quilowatt-hora" },
];

/** Conjunto de siglas válidas, para checar se um valor já está na lista. */
export const SIGLAS_UNIDADE: ReadonlySet<string> = new Set(
  UNIDADES_MEDIDA.map((u) => u.sigla),
);

/** Base de peso de uma unidade de estoque. */
export type BasePeso = "kg" | "g";

const ALIAS_PESO: Record<string, BasePeso> = {
  KG: "kg", KGS: "kg", QUILO: "kg", QUILOS: "kg", KILO: "kg", QUILOG: "kg", K: "kg",
  G: "g", GR: "g", GRS: "g", GRAMA: "g", GRAMAS: "g",
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Retorna a base de peso ('kg' | 'g') quando a unidade de estoque é de peso;
 * caso contrário null (UN, M, L, CX… não usam o teclado de balança).
 */
export function ehUnidadePeso(unidade?: string | null): BasePeso | null {
  if (!unidade) return null;
  const u = String(unidade).trim().toUpperCase();
  return ALIAS_PESO[u] ?? null;
}

/**
 * Converte um peso digitado em GRAMAS para a unidade de estoque do produto.
 * Ex.: 400 g → produto em KG = 0.400 ; produto em G = 400.
 * Retorna 0 para entradas inválidas (não-numérico, ≤ 0).
 */
export function pesoGramasParaEstoque(gramas: number, unidade?: string | null): number {
  if (!Number.isFinite(gramas) || gramas <= 0) return 0;
  const base = ehUnidadePeso(unidade);
  if (base === "g") return round3(gramas);
  // base "kg" (default p/ produtos de peso): gramas → kg
  return round3(gramas / 1000);
}

/** Presets de peso (em gramas) exibidos como atalhos no teclado da balança. */
export const PRESETS_PESO_G = [100, 250, 500, 1000];

// ============ ETIQUETA DE BALANÇA (EAN-13 de medida variável) ============
//
// Layout assumido (padrão Toledo/Filizola — configurável na própria balança):
//
//   2 CCCCCC VVVVV D
//   │ │      │     └ dígito verificador
//   │ │      └─────── valor embutido (5 díg.): PESO em gramas OU PREÇO em centavos
//   │ └────────────── código interno do produto (6 díg.)
//   └──────────────── prefixo 2 → item de peso/medida variável (reservado GS1)
//
// FORMATO_ETIQUETA define como interpretar os 5 dígitos do valor:
//   "peso"  → gramas (recomendado: baixa de estoque exata, coerente com o
//             teclado de peso do PDV).
//   "preco" → reais (centavos); a quantidade vira preço ÷ preçoUnitário.
// A maioria das balanças permite escolher o modo na configuração do produto.
const FORMATO_ETIQUETA: "peso" | "preco" = "peso";

export interface EtiquetaBalanca {
  /** Código interno do produto extraído (sem zeros à esquerda). */
  codigoProduto: string;
  /** Valor embutido já interpretado: gramas (peso) ou reais (preço). */
  valor: number;
  formato: "peso" | "preco";
}

/**
 * Decodifica um código de barras de balança (EAN-13 de medida variável).
 * Retorna null quando não é uma etiqueta de balança válida — assim o PDV
 * cai no fluxo normal de bipagem (código de barras comum, código interno…).
 */
export function decodificarEtiquetaBalanca(codigo: string): EtiquetaBalanca | null {
  const c = String(codigo || "").replace(/\D/g, "");
  if (c.length !== 13) return null;
  // Prefixo 2 (e 20–29) é reservado pela GS1 para itens de medida variável de
  // uso interno da loja — não colide com EAN-13 de produtos de fábrica.
  if (c[0] !== "2") return null;
  const codigoProduto = String(parseInt(c.slice(1, 7), 10));
  const valorRaw = parseInt(c.slice(7, 12), 10);
  if (!Number.isFinite(valorRaw) || valorRaw <= 0) return null;
  const valor = FORMATO_ETIQUETA === "peso" ? valorRaw : valorRaw / 100;
  return { codigoProduto, valor, formato: FORMATO_ETIQUETA };
}

export interface ItemBalanca {
  produto: any;
  /** Quantidade já na unidade de estoque do produto (kg/g). */
  quantidade: number;
}

/**
 * Resolve uma etiqueta de balança contra a lista de produtos carregada no PDV.
 * Casa o código interno (ignorando zeros à esquerda) ou o código de barras
 * cadastrado, e devolve o produto + a quantidade já convertida para a unidade
 * de estoque. Retorna null se não for etiqueta ou se nenhum produto casar.
 */
export function resolverEtiquetaBalanca(codigo: string, produtos: any[]): ItemBalanca | null {
  const et = decodificarEtiquetaBalanca(codigo);
  if (!et) return null;
  const digitos = String(codigo || "").replace(/\D/g, "");
  const alvo = (produtos || []).find((p) => {
    if (!p || p.ativo === false) return false;
    const cod = String(p.codigo ?? "").replace(/\D/g, "");
    if (cod && String(parseInt(cod, 10)) === et.codigoProduto) return true;
    if (p.codigoBarras && String(p.codigoBarras).replace(/\D/g, "") === digitos) return true;
    return false;
  });
  if (!alvo) return null;

  let quantidade: number;
  if (et.formato === "peso") {
    quantidade = pesoGramasParaEstoque(et.valor, alvo.unidade);
  } else {
    // Preço embutido: quantidade = preço total ÷ preço unitário cadastrado.
    const preco = Number(alvo.precoVenda) || 0;
    quantidade = preco > 0 ? round3(et.valor / preco) : 0;
  }
  if (!(quantidade > 0)) return null;
  return { produto: alvo, quantidade };
}
