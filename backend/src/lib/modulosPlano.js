// ============ MODULOS POR PLANO (entitlements) ============
//
// Define QUAIS MODULOS cada plano libera para a empresa (tenant). E o segundo
// portao de acesso, acima da permissao por usuario (lib/permissoes.js):
//
//   Plano da empresa  -> libera um conjunto de modulos (este arquivo)
//   Permissao do user -> dentro desses, o que cada usuario enxerga
//
// Modelo HIBRIDO: cada plano vem com um pacote padrao (MODULOS_POR_PLANO),
// MAS o super-admin pode sobrescrever por empresa via Empresa.modulosHabilitados
// (lista explicita). Se modulosHabilitados estiver vazio/null, vale o pacote
// padrao do plano. Assim da pra vender "por plano" OU "por modulo avulso".
//
// Manter os ids em sincronia com lib/permissoes.js (IDS_MODULOS).

// Nucleo: presente em TODOS os planos pagos (e no free). Sem isso o sistema
// nao opera (vender e bater caixa).
const NUCLEO = ["PDV", "CAIXA", "DASHBOARD", "PRODUTOS", "FUNCIONARIOS"];

// Starter = nucleo + cadastros e operacao basica de loja.
const STARTER = [...NUCLEO, "CLIENTES", "ESTOQUE", "FORNECEDORES", "ORCAMENTOS"];

// Pro = Starter + gestao completa (compras, inventario, financeiro, relatorios,
// comissoes, comandas).
const PRO = [...STARTER, "COMPRAS", "INVENTARIO", "FINANCEIRO", "RELATORIOS", "COMISSOES", "COMANDAS"];

// Enterprise = Pro + CRM/relacionamento (funil, automacoes, NPS, WhatsApp).
// Equivale a TODOS os modulos.
const ENTERPRISE = [...PRO, "OPORTUNIDADES", "AUTOMACOES", "NPS", "WHATSAPP"];

export const MODULOS_POR_PLANO = {
  TRIAL: ENTERPRISE,                       // trial libera tudo (experiencia completa)
  FREE: [...NUCLEO, "CLIENTES"],           // free bem enxuto
  STARTER,
  PRO,
  ENTERPRISE,
};

// Conjunto efetivo de modulos da empresa. Se ela tem uma lista explicita
// (modulosHabilitados, definida pelo super-admin = modelo hibrido/avulso),
// ela manda. Senao, cai no pacote padrao do plano.
export function modulosDaEmpresa(empresa) {
  const explicitos = empresa?.modulosHabilitados;
  if (Array.isArray(explicitos) && explicitos.length > 0) {
    return explicitos;
  }
  return MODULOS_POR_PLANO[empresa?.plano] || MODULOS_POR_PLANO.FREE;
}

// True se o modulo esta liberado para a empresa (plano + override).
export function empresaTemModulo(empresa, modulo) {
  return modulosDaEmpresa(empresa).includes(modulo);
}
