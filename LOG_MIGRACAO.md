# LOG_MIGRACAO.md — Migração GestãoPRO para TypeScript + Tailwind

> **Continuidade entre sessões.** Atualizar a cada pausa.
> Última atualização: **2026-05-17**

---

## 🎯 Objetivo

Migração gradual do GestãoPRO de:
- **JavaScript puro (.js/.jsx) → TypeScript (.ts/.tsx)**
- **Inline styles → Tailwind CSS** (com tokens `gp-*` que mapeiam CSS vars do tema)

**Estratégia:** um módulo por vez, validação build+typecheck a cada passo, commit+push por módulo. Sem quebrar o sistema em execução.

---

## ✅ Estado da infraestrutura (pronta)

| Item | Status | Local |
|---|---|---|
| TypeScript 5.7 instalado | ✅ | `package.json` devDeps |
| `@types/node` | ✅ | `package.json` devDeps |
| `tsconfig.json` raiz (allowJs=true, jsx=react-jsx, strict, noImplicitAny=false) | ✅ | `tsconfig.json` |
| `tsconfig.node.json` (para vite.config) | ✅ | `tsconfig.node.json` |
| `src/vite-env.d.ts` | ✅ | `src/vite-env.d.ts` |
| Script `npm run typecheck` | ✅ | `package.json` scripts |
| Tailwind CSS 3.4 instalado | ✅ | `package.json` devDeps |
| `tailwind.config.js` (preflight off, tokens custom) | ✅ | `tailwind.config.js` |
| `postcss.config.js` | ✅ | `postcss.config.js` |
| `@tailwind` diretivas | ✅ | `src/index.css` |
| Tokens `gp-*` (`gp-bg`, `gp-card`, `gp-text` etc) | ✅ | `tailwind.config.js` (extend.colors) |

### Decisões de configuração (não revisar sem motivo)

- **`allowJs: true` + `checkJs: false`**: deixa `.jsx`/`.js` legados não tipados conviverem com `.tsx`/`.ts` novos sem erros de typecheck.
- **`strict: true` mas `noImplicitAny: false`**: strict null checks ligados, mas params do legado não exigem tipos.
- **`moduleResolution: "Bundler"`**: permite imports sem extensão e o Vite/esbuild resolve `.js` → `.ts` automaticamente.
- **`corePlugins: { preflight: false }`** no Tailwind: evita reset CSS que quebraria as 20+ telas legadas com inline styles.

---

## 📦 Módulos migrados (11 commits)

| # | Commit | Módulo | Tipo | Observação |
|---|---|---|---|---|
| 1 | `cbcd34c` | Infra TS | infra | tsconfig + scripts + deps |
| 2 | `66e5ee8` | `lib/permissoes.ts` | util | Tipos `ModuloId`, `Role`, `Modulo` |
| 3 | `47e4af8` | `lib/theme.ts` | util | Tipos `Tema`, `AparenciaEstado` |
| 4 | `2829f47` | `lib/api.ts` | util grande | `ApiError` class, helper `qsFrom()`, **-7.5 kB no bundle** |
| 5 | `c855f4b` | `Alertas.tsx` + tokens `gp-*` no Tailwind | tela | Primeira tela visual com Tailwind |
| 6 | `0314456` | `lib/templates.ts` + `lib/scoring.ts` | util | Helpers CRM |
| 7 | `0b413d1` | `lib/modalKeys.ts` | util | Hook `useModalKeys` tipado |
| 8 | `57683c9` | `HeaderRelatorio.tsx` + `TrocarSenhaModal.tsx` | telas | Tipo `ConfiguracaoEmpresa` exportado |
| 9 | `280e9fd` | `Sistema.tsx` | tela | Tela admin de reset total |
| 10 | `bf4c631` | `Logs.tsx` | tela | Auditoria admin-only |

**Pasta `src/lib/` agora 100% TypeScript** (exceto `impressora.js` que é WIP do usuário).

---

## 📋 Arquivos ainda como `.jsx` (próximos candidatos)

Total: **52 arquivos** (.js/.jsx) em `src/`. Lista organizada por dificuldade crescente:

