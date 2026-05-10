# Migração — Tela de Aparência

> Arquivo pronto para colar no chat do Claude dentro do VSCode.
> Cole o conteúdo abaixo e o assistente terá tudo que precisa para migrar
> o **modal antigo de Aparência** para a nova **tela completa** com preview ao
> vivo, modo automático, sugestão inteligente, controle de acento, densidade,
> tipografia, raio e acessibilidade.

---

## 🎯 Objetivo da migração

Substituir o modal `Aparência` (4 temas em grade, com botão "Concluir") por
uma **página de configurações** em `/configuracoes/aparencia` que ofereça:

1. **6 temas** com mini-preview de UI dentro do card (não só barras coloridas).
2. **Cor de destaque** independente do tema (override de `--accent`).
3. **Modo automático** (Pôr do sol / Horário customizado / Desligado).
4. **Sugestão contextual** ("você está escrevendo há 3h, tente Esmeralda").
5. **Densidade** (Compacto / Padrão / Confortável).
6. **Escala tipográfica** (slider 13–18px).
7. **Raio dos cantos** (Sutil / Padrão / Generoso).
8. **Acessibilidade**: reduzir movimento, sublinhar links, sincronizar.
9. **Preview ao vivo** lado direito refletindo cada mudança em tempo real.
10. **Auto-save** com indicador `Salvando… → Salvo automaticamente`.

A referência visual e o HTML completo estão em **`Aparencia.html`** na raiz.

---

## 📁 Arquivos esperados após a migração

```
src/
├─ pages/
│  └─ configuracoes/
│     └─ aparencia.tsx                  # nova página
├─ components/
│  └─ aparencia/
│     ├─ ThemeCard.tsx                  # card com mini-preview
│     ├─ ThemeGrid.tsx                  # grade de temas
│     ├─ AccentPicker.tsx               # seleção de cor de destaque
│     ├─ SegmentedControl.tsx           # densidade / raio / modo automático
│     ├─ Toggle.tsx                     # switches de acessibilidade
│     ├─ FontSizeSlider.tsx
│     ├─ AutoModeCard.tsx               # cartão de modo automático + agenda
│     ├─ SuggestionCard.tsx             # cartão de sugestão inteligente
│     └─ PreviewPane.tsx                # mock de UI ao vivo
├─ themes/
│  ├─ index.ts                          # catálogo de temas (THEMES)
│  └─ tokens.css                        # variáveis CSS base
└─ hooks/
   ├─ useAppearance.ts                  # estado + persistência
   └─ useAppearanceSuggestion.ts        # heurística de sugestão
```

Remover (após migração):
- `src/components/Modal/AparenciaModal.tsx`
- Qualquer chamada `<AparenciaModal />` na navbar/menu — substituir por
  `<Link to="/configuracoes/aparencia">Aparência</Link>`.

---

## 🎨 Catálogo de temas (copiar para `src/themes/index.ts`)

