import { useEffect, useRef, useState } from "react";
import {
  C, TEMAS, ACENTOS, APARENCIA_PADRAO,
  lerAparencia, salvarAparencia, aplicarAparencia,
} from "./lib/theme.js";

// Tela de Aparencia — substitui o antigo AparenciaModal.
//
// Layout: controles a esquerda (temas, acento, densidade, tipografia, raio,
// acessibilidade) + preview ao vivo a direita. Auto-save: toda mudanca
// persiste em localStorage e exibe o indicador "Salvando -> Salvo".
//
// O preview e um mock isolado: usa as variaveis CSS do tema selecionado para
// representar o sistema, espelhando densidade e raio em tempo real.
export default function Aparencia() {
  const [estado, setEstado] = useState(() => lerAparencia());
  const [salvando, setSalvando] = useState(false);
  const [sugestaoFechada, setSugestaoFechada] = useState(false);
  const timerRef = useRef(null);

  // Aplica a cada mudanca + persiste.
  useEffect(() => {
    aplicarAparencia(estado);
    salvarAparencia(estado);
    setSalvando(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSalvando(false), 600);
    return () => clearTimeout(timerRef.current);
  }, [estado]);

  function set(chave, valor) {
    setEstado((s) => ({ ...s, [chave]: valor }));
  }

  function restaurar() {
    setEstado({ ...APARENCIA_PADRAO });
  }

  // Sugestao bobinha: se o usuario esta no Azul Padrao e e horario "tarde"
  // (apos 18h), sugere Esmeralda. Heuristica simples baseada no HTML.
  const horaAtual = new Date().getHours();
  const sugestao = (() => {
    if (sugestaoFechada) return null;
    if (estado.tema === "azul" && horaAtual >= 14 && horaAtual <= 22) {
      return {
        para: "esmeralda",
        texto: "Você está usando o Azul há um tempo. Que tal Esmeralda — mais calmo na vista?",
      };
    }
    return null;
  })();

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto" }}>
      {/* Header da pagina */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>
          Configurações <span style={{ opacity: 0.5 }}>›</span> Personalização <span style={{ opacity: 0.5 }}>›</span>{" "}
          <span style={{ color: C.text }}>Aparência</span>
        </div>
        <div style={{ color: C.white, fontSize: 26, fontWeight: 800, letterSpacing: "-0.01em" }}>
          🎨 Aparência
        </div>
        <div style={{ color: C.muted, fontSize: 13, marginTop: 4, maxWidth: "60ch" }}>
          Escolha como o sistema se mostra para você. As mudanças são aplicadas
          imediatamente e ficam salvas neste navegador.
        </div>
      </div>

      <div style={{
        display: "grid", gap: 24,
        gridTemplateColumns: "minmax(0, 1fr) minmax(360px, 480px)",
      }} className="aparencia-grid">
        <style>{ESTILO_RESPONSIVO_APARENCIA}</style>

        {/* Coluna de controles */}
        <div>
          {/* TEMA */}
          <Secao titulo="Tema" hint={estado.tema}>
            <div style={{
              display: "grid", gap: 14,
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}>
              {TEMAS.map((t) => (
                <CardTema
                  key={t.id}
                  tema={t}
                  ativo={estado.tema === t.id}
                  onSelecionar={() => set("tema", t.id)}
                />
              ))}
            </div>

            <div style={{
              marginTop: 14, display: "grid", gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}>
              <CardSmart icone="◐" titulo="Tema automático"
                texto="Use claro durante o dia e escuro à noite, seguindo o pôr do sol da sua região.">
                <Segmentado
                  valor={estado.modoAutomatico}
                  opcoes={[
                    { val: "off", label: "Desligado" },
                    { val: "sunset", label: "Pôr do sol" },
                    { val: "custom", label: "Horário" },
                  ]}
                  onChange={(v) => set("modoAutomatico", v)}
                />
                {estado.modoAutomatico !== "off" && (
                  <BarraHorario hora={horaAtual + new Date().getMinutes() / 60} />
                )}
              </CardSmart>

              {sugestao ? (
                <CardSmart icone="✦" titulo="Sugestão para você" texto={sugestao.texto}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => set("tema", sugestao.para)}
                      style={btnPrimario}
                    >Aplicar {nomeDoTema(sugestao.para)}</button>
                    <button
                      onClick={() => setSugestaoFechada(true)}
                      style={btnGhost}
                    >Agora não</button>
                  </div>
                </CardSmart>
              ) : (
                <CardSmart icone="✓" titulo="Tudo ajustado" texto="Sua aparência está consistente com o horário e seu uso. Nenhuma sugestão por agora." />
              )}
            </div>
          </Secao>

          {/* ACENTO */}
          <Secao titulo="Cor de destaque" hint="Sobrepõe a cor primária do tema">
            <Linha
              label="Cor de destaque"
              descricao="Usada em botões, links e elementos selecionados."
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {ACENTOS.map((a) => (
                  <SwatchAcento
                    key={a.nome}
                    cor={a.valor}
                    titulo={a.nome}
                    ativo={estado.acento === a.valor}
                    onSelecionar={() => set("acento", a.valor)}
                  />
                ))}
              </div>
            </Linha>
          </Secao>

          {/* DENSIDADE / FONTE / RAIO */}
          <Secao titulo="Apresentação" hint="Escala e ritmo da interface">
            <Linha label="Densidade" descricao="Quanto espaço respira entre os elementos.">
              <Segmentado
                valor={estado.densidade}
                opcoes={[
                  { val: "compacto", label: "Compacto" },
                  { val: "padrao", label: "Padrão" },
                  { val: "confortavel", label: "Confortável" },
                ]}
                onChange={(v) => set("densidade", v)}
              />
            </Linha>

            <Linha label="Tamanho da fonte" descricao="Ajuste fino da escala tipográfica base.">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <input
                  type="range" min={13} max={18} step={1} value={estado.fontSize}
                  onChange={(e) => set("fontSize", Number(e.target.value))}
                  style={{ width: 200 }}
                />
                <span style={{ color: C.muted, fontSize: 12, minWidth: 40, fontFamily: "monospace" }}>
                  {estado.fontSize}px
                </span>
              </div>
            </Linha>

            <Linha label="Cantos arredondados" descricao="Suavidade dos cantos em cards, botões e campos.">
              <Segmentado
                valor={String(estado.radius)}
                opcoes={[
                  { val: "6", label: "Sutil" },
                  { val: "10", label: "Padrão" },
                  { val: "16", label: "Generoso" },
                ]}
                onChange={(v) => set("radius", Number(v))}
              />
            </Linha>
          </Secao>

          {/* ACESSIBILIDADE */}
          <Secao titulo="Acessibilidade" hint="Mais conforto e contraste">
            <Linha label="Reduzir movimento" descricao="Desativa transições e animações decorativas.">
              <Toggle ativo={estado.reduzirMovimento} onAlternar={(v) => set("reduzirMovimento", v)} />
            </Linha>
            <Linha label="Sublinhar links" descricao="Sempre mostrar sublinhado em links de texto.">
              <Toggle ativo={estado.sublinharLinks} onAlternar={(v) => set("sublinharLinks", v)} />
            </Linha>
            <Linha label="Sincronizar entre dispositivos" descricao="Suas preferências viajam com sua conta (em breve).">
              <Toggle ativo={estado.sincronizar} onAlternar={(v) => set("sincronizar", v)} />
            </Linha>
          </Secao>

          {/* FOOTER */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            paddingTop: 18, marginTop: 10,
            borderTop: `1px solid ${C.border}`,
          }}>
            <div style={{ color: C.muted, fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: salvando ? C.yellow : C.green,
                boxShadow: `0 0 0 4px ${salvando ? C.yellow : C.green}22`,
                transition: "background 0.2s ease",
              }} />
              {salvando ? "Salvando…" : "Salvo automaticamente · há instantes"}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={restaurar} style={btnGhost}>Restaurar padrão</button>
            </div>
          </div>
        </div>

        {/* Coluna de preview ao vivo */}
        <aside className="aparencia-preview">
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 12,
          }}>
            <div style={{
              color: C.muted, fontSize: 11, letterSpacing: "0.12em",
              textTransform: "uppercase", fontWeight: 700,
            }}>Pré-visualização ao vivo</div>
            <div style={{
              fontSize: 10, color: C.muted, padding: "3px 8px",
              border: `1px solid ${C.border}`, borderRadius: 999,
              fontFamily: "monospace",
            }}>{estado.tema} · {estado.densidade}</div>
          </div>
          <PreviewMock estado={estado} />
        </aside>
      </div>
    </div>
  );
}

