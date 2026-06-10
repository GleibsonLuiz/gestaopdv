# 🤖 Instruções Autônomas para Claude Code

**Última atualização:** 2026-06-10  
**Status:** ATIVO — Claude Code tem autonomia plena para implementar features conforme descrito abaixo.

---

## 📋 Resumo Executivo

Claude Code (você) tem **autonomia total** para implementar features, bug fixes e melhorias em fases/módulos **já executados** do projeto, **sem precisar de autorização entre passos**.

Use este arquivo como sua "carta branca" para:
- ✅ Evoluções de funcionalidades existentes
- ✅ Bug fixes em código já em produção
- ✅ Refatorações e melhorias localizadas
- ✅ Novos endpoints/controllers que expandem funcionalidade existente
- ✅ Testes, documentação, e updates de manual

**Não use** para:
- ❌ Arquitetura completamente nova (ex: novo módulo nunca visto)
- ❌ Mudanças que quebrem backward compatibility sem avisar
- ❌ Decisões de design disputáveis (sempre converse antes)
- ❌ Infraestrutura e deploy (CI/CD, env vars críticas, etc.)

---

## 🎯 Fases/Módulos com Autonomia Plena

| Módulo | Status | Autonomia | Nota |
|--------|--------|-----------|------|
| **Licença por Dispositivo** | Em produção (2026-06-10) | ✅ Plena | Evoluções: autogestão, limite-por-plano, alertas, cron ociosos |
| **PDV (Ponto de Venda)** | Core, em produção | ✅ Plena | Novas funções, modos (Clean/F7), otimizações |
| **Segurança (login, 2FA, CORS)** | Em produção | ✅ Plena | Melhorias em autenticação, dispositivos, sessão |
| **Fiscal (NFC-e, NFS-e)** | Em produção | ✅ Plena | Consultoria NCM, validações, integrações |
| **Billing & Assinatura** | Em produção | ✅ Plena | Webhook Asaas, reconciliação, planos |
| **Relatórios & Dashboards** | Em produção | ✅ Plena | Novos gráficos, filtros, exportações |
| **Cardápio Digital** | Em produção | ✅ Plena | QR code, layout, preços |
| **Contabilidade & Despesas** | Em produção | ✅ Plena | Plano de contas, fechamentos, OCR |
| **Sugestões de Compra** | Em produção | ✅ Plena | Reposição automática, ajustes |

---

## 🚀 Protocolo de Autonomia

### Quando implementar algo

1. **Ler o contexto** — memória do projeto, MANUAL.md, designs anteriores
2. **Validação local** — tsc, build, testes antes de commit
3. **Commit atômico** — uma feature = um commit claro e auto-contido
4. **Push direto** — não espera mais nada; Vercel deploya automaticamente
5. **Atualizar memória** — se o comportamento mudou, atualize `memory/`

### Exemplo fluxo

```
User: "Melhorar o bloco de dispositivos para mostrar IP da ultima conexão"

Claude executa (SEM AVISAR CADA PASSO):
1. Lê Empresa.tsx BlocoDispositivos + endpoints da API
2. Verifica se backend ja traz ultimoIp
3. Mexe no frontend (renderiza IP)
4. Roda tsc + build localmente
5. Faz commit: "feat(dispositivos): exibir IP ultima conexao"
6. Git push origin main
7. Verifica deploy Vercel até Ready
8. Retorna: "✅ Pronto! IP agora aparece em cada maquina. Deployado em X."
```

### Quando avisar/pausar

| Situação | Ação |
|----------|------|
| Feature que **não consegue implementar** | Avisa com contexto + duvida |
| Feature que **quebra backward compat** | Avisa antes de fazer commit (pede confirmação) |
| **Decisão de design** (ex: novo campo vs refatorar) | Propõe 2-3 opções, pede escolha |
| Feature que **envolve 2+ módulos novos** | Resume o plano, pede go/no-go |
| **Migração crítica** ou mudança de schema Prisma | Sempre avisa + testa isolado no Neon |

---

## 📦 Padrões de Implementação (Use como-é)

### Backend

- **Controllers:** `backend/src/controllers/*` — lógica por entidade/feature
- **Routes:** `backend/src/routes/*` — verbos HTTP (GET/POST/PUT/PATCH/DELETE)
- **Libs:** `backend/src/lib/*` — helpers reutilizáveis (validates, formatters, auth logic)
- **Middlewares:** `backend/src/middlewares/*` — validação, rate limit, audit
- **Prisma:** mutations via `prismaRaw` quando multi-tenant, mutations via `prisma` client quando single-tenant

### Frontend

- **Pages:** `src/` — telas (ex: `Empresa.tsx`, `PDV.tsx`)
- **Components:** `src/componentes/` — reusable (ex: `BlocoCardapio.tsx`, `ModalPlano.tsx`)
- **Utils:** `src/lib/` — helpers (API, theme, formatters, auth state)
- **Styling:** inline `style={}` com `C` palette (color theme)
- **API client:** `src/lib/api.ts` — fetch wrappers, sempre com headers device

### Testes & Validação

- **E2E:** `scripts/e2e.mjs` — live Vercel smoke (não quebra features existentes)
- **Typecheck:** `npx tsc --noEmit` antes de commit
- **Build:** `npx vite build` antes de commit
- **Backend syntax:** `node --check` antes de commit

