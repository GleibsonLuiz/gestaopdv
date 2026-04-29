# Progresso — GestãoPRO

Arquivo de continuidade entre sessões. Sempre atualizar ao final de cada sessão de trabalho.

---

## Stack do projeto

- **Frontend:** React 19 + Vite (sem Tailwind, estilos inline com paleta dark fixa)
- **Backend:** Node + Express + Prisma + PostgreSQL (Neon)
- **Auth:** JWT, bcrypt, roles `ADMIN | GERENTE | VENDEDOR`
- **Login:** `admin@gestaopro.local` / `admin123`

## Estrutura de pastas

```
d:/gestao-pdv/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma   ← modelos: User, Cliente, Fornecedor, Categoria,
│   │   │                     Produto, Venda/ItemVenda, Compra/ItemCompra,
│   │   │                     MovimentacaoEstoque, ContaPagar, ContaReceber
│   │   └── seed.js         ← seed idempotente, 20 registros por módulo
│   └── src/
│       ├── controllers/    ← auth, cliente, fornecedor, categoria, produto,
│       │                     estoque, compra
│       ├── routes/         ← rotas de cada controller
│       ├── middlewares/    ← authRequired, requireRole
│       ├── lib/prisma.js
│       └── server.js       ← Express na porta 3333
└── src/  (frontend)
    ├── App.jsx             ← navegação e header
    ├── Login.jsx
    ├── Clientes.jsx
    ├── Fornecedores.jsx
    ├── Produtos.jsx
    ├── Estoque.jsx + MovimentarEstoqueModal.jsx
    ├── Compras.jsx
    ├── Projeto.jsx         ← rastreador interno de etapas
    └── lib/api.js          ← cliente HTTP
```

---

## Etapas (13 totais)

| # | Etapa | Status | Notas |
|---|-------|--------|-------|
| 1 | Estrutura base + banco | ✅ Concluído | schema.prisma com todos os modelos |
| 2 | Autenticação + Controle de acesso | ✅ Concluído | JWT, bcrypt, middleware de roles |
| 3 | Dashboard | ✅ Concluído | KPIs + gráfico semanal + top produtos/vendedores + estoque baixo + financeiro |
| 4 | Cadastro de Clientes | ✅ Concluído | CRUD + soft-delete |
| 5 | Cadastro de Fornecedores | ✅ Concluído | CRUD + soft-delete |
| 6 | Cadastro de Produtos | ✅ Concluído | CRUD + categorias |
| 7 | Controle de Estoque | ✅ Concluído | ENTRADA/SAIDA/AJUSTE com histórico |
| 8 | Cadastro de Funcionários | ✅ Concluído | CRUD sobre `User`, role-aware, com proteções |
| 9 | Compras | ✅ Concluído (ver lacuna abaixo) | Transacional, gera ENTRADA automática |
| 10 | PDV — Ponto de Venda | ⏳ Pendente | Núcleo do sistema, próxima etapa sugerida |
| 11 | Financeiro | ⏳ Pendente | ContaPagar/ContaReceber (modelos prontos) |
| 12 | Notificações e Alertas | ⏳ Pendente | Estoque baixo + contas a vencer |
| 13 | Relatórios + Exportação PDF | ⏳ Pendente | — |

### Lacuna conhecida na Etapa 9 (Compras)

Não existe rota/UI para **cancelar/excluir** uma compra. Hoje, se uma compra é registrada por engano, o usuário precisa ir no Estoque e fazer SAIDA manual de cada item. Sugestão: implementar `DELETE /compras/:id` que faça estorno transacional do estoque (cria SAIDA com motivo `"CANCELAMENTO COMPRA #N"`). **Decisão pendente do usuário** se faz isso antes ou depois do PDV.

---

## Convenções estabelecidas

### Backend
- Cada feature: `controller` + `route` + registro em `server.js`
- Rota global usa `authRequired`; mutações usam `requireRole("ADMIN","GERENTE")`; DELETE usa `requireRole("ADMIN")`
- Mensagens de erro em português **sem acentos** (ex: `"Codigo e obrigatorio"`)
- Tratar códigos Prisma: `P2002` → 409 (conflito), `P2003` → 400 (FK), `P2025` → 404
- Operações que mexem em estoque devem usar `prisma.$transaction`

### Frontend
- Página em `src/<Nome>.jsx`, registrada em `App.jsx` como `<NavBtn>`
- Estilos inline com paleta `C` fixa:
  - `bg #0f1117` · `surface #1a1d27` · `card #21253a` · `border #2e3354`
  - `accent #4f8ef7` · `purple #7c3aed` · `green #22c55e` · `red #ef4444`
  - `yellow #f59e0b` · `text #e2e8f0` · `muted #64748b` · `white #ffffff`