// ----------------- Subcomponentes ----------------- //

function Secao({ titulo, hint, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        marginBottom: 12,
      }}>
        <div style={{
          color: C.muted, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.14em", textTransform: "uppercase",
        }}>{titulo}</div>
        {hint && (
          <div style={{ color: C.muted, fontSize: 11, fontFamily: "monospace" }}>{hint}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function Linha({ label, descricao, children }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 0", borderBottom: `1px solid ${C.border}`, gap: 24,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{label}</div>
        {descricao && (
          <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{descricao}</div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function CardTema({ tema, ativo, onSelecionar }) {
  const cores = tema.cores;
  return (
    <button onClick={onSelecionar} style={{
      position: "relative", textAlign: "left", padding: 14, cursor: "pointer",
      background: C.surface,
      border: `1px solid ${ativo ? C.accent : C.border}`,
      borderRadius: 12,
      boxShadow: ativo ? `0 0 0 1px ${C.accent}, 0 12px 28px -10px ${cores.accent}55` : "none",
      transition: "border-color 0.2s, box-shadow 0.2s, transform 0.2s",
    }}>
      {/* Mini-preview com as cores do proprio tema */}
      <div style={{
        borderRadius: 10, overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.06)",
        aspectRatio: "16 / 9", background: cores.surface,
        display: "flex", flexDirection: "column",
      }}>
        <div style={{
          display: "flex", gap: 5, padding: "8px 10px",
          background: cores.card,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <Bolinha cor={cores.accent} />
          <Bolinha cor={cores.purple} />
          <Bolinha cor={cores.green} />
          <Bolinha cor={cores.yellow} />
          <Bolinha cor={cores.red} />
        </div>
        <div style={{
          flex: 1, padding: 12, display: "flex", flexDirection: "column",
          gap: 6, justifyContent: "center", background: cores.bg,
        }}>
          <div style={{ height: 6, borderRadius: 3, background: cores.muted, width: "70%", opacity: 0.6 }} />
          <div style={{ height: 6, borderRadius: 3, background: cores.muted, width: "45%", opacity: 0.4 }} />
          <div style={{
            marginTop: 4, height: 14, borderRadius: 7,
            background: `linear-gradient(90deg, ${cores.accent}, ${cores.purple})`,
          }} />
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        marginTop: 12, gap: 10,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: C.white, fontWeight: 700, fontSize: 14 }}>{tema.nome}</div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 3, lineHeight: 1.4 }}>
            {tema.descricao}
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
          padding: "3px 7px", borderRadius: 999,
          textTransform: "uppercase", whiteSpace: "nowrap",
          background: ativo ? C.accent + "22" : C.card,
          color: ativo ? C.accent : C.muted,
          border: `1px solid ${ativo ? C.accent + "55" : C.border}`,
        }}>{ativo ? "Ativo" : "Aplicar"}</span>
      </div>
    </button>
  );
}

