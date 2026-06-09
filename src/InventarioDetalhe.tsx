import { useEffect, useState, useMemo, useCallback, type CSSProperties } from "react";
import { C } from "./lib/theme";
import { api, type SessionUser } from "./lib/api";

// =====================================================================
// DETALHE DO INVENTARIO — VISAO DO GESTOR
// Mostra divergencias (estoqueLogico × contada), impacto financeiro
// (snapshot de precoCusto × diferenca) e permite consolidar/cancelar.
// Consolidacao e atomica no backend: ajusta Produto.estoque + gera
// MovimentacaoEstoque AJUSTE em transacao.
// =====================================================================

type StatusInventario = "ABERTO" | "CONCLUIDO" | "CANCELADO";

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
  precoCusto?: string | number | null;
  categoria?: CategoriaRef | null;
}

interface ResponsavelRef {
  id: string;
  nome: string;
  email?: string | null;
}

interface ItemDetalhe {
  id: string;
  estoqueLogico: string | number;
  precoCustoMomento: string | number | null;
  quantidadeContada: string | number | null;
  diferenca: string | number | null;
  observacao: string | null;
  contadoEm: string | null;
  produto: ProdutoRef;
  diferencaCalculada: number | null;
  impactoFinanceiro: number | null;
}

interface Resumo {
  totalItens: number;
  itensContados: number;
  itensPendentes: number;
  itensComSobra: number;
  itensComFalta: number;
  itensOk: number;
  impactoFinanceiroTotal: number;
}

interface DetalheResp {
  id: string;
  numero: number;
  descricao?: string | null;
  observacoes?: string | null;
  filtroCategoria?: string | null;
  status: StatusInventario;
  dataInicio: string;
  dataFim?: string | null;
  responsavel?: ResponsavelRef | null;
  itens: ItemDetalhe[];
  resumo: Resumo;
}

type FiltroLinha = "todos" | "pendentes" | "ok" | "sobra" | "falta";

interface ConsolidarResp {
  inventario: { numero: number };
  ajustados: number;
}

interface InventarioDetalheProps {
  inventarioId: string;
  user: SessionUser;
  onVoltar: (mensagem?: string) => void;
}

// ============ HELPERS ============

const fmtBRL = (v: number | string | null | undefined): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtQtd = (v: number | string | null | undefined): string => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
};

const fmtData = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const STATUS_META: Record<StatusInventario, { label: string; cor: string }> = {
  ABERTO: { label: "Em contagem", cor: C.yellow },
  CONCLUIDO: { label: "Concluído", cor: C.green },
  CANCELADO: { label: "Cancelado", cor: C.red },
};

