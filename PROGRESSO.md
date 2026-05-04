# Progresso — GestãoPRO

Arquivo de continuidade entre sessões. Sempre atualizar ao final de cada sessão de trabalho.

---

## Stack do projeto

- **Frontend:** React 19 + Vite (sem Tailwind, estilos inline com paleta dark fixa). Layout com **sidebar fixa à esquerda** (240px, responsiva ≤900px com hamburger + overlay).
- **Backend:** Node + Express + Prisma + PostgreSQL (Neon)
- **Auth:** JWT, bcrypt, roles `ADMIN | GERENTE | VENDEDOR` + **permissões por módulo** (`User.permissoes String[]`) com middleware `requirePermissao(modulo)` em todas as rotas críticas.
- **Login:** `admin@gestaopro.local` / `admin123`

## Estrutura de pastas

```
d:/gestao-pdv/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma   ← modelos: User (com permissoes String[]),
│   │   │                     Cliente, Fornecedor, Categoria, Produto,
│   │   │                     Venda/ItemVenda, Compra/ItemCompra,
│   │   │                     MovimentacaoEstoque, ContaPagar, ContaReceber,
│   │   │                     Anexo (do financeiro)
│   │   ├── migrations/     ← incl. 20260430114015_add_user_permissoes
│   │   └── seed.js         ← seed idempotente, 20 registros por módulo,
│   │                         popula User.permissoes via permissoesPadrao(role)
│   ├── uploads/            ← anexos do financeiro (PDF/JPG/PNG até 5 MB)
│   └── src/
│       ├── controllers/    ← auth, cliente, fornecedor, categoria, produto,
│       │                     estoque, compra, venda, dashboard, alertas,
│       │                     contaPagar, contaReceber, funcionario, relatorios,
│       │                     admin (reset total)
│       ├── routes/         ← rotas de cada controller (com requirePermissao)
│       ├── middlewares/    ← authRequired, requireRole, requirePermissao,
│       │                     rateLimitLogin
│       ├── lib/prisma.js · lib/permissoes.js
│       └── server.js       ← Express na porta 3333
└── src/  (frontend)
    ├── App.jsx             ← sidebar retrátil (72↔240px) + temas + roteamento
    ├── Login.jsx · TrocarSenhaModal.jsx · AparenciaModal.jsx
    ├── Dashboard.jsx · PDV.jsx · Relatorios.jsx · Financeiro.jsx
    ├── Clientes.jsx · Fornecedores.jsx · Produtos.jsx
    ├── Estoque.jsx + MovimentarEstoqueModal.jsx · Compras.jsx
    ├── Funcionarios.jsx    ← inclui modal com seção de Permissões (10 switches)
    ├── Alertas.jsx         ← sino + drawer com polling 60s
    ├── Sistema.jsx         ← zona de perigo: Reset Total (apenas ADMIN)
    ├── Projeto.jsx         ← rastreador de etapas + aba Extras (9 melhorias)
    └── lib/api.js · lib/permissoes.js · lib/theme.js
                            ← MODULOS, podeAcessar, permissoesPadrao,
                              TEMAS (4 paletas), C, aplicarTema, salvarTema
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
| 10 | PDV — Ponto de Venda | ✅ Concluído | Tela de venda com carrinho, busca de produtos, baixa automática de estoque |
| 11 | Financeiro | ✅ Concluído | ContaPagar/ContaReceber: CRUD + pagar/receber/reabrir/cancelar + KPIs |
| 12 | Notificações e Alertas | ✅ Concluído | Sino no header + drawer com alertas (estoque + contas), polling 60s |
| 13 | Relatórios + Exportação PDF | ✅ Concluído | 4 relatórios (vendas/compras/financeiro/estoque) com export PDF (jsPDF + autotable) |

### Lacuna conhecida na Etapa 9 (Compras)

Não existe rota/UI para **cancelar/excluir** uma compra. Hoje, se uma compra é registrada por engano, o usuário precisa ir no Estoque e fazer SAIDA manual de cada item. Sugestão: implementar `DELETE /compras/:id` que faça estorno transacional do estoque (cria SAIDA com motivo `"CANCELAMENTO COMPRA #N"`). **Decisão pendente do usuário** se faz isso antes ou depois do PDV.

---

## Convenções estabelecidas

### Backend
- Cada feature: `controller` + `route` + registro em `server.js`
- Rota global usa `authRequired`; mutações usam `requireRole("ADMIN","GERENTE")`; DELETE usa `requireRole("ADMIN")`
- **Permissões por módulo:** rotas de módulos finais (estoque, compras, contas-pagar, contas-receber, dashboard, relatorios, vendas, funcionarios) têm `router.use(requirePermissao("MODULO"))`. Cadastros (clientes, fornecedores, produtos, categorias) deixam GET livre (consumo cruzado) e protegem apenas as mutações
- Quando criar nova feature, decidir: é um **módulo final** (router.use bloqueia tudo) ou um **cadastro consultado por outros** (GET livre, mutação protegida)?
- Mensagens de erro em português **sem acentos** (ex: `"Codigo e obrigatorio"`)
- Tratar códigos Prisma: `P2002` → 409 (conflito), `P2003` → 400 (FK), `P2025` → 404
- Operações que mexem em estoque devem usar `prisma.$transaction`

### Frontend
- Página em `src/<Nome>.jsx`, registrada em `App.jsx` como `<NavItem>` na sidebar
- Layout: **sidebar fixa à esquerda (240px)** com agrupamento por seção (Cadastros / Operação / Sistema). Em ≤900px, sidebar vira off-canvas com botão `☰` e overlay clicável (Esc também fecha)
- Estilos inline com paleta `C` fixa:
  - `bg #0f1117` · `surface #1a1d27` · `card #21253a` · `border #2e3354`
  - `accent #4f8ef7` · `purple #7c3aed` · `green #22c55e` · `red #ef4444`
  - `yellow #f59e0b` · `text #e2e8f0` · `muted #64748b` · `white #ffffff`
