import { useEffect, useMemo, useState, useCallback } from "react";
import { C } from "./lib/theme.js";
import { api } from "./lib/api.js";

const fmtData = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
};

const fmtDataHora = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const CLASSIFICACOES = {
  PROMOTOR:  { label: "Promotor",  cor: C.green,  icone: "⭐", desc: "9-10" },
  NEUTRO:    { label: "Neutro",    cor: C.yellow, icone: "😐", desc: "7-8" },
  DETRATOR:  { label: "Detrator",  cor: C.red,    icone: "💔", desc: "0-6" },
};

function linkPublicoNps(token) {
  return `${window.location.origin}/?nps=${token}`;
}

// ============ COMPONENTE PRINCIPAL ============

export default function Nps() {
  const [resumo, setResumo] = useState(null);
  const [pesquisas, setPesquisas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [janela, setJanela] = useState(90);
  const [filtro, setFiltro] = useState("RESPONDIDAS");
  const [copiado, setCopiado] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const [r, ps] = await Promise.all([
        api.resumoNps({ dias: janela }),
        api.listarPesquisasNps({ status: filtro, limite: 100 }),
      ]);
      setResumo(r);
      setPesquisas(ps);
    } catch (e) {
      setErro(e.message || "Erro ao carregar");
    } finally {
      setCarregando(false);
    }
  }, [janela, filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  function copiarLink(token) {
    const link = linkPublicoNps(token);
    navigator.clipboard.writeText(link)
      .then(() => {
        setCopiado(token);
        setTimeout(() => setCopiado((cur) => (cur === token ? null : cur)), 1500);
      })
      .catch(() => alert("Não foi possível copiar"));
  }

  return (
    <div style={{ padding: 16, color: C.text }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, color: C.white, fontSize: 22, fontWeight: 700 }}>
            ⭐ NPS Pós-Venda
          </h2>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
            Pesquisas geradas automaticamente após cada venda concluída com cliente
          </div>
        </div>
        <select
          value={janela}
          onChange={(e) => setJanela(parseInt(e.target.value, 10))}
          style={{
            background: C.card, color: C.text, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: "8px 12px", fontSize: 13, width: 200,
          }}
        >
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
          <option value={180}>Últimos 180 dias</option>
          <option value={365}>Últimos 365 dias</option>
        </select>
      </div>

      {erro && (
        <div style={{ background: C.red + "22", color: C.red, padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {erro}
        </div>
      )}

      {/* KPIs principais */}
      {resumo && (
        <>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10, marginBottom: 12,
          }}>
            <KpiNps resumo={resumo} />
            <Kpi label="Respostas" valor={`${resumo.respondidas} / ${resumo.total}`}
                 icone="📝" cor={C.accent} sub={`${resumo.taxaResposta.toFixed(1)}% de taxa`} />
            <Kpi label="Nota média" valor={resumo.notaMedia != null ? resumo.notaMedia.toFixed(1) : "—"}
                 icone="🎯" cor={C.purple || "#7c3aed"} sub="Em uma escala de 0-10" />
            <Kpi label="Promotores" valor={String(resumo.promotores)} icone="⭐" cor={C.green}
                 sub={resumo.respondidas > 0 ? `${((resumo.promotores / resumo.respondidas) * 100).toFixed(0)}%` : ""} />
            <Kpi label="Neutros" valor={String(resumo.neutros)} icone="😐" cor={C.yellow}
                 sub={resumo.respondidas > 0 ? `${((resumo.neutros / resumo.respondidas) * 100).toFixed(0)}%` : ""} />
            <Kpi label="Detratores" valor={String(resumo.detratores)} icone="💔" cor={C.red}
                 sub={resumo.respondidas > 0 ? `${((resumo.detratores / resumo.respondidas) * 100).toFixed(0)}%` : ""} />
          </div>

          {/* Barra de distribuicao */}
          {resumo.respondidas > 0 && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: 600 }}>
                Distribuição
              </div>
              <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", background: C.bg, border: `1px solid ${C.border}` }}>
                <div style={{
                  width: `${(resumo.detratores / resumo.respondidas) * 100}%`,
                  background: C.red, display: "flex", alignItems: "center", justifyContent: "center",
                  color: C.white, fontSize: 11, fontWeight: 700,
                }}>{resumo.detratores > 0 ? resumo.detratores : ""}</div>
                <div style={{
                  width: `${(resumo.neutros / resumo.respondidas) * 100}%`,
                  background: C.yellow, display: "flex", alignItems: "center", justifyContent: "center",
                  color: C.white, fontSize: 11, fontWeight: 700,
                }}>{resumo.neutros > 0 ? resumo.neutros : ""}</div>
                <div style={{
                  width: `${(resumo.promotores / resumo.respondidas) * 100}%`,
                  background: C.green, display: "flex", alignItems: "center", justifyContent: "center",
                  color: C.white, fontSize: 11, fontWeight: 700,
                }}>{resumo.promotores > 0 ? resumo.promotores : ""}</div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Filtro de lista */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10, borderBottom: `1px solid ${C.border}` }}>
        {[
          { id: "RESPONDIDAS", label: "📝 Respondidas" },
          { id: "PENDENTES",   label: "⏳ Pendentes (copiar link)" },
          { id: "TODAS",       label: "Todas" },
        ].map((b) => (
          <button
            key={b.id}
            onClick={() => setFiltro(b.id)}
            style={{
              background: "transparent",
              color: filtro === b.id ? C.accent : C.muted,
              border: "none",
              borderBottom: `2px solid ${filtro === b.id ? C.accent : "transparent"}`,
              padding: "8px 14px", fontSize: 12,
              fontWeight: filtro === b.id ? 700 : 500, cursor: "pointer", marginBottom: -1,
            }}
          >{b.label}</button>
        ))}
      </div>

      {/* Lista */}
      {carregando ? (
        <div style={{ color: C.muted, padding: 30, textAlign: "center" }}>Carregando...</div>
      ) : pesquisas.length === 0 ? (
        <div style={{ color: C.muted, padding: 40, textAlign: "center", background: C.surface, borderRadius: 8, fontSize: 13 }}>
          {filtro === "PENDENTES"
            ? "Nenhuma pesquisa pendente — todos os clientes ja responderam ou nao ha vendas recentes."
            : filtro === "RESPONDIDAS"
            ? "Nenhuma resposta registrada ainda. Pesquisas pendentes podem ser copiadas na aba ao lado."
            : "Nenhuma pesquisa registrada."}
        </div>
      ) : (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
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

function KpiNps({ resumo }) {
  const score = resumo.npsScore;
  let cor = C.muted;
  let interp = "Sem dados";
  if (score != null) {
    if (score >= 50) { cor = C.green; interp = "Excelente"; }
    else if (score >= 0) { cor = C.yellow; interp = "Razoável"; }
    else { cor = C.red; interp = "Crítico"; }
  }
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderLeft: `3px solid ${cor}`,
      borderRadius: 8, padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
        <span>🎯</span> NPS Score
      </div>
      <div style={{ color: cor, fontSize: 28, fontWeight: 800, marginTop: 2 }}>
        {score != null ? Math.round(score) : "—"}
      </div>
      <div style={{ color: C.muted, fontSize: 11 }}>{interp} · ({"%P − %D"})</div>
    </div>
  );
}

function Kpi({ label, valor, icone, cor, sub }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderLeft: `3px solid ${cor}`,
      borderRadius: 8, padding: "12px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
        <span>{icone}</span> {label}
      </div>
      <div style={{ color: C.white, fontSize: 22, fontWeight: 700, marginTop: 4 }}>{valor}</div>
      {sub && <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ============ ITEM DA LISTA ============

function ItemPesquisa({ p, copiado, onCopiar }) {
  const respondida = !!p.respondidaEm;
  const cls = p.classificacao ? CLASSIFICACOES[p.classificacao] : null;

  return (
    <div style={{
      padding: "12px 16px", borderTop: `1px solid ${C.border}`,
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
    }}>
      {/* Nota / Status */}
      <div style={{
        width: 60, flexShrink: 0, textAlign: "center",
      }}>
        {respondida && cls ? (
          <>
            <div style={{
              color: cls.cor, fontSize: 28, fontWeight: 800, lineHeight: 1,
            }}>{p.nota}</div>
            <div style={{ color: cls.cor, fontSize: 9, fontWeight: 700, marginTop: 2 }}>
              {cls.icone} {cls.label.toUpperCase()}
            </div>
          </>
        ) : (
          <div style={{
            color: C.muted, fontSize: 11, fontWeight: 700,
            background: C.bg, padding: "8px 0", borderRadius: 4, border: `1px dashed ${C.border}`,
          }}>⏳ AGUARDANDO</div>
        )}
      </div>

      {/* Cliente / Venda */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.white, fontWeight: 600, fontSize: 13 }}>
          {p.cliente?.nome || "—"}
        </div>
        <div style={{ color: C.muted, fontSize: 11 }}>
          Venda #{p.venda?.numero} de {fmtData(p.venda?.createdAt)}
          {respondida && ` · respondida em ${fmtDataHora(p.respondidaEm)}`}
        </div>
        {respondida && p.comentario && (
          <div style={{
            color: C.text, fontSize: 12, marginTop: 6,
            padding: "6px 10px", background: C.bg, borderRadius: 4, fontStyle: "italic",
            borderLeft: `2px solid ${cls?.cor || C.accent}`,
          }}>
            "{p.comentario}"
          </div>
        )}
      </div>

      {/* Ações */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {!respondida && p.cliente?.telefone && (() => {
          const link = linkPublicoNps(p.token);
          const msg = `Olá ${primeiroNome(p.cliente.nome)}, gostaríamos de saber sua opinião sobre nosso atendimento. Pode responder rapidinho? ${link}`;
          const tel = String(p.cliente.telefone).replace(/\D/g, "");
          const numero = tel.length <= 11 ? `55${tel}` : tel;
          return (
            <a
              href={`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`}
              target="_blank" rel="noopener noreferrer"
              title="Enviar por WhatsApp"
              style={{
                background: C.green + "22", color: C.green, borderRadius: 4,
                padding: "6px 10px", textDecoration: "none", fontSize: 12, fontWeight: 700,
                border: `1px solid ${C.green}44`, display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >💬 Enviar</a>
          );
        })()}
        <button
          onClick={onCopiar}
          title="Copiar link da pesquisa"
          style={{
            background: copiado ? C.green + "22" : C.card,
            color: copiado ? C.green : C.text,
            border: `1px solid ${copiado ? C.green + "55" : C.border}`,
            padding: "6px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600,
          }}
        >{copiado ? "✓ Copiado" : "🔗 Copiar link"}</button>
      </div>
    </div>
  );
}

function primeiroNome(nomeCompleto) {
  return String(nomeCompleto || "").trim().split(/\s+/)[0] || "";
}
