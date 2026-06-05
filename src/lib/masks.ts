// Mascaras de input compartilhadas. Centraliza funcoes de formatacao
// de CPF, CNPJ, CEP e telefone que antes eram duplicadas em varios
// modulos (Clientes, Fornecedores, Signup, Empresa, AdminMasterApp).

/** Mascara CNPJ: XX.XXX.XXX/XXXX-XX (progressiva enquanto digita). */
export function mascararCnpj(v: string | null | undefined): string {
  const d = String(v || "").replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Mascara CPF: XXX.XXX.XXX-XX (progressiva enquanto digita). */
export function mascararCpf(v: string): string {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Auto-detecta CPF (<=11 digitos) ou CNPJ (>11) e aplica a mascara. */
export function mascararCpfCnpj(valor: string): string {
  const d = (valor || "").replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) return mascararCpf(d);
  return mascararCnpj(d);
}

/** Mascara documento por tipo de pessoa. */
export function mascararDocumento(tipoPessoa: "PF" | "PJ", v: string): string {
  return tipoPessoa === "PF" ? mascararCpf(v) : mascararCnpj(v);
}

/** Mascara CEP: XXXXX-XXX. */
export function mascararCep(v: string): string {
  const d = (v || "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Mascara telefone: (XX) XXXX-XXXX ou (XX) XXXXX-XXXX. */
export function mascararTelefone(v: string): string {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}
