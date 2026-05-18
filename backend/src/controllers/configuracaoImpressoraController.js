import prisma from "../lib/prisma.js";

// ConfiguracaoImpressora: singleton por tenant. GET cria com defaults caso
// nao exista (assim o frontend nunca recebe null e nao precisa lidar com
// 404). PUT faz partial update, valida ranges numericos e enum de largura.

const LARGURAS_VALIDAS = new Set(["MM_58", "MM_80", "A4"]);

const CAMPOS_BOOLEAN = [
  "ativo",
  "mostrarLogo",
  "mostrarCnpj",
  "mostrarVendedor",
  "mostrarCliente",
  "abrirGavetaDinheiro",
  "imprimirAutomatico",
  "imprimirVenda",
  "imprimirOrcamento",
  "imprimirSangria",
  "imprimirSuprimento",
  "imprimirFechamento",
  "imprimirReciboFin",
];

const CAMPOS_TEXTO = ["cabecalhoExtra", "rodapeExtra"];

function defaultsImpressora() {
  return {
    ativo: true,
    largura: "MM_80",
    fonteBase: 12,
    margemMm: 4,
    cabecalhoExtra: null,
    rodapeExtra: null,
    mostrarLogo: true,
    mostrarCnpj: true,
    mostrarVendedor: true,
    mostrarCliente: true,
    viasVenda: 1,
    cortarLinhasFinal: 4,
    abrirGavetaDinheiro: false,
    imprimirAutomatico: true,
    imprimirVenda: true,
    imprimirOrcamento: true,
    imprimirSangria: true,
    imprimirSuprimento: true,
    imprimirFechamento: true,
    imprimirReciboFin: true,
  };
}

function inteiroEntre(valor, min, max) {
  const n = Number(valor);
  return Number.isFinite(n) && Math.trunc(n) === n && n >= min && n <= max;
}

function normTexto(v) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return String(v).trim().slice(0, 500);
}

export async function obter(req, res, next) {
  try {
    let cfg = await prisma.configuracaoImpressora.findFirst();
    if (!cfg) {
      cfg = await prisma.configuracaoImpressora.create({
        data: defaultsImpressora(),
      });
    }
    res.json(cfg);
  } catch (err) {
    next(err);
  }
}

export async function salvar(req, res, next) {
  try {
    const data = {};

    for (const k of CAMPOS_BOOLEAN) {
      if (req.body?.[k] !== undefined) data[k] = Boolean(req.body[k]);
    }

    for (const k of CAMPOS_TEXTO) {
      if (req.body?.[k] !== undefined) data[k] = normTexto(req.body[k]);
    }

    if (req.body?.largura !== undefined) {
      const l = String(req.body.largura).toUpperCase().trim();
      if (!LARGURAS_VALIDAS.has(l)) {
        return res.status(400).json({ erro: "Largura invalida. Use MM_58, MM_80 ou A4." });
      }
      data.largura = l;
    }

    if (req.body?.fonteBase !== undefined) {
      if (!inteiroEntre(req.body.fonteBase, 8, 24)) {
        return res.status(400).json({ erro: "Fonte base deve ser inteiro entre 8 e 24" });
      }
      data.fonteBase = Number(req.body.fonteBase);
    }

    if (req.body?.margemMm !== undefined) {
      if (!inteiroEntre(req.body.margemMm, 0, 20)) {
        return res.status(400).json({ erro: "Margem deve ser inteiro entre 0 e 20 mm" });
      }
      data.margemMm = Number(req.body.margemMm);
    }

    if (req.body?.viasVenda !== undefined) {
      if (!inteiroEntre(req.body.viasVenda, 1, 3)) {
        return res.status(400).json({ erro: "Vias deve ser inteiro entre 1 e 3" });
      }
      data.viasVenda = Number(req.body.viasVenda);
    }

    if (req.body?.cortarLinhasFinal !== undefined) {
      if (!inteiroEntre(req.body.cortarLinhasFinal, 0, 12)) {
        return res.status(400).json({ erro: "Linhas finais deve ser inteiro entre 0 e 12" });
      }
      data.cortarLinhasFinal = Number(req.body.cortarLinhasFinal);
    }

    const existente = await prisma.configuracaoImpressora.findFirst();
    const cfg = existente
      ? await prisma.configuracaoImpressora.update({ where: { id: existente.id }, data })
      : await prisma.configuracaoImpressora.create({ data: { ...defaultsImpressora(), ...data } });

    res.json(cfg);
  } catch (err) {
    next(err);
  }
}
