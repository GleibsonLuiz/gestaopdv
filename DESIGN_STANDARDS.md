# Guia de Estilo — GestãoPRO

> **Memória de design do sistema.** Este é o padrão de referência permanente.
> Antes de criar qualquer tela, relatório ou componente novo, **leia este arquivo
> primeiro**. Tudo que for entregue deve nascer aderente a estas regras.
>
> Padrão visual de referência: **relatórios executivos estilo Stripe / Salesforce**
> — hierarquia sóbria, alta densidade informacional, "o número é o herói".
>
> A implementação-ouro que originou este guia vive em
> [`src/pages/financeiro/`](src/pages/financeiro/). Quando em dúvida, copie o
> padrão de lá (KpiCard, StatusPill, AmountCell, tokens.css).

Última revisão: 2026-06-07

---

## 0. Princípios

1. **O número é o herói.** Valores monetários e quantidades são o conteúdo
   principal de quase toda tela de gestão. Eles recebem fonte monoespaçada,
   alinhamento tabular e o maior peso visual da hierarquia.
2. **Hierarquia sóbria, não chamativa.** Sem gradientes berrantes, sem emojis em
   títulos de seção/relatório, sem sombras dramáticas. Contraste e espaçamento
   fazem a hierarquia — não a cor.
3. **Densidade com respiro.** Mostrar muita informação sem poluir: hairlines
   finas em vez de bordas grossas, espaçamento na escala de 4px, tipografia
   compacta mas legível.
4. **Consistência > criatividade pontual.** Reuse os componentes e tokens
   abaixo. Uma tela "bonita" que foge do padrão é um débito, não um avanço.
5. **Tudo reage ao tema.** Nunca cor hardcoded em `style`. Sempre token.
6. **Tela e PDF falam a mesma língua.** Um relatório impresso é o mesmo
   relatório da tela — mesma hierarquia, mesmos rótulos, mesma formatação de
   número.

---

## 1. Tokens canônicos

### Regra de ouro

> **Nunca** escreva um hex literal em `style={{}}` ou className. Sempre use um
> token. Hex literal só é permitido dentro da definição de um tema
> ([`src/lib/theme.ts`](src/lib/theme.ts)) ou de um token OKLCH
> ([`src/pages/financeiro/tokens.css`](src/pages/financeiro/tokens.css)).

Exemplo do que **não** fazer (encontrado hoje em vários arquivos):

```tsx
cor: "#7c3aed"        // ❌ quebra ao trocar de tema
```

O certo:

```tsx
cor: C.purple         // ✅ resolve para var(--purple)
```

### Paleta de superfície e texto (tokens executivos)

A camada executiva usa OKLCH (gradação perceptualmente uniforme). São as
variáveis a preferir em telas/relatórios novos:

| Token | Papel |
|---|---|
| `--bg` | Fundo da página |
| `--surface` / `--surface-2` / `--surface-3` | Cards e camadas de elevação |
| `--hairline` / `--hairline-soft` | Divisórias finas (preferir a bordas) |
| `--fg` | Texto primário (títulos, números-herói) |
| `--fg-soft` | Texto secundário |
| `--fg-muted` | Rótulos, legendas |
| `--fg-faint` / `--fg-dim` | Texto terciário, prefixos (`R$`) |
| `--shadow-card` | Sombra padrão de card (camadas, ver §6) |

No Tailwind, esses tokens estão mapeados como classes utilitárias:
`bg-surface`, `text-fg`, `text-fg-muted`, `border-hairline`, `shadow-card`,
`rounded-card`, etc. (ver [`tailwind.config.js`](tailwind.config.js)).

### Cores de status (semântica fixa)

Sempre o mesmo significado, em todo o sistema:

| Tom | Token | Significado | Uso típico |
|---|---|---|---|
| **Emerald** | `--emerald` | Positivo, pago, entrada, lucro | Receita, status "Paga", delta ↑ |
| **Amber** | `--amber` | Atenção, pendente, a vencer | Status "Pendente", alertas leves |
| **Coral** | `--coral` | Negativo, atrasado, saída, prejuízo | Despesa, status "Atrasada", delta ↓ |
| **Iris** | `--iris` | Neutro/destaque informativo | KPI neutro, categorias |
| **Sky** | `--sky` | Informativo secundário | "Em breve", links de dados |

Cada cor de status tem uma variante de **fundo** (`/ .14` a `/ .16` de opacidade)
e de **borda** (`/ .25`). Padrão: texto na cor cheia sobre fundo translúcido.

