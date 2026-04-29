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
| 2 | Autenticação + Controle de acesso | ✅ Concluído | JWT, bcrypt, middleware de roles, **trocar senha**, **rate limit** |
| 3 | Dashboard | ✅ Concluído | KPIs + gráfico semanal + top produtos/vendedores + estoque baixo + financeiro |
| 4 | Cadastro de Clientes | ✅ Concluído | CRUD + soft-delete |
| 5 | Cadastro de Fornecedores | ✅ Concluído | CRUD + soft-delete |
| 6 | Cadastro de Produtos | ✅ Concluído | CRUD + categorias |
| 7 | Controle de Estoque | ✅ Concluído | ENTRADA/SAIDA/AJUSTE com histórico |
| 8 | Cadastro de Funcionários | ✅ Concluído | CRUD sobre `User`, role-aware, com proteções |
| 9 | Compras | ✅ Concluído (ver lacuna abaixo) | Transacional, gera ENTRADA automática |
| 10 | PDV — Ponto de Venda | ⏳ Pendente | Núcleo do sistema, próxima etapa sugerida |
| 11 | Financeiro | ✅ Concluído | ContaPagar/ContaReceber: CRUD + pagar/receber/reabrir/cancelar + KPIs |
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

### Sessão — 2026-04-29 (Etapa 11 — Financeiro)

**Etapa 11 implementada:** UI completa de Contas a Pagar e Contas a Receber.

Arquivos criados:
- `backend/src/controllers/contaPagarController.js` — CRUD + ações:
  - `GET /contas-pagar` com filtros: `search`, `status`, `fornecedorId`, `dataInicio`, `dataFim`, `vencidas=true`
  - `GET /:id`, `POST`, `PUT /:id` (apenas se PENDENTE/ATRASADA)
  - `POST /:id/pagar` — status → PAGA, set `pagamento` (default = agora)
  - `POST /:id/reabrir` — volta de PAGA para PENDENTE/ATRASADA conforme vencimento
  - `POST /:id/cancelar` — status → CANCELADA
  - `DELETE /:id` (ADMIN only)
- `backend/src/controllers/contaReceberController.js` — espelho do anterior, mas com `cliente` e `recebimento`. Endpoint de quitação chama-se `/:id/receber`.
- `backend/src/routes/contas-pagar.js`, `backend/src/routes/contas-receber.js` — `authRequired` global, mutações com `requireRole("ADMIN","GERENTE")`, DELETE com `requireRole("ADMIN")`.
- `src/Financeiro.jsx` — página única com:
  - Pill-tabs "📤 A Pagar" / "📥 A Receber" no topo
  - 4 cards KPI por aba: Pendentes, Atrasadas, Vencendo em 7 dias, Pagas/Recebidas
  - Filtros: busca, status, fornecedor/cliente, checkbox "Apenas vencidas", botão "Limpar"
  - Lista com badge de status colorido, dias para vencer ou dias atrasada, botões contextuais (Pagar/Receber, Editar, Reabrir, Cancelar)
  - `ContaModal` (criar/editar) — descrição, valor, vencimento, fornecedor/cliente opcional, observações
  - `PagarReceberModal` — confirmação com data ajustável (default = hoje)
  - `statusEfetivo()`: se PENDENTE com vencimento no passado, exibe badge ATRASADA mesmo sem mutar o DB

Arquivos modificados:
- `backend/src/server.js` — registra `/contas-pagar` e `/contas-receber`.
- `src/lib/api.js` — adiciona 14 métodos (listar/obter/criar/atualizar/pagar|receber/reabrir/cancelar/excluir × 2 entidades).
- `src/App.jsx` — NavBtn "💰 Financeiro" (entre Compras e Funcionários, visível para todos).

