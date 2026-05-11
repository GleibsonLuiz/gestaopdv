import Barcode from "react-barcode";

const fmtBRL = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

// Etiqueta de preco 60mm x 40mm. Recebe os 3 dados minimos via props.
// Usada tanto na previa em tela (escala manipulada por CSS) quanto
// impressa via window.print() — o tamanho fisico em mm e o que garante
// que cabe nas folhas de etiqueta adesiva padrao papelaria.
export default function EtiquetaPreco({ nomeProduto, precoVenda, codigoBarras }) {
  const cb = String(codigoBarras || "").trim();
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
        fontSize: "20pt",
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
            width={1.2}
            height={28}
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
