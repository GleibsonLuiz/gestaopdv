import { useCallback, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

// Banner global (montado uma vez em main.tsx). useRegisterSW deve existir em
// instancia unica: varios mounts quebram o listener "controlling" que recarrega
// a pagina apos skipWaiting — o botao Atualizar parece morto.

export default function PwaUpdateBanner() {
  const [updating, setUpdating] = useState(false);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onNeedRefresh() {
      setNeedRefresh(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      registration.addEventListener("updatefound", () => {
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current);
          checkIntervalRef.current = null;
        }
      });

      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = setInterval(() => {
        registration.update().catch(() => {});
      }, 30 * 60 * 1000);
    },
    onRegisterError(err) {
      console.warn("[PWA] erro ao registrar SW:", err);
    },
  });

  const handleUpdate = useCallback(async () => {
    if (updating) return;
    setUpdating(true);
    try {
      await updateServiceWorker(true);
    } catch (err) {
      console.warn("[PWA] updateServiceWorker:", err);
    }
    // Fallback: em prompt mode o reload depende do evento "controlling";
    // com race/multi-tab o reload as vezes nao dispara (vite-plugin-pwa #583).
    window.setTimeout(() => {
      window.location.reload();
    }, 800);
  }, [updateServiceWorker, updating]);

  if (!needRefresh) return null;

  return (
    <div
      role="alert"
      className="fixed left-3 right-3 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        zIndex: 2147483646,
        background: "#10b981",
        color: "#ffffff",
        border: "1px solid #059669",
        pointerEvents: "auto",
      }}
    >
      <div className="text-xl" aria-hidden>🔄</div>
      <div className="flex-1 text-sm">
        <div className="font-bold">Nova versão disponível</div>
        <div className="text-[12px] opacity-90">
          Toque em <b>Atualizar</b> para aplicar.
        </div>
      </div>
      <button
        type="button"
        disabled={updating}
        onClick={() => void handleUpdate()}
        className="px-3 py-2 rounded-lg text-[13px] font-bold disabled:opacity-60"
        style={{ background: "#ffffff", color: "#065f46", cursor: updating ? "wait" : "pointer" }}
      >
        {updating ? "Atualizando…" : "Atualizar"}
      </button>
      <button
        type="button"
        disabled={updating}
        onClick={() => setNeedRefresh(false)}
        aria-label="Dispensar"
        className="text-xl leading-none px-1 opacity-80"
        style={{ color: "#ffffff", cursor: "pointer" }}
      >
        ×
      </button>
    </div>
  );
}
