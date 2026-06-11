// @ts-nocheck — relatorios denso (3374 linhas) com integracao jsPDF + autoTable;
// migracao gradual de tipos sera feita por modulo. Por enquanto, comportamento
// preservado do JSX original.
import { useCallback, useEffect, useState } from "react";
import { C } from "./lib/theme";
import { api, BASE_URL } from "./lib/api";
import HeaderRelatorio from "./HeaderRelatorio.jsx";
// Fase 5 (fatiamento): infra de PDF, formatadores e componentes de UI
// compartilhados pelas abas agora moram em src/relatorios/.
import {
  fmtBRL, fmtNum, fmtData, fmtDataHora, fmtPct,
  ROTULO_PAGAMENTO, ROTULO_STATUS, hoje,
} from "./relatorios/comum";
import {
  COR_HEADER_PDF, pdfAlinhaNumeros, tabelaPDF, criarPDF, addPeriodo, addLinha,
} from "./relatorios/pdf";
import {
  BlocoRelatorio, Resumo, Tabela, CampoData, CampoSelect, CampoSelectBusca,
  CardPodio, labelStyle, inputStyle,
} from "./relatorios/ui";


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

const ORIGENS_FUNIL = [
  "INDICACAO", "INSTAGRAM", "FACEBOOK", "GOOGLE",
  "WHATSAPP", "WALK_IN", "SITE", "TELEFONE", "OUTROS",
];

const ROTULO_ETAPA = {
  LEAD: "Lead",
  QUALIFICADO: "Qualificado",
  PROPOSTA: "Proposta",
  NEGOCIACAO: "Negociação",
  GANHO: "Ganho",
  PERDIDO: "Perdido",
};

const COR_ETAPA = {
  LEAD: C.muted,
  QUALIFICADO: C.accent,
  PROPOSTA: C.purple,
  NEGOCIACAO: C.yellow,
  GANHO: C.green,
  PERDIDO: C.red,
};

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

// ============ RELATÓRIO DE VENDAS ============
function RelatorioVendas() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [userId, setUserId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarFuncionarios({ ativo: "true" }).then(setUsuarios).catch(() => {});
    api.listarClientes({ ativo: "true" }).then(setClientes).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioVendas({ dataInicio, dataFim, formaPagamento, userId, clienteId });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, formaPagamento, userId, clienteId]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Relatório de Vendas");
    addPeriodo(doc, dataInicio, dataFim);

    let y = doc.lastAutoTable?.finalY || 50;
    tabelaPDF(doc, {
      startY: y,
      head: [["Indicador", "Valor"]],
      body: [
        ["Total de vendas", fmtNum(dados.resumo.totalVendas)],
        ["Faturamento", fmtBRL(dados.resumo.faturamento)],
        ["Ticket médio", fmtBRL(dados.resumo.ticketMedio)],
        ["Descontos concedidos", fmtBRL(dados.resumo.descontoTotal)],
      ],
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    if (dados.formasPagamento.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Forma de pagamento", "Vendas", "Total"]],
        body: dados.formasPagamento.map(f => [
          ROTULO_PAGAMENTO[f.formaPagamento] || f.formaPagamento,
          fmtNum(f.quantidade),
          fmtBRL(f.total),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 10 },
      });
    }

    if (dados.topProdutos.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Produto", "Código", "Qtd.", "Total"]],
        body: dados.topProdutos.map((t, i) => [
          i + 1,
          t.produto?.nome || "—",
          t.produto?.codigo || "—",
          `${fmtNum(t.quantidade)} ${t.produto?.unidade || ""}`,
          fmtBRL(t.total),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.vendas.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Data", "Cliente", "Vendedor", "Pgto", "Itens", "Total"]],
        body: dados.vendas.map(v => [
          v.numero,
          fmtDataHora(v.createdAt),
          v.cliente || "Avulso",
          v.vendedor || "—",
          ROTULO_PAGAMENTO[v.formaPagamento] || v.formaPagamento,
          v.qtdItens,
          fmtBRL(v.total),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 8 },
      });
    }

    doc.save(`relatorio-vendas-${hoje()}.pdf`);
  }

  return (
    <BlocoRelatorio
      titulo="Relatório de Vendas" cor={C.accent}
      filtros={
        <>
          <CampoData label="De" value={dataInicio} onChange={setDataInicio} />
          <CampoData label="Até" value={dataFim} onChange={setDataFim} />
          <CampoSelect label="Forma de pagamento" value={formaPagamento} onChange={setFormaPagamento}>
            <option value="">Todas</option>
            {Object.entries(ROTULO_PAGAMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </CampoSelect>
          <CampoSelectBusca label="Cliente" opcoes={clientes} value={clienteId} onChange={setClienteId} placeholder="Todos" />
          <CampoSelectBusca label="Vendedor" opcoes={usuarios} value={userId} onChange={setUserId} placeholder="Todos" />
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Vendas", valor: fmtNum(dados.resumo.totalVendas), cor: C.accent },
            { rotulo: "Faturamento", valor: fmtBRL(dados.resumo.faturamento), cor: C.green },
            { rotulo: "Ticket médio", valor: fmtBRL(dados.resumo.ticketMedio), cor: C.purple },
            { rotulo: "Descontos", valor: fmtBRL(dados.resumo.descontoTotal), cor: C.yellow },
          ]} />

          {dados.formasPagamento.length > 0 && (
            <Tabela
              titulo="Formas de pagamento"
              colunas={["Forma", "Vendas", "Total"]}
              alinhamentos={["left", "right", "right"]}
              linhas={dados.formasPagamento.map(f => [
                ROTULO_PAGAMENTO[f.formaPagamento] || f.formaPagamento,
                fmtNum(f.quantidade),
                fmtBRL(f.total),
              ])}
            />
          )}

          {dados.topProdutos.length > 0 && (
            <Tabela
              titulo="Top produtos"
              colunas={["#", "Produto", "Código", "Qtd", "Total"]}
              alinhamentos={["center", "left", "left", "right", "right"]}
              linhas={dados.topProdutos.map((t, i) => [
                i + 1,
                t.produto?.nome || "—",
                t.produto?.codigo || "—",
                `${fmtNum(t.quantidade)} ${t.produto?.unidade || ""}`,
                fmtBRL(t.total),
              ])}
            />
          )}

          <Tabela
            titulo={`Detalhamento (${dados.vendas.length} venda${dados.vendas.length === 1 ? "" : "s"})`}
            colunas={["#", "Data", "Cliente", "Vendedor", "Pgto", "Itens", "Total"]}
            alinhamentos={["center", "left", "left", "left", "left", "right", "right"]}
            linhas={dados.vendas.map(v => [
              `#${v.numero}`,
              fmtDataHora(v.createdAt),
              v.cliente || "Avulso",
              v.vendedor || "—",
              ROTULO_PAGAMENTO[v.formaPagamento] || v.formaPagamento,
              v.qtdItens,
              fmtBRL(v.total),
            ])}
            vazioTexto="Nenhuma venda no período."
          />
        </>
      )}
    </BlocoRelatorio>
  );
}

// ============ RELATÓRIO DE COMPRAS ============
function RelatorioCompras() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [fornecedores, setFornecedores] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarFornecedores({ ativo: "true" }).then(setFornecedores).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioCompras({ dataInicio, dataFim, fornecedorId });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, fornecedorId]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Relatório de Compras");
    addPeriodo(doc, dataInicio, dataFim);

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Indicador", "Valor"]],
      body: [
        ["Total de compras", fmtNum(dados.resumo.totalCompras)],
        ["Valor total", fmtBRL(dados.resumo.valorTotal)],
        ["Ticket médio", fmtBRL(dados.resumo.ticketMedio)],
      ],
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    if (dados.topFornecedores.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Fornecedor", "Compras", "Total"]],
        body: dados.topFornecedores.map((t, i) => [
          i + 1,
          t.fornecedor?.nome || "—",
          fmtNum(t.quantidade),
          fmtBRL(t.total),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.compras.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Data", "Fornecedor", "Itens", "Total"]],
        body: dados.compras.map(c => [
          c.numero,
          fmtDataHora(c.createdAt),
          c.fornecedor || "—",
          c.qtdItens,
          fmtBRL(c.total),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    doc.save(`relatorio-compras-${hoje()}.pdf`);
  }

  return (
    <BlocoRelatorio
      titulo="Relatório de Compras" cor={C.yellow}
      filtros={
        <>
          <CampoData label="De" value={dataInicio} onChange={setDataInicio} />
          <CampoData label="Até" value={dataFim} onChange={setDataFim} />
          <CampoSelectBusca label="Fornecedor" opcoes={fornecedores} value={fornecedorId} onChange={setFornecedorId} subLabelFn={f => f.cnpj} placeholder="Todos" />
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Compras", valor: fmtNum(dados.resumo.totalCompras), cor: C.yellow },
            { rotulo: "Valor total", valor: fmtBRL(dados.resumo.valorTotal), cor: C.red },
            { rotulo: "Ticket médio", valor: fmtBRL(dados.resumo.ticketMedio), cor: C.purple },
          ]} />

          {dados.topFornecedores.length > 0 && (
            <Tabela
              titulo="Top fornecedores"
              colunas={["#", "Fornecedor", "Compras", "Total"]}
              alinhamentos={["center", "left", "right", "right"]}
              linhas={dados.topFornecedores.map((t, i) => [
                i + 1, t.fornecedor?.nome || "—", fmtNum(t.quantidade), fmtBRL(t.total),
              ])}
            />
          )}

          <Tabela
            titulo={`Detalhamento (${dados.compras.length} compra${dados.compras.length === 1 ? "" : "s"})`}
            colunas={["#", "Data", "Fornecedor", "Itens", "Total"]}
            alinhamentos={["center", "left", "left", "right", "right"]}
            linhas={dados.compras.map(c => [
              `#${c.numero}`, fmtDataHora(c.createdAt), c.fornecedor || "—", c.qtdItens, fmtBRL(c.total),
            ])}
            vazioTexto="Nenhuma compra no período."
          />
        </>
      )}
    </BlocoRelatorio>
  );
}

// ============ RELATÓRIO FINANCEIRO ============
function RelatorioFinanceiro() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [tipo, setTipo] = useState("");
  const [status, setStatus] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [clientes, setClientes] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarClientes({ ativo: "true" }).then(setClientes).catch(() => {});
    api.listarFornecedores({ ativo: "true" }).then(setFornecedores).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioFinanceiro({ dataInicio, dataFim, tipo, status, clienteId, fornecedorId });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, tipo, status, clienteId, fornecedorId]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Relatório Financeiro");
    addPeriodo(doc, dataInicio, dataFim);
    if (status) addLinha(doc, `Situação (detalhamento): ${ROTULO_STATUS[status]}`);

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Status", "Contas a pagar — Qtd", "Total", "Contas a receber — Qtd", "Total"]],
      body: ["PENDENTE", "ATRASADA", "PAGA", "CANCELADA"].map(s => [
        ROTULO_STATUS[s],
        fmtNum(dados.resumo.pagar[s].qtd),
        fmtBRL(dados.resumo.pagar[s].total),
        fmtNum(dados.resumo.receber[s].qtd),
        fmtBRL(dados.resumo.receber[s].total),
      ]),
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 9 },
    });

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Indicador", "Valor"]],
      body: [
        ["Saldo previsto (a receber - a pagar pendentes)", fmtBRL(dados.resumo.saldoPrevisto)],
        ["Fluxo de caixa realizado (recebido - pago)", fmtBRL(dados.resumo.fluxoCaixaRealizado)],
      ],
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    if (dados.contasPagar.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Contas a pagar", "", "", "", ""]],
        body: [],
        styles: { fontSize: 11, fontStyle: "bold" },
        theme: "plain",
      });
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY,
        head: [["Descrição", "Fornecedor", "Vencimento", "Status", "Valor"]],
        body: dados.contasPagar.map(c => [
          c.descricao, c.fornecedor || "—",
          fmtData(c.vencimento), ROTULO_STATUS[c.status], fmtBRL(c.valor),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.contasReceber.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Contas a receber", "", "", "", ""]],
        body: [],
        styles: { fontSize: 11, fontStyle: "bold" },
        theme: "plain",
      });
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY,
        head: [["Descrição", "Cliente", "Vencimento", "Status", "Valor"]],
        body: dados.contasReceber.map(c => [
          c.descricao, c.cliente || "—",
          fmtData(c.vencimento), ROTULO_STATUS[c.status], fmtBRL(c.valor),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    doc.save(`relatorio-financeiro-${hoje()}.pdf`);
  }

  return (
    <BlocoRelatorio
      titulo="Relatório Financeiro" cor={C.green}
      filtros={
        <>
          <CampoData label="Vencimento de" value={dataInicio} onChange={setDataInicio} />
          <CampoData label="Vencimento até" value={dataFim} onChange={setDataFim} />
          <CampoSelect label="Tipo" value={tipo} onChange={(v) => {
            setTipo(v);
            if (v !== "receber") setClienteId("");
            if (v !== "pagar") setFornecedorId("");
          }}>
            <option value="">Ambos</option>
            <option value="pagar">Apenas a pagar</option>
            <option value="receber">Apenas a receber</option>
          </CampoSelect>
          <CampoSelect label="Situação" value={status} onChange={setStatus}>
            <option value="">Todas</option>
            <option value="PENDENTE">Pendentes</option>
            <option value="PAGA">Pagas / Recebidas</option>
            <option value="ATRASADA">Atrasadas</option>
            <option value="CANCELADA">Canceladas</option>
          </CampoSelect>
          {tipo === "receber" && (
            <CampoSelectBusca label="Cliente" opcoes={clientes} value={clienteId} onChange={setClienteId} placeholder="Todos" minWidth={280} />
          )}
          {tipo === "pagar" && (
            <CampoSelectBusca label="Fornecedor" opcoes={fornecedores} value={fornecedorId} onChange={setFornecedorId} subLabelFn={f => f.cnpj} placeholder="Todos" minWidth={280} />
          )}
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Saldo previsto", valor: fmtBRL(dados.resumo.saldoPrevisto), cor: dados.resumo.saldoPrevisto >= 0 ? C.green : C.red },
            { rotulo: "Fluxo realizado", valor: fmtBRL(dados.resumo.fluxoCaixaRealizado), cor: dados.resumo.fluxoCaixaRealizado >= 0 ? C.green : C.red },
            { rotulo: "A pagar pendente", valor: fmtBRL(dados.resumo.pagar.PENDENTE.total + dados.resumo.pagar.ATRASADA.total), cor: C.yellow },
            { rotulo: "A receber pendente", valor: fmtBRL(dados.resumo.receber.PENDENTE.total + dados.resumo.receber.ATRASADA.total), cor: C.accent },
          ]} />

          <Tabela
            titulo="Resumo por status"
            colunas={["Status", "A pagar Qtd", "A pagar Total", "A receber Qtd", "A receber Total"]}
            alinhamentos={["left", "right", "right", "right", "right"]}
            linhas={["PENDENTE", "ATRASADA", "PAGA", "CANCELADA"].map(s => [
              ROTULO_STATUS[s],
              fmtNum(dados.resumo.pagar[s].qtd),
              fmtBRL(dados.resumo.pagar[s].total),
              fmtNum(dados.resumo.receber[s].qtd),
              fmtBRL(dados.resumo.receber[s].total),
            ])}
          />

          {dados.contasPagar.length > 0 && (
            <Tabela
              titulo={`Contas a pagar (${dados.contasPagar.length})${status ? ` — ${ROTULO_STATUS[status]}s` : ""}`}
              colunas={["Descrição", "Fornecedor", "Vencimento", "Status", "Valor"]}
              alinhamentos={["left", "left", "left", "center", "right"]}
              linhas={dados.contasPagar.map(c => [
                c.descricao, c.fornecedor || "—",
                fmtData(c.vencimento), ROTULO_STATUS[c.status], fmtBRL(c.valor),
              ])}
            />
          )}

          {dados.contasReceber.length > 0 && (
            <Tabela
              titulo={`Contas a receber (${dados.contasReceber.length})${status ? ` — ${ROTULO_STATUS[status]}s` : ""}`}
              colunas={["Descrição", "Cliente", "Vencimento", "Status", "Valor"]}
              alinhamentos={["left", "left", "left", "center", "right"]}
              linhas={dados.contasReceber.map(c => [
                c.descricao, c.cliente || "—",
                fmtData(c.vencimento), ROTULO_STATUS[c.status], fmtBRL(c.valor),
              ])}
            />
          )}
        </>
      )}
    </BlocoRelatorio>
  );
}