- Botões primários: gradient `accent → purple`
- Permissões: ao adicionar nova tela, envolver o `NavItem` em `{podeAcessar(user, "MODULO") && <NavItem ... />}` e mapear a tela em `TELA_MODULO` no App.jsx (o `useEffect` redireciona se o usuário perde acesso à tela atual)
- Botões CRUD ainda respeitam role (`podeCriar = role === "ADMIN" || "GERENTE"`)

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
| users | 22 (1 ADMIN, 5 GERENTES, 16 VENDEDORES — 2 inativos vindos de testes manuais) |
| categorias | 9 |
| fornecedores | 25 |
| clientes | 23 |
| produtos | 23 |
| compras | 21 |
| movimentacoes_estoque | 59 |
| contas_pagar | 22 (PENDENTE 2, ATRASADA 0, PAGA 12, CANCELADA 8) |
| contas_receber | 20 (4 atrasadas, 10 pendentes, 6 recebidas) |

> Os totais acima de 20 vêm de testes manuais via `requests.http` antes do seed.

**Coluna `users.permissoes`** (text[]) populada pelo seed:
- ADMIN → todos os 10 módulos
- GERENTE → 9 (todos exceto FUNCIONARIOS)
- VENDEDOR → 3 (PDV, CLIENTES, PRODUTOS)

---

## Histórico de sessões

### Sessão — 2026-05-04 (Refactor PDV bipagem + foto em produtos)

Refactor profundo dos módulos PDV e Cadastro de Produtos para fluxo de loja física com scanner. **Mantida a convenção de estilos inline + paleta `C` via CSS variables** — pedido original mencionava Tailwind, mas isso quebraria o sistema de temas, então seguiu-se o padrão estabelecido.

**1. Backend — foto em Produto** (migration `20260504122911_produto_imagem`)

- Schema: campo `imagem String?` em `Produto`
- `backend/src/controllers/produtoImagemController.js` — multer com pasta dedicada `backend/uploads/produtos/`, limite 2 MB, MIMEs `image/jpeg|png|webp`. Upload substitui imagem anterior (apaga arquivo antigo do disco antes de gravar a nova URL). DELETE limpa coluna + arquivo.
- `backend/src/routes/produtos.js` — `POST /produtos/:id/imagem` e `DELETE /produtos/:id/imagem` (ambos `requireRole("ADMIN","GERENTE")` e `requirePermissao("PRODUTOS")`).
- `src/lib/api.js` — `enviarImagemProduto(id, file)` (multipart) e `excluirImagemProduto(id)`.

**2. Cadastro de Produtos — dropzone + preview**