```ts
export type ThemeId =
  | 'azul-padrao' | 'esmeralda' | 'roxo'
  | 'alto-contraste' | 'pergaminho' | 'grafite';

export interface Theme {
  id: ThemeId;
  name: string;
  desc: string;
  swatches: string[];     // 4–5 cores para o canto superior do card
  tokens: Record<string, string>;
  miniwin: { bg: string; titlebar: string; dot: string; bar: string; accent: string };
}

export const THEMES: Theme[] = [
  {
    id: 'azul-padrao',
    name: 'Azul Padrão',
    desc: 'Paleta original — azul + roxo sobre dark slate.',
    swatches: ['#6aa9ff','#8b6bff','#0b0d10','#14181d'],
    tokens: {
      '--bg':'#0b0d10','--surface':'#14181d','--surface-2':'#1b2127',
      '--line':'#262d35','--line-strong':'#323a44',
      '--text':'#e7ebf0','--text-dim':'#9aa3ad','--text-faint':'#6b7480',
      '--accent':'#6aa9ff','--accent-2':'#8b6bff','--accent-ink':'#0b0d10',
    },
    miniwin: { bg:'#14181d', titlebar:'#1b2127', dot:'#3a424c',
               bar:'rgba(255,255,255,.1)',
               accent:'linear-gradient(90deg,#6aa9ff,#8b6bff)' },
  },
  {
    id: 'esmeralda',
    name: 'Esmeralda',
    desc: 'Verde + teal — visual mais natural e calmo.',
    swatches: ['#3fcf8e','#34b3a3','#0a1310','#10201b'],
    tokens: {
      '--bg':'#0a1310','--surface':'#10201b','--surface-2':'#152b25',
      '--line':'#1f3b32','--line-strong':'#2a4f43',
      '--text':'#e3efe9','--text-dim':'#8fa89e','--text-faint':'#5d7770',
      '--accent':'#3fcf8e','--accent-2':'#34b3a3','--accent-ink':'#06170f',
    },
    miniwin: { bg:'#10201b', titlebar:'#152b25', dot:'#2a4f43',
               bar:'rgba(63,207,142,.16)',
               accent:'linear-gradient(90deg,#3fcf8e,#34b3a3)' },
  },
  {
    id: 'roxo',
    name: 'Roxo',
    desc: 'Roxo + magenta — vibração mais criativa.',
    swatches: ['#b06bff','#e15ad9','#13091c','#1d1330'],
    tokens: {
      '--bg':'#13091c','--surface':'#1d1330','--surface-2':'#251a3d',
      '--line':'#33264d','--line-strong':'#43345f',
      '--text':'#ece6f7','--text-dim':'#a497b8','--text-faint':'#736687',
      '--accent':'#b06bff','--accent-2':'#e15ad9','--accent-ink':'#0e0517',
    },
    miniwin: { bg:'#1d1330', titlebar:'#251a3d', dot:'#43345f',
               bar:'rgba(176,107,255,.18)',
               accent:'linear-gradient(90deg,#b06bff,#e15ad9)' },
  },
  {
    id: 'alto-contraste',
    name: 'Alto Contraste',
    desc: 'Preto + amarelo — máxima legibilidade (acessibilidade).',
    swatches: ['#ffd60a','#ffffff','#000000','#0c0c0c'],
    tokens: {
      '--bg':'#000000','--surface':'#0c0c0c','--surface-2':'#161616',
      '--line':'#2a2a2a','--line-strong':'#3a3a3a',
      '--text':'#ffffff','--text-dim':'#c9c9c9','--text-faint':'#9a9a9a',
      '--accent':'#ffd60a','--accent-2':'#ffd60a','--accent-ink':'#000000',
    },
    miniwin: { bg:'#0c0c0c', titlebar:'#161616', dot:'#3a3a3a',
               bar:'rgba(255,255,255,.18)',
               accent:'linear-gradient(90deg,#ffd60a,#ffd60a)' },
  },
  {
    id: 'pergaminho',
    name: 'Pergaminho',
    desc: 'Tema claro quente — para leitura prolongada.',
    swatches: ['#c2410c','#9a3412','#fdf8f1','#f4ebdb'],
    tokens: {
      '--bg':'#fdf8f1','--surface':'#f4ebdb','--surface-2':'#ebe0c9',
      '--line':'#e2d4b4','--line-strong':'#cfbe96',
      '--text':'#2a2118','--text-dim':'#6e5e45','--text-faint':'#9c8a6b',
      '--accent':'#c2410c','--accent-2':'#9a3412','--accent-ink':'#fdf8f1',
    },
    miniwin: { bg:'#f4ebdb', titlebar:'#ebe0c9', dot:'#cfbe96',
               bar:'rgba(42,33,24,.12)',
               accent:'linear-gradient(90deg,#c2410c,#9a3412)' },
  },
  {
    id: 'grafite',
    name: 'Grafite',
    desc: 'Neutro absoluto — foco e neutralidade total.',
    swatches: ['#d4d4d4','#a3a3a3','#0a0a0a','#171717'],
    tokens: {
      '--bg':'#0a0a0a','--surface':'#171717','--surface-2':'#1f1f1f',
      '--line':'#2a2a2a','--line-strong':'#3a3a3a',
      '--text':'#fafafa','--text-dim':'#a3a3a3','--text-faint':'#737373',
      '--accent':'#fafafa','--accent-2':'#d4d4d4','--accent-ink':'#0a0a0a',
    },
    miniwin: { bg:'#171717', titlebar:'#1f1f1f', dot:'#3a3a3a',
               bar:'rgba(255,255,255,.1)',
               accent:'linear-gradient(90deg,#fafafa,#d4d4d4)' },
  },
];
```

---

## 🧠 Hook de estado (`useAppearance.ts`)

