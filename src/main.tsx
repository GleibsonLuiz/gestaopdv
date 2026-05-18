import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/login.css";
import "./styles/pdv.css";
import App from "./App.jsx";
import AdminMasterApp from "./AdminMasterApp";
import { inicializarTema } from "./lib/theme";

// Hidrata o tema ANTES do render para evitar flash do tema padrao.
inicializarTema();

// ETAPA 10 multi-tenant: roteamento path-based ENTRE 2 apps separados.
// Quando a URL contem /admin-master, carregamos a UI exclusiva do
// desenvolvedor do sistema (login proprio + lista de empresas). O resto
// (qualquer outro path) carrega o app normal.
const isAdminMaster = window.location.pathname.startsWith("/admin-master");

const root = document.getElementById("root");
if (!root) throw new Error("Elemento #root nao encontrado no DOM");

createRoot(root).render(
  <StrictMode>
    {isAdminMaster ? <AdminMasterApp /> : <App />}
  </StrictMode>,
);