- `src/Produtos.jsx`: novo componente `DropzoneImagem` (clique ou arraste) com preview imediato via `URL.createObjectURL`. Componente `Miniatura` exibe foto na listagem (40×40 com fallback `📦`).
- `useState<File|null>` para captura local; upload acontece **após** create/update do produto. Falha no upload exibe aviso mas mantém o produto salvo (não bloqueia o fluxo).
- Helper exportado `urlImagem(imagem)` resolve URL relativa do backend para absoluta consumível por `<img>`.

**3. PDV — bipagem por scanner + cestinha visual**

- **Layout 70/30**: barra de bipagem central no topo (input grande com `🔎` e dicas F8/F10), cestinha 70% à esquerda com fotos 64×64 e novos itens **no topo** (incremento também move para o topo, com flash CSS de 0.7s), painel direito 30% com totais + botão Finalizar.
- **Bipagem**: handler de `Enter` em `biparOuConfirmar()` busca match exato pelo código (caso scanner) e cai para a primeira sugestão se não houver. Sugestões aparecem como dropdown abaixo do input apenas quando há texto digitado (vista limpa quando idle).
- **Refoco universal**: input tem `onBlur` que reFoca em ~120ms se nenhuma modal estiver aberta. Todas as ações (adicionar, remover, fechar pagamento, fechar recibo) chamam `focarBusca()`.
- **Atalhos atualizados**: F1–F6 forma de pagamento, **F8** abre modal Cancelar Item, **F10** abre pagamento (substituiu `End`), `Esc` limpa input ou fecha modal aberta. Listener global usa refs vivas (`carrinhoRef`, `pagamentoAbertoRef`, `abrirPagamentoRef`) para evitar rebind a cada render.
- **Modal Cancelar Item**: lista todos os itens do carrinho (foto + nome + qtd × preço); clique em qualquer linha remove e refoca a busca; se era o último item, fecha automaticamente.
- Produtos no carrinho carregam o campo `imagem` do payload e exibem na cestinha + nas sugestões + no modal Cancelar.

**Validado via curl (backend rodando local):**
```
POST /auth/login                                                      → 200 token
GET  /produtos                                                         → 200 (campo imagem: null em todos)
POST /produtos/:id/imagem (FormData arquivo PNG 1×1)                  → 200 imagem: "/uploads/produtos/<uuid>.png"
GET  /uploads/produtos/<uuid>.png                                     → 200 content-type: image/png
DELETE /produtos/:id/imagem                                           → 200 imagem: null (arquivo apagado do disco)
npx vite build                                                         → ok (1.28s, 238 modules transformed)
```

**Lacunas conhecidas:**
- Seed não popula imagens (sem dependência externa de URLs placeholder). Operador faz upload manual.
- PDV preserva o cliente/desconto/forma quando "Cancelar Item" remove um item — só a venda completa é zerada quando o usuário usa "Limpar tudo" ou após uma venda concluída.

### Sessão — 2026-04-30 (Onda pós-MVP: hard-delete + Sistema + sidebar retrátil + temas + aba Extras)

Cinco commits em sequência transformando o MVP num produto polido. Ordem cronológica abaixo.

**1. Hard-delete em cadastros** (commit `b9a009e`)

Antes só havia "Inativar" (que o backend tratava como soft-delete `ativo=false`). Agora há duas operações distintas em fornecedor/cliente/produto:
- `DELETE /:id` mantém soft-delete (ativo=false)
- `DELETE /:id?permanente=true` → `prisma.delete()` real
- `P2003` (FK) → 409 com mensagem amigável: orienta a inativar quando há vínculos
- `api.js`: novos `excluirPermanenteFornecedor/Cliente/Produto`
- UI: botão "Inativar" passa a ser amarelo; novo "Excluir" vermelho sólido ao lado, com `window.confirm`

**2. Tela administrativa Sistema com Reset Total** (commit `580ebcb`)

Nova área exclusiva para ADMIN — operação destrutiva de limpeza de dados operacionais.
- `backend/src/controllers/adminController.js` + `routes/admin.js` — `POST /admin/reset` com `authRequired` + `requireRole("ADMIN")` + validação da palavra-chave `"CONFIRMAR_RESET"` no body (defesa em profundidade)
- Limpeza em `prisma.$transaction` respeitando ordem reversa de FKs: itensVenda → vendas → itensCompra → compras → movimentações → anexos → contas → produtos → categorias → fornecedores → clientes
- Apaga arquivos físicos em `backend/uploads/` após a transação (best-effort)
- **Preserva users e suas permissões**
- `src/Sistema.jsx`: zona de perigo com cards do que é apagado vs preservado; modal exige digitar exatamente `CONFIRMAR_RESET` para habilitar o botão (texto fica vermelho conforme digita certo)
- Validado: sem token → 401; vendedor → 403; admin sem palavra → 400; admin com palavra errada → 400. Reset real não executado para preservar o banco de dev.

