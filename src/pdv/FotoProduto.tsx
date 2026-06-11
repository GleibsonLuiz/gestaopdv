import { C } from "../lib/theme";
import { BASE_URL } from "../lib/api";

// Miniatura do produto (foto ou placeholder). Usada na busca/cestinha do
// NovaVenda e nos cards de "Mais vendidos" do AcessoRapido.

function urlImagem(imagem: string | null | undefined): string | null {
  if (!imagem) return null;
  if (/^https?:\/\//i.test(imagem)) return imagem;
  return `${BASE_URL}${imagem}`;
}

interface FotoProdutoProps {
  url?: string | null;
  nome?: string | null;
  tamanho?: number;
  servico?: boolean;
}

export default function FotoProduto({ url, nome, tamanho = 56, servico = false }: FotoProdutoProps) {
  const src = urlImagem(url);
  const estilo: React.CSSProperties = {
    width: tamanho, height: tamanho, borderRadius: 10, flexShrink: 0,
    objectFit: "cover",
    border: `1px solid ${servico ? C.purple + "55" : C.border}`,
    background: servico ? C.purple + "22" : C.surface,
  };
  if (src) return <img src={src} alt={nome || ""} loading="lazy" style={estilo} />;
  return (
    <div style={{
      ...estilo, display: "flex", alignItems: "center", justifyContent: "center",
      color: servico ? C.purple : C.muted, fontSize: tamanho * 0.42,
    }}>{servico ? "🛠" : "📦"}</div>
  );
}
