import { useState, type ReactNode } from "react";
import { C } from "../lib/theme";

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

export interface AbaItem {
  id: string;
  icone: string;
  label: string;
  temErro?: boolean;
}

interface AbasProps {
  inicial?: number;
  abas: AbaItem[];
  children: ReactNode | ((ativa: number) => ReactNode);
  ativaControlada?: number;
  onMudar?: (i: number) => void;
}

export function Abas({ inicial = 0, abas, children, ativaControlada, onMudar }: AbasProps) {
  const [interno, setInterno] = useState(inicial);
  const ativa = ativaControlada !== undefined ? ativaControlada : interno;
  function mudar(i: number) {
    if (ativaControlada === undefined) setInterno(i);
    onMudar?.(i);
  }
  return (
    <div>
      <div
        className="flex gap-1 mb-1 bg-gp-surface p-1 rounded-[10px]"
        style={{ border: `1px solid ${C.border}` }}
      >
        {abas.map((a, i) => {
          const sel = i === ativa;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => mudar(i)}
              title={a.label}
              className="flex-1 px-[14px] py-[10px] rounded-lg border-none text-[13px] cursor-pointer flex items-center justify-center gap-2 transition-all relative"
              style={{
                background: sel ? `linear-gradient(135deg, ${C.accent}, ${C.purple})` : "transparent",
                color: sel ? C.white : C.muted,
                fontWeight: sel ? 700 : 500,
              }}
            >
              <span className="text-sm">{a.icone}</span>
              <span>{a.label}</span>
              {a.temErro && (
                <span
                  className="absolute top-[6px] right-2 w-2 h-2 rounded-full"
                  style={{
                    background: C.red,
                    boxShadow: `0 0 0 2px ${C.surface}`,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="pt-2">
        {typeof children === "function" ? children(ativa) : children}
      </div>
    </div>
  );
}