**3. Mini sidebar retrátil** (commit `2b63a55`)

Sidebar agora alterna entre **240px (expandida)** e **72px (recolhida)** com `transition: 0.25s ease` em `width` e `margin-left`.
- Estado `sidebarCollapsed` hidratado de `localStorage` (chave `gestao_sidebar_collapsed`); `alternarColapso()` persiste
- TODO claro para sync futura via `PUT /auth/preferencias` (endpoint ainda inexistente)
- Botão chevron (`>`/`<`) só aparece desktop; mobile mantém comportamento off-canvas com hamburger
- NavItem em modo collapsed: gap=0, esconde label, `title=label` vira tooltip
- SecaoLabel em modo collapsed: vira separador horizontal sutil
- Card de usuário no rodapé: só avatar quando recolhido

**4. Sistema de temas via CSS variables** (commit `bef5aec`)

Implementa seleção de tema sem reescrever a UI. A chave foi `C` já existir como interface estável — trocando o valor das vars CSS, todos os 17 componentes que usam `style={{ background: C.bg }}` se atualizam automaticamente.
- `src/lib/theme.js`: `TEMAS` com 4 paletas (Azul Padrão, Esmeralda, Roxo, Alto Contraste); `C` exportado aponta para `var(--bg)`, `var(--accent)` etc.; `aplicarTema(id)` escreve no `document.documentElement.style`; `lerTemaSalvo`/`salvarTema` em `localStorage` (chave `gestao_tema`); `inicializarTema()` chamado no `main.jsx` antes do render para evitar flash
- `src/index.css`: `:root` com `--bg`, `--surface`, `--card`, `--border`, `--accent`, `--purple`, `--green`, `--red`, `--yellow`, `--text`, `--muted`, `--white` + `transition 0.3s ease` global em background/border/color
- `src/AparenciaModal.jsx`: grid de cards com preview da paleta de cada tema (5 bolinhas + bloco card + barra accent→purple pintados com as cores do PRÓPRIO tema). Card ativo ganha borda accent + badge "ATIVO"
- Migração automática (script Node) de 17 arquivos JSX: removida definição local `const C = { ... }` e substituída por `import { C } from "./lib/theme.js"`
- `App.jsx`: entrada "Aparência" no dropdown do usuário
- Mesma TODO de sync com `/auth/preferencias`

**5. Aba Extras no Projeto.jsx** (commit `5e02fb2`)

A tela Projeto só mostrava as 13 etapas originais. Agora documenta também as melhorias incrementais entregues após o MVP.
- Novo array `EXTRAS` com 9 itens (categorizados como "Recurso novo" ou "Aprofundamento"): Permissões por Módulo, Sidebar Retrátil, Sistema de Temas, Reset Total, Financeiro Avançado (juros/multa/desconto/recorrência/anexos), Hard-delete em cadastros, PDV (atalhos/troco/cupom), Clientes (máscaras/ViaCEP), Auth Robusta
- Header do Progresso Geral ganha pill roxa "+9 melhorias entregues"
- Nova aba "✨ Extras (9)" com banner roxo, cards verde-suaves com badge "Concluído" + 4 detalhes técnicos por item
- `gerarPrompt()` corrigido: stack era "React + TailwindCSS" mas o projeto usa estilos inline com paleta C via CSS Variables. Agora reflete a realidade. Adicionada seção de melhorias entregues após o MVP e convenções (P2002/P2003/P2025, transações, `import C from lib/theme`, mensagens sem acentos)

### Sessão — 2026-04-30 (Polimento UX: Clientes + PDV)

Dois commits cobrindo melhorias de qualidade de vida em formulários e operação de venda.

**1. Clientes — máscaras + ViaCEP + validação** (commit `6d12669`)

- Máscaras de **telefone**, **CPF/CNPJ** e **CEP** no formulário de cliente
- Integração com **ViaCEP**: ao digitar CEP completo, auto-preenche endereço/cidade/UF
- Validação client-side antes de submit
- Campo **número** separado do logradouro (compatível com endereços brasileiros)

