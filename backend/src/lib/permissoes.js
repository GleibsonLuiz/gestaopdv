// Modulos do sistema. Manter sincronizado com src/lib/permissoes.js (frontend).
export const IDS_MODULOS = [
  "PDV",
  "DASHBOARD",
  "CAIXA",
  "CLIENTES",
  "FORNECEDORES",
  "PRODUTOS",
  "ESTOQUE",
  "COMPRAS",
  "FINANCEIRO",
  "RELATORIOS",
  "FUNCIONARIOS",
];

const SET_MODULOS = new Set(IDS_MODULOS);

// Sanitiza array vindo do request: dedup, uppercase, mantem so modulos validos.
export function sanitizarPermissoes(arr) {
  if (!Array.isArray(arr)) return [];
  const out = new Set();
  for (const v of arr) {
    if (typeof v !== "string") continue;
    const u = v.trim().toUpperCase();
    if (SET_MODULOS.has(u)) out.add(u);
  }
  return Array.from(out);
}

export function permissoesPadrao(role) {
  if (role === "ADMIN") return [...IDS_MODULOS];
  if (role === "GERENTE") {
    return ["PDV","DASHBOARD","CAIXA","CLIENTES","FORNECEDORES","PRODUTOS",
            "ESTOQUE","COMPRAS","FINANCEIRO","RELATORIOS"];
  }
  return ["PDV","CAIXA","CLIENTES","PRODUTOS"];
}

// ADMIN sempre passa. FUNCIONARIOS so para ADMIN.
export function temPermissao(user, modulo) {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (modulo === "FUNCIONARIOS") return false;
  return Array.isArray(user.permissoes) && user.permissoes.includes(modulo);
}
