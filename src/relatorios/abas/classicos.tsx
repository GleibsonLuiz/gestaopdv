// @ts-nocheck — extraido verbatim de Relatorios.tsx; tipagem fina em etapa propria.
// Abas classicas dos Relatorios (extraidas verbatim de Relatorios.tsx,
// fatiamento Fase 5): Vendas, Compras, Financeiro, Estoque, Fabricantes,
// Caixas (DRE) e Lucratividade.
import { useCallback, useEffect, useState } from "react";
import { C } from "../../lib/theme";
import { api } from "../../lib/api";
import {
  fmtBRL, fmtNum, fmtData, fmtDataHora, fmtPct,
  ROTULO_PAGAMENTO, ROTULO_STATUS, hoje,
} from "../comum";
import {
  COR_HEADER_PDF, pdfAlinhaNumeros, tabelaPDF, criarPDF, addPeriodo, addLinha,
} from "../pdf";
import {
  BlocoRelatorio, Resumo, Tabela, CampoData, CampoSelect, CampoSelectBusca,
} from "../ui";

export function RelatorioVendas() {
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
export function RelatorioCompras() {
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
export function RelatorioFinanceiro() {
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
export function RelatorioEstoque() {
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
export function RelatorioProdutosFabricante() {
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
export function RelatorioCaixas() {
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
export function RelatorioLucratividade() {
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
