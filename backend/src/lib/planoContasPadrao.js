// ============ PLANO DE CONTAS PADRAO ============
//
// Estrutura inicial de categorias para comercio/servico no Brasil. Cobre as
// despesas operacionais mais comuns (ocupacao, pessoal, administrativas,
// comerciais, financeiras, impostos) + receitas. Contas SINTETICAS (analitica:
// false) so agrupam; ANALITICAS (analitica: true) sao as folhas que recebem
// lancamento de despesa.
//
// `codigo` segue o padrao contabil hierarquico "3.1.01.001". `paiCodigo`
// referencia o pai pelo codigo (resolvido para paiId na hora de inserir).

export const PLANO_CONTAS_PADRAO = [
  // ---- DESPESAS ----
  { codigo: "3",         nome: "Despesas",                       natureza: "DESPESA", analitica: false, paiCodigo: null },

  { codigo: "3.1",       nome: "Despesas Operacionais",          natureza: "DESPESA", analitica: false, paiCodigo: "3" },

  { codigo: "3.1.01",    nome: "Ocupacao",                       natureza: "DESPESA", analitica: false, paiCodigo: "3.1" },
  { codigo: "3.1.01.001", nome: "Aluguel",                       natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.01" },
  { codigo: "3.1.01.002", nome: "Condominio",                    natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.01" },
  { codigo: "3.1.01.003", nome: "Energia eletrica",              natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.01" },
  { codigo: "3.1.01.004", nome: "Agua e esgoto",                 natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.01" },
  { codigo: "3.1.01.005", nome: "Internet e telefone",           natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.01" },

  { codigo: "3.1.02",    nome: "Pessoal",                        natureza: "DESPESA", analitica: false, paiCodigo: "3.1" },
  { codigo: "3.1.02.001", nome: "Salarios",                      natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.02" },
  { codigo: "3.1.02.002", nome: "Pro-labore",                    natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.02" },
  { codigo: "3.1.02.003", nome: "Encargos sobre folha",          natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.02" },
  { codigo: "3.1.02.004", nome: "Vale transporte/alimentacao",   natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.02" },

  { codigo: "3.1.03",    nome: "Administrativas",                natureza: "DESPESA", analitica: false, paiCodigo: "3.1" },
  { codigo: "3.1.03.001", nome: "Material de escritorio",        natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.03" },
  { codigo: "3.1.03.002", nome: "Material de limpeza",           natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.03" },
  { codigo: "3.1.03.003", nome: "Copa e cozinha",                natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.03" },
  { codigo: "3.1.03.004", nome: "Servicos de contabilidade",     natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.03" },
  { codigo: "3.1.03.005", nome: "Software e assinaturas",        natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.03" },
  { codigo: "3.1.03.006", nome: "Manutencao e reparos",          natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.03" },

  { codigo: "3.1.04",    nome: "Comerciais",                     natureza: "DESPESA", analitica: false, paiCodigo: "3.1" },
  { codigo: "3.1.04.001", nome: "Marketing e publicidade",       natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.04" },
  { codigo: "3.1.04.002", nome: "Taxas de cartao/maquininha",    natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.04" },
  { codigo: "3.1.04.003", nome: "Fretes e entregas",             natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.04" },
  { codigo: "3.1.04.004", nome: "Embalagens",                    natureza: "DESPESA", analitica: true,  paiCodigo: "3.1.04" },

  { codigo: "3.2",       nome: "Despesas Financeiras",           natureza: "DESPESA", analitica: false, paiCodigo: "3" },
  { codigo: "3.2.001",   nome: "Juros e multas",                 natureza: "DESPESA", analitica: true,  paiCodigo: "3.2" },
  { codigo: "3.2.002",   nome: "Tarifas bancarias",              natureza: "DESPESA", analitica: true,  paiCodigo: "3.2" },
  { codigo: "3.2.003",   nome: "IOF",                            natureza: "DESPESA", analitica: true,  paiCodigo: "3.2" },

  { codigo: "3.3",       nome: "Impostos e Taxas",               natureza: "DESPESA", analitica: false, paiCodigo: "3" },
  { codigo: "3.3.001",   nome: "Simples Nacional (DAS)",         natureza: "DESPESA", analitica: true,  paiCodigo: "3.3" },
  { codigo: "3.3.002",   nome: "Alvara e taxas municipais",      natureza: "DESPESA", analitica: true,  paiCodigo: "3.3" },
  { codigo: "3.3.003",   nome: "Outros tributos",               natureza: "DESPESA", analitica: true,  paiCodigo: "3.3" },

  // ---- RECEITAS ----
  { codigo: "4",         nome: "Receitas",                       natureza: "RECEITA", analitica: false, paiCodigo: null },
  { codigo: "4.1",       nome: "Receita de Vendas",              natureza: "RECEITA", analitica: true,  paiCodigo: "4" },
  { codigo: "4.2",       nome: "Receita de Servicos",            natureza: "RECEITA", analitica: true,  paiCodigo: "4" },
  { codigo: "4.3",       nome: "Outras receitas",                natureza: "RECEITA", analitica: true,  paiCodigo: "4" },
];

// Cria o plano de contas padrao para um tenant que ainda nao tem nenhuma conta.
// Idempotente: se ja existir qualquer PlanoConta no tenant, nao faz nada.
// Insere em ordem de profundidade (pais antes dos filhos), resolvendo paiId
// pelo codigo. Recebe um delegate (prisma ou tx) que ja injeta o tenantId.
export async function garantirPlanoContasPadrao(prisma, tenantId) {
  const existe = await prisma.planoConta.count();
  if (existe > 0) return { criadas: 0 };

  // Ordena por profundidade (numero de pontos no codigo) para garantir que o
  // pai sempre exista antes do filho.
  const ordenadas = [...PLANO_CONTAS_PADRAO].sort(
    (a, b) => a.codigo.split(".").length - b.codigo.split(".").length
  );

  const idPorCodigo = new Map();
  let criadas = 0;
  for (const c of ordenadas) {
    const conta = await prisma.planoConta.create({
      data: {
        codigo: c.codigo,
        nome: c.nome,
        natureza: c.natureza,
        analitica: c.analitica,
        paiId: c.paiCodigo ? idPorCodigo.get(c.paiCodigo) ?? null : null,
        ...(tenantId ? { tenantId } : {}),
      },
    });
    idPorCodigo.set(c.codigo, conta.id);
    criadas++;
  }
  return { criadas };
}