**2. PDV — atalhos + troco + modal pagamento + cupom** (commit `ba753d4`)

- **Atalhos de teclado** para operação rápida no caixa
- **Cálculo de troco em tempo real** conforme o operador digita o valor recebido
- **Modal de pagamento** dedicado (substitui submit direto)
- **Impressão de cupom** após fechamento da venda

### Sessão — 2026-04-30 (Financeiro UI: juros/multa/desconto + recorrência + anexos)

Frontend do Financeiro consumindo recursos avançados que já existiam no backend (commits `5365f3c` e `288f701`).

**`src/lib/api.js`:**
- `pagarConta`/`receberConta` agora aceitam objeto completo `{ pagamento|recebimento, juros?, multa?, desconto? }` mantendo compatibilidade com chamadas antigas (string/Date)
- Novos: `anexarContaPagar(id, file)`, `excluirAnexoContaPagar(id, anexoId)` e equivalentes para receber

**`src/Financeiro.jsx`:**
- **ContaModal** refatorado: campos separados de `valorBruto`, `juros`, `multa`, `desconto`, com cálculo de **valor líquido em tempo real** (memo). Bloco visual destacado em surface card
- **Recorrência** (apenas em criação): switch entre `NENHUMA` / `PARCELADA` / `RECORRENTE`, com input de `parcelaTotal` (2-60). Mostra preview de "valor por parcela" e dicas contextuais (juros se aplicam à 1ª parcela em parceladas; recorrentes preservam o dia)
- **PagarReceberModal** refatorado: botão "Ajustar juros / multa / desconto" expande os 3 campos. Recalcula líquido em tempo real e envia ao backend que valida e persiste
- **AnexosModal** novo: dropzone clicável (PDF/JPG/PNG até 5 MB), lista com ícone por tipo, botão "Abrir" (target=_blank com `BASE_URL + url`), botão "Excluir" com confirmação. Erro do backend para tipo inválido cai amigável
- **Lista de contas:** badges-mini coloridos por linha — `📋 1/3` (parcelada, roxo), `🔁 1/12` (recorrente, azul), `📎 N` (qtd de anexos, amarelo). Linha de detalhe extra quando há juros/multa/desconto: `Bruto R$ X + juros R$ Y - desc R$ Z`. Coluna de Ações com novo botão `📎` ao lado de Pagar/Editar/Cancelar

**Validado via API (admin):**
```
POST /contas-pagar { valorBruto:900, tipoRecorrencia:"PARCELADA", parcelaTotal:3 }
  → 201, parcelasGeradas:3, parcelas com vencimento 05/06/07-15
POST /contas-pagar { valorBruto:100, juros:10, multa:5, desconto:2 }
  → bruto:100, juros:10, multa:5, desc:2, liquido:113
POST /contas-pagar/:id/anexos arquivo=teste.pdf
  → 201, mime application/pdf, url /uploads/<uuid>.pdf
POST /contas-pagar/:id/anexos arquivo=teste.txt
  → 400 "Tipo de arquivo nao permitido (apenas PDF, JPG, PNG)"
POST /contas-pagar/:id/pagar { pagamento, juros:20, multa:5, desconto:2 }
  → status PAGA, juros recalculado para 20, liquido 123
```

**Lacuna conhecida:** quando uma conta é deletada (cascade remove `Anexo` no DB), o arquivo físico em `backend/uploads/` fica órfão. Solução futura: hook em `prisma.contaPagar.delete` que liste anexos e remova arquivos antes do delete.

### Sessão — 2026-04-30 (Sidebar + Sistema de permissões por módulo)

**1. Sidebar fixa à esquerda** (`src/App.jsx`)

Substitui a navegação superior por sidebar de 240px com agrupamento por seção (Cadastros / Operação / Sistema), card de usuário no rodapé com dropdown que abre para cima, e responsividade via `<style>` injetada com media query `@media (max-width: 900px)`:
- Sidebar usa `transform: translateX(-100%)` por padrão em mobile e `.open` aplica `translateX(0)`
- Botão `☰` na top bar abre; clique no overlay ou tecla `Esc` fecham
- Conteúdo principal ganha `margin-left: 240px` em desktop e `0` em mobile
- Estilos inline mantidos (paleta `C`), sem Tailwind

