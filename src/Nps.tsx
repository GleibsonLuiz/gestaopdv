import { useEffect, useState, useCallback } from "react";
import { C } from "./lib/theme";
import { api } from "./lib/api";
import { fmtData, fmtDataHora } from "./lib/format";


type Classificacao = "PROMOTOR" | "NEUTRO" | "DETRATOR";

interface ClassMeta {
  label: string;
  cor: string;
  icone: string;
  desc: string;
}

const CLASSIFICACOES: Record<Classificacao, ClassMeta> = {
  PROMOTOR: { label: "Promotor", cor: C.green,  icone: "⭐", desc: "9-10" },
  NEUTRO:   { label: "Neutro",   cor: C.yellow, icone: "😐", desc: "7-8" },
  DETRATOR: { label: "Detrator", cor: C.red,    icone: "💔", desc: "0-6" },
};

interface ResumoNps {
  total: number;
  respondidas: number;
  taxaResposta: number;
  notaMedia: number | null;
  promotores: number;
  neutros: number;
  detratores: number;
  npsScore: number | null;
}

interface ClienteRef {
  nome?: string;
  telefone?: string;
}

interface VendaRef {
  numero?: string | number;
  createdAt?: string;
}

interface PesquisaNps {
  id: string;
  token: string;
  nota?: number;
  comentario?: string;
  respondidaEm?: string;
  classificacao?: Classificacao;
  cliente?: ClienteRef;
  venda?: VendaRef;
}

type FiltroLista = "RESPONDIDAS" | "PENDENTES" | "TODAS";

function linkPublicoNps(token: string): string {
  return `${window.location.origin}/?nps=${token}`;
}

// ============ COMPONENTE PRINCIPAL ============

