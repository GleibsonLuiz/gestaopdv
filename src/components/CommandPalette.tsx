import { useState, useEffect, useMemo, useRef } from "react";
import { C } from "../lib/theme";

// ============================================================================
// Command Palette (Ctrl/Cmd+K · Alt+S) — busca rapida de modulos estilo SAP /
// Linear / Raycast. Modal flutuante global: funciona com a sidebar recolhida,
// no mobile e ate no PDV em modo focado (onde nao existe sidebar). A sidebar
// continua visualmente identica — esta e a porta de entrada por teclado.
//
// O componente e "burro" de proposito: recebe a lista de itens JA filtrada por
// permissao/plano/role (App.tsx monta o registry e aplica podeVer). Aqui so
// cuidamos de busca, ranking, navegacao por teclado e render.
// ============================================================================

export interface ItemPaleta {
  /** id da tela (navegar) — ou id sintetico para acoes (ex: "formas-pagamento") */
  id: string;
  label: string;
  icone: string;
  /** rotulo da secao para agrupar quando a busca esta vazia */
  secao?: string;
  /** sinonimos/palavras-chave (string unica, separada por espacos) para o match */
  keywords?: string;
  /** dica de atalho exibida a direita (ex: "Ctrl+K") */
  atalho?: string;
}

interface Props {
  aberta: boolean;
  itens: ItemPaleta[];
  /** id da tela atual — exibe um "atalho" visual de onde o usuario esta */
  telaAtual?: string;
  onFechar: () => void;
  onSelecionar: (item: ItemPaleta) => void;
}

// Remove acentos e baixa caixa: "Automações" -> "automacoes". Assim "fin",
// "comissao", "orcamento" batem mesmo digitado sem acento.
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacriticos combinantes
    .toLowerCase()
    .trim();
}

// Subsequencia fuzzy: todas as letras de `q` aparecem em `texto` na ordem
// (nao precisam ser contiguas). Ex: "cmds" casa "central de comandas".
function subsequencia(texto: string, q: string): boolean {
  let i = 0;
  for (let j = 0; j < texto.length && i < q.length; j++) {
    if (texto[j] === q[i]) i++;
  }
  return i === q.length;
}

interface ItemRanqueado {
  item: ItemPaleta;
  score: number;
  // intervalo [inicio, fim) do match contiguo no label, para destacar
  realce: [number, number] | null;
}

// Pontua um item contra a query. Menor = melhor. -1 = nao bate.
function pontuar(item: ItemPaleta, q: string): ItemRanqueado | null {
  const label = normalizar(item.label);
  const keys = normalizar(item.keywords || "");

  const idx = label.indexOf(q);
  if (idx === 0) return { item, score: 0, realce: [idx, idx + q.length] };
  if (idx > 0) return { item, score: 1, realce: [idx, idx + q.length] };

  // bate no inicio de alguma palavra-chave
  const palavras = keys.split(/\s+/).filter(Boolean);
  if (palavras.some((p) => p.startsWith(q))) return { item, score: 2, realce: null };
  if (keys.includes(q)) return { item, score: 3, realce: null };

  // fuzzy por ultimo (mais permissivo, pior ranking)
  if (subsequencia(label, q)) return { item, score: 4, realce: null };
  if (subsequencia(keys, q)) return { item, score: 5, realce: null };

  return null;
}

