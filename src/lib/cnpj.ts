// Consulta cadastral de CNPJ via BrasilAPI (gratuita, sem chave/token).
// Endpoint: https://brasilapi.com.br/api/cnpj/v1/{cnpj}
//
// Usada no auto-preenchimento dos cadastros de Clientes e Fornecedores:
// ao digitar os 14 digitos, busca razao social, nome fantasia e endereco
// direto na base da Receita Federal. Os campos vem em snake_case e a cidade
// chega como `municipio`.

export interface CnpjCadastro {
  razaoSocial: string;
  nomeFantasia: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;   // UF (ex.: "SP")
  cep: string;      // apenas digitos
  telefone: string; // apenas digitos (pode vir vazio)
  email: string;
}

export function apenasDigitos(v: string): string {
  return (v || "").replace(/\D/g, "");
}

// Resposta crua da BrasilAPI (apenas os campos que consumimos).
interface BrasilApiCnpj {
  razao_social?: string;
  nome_fantasia?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string | number;
  ddd_telefone_1?: string;
  email?: string;
}

// Consulta o CNPJ e devolve os dados ja normalizados. Lanca Error com mensagem
// amigavel (pronta para exibir ao usuario) quando o CNPJ e invalido, nao existe
// ou o servico esta indisponivel.
export async function consultarCnpj(cnpj: string): Promise<CnpjCadastro> {
  const d = apenasDigitos(cnpj);
  if (d.length !== 14) {
    throw new Error("CNPJ deve ter 14 dígitos.");
  }

  let resp: Response;
  try {
    resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`);
  } catch {
    throw new Error("Não foi possível consultar o CNPJ. Verifique sua conexão.");
  }

  if (resp.status === 404) {
    throw new Error("CNPJ não encontrado na Receita Federal.");
  }
  if (resp.status === 429) {
    throw new Error("Muitas consultas seguidas. Aguarde alguns segundos e tente de novo.");
  }
  if (!resp.ok) {
    throw new Error("Serviço de consulta de CNPJ indisponível no momento.");
  }

  let j: BrasilApiCnpj;
  try {
    j = (await resp.json()) as BrasilApiCnpj;
  } catch {
    throw new Error("Resposta inválida da consulta de CNPJ.");
  }

  return {
    razaoSocial: j.razao_social || "",
    nomeFantasia: j.nome_fantasia || "",
    logradouro: j.logradouro || "",
    numero: j.numero || "",
    complemento: j.complemento || "",
    bairro: j.bairro || "",
    cidade: j.municipio || "",
    estado: (j.uf || "").toUpperCase(),
    cep: apenasDigitos(String(j.cep ?? "")),
    telefone: apenasDigitos(String(j.ddd_telefone_1 ?? "")),
    email: j.email || "",
  };
}
