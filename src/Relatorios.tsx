// Casca do modulo Relatorios: abas + hub CRM. As 19 abas, a infra de PDF e
// os componentes compartilhados moram em src/relatorios/ (fatiamento Fase 5).
import { useState } from "react";
import { C } from "./lib/theme";
import HeaderRelatorio from "./HeaderRelatorio.jsx";
import {
  RelatorioVendas, RelatorioCompras, RelatorioFinanceiro, RelatorioEstoque,
  RelatorioProdutosFabricante, RelatorioCaixas, RelatorioLucratividade,
} from "./relatorios/abas/classicos";
import {
  RelatorioCurvaAbc, RelatorioGiroEstoque, RelatorioSazonalidade,
  RelatorioAgingReceber, RelatorioComissoesLista,
} from "./relatorios/abas/analiticos";
import {
  RelatorioFunilCrm, RelatorioPerformanceCrm, RelatorioCarteiraCrm,
  RelatorioNpsCrm, RelatorioAtividadesCrm, RelatorioForecastCrm,
  RelatorioPerdasCrm,
} from "./relatorios/abas/crm";


const ABAS = [
  { id: "vendas", label: "🛒 Vendas", cor: C.accent },
  { id: "compras", label: "🛍️ Compras", cor: C.yellow },
  { id: "financeiro", label: "💰 Financeiro", cor: C.green },
  { id: "estoque", label: "📦 Estoque", cor: C.purple },
  { id: "fabricantes", label: "🏭 Fabricantes", cor: C.accent },
  { id: "caixas", label: "💵 Caixas (DRE)", cor: C.red },
  { id: "lucratividade", label: "📈 Lucratividade", cor: C.green },
  { id: "curva-abc", label: "🔤 Curva ABC", cor: C.accent },
  { id: "giro", label: "🔄 Giro & Capital", cor: C.purple },
  { id: "sazonalidade", label: "🗓️ Sazonalidade", cor: C.yellow },
  { id: "aging", label: "⏳ Aging Receber", cor: C.red },
  { id: "comissoes", label: "🏆 Comissões", cor: C.purple },
  { id: "crm", label: "🎯 CRM", cor: C.purple },
];

export default function Relatorios() {
  const [aba, setAba] = useState("vendas");

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <HeaderRelatorio />
      </div>
      <div style={{
        display: "flex", gap: 4, padding: 4, marginBottom: 18,
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 10, width: "fit-content",
      }}>
        {ABAS.map(a => (
          <button key={a.id} onClick={() => setAba(a.id)} style={{
            padding: "10px 18px", borderRadius: 8, border: "none",
            background: aba === a.id ? a.cor + "22" : "transparent",
            color: aba === a.id ? a.cor : C.muted,
            fontWeight: aba === a.id ? 700 : 600, fontSize: 13, cursor: "pointer",
          }}>{a.label}</button>
        ))}
      </div>

      {aba === "vendas" && <RelatorioVendas key="v" />}
      {aba === "compras" && <RelatorioCompras key="c" />}
      {aba === "financeiro" && <RelatorioFinanceiro key="f" />}
      {aba === "estoque" && <RelatorioEstoque key="e" />}
      {aba === "fabricantes" && <RelatorioProdutosFabricante key="fb" />}
      {aba === "caixas" && <RelatorioCaixas key="x" />}
      {aba === "lucratividade" && <RelatorioLucratividade key="l" />}
      {aba === "curva-abc" && <RelatorioCurvaAbc key="abc" />}
      {aba === "giro" && <RelatorioGiroEstoque key="giro" />}
      {aba === "sazonalidade" && <RelatorioSazonalidade key="sz" />}
      {aba === "aging" && <RelatorioAgingReceber key="ag" />}
      {aba === "comissoes" && <RelatorioComissoesLista key="m" />}
      {aba === "crm" && <RelatoriosCrm key="r" />}
    </div>
  );
}

// ============ HUB CRM (SUB-ABAS) ============
function RelatoriosCrm() {
  const SUB_ABAS = [
    { id: "funil", label: "📊 Funil de Vendas", cor: C.purple },
    { id: "performance", label: "🏅 Performance Comercial", cor: C.accent },
    { id: "carteira", label: "👥 Carteira de Clientes (RFM)", cor: C.green },
    { id: "nps", label: "😊 NPS & Satisfação", cor: C.yellow },
    { id: "atividades", label: "📞 Atividades & Cadência", cor: C.purple },
    { id: "forecast", label: "🔮 Forecast", cor: C.accent },
    { id: "perdas", label: "💔 Motivos de Perda", cor: C.red },
  ];
  const [sub, setSub] = useState("funil");

  return (
    <div>
      <div style={{
        display: "flex", gap: 4, padding: 4, marginBottom: 18,
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 10, width: "fit-content", flexWrap: "wrap",
      }}>
        {SUB_ABAS.map(a => (
          <button key={a.id} onClick={() => setSub(a.id)} style={{
            padding: "8px 14px", borderRadius: 8, border: "none",
            background: sub === a.id ? a.cor + "22" : "transparent",
            color: sub === a.id ? a.cor : C.muted,
            fontWeight: sub === a.id ? 700 : 600, fontSize: 12, cursor: "pointer",
          }}>{a.label}</button>
        ))}
      </div>

      {sub === "funil" && <RelatorioFunilCrm key="cf" />}
      {sub === "performance" && <RelatorioPerformanceCrm key="cp" />}
      {sub === "carteira" && <RelatorioCarteiraCrm key="cc" />}
      {sub === "nps" && <RelatorioNpsCrm key="cn" />}
      {sub === "atividades" && <RelatorioAtividadesCrm key="ca" />}
      {sub === "forecast" && <RelatorioForecastCrm key="cfx" />}
      {sub === "perdas" && <RelatorioPerdasCrm key="cpr" />}
    </div>
  );
}