**2. Sistema de permissões por módulo** (commits `61c6a75` e `1aed49a`)

Banco:
- Migração `20260430114015_add_user_permissoes` adiciona `User.permissoes String[] @default([])`
- Seed atualizado para popular permissões padrão por role

Source-of-truth:
- `src/lib/permissoes.js` e `backend/src/lib/permissoes.js` — listas de 10 módulos (PDV, DASHBOARD, CLIENTES, FORNECEDORES, PRODUTOS, ESTOQUE, COMPRAS, FINANCEIRO, RELATORIOS, FUNCIONARIOS), com `podeAcessar`/`temPermissao`, `permissoesPadrao(role)` e `sanitizarPermissoes` (back). FUNCIONARIOS sempre restrito a ADMIN

Backend:
- Novo middleware `requirePermissao(modulo)` em `middlewares/auth.js` busca permissões frescas do banco a cada request (mudanças refletem sem relogin)
- `funcionarioController.criar/atualizar` aceita `permissoes: string[]`, sanitiza e força array completo quando role = ADMIN
- `/auth/login` e `/auth/me` retornam `permissoes` no body
- Rotas: módulos finais (estoque, compras, contas-pagar, contas-receber, dashboard, relatorios, vendas, funcionarios) usam `router.use(requirePermissao(MODULO))`. Cadastros (clientes, fornecedores, produtos, categorias) deixam GET livre e protegem só mutações (PDV/Compras precisam consultar produtos/clientes/fornecedores)
- Vazamento corrigido: `GET /funcionarios` antes respondia 200 para qualquer usuário autenticado, agora bloqueado pelo middleware

Frontend (`src/Funcionarios.jsx`):
- Modal de funcionário ganha seção "🔐 Permissões de Acesso" com 10 cards-switch (toggle visual com bolinha animada + paleta `C`)
- Presets: "Padrão vendedor/gerente", "Marcar tudo", "Limpar"
- Bloqueado visualmente quando role = ADMIN ("tem acesso a tudo automaticamente")
- Card FUNCIONARIOS sempre `disabled` para non-ADMIN

Frontend (`src/App.jsx`):
- Cada `NavItem` da sidebar é renderizado condicionalmente via `podeAcessar(user, "MODULO")`
- `useEffect` redireciona o usuário para a primeira tela disponível se ele estiver numa que perdeu acesso
- Helper `TELA_MODULO` mapeia cada tela do app ao módulo de permissão

**Validado via API (julia.costa@gestaopro.local — perms `[PDV, CLIENTES, PRODUTOS]`):**
```
GET  /vendas, /clientes, /produtos, /categorias, /fornecedores  → 200
GET  /estoque, /compras, /contas-pagar, /contas-receber,
     /dashboard, /relatorios, /funcionarios                     → 403
POST /clientes (tem CLIENTES)                                   → 201
POST /fornecedores (nao tem)                                    → 403
ADMIN em todos                                                  → 200
PUT /funcionarios/:id permissoes=["XPTO"] → sanitiza para [] (modulos invalidos descartados)
PUT /funcionarios/:id role=ADMIN → permissoes viram lista completa (10 modulos)
```

### Sessão — 2026-04-30 (Etapa 13 — Relatórios + Exportação PDF) — **PROJETO COMPLETO**

**Etapa 13 implementada:** 4 relatórios analíticos com export PDF.

Arquivos criados:
- `backend/src/controllers/relatoriosController.js` — 4 endpoints, cada um agrega em paralelo (`Promise.all`):
  - `GET /relatorios/vendas` (filtros: dataInicio, dataFim, formaPagamento, clienteId, userId)
    → resumo (totalVendas, faturamento, ticketMedio, descontoTotal), formasPagamento (groupBy), topProdutos (groupBy itemVenda + lookup), vendas detalhadas com itens
  - `GET /relatorios/compras` (filtros: dataInicio, dataFim, fornecedorId)
    → resumo (totalCompras, valorTotal, ticketMedio), topFornecedores, compras detalhadas
  - `GET /relatorios/financeiro` (filtros: dataInicio, dataFim por vencimento, tipo=pagar|receber|ambos)
    → resumo por status (PENDENTE/PAGA/ATRASADA/CANCELADA × pagar/receber), saldoPrevisto, fluxoCaixaRealizado, listas detalhadas
  - `GET /relatorios/estoque` (filtros: categoriaId, fornecedorId, situacao=ok|baixo|zerado)
    → resumo (totalProdutos, unidadesEmEstoque, valorEstoqueCusto, valorEstoqueVenda, margemEstimada), produtos com cálculo de valorEmEstoque