// ============ RELATÓRIO DE ESTOQUE ============
function RelatorioEstoque() {
  const [categoriaId, setCategoriaId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [situacao, setSituacao] = useState("");
  const [categorias, setCategorias] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarCategorias().then(setCategorias).catch(() => {});
    api.listarFornecedores({ ativo: "true" }).then(setFornecedores).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioEstoque({ categoriaId, fornecedorId, situacao });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [categoriaId, fornecedorId, situacao]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Relatório de Estoque");
    addLinha(doc, `Gerado em ${fmtDataHora(dados.geradoEm)}`);

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Indicador", "Valor"]],
      body: [
        ["Total de produtos", fmtNum(dados.resumo.totalProdutos)],
        ["Unidades em estoque", fmtNum(dados.resumo.unidadesEmEstoque)],
        ["Produtos com estoque baixo", fmtNum(dados.resumo.qtdEstoqueBaixo)],
        ["Produtos zerados", fmtNum(dados.resumo.qtdZerado)],
        ["Valor em estoque (custo)", fmtBRL(dados.resumo.valorEstoqueCusto)],
        ["Valor em estoque (venda)", fmtBRL(dados.resumo.valorEstoqueVenda)],
        ["Margem estimada", fmtBRL(dados.resumo.margemEstimada)],
      ],
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Código", "Produto", "Categoria", "Estoque", "Mín.", "Custo", "Venda", "Total venda"]],
      body: dados.produtos.map(p => [
        p.codigo, p.nome, p.categoria || "—",
        `${p.estoque} ${p.unidade}`, p.estoqueMinimo,
        p.precoCusto != null ? fmtBRL(p.precoCusto) : "—",
        fmtBRL(p.precoVenda),
        fmtBRL(p.valorEmEstoqueVenda),
      ]),
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 8 },
    });

    doc.save(`relatorio-estoque-${hoje()}.pdf`);
  }

  return (
    <BlocoRelatorio
      titulo="Relatório de Estoque" cor={C.purple}
      filtros={
        <>
          <CampoSelectBusca label="Categoria" opcoes={categorias} value={categoriaId} onChange={setCategoriaId} placeholder="Todas" />
          <CampoSelectBusca label="Fornecedor" opcoes={fornecedores} value={fornecedorId} onChange={setFornecedorId} subLabelFn={f => f.cnpj} placeholder="Todos" />
          <CampoSelect label="Situação" value={situacao} onChange={setSituacao}>
            <option value="">Todos</option>
            <option value="ok">Estoque OK</option>
            <option value="baixo">Estoque baixo</option>
            <option value="zerado">Zerado</option>
          </CampoSelect>
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Produtos", valor: fmtNum(dados.resumo.totalProdutos), cor: C.purple },
            { rotulo: "Estoque baixo", valor: fmtNum(dados.resumo.qtdEstoqueBaixo), cor: dados.resumo.qtdEstoqueBaixo > 0 ? C.yellow : C.muted },
            { rotulo: "Valor (custo)", valor: fmtBRL(dados.resumo.valorEstoqueCusto), cor: C.accent },
            { rotulo: "Valor (venda)", valor: fmtBRL(dados.resumo.valorEstoqueVenda), cor: C.green },
            { rotulo: "Margem est.", valor: fmtBRL(dados.resumo.margemEstimada), cor: C.purple },
          ]} />

          <Tabela
            titulo={`Produtos (${dados.produtos.length})`}
            colunas={["Código", "Produto", "Categoria", "Estoque", "Mín.", "Custo", "Venda", "Total venda"]}
            alinhamentos={["left", "left", "left", "right", "right", "right", "right", "right"]}
            linhas={dados.produtos.map(p => [
              p.codigo, p.nome, p.categoria || "—",
              `${p.estoque} ${p.unidade}`, p.estoqueMinimo,
              p.precoCusto != null ? fmtBRL(p.precoCusto) : "—",
              fmtBRL(p.precoVenda),
              fmtBRL(p.valorEmEstoqueVenda),
            ])}
            vazioTexto="Nenhum produto encontrado com os filtros."
          />
        </>
      )}
    </BlocoRelatorio>
  );
}

// ============ RELATÓRIO DE PRODUTOS POR FABRICANTE / MARCA ============
function RelatorioProdutosFabricante() {
  const [fabricanteId, setFabricanteId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [incluirInativos, setIncluirInativos] = useState("");
  const [fabricantes, setFabricantes] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarFabricantes().then(setFabricantes).catch(() => {});
    api.listarCategorias().then(setCategorias).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioProdutosPorFabricante({ fabricanteId, categoriaId, incluirInativos });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [fabricanteId, categoriaId, incluirInativos]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Relatório de Produtos por Fabricante");
    addLinha(doc, `Gerado em ${fmtDataHora(dados.geradoEm)}`);

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Indicador", "Valor"]],
      body: [
        ["Fabricantes", fmtNum(dados.resumo.totalFabricantes)],
        ["Produtos", fmtNum(dados.resumo.totalProdutos)],
        ["Unidades em estoque", fmtNum(dados.resumo.unidadesEmEstoque)],
        ["Valor em estoque (custo)", fmtBRL(dados.resumo.valorEstoqueCusto)],
        ["Valor em estoque (venda)", fmtBRL(dados.resumo.valorEstoqueVenda)],
      ],
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    if (dados.porFabricante.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Fabricante", "Produtos", "Unidades", "Valor custo", "Valor venda"]],
        body: dados.porFabricante.map(f => [
          f.fabricante, fmtNum(f.qtdProdutos), fmtNum(f.unidades),
          fmtBRL(f.valorCusto), fmtBRL(f.valorVenda),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.produtos.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Código", "Produto", "Fabricante", "Categoria", "Estoque", "Custo", "Venda"]],
        body: dados.produtos.map(p => [
          p.codigo, p.nome, p.fabricante || "—", p.categoria || "—",
          `${p.estoque} ${p.unidade}`,
          p.precoCusto != null ? fmtBRL(p.precoCusto) : "—",
          fmtBRL(p.precoVenda),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 8 },
      });
    }

    doc.save(`relatorio-produtos-fabricante-${hoje()}.pdf`);
  }

  return (
    <BlocoRelatorio
      titulo="Relatório de Produtos por Fabricante" cor={C.accent}
      filtros={
        <>
          <CampoSelectBusca
            label="Fabricante / Marca"
            opcoes={[{ id: "__sem__", nome: "(Sem fabricante)" }, ...fabricantes]}
            value={fabricanteId} onChange={setFabricanteId} placeholder="Todos"
          />
          <CampoSelectBusca label="Categoria" opcoes={categorias} value={categoriaId} onChange={setCategoriaId} placeholder="Todas" />
          <CampoSelect label="Inativos" value={incluirInativos} onChange={setIncluirInativos}>
            <option value="">Só ativos</option>
            <option value="true">Incluir inativos</option>
          </CampoSelect>
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Fabricantes", valor: fmtNum(dados.resumo.totalFabricantes), cor: C.accent },
            { rotulo: "Produtos", valor: fmtNum(dados.resumo.totalProdutos), cor: C.purple },
            { rotulo: "Unidades", valor: fmtNum(dados.resumo.unidadesEmEstoque), cor: C.muted },
            { rotulo: "Valor (custo)", valor: fmtBRL(dados.resumo.valorEstoqueCusto), cor: C.yellow },
            { rotulo: "Valor (venda)", valor: fmtBRL(dados.resumo.valorEstoqueVenda), cor: C.green },
          ]} />

          {dados.porFabricante.length > 0 && (
            <Tabela
              titulo="Resumo por fabricante"
              colunas={["Fabricante", "Produtos", "Unidades", "Valor custo", "Valor venda"]}
              alinhamentos={["left", "right", "right", "right", "right"]}
              linhas={dados.porFabricante.map(f => [
                f.fabricante, fmtNum(f.qtdProdutos), fmtNum(f.unidades),
                fmtBRL(f.valorCusto), fmtBRL(f.valorVenda),
              ])}
            />
          )}

          <Tabela
            titulo={`Produtos (${dados.produtos.length})`}
            colunas={["Código", "Produto", "Fabricante", "Categoria", "Estoque", "Custo", "Venda"]}
            alinhamentos={["left", "left", "left", "left", "right", "right", "right"]}
            linhas={dados.produtos.map(p => [
              p.codigo,
              p.ativo ? p.nome : `${p.nome} (inativo)`,
              p.fabricante || "—", p.categoria || "—",
              `${p.estoque} ${p.unidade}`,
              p.precoCusto != null ? fmtBRL(p.precoCusto) : "—",
              fmtBRL(p.precoVenda),
            ])}
            vazioTexto="Nenhum produto encontrado com os filtros."
          />
        </>
      )}
    </BlocoRelatorio>
  );
}

// ============ RELATÓRIO DE CAIXAS (DRE DIÁRIO) ============
function RelatorioCaixas() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioCaixas({ dataInicio, dataFim });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Relatório de Caixas — DRE Diário");
    addPeriodo(doc, dataInicio, dataFim);
    addLinha(doc, `Gerado em ${fmtDataHora(dados.geradoEm)}`);

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Indicador", "Valor"]],
      body: [
        ["Caixas fechados", fmtNum(dados.resumo.caixas)],
        ["Total de vendas registradas", fmtNum(dados.resumo.vendas)],
        ["Total de entradas", fmtBRL(dados.resumo.entradas)],
        ["Total de saídas", fmtBRL(dados.resumo.saidas)],
        ["Quebras (faltou dinheiro)", fmtBRL(dados.resumo.quebras)],
        ["Sobras (excedeu o esperado)", fmtBRL(dados.resumo.sobras)],
        ["Diferença líquida", fmtBRL(dados.resumo.diferencaLiquida)],
      ],
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Dia", "Caixas", "Vendas", "Entradas", "Saídas", "Quebras", "Sobras"]],
      body: dados.dre.map(d => [
        fmtData(d.data + "T12:00:00"),
        d.caixas, d.vendas,
        fmtBRL(d.entradas), fmtBRL(d.saidas),
        fmtBRL(d.quebras), fmtBRL(d.sobras),
      ]),
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 9 },
    });

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["#", "Operador", "Aberto em", "Fechado em", "Saldo Inic.", "Esperado", "Contado", "Diferença"]],
      body: dados.caixas.map(c => [
        `#${c.numero}`, c.operador || "—",
        fmtDataHora(c.abertoEm), fmtDataHora(c.fechadoEm),
        fmtBRL(c.saldoInicial),
        c.saldoFinalEsperado != null ? fmtBRL(c.saldoFinalEsperado) : "—",
        c.saldoFinalContado != null ? fmtBRL(c.saldoFinalContado) : "—",
        c.diferenca > 0 ? `+${fmtBRL(c.diferenca)}` : fmtBRL(c.diferenca),
      ]),
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 8 },
    });

    doc.save(`relatorio-caixas-${hoje()}.pdf`);
  }

  return (
    <BlocoRelatorio
      titulo="Relatório de Caixas (DRE Diário)" cor={C.red}
      filtros={
        <>
          <CampoData label="Início" value={dataInicio} onChange={setDataInicio} />
          <CampoData label="Fim" value={dataFim} onChange={setDataFim} />
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Caixas fechados", valor: fmtNum(dados.resumo.caixas), cor: C.accent },
            { rotulo: "Vendas", valor: fmtNum(dados.resumo.vendas), cor: C.green },
            { rotulo: "Entradas", valor: fmtBRL(dados.resumo.entradas), cor: C.green },
            { rotulo: "Saídas", valor: fmtBRL(dados.resumo.saidas), cor: C.red },
            { rotulo: "Quebras", valor: fmtBRL(dados.resumo.quebras), cor: dados.resumo.quebras > 0 ? C.red : C.muted },
            { rotulo: "Sobras", valor: fmtBRL(dados.resumo.sobras), cor: dados.resumo.sobras > 0 ? C.yellow : C.muted },
          ]} />

          <Tabela
            titulo={`DRE diário (${dados.dre.length} ${dados.dre.length === 1 ? "dia" : "dias"})`}
            colunas={["Dia", "Caixas", "Vendas", "Entradas", "Saídas", "Quebras", "Sobras"]}
            alinhamentos={["left", "right", "right", "right", "right", "right", "right"]}
            linhas={dados.dre.map(d => [
              fmtData(d.data + "T12:00:00"),
              d.caixas, d.vendas,
              fmtBRL(d.entradas), fmtBRL(d.saidas),
              d.quebras > 0 ? fmtBRL(d.quebras) : "—",
              d.sobras > 0 ? fmtBRL(d.sobras) : "—",
            ])}
            vazioTexto="Nenhum caixa fechado no período."
          />

          <Tabela
            titulo={`Caixas detalhados (${dados.caixas.length})`}
            colunas={["#", "Operador", "Aberto em", "Fechado em", "Saldo inic.", "Esperado", "Contado", "Diferença"]}
            alinhamentos={["left", "left", "left", "left", "right", "right", "right", "right"]}
            linhas={dados.caixas.map(c => [
              `#${c.numero}`, c.operador || "—",
              fmtDataHora(c.abertoEm), fmtDataHora(c.fechadoEm),
              fmtBRL(c.saldoInicial),
              c.saldoFinalEsperado != null ? fmtBRL(c.saldoFinalEsperado) : "—",
              c.saldoFinalContado != null ? fmtBRL(c.saldoFinalContado) : "—",
              c.diferenca > 0 ? `+${fmtBRL(c.diferenca)}` : fmtBRL(c.diferenca),
            ])}
            vazioTexto="Nenhum caixa fechado no período."
          />
        </>
      )}
    </BlocoRelatorio>
  );
}

// ============ RELATÓRIO DE LUCRATIVIDADE / MARGEM ============
function RelatorioLucratividade() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [userId, setUserId] = useState("");
  const [categorias, setCategorias] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarCategorias().then(setCategorias).catch(() => {});
    api.listarFuncionarios({ ativo: "true" }).then(setUsuarios).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioLucratividade({ dataInicio, dataFim, categoriaId, userId });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, categoriaId, userId]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Relatório de Lucratividade / Margem");
    addPeriodo(doc, dataInicio, dataFim);

    const body = [
      ["Receita bruta", fmtBRL(dados.resumo.receitaBruta)],
      ["Custo total (CMV)", fmtBRL(dados.resumo.custoTotal)],
      ["Lucro bruto", fmtBRL(dados.resumo.lucroBruto)],
      ["Margem bruta", fmtPct(dados.resumo.margemBruta)],
    ];
    if (dados.resumo.descontos != null) {
      body.push(["Descontos concedidos", fmtBRL(dados.resumo.descontos)]);
      body.push(["Lucro líquido (após descontos)", fmtBRL(dados.resumo.lucroLiquido)]);
      body.push(["Margem líquida", fmtPct(dados.resumo.margemLiquida)]);
    }
    body.push(["Produtos vendidos", fmtNum(dados.resumo.qtdProdutos)]);
    if (dados.resumo.itensSemCusto > 0) {
      body.push(["Produtos sem custo cadastrado", fmtNum(dados.resumo.itensSemCusto)]);
    }

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Indicador", "Valor"]],
      body,
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    if (dados.porCategoria.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Categoria", "Receita", "Custo", "Lucro", "Margem"]],
        body: dados.porCategoria.map(c => [
          c.categoria, fmtBRL(c.receita), fmtBRL(c.custo), fmtBRL(c.lucro), fmtPct(c.margem),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.porProduto.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Produto", "Código", "Categoria", "Qtd", "Receita", "Custo", "Lucro", "Margem"]],
        body: dados.porProduto.map((p, i) => [
          i + 1, p.nome, p.codigo, p.categoria || "—",
          `${fmtNum(p.quantidade)} ${p.unidade}`,
          fmtBRL(p.receita),
          p.custoIndefinido ? "—" : fmtBRL(p.custo),
          fmtBRL(p.lucro),
          p.custoIndefinido ? "s/ custo" : fmtPct(p.margem),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 8 },
      });
    }

    doc.save(`relatorio-lucratividade-${hoje()}.pdf`);
  }

  return (
    <BlocoRelatorio
      titulo="Relatório de Lucratividade / Margem" cor={C.green}
      filtros={
        <>
          <CampoData label="De" value={dataInicio} onChange={setDataInicio} />
          <CampoData label="Até" value={dataFim} onChange={setDataFim} />
          <CampoSelectBusca label="Categoria" opcoes={categorias} value={categoriaId} onChange={setCategoriaId} placeholder="Todas" />
          <CampoSelectBusca label="Vendedor" opcoes={usuarios} value={userId} onChange={setUserId} placeholder="Todos" />
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Receita bruta", valor: fmtBRL(dados.resumo.receitaBruta), cor: C.accent },
            { rotulo: "Custo (CMV)", valor: fmtBRL(dados.resumo.custoTotal), cor: C.red },
            { rotulo: "Lucro bruto", valor: fmtBRL(dados.resumo.lucroBruto), cor: dados.resumo.lucroBruto >= 0 ? C.green : C.red },
            { rotulo: "Margem bruta", valor: fmtPct(dados.resumo.margemBruta), cor: C.purple },
            ...(dados.resumo.descontos != null ? [
              { rotulo: "Lucro líquido", valor: fmtBRL(dados.resumo.lucroLiquido), cor: dados.resumo.lucroLiquido >= 0 ? C.green : C.red },
            ] : []),
          ]} />

          {dados.resumo.itensSemCusto > 0 && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 16,
              background: C.yellow + "22", border: `1px solid ${C.yellow}55`, color: C.yellow, fontSize: 12,
            }}>
              ⚠️ {dados.resumo.itensSemCusto} produto(s) sem preço de custo cadastrado — a margem desses itens fica superestimada (custo considerado R$ 0).
            </div>
          )}

          {dados.porCategoria.length > 0 && (
            <Tabela
              titulo="Lucro por categoria"
              colunas={["Categoria", "Receita", "Custo", "Lucro", "Margem"]}
              alinhamentos={["left", "right", "right", "right", "right"]}
              linhas={dados.porCategoria.map(c => [
                c.categoria, fmtBRL(c.receita), fmtBRL(c.custo), fmtBRL(c.lucro), fmtPct(c.margem),
              ])}
            />
          )}

          <Tabela
            titulo={`Lucro por produto (${dados.porProduto.length})`}
            colunas={["#", "Produto", "Código", "Categoria", "Qtd", "Receita", "Custo", "Lucro", "Margem"]}
            alinhamentos={["center", "left", "left", "left", "right", "right", "right", "right", "right"]}
            linhas={dados.porProduto.map((p, i) => [
              i + 1, p.nome, p.codigo, p.categoria || "—",
              `${fmtNum(p.quantidade)} ${p.unidade}`,
              fmtBRL(p.receita),
              p.custoIndefinido ? "—" : fmtBRL(p.custo),
              fmtBRL(p.lucro),
              p.custoIndefinido ? "s/ custo" : fmtPct(p.margem),
            ])}
            vazioTexto="Nenhuma venda no período."
          />
        </>
      )}
    </BlocoRelatorio>
  );
}

