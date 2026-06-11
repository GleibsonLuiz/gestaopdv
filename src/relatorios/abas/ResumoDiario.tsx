// Resumo do Dia (fechamento diario) — Fase 6 CRM/gestao.
// Visao de dono em uma tela: vendas do dia com comparativos (ontem e mesmo
// dia da semana passada), quebra por forma de pagamento e por vendedor, top
// produtos, caixas do dia e financeiro (recebido/pago/a vencer). Tudo em uma
// chamada (GET /relatorios/resumo-diario) + export PDF pronto para arquivar
// ou mandar no WhatsApp do socio.
import { useState } from "react";
import { C } from "../../lib/theme";
import { api } from "../../lib/api";
import { fmtBRL, fmtNum, hoje } from "../comum";
import { COR_HEADER_PDF, pdfAlinhaNumeros, tabelaPDF, criarPDF, addLinha } from "../pdf";
import { BlocoRelatorio, Resumo, Tabela, CampoData } from "../ui";

const fmtPctComp = (v: unknown): string => {
  const n = Number(v);
  if (v === null || v === undefined || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`.replace(".", ",");
};

const fmtHora = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";

const corVariacao = (v: unknown): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return C.muted;
  return n > 0 ? C.green : n < 0 ? C.red : C.muted;
};

export function RelatorioResumoDiario() {
  const [data, setData] = useState(hoje());
  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function gerar() {
    setCarregando(true);
    setErro("");
    try {
      setDados(await api.relatorioResumoDiario({ data }));
    } catch (err) {
      setErro((err as Error).message);
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Resumo do Dia");
    const diaLabel = new Date(data + "T12:00:00").toLocaleDateString("pt-BR");
    addLinha(doc, `Dia: ${diaLabel}`);

    const r = dados.resumo;
    tabelaPDF(doc, {
      startY: (doc as any).lastAutoTable.finalY + 5,
      head: [["Vendas", "Faturamento", "Ticket médio", "Descontos", "Canceladas", "vs. ontem", "vs. semana passada"]],
      body: [[
        fmtNum(r.quantidade), fmtBRL(r.total), fmtBRL(r.ticketMedio),
        fmtBRL(r.descontoTotal), fmtNum(r.canceladas),
        fmtPctComp(dados.comparativo?.ontem?.variacaoPct),
        fmtPctComp(dados.comparativo?.semanaPassada?.variacaoPct),
      ]],
      headStyles: { fillColor: COR_HEADER_PDF, fontSize: 8 },
      styles: { fontSize: 9 },
      didParseCell: pdfAlinhaNumeros,
    });

    const blocos: Array<[string, string[], (string | number)[][]]> = [
      ["Por forma de pagamento", ["Forma", "Pagamentos", "Total"],
        (dados.porForma || []).map((f: any) => [f.nome, fmtNum(f.quantidade), fmtBRL(f.total)])],
      ["Por vendedor", ["Vendedor", "Vendas", "Ticket médio", "Total"],
        (dados.porVendedor || []).map((v: any) => [v.nome, fmtNum(v.quantidade), fmtBRL(v.ticketMedio), fmtBRL(v.total)])],
      ["Top produtos do dia", ["Produto", "Qtd", "Receita"],
        (dados.topProdutos || []).map((p: any) => [p.nome, `${fmtNum(p.quantidade)} ${p.unidade || ""}`.trim(), fmtBRL(p.total)])],
      ["Caixas do dia", ["Nº", "Operador", "Status", "Abertura", "Saldo inicial", "Sangrias", "Suprimentos", "Diferença"],
        (dados.caixas || []).map((c: any) => [
          `#${c.numero}`, c.operador, c.status === "ABERTO" ? "Aberto" : "Fechado", fmtHora(c.abertoEm),
          fmtBRL(c.saldoInicial), fmtBRL(c.sangrias), fmtBRL(c.suprimentos),
          c.diferenca != null ? fmtBRL(c.diferenca) : "—",
        ])],
      ["Financeiro do dia", ["Movimento", "Qtd", "Total"], [
        ["Recebido hoje", fmtNum(dados.financeiro?.recebido?.quantidade), fmtBRL(dados.financeiro?.recebido?.total)],
        ["Pago hoje", fmtNum(dados.financeiro?.pago?.quantidade), fmtBRL(dados.financeiro?.pago?.total)],
        ["A receber vencendo hoje", fmtNum(dados.financeiro?.aVencerReceber?.quantidade), fmtBRL(dados.financeiro?.aVencerReceber?.total)],
        ["A pagar vencendo hoje", fmtNum(dados.financeiro?.aVencerPagar?.quantidade), fmtBRL(dados.financeiro?.aVencerPagar?.total)],
      ]],
    ];
    for (const [titulo, head, body] of blocos) {
      if (body.length === 0) continue;
      addLinha(doc, titulo);
      tabelaPDF(doc, {
        startY: (doc as any).lastAutoTable.finalY + 2,
        head: [head],
        body,
        headStyles: { fillColor: COR_HEADER_PDF, fontSize: 8 },
        styles: { fontSize: 9 },
        didParseCell: pdfAlinhaNumeros,
      });
    }
    doc.save(`resumo-diario-${data}.pdf`);
  }

  return (
    <BlocoRelatorio
      titulo="Resumo do Dia"
      cor={C.accent}
      carregando={carregando}
      erro={erro}
      dados={dados}
      onGerar={gerar}
      onExportar={exportar}
      filtros={<CampoData label="Dia" value={data} onChange={setData} />}
    >
      {dados && (
        <>
          <Resumo cards={[
            { rotulo: "Vendas", valor: fmtNum(dados.resumo.quantidade), cor: C.accent },
            { rotulo: "Faturamento", valor: fmtBRL(dados.resumo.total), cor: C.green },
            { rotulo: "Ticket médio", valor: fmtBRL(dados.resumo.ticketMedio), cor: C.purple },
            { rotulo: "Descontos", valor: fmtBRL(dados.resumo.descontoTotal), cor: C.yellow },
            { rotulo: "vs. ontem", valor: fmtPctComp(dados.comparativo?.ontem?.variacaoPct), cor: corVariacao(dados.comparativo?.ontem?.variacaoPct) },
            { rotulo: "vs. semana passada", valor: fmtPctComp(dados.comparativo?.semanaPassada?.variacaoPct), cor: corVariacao(dados.comparativo?.semanaPassada?.variacaoPct) },
          ]} />

          <Tabela
            titulo="Por forma de pagamento"
            colunas={["Forma", "Pagamentos", "Total"]}
            alinhamentos={["left", "right", "right"]}
            linhas={(dados.porForma || []).map((f: any) => [f.nome, fmtNum(f.quantidade), fmtBRL(f.total)])}
            vazioTexto="Nenhuma venda no dia."
          />

          <Tabela
            titulo="Por vendedor"
            colunas={["Vendedor", "Vendas", "Ticket médio", "Total"]}
            alinhamentos={["left", "right", "right", "right"]}
            linhas={(dados.porVendedor || []).map((v: any) => [v.nome, fmtNum(v.quantidade), fmtBRL(v.ticketMedio), fmtBRL(v.total)])}
            vazioTexto="Nenhuma venda no dia."
          />

          <Tabela
            titulo="Top produtos do dia"
            colunas={["Produto", "Qtd", "Receita"]}
            alinhamentos={["left", "right", "right"]}
            linhas={(dados.topProdutos || []).map((p: any) => [p.nome, `${fmtNum(p.quantidade)} ${p.unidade || ""}`.trim(), fmtBRL(p.total)])}
            vazioTexto="Nenhum produto vendido no dia."
          />

          <Tabela
            titulo="Caixas do dia"
            colunas={["Nº", "Operador", "Status", "Abertura", "Fechamento", "Saldo inicial", "Sangrias", "Suprimentos", "Diferença"]}
            alinhamentos={["left", "left", "left", "right", "right", "right", "right", "right", "right"]}
            linhas={(dados.caixas || []).map((c: any) => [
              `#${c.numero}`, c.operador, c.status === "ABERTO" ? "🟢 Aberto" : "🔒 Fechado",
              fmtHora(c.abertoEm), fmtHora(c.fechadoEm),
              fmtBRL(c.saldoInicial), fmtBRL(c.sangrias), fmtBRL(c.suprimentos),
              c.diferenca != null ? fmtBRL(c.diferenca) : "—",
            ])}
            vazioTexto="Nenhum caixa movimentado no dia."
          />

          <Tabela
            titulo="Financeiro do dia"
            colunas={["Movimento", "Qtd", "Total"]}
            alinhamentos={["left", "right", "right"]}
            linhas={[
              ["📥 Recebido hoje", fmtNum(dados.financeiro?.recebido?.quantidade), fmtBRL(dados.financeiro?.recebido?.total)],
              ["📤 Pago hoje", fmtNum(dados.financeiro?.pago?.quantidade), fmtBRL(dados.financeiro?.pago?.total)],
              ["⏳ A receber vencendo hoje", fmtNum(dados.financeiro?.aVencerReceber?.quantidade), fmtBRL(dados.financeiro?.aVencerReceber?.total)],
              ["⚠️ A pagar vencendo hoje", fmtNum(dados.financeiro?.aVencerPagar?.quantidade), fmtBRL(dados.financeiro?.aVencerPagar?.total)],
            ]}
          />
        </>
      )}
    </BlocoRelatorio>
  );
}
