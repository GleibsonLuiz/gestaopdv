import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/login.css";
import "./styles/pdv.css";
import { inicializarTema, C } from "./lib/theme";
import { inicializarSentry, SentryErrorBoundary, FallbackErro } from "./lib/sentry";
import PwaUpdateBanner from "./components/PwaUpdateBanner";
import IndicadorRede from "./components/IndicadorRede";

// Monitoramento de erros: roda antes do render para capturar falhas de
// inicializacao. No-op sem VITE_SENTRY_DSN (dev/build de teste).
inicializarSentry();

// Lazy split entre os 2 apps. Como o roteamento e decidido sincronicamente
// pelo path, so um dos chunks e baixado no carregamento inicial.
const App = lazy(() => import("./App"));
const AdminMasterApp = lazy(() => import("./AdminMasterApp"));

// Hidrata o tema ANTES do render para evitar flash do tema padrao.
inicializarTema();

// ETAPA 10 multi-tenant: roteamento path-based ENTRE 2 apps separados.
// Quando a URL contem /admin-master, carregamos a UI exclusiva do
// desenvolvedor do sistema (login proprio + lista de empresas). O resto
// (qualquer outro path) carrega o app normal.
const isAdminMaster = window.location.pathname.startsWith("/admin-master");

const root = document.getElementById("root");
if (!root) throw new Error("Elemento #root nao encontrado no DOM");

function TelaCarregando() {
  return (
    <div style={{
      background: C.bg, minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center",
      color: C.muted, fontFamily: "'Segoe UI', sans-serif",
    }}>
      Carregando...
    </div>
  );
}

createRoot(root).render(
  <StrictMode>
    <SentryErrorBoundary fallback={<FallbackErro />}>
      <PwaUpdateBanner />
      <IndicadorRede />
      <Suspense fallback={<TelaCarregando />}>
        {isAdminMaster ? <AdminMasterApp /> : <App />}
      </Suspense>
    </SentryErrorBoundary>
  </StrictMode>,
);
