// @ts-nocheck — extraido verbatim de Relatorios.tsx no fatiamento (Fase 5).
// Infra unica de PDF dos relatorios (DESIGN_STANDARDS.md §5): cabecalho da
// empresa, cor de header, densidade das tabelas e alinhamento mono das
// colunas numericas. Ajustes aqui refletem em TODOS os ~80 blocos de tabela.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatarEndereco, obterConfiguracaoCache } from "../HeaderRelatorio.jsx";
import { urlLogotipo } from "../Configuracoes";
import { detectarFormatoImagem, dimensionarLogo } from "../lib/folhaCegaPdf";

// Identidade executiva dos PDFs: header de tabela sobrio em grafite-azulado
// em vez dos headers coloridos chapados de antes. Fonte unica de verdade.
export const COR_HEADER_PDF = [30, 33, 45];

// Hook didParseCell compartilhado: alinha a direita + fonte mono (courier) as
// celulas numericas do CORPO da tabela no PDF, espelhando o padrao da tela
// (numeros mono tabular). Deteccao por conteudo: moeda (R$...), percentual,
// numero puro, ou numero com sufixo curto (d, x, un, kg, h). Datas (com "/") e
// textos ficam alinhados a esquerda. Injetado em todas as chamadas autoTable.
export function pdfAlinhaNumeros(data) {
  if (data.section !== "body") return;
  const raw = Array.isArray(data.cell.text) ? data.cell.text.join("") : String(data.cell.text ?? "");
  const t = raw.trim();
  const ehNumero =
    /^R\$/.test(t) ||
    /^-?[\d.]+(,\d+)?%?$/.test(t) ||
    /^-?[\d.]+(,\d+)?\s?(d|x|un|kg|g|h)$/i.test(t);
  if (ehNumero) {
    data.cell.styles.halign = "right";
    data.cell.styles.font = "courier";
  }
}

// --- Densidade executiva das tabelas (DESIGN_STANDARDS.md §5, Fase 5) ---------
// Wrapper unico sobre autoTable: a densidade de TODOS os blocos de tabela do
// modulo vive aqui. Padrao corporativo "denso com respiro":
//   • corpo ~1pt menor (piso de 7pt p/ nao prejudicar leitura);
//   • espacamento vertical enxuto (0,7mm) + respiro horizontal (1,8mm);
//   • header grafite em negrito — hierarquia por PESO, nao por tamanho;
//   • zebra sutil + fio horizontal discreto entre linhas;
//   • numeros alinhados a direita em mono via pdfAlinhaNumeros (vem no opts).
const TABELA_LISTRA = [246, 247, 249]; // zebra clara, quase imperceptivel
const TABELA_FIO = [228, 230, 234];    // hairline horizontal entre as linhas

export function tabelaPDF(doc, opts = {}) {
  const fonteCorpo =
    typeof opts.styles?.fontSize === "number"
      ? Math.max(7, opts.styles.fontSize - 1)
      : undefined;

  return autoTable(doc, {
    margin: { left: 14, right: 14 },
    alternateRowStyles: { fillColor: TABELA_LISTRA },
    ...opts,
    styles: {
      ...(opts.styles || {}),
      ...(fonteCorpo != null ? { fontSize: fonteCorpo } : {}),
      cellPadding: { top: 0.7, right: 1.8, bottom: 0.7, left: 1.8 },
      lineColor: TABELA_FIO,
      lineWidth: { bottom: 0.1 },
    },
    headStyles: {
      ...(opts.headStyles || {}),
      cellPadding: { top: 1.3, right: 1.8, bottom: 1.3, left: 1.8 },
      lineWidth: 0,
    },
  });
}

// criarPDF e async — carrega a config da empresa do cache e desenha um header
// completo (logo + razao social + CNPJ + endereco + contato). Se a config nao
// foi carregada ainda, cai no header simples "GestãoProMax".
export async function criarPDF(titulo) {
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const empresa = await obterConfiguracaoCache();

  let yCursor = 16;

  // ---- Cabecalho da empresa: logo a ESQUERDA, dados a DIREITA ----
  // Layout executivo de duas colunas. O logo preserva a proporcao (via
  // dimensionarLogo) dentro de uma caixa generosa, em vez de forcar 22x22 —
  // que achatava logos retangulares. Os dados ficam alinhados a direita, na
  // margem oposta, deixando o logo respirar.
  const margemDir = 196;
  const topo = 11;
  let logoBottom = topo;
  if (empresa?.logotipo) {
    try {
      const urlLogo = urlLogotipo(empresa.logotipo);
      if (!urlLogo) throw new Error("logo sem url");
      const dataUrl = await carregarImagemDataUrl(urlLogo);
      const formato = detectarFormatoImagem(dataUrl);
      const { w, h } = dimensionarLogo(doc, dataUrl, 50, 24);
      doc.addImage(dataUrl, formato, 14, topo, w, h);
      logoBottom = topo + h;
    } catch {
      // logo falhou — segue sem
    }
  }

  let dadosBottom = topo;
  if (empresa) {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    let y = topo + 4;
    doc.text(empresa.nomeFantasia || empresa.razaoSocial, margemDir, y, { align: "right" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    if (empresa.razaoSocial && empresa.razaoSocial !== empresa.nomeFantasia) {
      y += 4.5; doc.text(empresa.razaoSocial, margemDir, y, { align: "right" });
    }
    const linhaContato = [
      empresa.cnpj && `CNPJ ${empresa.cnpj}`,
      empresa.telefone && `Tel ${empresa.telefone}`,
      empresa.email,
    ].filter(Boolean).join(" · ");
    if (linhaContato) { y += 4; doc.text(linhaContato, margemDir, y, { align: "right" }); }
    const endereco = formatarEndereco(empresa);
    if (endereco) { y += 4; doc.text(endereco, margemDir, y, { align: "right" }); }
    doc.setTextColor(0, 0, 0);
    dadosBottom = y;
  } else {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("GestãoProMax", 14, topo + 5);
    dadosBottom = topo + 5;
  }

  // Linha separadora abaixo da coluna mais alta (logo ou dados).
  yCursor = Math.max(logoBottom, dadosBottom, 30) + 6;
  doc.setDrawColor(200, 200, 200);
  doc.line(14, yCursor, margemDir, yCursor);
  yCursor += 6;

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(titulo, 14, yCursor);
  yCursor += 5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, yCursor);
  doc.setTextColor(0, 0, 0);
  doc.lastAutoTable = { finalY: yCursor + 2 };
  return doc;
}

async function carregarImagemDataUrl(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("imagem nao acessivel");
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function addPeriodo(doc, di, df) {
  if (!di && !df) return;
  const partes = [];
  if (di) partes.push(`de ${new Date(di + "T00:00:00").toLocaleDateString("pt-BR")}`);
  if (df) partes.push(`até ${new Date(df + "T00:00:00").toLocaleDateString("pt-BR")}`);
  addLinha(doc, "Período: " + partes.join(" "));
}

export function addLinha(doc, texto) {
  const y = (doc.lastAutoTable?.finalY || 30) + 4;
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(texto, 14, y);
  doc.setTextColor(0, 0, 0);
  doc.lastAutoTable = { finalY: y };
}
