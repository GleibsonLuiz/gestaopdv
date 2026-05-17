import { useCallback, useEffect, useRef, useState } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";


const POLLING_MS = 60_000;
const STORAGE_DESCARTADOS = "gestao_alertas_descartados";

type Severidade = "ALTA" | "MEDIA" | "BAIXA";

type TipoAlerta =
  | "ESTOQUE_BAIXO"
  | "CONTA_PAGAR_ATRASADA"
  | "CONTA_PAGAR_PROXIMA"
  | "CONTA_RECEBER_ATRASADA"
  | "CONTA_RECEBER_PROXIMA";

interface Alerta {
  id: string;
  tipo: TipoAlerta;
  severidade: Severidade;
  titulo: string;
  descricao: string;
  complemento?: string;
  valor?: number | null;
  data?: string | null;
  link?: string;
}

interface AlertasPayload {
  alertas: Alerta[];
  geradoEm?: string;
}

interface AlertasProps {
  onNavegar?: (tela: string) => void;
}

const fmtBRL = (v: unknown): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtData = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

const COR_SEVERIDADE: Record<Severidade, string> = {
  ALTA: C.red, MEDIA: C.yellow, BAIXA: C.accent,
};

const ROTULO_TIPO: Record<TipoAlerta, { label: string; icone: string }> = {
  ESTOQUE_BAIXO: { label: "Estoque baixo", icone: "📦" },
  CONTA_PAGAR_ATRASADA: { label: "Contas a pagar atrasadas", icone: "📤" },
  CONTA_PAGAR_PROXIMA: { label: "Contas a pagar próximas", icone: "📅" },
  CONTA_RECEBER_ATRASADA: { label: "Recebimentos atrasados", icone: "📥" },
  CONTA_RECEBER_PROXIMA: { label: "Recebimentos próximos", icone: "📅" },
};

function lerDescartados(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_DESCARTADOS);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function salvarDescartados(s: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_DESCARTADOS, JSON.stringify([...s]));
  } catch {
    /* localStorage indisponivel */
  }
}