// ============ CURVA ABC (Pareto 80/15/5) ============
const ABC_COR = { A: C.green, B: C.yellow, C: C.muted };
const ABC_DESC = {
  A: "Itens vitais — concentram o resultado",
  B: "Importância intermediária",
  C: "Cauda longa — pouca contribuição",
};
const CRITERIO_LABEL = { receita: "Receita", lucro: "Lucro", quantidade: "Quantidade" };

function RelatorioCurvaAbc() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [criterio, setCriterio] = useState("receita");
  const [categorias, setCategorias] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarCategorias().then(setCategorias).catch(() => {});
  }, []);

  // Formata o valor do criterio escolhido: moeda para receita/lucro, numero
  // para quantidade.
  const fmtCrit = (v) => (criterio === "quantidade" ? fmtNum(v) : fmtBRL(v));

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioCurvaAbc({ dataInicio, dataFim, categoriaId, criterio });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, categoriaId, criterio]);

  async function exportar() {
    if (!dados) return;
    const critLabel = CRITERIO_LABEL[dados.resumo.criterio] || "Receita";
    const doc = await criarPDF(`Curva ABC — por ${critLabel}`);
    addPeriodo(doc, dataInicio, dataFim);

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Classe", "Produtos", "% Produtos", critLabel, "% do Total"]],
      body: dados.resumo.classes.map(c => [
        `Classe ${c.classe}`,
        fmtNum(c.qtdProdutos),
        fmtPct(c.pctProdutos),
        fmtCrit(c.valor),
        fmtPct(c.pctValor),
      ]),
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    if (dados.produtos.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Produto", "Código", "Categoria", "Qtd", critLabel, "% Indiv.", "% Acum.", "Classe"]],
        body: dados.produtos.map(p => [
          p.posicao, p.nome, p.codigo, p.categoria || "—",
          `${fmtNum(p.quantidade)} ${p.unidade}`,
          fmtCrit(p.valor),
          fmtPct(p.pctIndividual),
          fmtPct(p.pctAcumulado),
          p.classe,
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 8 },
      });
    }

    doc.save(`curva-abc-${hoje()}.pdf`);
  }

  const classeA = dados?.resumo.classes.find(c => c.classe === "A");

  return (
    <BlocoRelatorio
      titulo="Curva ABC de Produtos" cor={C.accent}
      filtros={
        <>
          <CampoData label="De" value={dataInicio} onChange={setDataInicio} />
          <CampoData label="Até" value={dataFim} onChange={setDataFim} />
          <CampoSelectBusca label="Categoria" opcoes={categorias} value={categoriaId} onChange={setCategoriaId} placeholder="Todas" />
          <CampoSelect label="Critério" value={criterio} onChange={setCriterio} minWidth={150}>
            <option value="receita">Receita</option>
            <option value="lucro">Lucro</option>
            <option value="quantidade">Quantidade</option>
          </CampoSelect>
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Produtos analisados", valor: fmtNum(dados.resumo.totalProdutos), cor: C.accent },
            { rotulo: `Total (${CRITERIO_LABEL[dados.resumo.criterio]})`, valor: fmtCrit(dados.resumo.totalCriterio), cor: C.green },
            { rotulo: "Itens classe A", valor: classeA ? `${fmtNum(classeA.qtdProdutos)} (${fmtPct(classeA.pctProdutos)})` : "—", cor: C.green },
            { rotulo: "Concentração A", valor: classeA ? fmtPct(classeA.pctValor) : "—", cor: C.purple },
          ]} />

          <DistribuicaoAbc classes={dados.resumo.classes} criterio={dados.resumo.criterio} />

          {dados.resumo.itensSemCusto > 0 && dados.resumo.criterio === "lucro" && (
            <div style={{
              padding: "10px 14px", borderRadius: 10, marginBottom: 16,
              background: "color-mix(in srgb, var(--amber) 14%, transparent)",
              border: "1px solid color-mix(in srgb, var(--amber) 30%, transparent)",
              color: "var(--amber)", fontSize: 12,
            }}>
              {dados.resumo.itensSemCusto} produto(s) sem preço de custo — o lucro desses itens fica superestimado.
            </div>
          )}

          <Tabela
            titulo={`Classificação por produto (${dados.produtos.length})`}
            colunas={["#", "Produto", "Código", "Categoria", "Qtd", CRITERIO_LABEL[dados.resumo.criterio], "% Indiv.", "% Acum.", "Classe"]}
            alinhamentos={["center", "left", "left", "left", "right", "right", "right", "right", "center"]}
            linhas={dados.produtos.map(p => [
              p.posicao,
              p.nome,
              p.codigo,
              p.categoria || "—",
              `${fmtNum(p.quantidade)} ${p.unidade}`,
              fmtCrit(p.valor),
              fmtPct(p.pctIndividual),
              fmtPct(p.pctAcumulado),
              <BadgeClasse key="b" classe={p.classe} />,
            ])}
            vazioTexto="Nenhuma venda no período."
          />
        </>
      )}
    </BlocoRelatorio>
  );
}

// Faixa empilhada A/B/C: mostra a participacao de cada classe no criterio e,
// abaixo, quantos produtos ela representa — torna visivel o efeito Pareto
// ("poucos produtos = maior parte do resultado").
function DistribuicaoAbc({ classes, criterio }) {
  const fmtCrit = (v) => (criterio === "quantidade" ? fmtNum(v) : fmtBRL(v));
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--hairline-soft)",
      boxShadow: "var(--shadow-card)", borderRadius: 14, padding: 16, marginBottom: 16,
    }}>
      <div style={{ color: "var(--fg-muted)", fontSize: 10.5, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>
        Distribuição ABC
      </div>
      <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
        {classes.map(c => (
          c.pctValor > 0 ? (
            <div key={c.classe} style={{ width: `${c.pctValor}%`, background: ABC_COR[c.classe] }} title={`Classe ${c.classe}: ${fmtPct(c.pctValor)}`} />
          ) : null
        ))}
      </div>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {classes.map(c => (
          <div key={c.classe} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px", borderRadius: 10,
            border: "1px solid var(--hairline-soft)",
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 14, color: "#fff",
              background: ABC_COR[c.classe],
            }}>{c.classe}</div>
            <div style={{ minWidth: 0 }}>
              <div className="font-mono tabular-nums" style={{ color: "var(--fg)", fontSize: 14, fontWeight: 500 }}>
                {fmtPct(c.pctValor)} <span style={{ color: "var(--fg-muted)", fontSize: 11 }}>do total</span>
              </div>
              <div style={{ color: "var(--fg-muted)", fontSize: 11 }}>
                {fmtNum(c.qtdProdutos)} produtos ({fmtPct(c.pctProdutos)}) · {fmtCrit(c.valor)}
              </div>
              <div style={{ color: "var(--fg-faint)", fontSize: 10.5, marginTop: 1 }}>{ABC_DESC[c.classe]}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BadgeClasse({ classe }) {
  return (
    <span className="font-mono" style={{
      display: "inline-block", minWidth: 22, padding: "2px 7px", borderRadius: 999,
      fontSize: 11, fontWeight: 700, color: "#fff", background: ABC_COR[classe] || C.muted,
    }}>{classe}</span>
  );
}

// ============ GIRO DE ESTOQUE & CAPITAL PARADO ============
const GIRO_CLASSE = {
  PARADO:     { label: "Parado", cor: C.red },
  BAIXO_GIRO: { label: "Baixo giro", cor: C.yellow },
  SAUDAVEL:   { label: "Saudável", cor: C.green },
  ALTO_GIRO:  { label: "Alto giro", cor: C.accent },
};

function RelatorioGiroEstoque() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [categorias, setCategorias] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarCategorias().then(setCategorias).catch(() => {});
    api.listarFornecedores({ ativo: "true" }).then(setFornecedores).catch(() => {});
  }, []);

  const fmtGiro = (v) => (v == null ? "—" : `${v.toFixed(1)}×`);
  const fmtCobertura = (v) => {
    if (v == null) return "Não vende";
    if (v >= 999) return "999+ d";
    return `${Math.round(v)} d`;
  };

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioGiroEstoque({ dataInicio, dataFim, categoriaId, fornecedorId });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, categoriaId, fornecedorId]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Giro de Estoque & Capital Parado");
    addPeriodo(doc, dados.filtros.dataInicio?.slice(0, 10), dados.filtros.dataFim?.slice(0, 10));

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Indicador", "Valor"]],
      body: [
        ["Capital em estoque (custo)", fmtBRL(dados.resumo.capitalEstoqueTotal)],
        ["Capital parado", `${fmtBRL(dados.resumo.capitalParadoTotal)} (${fmtPct(dados.resumo.pctCapitalParado)})`],
        ["Itens parados", fmtNum(dados.resumo.qtdParados)],
        ["Itens baixo giro", fmtNum(dados.resumo.qtdBaixoGiro)],
        ["Itens alto giro", fmtNum(dados.resumo.qtdAltoGiro)],
        ["Janela analisada", `${dados.resumo.diasPeriodo} dias`],
      ],
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    if (dados.produtos.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Produto", "Código", "Categoria", "Estoque", "Vendido", "Giro", "Cobertura", "Capital parado", "Classe"]],
        body: dados.produtos.map(p => [
          p.nome, p.codigo, p.categoria || "—",
          `${fmtNum(p.estoque)} ${p.unidade}`,
          fmtNum(p.vendidoPeriodo),
          fmtGiro(p.giro),
          fmtCobertura(p.coberturaDias),
          p.capitalParado != null ? fmtBRL(p.capitalParado) : "—",
          GIRO_CLASSE[p.classe]?.label || p.classe,
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 8 },
      });
    }

    doc.save(`giro-estoque-${hoje()}.pdf`);
  }

  return (
    <BlocoRelatorio
      titulo="Giro de Estoque & Capital Parado" cor={C.purple}
      filtros={
        <>
          <CampoData label="De" value={dataInicio} onChange={setDataInicio} />
          <CampoData label="Até" value={dataFim} onChange={setDataFim} />
          <CampoSelectBusca label="Categoria" opcoes={categorias} value={categoriaId} onChange={setCategoriaId} placeholder="Todas" />
          <CampoSelectBusca label="Fornecedor" opcoes={fornecedores} value={fornecedorId} onChange={setFornecedorId} placeholder="Todos" />
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Capital em estoque", valor: fmtBRL(dados.resumo.capitalEstoqueTotal), cor: C.accent },
            { rotulo: "Capital parado", valor: `${fmtBRL(dados.resumo.capitalParadoTotal)} (${fmtPct(dados.resumo.pctCapitalParado)})`, cor: C.red },
            { rotulo: "Itens parados", valor: fmtNum(dados.resumo.qtdParados), cor: C.red },
            { rotulo: "Itens baixo giro", valor: fmtNum(dados.resumo.qtdBaixoGiro), cor: C.yellow },
          ]} />

          <div style={{ color: "var(--fg-faint)", fontSize: 11.5, marginBottom: 16, marginTop: -4 }}>
            Janela analisada: <strong style={{ color: "var(--fg-soft)" }}>{dados.resumo.diasPeriodo} dias</strong> · giro = vendido ÷ estoque · cobertura = dias que o estoque atual dura na venda média.
          </div>

          <Tabela
            titulo={`Produtos por capital parado (${dados.produtos.length})`}
            colunas={["Produto", "Código", "Categoria", "Estoque", "Vendido", "Giro", "Cobertura", "Capital parado", "Classe"]}
            alinhamentos={["left", "left", "left", "right", "right", "right", "right", "right", "center"]}
            linhas={dados.produtos.map(p => [
              p.nome,
              p.codigo,
              p.categoria || "—",
              `${fmtNum(p.estoque)} ${p.unidade}`,
              fmtNum(p.vendidoPeriodo),
              fmtGiro(p.giro),
              fmtCobertura(p.coberturaDias),
              p.capitalParado != null ? fmtBRL(p.capitalParado) : "—",
              <BadgeGiro key="g" classe={p.classe} />,
            ])}
            vazioTexto="Nenhum produto no filtro."
          />
        </>
      )}
    </BlocoRelatorio>
  );
}

function BadgeGiro({ classe }) {
  const meta = GIRO_CLASSE[classe] || { label: classe, cor: C.muted };
  return (
    <span className="font-mono" style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999,
      fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap",
      color: meta.cor,
      background: `color-mix(in srgb, ${meta.cor} 16%, transparent)`,
      border: `1px solid color-mix(in srgb, ${meta.cor} 30%, transparent)`,
    }}>{meta.label}</span>
  );
}

// ============ SAZONALIDADE (heatmap dia x hora) ============
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function RelatorioSazonalidade() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [metrica, setMetrica] = useState("faturamento"); // faturamento | vendas
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const valorCel = (cel) => (metrica === "vendas" ? cel.vendas : cel.faturamento);
  const fmtMetrica = (v) => (metrica === "vendas" ? fmtNum(v) : fmtBRL(v));

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioSazonalidade({ dataInicio, dataFim });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Sazonalidade de Vendas");
    addPeriodo(doc, dados.filtros.dataInicio?.slice(0, 10), dados.filtros.dataFim?.slice(0, 10));

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Dia da semana", "Vendas", "Faturamento"]],
      body: dados.porDia.map((d, i) => [DIAS_SEMANA[i], fmtNum(d.vendas), fmtBRL(d.faturamento)]),
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });
    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Hora", "Vendas", "Faturamento"]],
      body: dados.porHora
        .map((h, i) => [`${String(i).padStart(2, "0")}h`, fmtNum(h.vendas), fmtBRL(h.faturamento)])
        .filter((_, i) => dados.porHora[i].vendas > 0),
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 9 },
    });
    doc.save(`sazonalidade-${hoje()}.pdf`);
  }

  // Maior valor de celula no metrica atual (para escalar a intensidade da cor).
  const maxCel = dados
    ? Math.max(1, ...dados.matriz.flat().map(valorCel))
    : 1;

  return (
    <BlocoRelatorio
      titulo="Sazonalidade de Vendas" cor={C.yellow}
      filtros={
        <>
          <CampoData label="De" value={dataInicio} onChange={setDataInicio} />
          <CampoData label="Até" value={dataFim} onChange={setDataFim} />
          <CampoSelect label="Métrica" value={metrica} onChange={setMetrica} minWidth={150}>
            <option value="faturamento">Faturamento</option>
            <option value="vendas">Nº de vendas</option>
          </CampoSelect>
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Vendas no período", valor: fmtNum(dados.resumo.totalVendas), cor: C.accent },
            { rotulo: "Faturamento", valor: fmtBRL(dados.resumo.totalFaturamento), cor: C.green },
            { rotulo: "Melhor dia", valor: dados.resumo.melhorDia ? `${DIAS_SEMANA[dados.resumo.melhorDia.dow]}` : "—", cor: C.purple },
            { rotulo: "Horário de pico", valor: dados.resumo.pico ? `${DIAS_SEMANA[dados.resumo.pico.dow]} ${String(dados.resumo.pico.hour).padStart(2, "0")}h` : "—", cor: C.yellow },
          ]} />

          <HeatmapSazonalidade
            matriz={dados.matriz}
            maxCel={maxCel}
            valorCel={valorCel}
            fmtMetrica={fmtMetrica}
          />
        </>
      )}
    </BlocoRelatorio>
  );
}

