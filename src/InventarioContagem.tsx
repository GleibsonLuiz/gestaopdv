import { useEffect, useState, useCallback, useMemo, type CSSProperties } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";

// =====================================================================
// FOLHA DE CONTAGEM — MODO CEGO
// O backend (getFolhaContagem) NUNCA envia estoqueLogico no payload —
// a contagem fisica e independente do valor do sistema para evitar
// vies. Esta tela apenas exibe o que o backend mandou e coleta a
// quantidade contada. Validacao e persistencia em batch via
// POST /inventarios/:id/contagens.
// =====================================================================

interface CategoriaRef {
  id: string;
  nome: string;
}

interface ProdutoRef {
  id: string;
  codigo: string;
  codigoBarras?: string | null;
  nome: string;
  unidade?: string | null;
  categoria?: CategoriaRef | null;
}

interface ItemContagem {
  id: string;
  // Vem como Decimal serializado em string pelo backend. Pode ser null
  // antes da primeira contagem.
  quantidadeContada: string | number | null;
  contadoEm: string | null;
  observacao: string | null;
  produto: ProdutoRef;
}

interface FolhaResp {
  id: string;
  numero: number;
  descricao?: string | null;
  filtroCategoria?: string | null;
  dataInicio: string;
  itens: ItemContagem[];
}

type FiltroContagem = "todos" | "pendentes" | "contados";

interface InventarioContagemProps {
  inventarioId: string;
  onVoltar: () => void;
}

