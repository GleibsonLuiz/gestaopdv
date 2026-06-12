// Abas analiticas (fatiamento Fase 5): Curva ABC, Giro & Capital,
// Sazonalidade (heatmap) e Aging de Recebiveis — com badges/distribuicoes —
// e o relatorio de Comissoes.
import { useCallback, useEffect, useState } from "react";
import { C } from "../../lib/theme";
import { api } from "../../lib/api";
import { fmtBRL, fmtNum, fmtData, fmtDataHora, fmtPct, ROTULO_PAGAMENTO, hoje } from "../comum";
import {
  COR_HEADER_PDF, pdfAlinhaNumeros, tabelaPDF, criarPDF, addPeriodo, addLinha,
} from "../pdf";
import {
  BlocoRelatorio, Resumo, Tabela, CampoData, CampoSelect, CampoSelectBusca,
} from "../ui";

const ABC_COR = { A: C.green, B: C.yellow, C: C.muted };
const ABC_DESC = {
  A: "Itens vitais — concentram o resultado",
  B: "Importância intermediária",
  C: "Cauda longa — pouca contribuição",
};
const CRITERIO_LABEL = { receita: "Receita", lucro: "Lucro", quantidade: "Quantidade" };

export function RelatorioCurvaAbc() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [criterio, setCriterio] = useState("receita");
  const [categorias, setCategorias] = useState<any[]>([]);
  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarCategorias().then((d: any) => setCategorias(d)).catch(() => {});
  }, []);

  // Formata o valor do criterio escolhido: moeda para receita/lucro, numero
  // para quantidade.
  const fmtCrit = (v) => (criterio === "quantidade" ? fmtNum(v) : fmtBRL(v));

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioCurvaAbc({ dataInicio, dataFim, categoriaId, criterio });
      setDados(r);
    } catch (err) { setErro((err as Error).message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, categoriaId, criterio]);

  async function exportar() {
    if (!dados) return;
    const critLabel = CRITERIO_LABEL[dados.resumo.criterio] || "Receita";
    const doc = await criarPDF(`Curva ABC — por ${critLabel}`);
    addPeriodo(doc, dataInicio, dataFim);

    tabelaPDF(doc, {
      startY: (doc as any).lastAutoTable.finalY + 4,
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
        startY: (doc as any).lastAutoTable.finalY + 6,
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

export function RelatorioGiroEstoque() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [categorias, setCategorias] = useState<any[]>([]);
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarCategorias().then((d: any) => setCategorias(d)).catch(() => {});
    api.listarFornecedores({ ativo: "true" }).then((d: any) => setFornecedores(d)).catch(() => {});
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
    } catch (err) { setErro((err as Error).message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, categoriaId, fornecedorId]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Giro de Estoque & Capital Parado");
    addPeriodo(doc, dados.filtros.dataInicio?.slice(0, 10), dados.filtros.dataFim?.slice(0, 10));

    tabelaPDF(doc, {
      startY: (doc as any).lastAutoTable.finalY + 4,
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
        startY: (doc as any).lastAutoTable.finalY + 6,
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

export function RelatorioSazonalidade() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [metrica, setMetrica] = useState("faturamento"); // faturamento | vendas
  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  const valorCel = (cel) => (metrica === "vendas" ? cel.vendas : cel.faturamento);
  const fmtMetrica = (v) => (metrica === "vendas" ? fmtNum(v) : fmtBRL(v));

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioSazonalidade({ dataInicio, dataFim });
      setDados(r);
    } catch (err) { setErro((err as Error).message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Sazonalidade de Vendas");
    addPeriodo(doc, dados.filtros.dataInicio?.slice(0, 10), dados.filtros.dataFim?.slice(0, 10));

    tabelaPDF(doc, {
      startY: (doc as any).lastAutoTable.finalY + 4,
      head: [["Dia da semana", "Vendas", "Faturamento"]],
      body: dados.porDia.map((d, i) => [DIAS_SEMANA[i], fmtNum(d.vendas), fmtBRL(d.faturamento)]),
      theme: "striped", headStyles: { fillColor: COR_HEADER_PDF, textColor: 255, fontStyle: "bold" }, didParseCell: pdfAlinhaNumeros,
      styles: { fontSize: 10 },
    });
    tabelaPDF(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
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

export function RelatorioAgingReceber() {
  const [clienteId, setClienteId] = useState("");
  const [clientes, setClientes] = useState<any[]>([]);
  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarClientes({ ativo: "true" }).then((d: any) => setClientes(d)).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioAgingReceber({ clienteId });
      setDados(r);
    } catch (err) { setErro((err as Error).message); }
    finally { setCarregando(false); }
  }, [clienteId]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Aging de Recebíveis");

    tabelaPDF(doc, {
      startY: (doc as any).lastAutoTable.finalY + 4,
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
        startY: (doc as any).lastAutoTable.finalY + 6,
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
export function RelatorioComissoesLista() {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [userId, setUserId] = useState("");
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.listarFuncionarios({ ativo: "true" }).then((d: any) => setUsuarios(d)).catch(() => {});
  }, []);

  const gerar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await api.relatorioComissoes({ dataInicio, dataFim, userId });
      setDados(r);
    } catch (err) { setErro((err as Error).message); }
    finally { setCarregando(false); }
  }, [dataInicio, dataFim, userId]);

  async function exportar() {
    if (!dados) return;
    const doc = await criarPDF("Relatório de Comissões");
    addPeriodo(doc, dataInicio, dataFim);

    tabelaPDF(doc, {
      startY: (doc as any).lastAutoTable.finalY + 4,
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
        startY: (doc as any).lastAutoTable.finalY + 6,
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
        startY: (doc as any).lastAutoTable.finalY + 6,
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
