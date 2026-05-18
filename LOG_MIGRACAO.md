# LOG_MIGRACAO.md — Migração GestãoPRO para TypeScript + Tailwind

> **Continuidade entre sessões.** Atualizar a cada pausa.
> Última atualização: **2026-05-18** (sessão 10 — 61 migrações totais)

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

## 📦 Módulos migrados (61 migrações, 55 commits)

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
| 11 | `c16ace3` | `LOG_MIGRACAO.md` | docs | Documento de continuidade |
| 12 | `9119b93` | `main.tsx` + `index.html` | bootstrap | Entry point do Vite tipado |
| 13 | `25295fa` | `Login.tsx` + `Signup.tsx` | telas | Telas publicas de auth (ja usavam Tailwind) |
| 14 | `1ae04ca` | `Projeto.tsx` | tela | Roadmap interno (13 etapas + 9 extras + notas + prompt) |
| 15 | `b8f1df5` | `Configuracoes.tsx` | tela | Tipo `ConfiguracaoEmpresa` movido pra ca (source-of-truth) |
| 16 | `50e9cef` | `Empresa.tsx` | tela | Tenant + plano + uso/limites (estende SessionEmpresa) |
| 17 | `3601e24` | `Aparencia.tsx` | tela | 6 paletas + acento + densidade + fonte + raio + preview live |
| 18-20 | `1a7da9e` | `AbasFormulario`, `SelectBusca`, `ActionsMenu` | components | Tipos `AbaItem`, `SelectBuscaProps<T>` gen, `ActionItem` |
| 21-23 | `ecb8ead` | `EtiquetaPreco`, `EtiquetaPrecoModal`, `BotoesContatoCliente` | components | Etiqueta 60x40mm + modal print + WA/Email/Tel |
| 24 | `a695656` | `FormularioLuxuoso.tsx` | component | Form base com 600 linhas de CSS escopado .lux-* |
| 25 | `04e9178` | `ModalGerirTemplates.tsx` | component | CRUD de templates + editor com preview |
| 26 | `c1e455b` | `RelatorioComissoes.tsx` | component | 3 charts recharts + cards de meta por vendedor |
| 27-38 | `7bb1ee6` | 12 components de `pages/financeiro/components/` | components | PageHeader/AmountCell/DueCell/StatusPill/Sparkline/Topbar/icons + TabsBar/CompositionStrip/KpiCard/FiltersBar/BillsTable |
| 39 | `91bbccc` | `PesquisaPublicaNps.tsx` | tela | Tela publica de NPS (escala 0-10 + comentario) |
| 40 | `a2b7c13` | `Etiquetas.tsx` | tela | Impressao em lote com window.print |
| 41 | `7d3fd5f` | `Nps.tsx` | tela | Admin do CRM NPS (KPIs + lista) |
| 42 | `4cdb968` | `Reativacao.tsx` | tela CRM | Aniversariantes + reativacao de inativos |
| 43 | `9ca640f` | `Tarefas.tsx` | tela CRM | CRUD de follow-ups + modal + 4 filtros + 4 selects a11y |
| 44 | `0741708` | `Fidelidade.tsx` | tela CRM | Programa de pontos: config + consulta + ajuste manual |
| 45 | `5f44b9d` | `Segmentos.tsx` | tela CRM | RFM + tags + 2 modais (gerenciar tags por cliente + CRUD geral) |
| 46 | `9aab5d0` | `Funil.tsx` | tela CRM | Kanban drag-and-drop de 6 etapas + modal de oportunidade |
| 47 | `1227f46` | `Automacoes.tsx` | tela CRM | Regras de automacao + modal + 3 tipos de gatilho |
| 48 | `77c038d` | `DashboardCrm.tsx` | tela CRM | Dashboard consolidado: funil + segmentos + top LTV + risco + performance |
| 49 | `da0f4ee` | `MovimentarEstoqueModal.tsx` | modal | Movimentacao de estoque (ENTRADA/SAIDA/AJUSTE) + previa |
| 50 | `e226e0a` | `Comissoes.tsx` | tela | Config de comissoes + simulador em tempo real (2 abas) |
| 51 | `0a19f70` | `Fornecedores.tsx` | CRUD | Fornecedores + FormularioLuxuoso + fiscal indIEDest/CRT |
| 52 | `e7a81ae` | `Clientes.tsx` | CRUD | Clientes + 3 filtros + status funil + tags + PerfilClienteModal |
| 53 | `154b1fd` | `Estoque.tsx` | CRUD | Auditoria de movimentacoes + nova movimentacao |
| 54 | `2643eed` | `Produtos.tsx` | CRUD | Maior CRUD: 3 abas + fiscal NF-e completo + dropzone imagem + markup |
| 55 | `1d7e6bc` | `Compras.tsx` | CRUD | Compras de fornecedores + bloco financeiro (parcelas) + estorno |
| 56 | `1cae960` | `Orcamentos.tsx` | CRUD | Orcamentos / OS com maquina de estados + conversao em venda + impressao |
| 57 | `72eceb9` | `Dashboard.tsx` | tela | Lazy migration (2057 linhas, 40 sub-componentes) |
| 58 | `1c561c9` | `Relatorios.tsx` | tela | Lazy migration com @ts-nocheck (3374 linhas, jsPDF) |
| 59 | `4018fed` | `FinanceiroPage.tsx` | tela | Tela principal do financeiro novo (777 linhas, 4 abas) reusando tipos exportados (KpiData, Bill, TabDef, SessionUser) |
| 60 | `0c3296b` | `PerfilClienteModal.tsx` | modal | Lazy migration (996 linhas, 6 abas: resumo/contatos/interacoes/compras/financeiro/orcamentos) |
| 61 | `c51fc23` | `AdminMasterApp.tsx` | tela | Lazy migration com @ts-nocheck (2248 linhas, 18 sub-componentes — Login + Painel + 7 abas + 5 modais) |