- `backend/src/routes/relatorios.js` — `authRequired` global; sem restrição de role.
- `src/Relatorios.jsx` — página com 4 abas (Vendas/Compras/Financeiro/Estoque), cada aba com:
  - Filtros próprios (datas, selects de cliente/vendedor/forma pgto/fornecedor/categoria/situação/tipo)
  - Botão "🔍 Gerar" e "📄 Exportar PDF"
  - Cards de resumo (Resumo) com cor por indicador
  - Tabelas de detalhamento (Tabela) com cabeçalhos, alinhamento por coluna e estado vazio
  - Helper `criarPDF` aplica cabeçalho "GestãoPRO + título + gerado em" + autoTable para cada bloco

Arquivos modificados:
- `backend/src/server.js` — registra `/relatorios`
- `src/lib/api.js` — adiciona 4 métodos `relatorioVendas/Compras/Financeiro/Estoque`
- `src/App.jsx` — NavBtn "📑 Relatórios" (entre Financeiro e Funcionários, todos os perfis)
- `src/Projeto.jsx` — STATUS_PROJETO[13] = "concluido"
- `package.json` — adiciona `jspdf@^4.2.1` e `jspdf-autotable@^5.0.7`

**Validado via API:**
```
GET /relatorios/vendas       → 200  resumo: 1 venda, R$60, ticket R$60
GET /relatorios/compras      → 200  resumo: 21 compras, R$53.696, ticket R$2.557; topFornecedores: 10
GET /relatorios/financeiro   → 200  pagar.PENDENTE 2/220.16; receber.PENDENTE 10/7914.80; saldoPrevisto 8934.64
GET /relatorios/estoque      → 200  23 produtos, 2570 un., R$54.559 custo, R$98.588 venda, margem R$44.028
GET /relatorios/estoque?situacao=baixo → 200  4 produtos com estoque baixo
```

### Sessão — 2026-04-29 (Etapa 12 — Notificações e Alertas)

**Etapa 12 implementada:** central de alertas com sino no header.

Arquivos criados:
- `backend/src/controllers/alertasController.js` — `GET /alertas` agrega em paralelo:
  - Produtos ativos com `estoque <= estoqueMinimo` (severidade ALTA se estoque=0 ou < mínimo)
  - Contas a pagar PENDENTE/ATRASADA com vencimento ≤ hoje+7d (ALTA se atrasada, MEDIA se próxima)
  - Contas a receber PENDENTE/ATRASADA com vencimento ≤ hoje+7d (ALTA se atrasada, BAIXA se próxima)
  - Resposta unificada com `id` estável por alerta, `tipo`, `severidade`, `titulo`, `descricao`, `complemento`, `valor`, `data`, `link` ("estoque" | "financeiro-pagar" | "financeiro-receber")
  - Bloco `contagem` por severidade e por tipo
- `backend/src/routes/alertas.js` — rota com `authRequired` (qualquer perfil acessa)
- `src/Alertas.jsx` — componente do sino + drawer:
  - Badge colorido (vermelho se há ALTA, amarelo se MEDIA, azul se só BAIXA)
  - Drawer 380×70vh com cabeçalho, agrupamento por tipo, footer com timestamp
  - Polling de 60s
  - Click-fora e ESC fecham
  - Cada item é clicável → `onNavegar(tela)` muda a tela do app (estoque/financeiro)
  - "Descartar" individual (×) e "✓ Tudo" (marca todos como lidos)
  - "↺ N" restaura descartados; auto-limpeza dos descartados quando o alerta sai do servidor (estoque reposto, conta paga)
  - Persistência dos descartados em `localStorage` (`gestao_alertas_descartados`)

Arquivos modificados:
- `backend/src/server.js` — registra `/alertas`
- `src/lib/api.js` — adiciona `obterAlertas()`
- `src/App.jsx` — coloca `<Alertas onNavegar={setTela}>` à direita do header (ao lado do dropdown do usuário)

**Validado via curl:**
```
GET /alertas → 200
  total: 17
  alta:13, media:3, baixa:1
  estoqueBaixo:4, contasPagarAtrasadas:6, contasPagarProximas:2,
  contasReceberAtrasadas:4, contasReceberProximas:1
```
Numeros batem com o seed (4 estoque baixo, 6 contas a pagar atrasadas, 4 a receber atrasadas).

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