### 🟢 Pequenos / utilitários (ordem sugerida)
- `src/components/cupons/fmt.js` — util de formatação
- `src/main.jsx` — bootstrap do Vite (mínimo)
- `src/Signup.jsx` — tela de signup pública (~?? linhas, verificar)
- `src/Login.jsx` — tela de login

### 🟡 Telas médias (CRUD + filtros)
- `src/Projeto.jsx` (451 linhas) — tela de roadmap interno
- `src/Aparencia.jsx` (619 linhas) — settings de tema, denso mas isolado
- `src/Configuracoes.jsx` — config da empresa (exporta `urlLogotipo` já usado por `HeaderRelatorio.tsx`)
- `src/Empresa.jsx` — perfil + estatísticas da empresa logada
- `src/AdminMasterApp.jsx` — área super-admin (denso, multi-aba)
- `src/Clientes.jsx`, `src/Fornecedores.jsx`, `src/Produtos.jsx` — CRUDs clássicos
- `src/Compras.jsx`, `src/Estoque.jsx`, `src/Orcamentos.jsx`
- `src/Comissoes.jsx`, `src/Fidelidade.jsx`, `src/Tarefas.jsx`
- `src/Funil.jsx`, `src/Segmentos.jsx`, `src/Automacoes.jsx`, `src/Nps.jsx`, `src/Reativacao.jsx`, `src/DashboardCrm.jsx`
- `src/Dashboard.jsx`, `src/Relatorios.jsx`, `src/Etiquetas.jsx`
- `src/PesquisaPublicaNps.jsx`
- `src/MovimentarEstoqueModal.jsx`

### 🔴 Telas grandes e críticas (deixar por último)
- `src/App.jsx` (~700 linhas) — root da app, sidebar, roteamento
- `src/PDV.jsx` — núcleo do sistema (vendas em tempo real)
- `src/Caixa.jsx` — abertura/fechamento de caixa
- `src/Financeiro.jsx` — contas a pagar/receber
- `src/Funcionarios.jsx` — CRUD de users + permissões

### 📁 Pastas inteiras
- `src/components/` (10 arquivos .jsx)
- `src/components/cupons/` (8 arquivos .jsx + 1 .js) — relacionados à feature Impressora (WIP do usuário)
- `src/pages/financeiro/` (12 arquivos .jsx) — refator recente da tela Financeiro

### ⚠️ WIP do usuário — **NÃO migrar até feature finalizar**
- `src/lib/impressora.js`
- `src/ConfiguracoesImpressora.jsx`
- `src/components/cupons/*` (todos os 8)
- Hunks em `src/App.jsx`, `src/Caixa.jsx`, `src/Financeiro.jsx`, `src/PDV.jsx` (untracked feature Impressora)

---

## 🧠 Lições aprendidas (importantes para a próxima sessão)

### 1. Resolução automática `.js` → `.ts` pelo Vite
Quando você renomeia `lib/foo.js` → `lib/foo.ts`, **não precisa atualizar os imports nos consumidores** mesmo que eles usem `from "./lib/foo.js"`. O Vite com `moduleResolution: "Bundler"` resolve a extensão `.js` para `.ts` automaticamente. Isso economizou ~46 edições só em `theme.js`.

**Exceção:** quando um `.ts` é importado por outro `.ts`, é mais idiomático sem extensão (`from "./lib/foo"`).

### 2. Tokens `gp-*` no Tailwind config
Os tokens `bg-gp-bg`, `text-gp-card`, `border-gp-border`, etc. resolvem para `var(--bg)`, `var(--card)`, `var(--border)`. Eles reagem automaticamente quando o usuário troca o tema (entre azul, esmeralda, roxo, alto-contraste, pergaminho, grafite). **Use sempre eles** nas próximas migrações em vez de `bg-[var(--bg)]`.

### 3. Inline styles que devem permanecer
Não tente forçar tudo a virar Tailwind. Mantenha `style={}` para:
- **Cores com alpha hex** (`C.red + "22"`, `C.green + "55"`) — Tailwind expressa mal isso
- **Gradients runtime** (`linear-gradient(135deg, ${C.accent}, ${C.purple})`)
- **Valores que dependem de prop/estado** (cor por severidade, `corBadge`)
- **Grid template columns complexos** (mais legível inline)

