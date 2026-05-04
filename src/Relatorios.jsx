import { useCallback, useEffect, useState } from "react";
import { C } from "./lib/theme.js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { api } from "./lib/api.js";


const fmtBRL = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtNum = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR");
};

const fmtData = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
const fmtDataHora = (iso) => iso ? new Date(iso).toLocaleString("pt-BR") : "—";

const ROTULO_PAGAMENTO = {
  DINHEIRO: "Dinheiro",
  CARTAO_CREDITO: "Cartão crédito",
  CARTAO_DEBITO: "Cartão débito",
  PIX: "Pix",
  BOLETO: "Boleto",
  CREDIARIO: "Crediário",
};

const ROTULO_STATUS = {
  PENDENTE: "Pendente", PAGA: "Paga",
  ATRASADA: "Atrasada", CANCELADA: "Cancelada",
};

const ABAS = [
  { id: "vendas", label: "🛒 Vendas", cor: C.accent },
  { id: "compras", label: "🛍️ Compras", cor: C.yellow },
  { id: "financeiro", label: "💰 Financeiro", cor: C.green },
  { id: "estoque", label: "📦 Estoque", cor: C.purple },
  { id: "caixas", label: "💵 Caixas (DRE)", cor: C.red },
];

export default function Relatorios() {
  const [aba, setAba] = useState("vendas");

  return (
    <div>
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
      {aba === "caixas" && <RelatorioCaixas key="x" />}
    </div>
  );
}

