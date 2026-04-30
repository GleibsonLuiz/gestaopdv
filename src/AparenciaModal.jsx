import { useState } from "react";
import { C, TEMAS, aplicarTema, lerTemaSalvo, salvarTema } from "./lib/theme.js";

// Modal de configuracao de aparencia. O usuario escolhe entre os temas em
// TEMAS — ao clicar em um card a paleta e aplicada imediatamente
// (preview ao vivo) e persistida em localStorage. Ao fechar via "Concluir"
// a escolha ja esta salva.
export default function AparenciaModal({ onFechar }) {
  const [temaAtual, setTemaAtual] = useState(() => lerTemaSalvo());

  function escolher(id) {
    setTemaAtual(id);
    aplicarTema(id);
    salvarTema(id);
  }

  return (
    <div onClick={onFechar} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
        width: "100%", maxWidth: 640, maxHeight: "92vh", overflowY: "auto", padding: 24,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          marginBottom: 4,
        }}>
          <div>
            <div style={{ color: C.white, fontWeight: 800, fontSize: 18 }}>
              🎨 Aparência
            </div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
              Escolha o tema do sistema. A mudança é aplicada imediatamente.
            </div>
          </div>
          <button onClick={onFechar} style={{
            background: "transparent", border: "none", color: C.muted,
            fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        <div style={{
          display: "grid", gap: 12, marginTop: 18,
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        }}>
          {TEMAS.map(tema => (
            <CardTema
              key={tema.id}
              tema={tema}
              ativo={tema.id === temaAtual}
              onSelecionar={() => escolher(tema.id)}
            />
          ))}
        </div>

        <div style={{
          marginTop: 18, padding: "10px 14px",
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 8, color: C.muted, fontSize: 11, lineHeight: 1.5,
        }}>
          A preferência fica salva neste navegador. Em breve será sincronizada
          com sua conta para acompanhar você em qualquer dispositivo.
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onFechar} style={{
            background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
            color: C.white, border: "none", borderRadius: 8,
            padding: "10px 22px", fontWeight: 700, fontSize: 13, cursor: "pointer",
          }}>Concluir</button>
        </div>
      </div>
    </div>
  );
}

function CardTema({ tema, ativo, onSelecionar }) {
  const cores = tema.cores;

  return (
    <button onClick={onSelecionar} style={{
      textAlign: "left", padding: 0, cursor: "pointer",
      background: cores.surface,
      border: `2px solid ${ativo ? cores.accent : C.border}`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: ativo ? `0 4px 16px ${cores.accent}55` : "none",
      transition: "border-color 0.2s ease, box-shadow 0.2s ease",
    }}>
      {/* Preview com as cores do proprio tema (independente do tema ativo) */}
      <div style={{ background: cores.bg, padding: 14 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <Bolinha cor={cores.accent} />
          <Bolinha cor={cores.purple} />
          <Bolinha cor={cores.green} />
          <Bolinha cor={cores.yellow} />
          <Bolinha cor={cores.red} />
        </div>
        <div style={{
          background: cores.card, border: `1px solid ${cores.border}`,
          borderRadius: 6, padding: "8px 10px",
        }}>
          <div style={{ height: 6, width: "60%", background: cores.text, borderRadius: 3, opacity: 0.85 }} />
          <div style={{ height: 4, width: "40%", background: cores.muted, borderRadius: 2, marginTop: 6 }} />
        </div>
        <div style={{
          marginTop: 8, height: 24, borderRadius: 6,
          background: `linear-gradient(135deg, ${cores.accent}, ${cores.purple})`,
        }} />
      </div>

      {/* Nome + descricao usam o tema GLOBAL para nao quebrar contraste */}
      <div style={{
        padding: "10px 14px",
        background: C.surface, borderTop: `1px solid ${C.border}`,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 2,
        }}>
          <div style={{ color: C.white, fontWeight: 700, fontSize: 14 }}>
            {tema.nome}
          </div>
          {ativo && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
              background: C.accent + "22", color: C.accent,
              border: `1px solid ${C.accent}55`,
            }}>ATIVO</span>
          )}
        </div>
        <div style={{ color: C.muted, fontSize: 11 }}>{tema.descricao}</div>
      </div>
    </button>
  );
}

function Bolinha({ cor }) {
  return (
    <div style={{
      width: 10, height: 10, borderRadius: "50%", background: cor,
    }} />
  );
}