// Heatmap 7 dias x 24 horas. Intensidade da cor proporcional ao valor da
// metrica escolhida; qualquer venda recebe um piso de opacidade p/ visibilidade.
function HeatmapSazonalidade({ matriz, maxCel, valorCel, fmtMetrica }) {
  const horas = Array.from({ length: 24 }, (_, h) => h);
  const corCel = (v) => {
    if (v <= 0) return "transparent";
    const pct = 14 + (v / maxCel) * 86; // 14%..100%
    return `color-mix(in srgb, var(--accent) ${pct.toFixed(0)}%, transparent)`;
  };
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--hairline-soft)",
      boxShadow: "var(--shadow-card)", borderRadius: 14, padding: 16, marginBottom: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ color: "var(--fg-muted)", fontSize: 10.5, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em" }}>
          Mapa de calor · dia × hora
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--fg-faint)", fontSize: 11 }}>
          <span>menos</span>
          <div style={{ display: "flex", gap: 2 }}>
            {[14, 40, 65, 100].map(p => (
              <span key={p} style={{ width: 16, height: 10, borderRadius: 2, background: `color-mix(in srgb, var(--accent) ${p}%, transparent)` }} />
            ))}
          </div>
          <span>mais</span>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 680 }}>
          {/* Cabecalho de horas */}
          <div style={{ display: "grid", gridTemplateColumns: `36px repeat(24, 1fr)`, gap: 2, marginBottom: 2 }}>
            <div />
            {horas.map(h => (
              <div key={h} className="font-mono" style={{ fontSize: 8.5, color: "var(--fg-faint)", textAlign: "center" }}>
                {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
              </div>
            ))}
          </div>
          {/* Linhas por dia */}
          {matriz.map((linha, d) => (
            <div key={d} style={{ display: "grid", gridTemplateColumns: `36px repeat(24, 1fr)`, gap: 2, marginBottom: 2 }}>
              <div className="font-mono" style={{ fontSize: 10, color: "var(--fg-muted)", display: "flex", alignItems: "center" }}>
                {DIAS_SEMANA[d]}
              </div>
              {linha.map((cel, h) => {
                const v = valorCel(cel);
                return (
                  <div
                    key={h}
                    title={`${DIAS_SEMANA[d]} ${String(h).padStart(2, "0")}h · ${cel.vendas} venda(s) · ${fmtMetrica(cel.faturamento)}`}
                    style={{
                      height: 22, borderRadius: 3, background: corCel(v),
                      border: v > 0 ? "1px solid color-mix(in srgb, var(--accent) 20%, transparent)" : "1px solid var(--hairline-soft)",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ AGING DE RECEBÍVEIS (idade da dívida) ============
const AGING_META = {
  AVENCER:  { label: "A vencer",   cor: C.green },
  D1_30:    { label: "1–30 dias",  cor: C.yellow },
  D31_60:   { label: "31–60 dias", cor: "color-mix(in srgb, var(--yellow) 55%, var(--red))" },
  D61_90:   { label: "61–90 dias", cor: C.red },
  D90MAIS:  { label: "90+ dias",   cor: "color-mix(in srgb, var(--red) 70%, #000)" },
};
const AGING_ORDEM = ["AVENCER", "D1_30", "D31_60", "D61_90", "D90MAIS"];

function RelatorioAgingReceber() {
  const [clienteId, setClienteId] = useState("");
  const [clientes, setClientes] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarClientes({ ativo: "true" }).then(setClientes).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioAgingReceber({ clienteId });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [clienteId]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Aging de Recebíveis");

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Faixa", "Contas", "Valor", "% do total"]],
      body: dados.resumo.faixas.map(f => [
        AGING_META[f.faixa]?.label || f.faixa,
        fmtNum(f.qtd),
        fmtBRL(f.total),
        fmtPct(f.pct),
      ]),
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    if (dados.clientes.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Cliente", "Contas", "Total em aberto", "Vencido", "Maior atraso"]],
        body: dados.clientes.map(c => [
          c.cliente, fmtNum(c.qtd), fmtBRL(c.total), fmtBRL(c.vencido),
          c.maiorAtraso > 0 ? `${c.maiorAtraso} d` : "—",
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    doc.save(`aging-recebiveis-${hoje()}.pdf`);
  }

  return (
    <BlocoRelatorio
      titulo="Aging de Recebíveis" cor={C.red}
      filtros={
        <>
          <CampoSelectBusca label="Cliente" opcoes={clientes} value={clienteId} onChange={setClienteId} placeholder="Todos" />
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Total em aberto", valor: fmtBRL(dados.resumo.totalAberto), cor: C.accent },
            { rotulo: "Vencido (inadimplência)", valor: `${fmtBRL(dados.resumo.totalVencido)} (${fmtPct(dados.resumo.pctVencido)})`, cor: C.red },
            { rotulo: "A vencer", valor: fmtBRL(dados.resumo.totalAVencer), cor: C.green },
            { rotulo: "Clientes devedores", valor: fmtNum(dados.resumo.qtdClientes), cor: C.purple },
          ]} />

          <DistribuicaoAging faixas={dados.resumo.faixas} />

          {dados.clientes.length > 0 && (
            <Tabela
              titulo={`Clientes devedores (${dados.clientes.length})`}
              colunas={["Cliente", "Contas", "Total em aberto", "Vencido", "Maior atraso"]}
              alinhamentos={["left", "right", "right", "right", "right"]}
              linhas={dados.clientes.map(c => [
                c.cliente,
                fmtNum(c.qtd),
                fmtBRL(c.total),
                fmtBRL(c.vencido),
                c.maiorAtraso > 0 ? `${fmtNum(c.maiorAtraso)} d` : "—",
              ])}
            />
          )}

          <Tabela
            titulo={`Contas em aberto (${dados.contas.length})`}
            colunas={["Vencimento", "Cliente", "Descrição", "Atraso", "Faixa", "Valor"]}
            alinhamentos={["left", "left", "left", "right", "center", "right"]}
            linhas={dados.contas.map(c => [
              fmtData(c.vencimento),
              c.cliente,
              c.descricao || "—",
              c.diasAtraso > 0 ? `${fmtNum(c.diasAtraso)} d` : "—",
              <BadgeAging key="f" faixa={c.faixa} />,
              fmtBRL(c.valor),
            ])}
            vazioTexto="Nenhuma conta em aberto."
          />
        </>
      )}
    </BlocoRelatorio>
  );
}

function DistribuicaoAging({ faixas }) {
  const ordenadas = AGING_ORDEM.map(f => faixas.find(x => x.faixa === f)).filter(Boolean);
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--hairline-soft)",
      boxShadow: "var(--shadow-card)", borderRadius: 14, padding: 16, marginBottom: 16,
    }}>
      <div style={{ color: "var(--fg-muted)", fontSize: 10.5, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>
        Distribuição por idade
      </div>
      <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
        {ordenadas.map(f => (
          f.pct > 0 ? (
            <div key={f.faixa} style={{ width: `${f.pct}%`, background: AGING_META[f.faixa].cor }} title={`${AGING_META[f.faixa].label}: ${fmtPct(f.pct)}`} />
          ) : null
        ))}
      </div>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {ordenadas.map(f => (
          <div key={f.faixa} style={{
            padding: "10px 12px", borderRadius: 10, border: "1px solid var(--hairline-soft)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: AGING_META[f.faixa].cor, flexShrink: 0 }} />
              <span style={{ color: "var(--fg-soft)", fontSize: 11.5, fontWeight: 500 }}>{AGING_META[f.faixa].label}</span>
            </div>
            <div className="font-mono tabular-nums" style={{ color: "var(--fg)", fontSize: 15, fontWeight: 500 }}>{fmtBRL(f.total)}</div>
            <div style={{ color: "var(--fg-muted)", fontSize: 11 }}>{fmtNum(f.qtd)} conta(s) · {fmtPct(f.pct)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BadgeAging({ faixa }) {
  const meta = AGING_META[faixa] || { label: faixa, cor: C.muted };
  return (
    <span className="font-mono" style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999,
      fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap",
      color: meta.cor,
      background: `color-mix(in srgb, ${meta.cor} 16%, transparent)`,
      border: `1px solid color-mix(in srgb, ${meta.cor} 30%, transparent)`,
    }}>{meta.label}</span>
  );
}

// ============ RELATÓRIO DE COMISSÕES ============
function RelatorioComissoesLista() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [userId, setUserId] = useState("");
  const [usuarios, setUsuarios] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarFuncionarios({ ativo: "true" }).then(setUsuarios).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioComissoes({ dataInicio, dataFim, userId });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, userId]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Relatório de Comissões");
    addPeriodo(doc, dataInicio, dataFim);

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Indicador", "Valor"]],
      body: [
        ["Faturamento", fmtBRL(dados.resumo.totalVendas)],
        ["Comissão total", fmtBRL(dados.resumo.totalComissao)],
        ["Vendas concluídas", fmtNum(dados.resumo.totalVendasCount)],
        ["Vendedores", fmtNum(dados.resumo.vendedoresCount)],
        ["Top vendedor", dados.resumo.melhorVendedor || "—"],
      ],
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    if (dados.vendedores.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Vendedor", "Vendas", "Faturamento", "Ticket médio", "Comissão", "Meses ≥ meta"]],
        body: dados.vendedores.map((v, i) => [
          i + 1,
          v.nome,
          fmtNum(v.vendasCount),
          fmtBRL(v.totalVendas),
          fmtBRL(v.ticketMedio),
          fmtBRL(v.totalComissao),
          v.configuracao?.metaMensal > 0
            ? `${v.mesesAcimaDaMeta}/${v.mesesNoPeriodo}`
            : "—",
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.vendas.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Data", "Vendedor", "Cliente", "Pgto", "Total", "Comissão"]],
        body: dados.vendas.map(v => [
          v.numero,
          fmtDataHora(v.createdAt),
          v.vendedor,
          v.cliente || "Avulso",
          ROTULO_PAGAMENTO[v.formaPagamento] || v.formaPagamento,
          fmtBRL(v.total),
          fmtBRL(v.comissao),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 8 },
      });
    }

    doc.save(`relatorio-comissoes-${hoje()}.pdf`);
  }

  return (
    <BlocoRelatorio
      titulo="Relatório de Comissões" cor={C.purple}
      filtros={
        <>
          <CampoData label="De" value={dataInicio} onChange={setDataInicio} />
          <CampoData label="Até" value={dataFim} onChange={setDataFim} />
          <CampoSelectBusca label="Vendedor" opcoes={usuarios} value={userId} onChange={setUserId} placeholder="Todos" />
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Comissão total", valor: fmtBRL(dados.resumo.totalComissao), cor: C.green },
            { rotulo: "Faturamento",    valor: fmtBRL(dados.resumo.totalVendas),    cor: C.accent },
            { rotulo: "Vendas",         valor: fmtNum(dados.resumo.totalVendasCount), cor: C.purple },
            { rotulo: "Top vendedor",   valor: dados.resumo.melhorVendedor || "—",    cor: C.yellow },
          ]} />

          {dados.vendedores.length > 0 && (
            <Tabela
              titulo="Resumo por vendedor"
              colunas={["#", "Vendedor", "Vendas", "Faturamento", "Ticket médio", "Comissão", "Meses ≥ meta"]}
              alinhamentos={["center", "left", "right", "right", "right", "right", "center"]}
              linhas={dados.vendedores.map((v, i) => [
                i + 1,
                v.nome,
                fmtNum(v.vendasCount),
                fmtBRL(v.totalVendas),
                fmtBRL(v.ticketMedio),
                fmtBRL(v.totalComissao),
                v.configuracao?.metaMensal > 0
                  ? `${v.mesesAcimaDaMeta}/${v.mesesNoPeriodo}`
                  : "—",
              ])}
              vazioTexto="Nenhum vendedor no período."
            />
          )}

          <Tabela
            titulo={`Detalhamento de vendas (${dados.vendas.length} venda${dados.vendas.length === 1 ? "" : "s"})`}
            colunas={["#", "Data", "Vendedor", "Cliente", "Pgto", "Regra", "Total", "Comissão"]}
            alinhamentos={["center", "left", "left", "left", "left", "left", "right", "right"]}
            linhas={dados.vendas.map(v => [
              `#${v.numero}`,
              fmtDataHora(v.createdAt),
              v.vendedor,
              v.cliente || "Avulso",
              ROTULO_PAGAMENTO[v.formaPagamento] || v.formaPagamento,
              v.regra,
              fmtBRL(v.total),
              fmtBRL(v.comissao),
            ])}
            vazioTexto="Nenhuma venda no período."
          />
        </>
      )}
    </BlocoRelatorio>
  );
}

// ============ RELATÓRIO DE FUNIL CRM ============
function RelatorioFunilCrm() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [origem, setOrigem] = useState("");
  const [usuarios, setUsuarios] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarFuncionarios({ ativo: "true" }).then(setUsuarios).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioFunilCrm({ dataInicio, dataFim, responsavelId, origem });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, responsavelId, origem]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Relatório de Funil de Vendas (CRM)");
    addPeriodo(doc, dataInicio, dataFim);

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Indicador", "Valor"]],
      body: [
        ["Total de oportunidades", fmtNum(dados.resumo.totalOportunidades)],
        ["Abertas (em andamento)", fmtNum(dados.resumo.abertas)],
        ["Ganhas", fmtNum(dados.resumo.ganhas)],
        ["Perdidas", fmtNum(dados.resumo.perdidas)],
        ["Taxa de conversão", `${dados.resumo.taxaConversao.toFixed(1)}%`],
        ["Valor estimado em aberto", fmtBRL(dados.resumo.valorEstimadoAberto)],
        ["Valor ponderado em aberto", fmtBRL(dados.resumo.valorPonderadoAberto)],
        ["Valor ganho (fechado)", fmtBRL(dados.resumo.valorGanho)],
        ["Ticket médio (ganho)", fmtBRL(dados.resumo.ticketMedioGanho)],
        ["Ciclo médio de venda (dias)", dados.resumo.cicloMedioGanhoDias.toFixed(1)],
      ],
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Etapa", "Qtd", "Valor estimado", "Valor ponderado"]],
      body: dados.porEtapa.map(e => [
        ROTULO_ETAPA[e.etapa] || e.etapa,
        fmtNum(e.quantidade),
        fmtBRL(e.valorEstimado),
        fmtBRL(e.valorPonderado),
      ]),
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 9 },
    });

    if (dados.conversaoEtapaEtapa.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["De", "Para", "Qtd na etapa de origem", "Qtd avançou", "Taxa"]],
        body: dados.conversaoEtapaEtapa.map(c => [
          ROTULO_ETAPA[c.de] || c.de,
          ROTULO_ETAPA[c.para] || c.para,
          fmtNum(c.qtdDe),
          fmtNum(c.qtdPara),
          `${c.taxa.toFixed(1)}%`,
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.porResponsavel.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Vendedor", "Total", "Abertas", "Ganhas", "Perdidas", "Conv.", "Valor ganho"]],
        body: dados.porResponsavel.map((v, i) => [
          i + 1, v.nome,
          fmtNum(v.quantidade), fmtNum(v.abertas),
          fmtNum(v.ganhas), fmtNum(v.perdidas),
          `${v.taxaConversao.toFixed(1)}%`,
          fmtBRL(v.valorGanho),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.porOrigem.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Origem", "Qtd", "Ganhas", "Perdidas", "Conv.", "Valor ganho"]],
        body: dados.porOrigem.map(o => [
          o.origem, fmtNum(o.quantidade),
          fmtNum(o.ganhas), fmtNum(o.perdidas),
          `${o.taxaConversao.toFixed(1)}%`, fmtBRL(o.valorGanho),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.motivosPerda.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Motivo de perda", "Qtd", "Valor perdido"]],
        body: dados.motivosPerda.map(m => [m.motivo, fmtNum(m.quantidade), fmtBRL(m.valorPerdido)]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.oportunidades.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Título", "Cliente", "Vendedor", "Etapa", "Prob.", "Valor", "Dias etapa"]],
        body: dados.oportunidades.map(o => [
          `#${o.numero}`, o.titulo, o.cliente || "—",
          o.responsavel || "—", ROTULO_ETAPA[o.etapa] || o.etapa,
          `${o.probabilidade}%`, fmtBRL(o.valorEstimado), fmtNum(o.diasNaEtapa),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 8 },
      });
    }

    doc.save(`relatorio-funil-crm-${hoje()}.pdf`);
  }

  const maxFunil = dados
    ? Math.max(1, ...dados.porEtapa.map(e => e.quantidade))
    : 1;

  return (
    <BlocoRelatorio
      titulo="Relatório de Funil de Vendas (CRM)" cor={C.purple}
      filtros={
        <>
          <CampoData label="Criadas de" value={dataInicio} onChange={setDataInicio} />
          <CampoData label="Criadas até" value={dataFim} onChange={setDataFim} />
          <CampoSelectBusca label="Responsável" opcoes={usuarios} value={responsavelId} onChange={setResponsavelId} placeholder="Todos" />
          <CampoSelect label="Origem" value={origem} onChange={setOrigem}>
            <option value="">Todas</option>
            {ORIGENS_FUNIL.map(o => <option key={o} value={o}>{o}</option>)}
          </CampoSelect>
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Oportunidades", valor: fmtNum(dados.resumo.totalOportunidades), cor: C.purple },
            { rotulo: "Abertas", valor: fmtNum(dados.resumo.abertas), cor: C.accent },
            { rotulo: "Ganhas", valor: fmtNum(dados.resumo.ganhas), cor: C.green },
            { rotulo: "Perdidas", valor: fmtNum(dados.resumo.perdidas), cor: C.red },
            { rotulo: "Conversão", valor: `${dados.resumo.taxaConversao.toFixed(1)}%`, cor: dados.resumo.taxaConversao >= 30 ? C.green : C.yellow },
            { rotulo: "Valor ganho", valor: fmtBRL(dados.resumo.valorGanho), cor: C.green },
            { rotulo: "Pipeline (ponderado)", valor: fmtBRL(dados.resumo.valorPonderadoAberto), cor: C.purple },
            { rotulo: "Ciclo médio", valor: `${dados.resumo.cicloMedioGanhoDias.toFixed(1)}d`, cor: C.yellow },
          ]} />

          {/* Funil visual */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: 16, marginBottom: 16,
          }}>
            <div style={{ color: C.white, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              Distribuição por etapa
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {dados.porEtapa.map(e => {
                const pct = (e.quantidade / maxFunil) * 100;
                return (
                  <div key={e.etapa} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 110, color: COR_ETAPA[e.etapa], fontSize: 12, fontWeight: 700,
                    }}>{ROTULO_ETAPA[e.etapa]}</div>
                    <div style={{ flex: 1, position: "relative", height: 26, background: C.surface, borderRadius: 6, overflow: "hidden" }}>
                      <div style={{
                        width: `${pct}%`, height: "100%",
                        background: COR_ETAPA[e.etapa],
                        opacity: 0.7,
                        transition: "width 300ms ease",
                      }} />
                      <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", padding: "0 10px",
                        color: C.white, fontSize: 12, fontWeight: 700,
                        gap: 8,
                      }}>
                        <span>{fmtNum(e.quantidade)}</span>
                        <span style={{ color: C.muted, fontWeight: 500 }}>·</span>
                        <span style={{ color: C.muted, fontWeight: 500 }}>{fmtBRL(e.valorEstimado)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {dados.conversaoEtapaEtapa.length > 0 && (
            <Tabela
              titulo="Conversão etapa a etapa (do total que já passou por cada etapa)"
              colunas={["De", "Para", "Passou por (origem)", "Avançou (destino)", "Taxa"]}
              alinhamentos={["left", "left", "right", "right", "right"]}
              linhas={dados.conversaoEtapaEtapa.map(c => [
                ROTULO_ETAPA[c.de] || c.de,
                ROTULO_ETAPA[c.para] || c.para,
                fmtNum(c.qtdDe),
                fmtNum(c.qtdPara),
                `${c.taxa.toFixed(1)}%`,
              ])}
            />
          )}

          {dados.porResponsavel.length > 0 && (
            <Tabela
              titulo={`Performance por responsável (${dados.porResponsavel.length})`}
              colunas={["#", "Vendedor", "Total", "Abertas", "Ganhas", "Perdidas", "Conv.", "Valor ganho"]}
              alinhamentos={["center", "left", "right", "right", "right", "right", "right", "right"]}
              linhas={dados.porResponsavel.map((v, i) => [
                i + 1, v.nome,
                fmtNum(v.quantidade), fmtNum(v.abertas),
                fmtNum(v.ganhas), fmtNum(v.perdidas),
                `${v.taxaConversao.toFixed(1)}%`,
                fmtBRL(v.valorGanho),
              ])}
            />
          )}

          {dados.porOrigem.length > 0 && (
            <Tabela
              titulo="Por origem"
              colunas={["Origem", "Qtd", "Ganhas", "Perdidas", "Conv.", "Valor ganho"]}
              alinhamentos={["left", "right", "right", "right", "right", "right"]}
              linhas={dados.porOrigem.map(o => [
                o.origem, fmtNum(o.quantidade),
                fmtNum(o.ganhas), fmtNum(o.perdidas),
                `${o.taxaConversao.toFixed(1)}%`,
                fmtBRL(o.valorGanho),
              ])}
            />
          )}

          {dados.motivosPerda.length > 0 && (
            <Tabela
              titulo={`Motivos de perda (${dados.motivosPerda.length})`}
              colunas={["Motivo", "Qtd", "Valor perdido"]}
              alinhamentos={["left", "right", "right"]}
              linhas={dados.motivosPerda.map(m => [
                m.motivo, fmtNum(m.quantidade), fmtBRL(m.valorPerdido),
              ])}
            />
          )}

          <Tabela
            titulo={`Detalhamento (${dados.oportunidades.length} oportunidade${dados.oportunidades.length === 1 ? "" : "s"})`}
            colunas={["#", "Título", "Cliente", "Vendedor", "Etapa", "Prob.", "Valor", "Dias etapa"]}
            alinhamentos={["center", "left", "left", "left", "left", "right", "right", "right"]}
            linhas={dados.oportunidades.map(o => [
              `#${o.numero}`, o.titulo, o.cliente || "—",
              o.responsavel || "—", ROTULO_ETAPA[o.etapa] || o.etapa,
              `${o.probabilidade}%`, fmtBRL(o.valorEstimado),
              fmtNum(o.diasNaEtapa),
            ])}
            vazioTexto="Nenhuma oportunidade no período."
          />
        </>
      )}
    </BlocoRelatorio>
  );
}

// ============ RELATÓRIO DE PERFORMANCE COMERCIAL (CRM) ============
function RelatorioPerformanceCrm() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [usuarios, setUsuarios] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarFuncionarios({ ativo: "true" }).then(setUsuarios).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioPerformanceCrm({ dataInicio, dataFim, responsavelId });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, responsavelId]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Relatório de Performance Comercial (CRM)");
    addPeriodo(doc, dataInicio, dataFim);

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Indicador", "Valor"]],
      body: [
        ["Vendedores no relatório", fmtNum(dados.resumo.totalVendedores)],
        ["Faturamento total", fmtBRL(dados.resumo.totalFaturamento)],
        ["Vendas concluídas", fmtNum(dados.resumo.totalVendas)],
        ["Oportunidades criadas", fmtNum(dados.resumo.totalOppCriadas)],
        ["Oportunidades ganhas", fmtNum(dados.resumo.totalOppGanhas)],
        ["Oportunidades perdidas", fmtNum(dados.resumo.totalOppPerdidas)],
        ["Conversão geral", `${dados.resumo.conversaoGeral.toFixed(1)}%`],
        ["Valor ganho (pipeline fechado)", fmtBRL(dados.resumo.totalValorGanho)],
        ["Ciclo médio (dias)", dados.resumo.cicloMedioGeral.toFixed(1)],
        ["Interações registradas", fmtNum(dados.resumo.totalInteracoes)],
        ["Tarefas concluídas", fmtNum(dados.resumo.totalTarefasConcluidas)],
      ],
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    if (dados.topFaturamento.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["🏆 Top faturamento", "", ""]],
        body: [],
        styles: { fontSize: 11, fontStyle: "bold" }, theme: "plain",
      });
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY,
        head: [["#", "Vendedor", "Faturamento", "Vendas"]],
        body: dados.topFaturamento.map((v, i) => [
          i + 1, v.nome, fmtBRL(v.faturamento), fmtNum(v.vendasQtd),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.topConversao.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["🎯 Top conversão (min. 3 oportunidades fechadas)", "", ""]],
        body: [],
        styles: { fontSize: 11, fontStyle: "bold" }, theme: "plain",
      });
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY,
        head: [["#", "Vendedor", "Taxa", "Ganhas/Fechadas"]],
        body: dados.topConversao.map((v, i) => [
          i + 1, v.nome,
          `${v.taxaConversao.toFixed(1)}%`,
          `${v.oppGanhas}/${v.oppGanhas + v.oppPerdidas}`,
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.topAtividade.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["💬 Top atividade", "", ""]],
        body: [],
        styles: { fontSize: 11, fontStyle: "bold" }, theme: "plain",
      });
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY,
        head: [["#", "Vendedor", "Interações", "Tarefas conc."]],
        body: dados.topAtividade.map((v, i) => [
          i + 1, v.nome, fmtNum(v.interacoes), fmtNum(v.tarefasConcluidas),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.porVendedor.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Vendedor", "Role", "Vendas", "Faturamento", "Ticket", "Opp criadas", "Ganhas", "Conv.", "Pipeline", "Interações", "Tarefas (SLA)"]],
        body: dados.porVendedor.map(v => [
          v.nome, v.role,
          fmtNum(v.vendasQtd), fmtBRL(v.faturamento), fmtBRL(v.ticketMedio),
          fmtNum(v.oppCriadas), fmtNum(v.oppGanhas),
          `${v.taxaConversao.toFixed(1)}%`,
          fmtBRL(v.valorPipelineAberto),
          fmtNum(v.interacoes),
          `${v.tarefasConcluidas} (${v.slaTarefas.toFixed(0)}%)`,
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 7 },
      });
    }

    doc.save(`relatorio-performance-crm-${hoje()}.pdf`);
  }

  return (
    <BlocoRelatorio
      titulo="Relatório de Performance Comercial (CRM)" cor={C.accent}
      filtros={
        <>
          <CampoData label="De" value={dataInicio} onChange={setDataInicio} />
          <CampoData label="Até" value={dataFim} onChange={setDataFim} />
          <CampoSelectBusca label="Vendedor" opcoes={usuarios} value={responsavelId} onChange={setResponsavelId} placeholder="Todos" />
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Vendedores", valor: fmtNum(dados.resumo.totalVendedores), cor: C.accent },
            { rotulo: "Faturamento", valor: fmtBRL(dados.resumo.totalFaturamento), cor: C.green },
            { rotulo: "Vendas", valor: fmtNum(dados.resumo.totalVendas), cor: C.accent },
            { rotulo: "Opp ganhas", valor: fmtNum(dados.resumo.totalOppGanhas), cor: C.green },
            { rotulo: "Conversão", valor: `${dados.resumo.conversaoGeral.toFixed(1)}%`, cor: dados.resumo.conversaoGeral >= 30 ? C.green : C.yellow },
            { rotulo: "Ciclo médio", valor: `${dados.resumo.cicloMedioGeral.toFixed(1)}d`, cor: C.yellow },
            { rotulo: "Interações", valor: fmtNum(dados.resumo.totalInteracoes), cor: C.purple },
            { rotulo: "Tarefas conc.", valor: fmtNum(dados.resumo.totalTarefasConcluidas), cor: C.purple },
          ]} />

          {/* Pódio de Top performers */}
          <div style={{
            display: "grid", gap: 12, marginBottom: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          }}>
            <CardPodio titulo="🏆 Top Faturamento" cor={C.green} itens={dados.topFaturamento.map(v => ({
              nome: v.nome,
              valor: fmtBRL(v.faturamento),
              detalhe: `${fmtNum(v.vendasQtd)} venda${v.vendasQtd === 1 ? "" : "s"}`,
            }))} vazioTexto="Sem vendas no período" />
            <CardPodio titulo="🎯 Top Conversão" cor={C.purple} itens={dados.topConversao.map(v => ({
              nome: v.nome,
              valor: `${v.taxaConversao.toFixed(1)}%`,
              detalhe: `${v.oppGanhas}/${v.oppGanhas + v.oppPerdidas} fechadas`,
            }))} vazioTexto="Min. 3 oportunidades fechadas" />
            <CardPodio titulo="💬 Top Atividade" cor={C.yellow} itens={dados.topAtividade.map(v => ({
              nome: v.nome,
              valor: fmtNum(v.interacoes),
              detalhe: `${fmtNum(v.tarefasConcluidas)} tarefa${v.tarefasConcluidas === 1 ? "" : "s"}`,
            }))} vazioTexto="Sem interações registradas" />
          </div>

          <Tabela
            titulo={`Performance por vendedor (${dados.porVendedor.length})`}
            colunas={["Vendedor", "Role", "Vendas", "Faturamento", "Ticket", "Opp criadas", "Ganhas", "Conv.", "Pipeline", "Interações", "Tarefas (SLA)"]}
            alinhamentos={["left", "left", "right", "right", "right", "right", "right", "right", "right", "right", "right"]}
            linhas={dados.porVendedor.map(v => [
              v.nome, v.role,
              fmtNum(v.vendasQtd), fmtBRL(v.faturamento), fmtBRL(v.ticketMedio),
              fmtNum(v.oppCriadas), fmtNum(v.oppGanhas),
              `${v.taxaConversao.toFixed(1)}%`,
              fmtBRL(v.valorPipelineAberto),
              fmtNum(v.interacoes),
              `${v.tarefasConcluidas} (${v.slaTarefas.toFixed(0)}%)`,
            ])}
            vazioTexto="Nenhum vendedor ativo encontrado."
          />

          {dados.porVendedor.some(v => v.interacoes > 0) && (
            <Tabela
              titulo="Detalhamento de interações por tipo"
              colunas={["Vendedor", "Ligação", "WhatsApp", "E-mail", "Visita", "Reunião", "Anotação", "Total"]}
              alinhamentos={["left", "right", "right", "right", "right", "right", "right", "right"]}
              linhas={dados.porVendedor
                .filter(v => v.interacoes > 0)
                .map(v => [
                  v.nome,
                  fmtNum(v.interacoesLigacao),
                  fmtNum(v.interacoesWhatsapp),
                  fmtNum(v.interacoesEmail),
                  fmtNum(v.interacoesVisita),
                  fmtNum(v.interacoesReuniao),
                  fmtNum(v.interacoesAnotacao),
                  fmtNum(v.interacoes),
                ])}
            />
          )}
        </>
      )}
    </BlocoRelatorio>
  );
}