export default function InventarioContagem({ inventarioId, onVoltar }: InventarioContagemProps) {
  const [folha, setFolha] = useState<FolhaResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  // Estado local do operador: para cada itemId, qual quantidade foi
  // digitada e qual observacao. Distinguir do que ja esta salvo no
  // servidor (`folha.itens[i].quantidadeContada`).
  const [valores, setValores] = useState<Record<string, string>>({});
  const [obs, setObs] = useState<Record<string, string>>({});
  // Itens cujo valor local divergiu do servidor (a sincronizar).
  const [modificados, setModificados] = useState<Set<string>>(new Set());

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroContagem>("pendentes");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const f = await api.folhaInventario(inventarioId) as FolhaResp;
      setFolha(f);
      // Sincroniza valores locais com servidor para itens NAO modificados —
      // preserva o que o usuario esta digitando agora.
      setValores((prev) => {
        const next = { ...prev };
        for (const it of f.itens) {
          if (!modificados.has(it.id)) {
            next[it.id] = it.quantidadeContada === null || it.quantidadeContada === undefined
              ? ""
              : String(it.quantidadeContada);
          }
        }
        return next;
      });
      setObs((prev) => {
        const next = { ...prev };
        for (const it of f.itens) {
          if (!modificados.has(it.id)) {
            next[it.id] = it.observacao || "";
          }
        }
        return next;
      });
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
    // modificados intencionalmente fora das deps — re-criar carregar a
    // cada toque do usuario causaria loop. A leitura via closure captura
    // o estado no momento da chamada, que e o comportamento desejado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventarioId]);

  useEffect(() => { carregar(); }, [carregar]);

  function flash(t: string) {
    setMensagem(t);
    setTimeout(() => setMensagem(""), 3000);
  }

  function atualizarQtd(itemId: string, valor: string) {
    setValores((prev) => ({ ...prev, [itemId]: valor }));
    setModificados((prev) => {
      if (prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  }

  function atualizarObs(itemId: string, valor: string) {
    setObs((prev) => ({ ...prev, [itemId]: valor }));
    setModificados((prev) => {
      if (prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  }

  async function salvar() {
    if (modificados.size === 0 || !folha) return;
    setErro("");

    const ids = Array.from(modificados);
    const contagens: Array<{ itemId: string; quantidadeContada: number; observacao?: string }> = [];
    for (const itemId of ids) {
      const raw = valores[itemId];
      if (raw === undefined || raw === null || String(raw).trim() === "") {
        const it = folha.itens.find((x) => x.id === itemId);
        setErro(`Quantidade vazia em "${it?.produto.nome || itemId}". Preencha o valor ou recarregue para desfazer.`);
        return;
      }
      const q = parseFloat(String(raw).replace(",", "."));
      if (!Number.isFinite(q) || q < 0) {
        const it = folha.itens.find((x) => x.id === itemId);
        setErro(`Quantidade inválida em "${it?.produto.nome || itemId}".`);
        return;
      }
      const payload: { itemId: string; quantidadeContada: number; observacao?: string } = {
        itemId,
        quantidadeContada: Math.round(q * 1000) / 1000,
      };
      const ob = (obs[itemId] || "").trim();
      if (ob) payload.observacao = ob;
      contagens.push(payload);
    }

    setSalvando(true);
    try {
      await api.salvarContagensInventario(inventarioId, contagens);
      flash(`${contagens.length} contagem${contagens.length > 1 ? "s salvas" : " salva"}`);
      // Remove so os IDs que enviamos — preserva qualquer edicao
      // concorrente feita entre o clique e a resposta.
      setModificados((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const { itensFiltrados, totalItens, totalContados } = useMemo(() => {
    if (!folha) return { itensFiltrados: [] as ItemContagem[], totalItens: 0, totalContados: 0 };
    const buscaLower = busca.trim().toLowerCase();
    const filtrados = folha.itens.filter((it) => {
      const contadoServidor = it.quantidadeContada !== null && it.quantidadeContada !== undefined;
      if (filtro === "pendentes" && contadoServidor) return false;
      if (filtro === "contados" && !contadoServidor) return false;
      if (!buscaLower) return true;
      const p = it.produto;
      return p.codigo.toLowerCase().includes(buscaLower)
        || (p.codigoBarras || "").toLowerCase().includes(buscaLower)
        || p.nome.toLowerCase().includes(buscaLower);
    });
    const contados = folha.itens.filter((it) => it.quantidadeContada !== null && it.quantidadeContada !== undefined).length;
    return { itensFiltrados: filtrados, totalItens: folha.itens.length, totalContados: contados };
  }, [folha, filtro, busca]);

  const pct = totalItens > 0 ? Math.round((totalContados / totalItens) * 100) : 0;

  if (carregando && !folha) {
    return <div className="py-10 text-center text-gp-muted text-[13px]">Carregando folha de contagem...</div>;
  }
  if (!folha) {
    return (
      <div className="py-10 text-center">
        <div className="text-gp-red text-sm mb-3">{erro || "Folha de contagem não disponível"}</div>
        <button onClick={onVoltar} style={btnSecundarioStyle}>← Voltar à lista</button>
      </div>
    );
  }

  return (
    <div>
      {/* Cabecalho do inventario + progresso */}
      <div
        className="mb-4 p-4"
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <div
              className="text-gp-muted text-[11px] font-bold uppercase mb-1"
              style={{ letterSpacing: 0.5 }}
            >
              Folha de contagem — modo cego
            </div>
            <div className="text-gp-white font-bold text-lg">
              Inventário #{folha.numero}
              {folha.descricao ? ` — ${folha.descricao}` : ""}
            </div>
            {folha.filtroCategoria && (
              <div className="text-gp-muted text-xs mt-1">Categoria: {folha.filtroCategoria}</div>
            )}
          </div>
          <button onClick={onVoltar} style={btnSecundarioStyle} disabled={salvando}>
            ← Voltar à lista
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex-1 h-2 rounded-full overflow-hidden"
            style={{ background: C.surface }}
            aria-label={`Progresso: ${pct}%`}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background: pct === 100 ? C.green : C.accent,
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div className="text-gp-text text-sm font-bold whitespace-nowrap">
            {totalContados}/{totalItens}{" "}
            <span className="text-gp-muted font-normal">({pct}%)</span>
          </div>
        </div>

        <div className="text-gp-muted text-[11px] mt-2 italic">
          ⓘ Modo cego: o sistema NÃO mostra a quantidade esperada para evitar viés na contagem.
        </div>
      </div>

      {/* Busca + filtro */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por código, código de barras ou nome..."
          style={{ ...inputCompactoStyle, flex: "1 1 280px" }}
          aria-label="Buscar produto"
        />
        {(["todos", "pendentes", "contados"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className="rounded-lg text-xs font-bold cursor-pointer"
            style={{
              background: filtro === f ? C.accent + "22" : C.surface,
              border: `1px solid ${filtro === f ? C.accent + "55" : C.border}`,
              color: filtro === f ? C.accent : C.muted,
              padding: "9px 14px",
            }}
          >
            {f === "todos" ? "Todos" : f === "pendentes" ? "Pendentes" : "Contados"}
          </button>
        ))}
      </div>

      {mensagem && (
        <div
          className="mb-3 px-[14px] py-[10px] rounded-lg text-[13px] text-gp-green"
          style={{ background: C.green + "22", border: `1px solid ${C.green}55` }}
        >
          {mensagem}
        </div>
      )}
      {erro && (
        <div
          className="mb-3 px-[14px] py-[10px] rounded-lg text-[13px] text-gp-red"
          style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}
        >
          {erro}
        </div>
      )}

      {/* Lista de itens com input de quantidade */}
      <div
        className="bg-gp-card rounded-xl overflow-hidden"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div
          className="grid bg-gp-surface text-gp-muted text-xs font-bold uppercase"
          style={{
            gridTemplateColumns: "100px 130px 2fr 130px 1fr 110px",
            padding: "12px 16px",
            borderBottom: `1px solid ${C.border}`,
            letterSpacing: 0.5,
          }}
        >
          <div>Código</div>
          <div>Cód. barras</div>
          <div>Produto</div>
          <div className="text-right">Qtd contada</div>
          <div>Observação</div>
          <div>Status</div>
        </div>

        {itensFiltrados.length === 0 ? (
          <div className="py-[30px] text-center text-gp-muted text-[13px]">
            {busca || filtro !== "todos"
              ? "Nenhum item corresponde ao filtro."
              : "Esta folha não tem itens — algo inesperado, fale com o gestor."}
          </div>
        ) : itensFiltrados.map((it) => {
          const contadoServidor = it.quantidadeContada !== null && it.quantidadeContada !== undefined;
          const modificadoLocal = modificados.has(it.id);
          return (
            <div
              key={it.id}
              className="grid items-center text-[13px]"
              style={{
                gridTemplateColumns: "100px 130px 2fr 130px 1fr 110px",
                padding: "10px 16px",
                borderBottom: `1px solid ${C.border}`,
                background: modificadoLocal ? C.yellow + "0d" : "transparent",
              }}
            >
              <div className="font-mono text-gp-text text-xs">{it.produto.codigo}</div>
              <div className="font-mono text-gp-muted text-xs">{it.produto.codigoBarras || "—"}</div>
              <div>
                <div className="text-gp-white font-semibold">{it.produto.nome}</div>
                <div className="text-gp-muted text-[11px]">
                  {it.produto.categoria?.nome || "Sem categoria"}
                  {it.produto.unidade && ` · ${it.produto.unidade}`}
                </div>
              </div>
              <input
                type="number"
                step="0.001"
                min="0"
                value={valores[it.id] ?? ""}
                onChange={(e) => atualizarQtd(it.id, e.target.value)}
                placeholder="0"
                disabled={salvando}
                aria-label={`Quantidade contada de ${it.produto.nome}`}
                style={{
                  ...inputCompactoStyle,
                  textAlign: "right",
                  padding: "6px 10px",
                  background: modificadoLocal ? C.surface : C.bg,
                  border: `1px solid ${modificadoLocal ? C.yellow : C.border}`,
                }}
              />
              <input
                type="text"
                value={obs[it.id] ?? ""}
                onChange={(e) => atualizarObs(it.id, e.target.value)}
                placeholder="—"
                disabled={salvando}
                aria-label={`Observação para ${it.produto.nome}`}
                style={{
                  ...inputCompactoStyle,
                  padding: "6px 10px",
                  fontSize: 12,
                }}
              />
              <div>
                {modificadoLocal ? (
                  <span
                    className="text-[11px] font-bold uppercase rounded-full inline-block"
                    style={{
                      background: C.yellow + "22",
                      border: `1px solid ${C.yellow}55`,
                      color: C.yellow,
                      padding: "3px 10px",
                      letterSpacing: 0.5,
                    }}
                  >
                    A salvar
                  </span>
                ) : contadoServidor ? (
                  <span
                    className="text-[11px] font-bold uppercase rounded-full inline-block"
                    style={{
                      background: C.green + "22",
                      border: `1px solid ${C.green}55`,
                      color: C.green,
                      padding: "3px 10px",
                      letterSpacing: 0.5,
                    }}
                  >
                    Contado
                  </span>
                ) : (
                  <span
                    className="text-[11px] font-bold uppercase rounded-full inline-block"
                    style={{
                      background: C.muted + "22",
                      border: `1px solid ${C.muted}55`,
                      color: C.muted,
                      padding: "3px 10px",
                      letterSpacing: 0.5,
                    }}
                  >
                    Pendente
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer fixo: contador de pendentes + acoes */}
      <div
        className="mt-4 flex justify-between items-center gap-3 flex-wrap"
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: "12px 18px",
          position: "sticky",
          bottom: 12,
          boxShadow: "0 -4px 16px rgba(0,0,0,0.25)",
        }}
      >
        <div className="text-gp-muted text-xs">
          {modificados.size > 0 ? (
            <span>
              <b style={{ color: C.yellow }}>{modificados.size}</b> contagem
              {modificados.size > 1 ? "s pendentes" : " pendente"} de salvar
            </span>
          ) : totalContados === totalItens ? (
            <span style={{ color: C.green }}>
              ✓ Contagem completa — peça ao gestor para revisar e consolidar
            </span>
          ) : (
            <span>Todas as alterações foram salvas</span>
          )}
        </div>
        <div className="flex gap-2.5">
          <button type="button" onClick={onVoltar} disabled={salvando} style={btnSecundarioStyle}>
            ← Voltar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={salvando || modificados.size === 0}
            style={{
              ...btnPrimarioStyle,
              opacity: salvando || modificados.size === 0 ? 0.5 : 1,
              cursor: salvando || modificados.size === 0 ? "not-allowed" : "pointer",
            }}
          >
            {salvando
              ? "Salvando..."
              : modificados.size > 0
                ? `Salvar contagens (${modificados.size})`
                : "Salvar contagens"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ ESTILOS ============

const inputCompactoStyle: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "9px 12px",
  color: C.text,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  width: "100%",
};

const btnSecundarioStyle: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: 8,
  padding: "10px 18px",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const btnPrimarioStyle: CSSProperties = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: C.white,
  border: "none",
  borderRadius: 8,
  padding: "10px 22px",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};