export default function CommandPalette({ aberta, itens, telaAtual, onFechar, onSelecionar }: Props) {
  const [query, setQuery] = useState("");
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listaRef = useRef<HTMLDivElement | null>(null);

  // Ao abrir: limpa busca, foca o input, reseta selecao.
  useEffect(() => {
    if (aberta) {
      setQuery("");
      setIndiceAtivo(0);
      // foco no proximo tick (apos o input existir no DOM)
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [aberta]);

  // Lista plana ranqueada (para navegacao por teclado) + agrupamento por secao
  // quando a busca esta vazia.
  const q = normalizar(query);
  const resultados = useMemo<ItemRanqueado[]>(() => {
    if (!q) {
      // sem busca: ordem do registry, sem ranking
      return itens.map((item) => ({ item, score: 0, realce: null }));
    }
    return itens
      .map((item) => pontuar(item, q))
      .filter((r): r is ItemRanqueado => r !== null)
      .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label));
  }, [itens, q]);

  // Mantem o indice ativo dentro dos limites quando a lista muda.
  useEffect(() => {
    setIndiceAtivo((i) => Math.min(i, Math.max(0, resultados.length - 1)));
  }, [resultados.length]);

  // Garante que o item selecionado fique visivel ao navegar por teclado.
  useEffect(() => {
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-idx="${indiceAtivo}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [indiceAtivo]);

  if (!aberta) return null;

  function escolher(idx: number) {
    const r = resultados[idx];
    if (r) onSelecionar(r.item);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndiceAtivo((i) => (resultados.length ? (i + 1) % resultados.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceAtivo((i) => (resultados.length ? (i - 1 + resultados.length) % resultados.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      escolher(indiceAtivo);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onFechar();
    }
  }

  // Renderiza o label com o trecho casado destacado em accent.
  function renderLabel(item: ItemPaleta, realce: [number, number] | null) {
    if (!realce) return item.label;
    const [ini, fim] = realce;
    return (
      <>
        {item.label.slice(0, ini)}
        <span style={{ color: C.accent, fontWeight: 800 }}>{item.label.slice(ini, fim)}</span>
        {item.label.slice(fim)}
      </>
    );
  }

  // Cabecalho de secao (so quando a busca esta vazia). Detecta a troca de secao
  // varrendo a lista em ordem.
  let secaoAnterior: string | undefined;

  return (
    <div
      className="gp-cmdk-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Buscar módulo"
    >
      <style>{ESTILO}</style>
      <div className="gp-cmdk-painel" onKeyDown={onKeyDown}>
        {/* Campo de busca */}
        <div className="gp-cmdk-campo">
          <span className="gp-cmdk-lupa" aria-hidden>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIndiceAtivo(0); }}
            placeholder="Buscar módulo... (ex: financeiro, pagar, comissão)"
            aria-label="Buscar módulo"
            className="gp-cmdk-input"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="gp-cmdk-kbd">Esc</kbd>
        </div>

        {/* Resultados */}
        <div className="gp-cmdk-lista" ref={listaRef} role="listbox">
          {resultados.length === 0 && (
            <div className="gp-cmdk-vazio">
              Nenhum módulo encontrado para <strong>"{query}"</strong>
            </div>
          )}
          {resultados.map((r, idx) => {
            const item = r.item;
            const ativo = idx === indiceAtivo;
            const atual = telaAtual && item.id === telaAtual;
            // cabecalho de secao apenas no modo "sem busca"
            const mostrarSecao = !q && item.secao && item.secao !== secaoAnterior;
            secaoAnterior = item.secao;
            return (
              <div key={item.id}>
                {mostrarSecao && <div className="gp-cmdk-secao">{item.secao}</div>}
                <button
                  type="button"
                  data-idx={idx}
                  role="option"
                  aria-selected={ativo}
                  className={`gp-cmdk-item ${ativo ? "ativo" : ""}`}
                  onMouseMove={() => setIndiceAtivo(idx)}
                  onClick={() => escolher(idx)}
                >
                  <span className="gp-cmdk-icone" aria-hidden>{item.icone}</span>
                  <span className="gp-cmdk-label">{renderLabel(item, r.realce)}</span>
                  {atual && <span className="gp-cmdk-tag">atual</span>}
                  {item.atalho && <kbd className="gp-cmdk-kbd">{item.atalho}</kbd>}
                </button>
              </div>
            );
          })}
        </div>

        {/* Rodape com dicas de navegacao */}
        <div className="gp-cmdk-rodape">
          <span><kbd className="gp-cmdk-kbd">↑</kbd><kbd className="gp-cmdk-kbd">↓</kbd> navegar</span>
          <span><kbd className="gp-cmdk-kbd">↵</kbd> abrir</span>
          <span><kbd className="gp-cmdk-kbd">esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  );
}

const ESTILO = `
.gp-cmdk-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(3, 6, 14, 0.55);
  backdrop-filter: blur(3px);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 14vh 16px 16px;
  animation: gpCmdkFade 0.12s ease;
}
@keyframes gpCmdkFade { from { opacity: 0; } to { opacity: 1; } }
.gp-cmdk-painel {
  width: 100%; max-width: 560px;
  background: ${C.surface};
  border: 1px solid ${C.border};
  border-radius: 14px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4);
  overflow: hidden;
  display: flex; flex-direction: column;
  max-height: 70vh;
  animation: gpCmdkPop 0.14s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: 'Segoe UI', sans-serif;
}
@keyframes gpCmdkPop { from { opacity: 0; transform: translateY(-8px) scale(0.98); } to { opacity: 1; transform: none; } }
.gp-cmdk-campo {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid ${C.border};
}
.gp-cmdk-lupa { font-size: 16px; opacity: 0.8; }
.gp-cmdk-input {
  flex: 1; min-width: 0;
  background: transparent; border: none; outline: none;
  color: ${C.text}; font-size: 15px;
  font-family: inherit;
}
.gp-cmdk-input::placeholder { color: ${C.muted}; }
.gp-cmdk-lista {
  flex: 1; overflow-y: auto;
  padding: 6px;
}
.gp-cmdk-lista::-webkit-scrollbar { width: 8px; }
.gp-cmdk-lista::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
.gp-cmdk-secao {
  color: ${C.muted}; font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1px;
  padding: 12px 12px 6px;
}
.gp-cmdk-item {
  display: flex; align-items: center; gap: 12px;
  width: 100%; text-align: left;
  padding: 10px 12px; margin-bottom: 2px;
  background: transparent; border: none; border-radius: 9px;
  color: ${C.text}; font-size: 14px; font-weight: 500;
  cursor: pointer; font-family: inherit;
}
.gp-cmdk-item.ativo { background: ${C.accent}22; box-shadow: inset 0 0 0 1px ${C.accent}55; }
.gp-cmdk-icone { font-size: 17px; width: 22px; text-align: center; flex-shrink: 0; }
.gp-cmdk-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gp-cmdk-tag {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
  color: ${C.accent}; background: ${C.accent}1a;
  padding: 2px 7px; border-radius: 20px; flex-shrink: 0;
}
.gp-cmdk-vazio { padding: 28px 16px; text-align: center; color: ${C.muted}; font-size: 13px; }
.gp-cmdk-rodape {
  display: flex; gap: 16px; align-items: center;
  padding: 9px 16px; border-top: 1px solid ${C.border};
  color: ${C.muted}; font-size: 11px;
}
.gp-cmdk-kbd {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 10px; line-height: 1;
  color: ${C.muted}; background: ${C.card};
  border: 1px solid ${C.border}; border-radius: 5px;
  padding: 3px 6px; flex-shrink: 0;
}
@media (max-width: 600px) {
  .gp-cmdk-overlay { padding: 8vh 10px 10px; }
  .gp-cmdk-rodape { display: none; }
}
`;