> **✅ Resolvido na Fase 2.** Os tokens executivos (`--fg`, `--fg-soft`,
> `--fg-muted`, `--fg-faint`, `--surface-2/3`, `--hairline`, `--hairline-soft`,
> status e `--shadow-card`) agora vivem no `:root` global em
> [`index.css`](src/index.css), **derivados via `color-mix` das variáveis de
> tema** — então existem em todas as telas e reagem aos 6 temas automaticamente.
> As utilitárias Tailwind (`text-fg-muted`, `border-hairline`, `bg-surface-2`,
> `text-emerald2`…) passam a funcionar no app inteiro.
>
> **✅ Reconciliado (2026-06-08).** O módulo financeiro **deixou de sobrescrever**
> as superfícies/texto com OKLCH fixo escuro em `.financeiro-bg`
> ([`tokens.css`](src/pages/financeiro/tokens.css)) — era isso que prendia a tela
> no dark mesmo no tema Claro. Agora ele **herda os tokens executivos globais**
> (theme-aware) e segue os 6 temas automaticamente. O `tokens.css` ficou só com:
> a decoração de fundo (nuvens radiais **apenas nos temas escuros**, via
> `:root[data-brilho="escuro"]`) e os **tokens de marca** (`--gold`/`--gold-strong`/
> `--gold-ink`, o ouro do logo). Os componentes que tinham OKLCH fixo de status
> (`KpiCard`, `StatusPill`) passaram a derivar das vars de status do tema. Fora de
> `.financeiro-bg`, continue preferindo sempre os tokens globais.
>
> **Identidade de marca (ouro do logo) no modo claro.** No tema **Claro**, o
> "lilás" (accent azul + roxo) dá lugar ao **ouro do logo GestãoProMax** —
> definido direto no tema ([`theme.ts`](src/lib/theme.ts)): `accent = #B8860B`
> (DarkGoldenrod, detalhes legíveis: foco, bordas, título-destaque, texto-accent)
> e `purple = #D4AF37` (Metallic Gold, par do gradiente e realces "iris"). Como
> tudo na UI resolve de `var(--accent)`/`var(--purple)`, **todo o sistema** vira
> ouro no modo claro de uma vez: anéis de foco, barras de progresso, botões
> primários, abas ativas, ícones. Nos temas **escuros** o accent continua azul.
> Texto sobre os botões de ouro usa `--white` (que é grafite nos temas claros) →
> folha de ouro + tinta escura, alto contraste e sóbrio (não um bloco brassy).
> **Nunca** em status — a semântica (§1) é fixa: pago=emerald, pendente=amber,
> atrasado=coral; e cores de funil/CRM (Lead, Ativo…) são classificação, não marca.

---

## 2. Tipografia

### Famílias (carregadas em [`index.html`](index.html))

| Família | Papel | Token Tailwind |
|---|---|---|
| **Geist** | Texto de interface (padrão de tudo) | `font-sans` |
| **Geist Mono** / JetBrains Mono | **Todos os números** (valores, quantidades, datas em tabela) | `font-mono` |
| **Instrument Serif** | Display/editorial pontual (opcional) | `font-display` / `font-serif` |

> **✅ Resolvido na Fase 2.** O `:root` em [`index.css`](src/index.css) agora usa
> a stack `'Geist', 'Segoe UI', system-ui…`, então **Geist é a fonte base** do
> app inteiro (Segoe UI fica só como fallback de carregamento). Não declarar
> `font-family` por componente — herdar do `:root`. Para números, usar
> `font-mono` (Geist Mono / JetBrains Mono).

### A regra mais importante: números são mono + tabular

> **Todo valor monetário, quantidade, percentual ou métrica em tabela/KPI usa
> fonte monoespaçada com numerais tabulares.** Isso alinha as colunas e dá o
> aspecto de "planilha executiva".

```tsx
// número-herói (KPI)
<span className="font-mono text-[24px] font-medium leading-none text-fg">…</span>

// em tabela, com tabular-nums
<td className="font-mono tabular-nums text-right">…</td>
```

A classe utilitária `.tnum` (em `.financeiro-bg`) ativa
`font-variant-numeric: tabular-nums`. Texto corrido (rótulos, descrições) **não**
usa mono.

### Escala de tamanho (referência)

| Uso | Tamanho |
|---|---|
| Título de página (`h1`) | `22px` / `font-semibold` / `tracking-[-0.02em]` |
| Número-herói de KPI | `24px` / `font-mono` / `font-medium` |
| Texto de corpo / célula | `13–14px` |
| Rótulo de KPI / coluna | `10.5–11px` / `uppercase` / `tracking-[.14em]` / `text-fg-muted` |
| Legenda / rodapé | `11px` / `text-fg-faint` |