export default function Alertas({ onNavegar }: AlertasProps) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<AlertasPayload | null>(null);
  const [erro, setErro] = useState("");
  const [carregandoInicial, setCarregandoInicial] = useState(true);
  const [descartados, setDescartados] = useState<Set<string>>(() => lerDescartados());
  const ref = useRef<HTMLDivElement | null>(null);

  const carregar = useCallback(async () => {
    try {
      const data = await api.obterAlertas() as AlertasPayload;
      setDados(data);
      setErro("");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setCarregandoInicial(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, POLLING_MS);
    return () => clearInterval(t);
  }, [carregar]);

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (aberto && ref.current && !ref.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", onClickFora);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickFora);
      document.removeEventListener("keydown", onEsc);
    };
  }, [aberto]);

  // Limpa descartados que nao existem mais (ex: estoque reposto, conta paga)
  useEffect(() => {
    if (!dados) return;
    const idsAtuais = new Set(dados.alertas.map((a) => a.id));
    let mudou = false;
    const limpos = new Set<string>();
    for (const id of descartados) {
      if (idsAtuais.has(id)) limpos.add(id);
      else mudou = true;
    }
    if (mudou) {
      setDescartados(limpos);
      salvarDescartados(limpos);
    }
  }, [dados, descartados]);

  const visiveis = (dados?.alertas || []).filter((a) => !descartados.has(a.id));
  const alta = visiveis.filter((a) => a.severidade === "ALTA").length;
  const media = visiveis.filter((a) => a.severidade === "MEDIA").length;
  const totalVisivel = visiveis.length;

  const corBadge = alta > 0 ? C.red : media > 0 ? C.yellow : C.accent;

  function descartar(id: string) {
    const novo = new Set(descartados); novo.add(id);
    setDescartados(novo);
    salvarDescartados(novo);
  }

  function descartarTodos() {
    if (!visiveis.length) return;
    const novo = new Set(descartados);
    for (const a of visiveis) novo.add(a.id);
    setDescartados(novo);
    salvarDescartados(novo);
  }

  function restaurar() {
    setDescartados(new Set());
    salvarDescartados(new Set());
  }

  function clicarAlerta(a: Alerta) {
    if (onNavegar) {
      if (a.link === "estoque") onNavegar("estoque");
      else if (a.link === "financeiro-pagar" || a.link === "financeiro-receber") onNavegar("financeiro");
    }
    setAberto(false);
  }

  // Agrupa por tipo
  const grupos: Partial<Record<TipoAlerta, Alerta[]>> = {};
  for (const a of visiveis) {
    if (!grupos[a.tipo]) grupos[a.tipo] = [];
    grupos[a.tipo]!.push(a);
  }
  const ordemTipos: TipoAlerta[] = [
    "ESTOQUE_BAIXO",
    "CONTA_PAGAR_ATRASADA",
    "CONTA_RECEBER_ATRASADA",
    "CONTA_PAGAR_PROXIMA",
    "CONTA_RECEBER_PROXIMA",
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        title={totalVisivel > 0 ? `${totalVisivel} alerta(s)` : "Nenhum alerta"}
        className={`relative cursor-pointer text-gp-text text-[18px] leading-none rounded-[10px] px-[10px] py-2 ${
          aberto ? "bg-gp-card border border-gp-border" : "bg-transparent border border-transparent"
        }`}
      >
        🔔
        {totalVisivel > 0 && (
          <span
            className="absolute top-[2px] right-[2px] text-gp-white rounded-full min-w-[18px] h-[18px] px-[5px] text-[10px] font-extrabold flex items-center justify-center border-2 border-gp-surface"
            style={{ background: corBadge }}
          >
            {totalVisivel > 99 ? "99+" : totalVisivel}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute top-[calc(100%+8px)] right-0 w-[380px] max-h-[70vh] overflow-y-auto bg-gp-card border border-gp-border rounded-xl shadow-[0_10px_32px_rgba(0,0,0,0.5)] z-[60]">
          {/* Cabeçalho */}
          <div className="sticky top-0 z-[1] bg-gp-card border-b border-gp-border px-4 py-[14px] flex justify-between items-center">
            <div>
              <div className="text-gp-white text-[14px] font-bold">🔔 Notificações</div>
              <div className="text-gp-muted text-[11px] mt-[2px]">
                {totalVisivel === 0
                  ? "Tudo em ordem por aqui"
                  : `${totalVisivel} alerta${totalVisivel === 1 ? "" : "s"}${alta > 0 ? ` · ${alta} crítico${alta === 1 ? "" : "s"}` : ""}`}
              </div>
            </div>
            <div className="flex gap-[6px]">
              {descartados.size > 0 && (
                <button
                  onClick={restaurar}
                  title="Restaurar descartados"
                  className="bg-transparent border border-gp-border text-gp-muted rounded-md px-2 py-1 text-[10px] font-semibold cursor-pointer"
                >
                  ↺ {descartados.size}
                </button>
              )}
              {visiveis.length > 0 && (
                <button
                  onClick={descartarTodos}
                  title="Marcar todos como lidos"
                  className="bg-transparent border border-gp-border text-gp-muted rounded-md px-2 py-1 text-[10px] font-semibold cursor-pointer"
                >
                  ✓ Tudo
                </button>
              )}
            </div>
          </div>

          {/* Conteúdo */}
          {erro ? (
            <div className="p-5 text-gp-red text-xs text-center">{erro}</div>
          ) : carregandoInicial ? (
            <div className="p-5 text-gp-muted text-xs text-center">Carregando...</div>
          ) : visiveis.length === 0 ? (
            <div className="px-5 py-[30px] text-gp-muted text-xs text-center">
              ✓ Nenhum alerta ativo no momento
            </div>
          ) : (
            ordemTipos
              .filter((t) => grupos[t]?.length)
              .map((tipo) => {
                const lista = grupos[tipo]!;
                const meta = ROTULO_TIPO[tipo];
                return (
                  <div key={tipo}>
                    <div className="px-[14px] pt-[10px] pb-[6px] text-gp-muted text-[10px] font-extrabold uppercase tracking-[0.6px] flex items-center gap-[6px]">
                      <span>{meta.icone}</span>
                      <span>{meta.label}</span>
                      <span className="bg-gp-surface border border-gp-border rounded-full px-[7px] py-[1px] text-[10px] text-gp-text">
                        {lista.length}
                      </span>
                    </div>
                    {lista.map((a) => (
                      <ItemAlerta key={a.id} alerta={a} onClicar={clicarAlerta} onDescartar={descartar} />
                    ))}
                  </div>
                );
              })
          )}

          {dados?.geradoEm && (
            <div className="px-[14px] py-2 border-t border-gp-border text-gp-muted text-[10px] text-center">
              Atualizado às {new Date(dados.geradoEm).toLocaleTimeString("pt-BR")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ItemAlertaProps {
  alerta: Alerta;
  onClicar: (a: Alerta) => void;
  onDescartar: (id: string) => void;
}

function ItemAlerta({ alerta, onClicar, onDescartar }: ItemAlertaProps) {
  const cor = COR_SEVERIDADE[alerta.severidade] || C.muted;
  return (
    <div
      className="px-[14px] py-[10px] grid grid-cols-[4px_1fr_auto] gap-[10px] items-start"
      style={{ borderBottom: `1px solid ${C.border}22` }}
    >
      <div className="w-[4px] self-stretch rounded-[2px]" style={{ background: cor }} />
      <button
        onClick={() => onClicar(alerta)}
        className="bg-transparent border-none p-0 text-left cursor-pointer text-gp-text w-full"
      >
        <div className="text-[11px] font-bold mb-[2px]" style={{ color: cor }}>
          {alerta.titulo}
        </div>
        <div className="text-gp-white text-[13px] font-semibold">
          {alerta.descricao}
        </div>
        <div className="text-gp-muted text-[11px] mt-1 flex flex-wrap gap-2 items-center">
          {alerta.complemento && <span>{alerta.complemento}</span>}
          {alerta.valor != null && (
            <span className="font-bold" style={{ color: cor }}>{fmtBRL(alerta.valor)}</span>
          )}
          {alerta.data && <span>vence {fmtData(alerta.data)}</span>}
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDescartar(alerta.id); }}
        title="Descartar"
        className="bg-transparent border-none text-gp-muted text-sm cursor-pointer px-1 py-[2px]"
      >
        ×
      </button>
    </div>
  );
}
