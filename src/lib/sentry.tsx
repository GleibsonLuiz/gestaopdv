// Inicializacao do Sentry no frontend (monitoramento de erros + replay).
//
// Estritamente opt-in: sem VITE_SENTRY_DSN definido (dev local, build de
// teste, qualquer ambiente sem a variavel) nada e inicializado e o app
// funciona normalmente. A variavel e lida em tempo de BUILD pelo Vite, entao
// para ativar em producao ela precisa existir no ambiente de build da Vercel.
import * as Sentry from "@sentry/react";
import { C } from "./theme";

export function inicializarSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENV || import.meta.env.MODE,
    release: import.meta.env.VITE_COMMIT_SHA || undefined,
    integrations: [
      Sentry.browserTracingIntegration(),
      // Session Replay com PRIVACIDADE MAXIMA: mascara todo texto e bloqueia
      // imagens/midia. O sistema mostra dados de clientes, precos e relatorios
      // — nada disso pode vazar no replay. Grava so quando ocorre um erro.
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    // Performance: 10% das navegacoes viram transacao (tendencias sem estourar
    // a cota gratuita). Erros sao SEMPRE capturados, independente desta taxa.
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Replay: 0% das sessoes normais, 100% das sessoes COM erro — melhor
    // custo-beneficio no plano gratuito (so grava o que importa investigar).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}

// Tela mostrada quando um erro de render derruba a UI. Em vez da tela branca,
// o usuario ve uma mensagem clara e um botao para recarregar — e o Sentry ja
// registrou o stack trace por tras.
export function FallbackErro() {
  return (
    <div style={{
      background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center",
      fontFamily: "'Segoe UI', system-ui, sans-serif", color: C.text,
    }}>
      <div style={{ fontSize: 48 }}>😕</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.white }}>
        Algo deu errado nesta tela
      </div>
      <div style={{ fontSize: 14, color: C.muted, maxWidth: 420, lineHeight: 1.5 }}>
        O problema foi registrado automaticamente para correção. Suas vendas e
        dados estão seguros. Recarregue para continuar.
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          marginTop: 8, background: C.accent, color: C.white, border: "none",
          borderRadius: 10, padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer",
        }}
      >
        Recarregar
      </button>
    </div>
  );
}

// Re-exporta o ErrorBoundary do Sentry para o main.tsx usar. Quando o Sentry
// nao esta inicializado, o boundary continua funcionando como um ErrorBoundary
// normal (mostra o fallback), so nao envia o evento.
export const SentryErrorBoundary = Sentry.ErrorBoundary;