Rótulos em caixa-alta com `tracking` largo são a assinatura do estilo executivo.
Títulos descem o `letter-spacing` (`-0.02em`); rótulos sobem (`.08em`–`.14em`).

---

## 3. Formatação de números (padrão único)

- **Moeda:** `Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })`.
- **Em KPI/célula executiva:** prefixo `R$` em `text-fg-faint`, inteiro grande,
  centavos menores em `text-fg-muted` — ver o componente `AmountCell`
  ([`src/pages/financeiro/components/AmountCell.tsx`](src/pages/financeiro/components/AmountCell.tsx)).
- **Compacto** (eixos de gráfico, legendas): `R$ 12,5k` / `R$ 1,2M`.
- **Percentual:** uma casa decimal, vírgula decimal (`12,5%`).
- **Sinal de variação:** delta com seta e cor (↑ emerald, ↓ coral, → muted).
- Valores negativos/saídas em **coral**; positivos/entradas em **emerald**.

---

## 4. Componentes de referência

Reuse estes. Não recrie variações locais.

**Biblioteca compartilhada (Fase 3):** [`src/components/exec/`](src/components/exec/).
Importe pelo barrel:

```tsx
import { KpiCard, TabelaExecutiva, ReportHeader, StatusPill, AmountCell } from "../components/exec";
```

| Componente | Arquivo | Quando usar |
|---|---|---|
| **KpiCard** | [`exec/KpiCard.tsx`](src/components/exec/KpiCard.tsx) | Faixa de indicadores; `icon` é ReactNode, suporta valores não monetários |
| **TabelaExecutiva** | [`exec/TabelaExecutiva.tsx`](src/components/exec/TabelaExecutiva.tsx) | Tabela genérica (cabeçalho uppercase, hairlines, colunas mono à direita, totais) |
| **AmountCell** | [`exec/AmountCell.tsx`](src/components/exec/AmountCell.tsx) | Toda coluna de R$ em tabela |
| **StatusPill** | [`exec/StatusPill.tsx`](src/components/exec/StatusPill.tsx) | Estados (presets financeiros ou `label`+`tone` livre) |
| **Sparkline** | [`exec/Sparkline.tsx`](src/components/exec/Sparkline.tsx) | Mini-tendência dentro de KPI |
| **ReportHeader** | [`exec/ReportHeader.tsx`](src/components/exec/ReportHeader.tsx) | Topo de relatório: título + período + filtros + ações (+ bloco da empresa opcional) |
| **tones** | [`exec/tones.ts`](src/components/exec/tones.ts) | Helper `tone()` → cor/bg/borda theme-aware por tom semântico |
| **Cabeçalho da empresa** | [`HeaderRelatorio.tsx`](src/HeaderRelatorio.tsx) | Bloco de identificação (logo/CNPJ); tem modo cupom; reusado pelo ReportHeader |

> Os componentes em `src/pages/financeiro/components/` são os originais (ainda em
> uso pela tela Financeiro). A versão de `src/components/exec/` é a generalizada,
> theme-aware, para uso em **qualquer** tela. Em telas novas, use sempre a de `exec/`.

### Anatomia de um Card

```
rounded-card  +  border border-hairline-soft  +  shadow-card
fundo: linear-gradient(180deg, oklch(1 0 0 / .025), transparent), var(--surface)
padding: 12–16px
```

### Anatomia de um KPI (ordem fixa)

1. Linha superior: ícone em "chip" (20×20, fundo+borda do tom) + rótulo
   `uppercase tracking` + (opcional) pill de delta à direita.
2. Número-herói: `R$` faint · inteiro mono grande · `,centavos` menor.
3. (Opcional) sparkline.
4. Rodapé: legenda à esquerda + pill/barra de progresso à direita.

---

## 5. Padrão de Relatório Executivo

Todo relatório segue esta anatomia, **na tela e no PDF**:

1. **Cabeçalho da empresa** — logo, razão/fantasia, CNPJ, contato
   (`HeaderRelatorio`). No PDF, usar o modo apropriado.
2. **Título + período + filtros aplicados** — deixar explícito o recorte
   ("01/05 a 31/05 · Loja Centro"). Período sempre visível.
3. **Faixa de KPIs** — 3 a 5 indicadores-chave do relatório no topo.
4. **Corpo** — tabela executiva e/ou gráfico. Tabelas: cabeçalho em
   `uppercase tracking text-fg-muted`, linhas separadas por hairline, colunas de
   número alinhadas à direita em mono tabular, zebra sutil opcional.
