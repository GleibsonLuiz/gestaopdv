// Consulta de CEP via ViaCEP (https://viacep.com.br).
// Centraliza a busca que antes era duplicada em Clientes e Fornecedores.

export interface ViaCepDados {
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
  codMunicipioIBGE: string;
}

export async function buscarCepViaCEP(cepMascarado: string): Promise<ViaCepDados | null> {
  const d = cepMascarado.replace(/\D/g, "");
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!r.ok) return null;
    const j = await r.json();
    if (j.erro) return null;
    return {
      logradouro: j.logradouro || "",
      bairro: j.bairro || "",
      cidade: j.localidade || "",
      estado: j.uf || "",
      codMunicipioIBGE: j.ibge || "",
    };
  } catch {
    return null;
  }
}