// ============ RELATÓRIO DE VENDAS ============
function RelatorioVendas() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
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
      const r = await api.relatorioVendas({ dataInicio, dataFim, formaPagamento, userId });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, formaPagamento, userId]);

  function exportar() {
    if (!dados) return;
    const doc = criarPDF("Relatório de Vendas");
    addPeriodo(doc, dataInicio, dataFim);

    let y = doc.lastAutoTable?.finalY || 50;
    autoTable(doc, {
      startY: y,
      head: [["Indicador", "Valor"]],
      body: [
        ["Total de vendas", fmtNum(dados.resumo.totalVendas)],
        ["Faturamento", fmtBRL(dados.resumo.faturamento)],
        ["Ticket médio", fmtBRL(dados.resumo.ticketMedio)],
        ["Descontos concedidos", fmtBRL(dados.resumo.descontoTotal)],
      ],
      theme: "striped", headStyles: { fillColor: [79, 142, 247] },
      styles: { fontSize: 10 },
    });

    if (dados.formasPagamento.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Forma de pagamento", "Vendas", "Total"]],
        body: dados.formasPagamento.map(f => [
          ROTULO_PAGAMENTO[f.formaPagamento] || f.formaPagamento,
          fmtNum(f.quantidade),
          fmtBRL(f.total),
        ]),
        theme: "striped", headStyles: { fillColor: [79, 142, 247] },
        styles: { fontSize: 10 },
      });
    }

    if (dados.topProdutos.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Produto", "Código", "Qtd.", "Total"]],
        body: dados.topProdutos.map((t, i) => [
          i + 1,
          t.produto?.nome || "—",
          t.produto?.codigo || "—",
          `${fmtNum(t.quantidade)} ${t.produto?.unidade || ""}`,
          fmtBRL(t.total),
        ]),
        theme: "striped", headStyles: { fillColor: [79, 142, 247] },
        styles: { fontSize: 9 },
      });
    }

    if (dados.vendas.length) {
      autoTable(doc, {
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
        theme: "striped", headStyles: { fillColor: [79, 142, 247] },
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
          <CampoSelect label="Vendedor" value={userId} onChange={setUserId}>
            <option value="">Todos</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </CampoSelect>
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

  function exportar() {
    if (!dados) return;
    const doc = criarPDF("Relatório de Compras");
    addPeriodo(doc, dataInicio, dataFim);

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Indicador", "Valor"]],
      body: [
        ["Total de compras", fmtNum(dados.resumo.totalCompras)],
        ["Valor total", fmtBRL(dados.resumo.valorTotal)],
        ["Ticket médio", fmtBRL(dados.resumo.ticketMedio)],
      ],
      theme: "striped", headStyles: { fillColor: [245, 158, 11] },
      styles: { fontSize: 10 },
    });

    if (dados.topFornecedores.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Fornecedor", "Compras", "Total"]],
        body: dados.topFornecedores.map((t, i) => [
          i + 1,
          t.fornecedor?.nome || "—",
          fmtNum(t.quantidade),
          fmtBRL(t.total),
        ]),
        theme: "striped", headStyles: { fillColor: [245, 158, 11] },
        styles: { fontSize: 9 },
      });
    }

    if (dados.compras.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["#", "Data", "Fornecedor", "Itens", "Total"]],
        body: dados.compras.map(c => [
          c.numero,
          fmtDataHora(c.createdAt),
          c.fornecedor || "—",
          c.qtdItens,
          fmtBRL(c.total),
        ]),
        theme: "striped", headStyles: { fillColor: [245, 158, 11] },
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
          <CampoSelect label="Fornecedor" value={fornecedorId} onChange={setFornecedorId}>
            <option value="">Todos</option>
            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </CampoSelect>
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
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioFinanceiro({ dataInicio, dataFim, tipo });
      setDados(r);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, tipo]);

  function exportar() {
    if (!dados) return;
    const doc = criarPDF("Relatório Financeiro");
    addPeriodo(doc, dataInicio, dataFim);

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 4,
      head: [["Status", "Contas a pagar — Qtd", "Total", "Contas a receber — Qtd", "Total"]],
      body: ["PENDENTE", "ATRASADA", "PAGA", "CANCELADA"].map(s => [
        ROTULO_STATUS[s],
        fmtNum(dados.resumo.pagar[s].qtd),
        fmtBRL(dados.resumo.pagar[s].total),
        fmtNum(dados.resumo.receber[s].qtd),
        fmtBRL(dados.resumo.receber[s].total),
      ]),
      theme: "striped", headStyles: { fillColor: [34, 197, 94] },
      styles: { fontSize: 9 },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Indicador", "Valor"]],
      body: [
        ["Saldo previsto (a receber - a pagar pendentes)", fmtBRL(dados.resumo.saldoPrevisto)],
        ["Fluxo de caixa realizado (recebido - pago)", fmtBRL(dados.resumo.fluxoCaixaRealizado)],
      ],
      theme: "striped", headStyles: { fillColor: [34, 197, 94] },
      styles: { fontSize: 10 },
    });

    if (dados.contasPagar.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Contas a pagar", "", "", "", ""]],
        body: [],
        styles: { fontSize: 11, fontStyle: "bold" },
        theme: "plain",
      });
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY,
        head: [["Descrição", "Fornecedor", "Vencimento", "Status", "Valor"]],
        body: dados.contasPagar.map(c => [
          c.descricao, c.fornecedor || "—",
          fmtData(c.vencimento), ROTULO_STATUS[c.status], fmtBRL(c.valor),
        ]),
        theme: "striped", headStyles: { fillColor: [239, 68, 68] },
        styles: { fontSize: 9 },
      });
    }

    if (dados.contasReceber.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 6,
        head: [["Contas a receber", "", "", "", ""]],
        body: [],
        styles: { fontSize: 11, fontStyle: "bold" },
        theme: "plain",
      });
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY,
        head: [["Descrição", "Cliente", "Vencimento", "Status", "Valor"]],
        body: dados.contasReceber.map(c => [
          c.descricao, c.cliente || "—",
          fmtData(c.vencimento), ROTULO_STATUS[c.status], fmtBRL(c.valor),
        ]),
        theme: "striped", headStyles: { fillColor: [34, 197, 94] },
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
          <CampoSelect label="Tipo" value={tipo} onChange={setTipo}>
            <option value="">Ambos</option>
            <option value="pagar">Apenas a pagar</option>
            <option value="receber">Apenas a receber</option>
          </CampoSelect>
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
              titulo={`Contas a pagar (${dados.contasPagar.length})`}
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
              titulo={`Contas a receber (${dados.contasReceber.length})`}
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

  function exportar() {
    if (!dados) return;
    const doc = criarPDF("Relatório de Estoque");
    addLinha(doc, `Gerado em ${fmtDataHora(dados.geradoEm)}`);

    autoTable(doc, {
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
      theme: "striped", headStyles: { fillColor: [124, 58, 237] },
      styles: { fontSize: 10 },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Código", "Produto", "Categoria", "Estoque", "Mín.", "Custo", "Venda", "Total venda"]],
      body: dados.produtos.map(p => [
        p.codigo, p.nome, p.categoria || "—",
        `${p.estoque} ${p.unidade}`, p.estoqueMinimo,
        p.precoCusto != null ? fmtBRL(p.precoCusto) : "—",
        fmtBRL(p.precoVenda),
        fmtBRL(p.valorEmEstoqueVenda),
      ]),
      theme: "striped", headStyles: { fillColor: [124, 58, 237] },
      styles: { fontSize: 8 },
    });

    doc.save(`relatorio-estoque-${hoje()}.pdf`);
  }

  return (
    <BlocoRelatorio
      titulo="Relatório de Estoque" cor={C.purple}
      filtros={
        <>
          <CampoSelect label="Categoria" value={categoriaId} onChange={setCategoriaId}>
            <option value="">Todas</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </CampoSelect>
          <CampoSelect label="Fornecedor" value={fornecedorId} onChange={setFornecedorId}>
            <option value="">Todos</option>
            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </CampoSelect>
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

  function exportar() {
    if (!dados) return;
    const doc = criarPDF("Relatório de Caixas — DRE Diário");
    addPeriodo(doc, dataInicio, dataFim);
    addLinha(doc, `Gerado em ${fmtDataHora(dados.geradoEm)}`);

    autoTable(doc, {
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
      theme: "striped", headStyles: { fillColor: [239, 68, 68] },
      styles: { fontSize: 10 },
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Dia", "Caixas", "Vendas", "Entradas", "Saídas", "Quebras", "Sobras"]],
      body: dados.dre.map(d => [
        fmtData(d.data + "T12:00:00"),
        d.caixas, d.vendas,
        fmtBRL(d.entradas), fmtBRL(d.saidas),
        fmtBRL(d.quebras), fmtBRL(d.sobras),
      ]),
      theme: "striped", headStyles: { fillColor: [239, 68, 68] },
      styles: { fontSize: 9 },
    });

    autoTable(doc, {
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
      theme: "striped", headStyles: { fillColor: [239, 68, 68] },
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

// ============ COMPONENTES AUXILIARES ============

function BlocoRelatorio({ titulo, cor, filtros, onGerar, onExportar, carregando, erro, dados, children }) {
  return (
    <div>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: 16, marginBottom: 16,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ color: C.white, fontSize: 14, fontWeight: 700 }}>{titulo}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onGerar} disabled={carregando} style={{
              background: cor, color: C.white, border: "none", borderRadius: 8,
              padding: "8px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer",
              opacity: carregando ? 0.6 : 1,
            }}>{carregando ? "Gerando..." : "🔍 Gerar"}</button>
            <button onClick={onExportar} disabled={!dados || carregando} style={{
              background: dados ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : C.surface,
              color: dados ? C.white : C.muted, border: dados ? "none" : `1px solid ${C.border}`,
              borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 12,
              cursor: dados ? "pointer" : "default", opacity: !dados ? 0.5 : 1,
            }}>📄 Exportar PDF</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {filtros}
        </div>
      </div>

      {erro && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, marginBottom: 12,
          background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red, fontSize: 13,
        }}>{erro}</div>
      )}

      {!dados && !carregando && !erro && (
        <div style={{
          background: C.card, border: `1px dashed ${C.border}`, borderRadius: 12,
          padding: 40, textAlign: "center", color: C.muted, fontSize: 13,
        }}>
          Defina os filtros e clique em <strong style={{ color: C.text }}>Gerar</strong> para visualizar o relatório.
        </div>
      )}

      {children}
    </div>
  );
}