---

## 🔒 Regras Intocáveis

❌ **NUNCA fazer:**
- Force push ou rebase público
- Commit/push para `main` enquanto outro PR está em review
- Deletar code sem motivo (refactor deve estar claro no commit message)
- Mudar `.env`, env vars, ou secrets
- Alterar `vercel.json` crons sem confirmar timing de Hobby plan (max 1x/dia)
- Committar `.env.local` ou files com credenciais
- Fazer push para `main` sem passar em tsc/build/basic e2e

✅ **SEMPRE fazer:**
- Ler a seção relevante do manual antes de mexer em UI
- Atualizar `docs/MANUAL.md` se novo campo/tela for criado
- Incluir ticket/issue number no commit se aplicável
- Testar o "golden path" + edge case antes de declarar pronto
- Guardar decisões interessantes em `memory/` para futuro

---

## 📝 Exemplo de Commit Autônomo

```
feat(dispositivos): auto-revoke idle machines por inatividade customizável

Permite admin definir dias de inatividade (default 60) via env var
DISPOSITIVO_DIAS_INATIVIDADE. Cron /cron/dispositivos-ociosos roda daily
05:30 UTC. Revoga status=SISTEMA no DB. Backfill aplicado no Neon.

- backend/src/lib/dispositivos.js: expirarDispositivosOciosos(dias)
- backend/src/controllers/dispositivoCronController.js: cronExpirarDispositivos
- backend/vercel.json: cron schedule 30 5 * * *
- backend/prisma/migrations/20260610160000_*: backfill
- docs/MANUAL.md: seção "Limpeza automática"

Tests (live Vercel): cron protegido por CRON_SECRET ✅

Co-Authored-By: Claude Opus <noreply@anthropic.com>
```

---

## 🧠 Memória do Projeto

Guarde insights/padrões recorrentes em `memory/`:

- **`user_*.md`** — preferências, comportamento esperado
- **`feedback_*.md`** — erros aprendidos, "nunca mais fazer X"
- **`project_*.md`** — roadmap, contexto de stakeholders, blockers
- **`reference_*.md`** — links para Linear/Slack/Grafana, tech debt tracker

Atualize `MEMORY.md` (índice) ao adicionar novo arquivo.

---

## 🎓 Quando Pedir Confirmação (Exemplos)

### ✅ Não precisa pedir

```
User: "Adicione um campo 'descricao' no bloco de dispositivos"

Claude: Implementa, testa, faz commit, push. 
Output: "✅ Pronto! Campo 'descricao' adicionado em Empresa > Dispositivos..."
```

### ⚠️ Precisa pedir (propõe opção)

```
User: "Quero que o limite de dispositivos considere tipo de acesso (web vs app)"

Claude: "3 opções:
1. Novo campo 'tipo' no Dispositivo (userAgent parsing)
2. Header customizado X-Client-Type
3. Regra: web + app contam separado
Qual?"
```

### ❌ Definitivamente pedir

```
User: "Queremos descontinuar suporte a Mercado Pago (ninguém usa mais)"

Claude: Não faz nada. Propõe: "Deletar modulo inteiro? Requer:
- Migração para arquivar dados historicos
- Atualizar all docs + API
- Comunicado ao cliente?
Você tem certeza?"
```

---

## 📞 Contato & Escalonamento

Se ficar preso:
- **Syntax/tipo:** cria minimal repro, tenta 2x, depois relata
- **Design:** propõe 2 caminhos, pede voto
- **Arquitetura:** resume impacto, sugere plano B
- **Urgência:** avisa tempo restante, diz o que consegue fazer

---

## ✨ Bonus: Pattern Já Testados

Use estes padrões sem reinventar:

- **Multi-tenant isolation:** `lib/prisma.js` + `$extends` + `AsyncLocalStorage`
- **Device fingerprinting:** localStorage + cookie (10y) redundant
- **Soft delete:** `ativo BOOLEAN DEFAULT true` (nunca delete)
- **Audit log:** `registrarEvento()` middleware — toda mudança crítica
- **Rate limit:** `rateLimitLogin`, `rateLimitAPI` — copie pattern
- **Notificações:** `Notificacao` model — crie via `prisma.notificacao.create`
- **Crons:** `backend/vercel.json` + `CRON_SECRET` Bearer auth
- **Admin bypass:** `requireRole("ADMIN")` middleware + Master check

---

## 🎉 Resumo: Sua Liberdade

**Você tem autonomia para:**

1. ✅ Evoluir qualquer modulo já em produção
2. ✅ Corrigir bugs, refatorar código, otimizar
3. ✅ Escrever endpoints, controllers, componentes
4. ✅ Atualizar docs, manual, exemplos
5. ✅ Implementar melhorias derivadas de feedback
6. ✅ Testar ao vivo em Vercel e fazer push
7. ✅ Guardar conhecimento em memória do projeto

**Não faça sem avisar:**
- Arquitetura nova, módulos novos do zero
- Breaking changes sem contexto
- Decisões de design disputáveis
- Mudanças críticas de infra/deploy

**When in doubt:** resume o plano em 3 linhas, manda as opções, pede go/no-go.

Boa sorte! 🚀

---

*Este arquivo é source of truth. Atualize-o se as regras mudarem.*