export default function InventarioDetalhe({ inventarioId, user, onVoltar }: InventarioDetalheProps) {
  const [det, setDet] = useState<DetalheResp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<FiltroLinha>("todos");
  const [busca, setBusca] = useState("");
  const [confirmaConsolidar, setConfirmaConsolidar] = useState(false);
  const [processando, setProcessando] = useState(false);

  const podeGerir = user.role === "ADMIN" || user.role === "GERENTE";

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await api.obterInventario(inventarioId) as DetalheResp;
      setDet(r);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [inventarioId]);

  useEffect(() => { carregar(); }, [carregar]);

  const itensFiltrados = useMemo(() => {
    if (!det) return [] as ItemDetalhe[];
    const buscaLower = busca.trim().toLowerCase();
    return det.itens.filter((it) => {
      const dif = it.diferencaCalculada;
      const contado = it.quantidadeContada !== null && it.quantidadeContada !== undefined;
      if (filtro === "pendentes" && contado) return false;
      if (filtro === "ok" && (!contado || dif !== 0)) return false;
      if (filtro === "sobra" && (!contado || (dif ?? 0) <= 0)) return false;
      if (filtro === "falta" && (!contado || (dif ?? 0) >= 0)) return false;
      if (!buscaLower) return true;
      const p = it.produto;
      return p.codigo.toLowerCase().includes(buscaLower)
        || (p.codigoBarras || "").toLowerCase().includes(buscaLower)
        || p.nome.toLowerCase().includes(buscaLower);
    });
  }, [det, filtro, busca]);

  async function consolidar() {
    if (!det) return;
    setProcessando(true);
    setErro("");
    try {
      const r = await api.consolidarInventario(inventarioId) as ConsolidarResp;
      onVoltar(
        `Inventário #${r.inventario.numero} consolidado — ${r.ajustados} ajuste${r.ajustados === 1 ? "" : "s"} aplicado${r.ajustados === 1 ? "" : "s"} ao estoque`
      );
    } catch (err) {
      setErro((err as Error).message);
      setConfirmaConsolidar(false);
    } finally {
      setProcessando(false);
    }
  }

  async function cancelar() {
    if (!det) return;
    if (!confirm(`Cancelar inventário #${det.numero}? A contagem em andamento será descartada.`)) return;
    setProcessando(true);
    try {
      await api.cancelarInventario(inventarioId);
      onVoltar(`Inventário #${det.numero} cancelado`);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setProcessando(false);
    }
  }

  if (carregando && !det) {
    return <div className="py-10 text-center text-gp-muted text-[13px]">Carregando detalhes do inventário...</div>;
  }
  if (!det) {
    return (
      <div className="py-10 text-center">
        <div className="text-gp-red text-sm mb-3">{erro || "Detalhe não disponível"}</div>
        <button onClick={() => onVoltar()} style={btnSecundarioStyle}>← Voltar à lista</button>
      </div>
    );
  }

  const statusMeta = STATUS_META[det.status];
  const r = det.resumo;
  const pct = r.totalItens > 0 ? Math.round((r.itensContados / r.totalItens) * 100) : 0;
  const podeConsolidar = det.status === "ABERTO" && podeGerir && r.itensPendentes === 0;
  const podeCancelar = det.status === "ABERTO" && podeGerir;
  const impactoCor = r.impactoFinanceiroTotal > 0 ? C.green : r.impactoFinanceiroTotal < 0 ? C.red : C.muted;

  return (
    <div>
      {/* Cabecalho do inventario */}
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
              Detalhe — visão do gestor
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="text-gp-white font-bold text-lg">
                Inventário #{det.numero}
                {det.descricao ? ` — ${det.descricao}` : ""}
              </div>
              <span
                className="text-[11px] font-bold uppercase rounded-full inline-block"
                style={{
                  background: statusMeta.cor + "22",
                  border: `1px solid ${statusMeta.cor}55`,
                  color: statusMeta.cor,
                  padding: "3px 10px",
                  letterSpacing: 0.5,
                }}
              >
                {statusMeta.label}
              </span>
            </div>
            <div className="text-gp-muted text-xs mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              <span>Aberto em {fmtData(det.dataInicio)}</span>
              {det.dataFim && <span>Encerrado em {fmtData(det.dataFim)}</span>}
              {det.responsavel && <span>Resp.: {det.responsavel.nome}</span>}
              {det.filtroCategoria && <span>Categoria: {det.filtroCategoria}</span>}
            </div>
          </div>
          <button onClick={() => onVoltar()} style={btnSecundarioStyle} disabled={processando}>
            ← Voltar à lista
          </button>
        </div>

        {det.observacoes && (
          <div
            className="mt-2.5 rounded-lg text-xs"
            style={{
              padding: "8px 12px",
              background: C.surface,
              border: `1px solid ${C.border}`,
              color: C.text,
            }}
          >
            <span className="text-gp-muted">Obs.: </span>{det.observacoes}
          </div>
        )}
      </div>

      {/* Cards de resumo */}
      <div
        className="grid gap-3 mb-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
      >
        <ResumoCard label="Itens contados" valor={`${r.itensContados}/${r.totalItens}`} sub={`${pct}%`} cor={pct === 100 ? C.green : C.accent} />
        <ResumoCard label="Pendentes" valor={String(r.itensPendentes)} cor={r.itensPendentes > 0 ? C.yellow : C.muted} />
        <ResumoCard label="Sem divergência" valor={String(r.itensOk)} cor={C.muted} />
        <ResumoCard label="Com sobra" valor={String(r.itensComSobra)} cor={r.itensComSobra > 0 ? C.green : C.muted} />
        <ResumoCard label="Com falta" valor={String(r.itensComFalta)} cor={r.itensComFalta > 0 ? C.red : C.muted} />
        <ResumoCard label="Impacto financeiro" valor={fmtBRL(r.impactoFinanceiroTotal)} cor={impactoCor} destaque />
      </div>

      {/* Acoes do gestor */}
      {(podeConsolidar || podeCancelar || (det.status === "ABERTO" && podeGerir && r.itensPendentes > 0)) && (
        <div
          className="mb-4 p-3.5"
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div className="text-gp-muted text-xs flex-1 min-w-[200px]">
            {r.itensPendentes > 0 ? (
              <span>
                <b style={{ color: C.yellow }}>{r.itensPendentes}</b> item
                {r.itensPendentes > 1 ? "s" : ""} ainda não contado
                {r.itensPendentes > 1 ? "s" : ""} — não é possível consolidar
              </span>
            ) : (
              <span style={{ color: C.green }}>
                ✓ Contagem completa — pronta para consolidar (atualiza estoque e gera ajustes em transação)
              </span>
            )}
          </div>
          <div className="flex gap-2.5">
            {podeCancelar && (
              <button
                type="button"
                onClick={cancelar}
                disabled={processando}
                style={btnPerigoStyle}
              >
                🗑 Cancelar inventário
              </button>
            )}
            {podeConsolidar && (
              <button
                type="button"
                onClick={() => setConfirmaConsolidar(true)}
                disabled={processando}
                style={btnPrimarioStyle}
              >
                ✓ Consolidar inventário
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filtro + busca */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por código, código de barras ou nome..."
          style={{ ...inputCompactoStyle, flex: "1 1 280px" }}
          aria-label="Buscar produto"
        />
        {([
          { id: "todos", label: "Todos", count: r.totalItens },
          { id: "pendentes", label: "Pendentes", count: r.itensPendentes },
          { id: "ok", label: "Sem divergência", count: r.itensOk },
          { id: "sobra", label: "Com sobra", count: r.itensComSobra },
          { id: "falta", label: "Com falta", count: r.itensComFalta },
        ] as const).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id as FiltroLinha)}
            className="rounded-lg text-xs font-bold cursor-pointer"
            style={{
              background: filtro === f.id ? C.accent + "22" : C.surface,
              border: `1px solid ${filtro === f.id ? C.accent + "55" : C.border}`,
              color: filtro === f.id ? C.accent : C.muted,
              padding: "9px 14px",
            }}
          >
            {f.label} <span style={{ opacity: 0.7 }}>({f.count})</span>
          </button>
        ))}
      </div>

      {erro && (
        <div
          className="mb-3 px-[14px] py-[10px] rounded-lg text-[13px] text-gp-red"
          style={{ background: C.red + "22", border: `1px solid ${C.red}55` }}
        >
          {erro}
        </div>
      )}

      {/* Tabela de itens com divergencias */}
      <div
        className="bg-gp-card rounded-xl overflow-hidden"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div
          className="grid bg-gp-surface text-gp-muted text-xs font-bold uppercase"
          style={{
            gridTemplateColumns: "100px 2fr 100px 100px 110px 120px",
            padding: "12px 16px",
            borderBottom: `1px solid ${C.border}`,
            letterSpacing: 0.5,
          }}
        >
          <div>Código</div>
          <div>Produto</div>
          <div className="text-right">Sistema</div>
          <div className="text-right">Contado</div>
          <div className="text-right">Diferença</div>
          <div className="text-right">Impacto R$</div>
        </div>

        {itensFiltrados.length === 0 ? (
          <div className="py-[30px] text-center text-gp-muted text-[13px]">
            {busca || filtro !== "todos"
              ? "Nenhum item corresponde ao filtro."
              : "Sem itens neste inventário."}
          </div>
        ) : itensFiltrados.map((it) => {
          const contado = it.quantidadeContada !== null && it.quantidadeContada !== undefined;
          const dif = it.diferencaCalculada;
          const corDif = !contado
            ? C.muted
            : dif === 0
              ? C.muted
              : (dif ?? 0) > 0
                ? C.green
                : C.red;
          const impacto = it.impactoFinanceiro;
          const corImpacto = !contado || impacto === null
            ? C.muted
            : impacto === 0
              ? C.muted
              : impacto > 0
                ? C.green
                : C.red;
          return (
            <div
              key={it.id}
              className="grid items-center text-[13px]"
              style={{
                gridTemplateColumns: "100px 2fr 100px 100px 110px 120px",
                padding: "10px 16px",
                borderBottom: `1px solid ${C.border}`,
                background: contado && dif !== 0 ? corDif + "08" : "transparent",
              }}
            >
              <div className="font-mono text-gp-text text-xs">{it.produto.codigo}</div>
              <div>
                <div className="text-gp-white font-semibold">{it.produto.nome}</div>
                <div className="text-gp-muted text-[11px]">
                  {it.produto.categoria?.nome || "Sem categoria"}
                  {it.produto.unidade && ` · ${it.produto.unidade}`}
                  {it.observacao && (
                    <span style={{ color: C.yellow }}> · obs: {it.observacao}</span>
                  )}
                </div>
              </div>
              <div className="text-right font-mono text-gp-text">{fmtQtd(it.estoqueLogico)}</div>
              <div className="text-right font-mono" style={{ color: contado ? C.white : C.muted }}>
                {contado ? fmtQtd(it.quantidadeContada) : "Pendente"}
              </div>
              <div
                className="text-right font-mono font-bold"
                style={{ color: corDif }}
              >
                {!contado ? "—" : dif === 0 ? "OK" : (dif ?? 0) > 0 ? `+${fmtQtd(dif)}` : fmtQtd(dif)}
              </div>
              <div className="text-right font-semibold" style={{ color: corImpacto }}>
                {!contado || impacto === null ? "—" : fmtBRL(impacto)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Aviso sobre snapshot vs estoque corrente */}
      {det.status === "ABERTO" && (
        <div
          className="mt-4 p-3 rounded-[10px] text-xs"
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            color: C.muted,
          }}
        >
          ⓘ <b style={{ color: C.text }}>Sobre os números:</b> "Sistema" é o snapshot tirado na abertura do inventário.
          Vendas e compras feitas após a abertura NÃO alteram esse valor. A consolidação ajusta
          o estoque atual para a quantidade contada (usando o estado vigente, não o snapshot).
        </div>
      )}

      {confirmaConsolidar && (
        <ModalConfirmaConsolidacao
          numero={det.numero}
          resumo={r}
          processando={processando}
          onCancelar={() => setConfirmaConsolidar(false)}
          onConfirmar={consolidar}
        />
      )}
    </div>
  );
}

// ============ SUBCOMPONENTES ============

interface ResumoCardProps {
  label: string;
  valor: string;
  sub?: string;
  cor: string;
  destaque?: boolean;
}

function ResumoCard({ label, valor, sub, cor, destaque }: ResumoCardProps) {
  return (
    <div
      className="p-3"
      style={{
        background: destaque ? cor + "11" : C.card,
        border: `1px solid ${destaque ? cor + "55" : C.border}`,
        borderRadius: 10,
      }}
    >
      <div
        className="text-[10px] font-bold uppercase"
        style={{ color: C.muted, letterSpacing: 0.5 }}
      >
        {label}
      </div>
      <div className="font-extrabold mt-1" style={{ color: cor, fontSize: 20, lineHeight: 1.1 }}>
        {valor}
      </div>
      {sub && (
        <div className="text-[11px] mt-0.5" style={{ color: C.muted }}>{sub}</div>
      )}
    </div>
  );
}

interface ModalConfirmaConsolidacaoProps {
  numero: number;
  resumo: Resumo;
  processando: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}

function ModalConfirmaConsolidacao({
  numero,
  resumo,
  processando,
  onCancelar,
  onConfirmar,
}: ModalConfirmaConsolidacaoProps) {
  const totalDivergentes = resumo.itensComSobra + resumo.itensComFalta;
  return (
    <div
      onClick={() => !processando && onCancelar()}
      style={modalOverlayStyle}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...modalCardStyle, maxWidth: 520 }}
      >
        <div style={modalHeaderStyle}>
          <div>
            <div className="text-gp-white font-bold text-lg">
              Consolidar inventário #{numero}?
            </div>
            <div className="text-gp-muted text-xs mt-1">
              Esta ação é irreversível e atualiza o estoque dos produtos.
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelar}
            aria-label="Fechar"
            style={btnFecharStyle}
            disabled={processando}
          >
            ×
          </button>
        </div>

        <div
          className="p-3 mb-3 rounded-[10px] text-[13px]"
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            color: C.text,
          }}
        >
          <div className="mb-2 font-bold">O que vai acontecer:</div>
          <ul className="list-disc pl-5 space-y-1 text-gp-muted text-xs">
            <li>
              <b style={{ color: C.text }}>{totalDivergentes}</b> produto{totalDivergentes === 1 ? "" : "s"}{" "}
              {totalDivergentes === 1 ? "terá seu" : "terão seu"} estoque ajustado para o valor contado
            </li>
            <li>
              Cada ajuste vai gerar uma{" "}
              <b style={{ color: C.text }}>movimentação de estoque tipo AJUSTE</b> para auditoria
            </li>
            <li>
              <b style={{ color: C.text }}>{resumo.itensOk}</b>{" "}
              produto{resumo.itensOk === 1 ? "" : "s"} sem divergência{resumo.itensOk === 1 ? "" : "s"} {" "}
              {resumo.itensOk === 1 ? "não sofre" : "não sofrem"} alteração
            </li>
            <li>
              Tudo em uma única transação — se algum produto foi removido durante a contagem,
              nada é gravado
            </li>
          </ul>
        </div>

        <div
          className="p-3 mb-4 rounded-[10px] text-xs"
          style={{
            background: C.yellow + "11",
            border: `1px solid ${C.yellow}55`,
          }}
        >
          <div className="font-bold mb-1" style={{ color: C.yellow }}>
            ⚠ Atenção
          </div>
          <div style={{ color: C.text }}>
            Após consolidar, este inventário fica marcado como CONCLUÍDO e não aceita mais alterações.
            Para revisar a contagem, faça antes de clicar em consolidar.
          </div>
        </div>

        <div className="flex gap-2.5 justify-end">
          <button
            type="button"
            onClick={onCancelar}
            disabled={processando}
            style={btnSecundarioStyle}
          >
            Revisar antes
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={processando}
            style={{
              ...btnPrimarioStyle,
              opacity: processando ? 0.6 : 1,
              cursor: processando ? "not-allowed" : "pointer",
            }}
          >
            {processando ? "Consolidando..." : "Sim, consolidar"}
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
};

const btnPrimarioStyle: CSSProperties = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: "var(--accent-ink)",
  border: "none",
  borderRadius: 8,
  padding: "10px 18px",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
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

const btnPerigoStyle: CSSProperties = {
  background: C.red + "22",
  border: `1px solid ${C.red}55`,
  color: C.red,
  borderRadius: 8,
  padding: "10px 18px",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  zIndex: 100,
};

const modalCardStyle: CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  width: "100%",
  maxHeight: "92vh",
  overflowY: "auto",
  padding: 24,
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 18,
  gap: 12,
};

const btnFecharStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: C.muted,
  fontSize: 22,
  cursor: "pointer",
  flexShrink: 0,
};
