import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3333;

app.use(cors());
app.use(express.json());

// Anexos de contas (PDF/JPG/PNG) salvos em backend/uploads. Servidos como
// arquivos estaticos. Token nao e exigido aqui — assume-se que conhecer a
// URL randomica (UUID) ja restringe o acesso. Se precisar de download
// autenticado, transformar em rota com authRequired e res.sendFile.
app.use("/uploads", express.static(path.resolve("uploads")));

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

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor" });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
