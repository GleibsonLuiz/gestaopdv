import { createRoot } from "react-dom/client";
import { api } from "./api.js";

// ConfiguracaoImpressora — cache em memoria (TTL curto). O backend cria com
// defaults se nao existir, entao podemos confiar que sempre teremos um objeto.

let cacheImpressora = null;
let cacheImpressoraTs = 0;
const TTL_MS = 30_000;

const FALLBACK = Object.freeze({
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
});

export async function obterConfigImpressora() {
  const agora = Date.now();
  if (cacheImpressora && (agora - cacheImpressoraTs) < TTL_MS) return cacheImpressora;
  try {
    cacheImpressora = await api.obterConfiguracaoImpressora();
    cacheImpressoraTs = agora;
  } catch {
    cacheImpressora = FALLBACK;
  }
  return cacheImpressora;
}

export function invalidarCacheImpressora() {
  cacheImpressora = null;
  cacheImpressoraTs = 0;
}

// Largura @page conforme enum LarguraImpressao do Prisma.
export function paginaDeLargura(largura) {
  if (largura === "MM_58") return "58mm auto";
  if (largura === "A4") return "A4";
  return "80mm auto";
}

// Largura visual do cupom oculto em tela (mesma da impressao).
export function larguraEmTela(largura) {
  if (largura === "MM_58") return "58mm";
  if (largura === "A4") return "180mm";
  return "80mm";
}

// Mapeia tipo de documento -> chave booleana do schema.
const FLAG_POR_TIPO = {
  VENDA: "imprimirVenda",
  ORCAMENTO: "imprimirOrcamento",
  SANGRIA: "imprimirSangria",
  SUPRIMENTO: "imprimirSuprimento",
  FECHAMENTO_CAIXA: "imprimirFechamento",
  RECIBO_FIN: "imprimirReciboFin",
  TESTE: null, // teste ignora flags, sempre imprime
};

export function devePrintar(tipo, cfg) {
  if (!cfg?.ativo) return false;
  const flag = FLAG_POR_TIPO[tipo];
  if (flag === undefined) return false; // tipo desconhecido
  if (flag === null) return true; // TESTE
  return Boolean(cfg[flag]);
}

// Espera ~2 frames + onload das imagens do nodo antes de imprimir.
// Sem isso, a primeira impressao apos createRoot pode sair sem o logo.
async function aguardarPaintEImagens(container) {
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const imgs = Array.from(container.querySelectorAll("img"));
  const pendentes = imgs.filter(i => !i.complete);
  if (pendentes.length === 0) return;
  await Promise.race([
    Promise.all(pendentes.map(i => new Promise(r => {
      i.addEventListener("load", r, { once: true });
      i.addEventListener("error", r, { once: true });
    }))),
    new Promise(r => setTimeout(r, 1500)),
  ]);
}

// Imprime um documento React a partir de qualquer lugar do app, sem precisar
// que o componente esteja na arvore. Monta o componente num container oculto,
// espera o paint + onload de imagens, dispara window.print() e desmonta no
// afterprint. Usado para Caixa, Financeiro e botao de teste — o PDV ja tem
// o cupom embutido no ReciboModal e pode chamar window.print() direto.
export async function imprimirDocumento(elemento, { viasVenda = 1 } = {}) {
  const container = document.createElement("div");
  container.setAttribute("data-cupom-portal", "true");
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(elemento);
  await aguardarPaintEImagens(container);

  const limpar = () => {
    try { root.unmount(); } catch {}
    container.remove();
    window.removeEventListener("afterprint", limpar);
  };
  window.addEventListener("afterprint", limpar, { once: true });
  // Fallback caso afterprint nao dispare (alguns navegadores em PDF):
  setTimeout(limpar, 60_000);

  for (let i = 0; i < Math.max(1, viasVenda); i++) {
    window.print();
    if (i + 1 < viasVenda) {
      // Pequena pausa entre vias para o navegador conseguir reabrir o
      // dialogo. Sem isso o Chrome ignora a 2a chamada.
      await new Promise(r => setTimeout(r, 400));
    }
  }
}
