import { useEffect, useState } from "react";
import { useNetworkStatus } from "../lib/useNetworkStatus";
import { ouvirToasts, type ToastPayload } from "../lib/toast";
import { getAvisosRedeAtivos, ouvirAvisosRede } from "../lib/preferenciasUI";
import { C } from "../lib/theme";

// =====================================================================
// Componente global de feedback de rede / API.
//
// Tem 2 responsabilidades:
//   1. Tarja superior (TarjaRede) — persistente enquanto offline OU API
//      caida. Inclui classe global `gp-offline` no <body> pra telas
//      poderem opcionalmente bloquear botoes via CSS.
//   2. Container de toasts inferior — escuta `app:toast` e renderiza
//      pilha empilhada com auto-fechamento.
//
// Montar 1 instancia perto da raiz (App.tsx).
// =====================================================================

function TarjaRede() {
  const { online, apiSaudavel } = useNetworkStatus();
  const [avisosAtivos, setAvisosAtivos] = useState<boolean>(() => getAvisosRedeAtivos());

  useEffect(() => ouvirAvisosRede(setAvisosAtivos), []);

  // Mantem flag no body para CSS opt-in. Mesmo com avisos desligados,
  // continuamos marcando .gp-offline pra telas que dependem dele (PDV
  // bloqueia o botao Finalizar venda).
  useEffect(() => {
    const degradado = !online || !apiSaudavel;
    document.body.classList.toggle("gp-offline", degradado);
    return () => { document.body.classList.remove("gp-offline"); };
  }, [online, apiSaudavel]);

  if (!avisosAtivos) return null;
  if (online && apiSaudavel) return null;

  // Cor de status SOLIDA de proposito: a tarja precisa gritar (bloqueia
  // operacoes). Tokens da paleta — acompanham o tema (incl. alto contraste).
  const fundo = !online ? C.red : C.yellow;
  const icone = !online ? "📡" : "⚠️";
  const titulo = !online
    ? "Sem conexao com a internet"
    : "Servidor com instabilidade";
  const sub = !online
    ? "Algumas funcoes estao desabilitadas ate a conexao voltar."
    : "Estamos com dificuldade para conversar com o servidor. Tentando reconectar...";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: fundo,
        // var(--white) e adaptativo: branco nos temas escuros, grafite no
        // claro — sobre amber/red saturados, o grafite ate contrasta melhor.
        color: "var(--white)",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      <span style={{ fontSize: 16 }}>{icone}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, lineHeight: 1.2 }}>{titulo}</div>
        <div style={{ fontSize: 11, opacity: 0.92, marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}

interface ToastVisivel extends ToastPayload {
  fechando?: boolean;
}

function ContainerToasts() {
  const [toasts, setToasts] = useState<ToastVisivel[]>([]);

  useEffect(() => {
    return ouvirToasts((t) => {
      setToasts(prev => {
        // Dedup: mesmo titulo+tipo em <1.5s vira "ja tem" — evita
        // duplicar quando 2 requests falham em rajada.
        if (prev.some(p => p.titulo === t.titulo && p.tipo === t.tipo)) return prev;
        return [...prev, t].slice(-4); // max 4 visiveis
      });

      const duracao = t.duracao ?? 5000;
      if (duracao > 0) {
        setTimeout(() => {
          setToasts(prev => prev.filter(p => p.id !== t.id));
        }, duracao);
      }
    });
  }, []);

  function fechar(id: string) {
    setToasts(prev => prev.filter(p => p.id !== id));
  }

  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Notificacoes"
      style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        right: 16,
        zIndex: 9998,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: 360,
        pointerEvents: "none",
      }}
    >
      {toasts.map(t => {
        const cores = paletaToast(t.tipo);
        return (
          <div
            key={t.id}
            role={t.tipo === "erro" ? "alert" : "status"}
            style={{
              pointerEvents: "auto",
              background: cores.fundo,
              color: cores.texto,
              border: `1px solid ${cores.borda}`,
              borderRadius: 10,
              padding: "10px 12px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              fontSize: 13,
              minWidth: 280,
              animation: "gp-toast-in 180ms ease-out",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1.2 }}>{cores.icone}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, lineHeight: 1.2 }}>{t.titulo}</div>
              {t.mensagem && (
                <div style={{ fontSize: 12, opacity: 0.9, marginTop: 3, lineHeight: 1.35 }}>{t.mensagem}</div>
              )}
              {t.acaoLabel && t.onAcao && (
                <button
                  onClick={() => { t.onAcao?.(); fechar(t.id); }}
                  style={{
                    marginTop: 6,
                    background: cores.botao,
                    color: cores.texto,
                    border: `1px solid ${cores.borda}`,
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >{t.acaoLabel}</button>
              )}
            </div>
            <button
              onClick={() => fechar(t.id)}
              aria-label="Fechar"
              style={{
                background: "transparent",
                border: "none",
                color: cores.texto,
                fontSize: 18,
                lineHeight: 1,
                cursor: "pointer",
                opacity: 0.7,
                padding: "0 2px",
              }}
            >×</button>
          </div>
        );
      })}
      <style>{`
        @keyframes gp-toast-in {
          from { transform: translateY(8px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        body.gp-offline .gp-bloqueio-offline {
          opacity: 0.55;
          pointer-events: none;
          filter: grayscale(0.4);
        }
      `}</style>
    </div>
  );
}

// Paleta derivada dos tokens via color-mix — antes era hex fixo calibrado so
// para tema escuro (toast preto mesmo no tema Claro). Agora o fundo tinge o
// bg do tema com a cor de status e o texto puxa a cor de status na direcao
// do texto do tema: escuro fica como era, claro ganha toast claro legivel.
function tomToast(cor: string) {
  return {
    fundo: `color-mix(in srgb, ${cor} 14%, ${C.bg})`,
    borda: cor + "66",
    texto: `color-mix(in srgb, ${cor} 70%, ${C.text})`,
    botao: cor + "33",
  };
}

function paletaToast(tipo: ToastPayload["tipo"]) {
  switch (tipo) {
    case "erro":
      return { ...tomToast(C.red), icone: "⛔" };
    case "aviso":
      return { ...tomToast(C.yellow), icone: "⚠️" };
    case "sucesso":
      return { ...tomToast(C.green), icone: "✅" };
    default:
      return { fundo: C.card, borda: C.border, texto: C.text, botao: C.accent, icone: "ℹ️" };
  }
}

export default function IndicadorRede() {
  return (
    <>
      <TarjaRede />
      <ContainerToasts />
    </>
  );
}
