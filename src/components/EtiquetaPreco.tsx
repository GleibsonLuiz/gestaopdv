import Barcode from "react-barcode";

const fmtBRL = (v: unknown): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

interface EtiquetaPrecoProps {
  nomeProduto?: string | null;
  precoVenda?: number | string | null;
  codigoBarras?: string | null;
  referencia?: string | null;
  codigo?: string | null;
}

// Etiqueta de preco 60mm x 40mm.
// Conteudo:
//   Linha 1: codigo do produto + referencia (lado a lado)
//   Linha 2: nome do produto
//   Linha 3: preco em destaque
//   Linha 4: codigo de barras (com o numero abaixo pelo proprio react-barcode)
export default function EtiquetaPreco({
  nomeProduto,
  precoVenda,
  codigoBarras,
  referencia,
  codigo,
}: EtiquetaPrecoProps) {
  const cb = String(codigoBarras || "").trim();
  const ref = String(referencia || "").trim();
  const cod = String(codigo || "").trim();
  return (
    <div
      className="etiqueta-preco flex flex-col justify-between overflow-hidden box-border"
      style={{
        width: "60mm",
        height: "40mm",
        padding: "2mm 3mm",
        background: "#ffffff",
        color: "#000000",
        border: "1px dashed #999",
        borderRadius: 2,
        fontFamily: "'Segoe UI', Arial, sans-serif",
      }}
    >
      {(cod || ref) && (
        <div
          className="flex justify-between items-center gap-1"
          style={{
            fontSize: "6.5pt",
            fontWeight: 700,
            color: "#222",
            minHeight: "3mm",
          }}
        >
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {cod ? `COD: ${cod}` : ""}
          </span>
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {ref ? `REF: ${ref}` : ""}
          </span>
        </div>
      )}

      <div
        className="text-center uppercase overflow-hidden"
        style={{
          fontSize: "8pt",
          fontWeight: 600,
          lineHeight: 1.1,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {nomeProduto || "—"}
      </div>

      <div
        className="text-center"
        style={{
          fontSize: "18pt",
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: "-0.5px",
        }}
      >
        {fmtBRL(precoVenda)}
      </div>

      <div className="flex flex-col items-center justify-center">
        {cb ? (
          <Barcode
            value={cb}
            format="CODE128"
            width={1.1}
            height={22}
            displayValue
            fontSize={8}
            margin={0}
            background="#ffffff"
            lineColor="#000000"
          />
        ) : (
          <div style={{ fontSize: "7pt", color: "#666" }}>SEM CÓDIGO</div>
        )}
      </div>
    </div>
  );
}