**🎉 Projeto completo — 13 de 13 etapas + 10 melhorias pós-MVP entregues.**

Todas as etapas planejadas foram entregues e o produto continuou a receber polimento. Em 2026-04-30, uma onda adicionou: hard-delete em cadastros, tela administrativa **Sistema** com Reset Total, **mini sidebar retrátil** (72↔240px com persistência), **sistema de temas** (4 paletas via CSS vars + modal Aparência), **PDV com atalhos/troco/cupom**, **Clientes com máscaras + ViaCEP**, **financeiro avançado** (juros/multa/desconto/recorrência/anexos), **permissões por módulo com bloqueio no backend** e a aba **Extras** documentando tudo dentro do próprio app.

Em 2026-05-04, novo refactor profundo: **PDV bipagem por scanner** (cestinha 70% com fotos, novos itens no topo, sugestões dropdown, F8 cancelar, F10 finalizar, refoco universal) e **foto em produto** (campo `imagem` no schema, upload via dropzone, preview imediato, miniatura na lista).

Estado em 2026-05-04: **última sessão produtiva foi hoje** — refactor PDV+Produtos com foto. Working tree pronto para commit.

### Lacunas conhecidas (polimento opcional)

- **Etapa 9 (Compras):** sem rota/UI para cancelar uma compra. Hoje o estorno é manual via SAIDA no Estoque.
  - Sugestão: `DELETE /compras/:id` com estorno transacional (cria SAIDA com motivo `"CANCELAMENTO COMPRA #N"`).
- **Etapa 13 (Relatórios):** sem filtro por cliente no relatório de vendas (campo aceito no backend, mas não exposto no UI).
- **Permissões:** quando um vendedor sem `DASHBOARD` é redirecionado pelo `useEffect`, há um flicker breve (mostra a tela errada por ~1 frame). Fix opcional: usar `podeVer(tela)` direto na renderização para evitar render inicial.
- **Anexos do Financeiro:** ao deletar uma conta (com `prisma.contaPagar.delete`), o cascade do DB remove o registro `Anexo` mas o arquivo físico em `backend/uploads/` fica órfão. Adicionar limpeza do disco antes do delete da conta.
- **Recorrência:** alterar uma conta-mãe (1/N) não propaga para as filhas. Não há UI para "editar série" nem "cancelar todas as parcelas restantes" — cada parcela é tratada individualmente após a criação.
- **Preferências de UI no servidor:** tema (`gestao_tema`) e estado da sidebar (`gestao_sidebar_collapsed`) vivem em `localStorage`. Os commits têm TODO explícito para sync via `PUT /auth/preferencias` — endpoint ainda **não existe**. Consequência: ao trocar de máquina/navegador, o usuário perde o tema e a sidebar volta expandida.
- **Auditoria do Reset Total:** `POST /admin/reset` apaga arquivos físicos de `backend/uploads/` em best-effort, sem log estruturado de "quem executou, quando, quantos registros". Fácil de adicionar (um `console.log` ou tabela `AuditLog`).

### Próxima decisão (a ser tomada)

- **(a)** Fechar lacuna de cancelamento de compra (~30 linhas backend + botão no frontend).
- **(b)** Implementar `PUT /auth/preferencias` (campo `User.preferencias Json?`) e migrar tema/sidebar do `localStorage` para a conta — destrava sync entre dispositivos.
- **(c)** Filtro por cliente no relatório de vendas (UI já tem o select de clientes em outras telas; reaproveitar).
- **(d)** Auditoria do Reset Total (log estruturado de execuções).
- **(e)** Atalhos visuais para o admin enxergar de relance "que módulos cada funcionário tem" — ex: chip-cluster pequeno na linha da tabela.
- **(f)** Encerrar o projeto.

### Como retomar

1. Garantir backend e frontend rodando:
   ```
   cd backend && npm run dev    # porta 3333
   cd .. && npm run dev          # porta 5173/5174
   ```
2. Abrir [http://localhost:5173/](http://localhost:5173/)
3. Login: `admin@gestaopro.local` / `admin123`
4. Para ver o tracker com 13/13 concluídas: ir em **Projeto** e clicar em **Ressincronizar** (caso o localStorage do navegador ainda tenha o estado antigo).
