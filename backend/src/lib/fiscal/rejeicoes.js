// ============ DICIONARIO DE REJEICOES DA SEFAZ (cStat -> humano) ============
//
// Traduz o codigo de status da SEFAZ/gateway (cStat) numa mensagem que um
// usuario NAO-tecnico entende e, principalmente, SAIBA O QUE FAZER. O backend
// ja carrega cStat/xMotivo no ErroFiscal (lib/fiscal/provedor.js); aqui mora a
// traducao. Casa com o Ponto 4 do plano fiscal (UX de erros).
//
// FONTE: os codigos e significados vem do "Manual de Orientacao do
// Contribuinte" (MOC) — Anexo de Mensagens / Tabela de cStat da NF-e/NFC-e.
// Esta tabela e um SUBCONJUNTO CURADO dos codigos mais comuns. Ela deve ser
// expandida a partir do MOC oficial conforme aparecem rejeicoes em producao —
// trate este arquivo como DADO versionado, nao como logica.
//
// Cada entrada:
//   titulo        — resumo curto e amigavel (vira o cabecalho do alerta)
//   oQueAconteceu — explica em 1 frase, sem jargao
//   comoResolver  — a ACAO concreta que o usuario/admin deve tomar
//   quemResolve   — "operador" | "admin" | "suporte" | "sistema"
//   campo         — (opcional) campo do cadastro culpado, p/ deep-link na UI
//   retriavel     — se reenviar/reconsultar pode resolver sozinho (Onda 3)

export const REJEICOES = {
  // ---- Status informativos (nao sao erro, mas aparecem no fluxo) ----
  "100": { titulo: "Nota autorizada", oQueAconteceu: "A SEFAZ autorizou o uso da nota.",
    comoResolver: "Nada a fazer.", quemResolve: "sistema", retriavel: false },
  "101": { titulo: "Cancelamento homologado", oQueAconteceu: "A SEFAZ confirmou o cancelamento da nota.",
    comoResolver: "Nada a fazer.", quemResolve: "sistema", retriavel: false },
  "102": { titulo: "Inutilizacao homologada", oQueAconteceu: "A faixa de numeracao foi inutilizada com sucesso.",
    comoResolver: "Nada a fazer.", quemResolve: "sistema", retriavel: false },
  "107": { titulo: "SEFAZ em operacao", oQueAconteceu: "O servico da SEFAZ esta no ar.",
    comoResolver: "Pode emitir normalmente.", quemResolve: "sistema", retriavel: false },
  "108": { titulo: "SEFAZ fora do ar (momentaneo)",
    oQueAconteceu: "O servico da SEFAZ esta paralisado temporariamente.",
    comoResolver: "Aguarde alguns minutos e tente de novo. Se for urgente, use a emissao em contingencia.",
    quemResolve: "operador", retriavel: true },
  "109": { titulo: "SEFAZ fora do ar (sem previsao)",
    oQueAconteceu: "O servico da SEFAZ esta paralisado sem previsao de retorno.",
    comoResolver: "Emita em contingencia ou aguarde o restabelecimento da SEFAZ.",
    quemResolve: "operador", retriavel: true },
  "150": { titulo: "Nota autorizada (fora do prazo)",
    oQueAconteceu: "A nota foi autorizada, mas a data de emissao estava atrasada.",
    comoResolver: "Emita as proximas notas no mesmo dia da venda.", quemResolve: "operador", retriavel: false },

  // ---- Habilitacao / cadastro do emitente ----
  "203": { titulo: "Emitente nao habilitado para emissao",
    oQueAconteceu: "A SEFAZ nao reconhece esta empresa como habilitada a emitir este documento.",
    comoResolver: "Confirme o credenciamento da empresa na SEFAZ do seu estado para NFC-e/NF-e. Verifique tambem se o ambiente (homologacao/producao) esta correto em Configuracoes > Emissao Fiscal.",
    quemResolve: "admin", campo: "fiscalAtivo", retriavel: false },
  "207": { titulo: "CNPJ do emitente invalido",
    oQueAconteceu: "O CNPJ cadastrado da sua empresa nao passou na validacao da SEFAZ.",
    comoResolver: "Revise o CNPJ em Configuracoes > Dados da Empresa.", quemResolve: "admin", campo: "cnpj", retriavel: false },
  "209": { titulo: "Inscricao Estadual do emitente invalida",
    oQueAconteceu: "A Inscricao Estadual da sua empresa nao confere com o CNPJ na base da SEFAZ.",
    comoResolver: "Confira a Inscricao Estadual em Configuracoes > Emissao Fiscal — ela precisa estar ativa e vinculada ao CNPJ.",
    quemResolve: "admin", campo: "inscEstadual", retriavel: false },
  "210": { titulo: "Inscricao Estadual do cliente invalida",
    oQueAconteceu: "A IE informada para o cliente nao confere com o CNPJ dele.",
    comoResolver: "Corrija a Inscricao Estadual no cadastro do cliente, ou deixe-a em branco se for consumidor final.",
    quemResolve: "operador", campo: "dest.IE", retriavel: false },

  // ---- Duplicidade / chave ----
  "204": { titulo: "Nota duplicada",
    oQueAconteceu: "Ja existe uma nota autorizada com esses mesmos dados.",
    comoResolver: "Nao reemita. Use 'Consultar' para localizar a nota ja autorizada desta venda.",
    quemResolve: "sistema", retriavel: false },
  "539": { titulo: "Nota duplicada (chave diferente)",
    oQueAconteceu: "A SEFAZ ja tem uma nota desta venda com chave de acesso diferente — sinal de reenvio.",
    comoResolver: "Nao reemita. Consulte a nota; se houver duas, cancele a indevida dentro do prazo.",
    quemResolve: "suporte", retriavel: false },
  "236": { titulo: "Chave de acesso invalida",
    oQueAconteceu: "O digito verificador da chave de acesso esta incorreto.",
    comoResolver: "Reemita a nota. Se persistir, contate o suporte (provavel divergencia de numeracao/serie).",
    quemResolve: "suporte", retriavel: false },

  // ---- Data / schema / conteudo ----
  "228": { titulo: "Data de emissao muito antiga",
    oQueAconteceu: "A data de emissao da nota esta atrasada demais para a SEFAZ.",
    comoResolver: "Emita a nota no mesmo dia da venda. Verifique a data/hora do servidor.",
    quemResolve: "suporte", retriavel: false },
  "215": { titulo: "Erro no formato da nota",
    oQueAconteceu: "O arquivo da nota nao passou na validacao de estrutura da SEFAZ.",
    comoResolver: "Revise os dados da venda (cliente, itens, impostos). Se estiverem corretos, contate o suporte com o codigo do erro.",
    quemResolve: "suporte", retriavel: false },

  // ---- Certificado digital (liga ao Ponto 5: monitoramento) ----
  "280": { titulo: "Certificado digital invalido",
    oQueAconteceu: "A SEFAZ rejeitou o certificado digital da empresa.",
    comoResolver: "Verifique o certificado A1 no provedor fiscal — pode estar vencido, revogado ou incorreto.",
    quemResolve: "admin", campo: "certificadoRef", retriavel: false },
  "281": { titulo: "Certificado digital vencido",
    oQueAconteceu: "O certificado digital esta fora da data de validade.",
    comoResolver: "Renove o certificado A1 e reenvie ao provedor fiscal antes de emitir.",
    quemResolve: "admin", campo: "certificadoRef", retriavel: false },
  "286": { titulo: "Certificado fora do padrao ICP-Brasil",
    oQueAconteceu: "O certificado nao e um ICP-Brasil valido aceito pela SEFAZ.",
    comoResolver: "Use um certificado A1 ICP-Brasil emitido para o CNPJ da empresa.",
    quemResolve: "admin", campo: "certificadoRef", retriavel: false },

  // ---- Denegacao (irregularidade fiscal) ----
  "301": { titulo: "Uso denegado: irregularidade do emitente",
    oQueAconteceu: "A SEFAZ negou a nota por irregularidade fiscal da sua empresa.",
    comoResolver: "Regularize a situacao fiscal da empresa junto a SEFAZ. A nota denegada nao pode ser usada.",
    quemResolve: "admin", retriavel: false },
  "302": { titulo: "Uso denegado: irregularidade do cliente",
    oQueAconteceu: "A SEFAZ negou a nota por irregularidade fiscal do cliente (destinatario).",
    comoResolver: "Confirme a situacao cadastral do cliente. Se for consumidor final, emita sem identificacao.",
    quemResolve: "operador", retriavel: false },

  // ---- Disponibilidade ----
  "999": { titulo: "Erro nao catalogado na SEFAZ",
    oQueAconteceu: "A SEFAZ retornou um erro generico de processamento.",
    comoResolver: "Aguarde e tente novamente. Se persistir, contate o suporte com o motivo informado.",
    quemResolve: "suporte", retriavel: true },
};

