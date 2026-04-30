// Modulos do sistema. Manter sincronizado com backend/src/lib/permissoes.js.
export const MODULOS = [
  { id: "PDV",           label: "PDV",           icone: "🛒" },
  { id: "DASHBOARD",     label: "Dashboard",     icone: "📊" },
  { id: "CLIENTES",      label: "Clientes",      icone: "👥" },
  { id: "FORNECEDORES",  label: "Fornecedores",  icone: "🏭" },
  { id: "PRODUTOS",      label: "Produtos",      icone: "📦" },
  { id: "ESTOQUE",       label: "Estoque",       icone: "🗃️" },
  { id: "COMPRAS",       label: "Compras",       icone: "🛍️" },
  { id: "FINANCEIRO",    label: "Financeiro",    icone: "💰" },
  { id: "RELATORIOS",    label: "Relatórios",    icone: "📑" },
  { id: "FUNCIONARIOS",  label: "Funcionários",  icone: "🧑‍💼" },
];

export const IDS_MODULOS = MODULOS.map(m => m.id);

// ADMIN sempre tem acesso a tudo (defesa contra "trancar fora").
// FUNCIONARIOS so e acessivel para ADMIN, independente de permissoes.
export function podeAcessar(user, modulo) {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (modulo === "FUNCIONARIOS") return false;
  return Array.isArray(user.permissoes) && user.permissoes.includes(modulo);
}

// Defaults sugeridos quando nao informado no cadastro.
export function permissoesPadrao(role) {
  if (role === "ADMIN") return IDS_MODULOS;
  if (role === "GERENTE") {
    return ["PDV","DASHBOARD","CLIENTES","FORNECEDORES","PRODUTOS",
            "ESTOQUE","COMPRAS","FINANCEIRO","RELATORIOS"];
  }
  return ["PDV","CLIENTES","PRODUTOS"];
}