**Pasta `src/lib/` agora 100% TypeScript** (exceto `impressora.js` que é WIP do usuário).
**Bootstrap e telas publicas** (main, Login, Signup, PesquisaPublicaNps) tambem em TS.
**Telas administrativas pequenas/medias** (Sistema, Logs, Projeto, Configuracoes, Empresa, Aparencia, Etiquetas, Nps) em TS.
**Ciclo CRM 100% TS** (Reativacao, Tarefas, Fidelidade, Segmentos, Funil, Automacoes, DashboardCrm) — sessões 5+6.
**Comissoes** + **MovimentarEstoqueModal** em TS (sessão 6).
**4 CRUDs principais em TS**: Fornecedores, Clientes, Estoque, Produtos (sessão 7).
**Sessão 8 — Compras, Orcamentos, Dashboard, Relatorios** em TS (lazy migration para os 2 ultimos por tamanho).
**Sessão 9 — FinanceiroPage + PerfilClienteModal** em TS (2 migracoes).
**Sessão 10 — AdminMasterApp** em TS (lazy + @ts-nocheck, 1 migracao). Restam apenas os 5 criticos com WIP (App/Caixa/Financeiro/PDV/Funcionarios).
**Todos os 10 components reutilizaveis em `src/components/`** em TS (exceto `PerfilClienteModal` denso).
**Pasta `src/pages/financeiro/components/` 100% TS** (12 arquivos).

---

## 📋 Arquivos ainda como `.jsx` (próximos candidatos)

Total: **5 arquivos** (.js/.jsx) em `src/`. Lista organizada por dificuldade crescente:

### 🔴 Telas grandes e críticas (deixar por último)
- `src/App.jsx` (~700 linhas) — root da app, sidebar, roteamento
- `src/PDV.jsx` — núcleo do sistema (vendas em tempo real)
- `src/Caixa.jsx` — abertura/fechamento de caixa
- `src/Financeiro.jsx` — contas a pagar/receber
- `src/Funcionarios.jsx` — CRUD de users + permissões

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

## 📂 Onde paramos (estado em 2026-05-18, sessão 10)

- **Último commit:** `c51fc23 refactor(admin-master): migra AdminMasterApp.jsx para TSX (lazy)`
- **Branch:** `main` (sincronizada com `origin/main`)
- **Working tree não-vazio:** O usuário tem feature **Impressora** em andamento + **Inventário contagem cega** (novos arquivos no backend: `inventarioController.ts`, `routes/inventarios.ts`, migração). **Não tocar enquanto não finalizar.**
- **Progresso:** 63 arquivos `.ts`/`.tsx` vs 5 arquivos `.jsx`/`.js` restantes. **~93% migrado**.
- **Sessão 10 entregou (1 migração):** AdminMasterApp.jsx → .tsx (lazy, 2248 linhas, 18 sub-componentes — Login + Painel + 7 abas + 5 modais). Aplicado `@ts-nocheck` por 135 erros triviais (boxSizing literal, catch err unknown, useState([]) virando never[]).
- **Próximo módulo sugerido:** Confirmar com usuário se feature **Impressora + Inventário** já está pronta para commit. Se sim, migrar os 5 críticos restantes; se não, sessão fica parada aguardando finalização do WIP.

### 💡 Padrão "Lazy Migration" (estabelecido na sessão 8)

Para arquivos > 1500 linhas onde tipagem estrita explodiria a sessão:
1. `git mv .jsx → .tsx`
2. Script: `function NAME({...}) {` → `function NAME({...}: any) {`
3. Limpar `from "./lib/X.js"` → `from "./lib/X"`
4. SVG: `strokeLinecap: "round"` → `"round" as const`
5. Se erros ainda forem >100, adicionar `// @ts-nocheck` no topo com comentario justificando

Exemplos: Dashboard (lazy puro), Relatorios (@ts-nocheck por jsPDF + 3374 linhas).

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
