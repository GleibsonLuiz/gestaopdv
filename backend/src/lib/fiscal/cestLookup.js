// Sugestao de CEST a partir do NCM. Tabela do Convenio ICMS 142/2018
// (Anexos II a XXIX), consolidada em cest.json no formato compacto
// [cest7digitos, prefixoNcm, descricao].
//
// O CEST e CONDICIONALMENTE obrigatorio: so para itens sujeitos a Substituicao
// Tributaria. Por isso "nenhuma sugestao" NAO prova que o produto esta fora de
// ST — esta e a tabela nacional base, e cada UF pode ter aditivos. Tratar como
// ponto de partida que o usuario/contador confirma, nao como verdade fiscal.
//
// Match por PREFIXO: a tabela oficial usa curingas ("2202XXXX"), entao guardamos
// so o prefixo numerico e testamos se o NCM do produto "comeca com" ele. Linhas
// mais especificas (prefixo maior) vem primeiro.
import tabela from "./cest.json" with { type: "json" };

const ROWS = tabela.map(([cest, prefixo, descricao]) => ({ cest, prefixo, descricao }));

// "0300700" -> "03.007.00"
function formatarCest(c) {
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 7)}`;
}

// Recebe um NCM (8 digitos) e devolve as linhas CEST candidatas, das mais
// especificas (prefixo de 8) para as mais genericas. Array vazio se nao bater.
export function sugerirCest(ncm) {
  const n = String(ncm || "").replace(/\D/g, "");
  if (n.length !== 8) return [];
  const achados = ROWS.filter((r) => n.startsWith(r.prefixo));
  achados.sort((a, b) => b.prefixo.length - a.prefixo.length);
  return achados.map((r) => ({
    cest: r.cest,
    cestFormatado: formatarCest(r.cest),
    descricao: r.descricao,
  }));
}
