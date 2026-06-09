import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  C, TEMAS, ACENTOS, APARENCIA_PADRAO,
  lerAparencia, salvarAparencia, aplicarAparencia,
  type AparenciaEstado, type Tema, type Densidade, type ModoAutomatico,
} from "./lib/theme";

// Tela de Aparencia — substitui o antigo AparenciaModal.
//
// Layout: controles a esquerda (temas, acento, densidade, tipografia, raio,
// acessibilidade) + preview ao vivo a direita. Auto-save: toda mudanca
// persiste em localStorage e exibe o indicador "Salvando -> Salvo".
//
// O preview e um mock isolado: usa as variaveis CSS do tema selecionado para
// representar o sistema, espelhando densidade e raio em tempo real.
export default function Aparencia() {
  const [estado, setEstado] = useState<AparenciaEstado>(() => lerAparencia());
  const [salvando, setSalvando] = useState(false);
  const [sugestaoFechada, setSugestaoFechada] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Aplica a cada mudanca + persiste.
  useEffect(() => {
    aplicarAparencia(estado);
    salvarAparencia(estado);
    setSalvando(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSalvando(false), 600);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [estado]);

  function set<K extends keyof AparenciaEstado>(chave: K, valor: AparenciaEstado[K]) {
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
    <div className="max-w-[1240px] mx-auto">
      {/* Header da pagina */}
      <div className="mb-[18px]">
        <div className="text-gp-muted text-xs mb-[6px]">
          Configurações <span className="opacity-50">›</span> Personalização <span className="opacity-50">›</span>{" "}
          <span className="text-gp-text">Aparência</span>
        </div>
        <div className="text-gp-white text-[26px] font-extrabold tracking-[-0.01em]">
          🎨 Aparência
        </div>
        <div className="text-gp-muted text-[13px] mt-1 max-w-[60ch]">
          Escolha como o sistema se mostra para você. As mudanças são aplicadas
          imediatamente e ficam salvas neste navegador.
        </div>
      </div>

      <div
        className="grid gap-6 aparencia-grid"
        style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(360px, 480px)" }}
      >
        <style>{ESTILO_RESPONSIVO_APARENCIA}</style>

        {/* Coluna de controles */}
        <div>
          {/* TEMA */}
          <Secao titulo="Tema" hint={estado.tema}>
            <div
              className="grid gap-[14px]"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
            >
              {TEMAS.map((t) => (
                <CardTema
                  key={t.id}
                  tema={t}
                  ativo={estado.tema === t.id}
                  onSelecionar={() => set("tema", t.id)}
                />
              ))}
            </div>

            <div
              className="mt-[14px] grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
            >
              <CardSmart
                icone="◐"
                titulo="Tema automático"
                texto="Use claro durante o dia e escuro à noite, seguindo o pôr do sol da sua região."
              >
                <Segmentado
                  valor={estado.modoAutomatico}
                  opcoes={[
                    { val: "off", label: "Desligado" },
                    { val: "sunset", label: "Pôr do sol" },
                    { val: "custom", label: "Horário" },
                  ]}
                  onChange={(v) => set("modoAutomatico", v as ModoAutomatico)}
                />
                {estado.modoAutomatico !== "off" && (
                  <BarraHorario hora={horaAtual + new Date().getMinutes() / 60} />
                )}
              </CardSmart>

              {sugestao ? (
                <CardSmart icone="✦" titulo="Sugestão para você" texto={sugestao.texto}>
                  <div className="flex gap-2">
                    <button onClick={() => set("tema", sugestao.para)} style={btnPrimario}>
                      Aplicar {nomeDoTema(sugestao.para)}
                    </button>
                    <button onClick={() => setSugestaoFechada(true)} style={btnGhost}>
                      Agora não
                    </button>
                  </div>
                </CardSmart>
              ) : (
                <CardSmart
                  icone="✓"
                  titulo="Tudo ajustado"
                  texto="Sua aparência está consistente com o horário e seu uso. Nenhuma sugestão por agora."
                />
              )}
            </div>
          </Secao>

          {/* ACENTO */}
          <Secao titulo="Cor de destaque" hint="Sobrepõe a cor primária do tema">
            <Linha label="Cor de destaque" descricao="Usada em botões, links e elementos selecionados.">
              <div className="flex gap-2 items-center flex-wrap">
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
                onChange={(v) => set("densidade", v as Densidade)}
              />
            </Linha>

            <Linha label="Tamanho da fonte" descricao="Ajuste fino da escala tipográfica base.">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={13}
                  max={18}
                  step={1}
                  value={estado.fontSize}
                  onChange={(e) => set("fontSize", Number(e.target.value))}
                  className="w-[200px]"
                />
                <span className="text-gp-muted text-xs min-w-[40px] font-mono">
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
          <div
            className="flex justify-between items-center pt-[18px] mt-[10px]"
            style={{ borderTop: `1px solid ${C.border}` }}
          >
            <div className="text-gp-muted text-xs flex gap-2 items-center">
              <span
                className="w-[6px] h-[6px] rounded-full transition-colors"
                style={{
                  background: salvando ? C.yellow : C.green,
                  boxShadow: `0 0 0 4px ${salvando ? C.yellow : C.green}22`,
                }}
              />
              {salvando ? "Salvando…" : "Salvo automaticamente · há instantes"}
            </div>
            <div className="flex gap-[10px]">
              <button onClick={restaurar} style={btnGhost}>Restaurar padrão</button>
            </div>
          </div>
        </div>

        {/* Coluna de preview ao vivo */}
        <aside className="aparencia-preview">
          <div className="flex justify-between items-center mb-3">
            <div className="text-gp-muted text-[11px] tracking-[0.12em] uppercase font-bold">
              Pré-visualização ao vivo
            </div>
            <div
              className="text-[10px] text-gp-muted px-2 py-[3px] rounded-full font-mono"
              style={{ border: `1px solid ${C.border}` }}
            >
              {estado.tema} · {estado.densidade}
            </div>
          </div>
          <PreviewMock estado={estado} />
        </aside>
      </div>
    </div>
  );
}

// ----------------- Subcomponentes ----------------- //

function Secao({ titulo, hint, children }: { titulo: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-gp-muted text-[11px] font-bold tracking-[0.14em] uppercase">
          {titulo}
        </div>
        {hint && <div className="text-gp-muted text-[11px] font-mono">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Linha({ label, descricao, children }: { label: string; descricao?: string; children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-between py-3 gap-6"
      style={{ borderBottom: `1px solid ${C.border}` }}
    >
      <div className="flex-1">
        <div className="text-gp-text text-sm font-semibold">{label}</div>
        {descricao && <div className="text-gp-muted text-xs mt-[2px]">{descricao}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

interface CardTemaProps {
  tema: Tema;
  ativo: boolean;
  onSelecionar: () => void;
}

function CardTema({ tema, ativo, onSelecionar }: CardTemaProps) {
  const cores = tema.cores;
  return (
    <button
      onClick={onSelecionar}
      className="relative text-left p-[14px] cursor-pointer bg-gp-surface rounded-xl transition-all"
      style={{
        border: `1px solid ${ativo ? C.accent : C.border}`,
        boxShadow: ativo ? `0 0 0 1px ${C.accent}, 0 12px 28px -10px ${cores.accent}55` : "none",
      }}
    >
      {/* Mini-preview com as cores do proprio tema */}
      <div
        className="rounded-[10px] overflow-hidden flex flex-col"
        style={{
          border: "1px solid rgba(255,255,255,0.06)",
          aspectRatio: "16 / 9",
          background: cores.surface,
        }}
      >
        <div
          className="flex gap-[5px] px-[10px] py-2"
          style={{
            background: cores.card,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Bolinha cor={cores.accent} />
          <Bolinha cor={cores.purple} />
          <Bolinha cor={cores.green} />
          <Bolinha cor={cores.yellow} />
          <Bolinha cor={cores.red} />
        </div>
        <div
          className="flex-1 p-3 flex flex-col gap-[6px] justify-center"
          style={{ background: cores.bg }}
        >
          <div
            className="h-[6px] rounded-[3px] w-[70%] opacity-60"
            style={{ background: cores.muted }}
          />
          <div
            className="h-[6px] rounded-[3px] w-[45%] opacity-40"
            style={{ background: cores.muted }}
          />
          <div
            className="mt-1 h-[14px] rounded-[7px]"
            style={{ background: `linear-gradient(90deg, ${cores.accent}, ${cores.purple})` }}
          />
        </div>
      </div>

      <div className="flex items-start justify-between mt-3 gap-[10px]">
        <div className="min-w-0">
          <div className="text-gp-white font-bold text-sm">{tema.nome}</div>
          <div className="text-gp-muted text-xs mt-[3px] leading-[1.4]">{tema.descricao}</div>
        </div>
        <span
          className="text-[10px] font-bold tracking-[0.08em] px-[7px] py-[3px] rounded-full uppercase whitespace-nowrap"
          style={{
            background: ativo ? C.accent + "22" : C.card,
            color: ativo ? C.accent : C.muted,
            border: `1px solid ${ativo ? C.accent + "55" : C.border}`,
          }}
        >
          {ativo ? "Ativo" : "Aplicar"}
        </span>
      </div>
    </button>
  );
}

function CardSmart({ icone, titulo, texto, children }: { icone: string; titulo: string; texto: string; children?: ReactNode }) {
  return (
    <div
      className="rounded-xl p-[14px] bg-gp-surface flex gap-3 items-start"
      style={{ border: `1px dashed ${C.border}` }}
    >
      <div
        className="w-8 h-8 rounded-lg grid place-items-center text-base font-bold flex-none"
        style={{ background: C.accent + "22", color: C.accent }}
      >
        {icone}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-gp-text text-[13px] font-bold mb-1">{titulo}</div>
        <div
          className="text-gp-muted text-xs leading-[1.5]"
          style={{ marginBottom: children ? 10 : 0 }}
        >
          {texto}
        </div>
        {children}
      </div>
    </div>
  );
}

interface SegOpcao { val: string; label: string }

function Segmentado({ valor, opcoes, onChange }: { valor: string; opcoes: SegOpcao[]; onChange: (v: string) => void }) {
  return (
    <div
      className="inline-flex p-[3px] gap-[2px] bg-gp-card rounded-lg"
      style={{ border: `1px solid ${C.border}` }}
    >
      {opcoes.map((o) => {
        const ativo = String(valor) === String(o.val);
        return (
          <button
            key={o.val}
            onClick={() => onChange(o.val)}
            className="border-0 text-[13px] px-3 py-[6px] rounded-md cursor-pointer transition-colors"
            style={{
              background: ativo ? C.bg : "transparent",
              color: ativo ? C.text : C.muted,
              font: "inherit",
              boxShadow: ativo ? "0 1px 2px rgba(0,0,0,0.3)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ ativo, onAlternar }: { ativo: boolean; onAlternar: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onAlternar(!ativo)}
      aria-pressed={ativo}
      className="relative w-[38px] h-[22px] rounded-full cursor-pointer p-0 transition-colors"
      style={{
        background: ativo ? C.accent + "55" : C.card,
        border: `1px solid ${ativo ? C.accent : C.border}`,
      }}
    >
      <span
        className="absolute top-[1px] w-[18px] h-[18px] rounded-full transition-all"
        style={{
          left: ativo ? 16 : 1,
          background: ativo ? C.accent : C.muted,
        }}
      />
    </button>
  );
}

function SwatchAcento({ cor, titulo, ativo, onSelecionar }: { cor: string | null; titulo: string; ativo: boolean; onSelecionar: () => void }) {
  return (
    <button
      onClick={onSelecionar}
      title={titulo}
      className="relative w-7 h-7 rounded-full p-0 cursor-pointer transition-transform"
      style={{
        border: `1px solid ${C.border}`,
        background: cor || "conic-gradient(from 220deg, #4f8ef7, #7c3aed, #10b981, #f59e0b, #ff6f61, #4f8ef7)",
        outline: ativo ? `2px solid ${C.text}` : "none",
        outlineOffset: 2,
      }}
    />
  );
}

function Bolinha({ cor }: { cor: string }) {
  return <div className="w-2 h-2 rounded-full" style={{ background: cor }} />;
}

function BarraHorario({ hora }: { hora: number }) {
  // Visualizacao 0-24h: "noite" escura ate 6h, dia ate 18h, noite de novo.
  const pos = ((hora || 0) / 24) * 100;
  return (
    <div
      className="mt-[10px] h-7 rounded-md relative overflow-hidden"
      style={{
        border: `1px solid ${C.border}`,
        background: `linear-gradient(90deg,
          ${C.surface} 0%, ${C.surface} 25%,
          #f6f3ec 25%, #f6f3ec 75%,
          ${C.surface} 75%, ${C.surface} 100%)`,
      }}
    >
      <div
        className="absolute inset-0 flex justify-between items-center px-[6px] pointer-events-none text-[10px]"
        style={{ color: "rgba(0,0,0,0.45)", mixBlendMode: "difference" }}
      >
        <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
      </div>
      <div
        className="absolute -top-[3px] -bottom-[3px] w-[2px]"
        style={{
          left: `${pos}%`,
          background: C.accent,
          boxShadow: `0 0 0 4px ${C.accent}55`,
        }}
      />
    </div>
  );
}

function PreviewMock({ estado }: { estado: AparenciaEstado }) {
  const tema = TEMAS.find((t) => t.id === estado.tema) || TEMAS[0];
  const c = tema.cores;
  const acento = estado.acento || c.accent;
  // Espaco interno do mock varia com densidade.
  const padX = estado.densidade === "compacto" ? 12 : estado.densidade === "confortavel" ? 22 : 16;
  const padY = estado.densidade === "compacto" ? 8 : estado.densidade === "confortavel" ? 16 : 12;
  const itemPad = estado.densidade === "compacto" ? "5px 8px" : estado.densidade === "confortavel" ? "10px 12px" : "7px 10px";
  const radius = estado.radius;

  return (
    <div
      className="rounded-[14px] overflow-hidden transition-colors"
      style={{
        border: `1px solid ${C.border}`,
        background: c.bg,
        color: c.text,
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        fontSize: estado.fontSize,
      }}
    >
      {/* Top bar do mock */}
      <div
        className="flex items-center gap-[10px]"
        style={{
          padding: `${padY}px ${padX}px`,
          borderBottom: `1px solid ${c.border}`,
          background: c.surface,
        }}
      >
        <div className="flex gap-[5px]">
          <i className="w-[9px] h-[9px] rounded-full" style={{ background: c.border }} />
          <i className="w-[9px] h-[9px] rounded-full" style={{ background: c.border }} />
          <i className="w-[9px] h-[9px] rounded-full" style={{ background: c.border }} />
        </div>
        <div
          className="flex-1 h-[26px] flex items-center px-[10px] text-[11px] font-mono"
          style={{
            borderRadius: radius - 4 < 4 ? 4 : radius - 4,
            background: c.card,
            border: `1px solid ${c.border}`,
            color: c.muted,
          }}
        >
          app.gestaopro/dashboard
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "150px 1fr" }}>
        <div
          className="flex flex-col gap-1"
          style={{
            borderRight: `1px solid ${c.border}`,
            background: c.surface,
            padding: `${padY}px 10px`,
          }}
        >
          {["Início", "Projetos", "Equipe", "Relatórios", "Configurações"].map((t, i) => (
            <div
              key={t}
              style={{
                padding: itemPad,
                borderRadius: radius - 4 < 4 ? 4 : radius - 4,
                fontSize: estado.fontSize - 2,
                color: i === 1 ? c.text : c.muted,
                background: i === 1 ? acento + "22" : "transparent",
              }}
            >
              {t}
            </div>
          ))}
        </div>
        <div style={{ padding: padX }}>
          <div
            className="font-bold mb-1"
            style={{ color: c.text, fontSize: estado.fontSize + 4 }}
          >
            Projetos ativos
          </div>
          <div
            className="mb-[14px]"
            style={{ color: c.muted, fontSize: estado.fontSize - 2 }}
          >
            Visão geral dos seus times nesta semana.
          </div>
          <div
            className="grid gap-[10px] mb-[14px]"
            style={{ gridTemplateColumns: "1fr 1fr" }}
          >
            <div
              style={{
                padding: padY,
                borderRadius: radius,
                border: `1px solid ${c.border}`,
                background: c.surface,
              }}
            >
              <div
                className="uppercase tracking-[0.1em]"
                style={{ color: c.muted, fontSize: 10 }}
              >
                Concluídos
              </div>
              <div
                className="font-bold mt-1"
                style={{ color: acento, fontSize: 22 }}
              >
                128
              </div>
            </div>
            <div
              style={{
                padding: padY,
                borderRadius: radius,
                border: `1px solid ${c.border}`,
                background: c.surface,
              }}
            >
              <div
                className="uppercase tracking-[0.1em]"
                style={{ color: c.muted, fontSize: 10 }}
              >
                Em andamento
              </div>
              <div className="font-bold mt-1" style={{ color: c.text, fontSize: 22 }}>
                42
              </div>
            </div>
          </div>
          <div
            className="h-2 rounded mb-2 w-[85%]"
            style={{ background: c.border }}
          />
          <div
            className="h-2 rounded mb-3 w-[65%]"
            style={{ background: c.border }}
          />
          <div className="flex gap-2 mt-3">
            <span
              className="inline-flex items-center gap-[6px] px-[14px] py-2 font-semibold"
              style={{
                borderRadius: radius,
                background: acento,
                color: contraste(acento),
                fontSize: estado.fontSize - 1,
              }}
            >
              Criar projeto
            </span>
            <span
              className="inline-flex items-center gap-[6px] px-[14px] py-2 font-semibold"
              style={{
                borderRadius: radius,
                background: "transparent",
                color: c.text,
                border: `1px solid ${c.border}`,
                fontSize: estado.fontSize - 1,
              }}
            >
              Importar
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------- Helpers ----------------- //

function nomeDoTema(id: string): string {
  return TEMAS.find((t) => t.id === id)?.nome || id;
}

function contraste(hex: string | null | undefined): string {
  const c = (hex || "#000").replace("#", "");
  if (c.length < 6) return "#fff";
  const r = parseInt(c.substr(0, 2), 16) / 255;
  const g = parseInt(c.substr(2, 2), 16) / 255;
  const b = parseInt(c.substr(4, 2), 16) / 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.55 ? "#0b0d10" : "#ffffff";
}

const btnPrimario: CSSProperties = {
  background: `linear-gradient(135deg, ${C.accent}, ${C.purple})`,
  color: "var(--accent-ink)",
  border: "none",
  borderRadius: 8,
  padding: "8px 14px",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
};

const btnGhost: CSSProperties = {
  background: "transparent",
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 13,
  cursor: "pointer",
  fontWeight: 600,
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