// ============ RELATÓRIO DE MOTIVOS DE PERDA (LOSS ANALYSIS) ============
function RelatorioPerdasCrm() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [origem, setOrigem] = useState("");
  const [buscaMotivo, setBuscaMotivo] = useState("");
  const [usuarios, setUsuarios] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarFuncionarios({ ativo: "true" }).then(setUsuarios).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioPerdasCrm({ dataInicio, dataFim, responsavelId, origem, buscaMotivo });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, responsavelId, origem, buscaMotivo]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Relatório de Motivos de Perda (CRM)");
    addPeriodo(doc, dataInicio, dataFim);

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Indicador", "Valor"]],
      body: [
        ["Oportunidades perdidas no período", fmtNum(dados.resumo.totalPerdidas)],
        ["Valor total perdido", fmtBRL(dados.resumo.valorPerdidoTotal)],
        ["Ticket médio perdido", fmtBRL(dados.resumo.ticketMedioPerdido)],
        ["Taxa de perda (vs ganhas)", `${dados.resumo.taxaPerda.toFixed(1)}%`],
        ["Ganhas no mesmo período", fmtNum(dados.resumo.totalGanhasNoMesmoPeriodo)],
        ["Com motivo preenchido", `${fmtNum(dados.resumo.comMotivo)} (${dados.resumo.totalPerdidas > 0 ? ((dados.resumo.comMotivo / dados.resumo.totalPerdidas) * 100).toFixed(0) : 0}%)`],
        ["Sem motivo registrado", fmtNum(dados.resumo.semMotivo)],
        ["Ciclo médio até a perda (dias)", dados.resumo.cicloMedioPerdaDias.toFixed(1)],
      ],
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    if (dados.porMotivo.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Motivo", "Qtd", "% perdas", "Valor perdido", "% valor"]],
        body: dados.porMotivo.map((m, i) => [
          i + 1, m.motivo,
          fmtNum(m.quantidade),
          `${m.percentualPerdas.toFixed(1)}%`,
          fmtBRL(m.valorPerdido),
          `${m.percentualValor.toFixed(1)}%`,
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.porResponsavel.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Vendedor", "Perdidas", "Valor perdido", "Ticket médio"]],
        body: dados.porResponsavel.map((v, i) => [
          i + 1, v.nome, fmtNum(v.quantidade), fmtBRL(v.valorPerdido), fmtBRL(v.ticketMedio),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.porOrigem.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Origem", "Qtd perdidas", "Valor perdido"]],
        body: dados.porOrigem.map(o => [o.origem, fmtNum(o.quantidade), fmtBRL(o.valorPerdido)]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.evolucaoMensal.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Mês", "Perdidas", "Valor perdido"]],
        body: dados.evolucaoMensal.map(e => [fmtMes(e.mes), fmtNum(e.quantidade), fmtBRL(e.valorPerdido)]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.topPerdas.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["💸 Top vazamentos (oportunidades de maior valor perdidas)", "", "", "", "", ""]],
        body: [],
        styles: { fontSize: 11, fontStyle: "bold" }, theme: "plain",
      });
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY,
        head: [["#", "Título", "Cliente", "Vendedor", "Motivo", "Valor"]],
        body: dados.topPerdas.map(o => [
          `#${o.numero}`, o.titulo, o.cliente || "—", o.responsavel || "—",
          o.motivoPerda || "(sem motivo)",
          fmtBRL(o.valorEstimado),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 8 },
      });
    }

    if (dados.oportunidades.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Título", "Cliente", "Vendedor", "Motivo", "Origem", "Valor", "Dias", "Perdida em"]],
        body: dados.oportunidades.map(o => [
          `#${o.numero}`, o.titulo, o.cliente || "—", o.responsavel || "—",
          o.motivoPerda || "(sem motivo)", o.origem || "—",
          fmtBRL(o.valorEstimado),
          fmtNum(o.diasNoFunil),
          fmtData(o.dataPerdida),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 7 },
      });
    }

    doc.save(`relatorio-perdas-crm-${hoje()}.pdf`);
  }

  // Helper pra heatmap: pega celula motivo+origem ou retorna 0.
  function celula(motivo, origem) {
    if (!dados?.cruzamentoMotivoOrigem?.celulas) return null;
    return dados.cruzamentoMotivoOrigem.celulas.find(
      c => c.motivo === motivo && c.origem === origem
    );
  }

  const maxCelulaValor = dados
    ? Math.max(0, ...(dados.cruzamentoMotivoOrigem?.celulas || []).map(c => c.valorPerdido))
    : 0;

  return (
    <BlocoRelatorio
      titulo="Relatório de Motivos de Perda (CRM)" cor={C.red}
      filtros={
        <>
          <CampoData label="Perdidas de" value={dataInicio} onChange={setDataInicio} />
          <CampoData label="Perdidas até" value={dataFim} onChange={setDataFim} />
          <CampoSelectBusca label="Responsável" opcoes={usuarios} value={responsavelId} onChange={setResponsavelId} placeholder="Todos" />
          <CampoSelect label="Origem" value={origem} onChange={setOrigem}>
            <option value="">Todas</option>
            {ORIGENS_FUNIL.map(o => <option key={o} value={o}>{o}</option>)}
          </CampoSelect>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 160 }}>
            <label style={labelStyle}>Buscar motivo</label>
            <input
              type="text" value={buscaMotivo}
              onChange={e => setBuscaMotivo(e.target.value)}
              placeholder="ex: preço, concorrente"
              style={inputStyle}
            />
          </div>
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Perdidas", valor: fmtNum(dados.resumo.totalPerdidas), cor: C.red },
            { rotulo: "Valor perdido", valor: fmtBRL(dados.resumo.valorPerdidoTotal), cor: C.red },
            { rotulo: "Ticket médio", valor: fmtBRL(dados.resumo.ticketMedioPerdido), cor: C.yellow },
            { rotulo: "Taxa de perda", valor: `${dados.resumo.taxaPerda.toFixed(1)}%`, cor: dados.resumo.taxaPerda <= 30 ? C.green : C.red },
            { rotulo: "Ganhas no período", valor: fmtNum(dados.resumo.totalGanhasNoMesmoPeriodo), cor: C.green },
            { rotulo: "Sem motivo", valor: fmtNum(dados.resumo.semMotivo), cor: dados.resumo.semMotivo > 0 ? C.yellow : C.muted },
            { rotulo: "Ciclo até perda", valor: `${dados.resumo.cicloMedioPerdaDias.toFixed(1)}d`, cor: C.purple },
          ]} />

          {dados.resumo.totalPerdidas === 0 && (
            <div style={{
              background: C.green + "11", border: `1px solid ${C.green}55`,
              borderRadius: 12, padding: 20, marginBottom: 16, textAlign: "center",
              color: C.green, fontSize: 14, fontWeight: 600,
            }}>
              🎉 Nenhuma oportunidade perdida no período selecionado.
            </div>
          )}

          {dados.porMotivo.length > 0 && (
            <div style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: 16, marginBottom: 16,
            }}>
              <div style={{ color: C.white, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                Top motivos por valor perdido
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dados.porMotivo.slice(0, 10).map((m, i) => {
                  const pct = dados.resumo.valorPerdidoTotal > 0
                    ? (m.valorPerdido / dados.resumo.valorPerdidoTotal) * 100
                    : 0;
                  return (
                    <div key={i}>
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        alignItems: "baseline", marginBottom: 3, gap: 8,
                      }}>
                        <div style={{ color: C.text, fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {i + 1}. {m.motivo}
                        </div>
                        <div style={{ color: C.muted, fontSize: 11, whiteSpace: "nowrap" }}>
                          {fmtNum(m.quantidade)} opp · <strong style={{ color: C.red }}>{fmtBRL(m.valorPerdido)}</strong>
                        </div>
                      </div>
                      <div style={{
                        position: "relative", height: 14, background: C.surface,
                        borderRadius: 4, overflow: "hidden",
                      }}>
                        <div style={{
                          width: `${pct}%`, height: "100%",
                          background: C.red, opacity: 0.6,
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {dados.cruzamentoMotivoOrigem &&
            dados.cruzamentoMotivoOrigem.motivos.length > 0 &&
            dados.cruzamentoMotivoOrigem.origens.length > 0 && (
            <div style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: 16, marginBottom: 16,
            }}>
              <div style={{ color: C.white, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                Cruzamento Motivo × Origem (heat-map)
              </div>
              <div style={{ color: C.muted, fontSize: 11, marginBottom: 12 }}>
                Intensidade da cor = valor perdido. Vazio = nenhuma perda nessa combinação.
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{
                        padding: "6px 10px", color: C.muted, fontSize: 10,
                        fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
                        borderBottom: `1px solid ${C.border}`, textAlign: "left",
                      }}>Motivo \ Origem</th>
                      {dados.cruzamentoMotivoOrigem.origens.map(og => (
                        <th key={og} style={{
                          padding: "6px 10px", color: C.muted, fontSize: 10,
                          fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
                          borderBottom: `1px solid ${C.border}`, textAlign: "center", minWidth: 70,
                        }}>{og}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.cruzamentoMotivoOrigem.motivos.map(motivo => (
                      <tr key={motivo}>
                        <td style={{
                          padding: "6px 10px", color: C.text, fontWeight: 600,
                          borderBottom: `1px solid ${C.border}55`,
                          whiteSpace: "nowrap", maxWidth: 200,
                          overflow: "hidden", textOverflow: "ellipsis",
                        }}>{motivo}</td>
                        {dados.cruzamentoMotivoOrigem.origens.map(og => {
                          const c = celula(motivo, og);
                          const intensidade = c && maxCelulaValor > 0
                            ? c.valorPerdido / maxCelulaValor
                            : 0;
                          return (
                            <td key={og} style={{
                              padding: "8px 6px", textAlign: "center",
                              background: c ? `rgba(239, 68, 68, ${0.1 + intensidade * 0.6})` : "transparent",
                              color: intensidade > 0.5 ? C.white : C.text,
                              borderBottom: `1px solid ${C.border}55`,
                              fontSize: 11, fontWeight: c ? 700 : 400,
                            }}>
                              {c ? (
                                <>
                                  <div>{fmtNum(c.quantidade)}</div>
                                  <div style={{ fontSize: 9, opacity: 0.8 }}>{fmtBRL(c.valorPerdido)}</div>
                                </>
                              ) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {dados.porResponsavel.length > 0 && (
            <Tabela
              titulo={`Perdas por vendedor (${dados.porResponsavel.length})`}
              colunas={["#", "Vendedor", "Perdidas", "Valor perdido", "Ticket médio"]}
              alinhamentos={["center", "left", "right", "right", "right"]}
              linhas={dados.porResponsavel.map((v, i) => [
                i + 1, v.nome,
                fmtNum(v.quantidade), fmtBRL(v.valorPerdido), fmtBRL(v.ticketMedio),
              ])}
            />
          )}

          {dados.porOrigem.length > 0 && (
            <Tabela
              titulo={`Perdas por origem (${dados.porOrigem.length})`}
              colunas={["Origem", "Qtd perdidas", "Valor perdido"]}
              alinhamentos={["left", "right", "right"]}
              linhas={dados.porOrigem.map(o => [o.origem, fmtNum(o.quantidade), fmtBRL(o.valorPerdido)])}
            />
          )}

          {dados.evolucaoMensal.length > 0 && (
            <Tabela
              titulo={`Evolução mensal (${dados.evolucaoMensal.length} ${dados.evolucaoMensal.length === 1 ? "mês" : "meses"})`}
              colunas={["Mês", "Perdidas", "Valor perdido"]}
              alinhamentos={["left", "right", "right"]}
              linhas={dados.evolucaoMensal.map(e => [fmtMes(e.mes), fmtNum(e.quantidade), fmtBRL(e.valorPerdido)])}
            />
          )}

          {dados.topPerdas.length > 0 && (
            <div style={{
              background: C.red + "11", border: `1px solid ${C.red}55`,
              borderRadius: 12, padding: 16, marginBottom: 16,
            }}>
              <div style={{ color: C.red, fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                💸 Top vazamentos — oportunidades de maior valor perdidas ({dados.topPerdas.length})
              </div>
              <div style={{ color: C.muted, fontSize: 11, marginBottom: 10 }}>
                Casos onde os maiores valores escaparam. Ideal para análise post-mortem.
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      {["#", "Título", "Cliente", "Vendedor", "Motivo", "Valor"].map((h, i) => (
                        <th key={i} style={{
                          padding: "8px 12px", textAlign: i === 5 ? "right" : "left",
                          color: C.muted, fontSize: 10, fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: 0.5,
                          borderBottom: `1px solid ${C.border}`,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.topPerdas.map(o => (
                      <tr key={o.id} style={{ borderBottom: `1px solid ${C.border}55` }}>
                        <td style={{ padding: "8px 12px", color: C.text }}>#{o.numero}</td>
                        <td style={{ padding: "8px 12px", color: C.text }}>{o.titulo}</td>
                        <td style={{ padding: "8px 12px", color: C.muted }}>{o.cliente || "—"}</td>
                        <td style={{ padding: "8px 12px", color: C.muted }}>{o.responsavel || "—"}</td>
                        <td style={{ padding: "8px 12px", color: C.muted }}>{o.motivoPerda || "(sem motivo)"}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: C.red, fontWeight: 700 }}>
                          {fmtBRL(o.valorEstimado)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Tabela
            titulo={`Detalhamento (${dados.oportunidades.length} oportunidade${dados.oportunidades.length === 1 ? "" : "s"} — até 200)`}
            colunas={["#", "Título", "Cliente", "Vendedor", "Motivo", "Origem", "Valor", "Dias", "Perdida em"]}
            alinhamentos={["center", "left", "left", "left", "left", "left", "right", "right", "left"]}
            linhas={dados.oportunidades.map(o => [
              `#${o.numero}`, o.titulo, o.cliente || "—", o.responsavel || "—",
              o.motivoPerda || "(sem motivo)", o.origem || "—",
              fmtBRL(o.valorEstimado),
              fmtNum(o.diasNoFunil),
              fmtData(o.dataPerdida),
            ])}
            vazioTexto="Nenhuma oportunidade perdida no período."
          />
        </>
      )}
    </BlocoRelatorio>
  );
}

// ============ RELATÓRIO DE FORECAST / PREVISÃO ============
function RelatorioForecastCrm() {
  const [mesesFuturos, setMesesFuturos] = useState("3");
  const [responsavelId, setResponsavelId] = useState("");
  const [origem, setOrigem] = useState("");
  const [usuarios, setUsuarios] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarFuncionarios({ ativo: "true" }).then(setUsuarios).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioForecastCrm({ mesesFuturos, responsavelId, origem });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [mesesFuturos, responsavelId, origem]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Relatório de Forecast / Previsão de Receita (CRM)");
    addLinha(doc, `Horizonte: próximos ${dados.resumo.horizonte} meses`);

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Indicador", "Valor"]],
      body: [
        ["Oportunidades previstas no horizonte", fmtNum(dados.resumo.totalPrevistoQtd)],
        ["Valor estimado total", fmtBRL(dados.resumo.totalValorEstimado)],
        ["Valor ponderado (previsão realista)", fmtBRL(dados.resumo.totalValorPonderado)],
        ["Já ganhas no horizonte", fmtNum(dados.resumo.totalGanhoQtd)],
        ["Valor já ganho", fmtBRL(dados.resumo.totalValorGanho)],
        ["Opp abertas SEM data prevista", fmtNum(dados.resumo.semDataPrevistaQtd)],
        ["Valor das opp sem data prevista", fmtBRL(dados.resumo.semDataPrevistaValor)],
      ],
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Mês", "Opp previstas", "Valor estimado", "Valor ponderado", "Ganhas", "Valor ganho"]],
      body: dados.porMes.map(m => [
        fmtMes(m.ym),
        fmtNum(m.previstoQtd),
        fmtBRL(m.valorEstimado),
        fmtBRL(m.valorPonderado),
        fmtNum(m.ganhoQtd),
        fmtBRL(m.valorGanho),
      ]),
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 9 },
    });

    if (dados.porVendedor.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Vendedor", "Opp", "Valor estimado", "Valor ponderado"]],
        body: dados.porVendedor.map((v, i) => [
          i + 1, v.nome, fmtNum(v.quantidade),
          fmtBRL(v.valorEstimado), fmtBRL(v.valorPonderado),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.porOrigem.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Origem", "Opp", "Valor estimado", "Valor ponderado"]],
        body: dados.porOrigem.map(o => [
          o.origem, fmtNum(o.quantidade),
          fmtBRL(o.valorEstimado), fmtBRL(o.valorPonderado),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.oportunidades.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Título", "Cliente", "Vendedor", "Etapa", "Prob.", "Valor", "Ponderado", "Previsão"]],
        body: dados.oportunidades.map(o => [
          `#${o.numero}`, o.titulo, o.cliente || "—", o.responsavel || "—",
          ROTULO_ETAPA[o.etapa] || o.etapa,
          `${o.probabilidade}%`,
          fmtBRL(o.valorEstimado),
          fmtBRL(o.valorPonderado),
          fmtData(o.dataFechamentoPrevista),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 8 },
      });
    }

    doc.save(`relatorio-forecast-crm-${hoje()}.pdf`);
  }

  const maxMes = dados ? Math.max(1, ...dados.porMes.map(m => m.valorEstimado)) : 1;

  return (
    <BlocoRelatorio
      titulo="Relatório de Forecast / Previsão de Receita (CRM)" cor={C.accent}
      filtros={
        <>
          <CampoSelect label="Horizonte" value={mesesFuturos} onChange={setMesesFuturos}>
            <option value="1">1 mês</option>
            <option value="3">3 meses</option>
            <option value="6">6 meses</option>
            <option value="12">12 meses</option>
          </CampoSelect>
          <CampoSelectBusca label="Responsável" opcoes={usuarios} value={responsavelId} onChange={setResponsavelId} placeholder="Todos" />
          <CampoSelect label="Origem" value={origem} onChange={setOrigem}>
            <option value="">Todas</option>
            {ORIGENS_FUNIL.map(o => <option key={o} value={o}>{o}</option>)}
          </CampoSelect>
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Opp no horizonte", valor: fmtNum(dados.resumo.totalPrevistoQtd), cor: C.accent },
            { rotulo: "Valor estimado", valor: fmtBRL(dados.resumo.totalValorEstimado), cor: C.purple },
            { rotulo: "Previsão realista", valor: fmtBRL(dados.resumo.totalValorPonderado), cor: C.green },
            { rotulo: "Já ganhas", valor: fmtNum(dados.resumo.totalGanhoQtd), cor: C.green },
            { rotulo: "Valor ganho", valor: fmtBRL(dados.resumo.totalValorGanho), cor: C.green },
            { rotulo: "Sem data prevista", valor: fmtNum(dados.resumo.semDataPrevistaQtd), cor: dados.resumo.semDataPrevistaQtd > 0 ? C.yellow : C.muted },
          ]} />

          {/* Forecast visual por mês */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: 16, marginBottom: 16,
          }}>
            <div style={{ color: C.white, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              Previsão por mês (estimado · ponderado · ganho)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {dados.porMes.map(m => {
                const pctEstimado = (m.valorEstimado / maxMes) * 100;
                const pctPonderado = (m.valorPonderado / maxMes) * 100;
                const pctGanho = (m.valorGanho / maxMes) * 100;
                return (
                  <div key={m.ym}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                      <div style={{ color: C.text, fontSize: 12, fontWeight: 700 }}>
                        {fmtMes(m.ym)} <span style={{ color: C.muted, fontWeight: 500 }}>· {fmtNum(m.previstoQtd)} prev.</span>
                      </div>
                      <div style={{ color: C.muted, fontSize: 11 }}>
                        Pond: <strong style={{ color: C.green }}>{fmtBRL(m.valorPonderado)}</strong> · Est: {fmtBRL(m.valorEstimado)} · Ganho: <strong style={{ color: C.green }}>{fmtBRL(m.valorGanho)}</strong>
                      </div>
                    </div>
                    <div style={{ position: "relative", height: 18, background: C.surface, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{
                        position: "absolute", left: 0, top: 0,
                        width: `${pctEstimado}%`, height: "100%",
                        background: C.purple, opacity: 0.3,
                      }} />
                      <div style={{
                        position: "absolute", left: 0, top: 0,
                        width: `${pctPonderado}%`, height: "100%",
                        background: C.green, opacity: 0.6,
                      }} />
                      <div style={{
                        position: "absolute", left: 0, top: 0,
                        width: `${pctGanho}%`, height: "100%",
                        background: C.green,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 11, color: C.muted, flexWrap: "wrap" }}>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: C.purple, opacity: 0.3, marginRight: 4, verticalAlign: "middle" }} /> Estimado</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: C.green, opacity: 0.6, marginRight: 4, verticalAlign: "middle" }} /> Ponderado (× probabilidade)</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: C.green, marginRight: 4, verticalAlign: "middle" }} /> Já ganho</span>
            </div>
          </div>

          <Tabela
            titulo={`Forecast por mês (${dados.porMes.length})`}
            colunas={["Mês", "Opp previstas", "Valor estimado", "Valor ponderado", "Ganhas", "Valor ganho"]}
            alinhamentos={["left", "right", "right", "right", "right", "right"]}
            linhas={dados.porMes.map(m => [
              fmtMes(m.ym),
              fmtNum(m.previstoQtd),
              fmtBRL(m.valorEstimado),
              fmtBRL(m.valorPonderado),
              fmtNum(m.ganhoQtd),
              fmtBRL(m.valorGanho),
            ])}
          />

          {dados.porVendedor.length > 0 && (
            <Tabela
              titulo={`Pipeline futuro por vendedor (${dados.porVendedor.length})`}
              colunas={["#", "Vendedor", "Opp", "Valor estimado", "Valor ponderado"]}
              alinhamentos={["center", "left", "right", "right", "right"]}
              linhas={dados.porVendedor.map((v, i) => [
                i + 1, v.nome, fmtNum(v.quantidade),
                fmtBRL(v.valorEstimado), fmtBRL(v.valorPonderado),
              ])}
            />
          )}

          {dados.porOrigem.length > 0 && (
            <Tabela
              titulo="Pipeline futuro por origem"
              colunas={["Origem", "Opp", "Valor estimado", "Valor ponderado"]}
              alinhamentos={["left", "right", "right", "right"]}
              linhas={dados.porOrigem.map(o => [
                o.origem, fmtNum(o.quantidade),
                fmtBRL(o.valorEstimado), fmtBRL(o.valorPonderado),
              ])}
            />
          )}

          {dados.semDataPrevista.length > 0 && (
            <div style={{
              background: C.yellow + "11", border: `1px solid ${C.yellow}55`,
              borderRadius: 12, padding: 16, marginBottom: 16,
            }}>
              <div style={{ color: C.yellow, fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                ⚠️ Oportunidades abertas SEM data de fechamento prevista ({dados.semDataPrevista.length})
              </div>
              <div style={{ color: C.muted, fontSize: 11, marginBottom: 10 }}>
                Estas não entram no forecast — preencha a data prevista pra incluir no pipeline.
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      {["#", "Título", "Cliente", "Vendedor", "Etapa", "Prob.", "Valor"].map((h, i) => (
                        <th key={i} style={{
                          padding: "8px 12px", textAlign: i >= 5 ? "right" : "left",
                          color: C.muted, fontSize: 10, fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: 0.5,
                          borderBottom: `1px solid ${C.border}`,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.semDataPrevista.map(o => (
                      <tr key={o.id} style={{ borderBottom: `1px solid ${C.border}55` }}>
                        <td style={{ padding: "8px 12px", color: C.text }}>#{o.numero}</td>
                        <td style={{ padding: "8px 12px", color: C.text }}>{o.titulo}</td>
                        <td style={{ padding: "8px 12px", color: C.muted }}>{o.cliente || "—"}</td>
                        <td style={{ padding: "8px 12px", color: C.muted }}>{o.responsavel || "—"}</td>
                        <td style={{ padding: "8px 12px", color: COR_ETAPA[o.etapa], fontWeight: 700 }}>
                          {ROTULO_ETAPA[o.etapa] || o.etapa}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: C.muted }}>{o.probabilidade}%</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: C.text }}>{fmtBRL(o.valorEstimado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Tabela
            titulo={`Detalhamento de oportunidades no forecast (${dados.oportunidades.length})`}
            colunas={["#", "Título", "Cliente", "Vendedor", "Etapa", "Prob.", "Valor", "Ponderado", "Previsão"]}
            alinhamentos={["center", "left", "left", "left", "left", "right", "right", "right", "left"]}
            linhas={dados.oportunidades.map(o => [
              `#${o.numero}`, o.titulo, o.cliente || "—", o.responsavel || "—",
              ROTULO_ETAPA[o.etapa] || o.etapa,
              `${o.probabilidade}%`,
              fmtBRL(o.valorEstimado),
              fmtBRL(o.valorPonderado),
              fmtData(o.dataFechamentoPrevista),
            ])}
            vazioTexto="Nenhuma oportunidade com data prevista no horizonte."
          />
        </>
      )}
    </BlocoRelatorio>
  );
}

// ============ RELATÓRIO DE ATIVIDADES & CADÊNCIA ============
const ROTULO_TIPO_INTERACAO = {
  LIGACAO: "📞 Ligação",
  WHATSAPP: "💬 WhatsApp",
  EMAIL: "📧 E-mail",
  VISITA: "🚪 Visita",
  REUNIAO: "🤝 Reunião",
  ANOTACAO: "📝 Anotação",
};

function RelatorioAtividadesCrm() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [userId, setUserId] = useState("");
  const [diasInativo, setDiasInativo] = useState("60");
  const [usuarios, setUsuarios] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarFuncionarios({ ativo: "true" }).then(setUsuarios).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioAtividadesCrm({ dataInicio, dataFim, userId, diasInativo });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, userId, diasInativo]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Relatório de Atividades & Cadência (CRM)");
    addPeriodo(doc, dataInicio, dataFim);

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Indicador", "Valor"]],
      body: [
        ["Total de interações", fmtNum(dados.resumo.totalInteracoes)],
        ["Média por dia útil", dados.resumo.mediaPorDiaUtil.toFixed(1)],
        ["Dias úteis no período", fmtNum(dados.resumo.diasUteis)],
        ["Clientes contactados (únicos)", fmtNum(dados.resumo.clientesContactados)],
        ["Base ativa", fmtNum(dados.resumo.baseAtiva)],
        ["Cobertura da carteira", `${dados.resumo.cobertura.toFixed(1)}%`],
        ["Tarefas concluídas", fmtNum(dados.resumo.totalTarefasConcluidas)],
        ["SLA geral de tarefas", `${dados.resumo.slaGeral.toFixed(1)}%`],
        ["Tarefas abertas atrasadas", fmtNum(dados.resumo.totalAtrasadas)],
        [`Clientes sem contato há ${dados.filtros.diasInativo}+ dias`, fmtNum(dados.resumo.clientesSemContato)],
      ],
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Tipo", "Quantidade"]],
      body: dados.porTipo.map(t => [
        ROTULO_TIPO_INTERACAO[t.tipo] || t.tipo,
        fmtNum(t.quantidade),
      ]),
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 9 },
    });

    if (dados.porVendedor.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Vendedor", "Total", "Clientes únicos", "Ligação", "WhatsApp", "E-mail", "Visita", "Reunião", "Tarefas (SLA)"]],
        body: dados.porVendedor.map((v, i) => [
          i + 1, v.nome,
          fmtNum(v.interacoes), fmtNum(v.clientesContactados),
          fmtNum(v.interacoesLigacao), fmtNum(v.interacoesWhatsapp),
          fmtNum(v.interacoesEmail), fmtNum(v.interacoesVisita),
          fmtNum(v.interacoesReuniao),
          `${v.tarefasConcluidas} (${v.slaTarefas.toFixed(0)}%)`,
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 8 },
      });
    }

    if (dados.clientesSemContato.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["🔔 Clientes sem contato — agir agora", "", "", "", ""]],
        body: [],
        styles: { fontSize: 11, fontStyle: "bold" }, theme: "plain",
      });
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY,
        head: [["Cliente", "Cidade", "Telefone", "Última interação", "Dias sem contato"]],
        body: dados.clientesSemContato.map(c => [
          c.nome, c.cidade || "—", c.telefone || "—",
          c.ultimaInteracao ? fmtData(c.ultimaInteracao) : "Nunca",
          fmtNum(c.diasSemContato),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.distribuicaoSemanal.some(d => d.quantidade > 0)) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Dia da semana", "Interações"]],
        body: dados.distribuicaoSemanal.map(d => [d.dia, fmtNum(d.quantidade)]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    doc.save(`relatorio-atividades-crm-${hoje()}.pdf`);
  }

  const maxPorTipo = dados ? Math.max(1, ...dados.porTipo.map(t => t.quantidade)) : 1;
  const maxSemana = dados ? Math.max(1, ...dados.distribuicaoSemanal.map(d => d.quantidade)) : 1;

  return (
    <BlocoRelatorio
      titulo="Relatório de Atividades & Cadência (CRM)" cor={C.purple}
      filtros={
        <>
          <CampoData label="De" value={dataInicio} onChange={setDataInicio} />
          <CampoData label="Até" value={dataFim} onChange={setDataFim} />
          <CampoSelectBusca label="Vendedor" opcoes={usuarios} value={userId} onChange={setUserId} placeholder="Todos" />
          <CampoSelect label="Dias sem contato" value={diasInativo} onChange={setDiasInativo}>
            <option value="30">30 dias</option>
            <option value="60">60 dias</option>
            <option value="90">90 dias</option>
            <option value="180">180 dias</option>
          </CampoSelect>
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Interações", valor: fmtNum(dados.resumo.totalInteracoes), cor: C.purple },
            { rotulo: "Média/dia útil", valor: dados.resumo.mediaPorDiaUtil.toFixed(1), cor: C.accent },
            { rotulo: "Clientes únicos", valor: fmtNum(dados.resumo.clientesContactados), cor: C.green },
            { rotulo: "Cobertura", valor: `${dados.resumo.cobertura.toFixed(1)}%`, cor: dados.resumo.cobertura >= 50 ? C.green : C.yellow },
            { rotulo: "Tarefas conc.", valor: fmtNum(dados.resumo.totalTarefasConcluidas), cor: C.accent },
            { rotulo: "SLA tarefas", valor: `${dados.resumo.slaGeral.toFixed(1)}%`, cor: dados.resumo.slaGeral >= 80 ? C.green : C.yellow },
            { rotulo: "Atrasadas abertas", valor: fmtNum(dados.resumo.totalAtrasadas), cor: dados.resumo.totalAtrasadas > 0 ? C.red : C.muted },
            { rotulo: "Sem contato", valor: fmtNum(dados.resumo.clientesSemContato), cor: dados.resumo.clientesSemContato > 0 ? C.yellow : C.muted },
          ]} />

          {/* Volume por tipo de interação */}
          {dados.porTipo.some(t => t.quantidade > 0) && (
            <div style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: 16, marginBottom: 16,
            }}>
              <div style={{ color: C.white, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                Volume por tipo de interação
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {dados.porTipo.map(t => {
                  const pct = (t.quantidade / maxPorTipo) * 100;
                  return (
                    <div key={t.tipo} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 130, color: C.text, fontSize: 12, fontWeight: 600 }}>
                        {ROTULO_TIPO_INTERACAO[t.tipo] || t.tipo}
                      </div>
                      <div style={{ flex: 1, position: "relative", height: 22, background: C.surface, borderRadius: 6, overflow: "hidden" }}>
                        <div style={{
                          width: `${pct}%`, height: "100%",
                          background: C.purple, opacity: 0.7,
                        }} />
                        <div style={{
                          position: "absolute", inset: 0,
                          display: "flex", alignItems: "center", padding: "0 10px",
                          color: C.white, fontSize: 11, fontWeight: 700,
                        }}>
                          {fmtNum(t.quantidade)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Distribuição por dia da semana */}
          {dados.distribuicaoSemanal.some(d => d.quantidade > 0) && (
            <div style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: 16, marginBottom: 16,
            }}>
              <div style={{ color: C.white, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                Distribuição por dia da semana
              </div>
              <div style={{ display: "flex", justifyContent: "space-around", alignItems: "flex-end", gap: 4, height: 120 }}>
                {dados.distribuicaoSemanal.map(d => {
                  const altura = (d.quantidade / maxSemana) * 100;
                  const ehFimSemana = d.indice === 0 || d.indice === 6;
                  return (
                    <div key={d.indice} style={{
                      flex: 1, display: "flex", flexDirection: "column",
                      alignItems: "center", gap: 4,
                    }}>
                      <div style={{ color: C.text, fontSize: 11, fontWeight: 700 }}>
                        {d.quantidade}
                      </div>
                      <div style={{
                        width: "70%",
                        height: `${altura}%`,
                        background: ehFimSemana ? C.muted : C.accent,
                        borderRadius: "4px 4px 0 0",
                        minHeight: 2,
                      }} />
                      <div style={{ color: C.muted, fontSize: 10, fontWeight: 600 }}>
                        {d.dia.slice(0, 3)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {dados.porVendedor.length > 0 && (
            <Tabela
              titulo={`Atividade por vendedor (${dados.porVendedor.length})`}
              colunas={["#", "Vendedor", "Total", "Clientes únicos", "Ligação", "WhatsApp", "E-mail", "Visita", "Reunião", "Tarefas (SLA)"]}
              alinhamentos={["center", "left", "right", "right", "right", "right", "right", "right", "right", "right"]}
              linhas={dados.porVendedor.map((v, i) => [
                i + 1, v.nome,
                fmtNum(v.interacoes), fmtNum(v.clientesContactados),
                fmtNum(v.interacoesLigacao), fmtNum(v.interacoesWhatsapp),
                fmtNum(v.interacoesEmail), fmtNum(v.interacoesVisita),
                fmtNum(v.interacoesReuniao),
                `${v.tarefasConcluidas} (${v.slaTarefas.toFixed(0)}%)`,
              ])}
              vazioTexto="Nenhuma atividade no período."
            />
          )}

          {dados.clientesSemContato.length > 0 && (
            <div style={{
              background: C.yellow + "11", border: `1px solid ${C.yellow}55`,
              borderRadius: 12, padding: 16, marginBottom: 16,
            }}>
              <div style={{ color: C.yellow, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                🔔 Clientes sem contato há {dados.filtros.diasInativo}+ dias — top {dados.clientesSemContato.length}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      {["Cliente", "Cidade", "Telefone", "E-mail", "Última interação", "Dias"].map((h, i) => (
                        <th key={i} style={{
                          padding: "8px 12px", textAlign: i === 5 ? "right" : "left",
                          color: C.muted, fontSize: 10, fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: 0.5,
                          borderBottom: `1px solid ${C.border}`,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.clientesSemContato.map(c => (
                      <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}55` }}>
                        <td style={{ padding: "8px 12px", color: C.text, whiteSpace: "nowrap" }}>{c.nome}</td>
                        <td style={{ padding: "8px 12px", color: C.muted }}>{c.cidade || "—"}</td>
                        <td style={{ padding: "8px 12px", color: C.muted }}>{c.telefone || "—"}</td>
                        <td style={{ padding: "8px 12px", color: C.muted }}>{c.email || "—"}</td>
                        <td style={{ padding: "8px 12px", color: C.muted }}>
                          {c.ultimaInteracao ? fmtData(c.ultimaInteracao) : "Nunca"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: C.red, fontWeight: 700 }}>
                          {fmtNum(c.diasSemContato)}d
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </BlocoRelatorio>
  );
}

// ============ RELATÓRIO DE NPS CONSOLIDADO ============
const FAIXA_NPS_INFO = {
  DETRATOR: { label: "Detratores", cor: C.red, icone: "😠", faixa: "0-6" },
  NEUTRO: { label: "Neutros", cor: C.yellow, icone: "😐", faixa: "7-8" },
  PROMOTOR: { label: "Promotores", cor: C.green, icone: "😍", faixa: "9-10" },
};

function corNps(score) {
  if (score >= 75) return C.green;
  if (score >= 50) return C.green;
  if (score >= 0) return C.yellow;
  return C.red;
}

function classificacaoNps(score) {
  if (score >= 75) return "Excelente";
  if (score >= 50) return "Muito bom";
  if (score >= 0) return "Razoável";
  return "Crítico";
}

function fmtMes(ym) {
  if (!ym) return "—";
  const [a, m] = ym.split("-");
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${meses[parseInt(m, 10) - 1]}/${a}`;
}

function RelatorioNpsCrm() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [userId, setUserId] = useState("");
  const [somenteRespondidas, setSomenteRespondidas] = useState("");
  const [usuarios, setUsuarios] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarFuncionarios({ ativo: "true" }).then(setUsuarios).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioNpsCrm({ dataInicio, dataFim, userId, somenteRespondidas });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, userId, somenteRespondidas]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Relatório de NPS & Satisfação (CRM)");
    addPeriodo(doc, dataInicio, dataFim);

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Indicador", "Valor"]],
      body: [
        ["NPS Score", `${dados.resumo.npsScore.toFixed(1)} (${classificacaoNps(dados.resumo.npsScore)})`],
        ["Pesquisas enviadas", fmtNum(dados.resumo.totalEnviadas)],
        ["Pesquisas respondidas", fmtNum(dados.resumo.respondidas)],
        ["Taxa de resposta", `${dados.resumo.taxaResposta.toFixed(1)}%`],
        ["Nota média", dados.resumo.notaMedia.toFixed(2)],
        ["Detratores (0-6)", fmtNum(dados.resumo.detratores)],
        ["Neutros (7-8)", fmtNum(dados.resumo.neutros)],
        ["Promotores (9-10)", fmtNum(dados.resumo.promotores)],
      ],
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Faixa", "Quantidade", "%"]],
      body: dados.distribuicao.map(d => [
        d.label, fmtNum(d.quantidade), `${d.percentual.toFixed(1)}%`,
      ]),
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 9 },
    });

    if (dados.porVendedor.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Vendedor", "Enviadas", "Respondidas", "Taxa resp.", "Nota méd.", "NPS"]],
        body: dados.porVendedor.map((v, i) => [
          i + 1, v.nome,
          fmtNum(v.enviadas), fmtNum(v.respondidas),
          `${v.taxaResposta.toFixed(1)}%`,
          v.notaMedia.toFixed(2),
          v.nps.toFixed(1),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.evolucaoMensal.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Mês", "Respondidas", "Nota média", "NPS"]],
        body: dados.evolucaoMensal.map(e => [
          fmtMes(e.mes), fmtNum(e.respondidas), e.notaMedia.toFixed(2), e.nps.toFixed(1),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.detratoresRecentes.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["🚨 Detratores recentes (últimos 30 dias) — PRIORIDADE DE CONTATO", "", "", "", ""]],
        body: [],
        styles: { fontSize: 11, fontStyle: "bold" }, theme: "plain",
      });
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY,
        head: [["Data", "Cliente", "Venda", "Vendedor", "Nota", "Comentário"]],
        body: dados.detratoresRecentes.map(d => [
          fmtData(d.respondidaEm),
          d.cliente || "—",
          d.venda ? `#${d.venda.numero}` : "—",
          d.vendedor || "—",
          d.nota,
          d.comentario || "(sem comentário)",
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 8 },
      });
    }

    doc.save(`relatorio-nps-crm-${hoje()}.pdf`);
  }

  return (
    <BlocoRelatorio
      titulo="Relatório de NPS & Satisfação (CRM)" cor={C.yellow}
      filtros={
        <>
          <CampoData label="De" value={dataInicio} onChange={setDataInicio} />
          <CampoData label="Até" value={dataFim} onChange={setDataFim} />
          <CampoSelectBusca label="Vendedor (da venda)" opcoes={usuarios} value={userId} onChange={setUserId} placeholder="Todos" />
          <CampoSelect label="Mostrar" value={somenteRespondidas} onChange={setSomenteRespondidas}>
            <option value="">Todas pesquisas</option>
            <option value="true">Só respondidas</option>
          </CampoSelect>
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          {/* Card grande do NPS Score */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: 20, marginBottom: 16,
            display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
          }}>
            <div style={{
              width: 140, height: 140, borderRadius: "50%",
              background: `radial-gradient(circle, ${corNps(dados.resumo.npsScore)}22 0%, transparent 70%)`,
              border: `3px solid ${corNps(dados.resumo.npsScore)}`,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ color: corNps(dados.resumo.npsScore), fontSize: 36, fontWeight: 800, lineHeight: 1 }}>
                {dados.resumo.npsScore.toFixed(0)}
              </div>
              <div style={{ color: C.muted, fontSize: 10, marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                NPS Score
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ color: corNps(dados.resumo.npsScore), fontSize: 22, fontWeight: 800 }}>
                {classificacaoNps(dados.resumo.npsScore)}
              </div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>
                {fmtNum(dados.resumo.respondidas)} respostas de {fmtNum(dados.resumo.totalEnviadas)} pesquisas
                ({dados.resumo.taxaResposta.toFixed(1)}% de taxa de resposta).<br />
                Nota média: <strong style={{ color: C.text }}>{dados.resumo.notaMedia.toFixed(2)}</strong> · Detratores: <strong style={{ color: C.red }}>{dados.resumo.detratores}</strong> · Promotores: <strong style={{ color: C.green }}>{dados.resumo.promotores}</strong>
              </div>
            </div>
          </div>

          {/* Barra horizontal de distribuição */}
          {dados.resumo.respondidas > 0 && (
            <div style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: 16, marginBottom: 16,
            }}>
              <div style={{ color: C.white, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                Distribuição das respostas
              </div>
              <div style={{ display: "flex", height: 32, borderRadius: 8, overflow: "hidden" }}>
                {dados.distribuicao.map(d => {
                  const info = FAIXA_NPS_INFO[d.faixa];
                  if (d.quantidade === 0) return null;
                  return (
                    <div key={d.faixa} style={{
                      width: `${d.percentual}%`, background: info.cor,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: C.white, fontSize: 11, fontWeight: 700,
                    }}>
                      {d.percentual >= 8 ? `${info.icone} ${d.percentual.toFixed(0)}%` : ""}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-around", marginTop: 10, flexWrap: "wrap", gap: 8 }}>
                {dados.distribuicao.map(d => {
                  const info = FAIXA_NPS_INFO[d.faixa];
                  return (
                    <div key={d.faixa} style={{ textAlign: "center", minWidth: 120 }}>
                      <div style={{ color: info.cor, fontSize: 18, fontWeight: 800 }}>
                        {info.icone} {fmtNum(d.quantidade)}
                      </div>
                      <div style={{ color: C.muted, fontSize: 11 }}>
                        {info.label} ({info.faixa}) · {d.percentual.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {dados.detratoresRecentes.length > 0 && (
            <div style={{
              background: C.red + "11", border: `1px solid ${C.red}55`,
              borderRadius: 12, padding: 16, marginBottom: 16,
            }}>
              <div style={{ color: C.red, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
                🚨 Detratores recentes — prioridade de contato ({dados.detratoresRecentes.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dados.detratoresRecentes.map(d => (
                  <div key={d.id} style={{
                    background: C.card, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "10px 12px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>
                        {d.cliente || "Cliente sem cadastro"}
                        {d.venda && <span style={{ color: C.muted, fontWeight: 500 }}> · Venda #{d.venda.numero}</span>}
                      </div>
                      <div style={{ color: C.red, fontSize: 16, fontWeight: 800 }}>
                        Nota {d.nota}/10
                      </div>
                    </div>
                    <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                      {fmtData(d.respondidaEm)} · vendedor: {d.vendedor || "—"}
                    </div>
                    {d.comentario && (
                      <div style={{
                        color: C.text, fontSize: 12, marginTop: 6,
                        padding: "8px 10px", background: C.surface, borderRadius: 6,
                        borderLeft: `3px solid ${C.red}`,
                      }}>
                        “{d.comentario}”
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {dados.porVendedor.length > 0 && (
            <Tabela
              titulo={`NPS por vendedor (${dados.porVendedor.length})`}
              colunas={["#", "Vendedor", "Enviadas", "Respondidas", "Taxa resp.", "Nota média", "NPS"]}
              alinhamentos={["center", "left", "right", "right", "right", "right", "right"]}
              linhas={dados.porVendedor.map((v, i) => [
                i + 1, v.nome,
                fmtNum(v.enviadas), fmtNum(v.respondidas),
                `${v.taxaResposta.toFixed(1)}%`,
                v.notaMedia.toFixed(2),
                <span key={v.id} style={{ color: corNps(v.nps), fontWeight: 700 }}>{v.nps.toFixed(1)}</span>,
              ])}
            />
          )}

          {dados.evolucaoMensal.length > 0 && (
            <Tabela
              titulo={`Evolução mensal (${dados.evolucaoMensal.length} ${dados.evolucaoMensal.length === 1 ? "mês" : "meses"})`}
              colunas={["Mês", "Respondidas", "Nota média", "NPS"]}
              alinhamentos={["left", "right", "right", "right"]}
              linhas={dados.evolucaoMensal.map(e => [
                fmtMes(e.mes),
                fmtNum(e.respondidas),
                e.notaMedia.toFixed(2),
                <span key={e.mes} style={{ color: corNps(e.nps), fontWeight: 700 }}>{e.nps.toFixed(1)}</span>,
              ])}
            />
          )}

          <Tabela
            titulo={`Pesquisas (${dados.pesquisas.length})`}
            colunas={["Data", "Cliente", "Venda", "Vendedor", "Nota", "Faixa", "Comentário"]}
            alinhamentos={["left", "left", "left", "left", "right", "left", "left"]}
            linhas={dados.pesquisas.map(p => [
              fmtData(p.respondidaEm || p.createdAt),
              p.cliente || "—",
              p.venda ? `#${p.venda.numero}` : "—",
              p.vendedor || "—",
              p.nota !== null && p.nota !== undefined ? p.nota : "—",
              p.faixa ? (FAIXA_NPS_INFO[p.faixa]?.label || p.faixa) : "Sem resposta",
              p.comentario || "—",
            ])}
            vazioTexto="Nenhuma pesquisa no período."
          />
        </>
      )}
    </BlocoRelatorio>
  );
}

// ============ RELATÓRIO DE CARTEIRA DE CLIENTES (RFM) ============
const SEGMENTOS_INFO = {
  VIP: { label: "VIP", cor: C.yellow, icone: "👑" },
  RECORRENTE: { label: "Recorrente", cor: C.green, icone: "🔄" },
  NOVO: { label: "Novo", cor: C.accent, icone: "🌟" },
  EM_RISCO: { label: "Em risco", cor: C.yellow, icone: "⚠️" },
  INATIVO: { label: "Inativo", cor: C.muted, icone: "💤" },
  PROSPECT: { label: "Prospect", cor: C.purple, icone: "🌱" },
};

const STATUS_FUNIL_INFO = {
  LEAD: "Lead",
  CLIENTE_ATIVO: "Cliente ativo",
  CLIENTE_INATIVO: "Cliente inativo",
  PERDIDO: "Perdido",
};

function RelatorioCarteiraCrm() {
  const [janelaDias, setJanelaDias] = useState("365");
  const [segmento, setSegmento] = useState("");
  const [tagId, setTagId] = useState("");
  const [statusFunil, setStatusFunil] = useState("");
  const [tags, setTags] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarTags().then(setTags).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioCarteiraCrm({ janelaDias, segmento, tagId, statusFunil });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [janelaDias, segmento, tagId, statusFunil]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Relatório de Carteira de Clientes (RFM)");
    addLinha(doc, `Janela RFM: últimos ${dados.filtros.janelaDias} dias`);

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Indicador", "Valor"]],
      body: [
        ["Total de clientes ativos", fmtNum(dados.resumo.totalClientes)],
        ["Clientes com compra na janela", fmtNum(dados.resumo.clientesComCompra)],
        ["Taxa de retenção", `${dados.resumo.taxaRetencao.toFixed(1)}%`],
        ["Churn rate", `${dados.resumo.churnRate.toFixed(1)}%`],
        ["LTV médio", fmtBRL(dados.resumo.ltvMedio)],
        ["Ticket médio (cliente)", fmtBRL(dados.resumo.ticketMedio)],
        ["Frequência média", `${dados.resumo.frequenciaMedia.toFixed(1)} compras/cliente`],
        ["Recência média", `${dados.resumo.recenciaMedia.toFixed(0)} dias`],
        ["Faturamento total (janela)", fmtBRL(dados.resumo.faturamentoTotal)],
      ],
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });

    tabelaPDF(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Segmento", "Clientes", "% base", "Faturamento", "% fat.", "Ticket médio"]],
      body: dados.porSegmento.map(s => [
        SEGMENTOS_INFO[s.segmento]?.label || s.segmento,
        fmtNum(s.quantidade),
        `${s.percentualBase.toFixed(1)}%`,
        fmtBRL(s.monetario),
        `${s.percentualFaturamento.toFixed(1)}%`,
        fmtBRL(s.ticketMedio),
      ]),
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 9 },
    });

    if (dados.porCidade.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Cidade", "UF", "Clientes", "Faturamento"]],
        body: dados.porCidade.map((c, i) => [
          i + 1, c.cidade, c.estado, fmtNum(c.quantidade), fmtBRL(c.monetario),
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.porTag.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Tag", "Clientes", "Faturamento"]],
        body: dados.porTag.map(t => [t.nome, fmtNum(t.quantidade), fmtBRL(t.monetario)]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 9 },
      });
    }

    if (dados.topLtv.length) {
      tabelaPDF(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Cliente", "Cidade", "Compras", "Total gasto", "Ticket médio", "Última compra", "Segmento"]],
        body: dados.topLtv.map((c, i) => [
          i + 1, c.nome, c.cidade || "—",
          fmtNum(c.qtdCompras), fmtBRL(c.totalGasto), fmtBRL(c.ticketMedio),
          fmtData(c.ultimaCompra), SEGMENTOS_INFO[c.segmento]?.label || c.segmento,
        ]),
        theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
        styles: { fontSize: 8 },
      });
    }

    doc.save(`relatorio-carteira-crm-${hoje()}.pdf`);
  }

  return (
    <BlocoRelatorio
      titulo="Relatório de Carteira de Clientes (RFM)" cor={C.green}
      filtros={
        <>
          <CampoSelect label="Janela RFM" value={janelaDias} onChange={setJanelaDias}>
            <option value="90">90 dias</option>
            <option value="180">180 dias</option>
            <option value="365">365 dias</option>
            <option value="730">2 anos</option>
          </CampoSelect>
          <CampoSelect label="Segmento" value={segmento} onChange={setSegmento}>
            <option value="">Todos</option>
            {Object.entries(SEGMENTOS_INFO).map(([k, v]) =>
              <option key={k} value={k}>{v.icone} {v.label}</option>
            )}
          </CampoSelect>
          <CampoSelectBusca label="Tag" opcoes={tags} value={tagId} onChange={setTagId} placeholder="Todas" />
          <CampoSelect label="Status no funil" value={statusFunil} onChange={setStatusFunil}>
            <option value="">Todos</option>
            {Object.entries(STATUS_FUNIL_INFO).map(([k, v]) =>
              <option key={k} value={k}>{v}</option>
            )}
          </CampoSelect>
        </>
      }
      onGerar={gerar} onExportar={exportar} carregando={carregando}
      erro={erro} dados={dados}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Clientes ativos", valor: fmtNum(dados.resumo.totalClientes), cor: C.accent },
            { rotulo: "Com compra", valor: fmtNum(dados.resumo.clientesComCompra), cor: C.green },
            { rotulo: "Retenção", valor: `${dados.resumo.taxaRetencao.toFixed(1)}%`, cor: dados.resumo.taxaRetencao >= 50 ? C.green : C.yellow },
            { rotulo: "Churn", valor: `${dados.resumo.churnRate.toFixed(1)}%`, cor: dados.resumo.churnRate <= 20 ? C.green : C.red },
            { rotulo: "LTV médio", valor: fmtBRL(dados.resumo.ltvMedio), cor: C.yellow },
            { rotulo: "Ticket médio", valor: fmtBRL(dados.resumo.ticketMedio), cor: C.purple },
            { rotulo: "Frequência média", valor: dados.resumo.frequenciaMedia.toFixed(1), cor: C.accent },
            { rotulo: "Faturamento", valor: fmtBRL(dados.resumo.faturamentoTotal), cor: C.green },
          ]} />

          {/* Distribuição visual por segmento */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: 16, marginBottom: 16,
          }}>
            <div style={{ color: C.white, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
              Distribuição por segmento
            </div>
            <div style={{
              display: "grid", gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}>
              {dados.porSegmento.map(s => {
                const info = SEGMENTOS_INFO[s.segmento];
                return (
                  <div key={s.segmento} style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 10, padding: 12, position: "relative", overflow: "hidden",
                  }}>
                    <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: info.cor }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 18 }}>{info.icone}</span>
                      <span style={{ color: info.cor, fontSize: 12, fontWeight: 700 }}>{info.label}</span>
                    </div>
                    <div style={{ color: C.white, fontSize: 18, fontWeight: 800 }}>
                      {fmtNum(s.quantidade)} <span style={{ color: C.muted, fontSize: 10, fontWeight: 500 }}>clientes</span>
                    </div>
                    <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>
                      {fmtBRL(s.monetario)} · {s.percentualBase.toFixed(1)}% base
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {dados.porCidade.length > 0 && (
            <Tabela
              titulo={`Top cidades (${dados.porCidade.length})`}
              colunas={["#", "Cidade", "UF", "Clientes", "Faturamento"]}
              alinhamentos={["center", "left", "center", "right", "right"]}
              linhas={dados.porCidade.map((c, i) => [
                i + 1, c.cidade, c.estado, fmtNum(c.quantidade), fmtBRL(c.monetario),
              ])}
            />
          )}

          {dados.porTag.length > 0 && (
            <Tabela
              titulo={`Cobertura por tag (${dados.porTag.length})`}
              colunas={["Tag", "Clientes", "Faturamento"]}
              alinhamentos={["left", "right", "right"]}
              linhas={dados.porTag.map(t => [
                <span key={t.id} style={{
                  display: "inline-block", padding: "2px 8px", borderRadius: 12,
                  background: t.cor + "33", color: t.cor, fontWeight: 700, fontSize: 11,
                }}>{t.nome}</span>,
                fmtNum(t.quantidade),
                fmtBRL(t.monetario),
              ])}
            />
          )}

          {dados.topLtv.length > 0 && (
            <Tabela
              titulo={`Top 20 LTV (clientes mais valiosos)`}
              colunas={["#", "Cliente", "Cidade", "Compras", "Total gasto", "Ticket médio", "Última compra", "Segmento"]}
              alinhamentos={["center", "left", "left", "right", "right", "right", "left", "left"]}
              linhas={dados.topLtv.map((c, i) => [
                i + 1, c.nome, c.cidade || "—",
                fmtNum(c.qtdCompras), fmtBRL(c.totalGasto), fmtBRL(c.ticketMedio),
                fmtData(c.ultimaCompra),
                SEGMENTOS_INFO[c.segmento]?.label || c.segmento,
              ])}
            />
          )}

          <Tabela
            titulo={`Detalhamento ${segmento ? `(segmento: ${SEGMENTOS_INFO[segmento]?.label})` : ""} — ${dados.clientes.length} cliente${dados.clientes.length === 1 ? "" : "s"}`}
            colunas={["Cliente", "Cidade", "Compras", "Total gasto", "Última compra", "Recência", "Segmento", "Status"]}
            alinhamentos={["left", "left", "right", "right", "left", "right", "left", "left"]}
            linhas={dados.clientes.map(c => [
              c.nome, c.cidade || "—",
              fmtNum(c.qtdCompras), fmtBRL(c.totalGasto),
              fmtData(c.ultimaCompra),
              c.recenciaDias !== null ? `${c.recenciaDias}d` : "—",
              SEGMENTOS_INFO[c.segmento]?.label || c.segmento,
              STATUS_FUNIL_INFO[c.statusFunil] || c.statusFunil,
            ])}
            vazioTexto="Nenhum cliente encontrado com os filtros."
          />
        </>
      )}
    </BlocoRelatorio>
  );
}

// Card pódio (top 3 em estilo medalha). Itens: { nome, valor, detalhe }
