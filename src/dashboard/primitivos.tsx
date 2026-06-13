// Primitivos visuais do Dashboard (extraidos de Dashboard.tsx, Fase 5):
// controles de header, KpiCard executivo, MiniTile, Card/CardHead, skeleton.
import { useState } from "react";
import { C } from "../lib/theme";
import { FONT_SANS, FONT_MONO } from "./comum";
import { IconRefresh } from "./icones";

const OPCOES_PERIODO = [
  { chave: "hoje", label: "Hoje" },
  { chave: "7dias", label: "7 dias" },
  { chave: "30dias", label: "30 dias" },
  { chave: "mes", label: "Mês" },
  { chave: "ano", label: "Ano" },
];

export function SegmentedPeriodo({
  valor = "7dias",
  onChange,
}: {
  valor?: string;
  onChange?: (chave: string) => void;
}) {
  return (
    <div style={{
      display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 10,
      background: C.card, padding: 3, gap: 2,
    }}>
      {OPCOES_PERIODO.map(({ chave, label }) => {
        const ativo = chave === valor;
        return (
          <button
            key={chave}
            onClick={() => onChange?.(chave)}
            aria-pressed={ativo ? "true" : "false"}
            style={{
              border: 0, background: ativo ? "rgba(255,255,255,0.08)" : "transparent",
              color: ativo ? C.white : C.muted,
              height: 28, padding: "0 12px", borderRadius: 7,
              fontSize: 12, fontWeight: 600, letterSpacing: "0.02em",
              fontFamily: FONT_SANS,
              cursor: ativo ? "default" : "pointer",
              opacity: ativo ? 1 : 0.85,
              transition: "color .12s, background .12s",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function BotaoAtualizar({ onClick, contagem }: any) {
  return (
    <button
      onClick={onClick}
      title={contagem !== undefined ? `Atualiza automaticamente em ${contagem}s` : ""}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        height: 32, padding: "0 14px", borderRadius: 8,
        background: `linear-gradient(180deg, ${C.accent}55, ${C.card})`,
        border: `1px solid ${C.accent}77`, color: C.white,
        fontSize: 12.5, fontWeight: 700, letterSpacing: "0.02em",
        cursor: "pointer", fontFamily: FONT_SANS,
      }}
    >
      <IconRefresh /> Atualizar
      {contagem !== undefined && (
        <span style={{
          fontSize: 10, fontFamily: FONT_MONO, color: C.muted,
          background: "rgba(0,0,0,0.25)", borderRadius: 4,
          padding: "1px 5px", fontWeight: 500,
        }}>{contagem}s</span>
      )}
    </button>
  );
}

// ============================================================
// KPI Card
// ============================================================

export function KpiCard({ cor, icone, rotulo, valor, descricao, comparativo, delta, sparkline }: any) {
  return (
    <article style={{
      background: `linear-gradient(180deg, ${C.card}, ${C.surface})`,
      border: "1px solid var(--hairline-soft)", borderRadius: 14,
      boxShadow: "var(--shadow-card)",
      padding: 18, position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "inherit",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%)",
        pointerEvents: "none",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          display: "grid", placeItems: "center",
          color: cor,
          background: cor + "1f",
          border: `1px solid ${cor}55`,
        }}>{icone}</div>
        <div style={{
          fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
          color: C.muted, fontWeight: 700,
        }}>{rotulo}</div>
        {delta && <DeltaPill {...delta} style={{ marginLeft: "auto" }} />}
      </div>

      <div style={{
        fontSize: 28, fontWeight: 600, letterSpacing: "-0.025em",
        color: C.white, marginTop: 10,
        fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums",
        position: "relative",
      }}>
        {valor.reais}
        {valor.centavos && (
          <small style={{
            fontSize: 14, fontWeight: 500, color: C.muted, marginLeft: 1,
            fontFamily: FONT_MONO,
          }}>{valor.centavos}</small>
        )}
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginTop: 10, fontSize: 11.5, color: C.muted, gap: 8, position: "relative",
      }}>
        <span>{descricao}</span>
        {comparativo && (
          <span style={{ fontFamily: FONT_MONO }}>{comparativo}</span>
        )}
      </div>

      {sparkline && (
        <div style={{ marginTop: 12, height: 36, position: "relative" }}>
          {sparkline}
        </div>
      )}
    </article>
  );
}

export function DeltaPill({ texto, tipo, style }: any) {
  const cores = {
    up: { bg: C.green + "22", fg: C.green },
    down: { bg: C.red + "22", fg: C.red },
    flat: { bg: "rgba(255,255,255,0.05)", fg: C.muted },
  };
  const cor = cores[tipo] || cores.flat;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontWeight: 600, padding: "2px 8px", borderRadius: 999,
      fontSize: 11, color: cor.fg, background: cor.bg,
      whiteSpace: "nowrap",
      ...style,
    }}>{texto}</span>
  );
}

