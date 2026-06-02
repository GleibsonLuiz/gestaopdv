import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";
import EtiquetaPreco from "./components/EtiquetaPreco";
import SelectBusca from "./components/SelectBusca";
import "./styles/etiquetas-print.css";

interface Produto {
  id: string;
  nome: string;
  codigo: string;
  codigoBarras?: string | null;
  referencia?: string | null;
  precoVenda?: number | null;
  ativo: boolean;
  tipoItem?: "PRODUTO" | "SERVICO";
  categoriaId?: string | null;
}

interface Categoria {
  id: string;
  nome: string;
  [extra: string]: unknown;
}

// Folha A4 (5mm de margem) comporta 3 colunas x 7 linhas de etiquetas 60x40mm.
const ETIQUETAS_POR_FOLHA = 21;

// Pagina de impressao de etiquetas em lote.
// Fluxo:
//   1. Carrega produtos + categorias.
//   2. Usuario filtra por categoria/busca e marca os itens desejados,
//      definindo a quantidade de etiquetas por produto.
//   3. Botao Imprimir aciona window.print(); o CSS @media print (injetado)
//      isola a area de impressao e define @page A4.
//
// Servicos sao excluidos — etiqueta fisica nao faz sentido para servico.
//
// Layout em "estudio de etiquetas": lista a esquerda + painel fixo a direita
// com previa real da etiqueta e o "ticket" do trabalho de impressao.
export default function Etiquetas() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [busca, setBusca] = useState("");
  const [selecao, setSelecao] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro("");
    Promise.all([api.listarProdutos({}), api.listarCategorias()])
      .then((resps) => {
        if (cancelado) return;
        const [prods, cats] = resps as [Produto[] | null, Categoria[] | null];
        setProdutos((prods || []).filter((p) => p.tipoItem !== "SERVICO" && p.ativo));
        setCategorias(cats || []);
      })
      .catch((e: Error) => !cancelado && setErro(e?.message || "Erro ao carregar dados"))
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
    [selecao],
  );

  const produtosSelecionados = useMemo(
    () => produtos.filter((p) => Number(selecao[p.id]) > 0),
    [produtos, selecao],
  );

  const folhas = Math.ceil(totalEtiquetas / ETIQUETAS_POR_FOLHA) || 0;

  // Produto da previa: o ultimo marcado (ou o primeiro selecionado como fallback).
  const previa = produtosSelecionados[produtosSelecionados.length - 1] || null;

  function alternarSelecao(p: Produto) {
    setSelecao((s) => {
      const next = { ...s };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = 1;
      return next;
    });
  }

  function atualizarQtd(id: string, valor: string | number) {
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

  return (
    <>
      <div className="etiquetas-tela flex flex-col lg:flex-row gap-4 items-start">
        {/* ----- Coluna principal: filtros + lista ----- */}
        <div className="flex-1 min-w-0 w-full">
          {/* Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-3 mb-3">
            <div>
              <div style={labelStyle}>Categoria</div>
              <SelectBusca<Categoria>
                opcoes={categorias}
                value={filtroCategoria}
                onChange={setFiltroCategoria}
                placeholder="Todas categorias"
                style={inputStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>Buscar produto</div>
              <div className="relative">
                <span
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] pointer-events-none"
                  style={{ color: C.muted }}
                  aria-hidden="true"
                >
                  🔎
                </span>
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome, código, referência ou cód. barras..."
                  style={{ ...inputStyle, paddingLeft: 34 }}
                />
              </div>
            </div>
          </div>

          {/* Barra de acoes da lista */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <button
              type="button"
              onClick={selecionarVisiveis}
              disabled={filtrados.length === 0}
              style={botaoSecundario}
              className="transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
            >
              ✓ Selecionar visíveis
            </button>
            <button
              type="button"
              onClick={limparSelecao}
              disabled={totalEtiquetas === 0}
              style={botaoSecundario}
              className="transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
            >
              Limpar seleção
            </button>
            <div className="flex-1" />
            <div className="text-[12px] font-mono tabular-nums" style={{ color: C.muted }}>
              {filtrados.length} {filtrados.length === 1 ? "produto" : "produtos"}
            </div>
          </div>

          {erro && (
            <div
              className="rounded-lg px-3 py-2 text-[13px] mb-3"
              style={{ background: C.red + "22", border: `1px solid ${C.red}55`, color: C.red }}
            >
              {erro}
            </div>
          )}

          {/* Lista de produtos */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: C.card, border: `1px solid ${C.border}` }}
          >
            {/* Cabecalho da tabela */}
            <div
              className="grid gap-[10px] px-[14px] py-[9px] text-[10.5px] font-bold uppercase tracking-[0.5px]"
              style={{
                gridTemplateColumns: COLUNAS,
                background: C.surface,
                color: C.muted,
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <div></div>
              <div>Código</div>
              <div>Produto</div>
              <div>Cód. Barras</div>
              <div className="text-center">Cópias</div>
            </div>

            {carregando && (
              <div className="py-10 text-center text-[13px]" style={{ color: C.muted }}>
                <div className="text-2xl mb-2 animate-pulse">🏷️</div>
                Carregando produtos...
              </div>
            )}

            {!carregando && filtrados.length === 0 && (
              <div className="px-6 py-12 text-center" style={{ color: C.muted }}>
                <div className="text-3xl mb-2 opacity-60">🔍</div>
                <div className="text-[13px] font-semibold" style={{ color: C.text }}>
                  Nenhum produto encontrado
                </div>
                <div className="text-[12px] mt-1">Ajuste a categoria ou o termo de busca.</div>
              </div>
            )}

            {!carregando && (
              <div className="max-h-[calc(100vh-330px)] overflow-y-auto">
                {filtrados.map((p) => {
                  const qtd = Number(selecao[p.id]) || 0;
                  const selecionado = qtd > 0;
                  const ehPrevia = previa?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => alternarSelecao(p)}
                      className="grid gap-[10px] px-[14px] py-[9px] items-center text-[13px] cursor-pointer transition-colors"
                      style={{
                        gridTemplateColumns: COLUNAS,
                        borderBottom: `1px solid ${C.border}`,
                        borderLeft: `3px solid ${selecionado ? C.accent : "transparent"}`,
                        background: selecionado
                          ? C.accent + (ehPrevia ? "22" : "14")
                          : "transparent",
                      }}
                    >
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selecionado}
                          onChange={() => alternarSelecao(p)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Selecionar ${p.nome}`}
                          className="w-[17px] h-[17px] cursor-pointer"
                          style={{ accentColor: C.accent }}
                        />
                      </div>
                      <div className="font-mono text-[12px] truncate" style={{ color: C.muted }}>
                        {p.codigo}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate" style={{ color: C.text }}>
                          {p.nome}
                        </div>
                        {p.referencia && (
                          <div className="text-[11px] truncate" style={{ color: C.muted }}>
                            ref {p.referencia}
                          </div>
                        )}
                      </div>
                      <div className="font-mono text-[11.5px] truncate" style={{ color: C.muted }}>
                        {p.codigoBarras || "—"}
                      </div>
                      <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                        <Stepper
                          valor={qtd}
                          onMenos={() => atualizarQtd(p.id, qtd - 1)}
                          onMais={() => atualizarQtd(p.id, qtd + 1)}
                          onSet={(v) => atualizarQtd(p.id, v)}
                          ativo={selecionado}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ----- Painel fixo: previa + ticket de impressao ----- */}
        <aside
          className="w-full lg:w-[270px] lg:shrink-0 lg:sticky lg:top-3 rounded-xl overflow-hidden"
          style={{ background: C.card, border: `1px solid ${C.border}` }}
        >
          <div
            className="px-4 py-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.5px]"
            style={{ background: C.surface, color: C.muted, borderBottom: `1px solid ${C.border}` }}
          >
            <span>🖨️</span> Trabalho de impressão
          </div>

          {/* Previa real da etiqueta (escalada) */}
          <div
            className="px-4 py-4 flex flex-col items-center"
            style={{ borderBottom: `1px solid ${C.border}` }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>
              Prévia
            </div>
            {previa ? (
              <div
                className="origin-top"
                style={{
                  transform: "scale(0.92)",
                  filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.28))",
                }}
              >
                <EtiquetaPreco
                  nomeProduto={previa.nome}
                  precoVenda={previa.precoVenda}
                  codigoBarras={previa.codigoBarras || previa.codigo}
                  referencia={previa.referencia}
                  codigo={previa.codigo}
                />
              </div>
            ) : (
              <div
                className="w-full flex flex-col items-center justify-center text-center rounded-lg py-7 px-3"
                style={{
                  border: `1px dashed ${C.border}`,
                  color: C.muted,
                  minHeight: 120,
                }}
              >
                <div className="text-2xl mb-1 opacity-60">🏷️</div>
                <div className="text-[12px]">Marque um produto para ver a etiqueta.</div>
              </div>
            )}
          </div>

          {/* Estatisticas do trabalho */}
          <div className="grid grid-cols-3 divide-x" style={{ borderColor: C.border }}>
            <Estat valor={produtosSelecionados.length} rotulo="Produtos" />
            <Estat valor={totalEtiquetas} rotulo="Etiquetas" destaque />
            <Estat valor={folhas} rotulo={folhas === 1 ? "Folha A4" : "Folhas A4"} />
          </div>

          {/* Acoes */}
          <div className="p-3 flex flex-col gap-2" style={{ borderTop: `1px solid ${C.border}` }}>
            <button
              type="button"
              onClick={imprimir}
              disabled={totalEtiquetas === 0}
              className="transition-all disabled:cursor-not-allowed hover:brightness-110 active:translate-y-[1px]"
              style={{
                ...botaoPrimario,
                width: "100%",
                opacity: totalEtiquetas === 0 ? 0.5 : 1,
                boxShadow: totalEtiquetas === 0 ? "none" : `0 4px 14px ${C.accent}44`,
              }}
            >
              🖨️ Imprimir {totalEtiquetas > 0 ? `${totalEtiquetas} etiqueta${totalEtiquetas === 1 ? "" : "s"}` : ""}
            </button>
            {totalEtiquetas > 0 && (
              <button
                type="button"
                onClick={limparSelecao}
                className="transition-opacity hover:opacity-100 opacity-70 text-[12px] font-semibold py-1"
                style={{ color: C.muted, background: "transparent", border: "none", cursor: "pointer" }}
              >
                Limpar tudo
              </button>
            )}
          </div>
        </aside>
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

// Stepper compacto de quantidade (− valor +). Quando zerado, mostra só o "+".
function Stepper({
  valor,
  onMenos,
  onMais,
  onSet,
  ativo,
}: {
  valor: number;
  onMenos: () => void;
  onMais: () => void;
  onSet: (v: number) => void;
  ativo: boolean;
}) {
  if (!ativo) {
    return (
      <button
        type="button"
        onClick={onMais}
        aria-label="Adicionar etiqueta"
        className="w-7 h-7 rounded-md text-[16px] leading-none font-bold transition-colors hover:brightness-110"
        style={{ background: C.surface, color: C.muted, border: `1px solid ${C.border}` }}
      >
        +
      </button>
    );
  }
  return (
    <div
      className="inline-flex items-center rounded-md overflow-hidden"
      style={{ border: `1px solid ${C.accent}66` }}
    >
      <button
        type="button"
        onClick={onMenos}
        aria-label="Menos uma etiqueta"
        className="w-7 h-7 text-[16px] leading-none font-bold transition-colors hover:brightness-110"
        style={{ background: C.surface, color: C.text }}
      >
        −
      </button>
      <input
        type="number"
        min={0}
        max={100}
        value={valor}
        onChange={(e) => onSet(Number(e.target.value))}
        aria-label="Quantidade de cópias"
        className="w-[42px] h-7 text-center text-[13px] font-bold tabular-nums outline-none"
        style={{
          background: C.card,
          color: C.text,
          border: "none",
          MozAppearance: "textfield",
        }}
      />
      <button
        type="button"
        onClick={onMais}
        aria-label="Mais uma etiqueta"
        className="w-7 h-7 text-[16px] leading-none font-bold transition-colors hover:brightness-110"
        style={{ background: C.surface, color: C.text }}
      >
        +
      </button>
    </div>
  );
}

// Tile de estatistica no painel de impressao.
function Estat({ valor, rotulo, destaque }: { valor: number; rotulo: string; destaque?: boolean }) {
  return (
    <div className="py-3 px-1 text-center" style={{ borderColor: C.border }}>
      <div
        className="text-[22px] font-extrabold leading-none tabular-nums"
        style={{ color: destaque ? C.accent : C.text }}
      >
        {valor}
      </div>
      <div className="text-[10.5px] mt-1 uppercase tracking-wide" style={{ color: C.muted }}>
        {rotulo}
      </div>
    </div>
  );
}

const COLUNAS = "28px 80px 1fr 110px 92px";

const labelStyle: CSSProperties = {
  fontSize: 12,
  color: C.muted,
  fontWeight: 600,
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  background: C.surface,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  width: "100%",
};

const botaoPrimario: CSSProperties = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: "var(--accent-ink, #fff)",
  border: "none",
  borderRadius: 8,
  padding: "11px 18px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const botaoSecundario: CSSProperties = {
  background: C.surface,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
