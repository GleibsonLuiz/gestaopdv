// Gerador de PDF do "Pedido de Compra" — documento para IMPRIMIR e levar ao
// fornecedor (ex.: comprador se desloca ate o atacadista). NAO mexe em estoque
// nem financeiro: e so a lista do que comprar, agrupada POR FORNECEDOR (uma
// secao/pagina por fornecedor, pra entregar uma folha em cada). As colunas de
// preco e total ficam EM BRANCO para o comprador preencher durante a
// negociacao; mostramos o ultimo custo cadastrado como referencia.
//
// Mesmo motor dos outros PDFs do projeto (jsPDF + autotable) — ver
// folhaCegaPdf.ts, do qual este reaproveita o padrao de cabecalho/logo.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { urlLogotipo } from "../Configuracoes";
import type { EmpresaParaCabecalho } from "./folhaCegaPdf";

export interface ItemPedidoPdf {
  codigo: string;
  nome: string;
  unidade: string;
  estoque: number;
  estoqueMinimo: number;
  quantidade: number;
  precoCusto: number | null;
  fornecedorId: string | null;
  fornecedorNome: string | null;
  fornecedorCnpj?: string | null;
}

const fmtBRL = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtQtd = (v: number): string =>
  Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function carregarImagemDataUrl(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("imagem nao acessivel");
  const blob = await resp.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface GrupoFornecedor {
  chave: string;
  nome: string;
  cnpj: string | null;
  itens: ItemPedidoPdf[];
}

// Agrupa por fornecedor preferido (sem fornecedor -> grupo "a definir"),
// ordenando os grupos por nome e mantendo "a definir" por ultimo.
function agruparPorFornecedor(itens: ItemPedidoPdf[]): GrupoFornecedor[] {
  const mapa = new Map<string, GrupoFornecedor>();
  for (const it of itens) {
    const chave = it.fornecedorId || "__sem__";
    if (!mapa.has(chave)) {
      mapa.set(chave, {
        chave,
        nome: it.fornecedorNome || "Fornecedor a definir",
        cnpj: it.fornecedorCnpj || null,
        itens: [],
      });
    }
    mapa.get(chave)!.itens.push(it);
  }
  return [...mapa.values()].sort((a, b) => {
    if (a.chave === "__sem__") return 1;
    if (b.chave === "__sem__") return -1;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

/**
 * Gera o PDF do pedido de compra e dispara o download. Uma secao por
 * fornecedor (cada uma comeca em pagina nova), pra o comprador levar uma
 * folha por fornecedor.
 */
export async function gerarPedidoCompraPdf(
  itens: ItemPedidoPdf[],
  empresa: EmpresaParaCabecalho | null,
): Promise<void> {
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  // Carrega o logo uma unica vez (reusado em cada pagina).
  let logoDataUrl: string | null = null;
  let logoFormato: "PNG" | "JPEG" = "PNG";
  if (empresa?.logotipo) {
    try {
      const urlLogo = urlLogotipo(empresa.logotipo);
      if (urlLogo) {
        logoDataUrl = await carregarImagemDataUrl(urlLogo);
        const ext = (empresa.logotipo.split(".").pop() || "png").toLowerCase();
        logoFormato = ext === "jpg" || ext === "jpeg" ? "JPEG" : "PNG";
      }
    } catch { /* segue sem logo */ }
  }

  const dataEmissao = new Date().toLocaleDateString("pt-BR");
  const grupos = agruparPorFornecedor(itens);

  function desenharCabecalho(grupo: GrupoFornecedor): number {
    let xTexto = marginX;
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, logoFormato, marginX, 10, 18, 18);
        xTexto = marginX + 22;
      } catch { /* ignora */ }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text(empresa?.nomeFantasia || empresa?.razaoSocial || "Empresa", xTexto, 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    if (empresa?.cnpj) doc.text(`CNPJ ${empresa.cnpj}`, xTexto, 20);

    doc.setFontSize(15);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("PEDIDO DE COMPRA", pageWidth - marginX, 15, { align: "right" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Emissão: ${dataEmissao}`, pageWidth - marginX, 20, { align: "right" });

    // Faixa do fornecedor
    const yBox = 26;
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(244, 244, 248);
    doc.roundedRect(marginX, yBox, pageWidth - marginX * 2, 13, 1.5, 1.5, "FD");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("FORNECEDOR", marginX + 4, yBox + 5);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(grupo.nome, marginX + 4, yBox + 10.5);
    if (grupo.cnpj) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      doc.text(`CNPJ ${grupo.cnpj}`, pageWidth - marginX - 4, yBox + 10.5, { align: "right" });
    }
    doc.setTextColor(0, 0, 0);
    return yBox + 17;
  }

  grupos.forEach((grupo, idx) => {
    if (idx > 0) doc.addPage();
    const startY = desenharCabecalho(grupo);

    autoTable(doc, {
      startY,
      head: [["#", "Código", "Produto", "Estq.", "Qtd", "Un.", "Preço R$", "Total R$"]],
      body: grupo.itens.map((it, i) => [
        String(i + 1),
        it.codigo || "—",
        it.nome,
        fmtQtd(it.estoque),
        fmtQtd(it.quantidade),
        it.unidade || "UN",
        // Preço/Total ficam em branco para preencher na negociação; o custo
        // de referência aparece pequeno na própria célula de preço.
        it.precoCusto != null ? `ref. ${fmtBRL(it.precoCusto)}` : "",
        "",
      ]),
      theme: "grid",
      headStyles: { fillColor: [60, 60, 80], textColor: [255, 255, 255], fontSize: 9, halign: "center" },
      styles: { fontSize: 9, cellPadding: 2.5, lineColor: [205, 205, 205], lineWidth: 0.2, minCellHeight: 9 },
      columnStyles: {
        0: { cellWidth: 8, halign: "right" },
        1: { cellWidth: 22 },
        2: { cellWidth: "auto" },
        3: { cellWidth: 16, halign: "right", textColor: [120, 120, 120] },
        4: { cellWidth: 16, halign: "right", fontStyle: "bold" },
        5: { cellWidth: 12, halign: "center" },
        6: { cellWidth: 26, halign: "right", textColor: [150, 150, 150], fontSize: 7 },
        7: { cellWidth: 26 },
      },
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        const paginaAtual = (doc as unknown as { internal: { getCurrentPageInfo: () => { pageNumber: number } } })
          .internal.getCurrentPageInfo().pageNumber;
        doc.text(`Página ${paginaAtual} de ${doc.getNumberOfPages()}`, pageWidth - marginX, pageHeight - 6, { align: "right" });
        doc.setTextColor(0, 0, 0);
      },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || startY;

    // Resumo do grupo: nº de itens + soma estimada (pelo custo de referência).
    const totalItens = grupo.itens.length;
    const somaRef = grupo.itens.reduce((acc, it) => acc + (it.quantidade * (Number(it.precoCusto) || 0)), 0);
    let y = finalY + 7;
    if (y > pageHeight - 40) { doc.addPage(); y = 24; }
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 70);
    doc.text(`${totalItens} ${totalItens === 1 ? "item" : "itens"} neste pedido`, marginX, y);
    if (somaRef > 0) {
      doc.text(`Estimativa (custo ref.): ${fmtBRL(somaRef)}`, pageWidth - marginX, y, { align: "right" });
    }
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(8);
    doc.text("Preços e total a preencher na negociação.", marginX, y + 4.5);
    doc.setTextColor(0, 0, 0);

    // Linhas de assinatura
    const ySign = Math.min(y + 22, pageHeight - 16);
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.3);
    const meio = pageWidth / 2;
    doc.line(marginX + 6, ySign, meio - 8, ySign);
    doc.line(meio + 8, ySign, pageWidth - marginX - 6, ySign);
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    doc.text("Comprador", (marginX + 6 + meio - 8) / 2, ySign + 4.5, { align: "center" });
    doc.text("Fornecedor", (meio + 8 + pageWidth - marginX - 6) / 2, ySign + 4.5, { align: "center" });
    doc.setTextColor(0, 0, 0);
  });

  doc.save(`pedido-compra-${hojeIso()}.pdf`);
}
