// Gerador PDF da folha de contagem cega de inventario.
//
// Modo cego = a folha impressa nao mostra o estoque do sistema. O operador
// vai ate a prateleira, conta fisicamente e escreve a quantidade na coluna
// vazia. So depois disso, na consolidacao, o sistema compara com o estoque
// logico e exibe as divergencias.
//
// Mantemos este helper isolado em vez de no Relatorios.tsx porque a folha
// cega tem dependencias diferentes (api.folhaInventario + api.obterEmpresa)
// e formatacao especifica (paisagem, linhas para escrita manual).

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { urlLogotipo } from "../Configuracoes";

// As respostas de /inventarios/:id/folha e /empresa nao estao tipadas
// estritamente no api.ts — usamos shapes locais com os campos que usamos.
interface ProdutoFolha {
  codigo: string;
  codigoBarras?: string | null;
  nome: string;
  unidade?: string | null;
  categoria?: { nome: string } | null;
}

interface ItemFolha {
  produto: ProdutoFolha;
}

export interface FolhaCegaPayload {
  numero: number;
  descricao?: string | null;
  filtroCategoria?: string | null;
  dataInicio: string;
  itens: ItemFolha[];
}

export interface EmpresaParaCabecalho {
  nomeFantasia?: string | null;
  razaoSocial?: string | null;
  cnpj?: string | null;
  logotipo?: string | null;
  [extra: string]: unknown;
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

// Detecta o formato que o jsPDF espera (PNG/JPEG/WEBP) a partir do mime de
// uma data URL ("data:image/png;base64,..."). Como carregarImagemDataUrl
// sempre devolve uma data URL, isso funciona tanto p/ logo em Blob/URL quanto
// p/ logo embutido como data URI no banco. Default PNG.
export function detectarFormatoImagem(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  const mime = /^data:(image\/[a-z0-9.+-]+)/i.exec(dataUrl)?.[1]?.toLowerCase() || "";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "JPEG";
  if (mime.includes("webp")) return "WEBP";
  return "PNG";
}

// Calcula largura/altura (mm) preservando a proporcao do logo dentro de uma
// caixa maxW x maxH. Evita o "achatado" de forcar dimensoes fixas no addImage
// (ex.: 22x22 distorce um logo retangular). Le o tamanho natural via
// getImageProperties do jsPDF; cai para 1:1 se a leitura falhar.
export function dimensionarLogo(
  doc: jsPDF,
  dataUrl: string,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  let ratio = 1;
  try {
    const p = doc.getImageProperties(dataUrl);
    if (p?.width && p?.height) ratio = p.width / p.height;
  } catch { /* sem props — usa 1:1 */ }
  let w = maxW;
  let h = maxW / ratio;
  if (h > maxH) { h = maxH; w = maxH * ratio; }
  return { w, h };
}

function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Ordena por categoria > nome para facilitar a contagem fisica (operador
// caminha de gondola em gondola por categoria). Sem categoria vai pro fim.
function ordenarParaContagem(itens: ItemFolha[]): ItemFolha[] {
  return [...itens].sort((a, b) => {
    const ca = a.produto.categoria?.nome || "￿";
    const cb = b.produto.categoria?.nome || "￿";
    if (ca !== cb) return ca.localeCompare(cb, "pt-BR");
    return a.produto.nome.localeCompare(b.produto.nome, "pt-BR");
  });
}

// Gera o PDF da folha cega e dispara o download. Layout paisagem A4 para
// caber Codigo + Cod.Barras + Produto + Unidade + Categoria + 2 colunas
// largas de Qtd Contada/Obs sem espremer.
export async function gerarFolhaCegaPdf(folha: FolhaCegaPayload, empresa: EmpresaParaCabecalho | null): Promise<void> {
  const doc = new jsPDF({ orientation: "l", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;

  // ---- Logo (quando ha) ----
  // urlLogotipo trata absoluta (Vercel Blob) vs relativa (/uploads em dev).
  let xTexto = marginX;
  if (empresa?.logotipo) {
    try {
      const urlLogo = urlLogotipo(empresa.logotipo);
      if (urlLogo) {
        const dataUrl = await carregarImagemDataUrl(urlLogo);
        const formato = detectarFormatoImagem(dataUrl);
        const { w, h } = dimensionarLogo(doc, dataUrl, 40, 18);
        doc.addImage(dataUrl, formato, marginX, 8, w, h);
        xTexto = marginX + w + 5;
      }
    } catch {
      // logo falhou — segue sem
    }
  }

  // ---- Cabecalho ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(empresa?.nomeFantasia || empresa?.razaoSocial || "Empresa", xTexto, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  if (empresa?.cnpj) doc.text(`CNPJ ${empresa.cnpj}`, xTexto, 19);

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  const tituloX = pageWidth - marginX;
  doc.text("FOLHA DE CONTAGEM CEGA", tituloX, 14, { align: "right" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Inventário #${folha.numero}`, tituloX, 20, { align: "right" });

  // ---- Sub-cabecalho ----
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);
  const linhas: string[] = [];
  if (folha.descricao) linhas.push(`Descrição: ${folha.descricao}`);
  if (folha.filtroCategoria) linhas.push(`Categoria: ${folha.filtroCategoria}`);
  linhas.push(`Aberto em: ${fmtDataHora(folha.dataInicio)}`);
  linhas.push(`Itens a contar: ${folha.itens.length}`);
  let yInfo = 26;
  for (const l of linhas) {
    doc.text(l, marginX, yInfo);
    yInfo += 4;
  }
  doc.setTextColor(0, 0, 0);

  // ---- Aviso modo cego ----
  doc.setFontSize(8);
  doc.setTextColor(170, 80, 0);
  doc.text(
    "ATENÇÃO: esta folha NÃO mostra o estoque do sistema. Conte fisicamente e anote nas colunas em branco.",
    pageWidth / 2,
    yInfo + 2,
    { align: "center" },
  );
  doc.setTextColor(0, 0, 0);

  // ---- Tabela ----
  const itens = ordenarParaContagem(folha.itens);
  autoTable(doc, {
    startY: yInfo + 7,
    head: [["#", "Código", "Cód. barras", "Produto", "Un.", "Categoria", "Qtd. contada", "Observação"]],
    body: itens.map((it, i) => [
      String(i + 1),
      it.produto.codigo || "—",
      it.produto.codigoBarras || "—",
      it.produto.nome,
      it.produto.unidade || "—",
      it.produto.categoria?.nome || "—",
      "", // coluna vazia para escrita manual
      "", // observacao vazia
    ]),
    theme: "grid",
    headStyles: {
      fillColor: [60, 60, 80],
      textColor: [255, 255, 255],
      fontSize: 9,
      halign: "center",
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      lineColor: [200, 200, 200],
      lineWidth: 0.2,
      minCellHeight: 8, // espaco para caligrafia
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "right" },
      1: { cellWidth: 22 },
      2: { cellWidth: 30 },
      3: { cellWidth: "auto" },
      4: { cellWidth: 14, halign: "center" },
      5: { cellWidth: 32 },
      6: { cellWidth: 32 },
      7: { cellWidth: 40 },
    },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      const totalPaginas = doc.getNumberOfPages();
      const paginaAtual = (doc as unknown as { internal: { getCurrentPageInfo: () => { pageNumber: number } } })
        .internal.getCurrentPageInfo().pageNumber;
      doc.text(
        `Folha ${paginaAtual} de ${totalPaginas}`,
        pageWidth - marginX,
        pageHeight - 6,
        { align: "right" },
      );
      doc.setTextColor(0, 0, 0);
    },
  });

  // ---- Rodape com assinaturas ----
  const docLast = doc as unknown as { lastAutoTable?: { finalY: number } };
  const finalY = docLast.lastAutoTable?.finalY || 0;
  const pageHeight = doc.internal.pageSize.getHeight();
  // Se nao couber assinatura na pagina, adiciona nova
  const ySign = finalY + 18 > pageHeight - 14 ? (doc.addPage(), 24) : finalY + 18;

  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.3);
  const meio = pageWidth / 2;
  doc.line(marginX + 10, ySign, meio - 10, ySign);
  doc.line(meio + 10, ySign, pageWidth - marginX - 10, ySign);

  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text("Conferente (nome e assinatura)", (marginX + meio) / 2, ySign + 5, { align: "center" });
  doc.text("Supervisor (nome e assinatura)", (meio + pageWidth - marginX) / 2, ySign + 5, { align: "center" });

  doc.save(`folha-cega-inv-${folha.numero}-${hojeIso()}.pdf`);
}