5. **Rodapé** — totais (em destaque mono), data/hora de geração, usuário.

Regras:
- Sem emoji em título de relatório. Ícone monocromático, sim.
- Toda coluna numérica: `text-right` + `font-mono tabular-nums`.
- Totais e subtotais visualmente destacados (peso/cor), nunca só negrito tímido.
- O PDF (jsPDF/autoTable) deve espelhar a mesma hierarquia: cabeçalho da empresa,
  período, colunas alinhadas, totais destacados.

---

## 6. Espaçamento, raio, hairlines e sombra

- **Espaçamento:** escala de 4px (`gap-2` = 8px, `p-4` = 16px…).
- **Raio:** `rounded-card` (14px) para cards; o raio global respeita a
  preferência do usuário (`--radius-md/-lg/-sm`, ver [`theme.ts`](src/lib/theme.ts)).
- **Divisórias:** prefira **hairline** (`border-hairline-soft`) a bordas cheias.
  Borda cheia só para destacar um container ativo/selecionado.
- **Sombra de card** (`--shadow-card`): três camadas — highlight interno no topo,
  anel de 1px (borda), e sombra de profundidade difusa. Não usar `box-shadow`
  ad-hoc; usar o token.

---

## 7. Temas

Estado atual e regras (a evolução de temas está planejada para uma fase
posterior — ver §9):

- **Dark é o padrão.** Fundos escuros **sem preto absoluto** — preferir cinza
  profundo (ex.: `#0f1117` do tema Azul). O tema "Alto Contraste" (`#000`) é a
  **única** exceção, reservada a acessibilidade.
- **Claro:** quando o modo claro neutro for criado, será **off-white** (fundo
  `~#f7f8fa`, cards brancos) com **texto grafite** (`~#1f2430`) — não branco puro,
  não preto puro. (Hoje só existe "Pergaminho", sépia; ele continua como opção.)
- Cores de status (§1) mantêm a **mesma semântica** em claro e escuro; só os
  fundos translúcidos são recalibrados para garantir contraste AA.
- Qualquer componente novo deve funcionar em **todos** os temas — por isso a
  regra de §1 (zero hex hardcoded).

---

## 8. Checklist de entrega

Antes de considerar qualquer tela/relatório/componente "pronto", confirmo:

- [ ] Zero hex hardcoded em `style`/className — só tokens.
- [ ] Todo número é `font-mono` + tabular; colunas numéricas alinhadas à direita.
- [ ] Rótulos de KPI/coluna em `uppercase tracking text-fg-muted`.
- [ ] Cores de status seguem a semântica fixa (§1).
- [ ] Cards usam `rounded-card` + `border-hairline-soft` + `shadow-card`.
- [ ] Sem emoji em títulos de seção/relatório.
- [ ] Relatório tem cabeçalho da empresa + período/filtros visíveis + KPIs + totais.
- [ ] PDF (se houver) espelha a hierarquia da tela.
- [ ] Funciona em tema claro e escuro (testar pelo menos Azul + um claro).
- [ ] Reusa componentes de referência (§4) em vez de recriar.

---

## 9. Roadmap de adoção (estado vivo)

Ordem acordada com o cliente (executar em fases, validando cada uma):

1. ✅ **Fase 1 — Guia de Estilo** _(este documento)_.
2. ✅ **Fase 2 — Fundação técnica** — tokens executivos promovidos ao `:root`
   global (derivados via `color-mix`, theme-aware) + fonte Geist aplicada
   globalmente. Build validado.
3. ✅ **Fase 3 — Componentes compartilhados** — biblioteca executiva em
   [`src/components/exec/`](src/components/exec/) (KpiCard, TabelaExecutiva,
   AmountCell, StatusPill, Sparkline, ReportHeader, tones), theme-aware e
   desacoplada do financeiro. Typecheck/build OK.
4. 🟡 **Fase 4 — Migração de relatórios** — _núcleo concluído_. Em vez de
   reescrever cada relatório, os **primitivos compartilhados** de
   [`Relatorios.tsx`](src/Relatorios.tsx) (`Resumo`, `Tabela`, `BlocoRelatorio`)
   foram elevados ao padrão executivo **mantendo a API** — então os **15
   relatórios** do módulo (14 faixas de KPI + 40 tabelas) herdaram de uma vez:
   tokens executivos, hairlines, sombra, rótulos uppercase e **números mono
   tabular** (colunas à direita). Build OK. _Pendente:_ layouts custom de alguns
   relatórios CRM (gráficos SVG) e telas fora deste módulo (Dashboard etc.).
