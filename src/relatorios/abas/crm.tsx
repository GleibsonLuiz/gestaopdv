// @ts-nocheck — extraido verbatim de Relatorios.tsx; tipagem fina em etapa propria.
// Abas CRM (fatiamento Fase 5): Funil, Performance, Perdas, Forecast,
// Atividades & Cadencia, NPS e Carteira — com graficos SVG, podios e
// constantes de etapa/origem do funil.
import { useCallback, useEffect, useState } from "react";
import { C } from "../../lib/theme";
import { api } from "../../lib/api";
import { fmtBRL, fmtNum, fmtData, fmtDataHora, fmtPct, hoje } from "../comum";
import {
  COR_HEADER_PDF, pdfAlinhaNumeros, tabelaPDF, criarPDF, addPeriodo, addLinha,
} from "../pdf";
import {
  BlocoRelatorio, Resumo, Tabela, CampoData, CampoSelect, CampoSelectBusca, CardPodio, labelStyle, inputStyle,
} from "../ui";

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


export function RelatorioFunilCrm() {
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
export function RelatorioPerformanceCrm() {
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
export function RelatorioPerdasCrm() {
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
export function RelatorioForecastCrm() {
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

export function RelatorioAtividadesCrm() {
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

export function RelatorioNpsCrm() {
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

export function RelatorioCarteiraCrm() {
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