- Botões primários: gradient `accent → purple`
- Permissões respeitadas no botão (`podeCriar = role === "ADMIN" || "GERENTE"`)

### Dados de teste (seed)
- **20 registros por módulo**, tema **papelaria**, sempre incluir financeiro
- Seed idempotente: `upsert` em entidades com chave única; `count()` + skip nas demais
- **TODOS os campos textuais em CAIXA ALTA** (nome, descricao, endereco, cidade, observacoes, motivo, código de produto)
- **NÃO** colocar em maiúsculas: emails, senhas, telefones, cnpj/cpfCnpj, cep
- A função `uppercaseExistingData()` no seed.js converte registros existentes a cada execução

---

## Estado atual do banco (após último seed)

| Tabela | Total |
|--------|-------|
| users | 20 (1 ADMIN, 5 GERENTES, 14 VENDEDORES) |
| categorias | 9 |
| fornecedores | 24 |
| clientes | 23 |
| produtos | 23 |
| compras | 21 |
| movimentacoes_estoque | 42 |
| contas_pagar | 20 (6 atrasadas, 8 pendentes, 6 pagas) |
| contas_receber | 20 (4 atrasadas, 10 pendentes, 6 recebidas) |

> Os totais acima de 20 vêm de testes manuais via `requests.http` antes do seed.

---

## Histórico de sessões

### Sessão — 2026-04-29 (Dashboard)

**Etapa 3 — Dashboard: implementada.**

Arquivos criados:
- `backend/src/controllers/dashboardController.js` — endpoint único `GET /dashboard/resumo` que executa em paralelo (`Promise.all`) ~20 queries agregando KPIs:
  - Vendas hoje / mês (com variação % vs. mês anterior) / ticket médio
  - Compras do mês
  - Totais de cadastros (clientes, produtos, fornecedores, funcionários ativos)
  - Vendas por dia dos últimos 7 dias (com `$queryRaw` agrupando por `DATE("createdAt")`, completando dias vazios)
  - Top 5 produtos do mês (`itemVenda.groupBy` por produtoId)
  - Top 5 vendedores do mês (`venda.groupBy` por userId)
  - Formas de pagamento do mês (`groupBy` em formaPagamento)
  - Produtos com estoque ≤ estoqueMinimo (`$queryRaw`, top 10)
  - Contas a pagar/receber pendentes + contagem de atrasadas
  - Últimas 8 vendas e últimas 5 compras
- `backend/src/routes/dashboard.js` — rota com `authRequired` (sem restrição de role: todos os perfis veem o dashboard)
- `src/Dashboard.jsx` — página rica com:
  - 4 cards KPI principais (vendas hoje, faturamento mês com variação, ticket médio, compras mês)
  - 5 mini-cards (clientes, produtos, fornecedores, funcionários, estoque baixo)
  - Gráfico de barras dos últimos 7 dias (CSS puro, sem libs)
  - Ranking de top produtos com badge dourado para 1º lugar
  - Top vendedores com barra de progresso por share
  - Formas de pagamento com barras coloridas e percentuais
  - Painéis de financeiro pendente (a pagar/receber) com alerta de atrasadas
  - Lista de produtos com estoque baixo
  - Últimas vendas e últimas compras
  - Botão "↻ Atualizar" para recarregar manualmente

Arquivos modificados:
- `backend/src/server.js` — registra `/dashboard`
- `src/lib/api.js` — adiciona `obterDashboard()`
- `src/App.jsx` — NavBtn "📊 Dashboard" disponível para todos os perfis (entre PDV e Clientes), import e rota

**Validado via API:**
```
GET /dashboard/resumo → 200
  vendasHoje: { quantidade: 1, total: 60 }
  vendasMes:  { quantidade: 1, total: 60, variacaoPercentual: null }
  comprasMes: { quantidade: 10, total: 1448.5 }
  contasPagarPendentes:   { quantidade: 14, total: 15479.8, atrasadas: 6 }
  contasReceberPendentes: { quantidade: 14, total: 9154.8,  atrasadas: 4 }
  produtosEstoqueBaixo: 4
  vendasPorDia: 7 dias com 1 venda em 2026-04-29
  topProdutos: 5 itens
```

### Sessão — 2026-04-29 (continuação)

**Etapa 8 — Funcionários: implementada.**

Arquivos criados:
- `backend/src/controllers/funcionarioController.js` — CRUD sobre o modelo `User` com bcrypt nas senhas, validação de role, proteções:
  - Não retorna senha (hash) em nenhuma resposta
  - Bloqueia auto-exclusão e auto-rebaixamento de ADMIN
  - Bloqueia desativar/excluir o último ADMIN ativo
  - Senha mínima de 6 caracteres