5. 🟡 **Fase 5 — PDF** — _núcleo concluído_. A cor do cabeçalho das tabelas
   jsPDF foi centralizada numa constante única `COR_HEADER_PDF` (grafite sóbrio)
   e aplicada aos **64 headers** — fim dos cabeçalhos coloridos chapados
   (azul/verde/vermelho/roxo). `criarPDF` já desenha cabeçalho da empresa
   (logo/CNPJ/endereço) + título + período. Build OK. _Pendente:_ alinhar à
   direita + fonte mono as colunas numéricas no PDF (paridade total com a tela).
   **Densidade centralizada:** um wrapper único `tabelaPDF(doc, opts)` em
   [`Relatorios.tsx`](src/Relatorios.tsx) impõe a todos os ~80 blocos de tabela o
   padrão "denso com respiro" — corpo ~1pt menor (piso 7pt), `cellPadding`
   vertical enxuto (0,7mm), header grafite em negrito com padding maior
   (hierarquia por peso, não por tamanho), zebra sutil e hairline horizontal
   entre linhas. Ajuste a densidade uma vez ali e reflete em todos os relatórios.
6. ✅ **Fase 6 — Temas** — novo tema **Claro** (agora **identidade ouro**:
   off-white quente + accent `#B8860B` / purple `#D4AF37`, ver §1) e **Grafite**
   suavizado. Alto Contraste mantido como exceção de acessibilidade. Os temas vêm
   de `TEMAS` em [`theme.ts`](src/lib/theme.ts) e aparecem sozinhos na Aparência.
   **Par de marca ouro (claro + escuro):** além do Claro, há o **Escuro Ouro**
   (`bg #141210` quase-preto quente + ouro vivo `#D4AF37`/`#E8C766`) — contraparte
   escura da identidade; Azul/Esmeralda/Roxo/Grafite seguem como alternativas
   coloridas/neutras.
   **Tinta dos botões primários:** `--accent-ink` é calculado pelo **tom mais
   claro** do gradiente accent→purple (`inkDoAccent` em theme.ts), não pelo
   brilho do tema — isso garante texto legível em botões de accent claro (ouro,
   Grafite quase-branco, Esmeralda) e corrigiu o CTA branco-no-branco do Grafite.
   Botões primários usam `var(--accent-ink)` (não `--white`). Build + typecheck OK.
7. ✅ **Fase 7 — Novos relatórios** — _concluída (4/4)_.
   - ✅ **Curva ABC** — backend `GET /relatorios/curva-abc` (Pareto 80/15/5 por
     receita/lucro/quantidade, multi-tenant) + aba na tela com faixa de
     distribuição A/B/C, % acumulado e badges de classe + export PDF. Manual
     atualizado. Build OK.
   - ✅ **Giro & capital parado** — backend `GET /relatorios/giro-estoque`
     (giro, cobertura em dias, capital parado; classes Parado/Baixo/Saudável/Alto;
     janela default 90d) + aba executiva com badges + export PDF. Manual atualizado.
   - ✅ **Sazonalidade** — backend `GET /relatorios/sazonalidade` (matriz 7×24
     dia×hora em fuso America/Sao_Paulo; pico, melhor dia/hora) + aba com heatmap
     interativo (métrica faturamento/vendas) + export PDF. Manual atualizado.
   - ✅ **Aging de recebíveis** — backend `GET /relatorios/aging-receber`
     (contas em aberto por faixa de idade: a vencer / 1–30 / 31–60 / 61–90 / 90+;
     total vencido, ranking de devedores) + aba com distribuição por idade e
     badges de faixa + export PDF. Manual atualizado.

> **Refinamentos concluídos (pós-fases):**
> - ✅ PDF: colunas numéricas alinhadas à direita + fonte mono (courier) via hook
>   `pdfAlinhaNumeros` em todas as tabelas — paridade total com a tela.
> - ✅ Dashboard: KPIs com número-herói em mono + hairline/shadow-card.
> - ✅ Tema Claro: corrigido o brilho dos cards (tokens `--elev-sheen*` em branco
>   literal) + sombra de card mais suave nos temas claros.
>
> _Follow-up amplo opcional:_ varredura executiva completa do Dashboard (gráficos
> e listas além dos KPIs) e das demais telas operacionais.

> Conforme cada fase é concluída, atualizar este arquivo (tokens reais, novos
> componentes compartilhados, decisões tomadas) para que ele permaneça a fonte
> única de verdade.
