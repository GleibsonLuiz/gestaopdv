import { useRegisterSW } from "virtual:pwa-register/react";

// =====================================================================
// Banner fixo que aparece quando o Service Worker detecta uma versao
// nova publicada. O usuario pode tocar pra recarregar e ativar o novo
// bundle sem precisar fechar/reabrir o app PWA.
//
// useRegisterSW (vite-plugin-pwa) cuida do ciclo de vida:
//   - immediate: true       — registra ja no mount (sem esperar load)
//   - onNeedRefresh         — dispara quando ha SW waiting (nova versao)
//   - updateServiceWorker() — ativa o SW novo e recarrega a pagina
// =====================================================================

export default function PwaUpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisterError(err) {
      // Em dev (sem PWA habilitado) o registro falha silenciosamente. OK.
      console.warn("[PWA] erro ao registrar SW:", err);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="alert"
      className="fixed left-3 right-3 z-[9999] rounded-xl shadow-2xl flex items-center gap-3 px-4 py-3"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        background: "#10b981",
        color: "#ffffff",
        border: "1px solid #059669",
      }}
    >
      <div className="text-xl">🔄</div>
      <div className="flex-1 text-sm">
        <div className="font-bold">Nova versão disponível</div>
        <div className="text-[12px] opacity-90">
          Toque em <b>Atualizar</b> para aplicar.
        </div>
      </div>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="px-3 py-2 rounded-lg text-[13px] font-bold"
        style={{ background: "#ffffff", color: "#065f46" }}
      >
        Atualizar
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        aria-label="Dispensar"
        className="text-xl leading-none px-1 opacity-80"
        style={{ color: "#ffffff" }}
      >×</button>
    </div>
  );
}
