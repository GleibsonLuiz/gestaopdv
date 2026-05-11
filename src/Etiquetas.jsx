import { useEffect, useMemo, useState } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";
import EtiquetaPreco from "./components/EtiquetaPreco.jsx";

// Pagina de impressao de etiquetas em lote.
// Fluxo:
//   1. Carrega produtos + categorias.
//   2. Usuario filtra por categoria/busca e marca os itens desejados,
//      definindo a quantidade de etiquetas por produto.
//   3. Botao Imprimir aciona window.print(); o CSS @media print (injetado)
//      isola a area de impressao e define @page 60x40mm.
//
// Servicos sao excluidos — etiqueta fisica nao faz sentido para servico.
export default function Etiquetas() {
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [busca, setBusca] = useState("");
  const [selecao, setSelecao] = useState({}); // { [id]: qtd }
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro("");
    Promise.all([api.listarProdutos({}), api.listarCategorias()])
      .then(([prods, cats]) => {
        if (cancelado) return;
        setProdutos((prods || []).filter(p => p.tipoItem !== "SERVICO" && p.ativo));
        setCategorias(cats || []);
      })
      .catch((e) => !cancelado && setErro(e?.message || "Erro ao carregar dados"))
      .finally(() => !cancelado && setCarregando(false));
    return () => { cancelado = true; };
  }, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (filtroCategoria && String(p.categoriaId) !== String(filtroCategoria)) return false;
      if (!termo) return true;
      const alvo = [p.nome, p.codigo, p.codigoBarras, p.referencia]
        .filter(Boolean).join(" ").toLowerCase();
      return alvo.includes(termo);
    });
  }, [produtos, filtroCategoria, busca]);

  const totalEtiquetas = useMemo(
    () => Object.values(selecao).reduce((a, b) => a + (Number(b) || 0), 0),
    [selecao]
  );

  const produtosSelecionados = useMemo(
    () => produtos.filter(p => Number(selecao[p.id]) > 0),
    [produtos, selecao]
  );

  function alternarSelecao(p) {
    setSelecao((s) => {
      const next = { ...s };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = 1;
      return next;
    });
  }

  function atualizarQtd(id, valor) {
    const n = Math.max(0, Math.min(100, Number(valor) || 0));
    setSelecao((s) => {
      const next = { ...s };
      if (n === 0) delete next[id];
      else next[id] = n;
      return next;
    });
  }

  function selecionarVisiveis() {
    setSelecao((s) => {
      const next = { ...s };
      for (const p of filtrados) if (!next[p.id]) next[p.id] = 1;
      return next;
    });
  }

  function limparSelecao() {
    setSelecao({});
  }

  function imprimir() {
    if (totalEtiquetas === 0) return;
    window.print();
  }

  const labelStyle = { fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 6 };
  const inputStyle = {
    background: C.surface, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: 8,
    padding: "8px 10px", fontSize: 14, width: "100%",
  };

  return (
    <>
      <style>{cssLoteImpressao}</style>

      <div className="etiquetas-tela">
        {/* Filtros */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 16,
        }}>
          <div>
            <div style={labelStyle}>Categoria</div>
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              style={inputStyle}
            >
              <option value="">Todas categorias</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Buscar</div>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, código, referência..."
              style={inputStyle}
            />
          </div>
        </div>

        {/* Acoes */}
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          marginBottom: 12,
        }}>
          <button
            type="button"
            onClick={selecionarVisiveis}
            disabled={filtrados.length === 0}
            style={botaoSecundario}
          >
            Selecionar visíveis
          </button>
          <button
            type="button"
            onClick={limparSelecao}
            disabled={totalEtiquetas === 0}
            style={botaoSecundario}
          >
            Limpar seleção
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 13, color: C.muted }}>
            {totalEtiquetas > 0 ? (
              <>
                <span style={{ color: C.white, fontWeight: 700 }}>{totalEtiquetas}</span>
                {" etiquetas • "}
                <span style={{ color: C.white, fontWeight: 700 }}>{produtosSelecionados.length}</span>
                {" produtos"}
              </>
            ) : "Nenhuma etiqueta selecionada"}
          </div>
          <button
            type="button"
            onClick={imprimir}
            disabled={totalEtiquetas === 0}
            style={{
              ...botaoPrimario,
              opacity: totalEtiquetas === 0 ? 0.5 : 1,
              cursor: totalEtiquetas === 0 ? "not-allowed" : "pointer",
            }}
          >
            🖨️ Imprimir ({totalEtiquetas})
          </button>
        </div>

        {erro && (
          <div style={{
            background: C.red + "22", color: C.red,
            border: `1px solid ${C.red}55`, borderRadius: 8,
            padding: "8px 12px", fontSize: 13, marginBottom: 12,
          }}>{erro}</div>
        )}

        {/* Lista de produtos */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 12, overflow: "hidden",
        }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "40px 90px 1fr 110px 130px 110px",
            gap: 10,
            padding: "10px 14px",
            background: C.surface,
            borderBottom: `1px solid ${C.border}`,
            fontSize: 11, fontWeight: 700, color: C.muted,
            textTransform: "uppercase", letterSpacing: 0.4,
          }}>
            <div></div>
            <div>Código</div>
            <div>Nome</div>
            <div>Referência</div>
            <div>Cód. Barras</div>
            <div style={{ textAlign: "right" }}>Cópias</div>
          </div>

          {carregando && (
            <div style={{ padding: 20, textAlign: "center", color: C.muted, fontSize: 13 }}>
              Carregando produtos...
            </div>
          )}

          {!carregando && filtrados.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: C.muted, fontSize: 13 }}>
              Nenhum produto encontrado com os filtros atuais.
            </div>
          )}

          {!carregando && filtrados.map((p) => {
            const qtd = Number(selecao[p.id]) || 0;
            const selecionado = qtd > 0;
            return (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 90px 1fr 110px 130px 110px",
                  gap: 10,
                  padding: "10px 14px",
                  borderBottom: `1px solid ${C.border}`,
                  alignItems: "center",
                  background: selecionado ? C.accent + "11" : "transparent",
                  cursor: "pointer",
                  fontSize: 13,
                }}
                onClick={() => alternarSelecao(p)}
              >
                <div>
                  <input
                    type="checkbox"
                    checked={selecionado}
                    onChange={() => alternarSelecao(p)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: 16, height: 16, cursor: "pointer", accentColor: C.accent }}
                  />
                </div>
                <div style={{ color: C.muted, fontFamily: "monospace" }}>{p.codigo}</div>
                <div style={{ color: C.text, fontWeight: 600 }}>{p.nome}</div>
                <div style={{ color: C.muted, fontSize: 12 }}>{p.referencia || "—"}</div>
                <div style={{ color: C.muted, fontSize: 12, fontFamily: "monospace" }}>
                  {p.codigoBarras || "—"}
                </div>
                <div style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={qtd || ""}
                    onChange={(e) => atualizarQtd(p.id, e.target.value)}
                    placeholder="0"
                    style={{
                      width: 70,
                      background: C.surface, color: C.text,
                      border: `1px solid ${C.border}`, borderRadius: 6,
                      padding: "5px 8px", fontSize: 13, textAlign: "center",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Area de impressao: oculta em tela, visivel apenas no @media print */}
      <div className="etiqueta-area-impressao" aria-hidden="true">
        {produtosSelecionados.flatMap((p) => {
          const qtd = Number(selecao[p.id]) || 0;
          return Array.from({ length: qtd }, (_, i) => (
            <EtiquetaPreco
              key={`${p.id}-${i}`}
              nomeProduto={p.nome}
              precoVenda={p.precoVenda}
              codigoBarras={p.codigoBarras || p.codigo}
              referencia={p.referencia}
              codigo={p.codigo}
            />
          ));
        })}
      </div>
    </>
  );
}

