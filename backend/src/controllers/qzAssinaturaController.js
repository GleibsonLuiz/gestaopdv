import crypto from "crypto";

// Assinatura de pedidos do QZ Tray para impressao termica silenciosa.
//
// O frontend (lib/qztray.ts) apresenta o certificado PUBLICO ao QZ e, a cada
// pedido de impressao, manda a string a assinar aqui. Assinamos com a chave
// PRIVADA (que vive so no backend) e devolvemos a assinatura base64. O QZ
// valida contra o certificado e reconhece o site como confiavel.
//
// A chave privada vem da env QZ_PRIVATE_KEY_B64 (PEM em base64, single-line —
// facil de colar no painel da Vercel) ou QZ_PRIVATE_KEY (PEM cru, multiline).
// Sem a env, devolvemos 503 e o frontend cai no modo comunidade (aviso por
// sessao) — nada quebra.

function lerChavePrivada() {
  const b64 = process.env.QZ_PRIVATE_KEY_B64;
  if (b64 && b64.trim()) {
    try {
      return Buffer.from(b64.trim(), "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  const pem = process.env.QZ_PRIVATE_KEY;
  return pem && pem.trim() ? pem : null;
}

export function assinar(req, res) {
  const chave = lerChavePrivada();
  if (!chave) {
    return res.status(503).json({
      erro: "Assinatura QZ nao configurada. Defina QZ_PRIVATE_KEY_B64 no backend.",
    });
  }
  const toSign = req.body?.request;
  if (typeof toSign !== "string") {
    return res.status(400).json({ erro: "Campo 'request' (string) e obrigatorio." });
  }
  try {
    const signature = crypto.createSign("RSA-SHA512").update(toSign, "utf8").sign(chave, "base64");
    return res.json({ signature });
  } catch (err) {
    return res.status(500).json({ erro: "Falha ao assinar: " + err.message });
  }
}
