// Preenche codigoBarras (EAN-13 valido) para produtos do tenant
// "SUPERMERCADO ECONOMIA" que ainda nao tem codigo de barras cadastrado.
//
// Uso: node scripts/gerar-codigos-barras-economia.mjs

import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();
const TENANT_ID = "a1e31227-e1cd-4fc1-aa18-d11ddef5e3de";

// Calcula o digito verificador EAN-13 a partir dos 12 primeiros digitos.
function checkDigitEAN13(digits12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(digits12[i]);
    sum += i % 2 === 0 ? n : n * 3;
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

function gerarEAN13(base12) {
  return base12 + checkDigitEAN13(base12);
}

const main = async () => {
  const produtos = await prisma.produto.findMany({
    where: { tenantId: TENANT_ID, OR: [{ codigoBarras: null }, { codigoBarras: "" }] },
    orderBy: { codigo: "asc" },
  });

  console.log(`Produtos sem codigo de barras: ${produtos.length}`);

  // Prefixo fake "789660" (faixa GS1 Brasil) + sequencial de 6 digitos.
  let seq = 100001;
  for (const p of produtos) {
    const base12 = `789660${String(seq).padStart(6, "0")}`;
    const ean = gerarEAN13(base12);
    seq++;
    await prisma.produto.update({
      where: { id: p.id },
      data: { codigoBarras: ean },
    });
    console.log(`  ${p.codigo} ${p.nome} -> ${ean}`);
  }

  console.log("OK");
};

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