// Normaliza o codigo: aceita "0203", 203, " 203 " -> "203". Mantem nao-numericos
// (o gateway pode devolver codigos textuais) sem quebrar a busca.
function normalizarCodigo(cStat) {
  if (cStat == null) return null;
  const s = String(cStat).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return String(Number(s)); // remove zeros a esquerda
  return s;
}

// Traduz cStat -> objeto amigavel. Sempre devolve algo util, mesmo para codigos
// desconhecidos (fallback usa o xMotivo cru da SEFAZ). `conhecido` permite ao
// chamador decidir se confia no titulo amigavel ou cai pro texto cru.
export function traduzir(cStat, xMotivoCru = null) {
  const codigo = normalizarCodigo(cStat);
  const hit = codigo ? REJEICOES[codigo] : null;
  if (hit) return { ...hit, cStat: codigo, conhecido: true };

  const motivo = xMotivoCru ? String(xMotivoCru).trim() : null;
  return {
    conhecido: false,
    cStat: codigo,
    titulo: "A SEFAZ recusou a nota",
    oQueAconteceu: motivo || "A SEFAZ nao detalhou o motivo.",
    comoResolver: codigo
      ? `Revise os dados da venda e do cliente e tente novamente. Se persistir, informe ao suporte o codigo ${codigo}.`
      : "Revise os dados da venda e do cliente e tente novamente. Se persistir, contate o suporte.",
    quemResolve: "suporte",
    campo: null,
    retriavel: false,
  };
}

// Monta o corpo de resposta HTTP padrao para um ErroFiscal. Mantem os campos
// legados (erro/cStat/xMotivo) que o frontend ja consome (lib/api.ts le
// `erro`) e ACRESCENTA `amigavel` para a UI evoluir sem quebra. Quando o codigo
// e desconhecido, preserva a mensagem original no titulo (`erro`).
export function corpoErroFiscal(err) {
  const t = traduzir(err?.cStat, err?.xMotivo || err?.message);
  return {
    erro: t.conhecido ? t.titulo : (err?.message || t.titulo),
    cStat: err?.cStat || null,
    xMotivo: err?.xMotivo || null,
    amigavel: {
      titulo: t.titulo,
      oQueAconteceu: t.oQueAconteceu,
      comoResolver: t.comoResolver,
      quemResolve: t.quemResolve,
      campo: t.campo || null,
    },
  };
}