- `backend/src/routes/funcionarios.js` — todas as mutações exigem `requireRole("ADMIN")`
- `src/Funcionarios.jsx` — listagem com busca + filtros (perfil/status), modal de criar/editar com:
  - Badge "VOCÊ" no usuário logado
  - Campo de senha "deixe em branco para manter" no modo edição
  - Selects de role e status desabilitados quando o usuário tenta editar a si mesmo (proteção UI)
  - Tela inteira protegida: não-ADMIN vê mensagem "🔒 Apenas administradores"

Arquivos modificados:
- `backend/src/server.js` — registra `/funcionarios`
- `src/lib/api.js` — adiciona `listarFuncionarios`, `obterFuncionario`, `criarFuncionario`, `atualizarFuncionario`, `excluirFuncionario`
- `src/App.jsx` — NavBtn "🧑‍💼 Funcionários" só aparece para ADMIN
- `backend/prisma/seed.js` — função `seedFuncionarios()` cria 19 funcionários (5 GERENTES + 14 VENDEDORES) totalizando 20 com o admin existente. Senha padrão: `func123`

**Validado via API:**
```
GET /funcionarios → 20 registros
  Por role: { ADMIN: 1, VENDEDOR: 14, GERENTE: 5 }
```

### Sessão — 2026-04-29

**Contexto inicial:** projeto trazido com 7 de 13 etapas concluídas em código (1, 2, 4, 5, 6, 7, 9). Última feature era Compras.

**O que foi feito:**

1. **Análise do projeto** — mapeamento completo da stack, etapas concluídas e pendentes.
2. **Subiu backend e frontend:**
   - Backend em `http://localhost:3333` (`cd backend && npm run dev`)
   - Frontend em `http://localhost:5174` (Vite — porta 5173 estava ocupada)
3. **Auditoria da Etapa 9 (Compras)** — confirmado funcional. Identificada **uma lacuna**: ausência de cancelamento de compra. Decisão sobre implementar agora ou depois ficou pendente.
4. **Criado seed idempotente** com 20 registros temáticos de papelaria em [backend/prisma/seed.js](backend/prisma/seed.js):
   - 8 categorias, 20 fornecedores, 20 clientes, 20 produtos
   - 20 compras (com estoque + movimentações geradas em transação)
   - 20 contas a pagar (status: 6 atrasadas, 8 pendentes, 6 pagas)
   - 20 contas a receber (status: 4 atrasadas, 10 pendentes, 6 recebidas)
5. **Conversão para CAIXA ALTA** — adicionada função `uppercaseExistingData()` no seed que faz `UPDATE ... SET col = UPPER(col)` em todas as 9 tabelas (preservando emails para não quebrar login). Todos os arrays de seed reescritos em maiúsculas.

**Arquivos modificados:**
- `backend/prisma/seed.js` — reescrita completa, ~400 linhas

**Servidores deixados rodando (em background):**
- Backend nodemon (id: bal4k7uhu)
- Vite dev (id: by1qnt47t)

---

## Onde paramos

**Etapa 3 (Dashboard) concluída.** Já temos 9 etapas implementadas (1, 2, 3, 4, 5, 6, 7, 8, 9, 10 — também o PDV está implementado conforme `src/PDV.jsx`). Faltam: Financeiro (11), Notificações (12), Relatórios (13).

### Próxima decisão (a ser tomada)

- **(a)** Implementar cancelamento de compra (~30 linhas) e fechar Etapa 9 sem lacuna.
- **(b)** **Etapa 11 — Financeiro** — UI para ContasPagar/Receber (modelos prontos, dados já populados, dashboard já mostra totais pendentes).
- **(c)** **Etapa 12 — Notificações/alertas** — leve: estoque baixo + contas a vencer (dashboard já apura estes números).
- **(d)** **Etapa 13 — Relatórios + PDF** — exportação de vendas/compras/contas.

Recomendação: **(b) Financeiro** — fecha o ciclo do dinheiro (já temos Compras gerando saída e Vendas gerando entrada; Financeiro permite acompanhar de fato as contas).

### Como retomar

1. Garantir backend e frontend rodando:
   ```
   cd backend && npm run dev    # porta 3333
   cd .. && npm run dev          # porta 5173/5174
   ```
2. Abrir [http://localhost:5174/](http://localhost:5174/)
3. Login: `admin@gestaopro.local` / `admin123`
4. Decidir qual das opções (a)/(b)/(c)/(d) acima seguir