```ts
import { useEffect, useState } from 'react';
import { THEMES, ThemeId } from '@/themes';

export interface AppearanceState {
  theme: ThemeId;
  accent: string | null;          // override da cor de destaque
  density: 'compacto' | 'padrao' | 'confortavel';
  fontSize: number;               // 13..18
  radius: 6 | 10 | 16;
  reduceMotion: boolean;
  underlineLinks: boolean;
  sync: boolean;
  autoMode: 'off' | 'sunset' | 'custom';
}

const KEY = 'aparencia.v1';
const DEFAULTS: AppearanceState = {
  theme: 'azul-padrao', accent: null, density: 'padrao',
  fontSize: 14, radius: 10,
  reduceMotion: false, underlineLinks: false, sync: true,
  autoMode: 'sunset',
};

export function useAppearance() {
  const [state, setState] = useState<AppearanceState>(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { return DEFAULTS; }
  });

  // Persistência local + (se sync) servidor
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state));
    if (state.sync) {
      fetch('/api/me/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aparencia: state }),
      }).catch(() => {/* offline-tolerant */});
    }
  }, [state]);

  // Aplicação dos tokens no <html>
  useEffect(() => {
    const t = THEMES.find(x => x.id === state.theme);
    if (!t) return;
    const root = document.documentElement;
    Object.entries(t.tokens).forEach(([k,v]) => root.style.setProperty(k, v));
    if (state.accent) {
      root.style.setProperty('--accent', state.accent);
      root.style.setProperty('--accent-2', state.accent);
    }
    root.style.setProperty('--radius-md', state.radius + 'px');
    root.style.setProperty('--radius-lg', state.radius + 4 + 'px');
    root.style.fontSize = state.fontSize + 'px';
    document.body.dataset.density = state.density;
    document.body.dataset.motion = state.reduceMotion ? 'reduced' : 'normal';
    document.body.dataset.underline = state.underlineLinks ? 'true' : 'false';
  }, [state]);

  const set = <K extends keyof AppearanceState>(k: K, v: AppearanceState[K]) =>
    setState(s => ({ ...s, [k]: v }));

  const restore = () => setState(DEFAULTS);

  return { state, set, restore };
}
```

---

## 🔁 Modo automático (claro de dia / escuro à noite)

```ts
// useAutoTheme.ts — chame uma vez no App
import { useEffect } from 'react';
import { useAppearance } from './useAppearance';

export function useAutoTheme() {
  const { state, set } = useAppearance();
  useEffect(() => {
    if (state.autoMode === 'off') return;
    const tick = () => {
      const h = new Date().getHours();
      const isDay = h >= 7 && h < 19;
      const target = isDay ? 'pergaminho' : 'azul-padrao';
      if (state.theme !== target) set('theme', target);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [state.autoMode]);
}
```

---

## 🧩 Heurística da sugestão inteligente

Sinais possíveis (escolha 1–2 para começar; o resto pode vir depois):

| Sinal                                | Sugestão                                  |
|--------------------------------------|--------------------------------------------|
| > 90 min em telas de leitura/escrita | **Esmeralda** ou **Pergaminho**           |
| Horário > 21h e tema claro ativo     | Trocar para **Azul Padrão** ou **Grafite** |
| `prefers-contrast: more` no SO       | **Alto Contraste**                         |
| Brilho ambiente baixo (Ambient API)  | Tema escuro                                |
| Daltonismo declarado no perfil       | **Grafite** (sem dependência de matiz)    |

Esqueleto:

```ts
export function suggestTheme(state, signals) {
  if (signals.prefersMoreContrast) return 'alto-contraste';
  if (signals.minutesReading > 90 && state.theme !== 'esmeralda')
    return { id: 'esmeralda', why: 'Você está há mais de uma hora lendo.' };
  if (signals.hour > 21 && isLightTheme(state.theme))
    return { id: 'azul-padrao', why: 'Já é noite — um tema escuro descansa a vista.' };
  return null;
}
```

---

## 🔌 Endpoint sugerido

```
PUT /api/me/preferences
Body: { aparencia: AppearanceState }

GET /api/me/preferences
Response: { aparencia: AppearanceState }
```

Aceitar `If-Match` (ETag) para evitar conflito entre dispositivos.

---

## ✅ Checklist de migração

- [ ] Criar arquivos da estrutura acima.
- [ ] Mover catálogo de temas para `src/themes/index.ts`.
- [ ] Implementar `useAppearance` com persistência.
- [ ] Substituir `<AparenciaModal />` por rota `/configuracoes/aparencia`.
- [ ] Adicionar item "Aparência" na navegação de Configurações.
- [ ] Migrar tokens CSS antigos (`--primary`, `--bg-dark`, etc.) para os novos
      (`--accent`, `--bg`, `--surface`).
- [ ] Procurar e substituir referências às classes antigas
      (`bg-azul-padrao`, `text-roxo`) por variáveis CSS.
- [ ] Adicionar testes para `useAppearance` (defaults, persistência, restore).
- [ ] Validar acessibilidade: foco visível, navegação por teclado nos cards.
- [ ] Validar contraste em **todos** os 6 temas (WCAG AA).
- [ ] Remover `AparenciaModal` e arquivos órfãos.

---

## 💬 Prompt final para colar no Claude (VSCode)

> Faça a migração descrita em `MIGRATION_APARENCIA.md`.
> Comece criando `src/themes/index.ts` e `src/hooks/useAppearance.ts`.
> Em seguida, gere `src/pages/configuracoes/aparencia.tsx` espelhando o
> layout de `Aparencia.html` (sidebar de configurações + controles à
> esquerda + preview ao vivo à direita). Use os componentes da pasta
> `components/aparencia/`. Substitua `AparenciaModal` por uma rota e
> remova-o. Não invente novas cores: use exatamente os tokens listados.
> Ao final, abra um PR com checklist marcado.
