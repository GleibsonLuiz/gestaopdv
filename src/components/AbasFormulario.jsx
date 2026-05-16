import { useState } from "react";
import { C } from "../lib/theme.js";

// ETAPA 14: navegacao por abas dentro de um <FormularioLuxuoso>. Cada aba
// recebe { id, icone, label, temErro } e o conteudo eh renderizado via
// children como funcao (recebe o indice da aba ativa).
//
// Uso:
//   <Abas
//     abas={[
//       { id: "gerais",   icone: "📋", label: "Dados Gerais",  temErro: false },
//       { id: "classif",  icone: "🏷️", label: "Classificacao", temErro: false },
//       { id: "fiscal",   icone: "📊", label: "Tributacao",    temErro: false },
//     ]}>
//     {(ativa) => (
//       <>
//         {ativa === 0 && <Secao>...</Secao>}
//         {ativa === 1 && <Secao>...</Secao>}
//         {ativa === 2 && <Secao>...</Secao>}
//       </>
//     )}
//   </Abas>
export function Abas({ inicial = 0, abas, children, ativaControlada, onMudar }) {
  const [interno, setInterno] = useState(inicial);
  const ativa = ativaControlada !== undefined ? ativaControlada : interno;
  function mudar(i) {
    if (ativaControlada === undefined) setInterno(i);
    onMudar?.(i);
  }
  return (
    <div>
      <div style={{
        display: "flex", gap: 4, marginBottom: 4,
        background: C.surface, padding: 4, borderRadius: 10,
        border: `1px solid ${C.border}`,
      }}>
        {abas.map((a, i) => {
          const sel = i === ativa;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => mudar(i)}
              title={a.label}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 8,
                background: sel ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : "transparent",
                color: sel ? C.white : C.muted,
                border: "none", fontWeight: sel ? 700 : 500, fontSize: 13,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "all .15s ease", position: "relative",
              }}>
              <span style={{ fontSize: 14 }}>{a.icone}</span>
              <span>{a.label}</span>
              {a.temErro && (
                <span style={{
                  position: "absolute", top: 6, right: 8,
                  width: 8, height: 8, borderRadius: "50%", background: C.red,
                  boxShadow: `0 0 0 2px ${C.surface}`,
                }} />
              )}
            </button>
          );
        })}
      </div>
      <div style={{ paddingTop: 8 }}>
        {typeof children === "function" ? children(ativa) : children}
      </div>
    </div>
  );
}