function Resumo({ cards }) {
  return (
    <div style={{
      display: "grid", gap: 10, marginBottom: 16,
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    }}>
      {cards.map((c, i) => (
        <div key={i} style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: "12px 14px", position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: c.cor }} />
          <div style={{ color: C.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {c.rotulo}
          </div>
          <div style={{ color: c.cor, fontSize: 18, fontWeight: 800, marginTop: 4, lineHeight: 1.1 }}>
            {c.valor}
          </div>
        </div>
      ))}
    </div>
  );
}

function Tabela({ titulo, colunas, alinhamentos, linhas, vazioTexto }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 12, marginBottom: 16, overflow: "hidden",
    }}>
      {titulo && (
        <div style={{
          padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
          color: C.white, fontSize: 13, fontWeight: 700,
        }}>{titulo}</div>
      )}
      {linhas.length === 0 ? (
        <div style={{ padding: 24, color: C.muted, fontSize: 12, textAlign: "center" }}>
          {vazioTexto || "Sem dados."}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.surface }}>
                {colunas.map((c, i) => (
                  <th key={i} style={{
                    padding: "8px 12px", textAlign: alinhamentos?.[i] || "left",
                    color: C.muted, fontSize: 10, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: 0.5,
                    borderBottom: `1px solid ${C.border}`,
                  }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}55` }}>
                  {linha.map((celula, j) => (
                    <td key={j} style={{
                      padding: "8px 12px", textAlign: alinhamentos?.[j] || "left",
                      color: C.text, fontSize: 12, whiteSpace: "nowrap",
                    }}>{celula}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CampoData({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <label style={labelStyle}>{label}</label>
      <input type="date" value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}

function CampoSelect({ label, value, onChange, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 160 }}>
      <label style={labelStyle}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
        {children}
      </select>
    </div>
  );
}

const labelStyle = {
  color: C.muted, fontSize: 10, fontWeight: 700,
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4,
};

const inputStyle = {
  background: C.surface, border: `1px solid ${C.border}`,
  borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 12,
  outline: "none", minWidth: 140,
};

// ============ helpers PDF ============

function criarPDF(titulo) {
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("GestãoPRO", 14, 16);
  doc.setFontSize(13);
  doc.setFont("helvetica", "normal");
  doc.text(titulo, 14, 24);
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 30);
  doc.setTextColor(0, 0, 0);
  doc.lastAutoTable = { finalY: 34 };
  return doc;
}

function addPeriodo(doc, di, df) {
  if (!di && !df) return;
  const partes = [];
  if (di) partes.push(`de ${new Date(di + "T00:00:00").toLocaleDateString("pt-BR")}`);
  if (df) partes.push(`até ${new Date(df + "T00:00:00").toLocaleDateString("pt-BR")}`);
  addLinha(doc, "Período: " + partes.join(" "));
}

function addLinha(doc, texto) {
  const y = (doc.lastAutoTable?.finalY || 30) + 4;
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(texto, 14, y);
  doc.setTextColor(0, 0, 0);
  doc.lastAutoTable = { finalY: y };
}

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