export function Sparkline({ cor, pontos }: any) {
  if (!pontos || pontos.length < 2) {
    return (
      <svg viewBox="0 0 200 36" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
        <line x1="0" y1="30" x2="200" y2="30" stroke={C.border} strokeDasharray="3 3" />
      </svg>
    );
  }
  const max = Math.max(1, ...pontos.map(Number).filter(Number.isFinite));
  const w = 200, h = 36, top = 4, bot = h - 2;
  const xs = pontos.map((_, i) => (i / (pontos.length - 1)) * w);
  const ys = pontos.map(p => {
    const v = Number(p) || 0;
    return bot - (v / max) * (bot - top);
  });
  const linha = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const fill = `${linha} L${w},${h} L0,${h} Z`;
  const id = "sp-" + Math.random().toString(36).slice(2, 9);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={cor} stopOpacity="0.45" />
          <stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${id})`} />
      <path d={linha} fill="none" stroke={cor} strokeWidth="1.5" />
    </svg>
  );
}

// ============================================================
// Mini-tiles
// ============================================================

export function MiniTile({ icone, label, valor, hint, warn, tagDelta }: any) {
  return (
    <article style={{
      background: warn
        ? `linear-gradient(180deg, ${C.yellow}15, ${C.card})`
        : `linear-gradient(180deg, ${C.card}, ${C.surface})`,
      border: `1px solid ${warn ? C.yellow + "55" : "var(--hairline-soft)"}`,
      borderRadius: 14, padding: "14px 16px", boxShadow: "var(--shadow-card)",
      display: "flex", alignItems: "center", gap: 12,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "inherit",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%)",
        pointerEvents: "none",
      }} />
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        display: "grid", placeItems: "center",
        color: warn ? C.yellow : C.muted,
        background: warn ? C.yellow + "1f" : "rgba(255,255,255,0.04)",
        border: `1px solid ${warn ? C.yellow + "55" : C.border}`,
      }}>{icone}</div>
      <div style={{ position: "relative" }}>
        <div style={{
          fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase",
          color: C.muted, fontWeight: 700,
        }}>{label}</div>
        <div style={{
          fontSize: 20, fontWeight: 600, letterSpacing: "-0.025em",
          color: warn ? C.yellow : C.white, marginTop: 2,
          fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums",
        }}>{valor}</div>
      </div>
      <div style={{ marginLeft: "auto", textAlign: "right", position: "relative" }}>
        {tagDelta && <DeltaPill {...tagDelta} />}
        {hint && (
          <div style={{
            fontSize: 10, color: C.muted, marginTop: tagDelta ? 4 : 0,
            fontFamily: FONT_MONO,
          }}>{hint}</div>
        )}
      </div>
    </article>
  );
}

// ============================================================
// Cards genéricos
// ============================================================

export function Card({ children, padding = 18, style }: any) {
  return (
    <article style={{
      background: `linear-gradient(180deg, ${C.card}, ${C.surface})`,
      border: "1px solid var(--hairline-soft)", borderRadius: 14,
      boxShadow: "var(--shadow-card)",
      padding, position: "relative", overflow: "hidden", ...style,
    }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: "inherit",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%)",
        pointerEvents: "none",
      }} />
      <div style={{ position: "relative" }}>{children}</div>
    </article>
  );
}

export function CardHead({ titulo, meta, acessorio }: any) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
    }}>
      <h3 style={{
        margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: "0.02em",
        color: C.text,
      }}>{titulo}</h3>
      {meta && (
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: C.muted }}>
          {meta}
        </span>
      )}
      {acessorio && (
        <span style={{ marginLeft: meta ? 0 : "auto" }}>{acessorio}</span>
      )}
    </div>
  );
}

// ============================================================
// Gráfico de vendas semana
// ============================================================


export function SkeletonDashboard() {
  const sk = (h) => ({
    height: h, borderRadius: 14,
    background: `linear-gradient(180deg, ${C.card}, ${C.surface})`,
    border: `1px solid ${C.border}`,
    opacity: 0.65,
  });
  return (
    <div style={{ fontFamily: FONT_SANS }}>
      <div style={{
        height: 44, borderRadius: 8, width: 260, marginBottom: 18,
        background: C.card, border: `1px solid ${C.border}`, opacity: 0.65,
      }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 14 }}>
        {[0,1,2,3].map(i => <div key={i} style={sk(124)} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 14 }}>
        {[0,1,2,3,4,5].map(i => <div key={i} style={sk(72)} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)", gap: 14, marginBottom: 14 }}>
        <div style={sk(296)} />
        <div style={sk(296)} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 14 }}>
        <div style={sk(200)} />
        <div style={sk(200)} />
      </div>
    </div>
  );
}

export function Vazio({ texto }: any) {
  return (
    <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "16px 0" }}>
      {texto}
    </div>
  );
}

// ============================================================
// Ícones (SVG inline, stroke 1.8)
// ============================================================

