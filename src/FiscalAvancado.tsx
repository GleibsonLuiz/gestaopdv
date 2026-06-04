// FiscalAvancado.tsx — NF-e 55 (produto/B2B) e NFS-e (serviços).
// Esqueleto vendável: os módulos são contratáveis por plano, mas a emissão real
// depende de certificado digital + homologação SEFAZ/prefeitura. Esta tela
// mostra o status "em configuração" honestamente — não emite documento ainda.

import { C } from "./lib/theme";
import { moduloNoPlano } from "./lib/permissoes";

interface DocInfo {
  id: "NFE55" | "NFSE";
  icone: string;
  titulo: string;
  desc: string;
  bullets: string[];
}

const DOCS: DocInfo[] = [
  {
    id: "NFE55",
    icone: "📄",
    titulo: "NF-e modelo 55 (produto / B2B)",
    desc: "Nota fiscal eletrônica de produto, para vendas a outras empresas (B2B) e operações que exigem NF-e completa.",
    bullets: [
      "Destinatário completo (CNPJ, IE, endereço)",
      "Tributação por CST/CSOSN (ICMS, IPI, PIS, COFINS)",
      "CFOP e natureza da operação",
      "Emissão e autorização via SEFAZ (gateway fiscal)",
    ],
  },
  {
    id: "NFSE",
    icone: "🧰",
    titulo: "NFS-e (serviços)",
    desc: "Nota fiscal de serviço eletrônica — ideal para quem presta serviços (combina com Ordem de Serviço).",
    bullets: [
      "Emissão junto à prefeitura do município",
      "Código de serviço (lista LC 116) e ISS",
      "Tomador do serviço",
      "Layout depende da cidade — configurado no provedor",
    ],
  },
];

export default function FiscalAvancado() {
  const docs = DOCS.filter(d => moduloNoPlano(d.id));

  return (
    <div>
      <div
        className="rounded-xl p-4 mb-3"
        style={{ background: C.accent + "14", border: `1px solid ${C.accent}40` }}
      >
        <div className="text-gp-white text-sm font-bold">🛠️ Documentos fiscais avançados — em configuração</div>
        <div className="text-gp-muted text-xs mt-1" style={{ lineHeight: 1.5 }}>
          Estes documentos estão <strong>inclusos no seu plano</strong>, mas a emissão precisa de
          configuração fiscal específica: <strong>certificado digital A1</strong>, dados do emitente e
          homologação junto à SEFAZ/prefeitura. Fale com o suporte para concluir a ativação.
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {docs.map(d => (
          <div key={d.id} className="bg-gp-card border border-gp-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span style={{ fontSize: 20 }}>{d.icone}</span>
              <span className="text-gp-white text-sm font-bold">{d.titulo}</span>
            </div>
            <div className="text-gp-muted text-xs mb-3" style={{ lineHeight: 1.5 }}>{d.desc}</div>
            <ul className="text-gp-text text-xs" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              {d.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
            {d.id === "NFSE" ? (
              <div
                className="mt-3 px-3 py-2 rounded-lg text-xs font-bold text-center"
                style={{ background: C.green + "22", border: `1px solid ${C.green}55`, color: C.green }}
              >
                ✅ Disponível — ative em Configurações &gt; Emissão Fiscal e emita pela Ordem de Serviço ou em Notas Fiscais
              </div>
            ) : (
              <div
                className="mt-3 px-3 py-2 rounded-lg text-xs font-bold text-center"
                style={{ background: "#f59e0b22", border: "1px solid #f59e0b55", color: "#f59e0b" }}
              >
                ⏳ Em configuração — emissão disponível em breve
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="text-gp-muted text-[11px] mt-3 px-1" style={{ opacity: 0.8 }}>
        A NFC-e (cupom ao consumidor) já está disponível na tela <strong>Notas Fiscais</strong>.
      </div>
    </div>
  );
}