const botaoPrimario = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: C.white,
  border: "none", borderRadius: 8,
  padding: "10px 18px", fontSize: 13, fontWeight: 700,
  cursor: "pointer",
};

const botaoSecundario = {
  background: C.surface, color: C.text,
  border: `1px solid ${C.border}`, borderRadius: 8,
  padding: "8px 14px", fontSize: 12, fontWeight: 600,
  cursor: "pointer",
};

// CSS de impressao em lote: A4 com grid de 3 colunas de 60mm.
// O navegador quebra para a proxima pagina automaticamente quando enche
// a folha; page-break-inside:avoid garante que nenhuma etiqueta seja
// cortada no meio entre paginas.
const cssLoteImpressao = `
.etiqueta-area-impressao { display: none; }

@media print {
  @page {
    size: A4;
    margin: 5mm;
  }

  html, body {
    background: #ffffff !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  body * { visibility: hidden !important; }

  .etiqueta-area-impressao,
  .etiqueta-area-impressao * { visibility: visible !important; }

  .etiqueta-area-impressao {
    display: grid !important;
    grid-template-columns: repeat(3, 60mm);
    grid-auto-rows: 40mm;
    gap: 0;
    position: absolute;
    top: 0;
    left: 0;
  }

  .etiqueta-area-impressao .etiqueta-preco {
    border: 0.2mm solid #000 !important;
    border-radius: 0 !important;
    page-break-inside: avoid;
    break-inside: avoid;
  }
}
`;