export default function Nps() {
  const [resumo, setResumo] = useState<ResumoNps | null>(null);
  const [pesquisas, setPesquisas] = useState<PesquisaNps[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [janela, setJanela] = useState(90);
  const [filtro, setFiltro] = useState<FiltroLista>("RESPONDIDAS");
  const [copiado, setCopiado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [r, ps] = await Promise.all([
        api.resumoNps({ dias: janela }),
        api.listarPesquisasNps({ status: filtro, limite: 100 }),
      ]);
      setResumo(r as ResumoNps);
      setPesquisas(ps as PesquisaNps[]);
    } catch (e) {
      setErro((e as Error).message || "Erro ao carregar");
    } finally {
      setCarregando(false);
    }
  }, [janela, filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  function copiarLink(token: string) {
    const link = linkPublicoNps(token);
    navigator.clipboard.writeText(link)
      .then(() => {
        setCopiado(token);
        setTimeout(() => setCopiado((cur) => (cur === token ? null : cur)), 1500);
      })
      .catch(() => alert("Não foi possível copiar"));
  }

  return (
    <div className="p-4 text-gp-text">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="m-0 text-gp-white text-[22px] font-bold">
            ⭐ NPS Pós-Venda
          </h2>
          <div className="text-gp-muted text-[13px] mt-[2px]">
            Pesquisas geradas automaticamente após cada venda concluída com cliente
          </div>
        </div>
        <select
          value={janela}
          onChange={(e) => setJanela(parseInt(e.target.value, 10))}
          className="bg-gp-card text-gp-text rounded-md px-3 py-2 text-[13px] w-[200px]"
          style={{ border: `1px solid ${C.border}` }}
          aria-label="Período de análise"
        >
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
          <option value={180}>Últimos 180 dias</option>
          <option value={365}>Últimos 365 dias</option>
        </select>
      </div>

      {erro && (
        <div
          className="rounded-lg px-[14px] py-[10px] mb-3 text-[13px] text-gp-red"
          style={{ background: C.red + "22" }}
        >
          {erro}
        </div>
      )}

      {/* KPIs principais */}
      {resumo && (
        <>
          <div
            className="grid gap-[10px] mb-3"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
          >
            <KpiNps resumo={resumo} />
            <Kpi
              label="Respostas"
              valor={`${resumo.respondidas} / ${resumo.total}`}
              icone="📝"
              cor={C.accent}
              sub={`${resumo.taxaResposta.toFixed(1)}% de taxa`}
            />
            <Kpi
              label="Nota média"
              valor={resumo.notaMedia != null ? resumo.notaMedia.toFixed(1) : "—"}
              icone="🎯"
              cor={C.purple || "#7c3aed"}
              sub="Em uma escala de 0-10"
            />
            <Kpi
              label="Promotores"
              valor={String(resumo.promotores)}
              icone="⭐"
              cor={C.green}
              sub={resumo.respondidas > 0 ? `${((resumo.promotores / resumo.respondidas) * 100).toFixed(0)}%` : ""}
            />
            <Kpi
              label="Neutros"
              valor={String(resumo.neutros)}
              icone="😐"
              cor={C.yellow}
              sub={resumo.respondidas > 0 ? `${((resumo.neutros / resumo.respondidas) * 100).toFixed(0)}%` : ""}
            />
            <Kpi
              label="Detratores"
              valor={String(resumo.detratores)}
              icone="💔"
              cor={C.red}
              sub={resumo.respondidas > 0 ? `${((resumo.detratores / resumo.respondidas) * 100).toFixed(0)}%` : ""}
            />
          </div>

          {/* Barra de distribuicao */}
          {resumo.respondidas > 0 && (
            <div
              className="bg-gp-surface rounded-lg px-4 py-3 mb-4"
              style={{ border: `1px solid ${C.border}` }}
            >
              <div className="text-gp-muted text-[11px] uppercase tracking-[0.5px] mb-[6px] font-semibold">
                Distribuição
              </div>
              <div
                className="flex h-6 rounded-md overflow-hidden bg-gp-bg"
                style={{ border: `1px solid ${C.border}` }}
              >
                <div
                  className="flex items-center justify-center text-gp-white text-[11px] font-bold"
                  style={{
                    width: `${(resumo.detratores / resumo.respondidas) * 100}%`,
                    background: C.red,
                  }}
                >
                  {resumo.detratores > 0 ? resumo.detratores : ""}
                </div>
                <div
                  className="flex items-center justify-center text-gp-white text-[11px] font-bold"
                  style={{
                    width: `${(resumo.neutros / resumo.respondidas) * 100}%`,
                    background: C.yellow,
                  }}
                >
                  {resumo.neutros > 0 ? resumo.neutros : ""}
                </div>
                <div
                  className="flex items-center justify-center text-gp-white text-[11px] font-bold"
                  style={{
                    width: `${(resumo.promotores / resumo.respondidas) * 100}%`,
                    background: C.green,
                  }}
                >
                  {resumo.promotores > 0 ? resumo.promotores : ""}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Filtro de lista */}
      <div
        className="flex gap-1 mb-[10px]"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        {([
          { id: "RESPONDIDAS", label: "📝 Respondidas" },
          { id: "PENDENTES",   label: "⏳ Pendentes (copiar link)" },
          { id: "TODAS",       label: "Todas" },
        ] as { id: FiltroLista; label: string }[]).map((b) => (
          <button
            key={b.id}
            onClick={() => setFiltro(b.id)}
            className="bg-transparent border-none px-[14px] py-2 text-xs cursor-pointer -mb-px"
            style={{
              color: filtro === b.id ? C.accent : C.muted,
              borderBottom: `2px solid ${filtro === b.id ? C.accent : "transparent"}`,
              fontWeight: filtro === b.id ? 700 : 500,
            }}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {carregando ? (
        <div className="text-gp-muted p-[30px] text-center">Carregando...</div>
      ) : pesquisas.length === 0 ? (
        <div className="text-gp-muted py-10 text-center bg-gp-surface rounded-lg text-[13px]">
          {filtro === "PENDENTES"
            ? "Nenhuma pesquisa pendente — todos os clientes ja responderam ou nao ha vendas recentes."
            : filtro === "RESPONDIDAS"
            ? "Nenhuma resposta registrada ainda. Pesquisas pendentes podem ser copiadas na aba ao lado."
            : "Nenhuma pesquisa registrada."}
        </div>
      ) : (
        <div
          className="bg-gp-surface rounded-lg overflow-hidden"
          style={{ border: `1px solid ${C.border}` }}
        >
          {pesquisas.map((p) => (
            <ItemPesquisa
              key={p.id}
              p={p}
              copiado={copiado === p.token}
              onCopiar={() => copiarLink(p.token)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============ KPI NPS PRINCIPAL ============

function KpiNps({ resumo }: { resumo: ResumoNps }) {
  const score = resumo.npsScore;
  let cor = C.muted;
  let interp = "Sem dados";
  if (score != null) {
    if (score >= 50) { cor = C.green; interp = "Excelente"; }
    else if (score >= 0) { cor = C.yellow; interp = "Razoável"; }
    else { cor = C.red; interp = "Crítico"; }
  }
  return (
    <div
      className="bg-gp-surface rounded-lg px-[14px] py-3"
      style={{
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${cor}`,
      }}
    >
      <div className="flex items-center gap-[6px] text-gp-muted text-[11px] uppercase tracking-[0.5px] font-semibold">
        <span>🎯</span> NPS Score
      </div>
      <div className="text-[28px] font-extrabold mt-[2px]" style={{ color: cor }}>
        {score != null ? Math.round(score) : "—"}
      </div>
      <div className="text-gp-muted text-[11px]">{interp} · ({"%P − %D"})</div>
    </div>
  );
}

interface KpiProps {
  label: string;
  valor: string;
  icone: string;
  cor: string;
  sub?: string;
}

function Kpi({ label, valor, icone, cor, sub }: KpiProps) {
  return (
    <div
      className="bg-gp-surface rounded-lg px-[14px] py-3"
      style={{
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${cor}`,
      }}
    >
      <div className="flex items-center gap-[6px] text-gp-muted text-[11px] uppercase tracking-[0.5px] font-semibold">
        <span>{icone}</span> {label}
      </div>
      <div className="text-gp-white text-[22px] font-bold mt-1">{valor}</div>
      {sub && <div className="text-gp-muted text-[11px] mt-[2px]">{sub}</div>}
    </div>
  );
}

// ============ ITEM DA LISTA ============

interface ItemPesquisaProps {
  p: PesquisaNps;
  copiado: boolean;
  onCopiar: () => void;
}

function ItemPesquisa({ p, copiado, onCopiar }: ItemPesquisaProps) {
  const respondida = !!p.respondidaEm;
  const cls = p.classificacao ? CLASSIFICACOES[p.classificacao] : null;

  return (
    <div
      className="px-4 py-3 flex items-center gap-3 flex-wrap"
      style={{ borderTop: `1px solid ${C.border}` }}
    >
      {/* Nota / Status */}
      <div className="w-[60px] shrink-0 text-center">
        {respondida && cls ? (
          <>
            <div className="text-[28px] font-extrabold leading-none" style={{ color: cls.cor }}>
              {p.nota}
            </div>
            <div className="text-[9px] font-bold mt-[2px]" style={{ color: cls.cor }}>
              {cls.icone} {cls.label.toUpperCase()}
            </div>
          </>
        ) : (
          <div
            className="text-gp-muted text-[11px] font-bold py-2 rounded bg-gp-bg"
            style={{ border: `1px dashed ${C.border}` }}
          >
            ⏳ AGUARDANDO
          </div>
        )}
      </div>

      {/* Cliente / Venda */}
      <div className="flex-1 min-w-0">
        <div className="text-gp-white font-semibold text-[13px]">
          {p.cliente?.nome || "—"}
        </div>
        <div className="text-gp-muted text-[11px]">
          Venda #{p.venda?.numero} de {fmtData(p.venda?.createdAt)}
          {respondida && ` · respondida em ${fmtDataHora(p.respondidaEm)}`}
        </div>
        {respondida && p.comentario && (
          <div
            className="text-gp-text text-xs mt-[6px] px-[10px] py-[6px] bg-gp-bg rounded italic"
            style={{ borderLeft: `2px solid ${cls?.cor || C.accent}` }}
          >
            "{p.comentario}"
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="flex gap-[6px] shrink-0">
        {!respondida && p.cliente?.telefone && (() => {
          const link = linkPublicoNps(p.token);
          const msg = `Olá ${primeiroNome(p.cliente.nome)}, gostaríamos de saber sua opinião sobre nosso atendimento. Pode responder rapidinho? ${link}`;
          const tel = String(p.cliente.telefone).replace(/\D/g, "");
          const numero = tel.length <= 11 ? `55${tel}` : tel;
          return (
            <a
              href={`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Enviar por WhatsApp"
              className="rounded px-[10px] py-[6px] no-underline text-xs font-bold inline-flex items-center gap-1 text-gp-green"
              style={{
                background: C.green + "22",
                border: `1px solid ${C.green}44`,
              }}
            >
              💬 Enviar
            </a>
          );
        })()}
        <button
          onClick={onCopiar}
          title="Copiar link da pesquisa"
          className="px-[10px] py-[6px] rounded cursor-pointer text-xs font-semibold"
          style={{
            background: copiado ? C.green + "22" : C.card,
            color: copiado ? C.green : C.text,
            border: `1px solid ${copiado ? C.green + "55" : C.border}`,
          }}
        >
          {copiado ? "✓ Copiado" : "🔗 Copiar link"}
        </button>
      </div>
    </div>
  );
}

function primeiroNome(nomeCompleto: string | null | undefined): string {
  return String(nomeCompleto || "").trim().split(/\s+/)[0] || "";
}
