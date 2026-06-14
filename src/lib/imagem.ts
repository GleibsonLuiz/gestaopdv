// =====================================================================
// Normalizacao de imagem de comprovante antes do upload (OCR de despesa).
//
// Por que isto existe: foto de celular moderno chega como HEIC (iPhone) e/ou
// com varios MB — o backend rejeita (>5 MB) e a Anthropic nao le HEIC de jeito
// nenhum. Aqui convertemos QUALQUER imagem que o browser consiga decodificar
// para um JPEG redimensionado e leve, resolvendo "rejeita a foto do celular"
// de uma vez (HEIC + tamanho).
//
// Best-effort e NUNCA trava o fluxo: se nao for imagem (ex.: PDF) ou se o
// browser nao decodificar o arquivo (HEIC fora do Safari), devolve o arquivo
// original — a rede de seguranca do backend e a mensagem de erro cuidam do
// resto. O lancamento manual da despesa segue funcionando em qualquer caso.
// =====================================================================

// Maior dimensao (px) do JPEG gerado. 2000px preserva texto de cupom legivel
// pela IA sem mandar megapixels desnecessarios.
const MAX_DIMENSAO = 2000;
// Alvo de tamanho do arquivo final. Folga confortavel abaixo dos 5 MB do
// backend; se passar, reduzimos a qualidade ate caber.
const ALVO_BYTES = 4 * 1024 * 1024;

function ehImagem(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name);
}

// Decodifica o arquivo para um bitmap. createImageBitmap cobre o caso comum e,
// no Safari/iOS, tambem decodifica HEIC nativamente. Cai para <img> + ObjectURL
// quando createImageBitmap nao esta disponivel.
async function decodificar(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode falhou"));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dimensoes(src: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  const w = "naturalWidth" in src ? src.naturalWidth : src.width;
  const h = "naturalHeight" in src ? src.naturalHeight : src.height;
  return { w, h };
}

function canvasParaBlob(canvas: HTMLCanvasElement, qualidade: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", qualidade));
}

/**
 * Prepara um arquivo para envio do OCR. Para imagens, converte para JPEG
 * redimensionado e abaixo do limite de tamanho; para o resto (PDF) ou em caso
 * de falha de decode, devolve o arquivo original. Nunca lanca.
 */
export async function prepararImagemUpload(file: File): Promise<File> {
  if (!ehImagem(file)) return file;
  try {
    const src = await decodificar(file);
    const { w, h } = dimensoes(src);
    if (!w || !h) return file;

    const escala = Math.min(1, MAX_DIMENSAO / Math.max(w, h));
    const largura = Math.max(1, Math.round(w * escala));
    const altura = Math.max(1, Math.round(h * escala));

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(src as CanvasImageSource, 0, 0, largura, altura);
    if ("close" in src && typeof src.close === "function") src.close();

    // Reduz a qualidade progressivamente ate caber no alvo de tamanho.
    let blob: Blob | null = null;
    for (const q of [0.85, 0.7, 0.55, 0.4]) {
      blob = await canvasParaBlob(canvas, q);
      if (!blob) break;
      if (blob.size <= ALVO_BYTES) break;
    }
    if (!blob) return file;

    // So vale a pena trocar se o resultado nao for um arquivo que ja era JPEG
    // pequeno (evita reprocessar a toa). Mantemos sempre que reduziu/converteu.
    const nome = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nome, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    // HEIC fora do Safari, formato exotico, OOM em foto gigante: segue com o
    // arquivo original — best-effort, sem travar o lancamento.
    return file;
  }
}