**Validado via curl:**
```
GET /contas-pagar             → 200, 20 contas
GET /contas-receber           → 200, 20 contas
GET /contas-pagar?vencidas=true → 6 atrasadas (bate com seed)
GET /contas-pagar?status=PAGA → 6 pagas (bate com seed)
POST /contas-pagar (descricao, valor=129.90, venc=2026-05-15) → 201 PENDENTE
PUT /:id (valor=149.90)        → 200
POST /:id/pagar                → 200 PAGA, pagamento=now
PUT /:id em conta paga         → 409 "Conta paga ou cancelada nao pode ser editada"
POST /:id/reabrir              → 200 volta para PENDENTE (pagamento=null)
POST /:id/cancelar             → 200 CANCELADA
POST /:id/pagar em cancelada   → 409 "Conta cancelada nao pode ser paga"
DELETE /:id (ADMIN)            → 204
POST com valor=0               → 400 "Valor deve ser maior que zero"
POST /contas-receber/:id/receber → 200 PAGA (recebimento=now)
POST /contas-receber/:id/reabrir → 200 PENDENTE (recebimento=null)
```

### Sessão — 2026-04-29 (Etapa 2 — extensões de auth)

**Etapa 2 ampliada:** trocar senha, rate limit e remoção de credenciais hardcoded.

Arquivos criados:
- `backend/src/middlewares/rateLimitLogin.js` — rate limit em memória (sem dependência externa) para `POST /auth/login`. Janela deslizante: máx **10 tentativas / 15 min** por IP. Estourou → bloqueio de 15 min com HTTP 429 e header `Retry-After`. Login bem-sucedido limpa o histórico do IP.
- `src/TrocarSenhaModal.jsx` — modal com 3 campos (atual, nova, confirmar), validação client-side (mín 6 chars, nova ≠ atual, confirmar ===  nova), feedback de sucesso e auto-fecha em 1.5s.

Arquivos modificados:
- `backend/src/controllers/authController.js` — nova função `trocarSenha`: valida senha atual via `bcrypt.compare`, exige nova ≥ 6 chars e diferente da atual, persiste hash via `bcrypt.hash(_, 10)`.
- `backend/src/routes/auth.js` — aplica `rateLimitLogin` em `POST /login`; adiciona `PUT /senha` (com `authRequired`).
- `src/lib/api.js` — adiciona `trocarSenha(senhaAtual, senhaNova)`.
- `src/Login.jsx` — **remove credenciais hardcoded** (`admin@gestaopro.local`/`admin123`) — campos iniciam vazios.
- `src/App.jsx` — header com avatar/inicial + dropdown de usuário (Trocar senha / Sair). Click-fora fecha o menu. Renderiza `<TrocarSenhaModal>` quando aberto.

**Validado via curl:**
```
PUT /auth/senha (senha atual errada)        → 401  "Senha atual incorreta"
PUT /auth/senha (nova com 3 chars)          → 400  "A nova senha deve ter pelo menos 6 caracteres"
PUT /auth/senha (válida admin123→admin456)  → 200  { ok: true }
POST /auth/login com senha antiga           → 401  "Credenciais invalidas"
POST /auth/login com nova senha             → 200  { token, user }
PUT /auth/senha (revertida admin456→admin123)→ 200  { ok: true }
POST /auth/login x11 com email inexistente: tentativas 1-10 → 401, 11ª → 429
  body: "Muitas tentativas de login. Tente novamente em 900 segundos."
```

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

**Etapa 11 (Financeiro) concluída.** 11 de 13 etapas implementadas (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11). Faltam: Notificações (12), Relatórios (13).

### Próxima decisão (a ser tomada)

- **(a)** Implementar cancelamento de compra (~30 linhas) e fechar Etapa 9 sem lacuna.
- **(b)** **Etapa 12 — Notificações e Alertas** — central de notificações para estoque baixo e contas vencidas/a vencer (dashboard já apura estes números, falta um sino no header com contador e drawer de alertas).
- **(c)** **Etapa 13 — Relatórios + Exportação PDF** — relatórios de vendas, compras, fluxo de caixa por período, com export PDF.

Recomendação: **(b) Notificações** — leve, reaproveita as queries do dashboard, fecha o loop de alertas que o usuário já sente falta (atrasos passam despercebidos sem aviso). Depois, fechar com (c) Relatórios.

### Como retomar

1. Garantir backend e frontend rodando:
   ```
   cd backend && npm run dev    # porta 3333
   cd .. && npm run dev          # porta 5173/5174
   ```
2. Abrir [http://localhost:5174/](http://localhost:5174/)
3. Login: `admin@gestaopro.local` / `admin123`
4. Decidir qual das opções (a)/(b)/(c)/(d) acima seguir
