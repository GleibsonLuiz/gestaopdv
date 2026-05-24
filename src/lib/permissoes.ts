// Modulos do sistema. Manter sincronizado com backend/src/lib/permissoes.js.

export type ModuloId =
  | "PDV"
  | "DASHBOARD"
  | "CAIXA"
  | "CLIENTES"
  | "FORNECEDORES"
  | "PRODUTOS"
  | "ESTOQUE"
  | "INVENTARIO"
  | "COMPRAS"
  | "ORCAMENTOS"
  | "OPORTUNIDADES"
  | "AUTOMACOES"
  | "NPS"
  | "FINANCEIRO"
  | "RELATORIOS"
  | "COMISSOES"
  | "COMANDAS"
  | "WHATSAPP"
  | "FUNCIONARIOS";

export type Role = "ADMIN" | "GERENTE" | "VENDEDOR";

export interface Modulo {
  id: ModuloId;
  label: string;
  icone: string;
}

export interface UserPermissoes {
  role: Role;
  permissoes?: ModuloId[];
}

export const MODULOS: readonly Modulo[] = [
  { id: "PDV",           label: "PDV",            icone: "🛒" },
  { id: "DASHBOARD",     label: "Dashboard",      icone: "📊" },
  { id: "CAIXA",         label: "Caixa",          icone: "💵" },
  { id: "CLIENTES",      label: "Clientes",       icone: "👥" },
  { id: "FORNECEDORES",  label: "Fornecedores",   icone: "🏭" },
  { id: "PRODUTOS",      label: "Produtos",       icone: "📦" },
  { id: "ESTOQUE",       label: "Estoque",        icone: "🗃️" },
  { id: "INVENTARIO",    label: "Inventário",     icone: "📋" },
  { id: "COMPRAS",       label: "Compras",        icone: "🛍️" },
  { id: "ORCAMENTOS",    label: "Orçamentos",     icone: "📝" },
  { id: "OPORTUNIDADES", label: "Funil de Vendas", icone: "🎯" },
  { id: "AUTOMACOES",    label: "Automações",     icone: "⚡" },
  { id: "NPS",           label: "NPS pós-venda",  icone: "⭐" },
  { id: "FINANCEIRO",    label: "Financeiro",     icone: "💰" },
  { id: "RELATORIOS",    label: "Relatórios",     icone: "📑" },
  { id: "COMISSOES",     label: "Comissões",      icone: "🏆" },
  { id: "COMANDAS",      label: "Central de Comandas", icone: "🍽️" },
  { id: "WHATSAPP",      label: "Atendimento WhatsApp", icone: "💬" },
  { id: "FUNCIONARIOS",  label: "Funcionários",   icone: "🧑‍💼" },
];

export const IDS_MODULOS: ModuloId[] = MODULOS.map((m) => m.id);

// ADMIN sempre tem acesso a tudo (defesa contra "trancar fora").
// FUNCIONARIOS so e acessivel para ADMIN, independente de permissoes.
export function podeAcessar(user: UserPermissoes | null | undefined, modulo: ModuloId): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (modulo === "FUNCIONARIOS") return false;
  return Array.isArray(user.permissoes) && user.permissoes.includes(modulo);
}

// Defaults sugeridos quando nao informado no cadastro.
export function permissoesPadrao(role: Role): ModuloId[] {
  if (role === "ADMIN") return IDS_MODULOS;
  if (role === "GERENTE") {
    return ["PDV","DASHBOARD","CAIXA","CLIENTES","FORNECEDORES","PRODUTOS",
            "ESTOQUE","INVENTARIO","COMPRAS","ORCAMENTOS","OPORTUNIDADES","AUTOMACOES","NPS",
            "FINANCEIRO","RELATORIOS","COMISSOES","COMANDAS","WHATSAPP"];
  }
  return ["PDV","CAIXA","CLIENTES","PRODUTOS","ORCAMENTOS","OPORTUNIDADES","COMANDAS"];
}