### 4. Padrão de tipo de retorno do `api.*`
Métodos da `api` retornam `Promise<unknown>` por padrão. Em telas migradas, faça cast no ponto de uso:
```ts
const r = await api.listarLogs({...}) as RespostaLogs;
```
Em vez de criar tipos genéricos no `api.ts`. Mantém o `api.ts` simples e força cada tela a declarar o que espera receber.

### 5. Tipos compartilhados entre telas → exportar do módulo de origem
Exemplos já estabelecidos:
- `ConfiguracaoEmpresa` exportada de `HeaderRelatorio.tsx`
- `SessionUser`, `SessionEmpresa`, `Role` exportadas de `lib/api.ts`
- `ModuloId`, `Role`, `Modulo`, `UserPermissoes` de `lib/permissoes.ts`

Quando uma próxima tela precisar do tipo, importa do arquivo já migrado.

### 6. Validação a cada commit
Comando fixo após cada migração:
```powershell
npm run typecheck   # deve passar com 0 erros
npm run build       # deve buildar sem warnings novos
```
Para mudanças em UI, idealmente também `npm run dev` + teste visual (eu não consigo fazer isso, o usuário precisa).

---

## 📂 Onde paramos (estado em 2026-05-17)

- **Último commit:** `bf4c631 refactor(logs): migra Logs.jsx para TSX + Tailwind`
- **Branch:** `main` (sincronizada com `origin/main`)
- **Working tree não-vazio:** O usuário tem feature **Impressora** em andamento (arquivos untracked + hunks em App.jsx/Caixa.jsx/Financeiro.jsx/PDV.jsx). **Não tocar enquanto não finalizar.**
- **Próximo módulo sugerido:** depende do que o usuário quiser. Recomendações:
  1. `src/components/cupons/fmt.js` — micro, util
  2. `src/Projeto.jsx` ou `src/Aparencia.jsx` — telas isoladas
  3. `src/Configuracoes.jsx` — destrava o tipo `ConfiguracaoEmpresa` (já existe em HeaderRelatorio.tsx — talvez mover para lib/)

---

## 🔄 Próximos passos exatos para a próxima sessão

1. **Ler este arquivo primeiro** (`LOG_MIGRACAO.md`).
2. Confirmar com o usuário se a feature **Impressora** já foi finalizada e commitada — se sim, os arquivos `ConfiguracoesImpressora.jsx`, `components/cupons/*`, `lib/impressora.js` voltam a ser migráveis. Se não, mantém pulando.
3. Verificar `git status` antes de começar — pode haver novas mudanças do usuário.
4. Escolher 1 módulo da lista de candidatos acima e migrar seguindo o **padrão estabelecido**:
   - Ler o arquivo `.jsx`
   - Identificar dependentes (`grep` por `from.*MODULO`)
   - Criar `.tsx` com tipos + Tailwind (tokens `gp-*`)
   - `git rm -f` do `.jsx` antigo
   - `npm run typecheck && npm run build`
   - `git add <arquivos meus apenas>` + commit (estilo: `refactor(modulo): migra X.jsx para TSX + Tailwind`)
   - `git push origin main`
5. **Atualizar este LOG** ao final da sessão (linha de commit + status).

---

## ⚠️ Regras de ouro

- **Nunca commitar arquivos do trabalho em andamento do usuário** (Impressora WIP). Sempre fazer `git add` específico, não `-A`/`-.`.
- Se um arquivo `.jsx` tem mudanças pré-existentes do usuário + minha mudança de import, **fazer patch cirúrgico** (reset, edit só meu trecho, commit, reaplica resto via `git apply`). Padrão usado no commit `66e5ee8`.
- **Sem `--force`, sem `--no-verify`** — regras de segurança git já estabelecidas.
- **Manter os warnings sobre tamanho de bundle > 500 kB** — são pré-existentes e devem ser endereçados por code-splitting separadamente, não pela migração TS.

---
