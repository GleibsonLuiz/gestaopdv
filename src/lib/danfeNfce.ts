import { createElement } from "react";
import QRCode from "qrcode";
import { api } from "./api";
import { imprimirDocumento, obterConfigImpressora } from "./impressora";
import CupomEnvelope from "../components/cupons/CupomEnvelope";
import CupomDanfeNfce from "../components/cupons/CupomDanfeNfce";
import type { NotaFiscalDanfe, PagamentoDanfe } from "../components/cupons/CupomDanfeNfce";
import type { ConfiguracaoEmpresa } from "../Configuracoes";

// Imprime o DANFE NFC-e de uma nota ja emitida. Busca o detalhe completo
// (com itens), gera a imagem do QR Code ANTES de montar o documento — assim
// a <img> ja esta pronta quando imprimirDocumento() dispara o print (que so
// espera o onload das imagens ja presentes no DOM).
//
// O conteudo do QR Code e a URL devolvida pelo gateway (nota.qrCode); o
// gateway ja calculou o hash com o CSC. Nivel de correcao M (manual DANFE).
export async function imprimirDanfeNfce(
  notaId: string,
  opts?: { pagamentos?: PagamentoDanfe[] | null; troco?: number | string },
): Promise<void> {
  const nota = (await api.obterNotaFiscal(notaId)) as NotaFiscalDanfe & { qrCode?: string | null };

  let qrCodeDataUrl: string | null = null;
  if (nota.qrCode) {
    try {
      qrCodeDataUrl = await QRCode.toDataURL(String(nota.qrCode), {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 240,
      });
    } catch {
      qrCodeDataUrl = null; // sem QR ainda assim imprime o restante do DANFE
    }
  }

  const [empresa, cfg] = await Promise.all([
    api.obterConfiguracao().catch(() => null) as Promise<ConfiguracaoEmpresa | null>,
    obterConfigImpressora().catch(() => null),
  ]);

  await imprimirDocumento(
    createElement(
      CupomEnvelope,
      { cfg },
      createElement(CupomDanfeNfce, {
        nota,
        empresa,
        cfg,
        qrCodeDataUrl,
        pagamentos: opts?.pagamentos ?? null,
        troco: opts?.troco ?? 0,
      }),
    ),
  );
}
