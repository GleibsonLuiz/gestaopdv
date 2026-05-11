import Barcode from "react-barcode";

const fmtBRL = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

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
}) {
  const cb = String(codigoBarras || "").trim();
  const ref = String(referencia || "").trim();
  const cod = String(codigo || "").trim();
  return (
    <div className="etiqueta-preco" style={{
      width: "60mm",
      height: "40mm",
      padding: "2mm 3mm",
      background: "#ffffff",
      color: "#000000",
      border: "1px dashed #999",
      borderRadius: 2,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      overflow: "hidden",
      boxSizing: "border-box",
    }}>
      {(cod || ref) && (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "6.5pt",
          fontWeight: 700,
          color: "#222",
          gap: 4,
          minHeight: "3mm",
        }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {cod ? `COD: ${cod}` : ""}
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ref ? `REF: ${ref}` : ""}
          </span>
        </div>
      )}

      <div style={{
        fontSize: "8pt",
        fontWeight: 600,
        lineHeight: 1.1,
        textAlign: "center",
        textTransform: "uppercase",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}>
        {nomeProduto || "—"}
      </div>

      <div style={{
        fontSize: "18pt",
        fontWeight: 900,
        textAlign: "center",
        lineHeight: 1,
        letterSpacing: "-0.5px",
      }}>
        {fmtBRL(precoVenda)}
      </div>

      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}>
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
