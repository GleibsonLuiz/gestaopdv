import prisma from "../lib/prisma.js";

// Normaliza string: undefined/null/"" -> null. Demais valores: trim mantido.
const norm = (v) => (v === undefined || v === null || v === "" ? null : v);

// Normaliza inteiro (indIEDest, crt). Aceita number, string numerica, ou
// retorna null para vazio/invalido.
const normInt = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const normBool = (v) => (v === undefined || v === null ? false : !!v);

// Campos textuais simples que aceitam null.
const CAMPOS_TEXTO = [
  "nomeFantasia", "tipoPessoa", "cnpj", "email", "telefone",
  "endereco", "cidade", "estado", "cep",
  "numero", "complemento", "bairro",
  "codMunicipioIBGE", "codUFIBGE", "codPais", "nomePais",
  "ie", "im", "emailNFe",
];

// --- Validacoes fiscais ---
// Regras espelhadas do leiaute NF-e da SEFAZ:
//   - indIEDest = 1 (Contribuinte): IE OBRIGATORIA e ieIsenta deve ser false
//   - indIEDest = 2 (Isento): IE NULA e ieIsenta = true
//   - indIEDest = 9 (Nao contribuinte): IE pode ser nula; ieIsenta indiferente
//   - crt deve ser 1, 2 ou 3 (ou null)
//   - tipoPessoa: "PF" | "PJ" (ou null para legado)
function validarFiscal(data) {
  if (data.indIEDest != null && ![1, 2, 9].includes(data.indIEDest)) {
    return "indIEDest invalido. Use 1 (Contribuinte), 2 (Isento) ou 9 (Nao contribuinte)";
  }
  if (data.crt != null && ![1, 2, 3].includes(data.crt)) {
    return "CRT invalido. Use 1 (Simples Nacional), 2 (Simples Nacional/Excesso) ou 3 (Regime Normal)";
  }
  if (data.tipoPessoa != null && !["PF", "PJ"].includes(data.tipoPessoa)) {
    return "tipoPessoa invalido. Use PF ou PJ";
  }
  // Contribuinte ICMS exige IE preenchida e nao pode estar marcado como isento.
  if (data.indIEDest === 1) {
    if (!data.ie || !String(data.ie).trim()) {
      return "Inscricao Estadual e obrigatoria quando o fornecedor e Contribuinte ICMS (indIEDest=1)";
    }
    if (data.ieIsenta) {
      return "Fornecedor Contribuinte ICMS nao pode estar marcado como Isento";
    }
  }
  // Isento: nao pode ter IE preenchida.
  if (data.indIEDest === 2 && data.ie && String(data.ie).trim()) {
    return "Fornecedor Isento de IE (indIEDest=2) nao deve ter Inscricao Estadual preenchida";
  }
  return null;
}

export async function listar(req, res, next) {
  try {
    const { search, ativo } = req.query;
    const where = {};
    if (ativo === "true") where.ativo = true;
    if (ativo === "false") where.ativo = false;
    if (search) {
      where.OR = [
        { nome: { contains: search, mode: "insensitive" } },
        { nomeFantasia: { contains: search, mode: "insensitive" } },
        { cnpj: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }
    const fornecedores = await prisma.fornecedor.findMany({
      where,
      orderBy: { nome: "asc" },
    });
    res.json(fornecedores);
  } catch (err) {
    next(err);
  }
}

export async function obter(req, res, next) {
  try {
    const fornecedor = await prisma.fornecedor.findUnique({
      where: { id: req.params.id },
    });
    if (!fornecedor) return res.status(404).json({ erro: "Fornecedor nao encontrado" });
    res.json(fornecedor);
  } catch (err) {
    next(err);
  }
}

export async function criar(req, res, next) {
  try {
    const { nome } = req.body;
    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ erro: "Nome (razao social) e obrigatorio" });
    }

    const data = { nome: String(nome).trim() };
    for (const campo of CAMPOS_TEXTO) {
      if (req.body[campo] !== undefined) data[campo] = norm(req.body[campo]);
    }
    data.indIEDest = normInt(req.body.indIEDest);
    data.crt = normInt(req.body.crt);
    data.ieIsenta = normBool(req.body.ieIsenta);
    // Se marcado isento, forca IE = null para nao ferir a regra fiscal.
    if (data.ieIsenta) data.ie = null;

    const erroValidacao = validarFiscal(data);
    if (erroValidacao) return res.status(400).json({ erro: erroValidacao });

    const fornecedor = await prisma.fornecedor.create({ data });
    res.status(201).json(fornecedor);
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ erro: "Ja existe um fornecedor com este CNPJ" });
    }
    next(err);
  }
}

export async function atualizar(req, res, next) {
  try {
    const data = {};
    if (req.body.nome !== undefined) {
      const n = String(req.body.nome).trim();
      if (!n) return res.status(400).json({ erro: "Nome nao pode ser vazio" });
      data.nome = n;
    }
    for (const campo of CAMPOS_TEXTO) {
      if (req.body[campo] !== undefined) data[campo] = norm(req.body[campo]);
    }
    if (req.body.indIEDest !== undefined) data.indIEDest = normInt(req.body.indIEDest);
    if (req.body.crt !== undefined) data.crt = normInt(req.body.crt);
    if (req.body.ieIsenta !== undefined) data.ieIsenta = normBool(req.body.ieIsenta);
    if (req.body.ativo !== undefined) data.ativo = !!req.body.ativo;
    if (data.ieIsenta === true) data.ie = null;

    // Para validar, precisamos do estado completo apos merge — busca atual.
    if (
      data.indIEDest !== undefined ||
      data.crt !== undefined ||
      data.ie !== undefined ||
      data.ieIsenta !== undefined ||
      data.tipoPessoa !== undefined
    ) {
      const atual = await prisma.fornecedor.findUnique({ where: { id: req.params.id } });
      if (!atual) return res.status(404).json({ erro: "Fornecedor nao encontrado" });
      const merged = { ...atual, ...data };
      const erroValidacao = validarFiscal(merged);
      if (erroValidacao) return res.status(400).json({ erro: erroValidacao });
    }

    const fornecedor = await prisma.fornecedor.update({
      where: { id: req.params.id },
      data,
    });
    res.json(fornecedor);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Fornecedor nao encontrado" });
    if (err.code === "P2002") return res.status(409).json({ erro: "Ja existe um fornecedor com este CNPJ" });
    next(err);
  }
}

// Soft-delete apenas: marca ativo=false. Hard-delete foi removido para
// preservar a integridade historica de produtos, compras e contas a pagar
// que referenciam o fornecedor.
export async function excluir(req, res, next) {
  try {
    await prisma.fornecedor.update({
      where: { id: req.params.id },
      data: { ativo: false },
    });
    res.status(204).end();
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ erro: "Fornecedor nao encontrado" });
    if (err.code === "P2003") {
      return res.status(409).json({
        erro: "Fornecedor possui produtos ou compras vinculados. Inative em vez de excluir.",
      });
    }
    next(err);
  }
}
