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

  const labelStyle: CSSProperties = { fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 6 };
  const inputStyle: CSSProperties = {
    background: C.surface,
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
    width: "100%",
  };

  return (
    <>
      <div className="etiquetas-tela">
        {/* Filtros */}
        <div className="grid grid-cols-2 gap-3 mb-4">
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
        <div className="flex flex-wrap gap-[10px] items-center mb-3">
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
          <div className="flex-1" />
          <div className="text-[13px] text-gp-muted">
            {totalEtiquetas > 0 ? (
              <>
                <span className="text-gp-white font-bold">{totalEtiquetas}</span>
                {" etiquetas • "}
                <span className="text-gp-white font-bold">{produtosSelecionados.length}</span>
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
          <div
            className="rounded-lg px-3 py-2 text-[13px] mb-3 text-gp-red"
            style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}
          >
            {erro}
          </div>
        )}

        {/* Lista de produtos */}
        <div className="bg-gp-card border border-gp-border rounded-xl overflow-hidden">
          <div
            className="grid gap-[10px] px-[14px] py-[10px] bg-gp-surface text-[11px] font-bold text-gp-muted uppercase tracking-[0.4px]"
            style={{
              gridTemplateColumns: "40px 90px 1fr 110px 130px 110px",
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <div></div>
            <div>Código</div>
            <div>Nome</div>
            <div>Referência</div>
            <div>Cód. Barras</div>
            <div className="text-right">Cópias</div>
          </div>

          {carregando && (
            <div className="p-5 text-center text-gp-muted text-[13px]">
              Carregando produtos...
            </div>
          )}

          {!carregando && filtrados.length === 0 && (
            <div className="px-6 py-6 text-center text-gp-muted text-[13px]">
              Nenhum produto encontrado com os filtros atuais.
            </div>
          )}

          {!carregando && filtrados.map((p) => {
            const qtd = Number(selecao[p.id]) || 0;
            const selecionado = qtd > 0;
            return (
              <div
                key={p.id}
                className="grid gap-[10px] px-[14px] py-[10px] items-center text-[13px] cursor-pointer"
                style={{
                  gridTemplateColumns: "40px 90px 1fr 110px 130px 110px",
                  borderBottom: `1px solid ${C.border}`,
                  background: selecionado ? C.accent + "11" : "transparent",
                }}
                onClick={() => alternarSelecao(p)}
              >
                <div>
                  <input
                    type="checkbox"
                    checked={selecionado}
                    onChange={() => alternarSelecao(p)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Selecionar ${p.nome}`}
                    className="w-4 h-4 cursor-pointer"
                    style={{ accentColor: C.accent }}
                  />
                </div>
                <div className="text-gp-muted font-mono">{p.codigo}</div>
                <div className="text-gp-text font-semibold">{p.nome}</div>
                <div className="text-gp-muted text-xs">{p.referencia || "—"}</div>
                <div className="text-gp-muted text-xs font-mono">{p.codigoBarras || "—"}</div>
                <div className="text-right" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={qtd || ""}
                    onChange={(e) => atualizarQtd(p.id, e.target.value)}
                    placeholder="0"
                    className="w-[70px] bg-gp-surface text-gp-text rounded-md px-2 py-[5px] text-[13px] text-center"
                    style={{ border: `1px solid ${C.border}` }}
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

const botaoPrimario: CSSProperties = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: C.white,
  border: "none",
  borderRadius: 8,
  padding: "10px 18px",
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
