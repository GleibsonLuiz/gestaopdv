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
  | "FUNCIONARIOS"
  // FISCAL (NFC-e) NAO e um modulo de permissao de usuario — e so um modulo de
  // PLANO (entitlement). Por isso fica fora de MODULOS, mas e um ModuloId valido
  // para o gate de plano (moduloNoPlano / MODULOS_PLANO).
  | "FISCAL";

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

// Lista de modulos que o PLANO pode liberar (entitlements). Inclui os 19 de
// permissao + FISCAL (NFC-e), que e cobrado por plano mas nao e permissao de
// usuario. Usada pelo Admin Master para ligar/desligar modulos por empresa.
export const MODULOS_PLANO: readonly Modulo[] = [
  ...MODULOS,
  { id: "FISCAL", label: "Nota Fiscal (NFC-e)", icone: "🧾" },
];

// ============ GATE DE PLANO (entitlements por empresa) ============
//
// Alem da permissao por usuario, ha o portao do PLANO: a empresa so tem acesso
// aos modulos liberados pelo plano contratado (+ overrides do super-admin). O
// backend manda a lista efetiva em empresa.modulos (login/me); o api.ts chama
// setModulosHabilitados() ao salvar a sessao. null = sem restricao (compat com
// sessao antiga / dados ausentes — libera tudo, o backend ainda protege).
let modulosDoPlano: Set<ModuloId> | null = null;

export function setModulosHabilitados(mods?: readonly string[] | null): void {
  modulosDoPlano = (Array.isArray(mods) && mods.length > 0)
    ? new Set(mods as ModuloId[])
    : null;
}

// O modulo esta incluido no plano da empresa? (vale ate para ADMIN — modulo nao
// contratado nao abre pra ninguem). Sem info (null) = libera, o backend protege.
export function moduloNoPlano(modulo: ModuloId): boolean {
  if (!modulosDoPlano) return true;
  return modulosDoPlano.has(modulo);
}

// ADMIN sempre tem acesso a tudo DENTRO do plano (defesa contra "trancar fora").
// FUNCIONARIOS so e acessivel para ADMIN, independente de permissoes.
export function podeAcessar(user: UserPermissoes | null | undefined, modulo: ModuloId): boolean {
  // Portao 1: o plano da empresa precisa incluir o modulo.
  if (!moduloNoPlano(modulo)) return false;
  // Portao 2: permissao do usuario.
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
