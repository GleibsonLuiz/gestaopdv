// ============ GATE A: VALIDADOR SEMANTICO DO PAYLOAD (Onda 3) ============
//
// Validacao LOCAL do payload JA MONTADO (infNFe / infDPS), executada ANTES de
// reservar numero fiscal e ANTES de transmitir. O objetivo e barrar dado
// inconsistente que a SEFAZ rejeitaria — SEM gastar numeracao nem uma chamada
// ao gateway. Complementa (nao substitui) as guardas que o proprio montarNfce/
// montarNfse ja fazem (sem itens, pagamento < total, campos obrigatorios) e o
// XSD/assinatura que o gateway aplica.
//
// Por que validar o payload montado (e nao a Venda crua)? Porque o montar
// aplica DEFAULTS perigosos — NCM ausente vira "00000000", CFOP ausente vira
// "5102" — que passam batido na montagem mas sao rejeicao certa na SEFAZ. Olhar
// o resultado final pega esses casos e e agnostico de provedor.
//
// Retorno: { ok, erros: [{ campo, item?, msg }] }. `erros` ja vem em pt-BR
// acionavel para a UI listar o que corrigir (Ponto 6 do plano: o usuario sempre
// sabe o que fazer).

// ---- Validacao de CPF/CNPJ por digito verificador (nao ha util no backend) ----

function todosIguais(s) {
  return /^(\d)\1+$/.test(s);
}

export function validarCpf(cpf) {
  const d = String(cpf || "").replace(/\D/g, "");
  if (d.length !== 11 || todosIguais(d)) return false;
  const calc = (fatorInicial) => {
    let soma = 0;
    for (let i = 0; i < fatorInicial - 1; i++) soma += Number(d[i]) * (fatorInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(10) === Number(d[9]) && calc(11) === Number(d[10]);
}

export function validarCnpj(cnpj) {
  const d = String(cnpj || "").replace(/\D/g, "");
  if (d.length !== 14 || todosIguais(d)) return false;
  const calc = (tam) => {
    const pesos = tam === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < tam; i++) soma += Number(d[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

// Valida documento por tamanho: 11 = CPF, 14 = CNPJ. Outros tamanhos: invalido.
export function validarCpfCnpj(doc) {
  const d = String(doc || "").replace(/\D/g, "");
  if (d.length === 11) return validarCpf(d);
  if (d.length === 14) return validarCnpj(d);
  return false;
}

const ehDigitos = (v, n) => typeof v === "string" && new RegExp(`^\\d{${n}}$`).test(v);

// ---------------- NFC-e (infNFe) ----------------

export function validarNfce(payload) {
  const erros = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, erros: [{ campo: "payload", msg: "Payload da NFC-e ausente." }] };
  }

  // Emitente
  const emit = payload.emit || {};
  if (!validarCnpj(emit.CNPJ)) {
    erros.push({ campo: "emit.CNPJ", msg: "CNPJ da empresa invalido. Revise em Configuracoes > Dados da Empresa." });
  }
  if (!emit.IE || !/^\d+$/.test(String(emit.IE))) {
    erros.push({ campo: "emit.IE", msg: "Inscricao Estadual ausente ou invalida. Revise em Configuracoes > Emissao Fiscal." });
  }

  // Destinatario (opcional na NFC-e; se informado, o documento precisa ser valido)
  const dest = payload.dest;
  if (dest && (dest.CPF || dest.CNPJ)) {
    const doc = dest.CPF || dest.CNPJ;
    if (!validarCpfCnpj(doc)) {
      erros.push({
        campo: "dest", msg: "CPF/CNPJ do cliente invalido. Corrija o cadastro do cliente ou emita sem identificacao.",
      });
    }
  }

  // Itens
  const det = Array.isArray(payload.det) ? payload.det : [];
  if (det.length === 0) {
    erros.push({ campo: "det", msg: "Nota sem itens." });
  }
  det.forEach((d) => {
    const prod = d?.prod || {};
    const ref = prod.xProd ? `"${prod.xProd}"` : `item ${d?.nItem ?? "?"}`;
    const nItem = d?.nItem ?? null;

    if (!ehDigitos(prod.NCM, 8) || prod.NCM === "00000000") {
      erros.push({ campo: "NCM", item: nItem,
        msg: `Produto ${ref} sem NCM valido (8 digitos). Cadastre o NCM em Produtos > Tributacao.` });
    }
    if (!ehDigitos(prod.CFOP, 4)) {
      erros.push({ campo: "CFOP", item: nItem,
        msg: `Produto ${ref} com CFOP invalido (4 digitos). Ajuste em Produtos > Tributacao.` });
    }
    if (!(Number(prod.qCom) > 0)) {
      erros.push({ campo: "qCom", item: nItem, msg: `Produto ${ref} com quantidade invalida (deve ser maior que zero).` });
    }
    if (!prod.xProd || !String(prod.xProd).trim()) {
      erros.push({ campo: "xProd", item: nItem, msg: `Item ${d?.nItem ?? "?"} sem descricao.` });
    }
  });

  return { ok: erros.length === 0, erros };
}

// ---------------- NFS-e (infDPS) ----------------

export function validarNfse(payload) {
  const erros = [];
  if (!payload || typeof payload !== "object") {
    return { ok: false, erros: [{ campo: "payload", msg: "Payload da NFS-e ausente." }] };
  }

  const prest = payload.prest || {};
  if (!validarCnpj(prest.CNPJ)) {
    erros.push({ campo: "prest.CNPJ", msg: "CNPJ da empresa invalido. Revise em Configuracoes > Dados da Empresa." });
  }
  if (!prest.IM || !/^\d+$/.test(String(prest.IM))) {
    erros.push({ campo: "prest.IM", msg: "Inscricao Municipal ausente ou invalida (obrigatoria para NFS-e)." });
  }

  const cServ = payload.serv?.cServ || {};
  if (!cServ.cTribNac || !/^\d+$/.test(String(cServ.cTribNac))) {
    erros.push({ campo: "serv.cServ.cTribNac", msg: "Item da lista de servicos (LC 116) ausente ou invalido." });
  }
  if (!cServ.xDescServ || !String(cServ.xDescServ).trim()) {
    erros.push({ campo: "serv.cServ.xDescServ", msg: "Discriminacao do servico e obrigatoria." });
  }

  const vServ = Number(payload.valores?.vServPrest?.vServ);
  if (!(vServ > 0)) {
    erros.push({ campo: "valores.vServPrest.vServ", msg: "Valor do servico deve ser maior que zero." });
  }

  const pAliq = Number(payload.valores?.trib?.tribMun?.pAliq);
  if (!Number.isFinite(pAliq) || pAliq < 0 || pAliq > 100) {
    erros.push({ campo: "tribMun.pAliq", msg: "Aliquota do ISS invalida (0 a 100)." });
  }

  // Tomador (opcional; se informado com documento, precisa ser valido)
  const toma = payload.toma;
  if (toma && (toma.CPF || toma.CNPJ)) {
    if (!validarCpfCnpj(toma.CPF || toma.CNPJ)) {
      erros.push({ campo: "toma", msg: "CPF/CNPJ do tomador invalido. Corrija o cadastro do cliente." });
    }
  }

  return { ok: erros.length === 0, erros };
}