function CardSmart({ icone, titulo, texto, children }) {
  return (
    <div style={{
      border: `1px dashed ${C.border}`,
      borderRadius: 12, padding: 14,
      background: C.surface,
      display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        display: "grid", placeItems: "center",
        background: C.accent + "22", color: C.accent,
        fontSize: 16, flex: "none", fontWeight: 700,
      }}>{icone}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{titulo}</div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: children ? 10 : 0, lineHeight: 1.5 }}>
          {texto}
        </div>
        {children}
      </div>
    </div>
  );
}

function Segmentado({ valor, opcoes, onChange }) {
  return (
    <div style={{
      display: "inline-flex", padding: 3, gap: 2,
      background: C.card, borderRadius: 8,
      border: `1px solid ${C.border}`,
    }}>
      {opcoes.map((o) => {
        const ativo = String(valor) === String(o.val);
        return (
          <button key={o.val} onClick={() => onChange(o.val)} style={{
            background: ativo ? C.bg : "transparent",
            color: ativo ? C.text : C.muted,
            border: 0, font: "inherit", fontSize: 13,
            padding: "6px 12px", borderRadius: 6, cursor: "pointer",
            boxShadow: ativo ? "0 1px 2px rgba(0,0,0,0.3)" : "none",
            transition: "background 0.15s, color 0.15s",
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

function Toggle({ ativo, onAlternar }) {
  return (
    <button
      onClick={() => onAlternar(!ativo)}
      aria-pressed={ativo}
      style={{
        position: "relative", width: 38, height: 22, borderRadius: 999,
        background: ativo ? C.accent + "55" : C.card,
        border: `1px solid ${ativo ? C.accent : C.border}`,
        cursor: "pointer", padding: 0,
        transition: "background 0.2s, border-color 0.2s",
      }}
    >
      <span style={{
        position: "absolute", top: 1, left: ativo ? 16 : 1,
        width: 18, height: 18, borderRadius: "50%",
        background: ativo ? C.accent : C.muted,
        transition: "left 0.2s, background 0.2s",
      }} />
    </button>
  );
}

function SwatchAcento({ cor, titulo, ativo, onSelecionar }) {
  return (
    <button
      onClick={onSelecionar}
      title={titulo}
      style={{
        position: "relative", width: 28, height: 28, borderRadius: "50%",
        border: `1px solid ${C.border}`, padding: 0, cursor: "pointer",
        background: cor || "conic-gradient(from 220deg, #4f8ef7, #7c3aed, #10b981, #f59e0b, #ff6f61, #4f8ef7)",
        outline: ativo ? `2px solid ${C.text}` : "none",
        outlineOffset: 2,
        transition: "transform 0.15s",
      }}
    />
  );
}

function Bolinha({ cor }) {
  return <div style={{ width: 8, height: 8, borderRadius: "50%", background: cor }} />;
}

function BarraHorario({ hora }) {
  // Visualizacao 0-24h: "noite" escura ate 6h, dia ate 18h, noite de novo.
  const pos = ((hora || 0) / 24) * 100;
  return (
    <div style={{
      marginTop: 10, height: 28, borderRadius: 6,
      border: `1px solid ${C.border}`,
      position: "relative", overflow: "hidden",
      background: `linear-gradient(90deg,
        ${C.surface} 0%, ${C.surface} 25%,
        #f6f3ec 25%, #f6f3ec 75%,
        ${C.surface} 75%, ${C.surface} 100%)`,
    }}>
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        justifyContent: "space-between", alignItems: "center",
        padding: "0 6px", pointerEvents: "none",
        color: "rgba(0,0,0,0.45)", fontSize: 10, mixBlendMode: "difference",
      }}>
        <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
      </div>
      <div style={{
        position: "absolute", top: -3, bottom: -3, width: 2,
        left: `${pos}%`, background: C.accent,
        boxShadow: `0 0 0 4px ${C.accent}55`,
      }} />
    </div>
  );
}

function PreviewMock({ estado }) {
  const tema = TEMAS.find((t) => t.id === estado.tema) || TEMAS[0];
  const c = tema.cores;
  const acento = estado.acento || c.accent;
  // Espaco interno do mock varia com densidade.
  const padX = estado.densidade === "compacto" ? 12 : estado.densidade === "confortavel" ? 22 : 16;
  const padY = estado.densidade === "compacto" ? 8 : estado.densidade === "confortavel" ? 16 : 12;
  const itemPad = estado.densidade === "compacto" ? "5px 8px" : estado.densidade === "confortavel" ? "10px 12px" : "7px 10px";
  const radius = estado.radius;

  return (
    <div style={{
      borderRadius: 14, border: `1px solid ${C.border}`,
      background: c.bg, color: c.text,
      overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      fontSize: estado.fontSize,
      transition: "background 0.3s ease",
    }}>
      {/* Top bar do mock */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: `${padY}px ${padX}px`,
        borderBottom: `1px solid ${c.border}`,
        background: c.surface,
      }}>
        <div style={{ display: "flex", gap: 5 }}>
          <i style={{ width: 9, height: 9, borderRadius: "50%", background: c.border }} />
          <i style={{ width: 9, height: 9, borderRadius: "50%", background: c.border }} />
          <i style={{ width: 9, height: 9, borderRadius: "50%", background: c.border }} />
        </div>
        <div style={{
          flex: 1, height: 26, borderRadius: radius - 4 < 4 ? 4 : radius - 4,
          background: c.card, border: `1px solid ${c.border}`,
          display: "flex", alignItems: "center", padding: "0 10px",
          color: c.muted, fontSize: 11, fontFamily: "monospace",
        }}>app.gestaopro/dashboard</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "150px 1fr" }}>
        <div style={{
          borderRight: `1px solid ${c.border}`, background: c.surface,
          padding: `${padY}px 10px`, display: "flex", flexDirection: "column", gap: 4,
        }}>
          {["Início", "Projetos", "Equipe", "Relatórios", "Configurações"].map((t, i) => (
            <div key={t} style={{
              padding: itemPad, borderRadius: radius - 4 < 4 ? 4 : radius - 4,
              fontSize: estado.fontSize - 2,
              color: i === 1 ? c.text : c.muted,
              background: i === 1 ? acento + "22" : "transparent",
            }}>{t}</div>
          ))}
        </div>
        <div style={{ padding: padX }}>
          <div style={{ color: c.text, fontSize: estado.fontSize + 4, fontWeight: 700, marginBottom: 4 }}>
            Projetos ativos
          </div>
          <div style={{ color: c.muted, fontSize: estado.fontSize - 2, marginBottom: 14 }}>
            Visão geral dos seus times nesta semana.
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14,
          }}>
            <div style={{
              padding: padY, borderRadius: radius,
              border: `1px solid ${c.border}`, background: c.surface,
            }}>
              <div style={{ color: c.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Concluídos
              </div>
              <div style={{ color: acento, fontSize: 22, fontWeight: 700, marginTop: 4 }}>128</div>
            </div>
            <div style={{
              padding: padY, borderRadius: radius,
              border: `1px solid ${c.border}`, background: c.surface,
            }}>
              <div style={{ color: c.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Em andamento
              </div>
              <div style={{ color: c.text, fontSize: 22, fontWeight: 700, marginTop: 4 }}>42</div>
            </div>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: c.border, marginBottom: 8, width: "85%" }} />
          <div style={{ height: 8, borderRadius: 4, background: c.border, marginBottom: 12, width: "65%" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: radius,
              background: acento, color: contraste(acento),
              fontSize: estado.fontSize - 1, fontWeight: 600,
            }}>Criar projeto</span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: radius,
              background: "transparent", color: c.text,
              border: `1px solid ${c.border}`,
              fontSize: estado.fontSize - 1, fontWeight: 600,
            }}>Importar</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------- Helpers ----------------- //

function nomeDoTema(id) {
  return (TEMAS.find((t) => t.id === id) || {}).nome || id;
}

function contraste(hex) {
  const c = (hex || "#000").replace("#", "");
  if (c.length < 6) return "#fff";
  const r = parseInt(c.substr(0, 2), 16) / 255;
  const g = parseInt(c.substr(2, 2), 16) / 255;
  const b = parseInt(c.substr(4, 2), 16) / 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.55 ? "#0b0d10" : "#ffffff";
}

const btnPrimario = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: C.white, border: "none", borderRadius: 8,
  padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer",
};

const btnGhost = {
  background: "transparent", border: `1px solid ${C.border}`,
  color: C.text, borderRadius: 8,
  padding: "8px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600,
};

const ESTILO_RESPONSIVO_APARENCIA = `
@media (max-width: 1180px) {
  .aparencia-grid { grid-template-columns: 1fr !important; }
  .aparencia-preview { position: static !important; }
}
body[data-movimento="reduzido"] *, body[data-movimento="reduzido"] *::before,
body[data-movimento="reduzido"] *::after {
  transition-duration: 0.001ms !important;
  animation-duration: 0.001ms !important;
}
body[data-sublinhar="true"] a { text-decoration: underline !important; }
`;
