import { z } from "zod";

// Validacao de FORMA na borda das rotas de escrita criticas. Filosofia:
// rejeitar payload estruturalmente invalido (tipo errado, array vazio,
// numero absurdo) com 400 claro ANTES da logica de negocio — em vez de
// deixar virar 500 no fundo do controller ou dado lixo no banco.
//
// As regras de NEGOCIO (total bate com split, estoque, limite de credito,
// idempotencia) continuam nos controllers — calcularTotalVenda e a fonte
// unica do calculo e NAO e duplicada aqui. Por isso os schemas usam
// .passthrough(): campo desconhecido passa adiante, schema nunca fica
// dessincronizado do front por um campo novo.

export function validarBody(schema) {
  return (req, res, next) => {
    const r = schema.safeParse(req.body ?? {});
    if (!r.success) {
      const issue = r.error.issues[0];
      const onde = issue.path.length ? ` em "${issue.path.join(".")}"` : "";
      return res.status(400).json({
        erro: `Dados invalidos${onde}: ${issue.message}`,
        validacao: r.error.issues.slice(0, 5).map(i => ({
          campo: i.path.join("."),
          problema: i.message,
        })),
      });
    }
    // Substitui o body pelo parseado (numeros coagidos, strings aparadas).
    req.body = r.data;
    next();
  };
}

// Numero monetario/quantidade vindo do front: aceita number ou string
// numerica ("12,50" NAO — o front ja manda ponto), rejeita NaN/Infinity
// e valores fora de faixa plausivel de PDV.
const numeroPositivo = (max) =>
  z.coerce.number().finite().positive().max(max);
const numeroNaoNegativo = (max) =>
  z.coerce.number().finite().min(0).max(max);

const MAX_VALOR = 100_000_000;   // R$ 100 mi por campo — acima disso e lixo
const MAX_QTD = 1_000_000;       // 1 tonelada em gramas cabe folgado

// ---------- VENDA (POST /vendas) ----------
const itemVendaSchema = z.object({
  produtoId: z.string().min(1, "produtoId obrigatorio"),
  quantidade: numeroPositivo(MAX_QTD),
  // Preco e opcional no shape (controller resolve do cadastro quando falta),
  // mas se vier precisa ser um numero valido >= 0.
  precoUnitario: numeroNaoNegativo(MAX_VALOR).optional(),
}).passthrough();

export const criarVendaSchema = z.object({
  itens: z.array(itemVendaSchema)
    .min(1, "informe ao menos um item")
    .max(500, "maximo de 500 itens por venda"),
  desconto: numeroNaoNegativo(MAX_VALOR).optional(),
  pagamentos: z.array(
    z.object({
      forma: z.string().min(1),
      valor: numeroNaoNegativo(MAX_VALOR),
    }).passthrough()
  ).max(20).optional(),
}).passthrough();

// ---------- CAIXA ----------
export const abrirCaixaSchema = z.object({
  saldoInicial: numeroNaoNegativo(MAX_VALOR).optional(),
}).passthrough();

export const fecharCaixaSchema = z.object({
  saldoFinalContado: numeroNaoNegativo(MAX_VALOR).optional(),
  trocoProximoDia: numeroNaoNegativo(MAX_VALOR).optional(),
}).passthrough();

export const movimentoCaixaSchema = z.object({
  valor: numeroPositivo(MAX_VALOR),
}).passthrough();
