import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import authRoutes from "./routes/auth.js";
import clientesRoutes from "./routes/clientes.js";
import fornecedoresRoutes from "./routes/fornecedores.js";
import categoriasRoutes from "./routes/categorias.js";
import produtosRoutes from "./routes/produtos.js";
import estoqueRoutes from "./routes/estoque.js";
import comprasRoutes from "./routes/compras.js";
import funcionariosRoutes from "./routes/funcionarios.js";
import vendasRoutes from "./routes/vendas.js";
import dashboardRoutes from "./routes/dashboard.js";
import contasPagarRoutes from "./routes/contas-pagar.js";
import contasReceberRoutes from "./routes/contas-receber.js";
import alertasRoutes from "./routes/alertas.js";
import relatoriosRoutes from "./routes/relatorios.js";
import adminRoutes from "./routes/admin.js";
import caixasRoutes from "./routes/caixas.js";
import configuracaoRoutes from "./routes/configuracao.js";
import pdvRoutes from "./routes/pdv.js";
import formasPagamentoRoutes from "./routes/formas-pagamento.js";
import orcamentosRoutes from "./routes/orcamentos.js";
import comissoesRoutes from "./routes/comissoes.js";
import tarefasRoutes from "./routes/tarefas.js";
import fidelidadeRoutes from "./routes/fidelidade.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3333;

// CORS: em dev (sem FRONTEND_URL) libera tudo; em producao (Vercel) limita
// ao dominio do frontend. Vercel preview deployments tem URL diferente da
// prod — para liberar geral, deixar FRONTEND_URL = "*".
const FRONTEND_URL = process.env.FRONTEND_URL;
app.use(cors({
  origin: FRONTEND_URL && FRONTEND_URL !== "*" ? FRONTEND_URL : true,
  credentials: true,
}));
app.use(express.json());

// Em dev (sem Vercel Blob configurado) servimos os uploads do filesystem
// para preservar o fluxo local. Em producao, as URLs no banco apontam
// direto para o blob.vercel-storage.com — esse middleware fica inerte.
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  app.use("/uploads", express.static(path.resolve("uploads")));
}

app.get("/", (req, res) => {
  res.json({
    nome: "Gestao + PDV API",
    versao: "1.0.0",
    status: "online",
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/auth", authRoutes);
app.use("/clientes", clientesRoutes);
app.use("/fornecedores", fornecedoresRoutes);
app.use("/categorias", categoriasRoutes);
app.use("/produtos", produtosRoutes);
app.use("/estoque", estoqueRoutes);
app.use("/compras", comprasRoutes);
app.use("/funcionarios", funcionariosRoutes);
app.use("/vendas", vendasRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/contas-pagar", contasPagarRoutes);
app.use("/contas-receber", contasReceberRoutes);
app.use("/alertas", alertasRoutes);
app.use("/relatorios", relatoriosRoutes);
app.use("/admin", adminRoutes);
app.use("/caixas", caixasRoutes);
app.use("/configuracao", configuracaoRoutes);
app.use("/pdv", pdvRoutes);
app.use("/formas-pagamento", formasPagamentoRoutes);
app.use("/orcamentos", orcamentosRoutes);
app.use("/comissoes", comissoesRoutes);
app.use("/tarefas", tarefasRoutes);
app.use("/fidelidade", fidelidadeRoutes);

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor" });
});

// Listen apenas quando rodado direto (npm run dev). Quando importado pelo
// Vercel (api/index.js), nao tenta abrir porta — o runtime ja gerencia.
const ehExecucaoDireta = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (ehExecucaoDireta) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

export default app;
